import 'dotenv/config';
import { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { google } from 'googleapis';
import { createSQLiteStore } from './sqliteSessionStore';
import { getCoordinatorEmails } from './memberConfig';

export interface SessionUser {
  email: string;
  name: string;
  picture: string;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
    returnTo?: string;
    authError?: string;
  }
}

// PUBLIC_URL também vale: o webhookServer só copia PUBLIC_URL para PUBLIC_WEBHOOK_URL
// depois que este módulo já foi carregado, então sem este fallback o redirect ia para localhost.
const PUBLIC_BASE_URL = process.env.PUBLIC_WEBHOOK_URL || process.env.PUBLIC_URL || '';
const REDIRECT_URI = PUBLIC_BASE_URL
  ? `${PUBLIC_BASE_URL}/auth/callback`
  : `http://localhost:${process.env.PORT ?? '3000'}/auth/callback`;

export function createOAuthClient() {
  const client_id     = process.env.DASHBOARD_OAUTH_CLIENT_ID!;
  const client_secret = process.env.DASHBOARD_OAUTH_CLIENT_SECRET!;
  if (!client_id || !client_secret)
    throw new Error('DASHBOARD_OAUTH_CLIENT_ID / DASHBOARD_OAUTH_CLIENT_SECRET não definidos no .env');
  return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
}

export function getAuthUrl(): string {
  const oauth2 = createOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: 'online',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    prompt: 'select_account',
  });
}

export async function exchangeCode(code: string): Promise<{ user: SessionUser; authorized: boolean }> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();

  const email = data.email ?? '';
  const coordinators = getCoordinatorEmails();

  return {
    user: {
      email,
      name: data.name ?? email,
      picture: data.picture ?? '',
    },
    authorized: coordinators.has(email.toLowerCase()),
  };
}

export function sessionMiddleware() {
  if (!process.env.SESSION_SECRET) {
    console.warn('⚠ SESSION_SECRET não definido — usando valor padrão público (inseguro). Defina no .env.');
  }
  return session({
    secret: process.env.SESSION_SECRET ?? 'smartfactory-dash-secret-change-me',
    resave: false,
    saveUninitialized: false,
    store: createSQLiteStore(session.Store),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.user) { next(); return; }
  res.status(401).json({ error: 'Não autenticado' });
}
