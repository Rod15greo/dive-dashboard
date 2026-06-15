import * as fs from 'fs';
import * as path from 'path';

export type ScoreRole = 'technical' | 'nontechnical' | 'leadership';

export interface ScoreBreakdown {
  score: number;
  deliveryPts: number;
  activityPts: number;
  presencePts: number;
  collabPts: number;
  weights: { delivery: number; activity: number; presence: number; collab: number };
}

export const SCORE_ROLE_MAP: Record<string, ScoreRole> = {
  anders:    'leadership', rodrigo:   'leadership',
  nicolas:   'leadership', joao_vitor:'leadership',
  stefane:   'technical',  math:      'technical',
  yago:      'technical',  bianca:    'technical',
  pedro:     'technical',  leonardo:  'technical',
  gabriel:   'technical',
  laianny:   'nontechnical', rafaela: 'nontechnical',
  andrem:    'leadership',   augusto: 'nontechnical',
  tejota:    'nontechnical', mia:     'nontechnical',
};

interface ScoringConfig {
  weights: Record<ScoreRole, { delivery: number; activity: number; presence: number; collab: number }>;
  presenceBonusThreshold: number;
  presenceBonusPoints: number;
  discordCap: number;
}

function loadScoringConfig(): ScoringConfig {
  const configPath = path.resolve(__dirname, '../../data/scoring-config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ScoringConfig;
}

const SCORING = loadScoringConfig();
const WEIGHTS = SCORING.weights;

export function getScoringConfig(): ScoringConfig { return SCORING; }

export function calcScoreV2(inp: {
  scoreRole: ScoreRole; isTechnical: boolean;
  cardsDone: number; cardsInReview: number; cardsInProgress: number;
  cardsOverdue?: number;
  historicalDeliveryRate?: number;
  commits: number; meetingsAttended: number; meetingsInvited: number;
  discord: number; drive: number;
}, maxCommits: number, maxDrive: number): ScoreBreakdown {
  // Dimensão 1 — Entrega: usa histórico (sprints concluídas) se disponível, senão snapshot
  let deliveryPts: number;
  if (inp.historicalDeliveryRate != null && inp.historicalDeliveryRate >= 0) {
    deliveryPts = inp.historicalDeliveryRate;
  } else {
    const totalCards = inp.cardsDone + inp.cardsInReview + inp.cardsInProgress + (inp.cardsOverdue ?? 0);
    deliveryPts = totalCards > 0 ? (inp.cardsDone / totalCards) * 100 : 0;
  }

  // Dimensão 2 — Atividade
  const { discordCap, presenceBonusThreshold, presenceBonusPoints } = SCORING;
  let activityPts: number;
  if (inp.isTechnical && maxCommits > 0) {
    activityPts = (Math.log(1 + inp.commits) / Math.log(1 + maxCommits)) * 100;
  } else {
    const drivePts  = maxDrive > 0 ? (inp.drive / maxDrive) * 60 : 0;
    const discPts   = (Math.min(inp.discord, discordCap) / discordCap) * 40;
    activityPts = drivePts + discPts;
  }

  // Dimensão 3 — Presença: taxa + bônus agenda densa
  const presenceRate  = inp.meetingsInvited > 0 ? inp.meetingsAttended / inp.meetingsInvited : 1;
  const presenceBonus = inp.meetingsInvited >= presenceBonusThreshold && presenceRate === 1
    ? presenceBonusPoints : 0;
  const presencePts   = Math.min(presenceRate * 100 + presenceBonus, 100);

  // Dimensão 4 — Colaboração: cap menor (qualidade > quantidade)
  const collabPts = (Math.min(inp.discord, discordCap) / discordCap) * 100;

  const w     = WEIGHTS[inp.scoreRole];
  const score = Math.round(
    deliveryPts * w.delivery +
    activityPts * w.activity +
    presencePts * w.presence +
    collabPts   * w.collab
  );

  return { score, deliveryPts, activityPts, presencePts, collabPts, weights: w };
}

// ─── HTML generation ──────────────────────────────────────────────────────────

interface DashMember {
  id: string; name: string; role: string; scoreRole: ScoreRole;
  cardsDone: number; cardsInReview: number; cardsInProgress: number; cardsTodo: number;
  commits: number; technical: boolean;
  meetingsAttended: number; meetingsInvited: number;
  discord: number; drive: number;
  breakdown: ScoreBreakdown;
}

function scoreBadge(s: number): string {
  const [bg, text] =
    s >= 75 ? ['#166534', '#4ade80'] :
    s >= 60 ? ['#1e3a5f', '#38bdf8'] :
    s >= 45 ? ['#713f12', '#fbbf24'] :
              ['#7f1d1d', '#f87171'];
  return `<span style="background:${bg};color:${text};padding:2px 10px;border-radius:999px;font-weight:700;font-size:0.9rem">${s}</span>`;
}

function meetingBadge(attended: number, invited: number): string {
  if (invited === 0) return `<span style="color:#475569">—</span>`;
  const pct = attended / invited;
  const color = pct >= 1 ? '#4ade80' : pct >= 0.7 ? '#fbbf24' : '#f87171';
  return `<span style="color:${color};font-weight:600">${attended}/${invited}</span>`;
}

function miniBar(bd: ScoreBreakdown): string {
  const w = bd.weights;
  const segs = [
    { val: bd.deliveryPts * w.delivery, color: '#4ade80',  label: 'Entrega' },
    { val: bd.activityPts * w.activity, color: '#38bdf8',  label: 'Atividade' },
    { val: bd.presencePts * w.presence, color: '#a78bfa',  label: 'Presença' },
    { val: bd.collabPts   * w.collab,   color: '#fb923c',  label: 'Colaboração' },
  ];
  const bars = segs.map(s =>
    `<div title="${s.label}: ${Math.round(s.val)}pts" style="height:8px;flex:${Math.max(s.val,0.1)};background:${s.color};border-radius:2px"></div>`
  ).join('');
  return `<div style="display:flex;gap:2px;width:100px">${bars}</div>`;
}

function roleBadge(r: ScoreRole): string {
  const map: Record<ScoreRole, [string,string]> = {
    technical:    ['#1e3a5f','#38bdf8'],
    nontechnical: ['#2d1b4e','#a78bfa'],
    leadership:   ['#1c2a1c','#4ade80'],
  };
  const labels: Record<ScoreRole, string> = {
    technical:'Técnico', nontechnical:'Não-técnico', leadership:'Liderança',
  };
  const [bg, fg] = map[r];
  return `<span style="background:${bg};color:${fg};padding:1px 8px;border-radius:4px;font-size:0.75rem">${labels[r]}</span>`;
}

export function generateHTMLv2(
  generatedAt: string,
  totalMeetings: number,
  members: DashMember[],
  unknownDiscord: Array<{ username: string; globalName: string; total: number }>
): string {
  const sorted = [...members].sort((a, b) => b.breakdown.score - a.breakdown.score);

  // KPIs
  const avgScore   = Math.round(members.reduce((s, m) => s + m.breakdown.score, 0) / members.length);
  const atRisk     = members.filter(m => m.breakdown.score < 45).length;
  const avgDelivery = Math.round(members.reduce((s, m) => s + m.breakdown.deliveryPts, 0) / members.length);
  const avgPresence = Math.round(members.reduce((s, m) => s + m.breakdown.presencePts, 0) / members.length);

  const tableRows = sorted.map(m => `
    <tr data-role="${m.scoreRole}" data-name="${m.name}">
      <td>
        <strong style="cursor:pointer;text-decoration:underline dotted" onclick="showRadar('${m.id}')">${m.name}</strong>
        <br><small style="color:#64748b">${m.role}</small>
        <br>${roleBadge(m.scoreRole)}
      </td>
      <td class="num">${scoreBadge(m.breakdown.score)}</td>
      <td class="num">${miniBar(m.breakdown)}</td>
      <td class="num">${m.cardsDone}</td>
      <td class="num">${m.cardsInReview}</td>
      <td class="num">${m.cardsInProgress}</td>
      <td class="num">${m.technical ? m.commits : '<span style="color:#475569">—</span>'}</td>
      <td class="num">${meetingBadge(m.meetingsAttended, m.meetingsInvited)}</td>
      <td class="num">${m.discord}</td>
      <td class="num">${m.drive}</td>
    </tr>`).join('');

  const riskMembers = members.filter(m =>
    m.breakdown.score < 45 ||
    (m.meetingsInvited > 0 && m.meetingsAttended / m.meetingsInvited < 0.7) ||
    (m.cardsDone === 0 && m.cardsInProgress === 0 && m.cardsInReview === 0)
  );
  const riskRows = riskMembers.map(m => {
    const reasons: string[] = [];
    if (m.breakdown.score < 45) reasons.push(`Score baixo (${m.breakdown.score})`);
    if (m.meetingsInvited > 0 && m.meetingsAttended / m.meetingsInvited < 0.7)
      reasons.push(`Presença ${m.meetingsAttended}/${m.meetingsInvited}`);
    if (m.cardsDone === 0 && m.cardsInProgress === 0 && m.cardsInReview === 0)
      reasons.push('Zero cards ativos');
    return `<tr><td><strong>${m.name}</strong></td><td>${m.role}</td><td>${reasons.join(' · ')}</td></tr>`;
  }).join('');

  const radarData = JSON.stringify(
    members.reduce((acc, m) => {
      acc[m.id] = {
        name: m.name,
        delivery: Math.round(m.breakdown.deliveryPts),
        activity: Math.round(m.breakdown.activityPts),
        presence: Math.round(m.breakdown.presencePts),
        collab:   Math.round(m.breakdown.collabPts),
      };
      return acc;
    }, {} as Record<string, unknown>)
  );

  const chartNames    = sorted.map(m => `"${m.name}"`).join(',');
  const chartScores   = sorted.map(m => m.breakdown.score).join(',');
  const chartCards    = sorted.map(m => m.cardsDone).join(',');
  const chartCommits  = sorted.map(m => m.commits).join(',');
  const chartMeetings = sorted.map(m => m.meetingsAttended).join(',');
  const chartDiscord  = sorted.map(m => m.discord).join(',');
  const chartDrive    = sorted.map(m => m.drive).join(',');

  const unknownRows = unknownDiscord.length > 0
    ? `<div class="warning-box"><h3>⚠ Discord não mapeados</h3><table>
        <tr><th>Username</th><th>Nome</th><th>Msgs</th></tr>
        ${unknownDiscord.map(u => `<tr><td>${u.username}</td><td>${u.globalName}</td><td>${u.total}</td></tr>`).join('')}
       </table></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard Engajamento v2 — Dive Smart Factory</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
* { box-sizing:border-box; margin:0; padding:0 }
body { font-family:system-ui,sans-serif; background:#0f172a; color:#e2e8f0 }
header { background:linear-gradient(135deg,#1e3a5f,#0f2d4a); padding:28px 40px; border-bottom:2px solid #334155 }
header h1 { font-size:1.7rem; color:#38bdf8 }
header p  { color:#94a3b8; font-size:0.85rem; margin-top:4px }
.container { max-width:1300px; margin:0 auto; padding:28px 20px }
h2 { font-size:1.1rem; color:#38bdf8; margin-bottom:14px; padding-bottom:6px; border-bottom:1px solid #1e3a5f }
section { margin-bottom:44px }

/* KPI cards */
.kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:36px }
.kpi { background:#1e293b; border-radius:12px; padding:18px 20px; border-left:4px solid #334155 }
.kpi.green { border-color:#22c55e } .kpi.blue { border-color:#38bdf8 }
.kpi.yellow { border-color:#fbbf24 } .kpi.red { border-color:#ef4444 }
.kpi .val { font-size:2rem; font-weight:700; color:#e2e8f0 }
.kpi .label { font-size:0.78rem; color:#64748b; margin-top:4px }

/* Filter buttons */
.filters { display:flex; gap:8px; margin-bottom:20px; flex-wrap:wrap }
.filter-btn { background:#1e293b; border:1px solid #334155; color:#94a3b8; padding:6px 16px;
  border-radius:20px; cursor:pointer; font-size:0.82rem; transition:all .15s }
.filter-btn.active, .filter-btn:hover { background:#1e3a5f; color:#38bdf8; border-color:#38bdf8 }

/* Table */
table { width:100%; border-collapse:collapse; font-size:0.85rem }
th { background:#1e293b; color:#94a3b8; padding:10px 10px; text-align:left; font-weight:600; position:sticky; top:0 }
td { padding:10px 10px; border-bottom:1px solid #1e293b; vertical-align:middle }
td.num { text-align:center }
tr:hover td { background:#1a2744 }
tr.hidden { display:none }

/* Charts */
.chart-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px }
.chart-box { background:#1e293b; border-radius:12px; padding:18px }
.chart-box h3 { font-size:0.88rem; color:#94a3b8; margin-bottom:14px }

/* Radar modal */
#radar-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:100; align-items:center; justify-content:center }
#radar-overlay.show { display:flex }
#radar-box { background:#1e293b; border-radius:16px; padding:28px; max-width:420px; width:100%; position:relative }
#radar-box h3 { color:#e2e8f0; margin-bottom:16px }
#radar-close { position:absolute; top:12px; right:16px; background:none; border:none; color:#94a3b8; font-size:1.2rem; cursor:pointer }

/* Risk */
.risk-box { background:#1c0f0f; border:1px solid #7f1d1d; border-radius:10px; padding:18px }
.risk-box h3 { color:#f87171; margin-bottom:12px }

/* Warning */
.warning-box { background:#2d1b00; border:1px solid #92400e; border-radius:8px; padding:16px; margin-top:20px }
.warning-box h3 { color:#fbbf24; margin-bottom:8px }

/* Legend */
details { background:#1e293b; border-radius:10px; padding:16px; margin-top:8px }
summary { cursor:pointer; color:#94a3b8; font-size:0.88rem; font-weight:600 }
details p, details li { font-size:0.82rem; color:#64748b; margin-top:6px; line-height:1.6 }

small { color:#64748b }

@media (max-width:900px) {
  .kpi-grid { grid-template-columns:1fr 1fr }
  .chart-grid { grid-template-columns:1fr }
}
</style>
</head>
<body>
<header>
  <h1>Dashboard de Engajamento v2 — Dive Smart Factory</h1>
  <p>Gerado em ${new Date(generatedAt).toLocaleString('pt-BR')} &nbsp;·&nbsp; ${totalMeetings} reuniões analisadas &nbsp;·&nbsp; Fórmula v2 com pesos por role</p>
</header>

<div class="container">

<!-- KPI Cards -->
<div class="kpi-grid">
  <div class="kpi blue">
    <div class="val">${avgScore}</div>
    <div class="label">Score médio do time</div>
  </div>
  <div class="kpi green">
    <div class="val">${avgPresence}%</div>
    <div class="label">Presença média nas reuniões</div>
  </div>
  <div class="kpi yellow">
    <div class="val">${avgDelivery}%</div>
    <div class="label">Taxa de entrega média (cards)</div>
  </div>
  <div class="kpi red">
    <div class="val">${atRisk}</div>
    <div class="label">Pessoas com score &lt; 45</div>
  </div>
</div>

<!-- Filters -->
<section>
  <h2>Visão Geral da Equipe</h2>
  <div class="filters">
    <button class="filter-btn active" onclick="filter('all')">Todos</button>
    <button class="filter-btn" onclick="filter('technical')">Técnico</button>
    <button class="filter-btn" onclick="filter('leadership')">Liderança</button>
    <button class="filter-btn" onclick="filter('nontechnical')">Não-técnico</button>
  </div>

  <table id="main-table">
    <thead>
      <tr>
        <th>Pessoa</th>
        <th style="text-align:center">Score <small style="font-weight:400">(v1)</small></th>
        <th style="text-align:center">Dimensões</th>
        <th style="text-align:center">Done</th>
        <th style="text-align:center">Review</th>
        <th style="text-align:center">Progress</th>
        <th style="text-align:center">Commits</th>
        <th style="text-align:center">Reuniões</th>
        <th style="text-align:center">Discord</th>
        <th style="text-align:center">Drive</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p style="color:#475569;font-size:0.75rem;margin-top:8px">
    Dimensões (barras): <span style="color:#4ade80">■</span> Entrega &nbsp;
    <span style="color:#38bdf8">■</span> Atividade &nbsp;
    <span style="color:#a78bfa">■</span> Presença &nbsp;
    <span style="color:#fb923c">■</span> Colaboração &nbsp;·&nbsp;
    Clique no nome para ver o radar individual.
  </p>
</section>

<!-- Risk -->
${riskRows.length > 0 ? `
<section>
  <h2>Atenção — membros que podem precisar de suporte</h2>
  <div class="risk-box">
    <h3>⚠ ${riskMembers.length} pessoa${riskMembers.length > 1 ? 's' : ''} identificada${riskMembers.length > 1 ? 's' : ''}</h3>
    <table>
      <tr><th>Pessoa</th><th>Role</th><th>Motivo</th></tr>
      ${riskRows}
    </table>
  </div>
</section>` : ''}

<!-- Charts -->
<section>
  <h2>Gráficos por Métrica</h2>
  <div class="chart-grid">
    <div class="chart-box"><h3>Score v2 (0–100)</h3><canvas id="chartScore"></canvas></div>
    <div class="chart-box"><h3>Cards Concluídos</h3><canvas id="chartCards"></canvas></div>
    <div class="chart-box"><h3>Commits no Repositório</h3><canvas id="chartCommits"></canvas></div>
    <div class="chart-box"><h3>Reuniões com Presença</h3><canvas id="chartMeetings"></canvas></div>
    <div class="chart-box"><h3>Mensagens no Discord</h3><canvas id="chartDiscord"></canvas></div>
    <div class="chart-box"><h3>Arquivos no Drive</h3><canvas id="chartDrive"></canvas></div>
  </div>
</section>

${unknownRows}

<!-- Formula legend -->
<section>
  <h2>Fórmula de Score</h2>
  <details>
    <summary>Ver detalhes da fórmula v2 (clique para expandir)</summary>
    <p><strong style="color:#e2e8f0">4 dimensões, pesos diferentes por tipo de role:</strong></p>
    <ul style="margin-left:16px">
      <li><span style="color:#4ade80">Entrega (Done/Total)</span> — taxa de conclusão de cards. Done=100%, In Review conta no denominador.</li>
      <li><span style="color:#38bdf8">Atividade</span> — técnicos: log(commits)/log(max_commits). Não-técnicos: Drive (60%) + Discord (40%).</li>
      <li><span style="color:#a78bfa">Presença</span> — taxa attended/invited + bônus +10 se agenda ≥8 e 100% presença.</li>
      <li><span style="color:#fb923c">Colaboração</span> — Discord capeado em 80 msgs (qualidade > quantidade).</li>
    </ul>
    <p style="margin-top:10px"><strong style="color:#e2e8f0">Pesos:</strong></p>
    <ul style="margin-left:16px">
      <li><span style="color:#38bdf8">Liderança</span>: Entrega 25% · Atividade 20% · Presença 35% · Collab 20%</li>
      <li><span style="color:#38bdf8">Técnico</span>: Entrega 35% · Atividade 35% · Presença 20% · Collab 10%</li>
      <li><span style="color:#a78bfa">Não-técnico</span>: Entrega 30% · Atividade 20% · Presença 40% · Collab 10%</li>
    </ul>
  </details>
</section>

</div><!-- /container -->

<!-- Radar modal -->
<div id="radar-overlay" onclick="closeRadar(event)">
  <div id="radar-box">
    <button id="radar-close" onclick="closeRadar()">✕</button>
    <h3 id="radar-title"></h3>
    <canvas id="radarChart" width="340" height="300"></canvas>
  </div>
</div>

<script>
const LABELS = [${chartNames}];
const BLUE='rgba(56,189,248,.8)', GREEN='rgba(34,197,94,.8)', PURPLE='rgba(168,85,247,.8)',
      ORANGE='rgba(251,146,60,.8)', PINK='rgba(236,72,153,.8)', YELLOW='rgba(250,204,21,.8)';

const opts = color => ({
  indexAxis:'y', responsive:true,
  plugins:{ legend:{ display:false } },
  scales:{
    x:{ ticks:{ color:'#94a3b8' }, grid:{ color:'#1e293b' } },
    y:{ ticks:{ color:'#e2e8f0', font:{ size:10 } }, grid:{ display:false } }
  }
});
function bar(id, data, color) {
  new Chart(document.getElementById(id), {
    type:'bar',
    data:{ labels:LABELS, datasets:[{ data, backgroundColor:color, borderRadius:4 }] },
    options:opts(color)
  });
}
bar('chartScore',    [${chartScores}],   BLUE);
bar('chartCards',    [${chartCards}],    GREEN);
bar('chartCommits',  [${chartCommits}],  PURPLE);
bar('chartMeetings', [${chartMeetings}], ORANGE);
bar('chartDiscord',  [${chartDiscord}],  PINK);
bar('chartDrive',    [${chartDrive}],    YELLOW);

// Filter
function filter(role) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.querySelectorAll('#main-table tbody tr').forEach(row => {
    row.classList.toggle('hidden', role !== 'all' && row.dataset.role !== role);
  });
}

// Radar
const RADAR_DATA = ${radarData};
let radarInstance = null;
function showRadar(id) {
  const d = RADAR_DATA[id]; if (!d) return;
  document.getElementById('radar-title').textContent = d.name;
  document.getElementById('radar-overlay').classList.add('show');
  if (radarInstance) radarInstance.destroy();
  radarInstance = new Chart(document.getElementById('radarChart'), {
    type: 'radar',
    data: {
      labels: ['Entrega', 'Atividade', 'Presença', 'Colaboração'],
      datasets: [{
        data: [d.delivery, d.activity, d.presence, d.collab],
        backgroundColor: 'rgba(56,189,248,.15)',
        borderColor: '#38bdf8',
        pointBackgroundColor: '#38bdf8',
        borderWidth: 2
      }]
    },
    options: {
      scales: { r: {
        min: 0, max: 100,
        ticks: { color:'#475569', stepSize:25 },
        grid: { color:'#334155' },
        pointLabels: { color:'#94a3b8', font:{ size:12 } }
      }},
      plugins: { legend:{ display:false } }
    }
  });
}
function closeRadar(e) {
  if (!e || e.target === document.getElementById('radar-overlay') || e.type === 'click' && !e.target.closest('#radar-box')) {
    document.getElementById('radar-overlay').classList.remove('show');
  }
}
document.getElementById('radar-close').addEventListener('click', () => {
  document.getElementById('radar-overlay').classList.remove('show');
});
</script>
</body>
</html>`;
}
