import 'dotenv/config';
import { google } from 'googleapis';
import type { MeetingOutput, FirefliesTranscript } from './meetingPrompt';
import { getFolderForDate, moveFileToDrive } from './driveClient';
import { validateEnv } from './utils';
import { getGoogleAuth } from './googleAuth';
import { getCoordinatorEmails } from './memberConfig';

// E-mails com acesso de escrita às atas de coordenação. Defina COORD_SHARE_EMAILS
// (separados por vírgula) no .env; se ausente, usa os membros com "coordinator": true
// em data/members.json.
function getCoordShareEmails(): string[] {
  const fromEnv = (process.env.COORD_SHARE_EMAILS ?? '')
    .split(',').map(e => e.trim()).filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : [...getCoordinatorEmails()];
}

async function createDoc(
  drive: ReturnType<typeof google.drive>,
  docs: ReturnType<typeof google.docs>,
  title: string,
  content: string,
  folderId: string,
  isPrivate: boolean
): Promise<string> {
  const created = await drive.files.create({
    requestBody: { name: title, mimeType: 'application/vnd.google-apps.document' },
    fields: 'id',
  });
  const docId = created.data.id!;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [{ insertText: { location: { index: 1 }, text: content } }],
    },
  });

  await moveFileToDrive(docId, folderId);

  if (isPrivate) {
    // Remove qualquer permissão herdada de "anyone" ou "domain" que a pasta possa ter
    const existingPerms = await drive.permissions.list({ fileId: docId, fields: 'permissions(id,type)' }).catch(() => ({ data: { permissions: [] } }));
    for (const perm of existingPerms.data.permissions ?? []) {
      if (perm.type === 'anyone' || perm.type === 'domain') {
        await drive.permissions.delete({ fileId: docId, permissionId: perm.id! }).catch(() => {});
      }
    }

    for (const email of getCoordShareEmails()) {
      await drive.permissions.create({
        fileId: docId,
        requestBody: { role: 'writer', type: 'user', emailAddress: email },
        sendNotificationEmail: false,
      }).catch(() => {});
    }
    console.log(`🔒 Permissões restritas aos coordenadores`);
  }

  return docId;
}

export async function createAtaDoc(
  meetingTitle: string,
  dateStr: string,
  minutes: MeetingOutput,
  transcriptDocId: string | null,
  firefliesUrl?: string,
  isPrivate = false
): Promise<string> {
  const auth = await getGoogleAuth();
  const docs  = google.docs({ version: 'v1', auth });
  const drive = google.drive({ version: 'v3', auth });

  const docTitle   = `${dateStr} - Ata - ${meetingTitle}`;
  const atasFolderId = await getFolderForDate(dateStr, isPrivate);

  const pontos = minutes.principais_pontos
    .map(p => `• ${p.tema}\n  Discussão: ${p.discussao}\n  Encaminhamento: ${p.conclusao}`)
    .join('\n\n');

  const decisoes = minutes.decisoes_tomadas
    .map(d => `• ${d.decisao}${d.responsavel ? ` [${d.responsavel}]` : ''}\n  Contexto: ${d.contexto}`)
    .join('\n\n');

  const atencao = minutes.pontos_de_atencao
    .map(p => `• ${p.ponto} [levantado por: ${p.levantado_por}]\n  Impacto: ${p.impacto}`)
    .join('\n\n');

  const acoes = [
    'Ação | Responsável | Prazo | Contexto',
    ...minutes.proximas_acoes.map(a => `${a.acao} | ${a.responsavel} | ${a.prazo} | ${a.contexto}`),
  ].join('\n');

  const pendencias = minutes.pendencias_em_aberto.map(p => `• ${p}`).join('\n');
  const pauta      = minutes.pauta_proxima_reuniao.map(p => `• ${p}`).join('\n');
  const transcriptLink = transcriptDocId
    ? `https://docs.google.com/document/d/${transcriptDocId}`
    : null;

  const content = [
    `ATA DE REUNIÃO — ${meetingTitle}\n`,
    `Data: ${minutes.data || dateStr}\n`,
    `Tipo: ${minutes.tipo_reuniao || 'não identificado'}\n`,
    `Participantes: ${(minutes.participantes ?? []).join(', ')}\n\n`,

    `RESUMO EXECUTIVO\n${minutes.resumo_executivo}\n\n`,

    `CONTEXTO E OBJETIVO\n${minutes.contexto_e_objetivo}\n\n`,

    `PRINCIPAIS PONTOS DISCUTIDOS\n${pontos}\n\n`,

    `DECISÕES TOMADAS\n${decisoes || '(nenhuma decisão formal registrada)'}\n\n`,

    minutes.pontos_de_atencao.length
      ? `PONTOS DE ATENÇÃO\n${atencao}\n\n`
      : '',

    `PRÓXIMAS AÇÕES\n${acoes}\n\n`,

    pendencias ? `PENDÊNCIAS EM ABERTO\n${pendencias}\n\n` : '',

    pauta ? `PAUTA SUGERIDA — PRÓXIMA REUNIÃO\n${pauta}\n\n` : '',

    minutes.observacoes ? `OBSERVAÇÕES\n${minutes.observacoes}\n\n` : '',

    firefliesUrl ? `Transcrição original (Fireflies): ${firefliesUrl}\n` : '',
    transcriptLink ? `Transcrição bruta (Google Docs): ${transcriptLink}\n` : '',
    `\nProcessada automaticamente via Fireflies + LLM.\n`,
  ].join('');

  const docId = await createDoc(drive, docs, docTitle, content, atasFolderId, isPrivate);
  console.log(`✅ Ata criada: https://docs.google.com/document/d/${docId}`);
  return docId;
}

export async function createTranscriptDoc(
  meetingTitle: string,
  dateStr: string,
  transcript: FirefliesTranscript,
  isPrivate = false
): Promise<string> {
  const auth = await getGoogleAuth();
  const docs  = google.docs({ version: 'v1', auth });
  const drive = google.drive({ version: 'v3', auth });

  const docTitle     = `${dateStr} - Transcrição - ${meetingTitle}`;
  const atasFolderId = await getFolderForDate(dateStr, isPrivate);

  const speakerMap: Record<string, string> = {};
  for (const sp of transcript.speakers ?? []) {
    speakerMap[sp.id] = sp.name;
  }

  const lines = (transcript.sentences ?? []).map(s => {
    const name = speakerMap[s.speaker_name] ?? s.speaker_name;
    const ts   = s.start_time != null
      ? `[${Math.floor(s.start_time / 60)}:${String(s.start_time % 60).padStart(2, '0')}] `
      : '';
    return `${ts}[${name}]: ${s.text}`;
  });

  const content = [
    `TRANSCRIÇÃO — ${meetingTitle}\n`,
    `Data: ${dateStr}\n`,
    `Duração: ${transcript.duration} minutos\n`,
    `Participantes declarados: ${(transcript.participants ?? []).join(', ')}\n`,
    `\n${'='.repeat(60)}\n\n`,
    lines.join('\n'),
  ].join('');

  const docId = await createDoc(drive, docs, docTitle, content, atasFolderId, isPrivate);
  console.log(`✅ Transcrição criada: https://docs.google.com/document/d/${docId}`);
  return docId;
}

if (process.argv.includes('--test')) {
  validateEnv(['GOOGLE_CREDENTIALS_PATH', 'GOOGLE_TOKEN_PATH']);
  console.log('✅ googleDocsClient carregado. Credenciais Google encontradas.');
}
