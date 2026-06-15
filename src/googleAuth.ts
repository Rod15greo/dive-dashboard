import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthClient = any;

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/calendar',
];

let _auth: AuthClient | null = null;

export async function gcsDownload(filename: string): Promise<string | null> {
  const bucket = process.env.GCS_BUCKET_NAME;
  if (!bucket) return null;
  try {
    const { Storage } = await import('@google-cloud/storage');
    const [content] = await new Storage().bucket(bucket).file(filename).download();
    return content.toString('utf-8');
  } catch {
    return null;
  }
}

export async function gcsSave(filename: string, data: string): Promise<void> {
  const bucket = process.env.GCS_BUCKET_NAME;
  if (!bucket) return;
  try {
    const { Storage } = await import('@google-cloud/storage');
    await new Storage().bucket(bucket).file(filename).save(data);
  } catch (e) {
    console.error(`⚠ GCS save failed (${filename}):`, (e as Error).message);
  }
}

async function readJsonFile(localPath: string, gcsFile: string): Promise<object> {
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  }
  console.log(`   📥 ${path.basename(localPath)} não encontrado localmente, baixando do GCS...`);
  const raw = await gcsDownload(gcsFile);
  if (!raw) throw new Error(`Arquivo ${gcsFile} não encontrado no GCS nem localmente`);
  try { fs.writeFileSync(localPath, raw); } catch {}
  return JSON.parse(raw);
}

// ADC só é usado no Cloud Run (K_SERVICE é injetado automaticamente pelo runtime).
// Localmente cai direto no OAuth2 para ter os escopos corretos de Drive/Docs/Calendar.
async function tryADC(): Promise<AuthClient | null> {
  if (!process.env.K_SERVICE) return null;
  try {
    const auth = new GoogleAuth({ scopes: SCOPES });
    const client = await auth.getClient();
    await auth.getProjectId();
    console.log('   🔑 Autenticação via ADC (Cloud Run service account)');
    return client;
  } catch {
    return null;
  }
}

// Tenta service account via arquivo JSON local ou GCS
async function tryServiceAccountFile(): Promise<AuthClient | null> {
  const localPath = path.resolve('./service-account.json');
  let raw: string | null = null;

  if (fs.existsSync(localPath)) {
    raw = fs.readFileSync(localPath, 'utf-8');
    console.log('   🔑 Service Account carregado do arquivo local');
  } else {
    raw = await gcsDownload('google_service_account.json');
    if (raw) {
      console.log('   🔑 Service Account carregado do GCS');
      try { fs.writeFileSync(localPath, raw); } catch {}
    }
  }

  if (!raw) return null;

  const auth = new GoogleAuth({ credentials: JSON.parse(raw), scopes: SCOPES });
  return auth.getClient();
}

// Fallback OAuth2 para desenvolvimento local
async function tryOAuth2(): Promise<AuthClient> {
  console.log('   ⚠ Usando OAuth2 (desenvolvimento local)');
  const credsPath = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH ?? './credentials.json');
  const tokenPath = path.resolve(process.env.GOOGLE_TOKEN_PATH ?? './token.json');

  const creds = await readJsonFile(credsPath, 'google_credentials.json') as Record<string, unknown>;
  const { client_id, client_secret, redirect_uris } = (creds.installed ?? creds.web) as {
    client_id: string; client_secret: string; redirect_uris: string[];
  };
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const gcsTokenRaw = await gcsDownload('google_token.json');
  const token = gcsTokenRaw
    ? JSON.parse(gcsTokenRaw)
    : await readJsonFile(tokenPath, 'google_token.json');

  if (gcsTokenRaw) console.log('   🔑 Token OAuth carregado do GCS');
  auth.setCredentials(token);

  auth.on('tokens', (newTokens: object) => {
    const merged = { ...token, ...newTokens };
    try { fs.writeFileSync(tokenPath, JSON.stringify(merged)); } catch {}
    if (process.env.GCS_BUCKET_NAME) {
      gcsSave('google_token.json', JSON.stringify(merged));
      console.log('   🔑 Token OAuth renovado e salvo em GCS + local');
    } else {
      console.log('   🔑 Token OAuth renovado e salvo localmente');
    }
  });

  return auth;
}

// Singleton — ordem de preferência:
// 1. ADC (Cloud Run) — nunca expira, zero configuração
// 2. service-account.json local ou no GCS
// 3. OAuth2 (fallback para desenvolvimento local)
export async function getGoogleAuth(): Promise<AuthClient> {
  if (_auth) return _auth;
  _auth = (await tryADC())
       ?? (await tryServiceAccountFile())
       ?? (await tryOAuth2());
  return _auth;
}
