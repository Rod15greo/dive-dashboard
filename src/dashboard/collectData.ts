import * as fs from 'fs';
import * as path from 'path';
import { TEAM, findByEmail } from './teamConfig';
import { resolveDataFile } from '../memberConfig';
import { collectGitHub, SprintMeta, MemberSprintCards } from './collectGitHub';
import { collectDiscord } from './collectDiscord';
import { collectMeetings } from './collectMeetings';
import { collectCalendar } from './collectCalendar';
import { calcScoreV2, SCORE_ROLE_MAP, ScoreBreakdown, ScoreRole } from './generateHTMLv2';

export type { ScoreRole, ScoreBreakdown };

export type TeamClassification = 'otimo' | 'bom' | 'ruim' | 'critico' | 'sem-dados';

export interface SprintRecord {
  sprintId: string;
  sprintTitle: string;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  assigned: number;
  done: number;
  inProgress: number;
  inReview: number;
  deliveryRate: number;
}

export interface DashboardMember {
  id: string; name: string; role: string; scoreRole: ScoreRole; technical: boolean;
  cardsDone: number; cardsInReview: number; cardsInProgress: number;
  cardsTodo: number; cardsOverdue: number; commits: number;
  meetingsAttended: number; meetingsInvited: number;
  discord: number; drive: number;
  breakdown: ScoreBreakdown;
  sprintHistory: SprintRecord[];
  historicalDeliveryRate: number; // avg sprints concluídas (-1 = sem dados)
}

export interface TeamMemberDelivery {
  id: string; name: string;
  historicalRate: number;
  currentDone: number; currentInProgress: number; currentInReview: number;
  overdue: number; hasCurrentTask: boolean;
  missingSprints: string[]; // sprints passadas sem tasks atribuídas
}

export interface TeamSprintSummary {
  sprintId: string; sprintTitle: string; isCurrent: boolean; isPast: boolean; isFuture: boolean;
  avgDeliveryRate: number; hasData: boolean; // hasData = pelo menos 1 membro com tasks nessa sprint
}

export interface TeamStatus {
  id: string; name: string;
  leaderId: string | null; leaderName: string | null;
  members: TeamMemberDelivery[];
  historicalAvg: number;
  classification: TeamClassification;
  sprintSummaries: TeamSprintSummary[];
  membersWithoutCurrentTask: string[];
  membersWithOverdue: string[];
  sprintsWithoutAssignment: string[]; // sprints passadas onde o líder não atribuiu tasks
}

export interface DashboardData {
  generatedAt: string;
  totalMeetings: number;
  members: DashboardMember[];
  teams: TeamStatus[];
  unknownDiscord: Array<{ id: string; username: string; globalName: string; total: number }>;
  unknownEmails: string[];
  unknownSpeakers: string[];
  unknownGitHub: string[];
}

interface DrivePerson {
  name: string; email: string; totalFiles: number;
  files: Array<{ name: string; folder: string; createdTime: string; link: string }>;
}

function loadDriveData(): Record<string, number> {
  const filePath = path.resolve(__dirname, '../../dashboard-drive-data.json');
  if (!fs.existsSync(filePath)) return {};
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { byPerson: DrivePerson[] };
  const result: Record<string, number> = {};
  for (const person of raw.byPerson) {
    const member = findByEmail(person.email);
    if (!member) continue;
    const humanFiles = person.files.filter(f => !f.folder.includes('Atas de reunião'));
    if (humanFiles.length > 0) result[member.id] = humanFiles.length;
  }
  return result;
}

function loadManualAttendance(): Record<string, { attended: number; invited: number }> {
  const p = path.resolve(__dirname, '../../storage/manualAttendance.json');
  if (!fs.existsSync(p)) return {};
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as {
    members: Record<string, { attended: number; invited: number }>;
  };
  return raw.members ?? {};
}

function buildSprintHistory(
  memberId: string,
  byMemberBySprint: Record<string, Record<string, MemberSprintCards>>,
  sprints: SprintMeta[]
): { history: SprintRecord[]; historicalRate: number } {
  const memberSprints = byMemberBySprint[memberId] ?? {};
  const history: SprintRecord[] = sprints.map(sprint => {
    const sc = memberSprints[sprint.id] ?? { assigned: 0, done: 0, inProgress: 0, inReview: 0 };
    const isPast   = (sprint as any).isPast   ?? false;
    const isFuture = (sprint as any).isFuture ?? false;
    const deliveryRate = isPast && sc.assigned > 0
      ? (sc.done / sc.assigned) * 100
      : 0;
    return {
      sprintId: sprint.id, sprintTitle: sprint.title,
      isCurrent: sprint.isCurrent, isPast, isFuture,
      assigned: sc.assigned, done: sc.done,
      inProgress: sc.inProgress, inReview: sc.inReview,
      deliveryRate,
    };
  });

  // Só sprints PASSADAS com tasks contam (inclui as com 0% de entrega)
  const past = sprints.filter(s => (s as any).isPast);
  const pastWithData = history.filter(s => {
    const meta = past.find(p => p.id === s.sprintId);
    return meta && s.assigned > 0;
  });
  const historicalRate = pastWithData.length > 0
    ? pastWithData.reduce((sum, s) => sum + s.deliveryRate, 0) / pastWithData.length
    : -1;

  return { history, historicalRate };
}

function classifyTeam(rate: number): TeamClassification {
  if (rate < 0) return 'sem-dados';
  if (rate >= 85) return 'otimo';
  if (rate >= 65) return 'bom';
  if (rate >= 40) return 'ruim';
  return 'critico';
}

function computeTeams(
  members: DashboardMember[],
  sprints: SprintMeta[]
): TeamStatus[] {
  const teamsPath = resolveDataFile('teams.json');
  if (!fs.existsSync(teamsPath)) return [];
  const teamsConfig: Array<{ id: string; name: string; leaderId: string | null; memberIds: string[] }> =
    JSON.parse(fs.readFileSync(teamsPath, 'utf-8'));

  const memberMap = new Map(members.map(m => [m.id, m]));

  return teamsConfig.map(team => {
    const leaderMember = team.leaderId ? memberMap.get(team.leaderId) : undefined;
    const teamMembers = team.memberIds.map(id => memberMap.get(id)).filter((m): m is DashboardMember => !!m);

    const currentSprint = sprints.find(s => s.isCurrent);

    const membersDelivery: TeamMemberDelivery[] = teamMembers.map(m => {
      const currentRecord = m.sprintHistory.find(s => s.isCurrent);
      // Ponto de partida = primeira sprint com tasks atribuídas
      const firstTaskIdx = m.sprintHistory.findIndex(s => s.assigned > 0);
      const missingSprints = firstTaskIdx === -1 ? [] :
        m.sprintHistory
          .slice(firstTaskIdx)
          .filter(s => s.isPast && s.assigned === 0)
          .map(s => s.sprintTitle.replace(/sprint\s*/i, 'S').split(' ').slice(0,2).join(' '));

      return {
        id: m.id, name: m.name,
        historicalRate: m.historicalDeliveryRate,
        currentDone:       currentRecord?.done       ?? m.cardsDone,
        currentInProgress: currentRecord?.inProgress ?? m.cardsInProgress,
        currentInReview:   currentRecord?.inReview   ?? m.cardsInReview,
        overdue: m.cardsOverdue,
        hasCurrentTask: currentRecord
          ? (currentRecord.assigned > 0)
          : (m.cardsDone + m.cardsInProgress + m.cardsInReview > 0),
        missingSprints,
      };
    });

    // Histórico por sprint do time
    const sprintSummaries: TeamSprintSummary[] = sprints.map(sprint => {
      const withData = teamMembers.filter(m => {
        const sr = m.sprintHistory.find(s => s.sprintId === sprint.id);
        return sr && sr.assigned > 0;
      });
      const hasData = withData.length > 0;
      const avg = hasData && !sprint.isCurrent
        ? withData.reduce((sum, m) => {
            const sr = m.sprintHistory.find(s => s.sprintId === sprint.id)!;
            return sum + sr.deliveryRate;
          }, 0) / withData.length
        : 0;
      return {
        sprintId: sprint.id, sprintTitle: sprint.title,
        isCurrent: sprint.isCurrent, isPast: (sprint as any).isPast ?? false, isFuture: (sprint as any).isFuture ?? false,
        avgDeliveryRate: avg, hasData,
      };
    });

    // Média histórica = sprints PASSADAS com pelo menos 1 membro com tasks (inclui 0%)
    const pastWithData = sprintSummaries.filter(s => s.isPast && s.hasData);
    const historicalAvg = pastWithData.length > 0
      ? pastWithData.reduce((s, sp) => s + sp.avgDeliveryRate, 0) / pastWithData.length
      : -1;

    return {
      id: team.id, name: team.name,
      leaderId: team.leaderId, leaderName: leaderMember?.name ?? null,
      members: membersDelivery,
      historicalAvg,
      classification: classifyTeam(historicalAvg),
      sprintSummaries,
      membersWithoutCurrentTask: membersDelivery.filter(m => !m.hasCurrentTask).map(m => m.name),
      membersWithOverdue: membersDelivery.filter(m => m.overdue > 0).map(m => `${m.name} (${m.overdue})`),
      sprintsWithoutAssignment: (() => {
        const firstIdx = sprintSummaries.findIndex(s => s.isPast && s.hasData);
        return firstIdx === -1 ? [] :
          sprintSummaries
            .slice(firstIdx)
            .filter(s => s.isPast && !s.hasData)
            .map(s => s.sprintTitle.replace(/sprint\s*/i, 'S').split(' ').slice(0,2).join(' '));
      })(),
    };
  });
}

const HIDDEN_FROM_DASHBOARD = ['mia'];

export async function collectDashboardData(): Promise<DashboardData> {
  const driveData = loadDriveData();
  const manualMtg = loadManualAttendance();

  const [githubData, discordData, meetingsData, calendarData] = await Promise.all([
    collectGitHub().catch(e  => { console.error('⚠ GitHub falhou:', e.message);  return { byMember: {} as any, byMemberBySprint: {}, sprints: [], unknownLogins: [] }; }),
    collectDiscord().catch(e => { console.error('⚠ Discord falhou:', e.message); return { byMember: {} as any, unknownUsers: [], channelNames: {} }; }),
    collectMeetings().catch(e => { console.error('⚠ Meetings falhou:', e.message); return { byMember: {} as any, totalMeetings: 0, unknownEmails: [], unknownSpeakers: [] }; }),
    collectCalendar().catch(e => { console.error('⚠ Calendar falhou:', e.message); return { byMember: {} as any }; }),
  ]);

  const maxCommits = Math.max(...TEAM.filter(m => m.technical).map(m => githubData.byMember[m.id]?.commits ?? 0), 1);
  const maxDrive   = Math.max(...TEAM.map(m => driveData[m.id] ?? 0), 1);

  const members: DashboardMember[] = TEAM.filter(m => !HIDDEN_FROM_DASHBOARD.includes(m.id)).map(m => {
    const g = githubData.byMember[m.id] ?? { cardsDone: 0, cardsInProgress: 0, cardsInReview: 0, cardsTodo: 0, cardsOverdue: 0, commits: 0 };
    const manual  = manualMtg[m.id];
    const attended = manual?.attended ?? meetingsData.byMember[m.id]?.meetingsAttended ?? 0;
    const invited  = manual?.invited  ?? calendarData.byMember[m.id]?.invited ?? 0;
    const disc     = discordData.byMember[m.id]?.totalMessages ?? 0;
    const drv      = driveData[m.id] ?? 0;
    const cardsInReview = (g as any).cardsInReview ?? 0;
    const scoreRole = m.scoreRole ?? SCORE_ROLE_MAP[m.id] ?? (m.technical ? 'technical' : 'nontechnical');

    const { history, historicalRate } = buildSprintHistory(m.id, githubData.byMemberBySprint, githubData.sprints);

    const breakdown = calcScoreV2({
      scoreRole, isTechnical: m.technical,
      cardsDone: g.cardsDone, cardsInReview, cardsInProgress: g.cardsInProgress,
      cardsOverdue: g.cardsOverdue ?? 0,
      historicalDeliveryRate: historicalRate >= 0 ? historicalRate : undefined,
      commits: g.commits, meetingsAttended: attended, meetingsInvited: invited || 1,
      discord: disc, drive: drv,
    }, maxCommits, maxDrive);

    return {
      id: m.id, name: m.name, role: m.role, scoreRole, technical: m.technical,
      cardsDone: g.cardsDone, cardsInReview, cardsInProgress: g.cardsInProgress,
      cardsTodo: g.cardsTodo ?? 0, cardsOverdue: g.cardsOverdue ?? 0, commits: g.commits,
      meetingsAttended: attended, meetingsInvited: invited,
      discord: disc, drive: drv, breakdown,
      sprintHistory: history,
      historicalDeliveryRate: historicalRate,
    };
  });

  const teams = computeTeams(members, githubData.sprints);

  return {
    generatedAt: new Date().toISOString(),
    totalMeetings: meetingsData.totalMeetings,
    members, teams,
    unknownDiscord: discordData.unknownUsers,
    unknownEmails: meetingsData.unknownEmails,
    unknownSpeakers: meetingsData.unknownSpeakers ?? [],
    unknownGitHub: githubData.unknownLogins,
  };
}
