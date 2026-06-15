import session from 'express-session';
import * as fs from 'fs';
import * as path from 'path';

export function createSQLiteStore(Store: typeof session.Store): session.Store {
  const dbPath = process.env.SESSION_DB_PATH
    ?? path.resolve(__dirname, '../storage/sessions.db');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // Lazy-load better-sqlite3 so the server can still start if the package is missing
  let db: import('better-sqlite3').Database;
  try {
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    db = new Database(dbPath);
  } catch {
    console.warn('⚠ better-sqlite3 não encontrado — usando MemoryStore (sessões não persistem entre restarts)');
    console.warn('  Instale com: npm install better-sqlite3');
    return new session.MemoryStore();
  }

  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    sid  TEXT    PRIMARY KEY,
    data TEXT    NOT NULL,
    exp  INTEGER NOT NULL
  )`);

  // Purge expired sessions once per hour
  setInterval(() => {
    try { db.prepare('DELETE FROM sessions WHERE exp < ?').run(Date.now()); } catch {}
  }, 3_600_000);

  class SQLiteStore extends Store {
    get(sid: string, cb: (err: any, session?: session.SessionData | null) => void): void {
      try {
        const row = db.prepare('SELECT data, exp FROM sessions WHERE sid = ?').get(sid) as
          { data: string; exp: number } | undefined;
        if (!row || row.exp < Date.now()) return cb(null, null);
        cb(null, JSON.parse(row.data));
      } catch (e) { cb(e); }
    }

    set(sid: string, sessionData: session.SessionData, cb: (err?: any) => void): void {
      try {
        const exp = sessionData.cookie?.expires
          ? new Date(sessionData.cookie.expires).getTime()
          : Date.now() + 7 * 24 * 3_600_000;
        db.prepare('INSERT OR REPLACE INTO sessions (sid, data, exp) VALUES (?, ?, ?)')
          .run(sid, JSON.stringify(sessionData), exp);
        cb();
      } catch (e) { cb(e); }
    }

    destroy(sid: string, cb: (err?: any) => void): void {
      try {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        cb();
      } catch (e) { cb(e); }
    }
  }

  return new SQLiteStore();
}
