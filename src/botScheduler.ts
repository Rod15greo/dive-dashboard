import 'dotenv/config';
import { google } from 'googleapis';
import { validateEnv, sleep } from './utils';
import { isBotAlreadyAdded, markBotAdded } from './store';
import { getGoogleAuth } from './googleAuth';

const FIREFLIES_URL = 'https://api.fireflies.ai/graphql';
const LOOK_BACK_MINUTES = 30; // catch meetings that started up to 30 min ago
const LOOK_AHEAD_MINUTES = 1; // só adiciona bot quando reunião já começou (ou está prestes a começar)

async function addBotToMeeting(meetLink: string, title: string, duration = 45): Promise<boolean> {
  const res = await fetch(FIREFLIES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.FIREFLIES_API_KEY}`,
    },
    body: JSON.stringify({
      query: `mutation AddBot($link: String!, $title: String, $duration: Int) {
        addToLiveMeeting(meeting_link: $link, title: $title, duration: $duration) { success }
      }`,
      variables: { link: meetLink, title, duration },
    }),
  });

  const json = (await res.json()) as { data?: { addToLiveMeeting?: { success: boolean } }; errors?: unknown[] };
  if (json.errors?.length) {
    console.error(`  ❌ Fireflies error: ${JSON.stringify(json.errors)}`);
    return false;
  }
  return json.data?.addToLiveMeeting?.success ?? false;
}

export async function runBotScheduler(): Promise<void> {
  validateEnv(['FIREFLIES_API_KEY', 'GOOGLE_CALENDAR_ID']);

  const auth = await getGoogleAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const windowStart = new Date(now.getTime() - LOOK_BACK_MINUTES * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + LOOK_AHEAD_MINUTES * 60 * 1000);

  console.log(`\n🤖 Bot Scheduler — verificando reuniões entre ${windowStart.toISOString()} e ${windowEnd.toISOString()}`);

  const res = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? 'primary',
    timeMin: windowStart.toISOString(),
    timeMax: windowEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items ?? [];
  if (events.length === 0) {
    console.log('   Nenhuma reunião no intervalo.');
    return;
  }

  for (const event of events) {
    const title = event.summary ?? 'Reunião sem título';
    const meetLink = event.hangoutLink ?? event.location ?? '';
    const desc = event.description ?? '';

    if (!desc.includes('SMART_FACTORY_AUTOMATION_ID=')) {
      console.log(`   ⏭  ${title} — não é reunião Smart Factory, ignorando`);
      continue;
    }

    if (!meetLink.startsWith('https://meet.google.com')) {
      console.log(`   ⏭  ${title} — sem Google Meet link, ignorando`);
      continue;
    }

    const attendees = event.attendees ?? [];
    if (attendees.some(a => a.email === 'fred@fireflies.ai')) {
      console.log(`   ⏭  ${title} — fred@fireflies.ai já está no convite, ignorando`);
      continue;
    }

    if (isBotAlreadyAdded(meetLink)) {
      console.log(`   ⏭  ${title} — bot já adicionado, ignorando`);
      continue;
    }

    console.log(`   📅 ${title} → ${meetLink}`);
    const ok = await addBotToMeeting(meetLink, title, 45);
    console.log(`   ${ok ? '✅ Bot adicionado' : '❌ Falhou'}`);
    if (ok) markBotAdded(meetLink);
    await sleep(500);
  }

  console.log('\nDone.');
}

if (require.main === module) {
  runBotScheduler().catch(e => {
    console.error('❌', e.message);
    process.exit(1);
  });
}
