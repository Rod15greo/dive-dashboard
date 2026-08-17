/**
 * Backup completo do servidor Discord da Dive.
 *
 * Salva em  discord-backup-YYYY-MM-DDTHH-mm-ss/
 *   messages/   → um JSON por canal/thread com todas as mensagens
 *   attachments/ → imagens e arquivos baixados
 *   backup.json → índice geral
 *   index.html  → visualizador HTML navegável offline
 *
 * Uso:  ts-node src/backupDiscord.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ── Config ─────────────────────────────────────────────────────────────────
const DISCORD_API = 'https://discord.com/api/v10';
const TOKEN  = process.env.DISCORD_BOT_TOKEN;
const SERVER = process.env.DISCORD_SERVER_ID;

if (!TOKEN || !SERVER) {
  console.error('❌ Faltam DISCORD_BOT_TOKEN ou DISCORD_SERVER_ID no .env');
  process.exit(1);
}

const BOT_HEADERS = { Authorization: `Bot ${TOKEN}` };

const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
const BACKUP_ROOT  = path.resolve(`discord-backup-${ts}`);
const MSG_DIR      = path.join(BACKUP_ROOT, 'messages');
const ATTACH_DIR   = path.join(BACKUP_ROOT, 'attachments');

// ── Discord types ───────────────────────────────────────────────────────────
interface Channel {
  id: string;
  name: string;
  type: number;
  parent_id?: string;
  position?: number;
  topic?: string;
}

interface Attachment {
  id: string;
  url: string;
  proxy_url?: string;
  filename: string;
  content_type?: string;
  size: number;
  width?: number;
  height?: number;
}

interface Embed {
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  image?: { url: string; width?: number; height?: number };
  thumbnail?: { url: string };
  video?: { url?: string };
  footer?: { text: string };
  author?: { name: string; url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

interface Reaction {
  count: number;
  emoji: { id: string | null; name: string };
}

interface Message {
  id: string;
  content: string;
  author: { id: string; username: string; global_name?: string; bot?: boolean };
  timestamp: string;
  edited_timestamp?: string | null;
  attachments: Attachment[];
  embeds: Embed[];
  reactions?: Reaction[];
  message_reference?: { message_id?: string; channel_id?: string };
  type: number;
  pinned: boolean;
}

interface Thread extends Channel {
  message_count?: number;
  member_count?: number;
  thread_metadata?: { archived: boolean; archive_timestamp: string };
}

// ── HTTP helpers ────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function apiGet(endpoint: string, retries = 5): Promise<unknown> {
  const url = `${DISCORD_API}${endpoint}`;
  const res = await fetch(url, { headers: BOT_HEADERS });

  if (res.status === 429) {
    if (retries <= 0) throw new Error(`Rate limit esgotado: ${endpoint}`);
    const retryAfter = parseFloat(res.headers.get('retry-after') ?? '2');
    console.log(`      ⏳ Rate limit — aguardando ${retryAfter.toFixed(1)}s...`);
    await sleep(retryAfter * 1000 + 500);
    return apiGet(endpoint, retries - 1);
  }

  if (res.status === 403) {
    console.warn(`      ⚠ Sem permissão: ${endpoint}`);
    return null;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`      ⚠ ${res.status} em ${endpoint}: ${body.slice(0, 120)}`);
    return null;
  }

  return res.json();
}

// Download de arquivo para disco com retry
function downloadFile(url: string, dest: string): Promise<boolean> {
  return new Promise(resolve => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const file = fs.createWriteStream(dest);

    const req = client.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.destroy();
        fs.unlinkSync(dest);
        downloadFile(res.headers.location!, dest).then(resolve);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        file.destroy();
        fs.unlinkSync(dest);
        resolve(false);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
      file.on('error', () => { file.destroy(); resolve(false); });
    });

    req.on('error', () => resolve(false));
    req.setTimeout(30000, () => { req.destroy(); resolve(false); });
  });
}

// ── Fetching ────────────────────────────────────────────────────────────────
async function fetchAllMessages(channelId: string): Promise<Message[]> {
  const all: Message[] = [];
  let before: string | undefined;

  while (true) {
    const qs = `limit=100${before ? `&before=${before}` : ''}`;
    const batch = await apiGet(`/channels/${channelId}/messages?${qs}`) as Message[] | null;
    if (!batch || !batch.length) break;

    all.push(...batch);
    if (batch.length < 100) break;

    before = batch[batch.length - 1].id;
    await sleep(350); // respeita rate limit
  }

  // ordena cronológico (mais antigo primeiro)
  return all.sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchThreads(channelId: string): Promise<Thread[]> {
  const threads: Thread[] = [];

  // threads arquivados públicos (paginados)
  let before: string | undefined;
  while (true) {
    const qs = before ? `?before=${before}&limit=100` : '?limit=100';
    const res = await apiGet(`/channels/${channelId}/threads/archived/public${qs}`) as
      { threads?: Thread[]; has_more?: boolean; } | null;
    if (!res || !res.threads?.length) break;
    threads.push(...res.threads);
    if (!res.has_more) break;
    before = res.threads[res.threads.length - 1].id;
    await sleep(300);
  }

  return threads;
}

// ── Download de attachments ─────────────────────────────────────────────────
async function downloadAttachments(
  messages: Message[],
  channelSlug: string
): Promise<Map<string, string>> { // attachment.id → local filename
  const dir = path.join(ATTACH_DIR, channelSlug);
  const map = new Map<string, string>();

  const toDownload: Array<{ url: string; id: string; filename: string }> = [];
  for (const msg of messages) {
    for (const att of msg.attachments) {
      toDownload.push({ url: att.url, id: att.id, filename: att.filename });
    }
    // imagens em embeds
    for (const emb of msg.embeds) {
      if (emb.image?.url) {
        const fakeId = `embed-${msg.id}-img`;
        try {
          const u = new URL(emb.image.url);
          const ext = u.pathname.split('.').pop()?.split('?')[0] ?? 'jpg';
          toDownload.push({ url: emb.image.url, id: fakeId, filename: `embed-${msg.id}.${ext}` });
        } catch {}
      }
    }
  }

  if (!toDownload.length) return map;

  fs.mkdirSync(dir, { recursive: true });
  console.log(`      ⬇ ${toDownload.length} arquivo(s) para baixar...`);

  for (const item of toDownload) {
    const safeName = item.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dest = path.join(dir, `${item.id}_${safeName}`);
    if (fs.existsSync(dest)) { map.set(item.id, dest); continue; }

    const ok = await downloadFile(item.url, dest);
    if (ok) {
      map.set(item.id, dest);
    } else {
      console.warn(`      ⚠ Falha ao baixar: ${item.filename}`);
    }
    await sleep(100);
  }

  return map;
}

// ── HTML viewer ─────────────────────────────────────────────────────────────
function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

function renderMessages(msgs: Message[], attachMap: Map<string, string>, channelDir: string): string {
  const IMAGE_TYPES = /\.(png|jpg|jpeg|gif|webp|svg)$/i;
  let html = '';

  for (const msg of msgs) {
    if (msg.type !== 0 && msg.type !== 19) continue; // só mensagens normais e replies

    const dt = new Date(msg.timestamp).toLocaleString('pt-BR');
    const author = escHtml(msg.author.global_name ?? msg.author.username);
    const content = msg.content ? `<p class="content">${escHtml(msg.content)}</p>` : '';

    // attachments
    const attHtml = msg.attachments.map(att => {
      const localPath = attachMap.get(att.id);
      const relPath = localPath ? path.relative(BACKUP_ROOT, localPath).replace(/\\/g, '/') : null;
      const src = relPath ?? att.url;
      if (att.content_type?.startsWith('image/') || IMAGE_TYPES.test(att.filename)) {
        return `<img src="${escHtml(src)}" alt="${escHtml(att.filename)}" class="img-attach" loading="lazy">`;
      }
      return `<a href="${escHtml(src)}" class="file-link">📎 ${escHtml(att.filename)}</a>`;
    }).join('\n');

    // embed images
    const embedHtml = msg.embeds.flatMap(emb => {
      const parts: string[] = [];
      if (emb.url) parts.push(`<a href="${escHtml(emb.url)}" class="link-embed">🔗 ${escHtml(emb.title ?? emb.url)}</a>`);
      const fakeId = `embed-${msg.id}-img`;
      const localImg = attachMap.get(fakeId);
      if (localImg) {
        const relPath = path.relative(BACKUP_ROOT, localImg).replace(/\\/g, '/');
        parts.push(`<img src="${escHtml(relPath)}" class="img-attach" loading="lazy">`);
      } else if (emb.image?.url && !localImg) {
        parts.push(`<a href="${escHtml(emb.image.url)}" class="link-embed">🖼 Imagem do embed</a>`);
      }
      return parts;
    }).join('\n');

    const replyHtml = msg.message_reference?.message_id
      ? `<div class="reply-ref">↩ respondendo a #${msg.message_reference.message_id}</div>`
      : '';

    html += `
<div class="msg" id="msg-${msg.id}">
  <span class="author">${author}</span>
  <span class="ts">${dt}</span>
  ${replyHtml}
  ${content}
  ${attHtml}
  ${embedHtml}
</div>`;
  }

  return html;
}

function buildHtml(
  categories: Array<{ name: string; channels: Array<{ slug: string; name: string; msgCount: number }> }>
): string {
  const navItems = categories.map(cat => {
    const children = cat.channels.map(ch =>
      `<a href="messages/${escHtml(ch.slug)}.html" class="ch-link"># ${escHtml(ch.name)} <span class="cnt">${ch.msgCount}</span></a>`
    ).join('\n');
    return `<div class="cat"><div class="cat-name">${escHtml(cat.name)}</div>${children}</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Backup Discord — Dive</title>
<style>
  body { font-family: system-ui, sans-serif; background: #313338; color: #dbdee1; margin: 0; display: flex; height: 100vh; }
  #sidebar { width: 220px; background: #2b2d31; padding: 16px 0; overflow-y: auto; flex-shrink: 0; }
  #sidebar h1 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #b5bac1; padding: 0 12px 12px; border-bottom: 1px solid #3f4147; margin: 0 0 8px; }
  .cat-name { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #949ba4; padding: 8px 12px 4px; }
  .ch-link { display: flex; justify-content: space-between; padding: 3px 12px; color: #949ba4; text-decoration: none; font-size: 14px; border-radius: 3px; margin: 1px 4px; }
  .ch-link:hover { background: #404249; color: #dbdee1; }
  .cnt { color: #5865f2; font-size: 11px; background: #3f4147; border-radius: 8px; padding: 0 6px; }
  #main { flex: 1; padding: 24px 32px; overflow-y: auto; }
  #main h2 { font-size: 20px; margin: 0 0 20px; color: #f2f3f5; }
  #main p { color: #b5bac1; line-height: 1.6; }
</style>
</head>
<body>
<div id="sidebar">
  <h1>🏠 Dive Discord</h1>
  ${navItems}
</div>
<div id="main">
  <h2>Backup do servidor Dive</h2>
  <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
  <p>Clique em um canal na barra lateral para ver as mensagens.</p>
</div>
</body>
</html>`;
}

function buildChannelHtml(channelName: string, categoryName: string, messages: Message[], attachMap: Map<string, string>): string {
  const body = renderMessages(messages, attachMap, '');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>#${escHtml(channelName)} — Dive Backup</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #313338; color: #dbdee1; margin: 0; padding: 0; }
  header { background: #2b2d31; padding: 12px 24px; border-bottom: 1px solid #1e1f22; position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; }
  header .cat { font-size: 12px; color: #949ba4; }
  header h1 { font-size: 16px; font-weight: 600; margin: 0; }
  .back { color: #5865f2; text-decoration: none; font-size: 13px; }
  .back:hover { text-decoration: underline; }
  main { padding: 16px 24px 60px; max-width: 900px; }
  .msg { display: flex; flex-direction: column; padding: 6px 0; border-bottom: 1px solid #3f4147; margin-bottom: 4px; }
  .msg:last-child { border-bottom: none; }
  .author { font-weight: 600; color: #c9cdfb; font-size: 14px; }
  .ts { font-size: 11px; color: #949ba4; margin-bottom: 4px; }
  .content { font-size: 15px; line-height: 1.55; margin: 2px 0 6px; word-break: break-word; white-space: pre-wrap; }
  .reply-ref { font-size: 12px; color: #949ba4; margin-bottom: 3px; font-style: italic; }
  .img-attach { max-width: 420px; max-height: 320px; border-radius: 4px; margin: 4px 0; display: block; cursor: pointer; }
  .img-attach:hover { opacity: .9; }
  .file-link, .link-embed { display: inline-block; color: #5865f2; text-decoration: none; font-size: 13px; margin: 3px 0; }
  .file-link:hover, .link-embed:hover { text-decoration: underline; }
  .count { font-size: 12px; color: #949ba4; margin-bottom: 16px; }
</style>
</head>
<body>
<header>
  <a class="back" href="../index.html">← índice</a>
  <span class="cat">${escHtml(categoryName)} /</span>
  <h1># ${escHtml(channelName)}</h1>
</header>
<main>
  <p class="count">${messages.length} mensagens</p>
  ${body || '<p style="color:#949ba4">Nenhuma mensagem encontrada (o bot pode não ter permissão de leitura neste canal).</p>'}
</main>
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🗄  Iniciando backup do servidor Discord...`);
  console.log(`   Servidor: ${SERVER}`);
  console.log(`   Destino:  ${BACKUP_ROOT}\n`);

  fs.mkdirSync(MSG_DIR, { recursive: true });
  fs.mkdirSync(ATTACH_DIR, { recursive: true });

  // 1. buscar todos os canais
  const allChannels = await apiGet(`/guilds/${SERVER}/channels`) as Channel[] | null;
  if (!allChannels) { console.error('❌ Não foi possível listar canais.'); process.exit(1); }

  // 2. buscar threads ativas do servidor inteiro
  const activeThreadsRes = await apiGet(`/guilds/${SERVER}/threads/active`) as
    { threads?: Thread[] } | null;
  const activeThreads: Thread[] = activeThreadsRes?.threads ?? [];

  // categorias para organização
  const categories = new Map<string, string>(); // id → name
  allChannels.filter(c => c.type === 4).forEach(c => categories.set(c.id, c.name));

  const textChannels = allChannels.filter(c =>
    c.type === 0 || c.type === 5 || c.type === 15 || c.type === 16
  ).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  console.log(`   Canais de texto encontrados: ${textChannels.length}`);
  console.log(`   Threads ativas: ${activeThreads.length}\n`);

  // estrutura para o índice
  const indexData: {
    generatedAt: string;
    serverId: string;
    channels: Array<{
      id: string; name: string; category: string;
      slug: string; messageCount: number; threadCount: number;
    }>;
  } = { generatedAt: new Date().toISOString(), serverId: SERVER!, channels: [] };

  const navCategories: Array<{ name: string; channels: Array<{ slug: string; name: string; msgCount: number }> }> = [];
  const catMap = new Map<string, typeof navCategories[0]>();

  // 3. processar cada canal
  for (const ch of textChannels) {
    const catName = ch.parent_id ? (categories.get(ch.parent_id) ?? 'Sem categoria') : 'Sem categoria';
    const slug = `${ch.name.replace(/[^a-z0-9-]/gi, '_').toLowerCase()}`;

    console.log(`📢 #${ch.name} [${catName}]`);

    // buscar mensagens
    const messages = await fetchAllMessages(ch.id);
    console.log(`   ✉ ${messages.length} mensagens`);

    // buscar threads arquivadas deste canal (só para text/announcement)
    const archivedThreads = (ch.type === 0 || ch.type === 5)
      ? await fetchThreads(ch.id)
      : [];

    // threads ativas que pertencem a este canal
    const chActiveThreads = activeThreads.filter(t => t.parent_id === ch.id);
    const allThreads = [...chActiveThreads, ...archivedThreads];

    if (allThreads.length) console.log(`   🧵 ${allThreads.length} thread(s)`);

    // baixar attachments do canal
    const attachMap = await downloadAttachments(messages, slug);

    // salvar JSON do canal
    fs.writeFileSync(
      path.join(MSG_DIR, `${slug}.json`),
      JSON.stringify({ channel: ch, categoryName: catName, messages }, null, 2)
    );

    // processar cada thread
    const threadSummaries: Array<{ name: string; messageCount: number }> = [];

    for (const thread of allThreads) {
      const threadSlug = `${slug}__thread__${thread.name.replace(/[^a-z0-9-]/gi, '_').toLowerCase()}`;
      console.log(`   🧵 Thread: ${thread.name}`);

      const tMsgs = await fetchAllMessages(thread.id);
      const tAttachMap = await downloadAttachments(tMsgs, threadSlug);

      fs.writeFileSync(
        path.join(MSG_DIR, `${threadSlug}.json`),
        JSON.stringify({ channel: thread, categoryName: catName, parentChannel: ch.name, messages: tMsgs }, null, 2)
      );

      // HTML da thread
      fs.writeFileSync(
        path.join(MSG_DIR, `${threadSlug}.html`),
        buildChannelHtml(`${ch.name} › ${thread.name}`, catName, tMsgs, tAttachMap)
      );

      threadSummaries.push({ name: thread.name, messageCount: tMsgs.length });
      await sleep(200);
    }

    // HTML do canal
    fs.writeFileSync(
      path.join(MSG_DIR, `${slug}.html`),
      buildChannelHtml(ch.name, catName, messages, attachMap)
    );

    // adicionar ao índice
    indexData.channels.push({
      id: ch.id, name: ch.name, category: catName,
      slug, messageCount: messages.length, threadCount: allThreads.length,
    });

    if (!catMap.has(catName)) {
      const entry = { name: catName, channels: [] as Array<{ slug: string; name: string; msgCount: number }> };
      catMap.set(catName, entry);
      navCategories.push(entry);
    }
    catMap.get(catName)!.channels.push({ slug, name: ch.name, msgCount: messages.length });

    await sleep(300);
  }

  // 4. salvar índice JSON
  fs.writeFileSync(path.join(BACKUP_ROOT, 'backup.json'), JSON.stringify(indexData, null, 2));

  // 5. HTML principal (index)
  fs.writeFileSync(path.join(BACKUP_ROOT, 'index.html'), buildHtml(navCategories));

  // 6. resumo
  const totalMsgs = indexData.channels.reduce((s, c) => s + c.messageCount, 0);
  const totalChannels = indexData.channels.length;
  let attachCount = 0;
  function countFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) countFiles(path.join(dir, f.name));
      else attachCount++;
    }
  }
  countFiles(ATTACH_DIR);

  console.log(`\n✅ Backup concluído!`);
  console.log(`   Canais:     ${totalChannels}`);
  console.log(`   Mensagens:  ${totalMsgs}`);
  console.log(`   Arquivos:   ${attachCount}`);
  console.log(`   Pasta:      ${BACKUP_ROOT}`);
  console.log(`   Visualizar: ${path.join(BACKUP_ROOT, 'index.html')}\n`);
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
