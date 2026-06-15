import 'dotenv/config';
import * as fs from 'fs';
import { google } from 'googleapis';
import { getGoogleAuth } from '../googleAuth';
import { findByEmail, TEAM } from './teamConfig';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'primary';
const PROJECT_START = '2026-04-01T00:00:00-03:00';
const PROJECT_END   = new Date().toISOString();
const BOT_EMAIL     = 'fred@fireflies.ai';

export interface CalendarMeetingAttendance {
  byMember: Record<string, { invited: number; meetingTitles: string[] }>;
}

function getCalendarAuth() {
  const saPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  if (saPath && fs.existsSync(saPath)) {
    const sa = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
    return new google.auth.GoogleAuth({
      credentials: sa,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
  }
  // fallback: OAuth user token (token.json)
  return getGoogleAuth();
}

export async function collectCalendar(): Promise<CalendarMeetingAttendance> {
  console.log('   📅 Calendar: buscando eventos do projeto...');

  let auth: Awaited<ReturnType<typeof getCalendarAuth>>;
  try {
    auth = await getCalendarAuth();
  } catch (e) {
    throw new Error(
      `Google Calendar auth failed — renew token.json or configure GOOGLE_SERVICE_ACCOUNT_PATH. Reason: ${(e as Error).message}`
    );
  }

  const calendar = google.calendar({ version: 'v3', auth: auth as any });

  let pageToken: string | undefined;
  const byMember: Record<string, { invited: number; meetingTitles: string[] }> = {};

  for (const m of TEAM) {
    byMember[m.id] = { invited: 0, meetingTitles: [] };
  }

  do {
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: PROJECT_START,
      timeMax: PROJECT_END,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      ...(pageToken ? { pageToken } : {}),
    });

    pageToken = res.data.nextPageToken ?? undefined;
    const events = res.data.items ?? [];

    for (const event of events) {
      const desc = event.description ?? '';
      if (!desc.includes('SMART_FACTORY_AUTOMATION_ID=')) continue;

      const title = event.summary ?? 'Sem título';
      const attendees = event.attendees ?? [];

      for (const attendee of attendees) {
        const email = attendee.email ?? '';
        if (!email || email === BOT_EMAIL) continue;
        const member = findByEmail(email);
        if (!member) continue;

        byMember[member.id].invited++;
        byMember[member.id].meetingTitles.push(title);
      }
    }
  } while (pageToken);

  const total = Object.values(byMember).reduce((s, v) => s + v.invited, 0);
  console.log(`   📅 Calendar: ${total} convites mapeados para a equipe`);

  return { byMember };
}
