import * as fs from 'fs';
import * as path from 'path';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function validateEnv(required: string[]): void {
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('\n❌ Variáveis de ambiente obrigatórias ausentes:');
    missing.forEach(k => console.error(`   - ${k}`));
    console.error('\nCopie .env.example para .env e preencha os valores.\n');
    process.exit(1);
  }
}

export function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf-8')) as T;
}

export function saveJson(filePath: string, data: unknown): void {
  fs.writeFileSync(path.resolve(filePath), JSON.stringify(data, null, 2), 'utf-8');
}

export function dayCodeToName(day: string): string {
  const map: Record<string, string> = {
    MO: 'Segunda-feira', TU: 'Terça-feira', WE: 'Quarta-feira',
    TH: 'Quinta-feira',  FR: 'Sexta-feira', SA: 'Sábado', SU: 'Domingo',
  };
  return map[day] ?? day;
}

export function nextWeekdayDate(dayCode: string): Date {
  const dayMap: Record<string, number> = {
    SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
  };
  const target = dayMap[dayCode];
  const now = new Date();
  const diff = (target - now.getDay() + 7) % 7;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d;
}

export function buildDateTime(date: Date, timeStr: string, tz: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  // Constrói a string ISO diretamente no timezone alvo, sem depender do local do sistema
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const timeStrFull = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  const offset = tzOffsetFormatted(tz);
  return `${dateStr}T${timeStrFull}${offset}`;
}

function tzOffsetFormatted(tz: string): string {
  try {
    // Pega o offset em minutos usando Intl
    const now = new Date();
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const diffMin = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
    const sign = diffMin >= 0 ? '+' : '-';
    const abs = Math.abs(diffMin);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `${sign}${hh}:${mm}`;
  } catch {
    return '-03:00';
  }
}

export function isoDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Sprint helpers (shared between Notion and Drive) ──────────────────────────

function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface SprintInfo {
  sprint: number;
  week: number;
  weekLabel: string;
  sprintTitle: string;
}

export function getSprintInfo(dateStr: string): SprintInfo {
  const sprintStart   = parseLocalDate(process.env.SPRINT_START_DATE ?? '2026-04-20');
  const durationWeeks = parseInt(process.env.SPRINT_DURATION_WEEKS ?? '2', 10);
  const date          = parseLocalDate(dateStr);
  const diffDays      = Math.floor((date.getTime() - sprintStart.getTime()) / (1000 * 60 * 60 * 24));
  const diffWeeks     = Math.floor(diffDays / 7);
  const sprint        = Math.floor(diffWeeks / durationWeeks) + 1;
  const weekInSprint  = (diffWeeks % durationWeeks) + 1;

  const weekStartDate = new Date(sprintStart);
  weekStartDate.setDate(sprintStart.getDate() + diffWeeks * 7);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 5);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  return {
    sprint,
    week: weekInSprint,
    weekLabel: `Semana ${weekInSprint} — ${fmt(weekStartDate)} a ${fmt(weekEndDate)}`,
    sprintTitle: `Sprint ${sprint}`,
  };
}
