import 'dotenv/config';
import { findByGithub, TEAM } from './teamConfig';

const GH_API = 'https://api.github.com';
const PROJECT_ID = process.env.GITHUB_PROJECT_ID!;
const ORG       = process.env.GITHUB_ORG ?? 'Dive-Realities';
const TOKEN     = process.env.GITHUB_TOKEN!;
const SINCE     = '2026-04-01T00:00:00Z';

export interface GitHubStats {
  cardsDone: number;
  cardsInReview: number;
  cardsInProgress: number;
  cardsTodo: number;
  cardsOverdue: number;
  commits: number;
}

export interface MemberSprintCards {
  assigned: number;
  done: number;
  inProgress: number;
  inReview: number;
}

export interface SprintMeta {
  id: string;
  title: string;
  isCurrent: boolean;
  isPast: boolean;    // sprint encerrada (end date < hoje)
  isFuture: boolean;  // sprint ainda não iniciada
  startDate: string;
}

export interface GitHubData {
  byMember: Record<string, GitHubStats>;
  byMemberBySprint: Record<string, Record<string, MemberSprintCards>>;
  sprints: SprintMeta[];
  unknownLogins: string[];
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error(`Timeout após ${timeoutMs / 1000}s: ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function graphql(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetchWithTimeout(`${GH_API}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json() as { data?: unknown; errors?: unknown[] };
  if (json.errors?.length) throw new Error(`GitHub GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function restGet(path: string): Promise<unknown> {
  const res = await fetchWithTimeout(`${GH_API}${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub REST ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

interface RawCard {
  logins: string[];
  status: 'done' | 'inReview' | 'inProgress' | 'todo';
  iterationId: string | null;
  iterationTitle: string | null;
  iterationStartDate: string | null;
  iterationDuration: number | null;
}

async function collectProjectCards(): Promise<{
  byLogin: Map<string, { done: number; inReview: number; inProgress: number; todo: number; overdue: number }>;
  byLoginBySprint: Map<string, Map<string, MemberSprintCards>>;
  sprints: SprintMeta[];
}> {
  const rawCards: RawCard[] = [];
  // sprintId → { title, startDate, duration }
  const sprintMeta = new Map<string, { title: string; startDate: string; duration: number }>();

  let cursor: string | null = null;
  let hasNext = true;
  const seenStatuses = new Set<string>();

  while (hasNext) {
    const query = `
      query($id: ID!, $after: String) {
        node(id: $id) {
          ... on ProjectV2 {
            items(first: 100, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2SingleSelectField { name } }
                    }
                    ... on ProjectV2ItemFieldIterationValue {
                      iterationId
                      title
                      startDate
                      duration
                      field { ... on ProjectV2IterationField { name } }
                    }
                  }
                }
                content {
                  ... on Issue        { assignees(first: 10) { nodes { login } } }
                  ... on PullRequest  { assignees(first: 10) { nodes { login } } }
                  ... on DraftIssue   { assignees(first: 10) { nodes { login } } }
                }
              }
            }
          }
        }
      }
    `;

    const data = await graphql(query, { id: PROJECT_ID, after: cursor }) as any;
    const items = data.node.items;
    hasNext = items.pageInfo.hasNextPage;
    cursor  = items.pageInfo.endCursor;

    for (const item of items.nodes) {
      const logins: string[] = item.content?.assignees?.nodes?.map((a: any) => a.login) ?? [];
      let status: RawCard['status'] = 'todo';
      let iterationId: string | null = null;
      let iterationTitle: string | null = null;
      let iterationStartDate: string | null = null;
      let iterationDuration: number | null = null;

      for (const fv of item.fieldValues.nodes) {
        const fieldName = (fv.field?.name ?? '').toLowerCase();

        if (fieldName === 'status' && fv.name) {
          seenStatuses.add(fv.name);
          const s = fv.name.toLowerCase();
          if (s.includes('done') || s.includes('conclu') || s.includes('feito') || s.includes('pronto')) status = 'done';
          else if (s.includes('review')) status = 'inReview';
          else if (s.includes('progress') || s.includes('andamento') || s.includes('doing') || s.includes('ready')) status = 'inProgress';
          else status = 'todo'; // Backlog, Blocked — excluídos do cálculo
        }

        if (fv.iterationId) {
          iterationId       = fv.iterationId;
          iterationTitle    = fv.title ?? null;
          iterationStartDate = fv.startDate ?? null;
          iterationDuration  = fv.duration ?? null;

          if (!sprintMeta.has(fv.iterationId) && fv.startDate != null && fv.duration != null) {
            sprintMeta.set(fv.iterationId, {
              title: fv.title ?? fv.iterationId,
              startDate: fv.startDate,
              duration: fv.duration,
            });
          }
        }
      }

      rawCards.push({ logins, status, iterationId, iterationTitle, iterationStartDate, iterationDuration });
    }
  }

  if (seenStatuses.size > 0) {
    console.log(`   📦 GitHub status values encontrados: ${[...seenStatuses].join(', ')}`);
  }

  // Determina sprint atual por data
  const today = new Date();
  const sprintsList: SprintMeta[] = [...sprintMeta.entries()]
    .map(([id, meta]) => {
      const start = new Date(meta.startDate);
      const end   = new Date(start.getTime() + meta.duration * 86400_000);
      const isCurrent = today >= start && today < end;
      const isPast    = today >= end;
      const isFuture  = today < start;
      return { id, title: meta.title, isCurrent, isPast, isFuture, startDate: meta.startDate };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const currentSprint = sprintsList.find(s => s.isCurrent);
  if (currentSprint) {
    console.log(`   📦 GitHub: sprint atual = "${currentSprint.title}" (por data)`);
  } else if (sprintsList.length > 0) {
    // Fallback: última sprint como atual
    sprintsList[sprintsList.length - 1] = { ...sprintsList[sprintsList.length - 1], isCurrent: true };
    console.log(`   📦 GitHub: nenhuma sprint ativa hoje — usando última como referência`);
  } else {
    console.log(`   📦 GitHub: campo Sprint (Iteration) não encontrado nos cards`);
  }

  const currentSprintId = sprintsList.find(s => s.isCurrent)?.id ?? null;

  // Agrupa por login
  const byLogin = new Map<string, { done: number; inReview: number; inProgress: number; todo: number; overdue: number }>();
  const byLoginBySprint = new Map<string, Map<string, MemberSprintCards>>();

  for (const card of rawCards) {
    const isOpen = card.status === 'inProgress' || card.status === 'inReview';
    const isPrevSprint = currentSprintId !== null
      && card.iterationId !== null
      && card.iterationId !== currentSprintId;
    const isOverdue = isOpen && isPrevSprint;

    for (const login of card.logins) {
      // Agregado
      if (!byLogin.has(login)) byLogin.set(login, { done: 0, inReview: 0, inProgress: 0, todo: 0, overdue: 0 });
      const agg = byLogin.get(login)!;
      if (card.status === 'done')             agg.done++;
      else if (isOverdue)                     agg.overdue++;
      else if (card.status === 'inReview')    agg.inReview++;
      else if (card.status === 'inProgress')  agg.inProgress++;
      else                                    agg.todo++;

      // Por sprint
      if (card.iterationId) {
        if (!byLoginBySprint.has(login)) byLoginBySprint.set(login, new Map());
        const sprintMap = byLoginBySprint.get(login)!;
        if (!sprintMap.has(card.iterationId)) sprintMap.set(card.iterationId, { assigned: 0, done: 0, inProgress: 0, inReview: 0 });
        const sc = sprintMap.get(card.iterationId)!;
        sc.assigned++;
        if (card.status === 'done')            sc.done++;
        else if (card.status === 'inProgress') sc.inProgress++;
        else if (card.status === 'inReview')   sc.inReview++;
      }
    }
  }

  return { byLogin, byLoginBySprint, sprints: sprintsList };
}

async function collectCommits(): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const repos = await restGet(`/orgs/${ORG}/repos?per_page=100&type=all`) as Array<{ name: string; archived: boolean }>;
  const active = repos.filter(r => !r.archived);

  for (const repo of active) {
    const seenShas = new Set<string>();
    try {
      const branches = await restGet(`/repos/${ORG}/${repo.name}/branches?per_page=100`) as Array<{ name: string }>;
      for (const branch of branches) {
        try {
          let page = 1;
          let hasMore = true;
          while (hasMore) {
            const commits = await restGet(
              `/repos/${ORG}/${repo.name}/commits?sha=${branch.name}&since=${SINCE}&per_page=100&page=${page}`
            ) as Array<{ sha: string; author?: { login?: string } }>;
            if (commits.length === 0) { hasMore = false; break; }
            for (const c of commits) {
              if (seenShas.has(c.sha)) continue;
              seenShas.add(c.sha);
              const login = c.author?.login;
              if (login) result.set(login, (result.get(login) ?? 0) + 1);
            }
            if (commits.length < 100) hasMore = false;
            page++;
          }
        } catch { /* branch inacessível */ }
      }
    } catch { /* repo privado ou vazio */ }
  }
  return result;
}

export async function collectGitHub(): Promise<GitHubData> {
  console.log('   📦 GitHub: coletando cards do projeto...');
  const { byLogin, byLoginBySprint, sprints } = await collectProjectCards();

  console.log('   📦 GitHub: coletando commits...');
  const commits = await collectCommits();

  const allLogins = new Set([...byLogin.keys(), ...commits.keys()]);
  const byMember: Record<string, GitHubStats> = {};
  const byMemberBySprint: Record<string, Record<string, MemberSprintCards>> = {};
  const unknownLogins: string[] = [];

  for (const login of allLogins) {
    const member = findByGithub(login);
    const c = byLogin.get(login) ?? { done: 0, inReview: 0, inProgress: 0, todo: 0, overdue: 0 };
    const cmts = commits.get(login) ?? 0;

    if (member) {
      if (!byMember[member.id]) byMember[member.id] = { cardsDone: 0, cardsInReview: 0, cardsInProgress: 0, cardsTodo: 0, cardsOverdue: 0, commits: 0 };
      byMember[member.id].cardsDone       += c.done;
      byMember[member.id].cardsInReview   += c.inReview;
      byMember[member.id].cardsInProgress += c.inProgress;
      byMember[member.id].cardsTodo       += c.todo;
      byMember[member.id].cardsOverdue    += c.overdue;
      byMember[member.id].commits         += cmts;

      // Por sprint
      const loginSprints = byLoginBySprint.get(login);
      if (loginSprints) {
        if (!byMemberBySprint[member.id]) byMemberBySprint[member.id] = {};
        for (const [sprintId, sc] of loginSprints.entries()) {
          if (!byMemberBySprint[member.id][sprintId]) byMemberBySprint[member.id][sprintId] = { assigned: 0, done: 0, inProgress: 0, inReview: 0 };
          byMemberBySprint[member.id][sprintId].assigned   += sc.assigned;
          byMemberBySprint[member.id][sprintId].done       += sc.done;
          byMemberBySprint[member.id][sprintId].inProgress += sc.inProgress;
          byMemberBySprint[member.id][sprintId].inReview   += sc.inReview;
        }
      }
    } else if (c.done + c.inProgress + c.todo + c.overdue + cmts > 0) {
      unknownLogins.push(login);
    }
  }

  for (const m of TEAM) {
    if (!byMember[m.id]) byMember[m.id] = { cardsDone: 0, cardsInReview: 0, cardsInProgress: 0, cardsTodo: 0, cardsOverdue: 0, commits: 0 };
  }

  return { byMember, byMemberBySprint, sprints, unknownLogins };
}
