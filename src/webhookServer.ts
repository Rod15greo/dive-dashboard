import 'dotenv/config';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import cron from 'node-cron';
import { validateEnv, isoDateStr, sleep } from './utils';
import { getTranscript, deleteTranscript } from './firefliesClient';
import { isProcessed, markProcessed, initStore, loadStore, saveStore } from './store';
import { generateMinutes } from './llmClient';
import type { MeetingOutput } from './meetingPrompt';
import { createAtaDoc, createTranscriptDoc } from './googleDocsClient';
import { createAtaPage } from './notionClient';
import { getGoogleAuth } from './googleAuth';
import { runBotScheduler } from './botScheduler';
import { sessionMiddleware, requireAuth } from './authMiddleware';
import { createDashboardRouter, startDashboardAutoRefresh, triggerDashboardRefreshAfterMeeting } from './dashboardApi';

validateEnv(['FIREFLIES_API_KEY', 'NOTION_TOKEN', 'OPENAI_API_KEY',
             'GOOGLE_CREDENTIALS_PATH', 'GOOGLE_TOKEN_PATH']);

fs.mkdirSync(path.resolve(__dirname, '../storage'), { recursive: true });

const app  = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);
app.set('trust proxy', 1); // necessário para cookies secure atrás de Nginx/proxy reverso
// Guarda o corpo bruto para validar a assinatura HMAC do webhook sobre os bytes originais
app.use(express.json({
  verify: (req, _res, buf) => { (req as unknown as { rawBody?: Buffer }).rawBody = buf; },
}));
app.use(sessionMiddleware());

// Dashboard API (auth routes + protected API + SSE)
app.use(createDashboardRouter());

// Serve React frontend (built output)
const WEB_DIST = path.resolve(__dirname, '../web/dist');
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  // SPA fallback — serve index.html for all non-API routes
  app.get(/^(?!\/api|\/auth|\/webhooks|\/run|\/health)/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'smartfactory-meeting-automation' });
});

app.post('/run/bot-scheduler', requireAuth, (_req, res) => {
  res.json({ status: 'ok', note: 'bot_scheduler_started' });
  runBotScheduler().catch(e => console.error('❌ bot-scheduler:', e.message));
});

app.post('/run/weekly-cleanup', requireAuth, (_req, res) => {
  res.json({ status: 'ok', note: 'weekly_cleanup_started' });
  runWeeklyCleanup().catch(e => console.error('❌ weekly-cleanup:', e.message));
});

async function runWeeklyCleanup() {
  console.log('\n🧹 Weekly cleanup — deletando transcrições processadas do Fireflies...');
  const store = loadStore();
  let deleted = 0;
  let skipped = 0;

  for (const [transcriptId, entry] of Object.entries(store)) {
    if (entry.deleted_from_fireflies) { skipped++; continue; }
    console.log(`   🗑  Deletando: ${entry.title} (${transcriptId})`);
    const ok = await deleteTranscript(transcriptId);
    if (ok) {
      entry.deleted_from_fireflies = true;
      deleted++;
      const rawPath = `${__dirname}/../storage/${transcriptId}.json`;
      if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
    }
    await sleep(2000);
  }

  saveStore(store);
  console.log(`✅ Weekly cleanup concluído: ${deleted} deletadas, ${skipped} já deletadas antes.`);
}

app.post('/webhooks/fireflies', async (req, res) => {
  try {
    // HMAC signature validation
    const webhookSecret = process.env.FIREFLIES_WEBHOOK_SECRET;
    if (!webhookSecret && process.env.NODE_ENV === 'production') {
      // Sem secret qualquer um poderia disparar processamento (custo de LLM, docs no Drive)
      console.error('❌ Webhook rejeitado: FIREFLIES_WEBHOOK_SECRET não definido em produção');
      res.status(503).json({ error: 'webhook secret not configured' });
      return;
    }
    if (webhookSecret) {
      const rawSig = (req.headers['x-hub-signature'] ?? req.headers['x-fireflies-signature']) as string | undefined;
      if (!rawSig) {
        res.status(401).json({ error: 'missing signature' });
        return;
      }
      const sig = rawSig.replace(/^sha256=/i, '');
      const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
      const expected = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody ?? JSON.stringify(req.body))
        .digest('hex');
      try {
        if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
          res.status(401).json({ error: 'invalid signature' });
          return;
        }
      } catch {
        res.status(401).json({ error: 'invalid signature' });
        return;
      }
    }

    console.log('📨 Webhook recebido:', JSON.stringify(req.body));
    const body = req.body as Record<string, unknown>;
    const id = (body.transcriptId ?? body.meetingId ?? body.meeting_id ?? body.transcript_id) as string | undefined;

    if (!id) {
      console.error('❌ Payload sem ID:', JSON.stringify(body));
      res.status(400).json({ error: 'transcriptId ou meetingId obrigatório' });
      return;
    }

    if (isProcessed(id)) {
      console.log(`⚠  Transcript ${id} já processado/em andamento. Ignorando.`);
      res.json({ status: 'ok', note: 'duplicate_ignored' });
      return;
    }

    // Marca como "em andamento" antes de qualquer await — evita race condition
    // quando Fireflies dispara dois eventos para o mesmo transcript_id
    markProcessed(id, {
      processed_at: new Date().toISOString(),
      title: '(em andamento)',
      notion_page_id: null,
      google_doc_id: null,
      deleted_from_fireflies: false,
    });

    res.json({ status: 'ok', note: 'processing_started' });

    processTranscript(id).catch(e =>
      console.error(`❌ Erro processando ${id}:`, e.message)
    );
  } catch (e) {
    console.error('❌ Erro no webhook:', (e as Error).message);
    res.status(500).json({ error: 'internal_error' });
  }
});

async function processTranscript(transcriptId: string) {
  console.log(`\n🎙  Processando transcript: ${transcriptId}`);

  const transcript = await getTranscript(transcriptId);

  // Limpa título quando vem de upload de arquivo
  transcript.title = (transcript.title ?? '')
    .replace(/\s*[-–]\s*\d{4}[_-]\d{2}[_-]\d{2}.*$/i, '')
    .replace(/\.(mp4|mov|avi|mkv|webm|m4a|mp3|wav)$/i, '')
    .replace(/\s*[-–]\s*Recording\s*$/i, '')
    .trim() || 'Reunião sem título';

  console.log(`   Título: ${transcript.title}`);
  console.log(`   Data:   ${transcript.dateString}`);

  // Reuniões externas que entram no Fireflies por engano — ignorar
  const EXCLUDED_TITLES = ['x-sofia', 'synapse', 'entrevista'];
  if (EXCLUDED_TITLES.some(kw => transcript.title.toLowerCase().includes(kw))) {
    console.log(`   ⏭  Reunião externa ignorada (não pertence à Dive): ${transcript.title}`);
    markProcessed(transcriptId, {
      processed_at: new Date().toISOString(),
      title: transcript.title,
      notion_page_id: null,
      google_doc_id: null,
      deleted_from_fireflies: false,
      error: 'ignorada: reunião externa',
    });
    return;
  }

  const isCoordination = transcript.title?.toLowerCase().includes('coordena');
  if (isCoordination) console.log(`   🔒 Reunião de coordenação — ata será privada`);

  // Backup local
  const rawPath = path.resolve(__dirname, `../storage/${transcriptId}.json`);
  fs.writeFileSync(rawPath, JSON.stringify(transcript, null, 2));
  console.log(`   💾 Transcrição raw salva em backup`);

  let minutes: MeetingOutput;
  try {
    minutes = await generateMinutes(transcript);
    console.log('   ✅ Ata gerada pelo LLM');
  } catch (e) {
    const errMsg = (e as Error).message;
    console.error('   ❌ LLM falhou ao gerar ata:', errMsg);
    markProcessed(transcriptId, {
      processed_at: new Date().toISOString(),
      title: transcript.title,
      notion_page_id: null,
      google_doc_id: null,
      deleted_from_fireflies: false,
      error: `LLM falhou: ${errMsg}`,
    });
    return;
  }

  const dateStr = isoDateStr(new Date(transcript.dateString));

  let transcriptDocId: string | null = null;
  let googleDocId: string | null = null;
  let notionPageId: string | null = null;

  // Doc 2: Transcrição bruta
  try {
    transcriptDocId = await createTranscriptDoc(
      transcript.title, dateStr, transcript, isCoordination
    );
  } catch (e) {
    console.error('❌ Erro ao criar doc de transcrição:', (e as Error).message);
  }

  await sleep(500);

  // Doc 1: Ata formatada (com link para o doc de transcrição)
  try {
    googleDocId = await createAtaDoc(
      transcript.title, dateStr, minutes, transcriptDocId, transcript.transcript_url, isCoordination
    );
  } catch (e) {
    console.error('❌ Erro ao criar Google Docs da ata:', (e as Error).message);
  }

  await sleep(500);

  // Notion: versão simplificada com links para os dois docs
  try {
    notionPageId = await createAtaPage(
      transcript.title, dateStr, minutes,
      googleDocId ?? 'sem-google-doc',
      isCoordination,
      transcriptDocId
    );
    console.log(`   ✅ Notion page criada: ${notionPageId}`);
  } catch (e) {
    console.error('❌ Erro ao criar página Notion:', (e as Error).message);
  }

  if (!notionPageId) {
    console.warn(`⚠  Notion não criado — transcrição mantida no Fireflies (ID: ${transcriptId})`);
  }

  markProcessed(transcriptId, {
    processed_at: new Date().toISOString(),
    title: transcript.title,
    notion_page_id: notionPageId,
    google_doc_id: googleDocId,
    deleted_from_fireflies: false,
  });

  console.log(`   ✅ Processamento concluído — ${transcript.title}`);
  triggerDashboardRefreshAfterMeeting();
}

// Retry processing a transcript that previously failed (e.g. LLM error)
app.post('/webhooks/transcripts/:id/retry', requireAuth, (req, res) => {
  const { id } = req.params;
  const store = loadStore();
  const entry = store[id];
  if (!entry) {
    res.status(404).json({ error: 'Transcript não encontrado' });
    return;
  }
  if (!entry.error) {
    res.status(409).json({ error: 'Transcript não está em estado de falha', entry });
    return;
  }
  // Clear failed state so isProcessed() returns false and re-processing can start
  delete store[id];
  saveStore(store);
  res.json({ status: 'ok', note: 'retry_started', transcriptId: id });
  processTranscript(id).catch(e =>
    console.error(`❌ Erro no retry de ${id}:`, e.message)
  );
});

async function startNgrok(port: number): Promise<string> {
  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (!authtoken) throw new Error('NGROK_AUTHTOKEN não definido no .env');

  // Dynamic import so the server starts even if @ngrok/ngrok is not installed
  const ngrok = await import('@ngrok/ngrok');
  const domain = process.env.NGROK_DOMAIN;
  const listener = await ngrok.forward({
    addr: port,
    authtoken,
    ...(domain ? { domain } : {}),
  });

  return listener.url() ?? '';
}

initStore().then(async () => {
  // Warn about team members with no Discord ID configured
  const { TEAM } = await import('./dashboard/teamConfig');
  const missingDiscord = TEAM.filter(m => !m.discordIds || m.discordIds.length === 0);
  if (missingDiscord.length > 0) {
    console.warn(`⚠ Membros sem Discord ID (Discord sempre 0): ${missingDiscord.map(m => m.name).join(', ')}`);
  }

  if (!process.env.FIREFLIES_WEBHOOK_SECRET) {
    console.warn(process.env.NODE_ENV === 'production'
      ? '⚠ FIREFLIES_WEBHOOK_SECRET não definido — /webhooks/fireflies vai rejeitar todas as chamadas (produção)'
      : '⚠ FIREFLIES_WEBHOOK_SECRET não definido — /webhooks/fireflies aceita chamadas sem assinatura (apenas dev)');
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 smartfactory-meeting-automation rodando na porta ${PORT}`);
    console.log(`   GET  http://localhost:${PORT}/health`);
    console.log(`   POST http://localhost:${PORT}/webhooks/fireflies`);
  });

  // Bot scheduler automático — verifica reuniões em andamento a cada 10 minutos
  cron.schedule('*/10 * * * *', () => {
    runBotScheduler().catch(e => console.error('❌ bot-scheduler cron:', e.message));
  });
  console.log('   🤖 Bot scheduler ativo — verificando reuniões a cada 10 min');

  startDashboardAutoRefresh();
  console.log('   📊 Dashboard: http://localhost:' + PORT);

  if (process.env.PUBLIC_URL) {
    // Static public URL (Cloudflare Tunnel, reverse proxy, etc.)
    process.env.PUBLIC_WEBHOOK_URL = process.env.PUBLIC_URL;
    console.log(`   🌐 URL pública: ${process.env.PUBLIC_URL}/webhooks/fireflies`);
  } else if (process.env.NGROK_AUTHTOKEN) {
    // Fallback: dynamic ngrok tunnel (dev only)
    try {
      const publicUrl = await startNgrok(PORT);
      process.env.PUBLIC_WEBHOOK_URL = publicUrl;
      console.log(`   🌐 Ngrok ativo: ${publicUrl}/webhooks/fireflies`);
    } catch (e) {
      console.error('⚠  Ngrok não iniciado:', (e as Error).message);
    }
  } else {
    console.warn('⚠  Sem URL pública configurada. Defina PUBLIC_URL no .env para acesso externo.');
  }

}).catch(e => console.error('❌ initStore falhou:', e.message));
