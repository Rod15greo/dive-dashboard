import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { findByFirefliesName, TEAM } from './teamConfig';

const STORAGE_DIR   = path.resolve(__dirname, '../../storage');
const SKIP_FILES    = new Set(['processed_meetings.json', 'bot_added_meetings.json', 'manualAttendance.json']);
const MANUAL_PATH   = path.join(STORAGE_DIR, 'manualAttendance.json');

interface RawTranscript {
  id: string;
  title: string;
  dateString: string;
  speakers?: Array<{ id: number; name: string }>;
}

interface ManualEntry { attended: number; invited: number; note?: string }
interface ManualFile  { members: Record<string, ManualEntry> }

export interface MeetingStats {
  meetingsAttended: number;
  meetingsList: string[];
}

export interface MeetingsData {
  byMember: Record<string, MeetingStats>;
  totalMeetings: number;
  unknownEmails: string[];
  unknownSpeakers: string[];
}

export async function collectMeetings(): Promise<MeetingsData> {
  // ── Manual override (ground truth from coordinator) ────────────────────────
  if (fs.existsSync(MANUAL_PATH)) {
    console.log('   🎙  Transcrições: usando presença manual (manualAttendance.json)');
    const manual = JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf-8')) as ManualFile;
    const byMember: Record<string, MeetingStats> = {};
    for (const m of TEAM) {
      const entry = manual.members[m.id];
      byMember[m.id] = {
        meetingsAttended: entry?.attended ?? 0,
        meetingsList: entry ? [`${entry.attended}/${entry.invited} reuniões`] : [],
      };
    }
    // count unique meeting occurrences from storage for totalMeetings header
    const files = fs.readdirSync(STORAGE_DIR)
      .filter(f => f.endsWith('.json') && !SKIP_FILES.has(f));
    const seen = new Set<string>();
    let total = 0;
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(STORAGE_DIR, file), 'utf-8')) as RawTranscript;
      if (/^teste\s/i.test(raw.title?.trim() ?? '')) continue;
      const day = raw.dateString?.substring(0, 10) ?? '?';
      const key = `${day}|${raw.title}`;
      if (!seen.has(key)) { seen.add(key); total++; }
    }
    console.log(`   🎙  ${total} reuniões únicas no período`);
    return { byMember, totalMeetings: total, unknownEmails: [], unknownSpeakers: [] };
  }

  // ── Fallback: infer from transcript speakers ───────────────────────────────
  console.log('   🎙  Transcrições: lendo arquivos locais de storage/...');

  const allFiles = fs.readdirSync(STORAGE_DIR)
    .filter(f => f.endsWith('.json') && !SKIP_FILES.has(f));

  const files = allFiles.filter(f => {
    const raw = JSON.parse(fs.readFileSync(path.join(STORAGE_DIR, f), 'utf-8')) as RawTranscript;
    return !/^teste\s/i.test(raw.title?.trim() ?? '');
  });

  console.log(`   🎙  ${files.length} transcrições encontradas (${allFiles.length - files.length} testes ignorados)`);

  const byMember: Record<string, MeetingStats> = {};
  for (const m of TEAM) byMember[m.id] = { meetingsAttended: 0, meetingsList: [] };

  const unknownSpeakers = new Set<string>();
  // deduplicate by title+day so double-recorded meetings count only once
  const seenMeetings = new Set<string>();

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(STORAGE_DIR, file), 'utf-8')) as RawTranscript;
    const day   = raw.dateString?.substring(0, 10) ?? '?';
    const key   = `${day}|${raw.title}`;
    if (seenMeetings.has(key)) continue; // skip duplicate recording of same session
    seenMeetings.add(key);

    const date  = raw.dateString ? new Date(raw.dateString).toLocaleDateString('pt-BR') : '?';
    const label = `${date} — ${raw.title}`;
    const attendedIds = new Set<string>();

    for (const speaker of raw.speakers ?? []) {
      const name = speaker.name?.trim();
      if (!name) continue;
      const member = findByFirefliesName(name);
      if (member) {
        if (!attendedIds.has(member.id)) {
          attendedIds.add(member.id);
          byMember[member.id].meetingsAttended++;
          byMember[member.id].meetingsList.push(label);
        }
      } else {
        unknownSpeakers.add(name);
      }
    }
  }

  return {
    byMember,
    totalMeetings: seenMeetings.size,
    unknownEmails: [],
    unknownSpeakers: [...unknownSpeakers],
  };
}
