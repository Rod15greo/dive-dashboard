import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { collectDashboardData, DashboardData } from './dashboard/collectData';
import { requireAuth, getAuthUrl, exchangeCode } from './authMiddleware';

const CACHE_FILE = path.resolve(__dirname, '../storage/dashboard-cache.json');

let cache: DashboardData | null = null;
let refreshing = false;
let refreshError: string | null = null;

// Load cache from disk on startup so the first request is instant
try {
  if (fs.existsSync(CACHE_FILE)) {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) as DashboardData;
    console.log('✅ Dashboard cache carregado do disco');
  }
} catch {
  console.warn('⚠ Cache em disco corrompido, ignorando');
}

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const sseClients = new Set<Response>();

function pushSSE(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch {}
  }
}

export async function refreshDashboard(quiet = false): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  refreshError = null;
  if (!quiet) pushSSE('refresh-start', { ts: new Date().toISOString() });
  try {
    const data = await collectDashboardData();
    cache = data;
    // Persist to disk so next server restart skips the 30s cold start
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    } catch (e) {
      console.warn('⚠ Falha ao persistir cache em disco:', (e as Error).message);
    }
    pushSSE('dashboard-update', data);
    console.log(`✅ Dashboard: ${data.members.length} membros atualizados`);
  } catch (e) {
    refreshError = (e as Error).message;
    console.error('❌ Dashboard refresh:', refreshError);
    pushSSE('refresh-error', { error: refreshError });
  } finally {
    refreshing = false;
  }
}

export function startDashboardAutoRefresh(): void {
  // First refresh after 30s (give server time to settle)
  setTimeout(() => refreshDashboard(true), 30_000);
  setInterval(() => refreshDashboard(true), REFRESH_INTERVAL_MS);
}

export function createDashboardRouter(): Router {
  const router = Router();

  // ── Auth routes ──────────────────────────────────────────────────────────────

  router.get('/auth/google', (_req, res) => {
    res.redirect(getAuthUrl());
  });

  router.get('/auth/callback', async (req, res) => {
    const code = req.query.code as string | undefined;
    if (!code) { res.redirect('/?error=no_code'); return; }

    try {
      const { user, authorized } = await exchangeCode(code);
      if (!authorized) {
        req.session.authError = `Acesso negado para ${user.email}. Apenas coordenadores têm acesso.`;
        res.redirect('/?error=unauthorized');
        return;
      }
      req.session.user = user;
      res.redirect('/');
    } catch (e) {
      console.error('❌ Auth callback:', (e as Error).message);
      res.redirect('/?error=auth_failed');
    }
  });

  router.post('/auth/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.get('/auth/error', (req, res) => {
    const error = req.session.authError ?? null;
    if (error) delete req.session.authError;
    res.json({ error });
  });

  // ── API routes (protected) ───────────────────────────────────────────────────

  router.get('/api/me', requireAuth, (req, res) => {
    res.json(req.session.user);
  });

  router.get('/api/dashboard', requireAuth, (_req, res) => {
    if (!cache) {
      res.json({ loading: true, refreshing });
      return;
    }
    res.json(cache);
  });

  router.post('/api/dashboard/refresh', requireAuth, (req, res) => {
    if (refreshing) { res.json({ status: 'already_refreshing' }); return; }
    res.json({ status: 'started' });
    refreshDashboard();
  });

  router.get('/api/events', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    sseClients.add(res);

    if (cache) {
      res.write(`event: dashboard-update\ndata: ${JSON.stringify(cache)}\n\n`);
    } else {
      res.write(`event: refresh-start\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
    }

    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n'); } catch {}
    }, 25_000);

    req.on('close', () => {
      sseClients.delete(res);
      clearInterval(heartbeat);
    });
  });

  return router;
}

// Trigger a dashboard refresh when a meeting is processed by the webhook
export function triggerDashboardRefreshAfterMeeting(): void {
  setTimeout(() => refreshDashboard(true), 5_000);
}
