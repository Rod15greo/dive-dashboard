export type ScoreRole = 'technical' | 'nontechnical' | 'leadership';
export type TeamClassification = 'otimo' | 'bom' | 'ruim' | 'critico' | 'sem-dados';

export interface ScoreBreakdown {
  score: number;
  deliveryPts: number;
  activityPts: number;
  presencePts: number;
  collabPts: number;
  weights: { delivery: number; activity: number; presence: number; collab: number };
}

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
  deliveryRate: number; // done/assigned*100, 0 se sem dados ou sprint atual
}

export interface DashboardMember {
  id: string;
  name: string;
  role: string;
  scoreRole: ScoreRole;
  technical: boolean;
  cardsDone: number;
  cardsInReview: number;
  cardsInProgress: number;
  cardsTodo: number;
  cardsOverdue: number;
  commits: number;
  meetingsAttended: number;
  meetingsInvited: number;
  discord: number;
  drive: number;
  breakdown: ScoreBreakdown;
  sprintHistory: SprintRecord[];
  historicalDeliveryRate: number; // avg sprints concluídas (-1 = sem dados)
}

export interface TeamMemberDelivery {
  id: string;
  name: string;
  historicalRate: number;   // -1 = sem dados
  currentDone: number;
  currentInProgress: number;
  currentInReview: number;
  overdue: number;
  hasCurrentTask: boolean;
  missingSprints: string[];
}

export interface TeamSprintSummary {
  sprintId: string;
  sprintTitle: string;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  avgDeliveryRate: number;
  hasData: boolean;
}

export interface TeamStatus {
  id: string;
  name: string;
  leaderId: string | null;
  leaderName: string | null;
  members: TeamMemberDelivery[];
  historicalAvg: number;        // avg de sprints concluídas
  classification: TeamClassification;
  sprintSummaries: TeamSprintSummary[];
  membersWithoutCurrentTask: string[];
  membersWithOverdue: string[];
  sprintsWithoutAssignment: string[];
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
  loading?: boolean;
  refreshing?: boolean;
}

export interface User {
  email: string;
  name: string;
  picture: string;
}
