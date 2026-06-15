import 'dotenv/config';
import { findByDiscordId, TEAM } from './teamConfig';

const DISCORD_API = 'https://discord.com/api/v10';
const TOKEN  = process.env.DISCORD_BOT_TOKEN!;
const SERVER = process.env.DISCORD_SERVER_ID!;
const PROJECT_START = new Date('2026-04-01T00:00:00Z');

const headers = { Authorization: `Bot ${TOKEN}` };

interface Channel { id: string; name: string; type: number }
interface Message { id: string; author: { id: string; username: string; global_name?: string }; timestamp: string }

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error(`Timeout após ${timeoutMs / 1000}s: ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function apiGet(path: string, retries = 3): Promise<unknown> {
  const res = await fetchWithTimeout(`${DISCORD_API}${path}`, { headers });
  if (res.status === 429) {
    if (retries <= 0) throw new Error(`Discord rate limit esgotado: ${path}`);
    const retry = res.headers.get('retry-after') ?? '2';
    await new Promise(r => setTimeout(r, parseFloat(retry) * 1000 + 500));
    return apiGet(path, retries - 1);
  }
  if (!res.ok) throw new Error(`Discord API ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchAllMessages(channelId: string, channelName: string): Promise<Message[]> {
  const all: Message[] = [];
  let before: string | null = null;

  while (true) {
    const url = `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ''}`;
    const batch = await apiGet(url) as Message[];
    if (!batch.length) break;

    const filtered = batch.filter(m => new Date(m.timestamp) >= PROJECT_START);
    all.push(...filtered);

    // se o último item já é mais antigo que o início do projeto, para
    if (new Date(batch[batch.length - 1].timestamp) < PROJECT_START) break;
    if (batch.length < 100) break;

    before = batch[batch.length - 1].id;
    await new Promise(r => setTimeout(r, 300)); // evita rate limit
  }

  if (all.length > 0) console.log(`      #${channelName}: ${all.length} mensagens`);
  return all;
}

export interface DiscordStats {
  totalMessages: number;
  byChannel: Record<string, number>;
}

export interface DiscordData {
  byMember: Record<string, DiscordStats>;
  unknownUsers: Array<{ id: string; username: string; globalName: string; total: number }>;
  channelNames: Record<string, string>;
}

export async function collectDiscord(): Promise<DiscordData> {
  console.log('   💬 Discord: listando canais...');

  const channels = await apiGet(`/guilds/${SERVER}/channels`) as Channel[];
  // tipo 0 = text channel
  const textChannels = channels.filter(c => c.type === 0);
  console.log(`   💬 Discord: ${textChannels.length} canais de texto encontrados`);

  const channelNames: Record<string, string> = {};
  const rawStats = new Map<string, { username: string; globalName: string; byChannel: Record<string, number> }>();

  for (const ch of textChannels) {
    channelNames[ch.id] = ch.name;
    try {
      const messages = await fetchAllMessages(ch.id, ch.name);
      for (const msg of messages) {
        const userId = msg.author.id;
        if (!rawStats.has(userId)) {
          rawStats.set(userId, {
            username: msg.author.username,
            globalName: msg.author.global_name ?? msg.author.username,
            byChannel: {},
          });
        }
        const s = rawStats.get(userId)!;
        s.byChannel[ch.name] = (s.byChannel[ch.name] ?? 0) + 1;
      }
    } catch (e) {
      console.warn(`      ⚠ Não foi possível ler #${ch.name}: ${(e as Error).message}`);
    }
  }

  const byMember: Record<string, DiscordStats> = {};
  const unknownUsers: DiscordData['unknownUsers'] = [];

  for (const [userId, stats] of rawStats) {
    const total = Object.values(stats.byChannel).reduce((a, b) => a + b, 0);
    const member = findByDiscordId(userId);

    if (member) {
      if (!byMember[member.id]) byMember[member.id] = { totalMessages: 0, byChannel: {} };
      byMember[member.id].totalMessages += total;
      for (const [ch, n] of Object.entries(stats.byChannel)) {
        byMember[member.id].byChannel[ch] = (byMember[member.id].byChannel[ch] ?? 0) + n;
      }
    } else {
      unknownUsers.push({ id: userId, username: stats.username, globalName: stats.globalName, total });
    }
  }

  // garante entrada zero para todos os membros
  for (const m of TEAM) {
    if (!byMember[m.id]) byMember[m.id] = { totalMessages: 0, byChannel: {} };
  }

  // ordena unknownUsers por total (mais ativos primeiro)
  unknownUsers.sort((a, b) => b.total - a.total);

  return { byMember, unknownUsers, channelNames };
}
