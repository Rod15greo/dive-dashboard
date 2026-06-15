import * as path from 'path';
import * as fs from 'fs';
import { loadJson, saveJson } from './utils';

// ── GCS-backed persistent store ───────────────────────────────────────────────
// In Cloud Run the local filesystem is ephemeral; we back it up to GCS so the
// "already processed" state survives redeploys.

const GCS_BUCKET = process.env.GCS_BUCKET_NAME ?? '';
const LOCAL_STORE  = path.resolve(__dirname, '../storage/processed_meetings.json');
const LOCAL_BOT    = path.resolve(__dirname, '../storage/bot_added_meetings.json');

let storeCache: Store | null = null;
let botCache:   Record<string, string> | null = null;

async function gcsRead(filename: string): Promise<string | null> {
  if (!GCS_BUCKET) return null;
  try {
    const { Storage } = await import('@google-cloud/storage');
    const [content] = await new Storage().bucket(GCS_BUCKET).file(filename).download();
    return content.toString('utf-8');
  } catch {
    return null;
  }
}

async function gcsWrite(filename: string, data: unknown): Promise<void> {
  if (!GCS_BUCKET) return;
  try {
    const { Storage } = await import('@google-cloud/storage');
    await new Storage().bucket(GCS_BUCKET).file(filename).save(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`⚠ GCS write failed (${filename}):`, (e as Error).message);
  }
}

// Called once at server startup — loads GCS → warms cache
export async function initStore(): Promise<void> {
  fs.mkdirSync(path.resolve(__dirname, '../storage'), { recursive: true });

  const raw = await gcsRead('processed_meetings.json');
  if (raw) {
    try { storeCache = JSON.parse(raw); } catch { storeCache = {}; }
    // sync to local as well
    fs.writeFileSync(LOCAL_STORE, raw);
    console.log(`   💾 Store carregado do GCS (${Object.keys(storeCache!).length} entradas)`);
  } else {
    try { storeCache = loadJson<Store>(LOCAL_STORE); } catch { storeCache = {}; }
  }

  const rawBot = await gcsRead('bot_added_meetings.json');
  if (rawBot) {
    try { botCache = JSON.parse(rawBot); } catch { botCache = {}; }
  } else {
    try { botCache = loadJson<Record<string, string>>(LOCAL_BOT); } catch { botCache = {}; }
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProcessedEntry {
  processed_at: string;
  title: string;
  notion_page_id: string | null;
  google_doc_id: string | null;
  deleted_from_fireflies: boolean;
  error?: string;
}

export type Store = Record<string, ProcessedEntry>;

// ── Store API (sync surface, async GCS writes fire-and-forget) ────────────────

export function loadStore(): Store {
  if (!storeCache) {
    try { storeCache = loadJson<Store>(LOCAL_STORE); } catch { storeCache = {}; }
  }
  return storeCache!;
}

export function saveStore(store: Store): void {
  storeCache = store;
  saveJson(LOCAL_STORE, store);
  gcsWrite('processed_meetings.json', store);  // async, fire-and-forget
}

export function isProcessed(transcriptId: string): boolean {
  return !!loadStore()[transcriptId];
}

export function markProcessed(transcriptId: string, entry: ProcessedEntry): void {
  const store = loadStore();
  store[transcriptId] = entry;
  saveStore(store);
}

// ── Bot scheduler deduplication ───────────────────────────────────────────────

function loadBotStore(): Record<string, string> {
  if (!botCache) {
    try { botCache = loadJson<Record<string, string>>(LOCAL_BOT); } catch { botCache = {}; }
  }
  return botCache!;
}

function saveBotStore(data: Record<string, string>): void {
  botCache = data;
  saveJson(LOCAL_BOT, data);
  gcsWrite('bot_added_meetings.json', data);
}

export function isBotAlreadyAdded(meetLink: string): boolean {
  const store = loadBotStore();
  const addedAt = store[meetLink];
  if (!addedAt) return false;
  return Date.now() - new Date(addedAt).getTime() < 4 * 60 * 60 * 1000;
}

export function markBotAdded(meetLink: string): void {
  const store = loadBotStore();
  store[meetLink] = new Date().toISOString();
  saveBotStore(store);
}
