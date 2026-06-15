/**
 * Single source of truth for team member configuration.
 * Reads from data/members.json — edit that file to add/remove members or change roles.
 * Replaces the combination of teamConfig.ts + team_emails.json.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ScoreRole } from './dashboard/generateHTMLv2';

export interface Member {
  id: string;
  name: string;
  role: string;
  scoreRole: ScoreRole;
  technical: boolean;
  coordinator: boolean;
  github: string[];
  emails: string[];
  discordIds: string[];
  firefliesNames: string[];
}

function loadMembers(): Member[] {
  const filePath = path.resolve(__dirname, '../data/members.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Member[];
}

export const MEMBERS: Member[] = loadMembers();

export function findByGithub(login: string): Member | undefined {
  const lower = login.toLowerCase();
  return MEMBERS.find(m => m.github.some(g => g.toLowerCase() === lower));
}

export function findByEmail(email: string): Member | undefined {
  const lower = email.toLowerCase();
  return MEMBERS.find(m => m.emails.some(e => e.toLowerCase() === lower));
}

export function findByDiscordId(id: string): Member | undefined {
  return MEMBERS.find(m => m.discordIds.includes(id));
}

export function findByFirefliesName(name: string): Member | undefined {
  const lower = name.toLowerCase().trim();
  return MEMBERS.find(m => m.firefliesNames.some(fn => fn.toLowerCase() === lower));
}

export function getCoordinatorEmails(): Set<string> {
  return new Set(
    MEMBERS.filter(m => m.coordinator).flatMap(m => m.emails.map(e => e.toLowerCase()))
  );
}
