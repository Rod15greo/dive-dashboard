/**
 * @deprecated Use src/memberConfig.ts + data/members.json instead.
 * This file is kept for compatibility with the dashboard collectors.
 */
import { MEMBERS } from '../memberConfig';
import type { ScoreRole } from './generateHTMLv2';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  scoreRole?: ScoreRole;
  technical: boolean;  // false = não faz commits (design, validação, coordenação)
  github: string | string[];
  email: string | string[] | null;
  discordIds: string[];
  firefliesNames: string[];
}

// Derivado de data/members.json (arquivo local, fora do git — ver data/members.example.json).
// Antes esta lista era fixa no código e expunha e-mails/IDs de Discord no repositório.
export const TEAM: TeamMember[] = MEMBERS.map(m => ({
  id: m.id,
  name: m.name,
  role: m.role,
  scoreRole: m.scoreRole,
  technical: m.technical,
  github: m.github,
  email: m.emails,
  discordIds: m.discordIds,
  firefliesNames: m.firefliesNames,
}));

export function findByGithub(login: string): TeamMember | undefined {
  const lower = login.toLowerCase();
  return TEAM.find(m => {
    if (!m.github || (Array.isArray(m.github) && m.github.length === 0)) return false;
    return Array.isArray(m.github)
      ? m.github.some(g => g.toLowerCase() === lower)
      : m.github.toLowerCase() === lower;
  });
}

export function findByEmail(email: string): TeamMember | undefined {
  const lower = email.toLowerCase();
  return TEAM.find(m => {
    if (!m.email) return false;
    return Array.isArray(m.email)
      ? m.email.some(e => e.toLowerCase() === lower)
      : m.email.toLowerCase() === lower;
  });
}

export function findByDiscordId(id: string): TeamMember | undefined {
  return TEAM.find(m => m.discordIds.includes(id));
}

export function findByFirefliesName(name: string): TeamMember | undefined {
  const lower = name.toLowerCase().trim();
  return TEAM.find(m =>
    m.firefliesNames.some(fn => fn.toLowerCase() === lower)
  );
}
