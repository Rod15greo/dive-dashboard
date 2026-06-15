import { Bar } from 'react-chartjs-2';
import { Chart, BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { DashboardMember, TeamStatus } from '../types';

Chart.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface Props { members: DashboardMember[]; teams?: TeamStatus[] }

const TEAM_COLORS = [
  'rgba(56,189,248,.8)',   // azul
  'rgba(34,197,94,.8)',    // verde
  'rgba(168,85,247,.8)',   // roxo
  'rgba(251,146,60,.8)',   // laranja
  'rgba(236,72,153,.8)',   // rosa
  'rgba(250,204,21,.8)',   // amarelo
];

export default function Charts({ members, teams }: Props) {
  const nonLeaders = members.filter(m => m.scoreRole !== 'leadership');
  const sorted = [...nonLeaders].sort((a, b) => b.breakdown.score - a.breakdown.score);
  const labels = sorted.map(m => m.name);

  const chartOpts = () => ({
    indexAxis: 'y' as const,
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
      y: { ticks: { color: '#e2e8f0', font: { size: 10 } }, grid: { display: false } },
    },
  });

  const ds = (data: number[], color: string) => ({
    labels,
    datasets: [{ data, backgroundColor: color, borderRadius: 4 }],
  });

  // Gráfico de velocidade por equipe (sprints concluídas)
  const sprintVelocityChart = () => {
    if (!teams || teams.length === 0) return null;
    const completedSprints = teams[0]?.sprintSummaries.filter(s => !s.isCurrent) ?? [];
    if (completedSprints.length === 0) return null;

    const sprintLabels = completedSprints.map(s =>
      s.sprintTitle.replace(/sprint\s*/i, 'S').split(' ').slice(0, 2).join(' ')
    );

    const datasets = teams.map((team, i) => ({
      label: team.name,
      data: completedSprints.map(sprint => {
        const ts = team.sprintSummaries.find(s => s.sprintId === sprint.sprintId);
        return ts ? Math.round(ts.avgDeliveryRate) : 0;
      }),
      backgroundColor: TEAM_COLORS[i % TEAM_COLORS.length],
      borderRadius: 4,
    }));

    return {
      labels: sprintLabels,
      datasets,
    };
  };

  const velocityData = sprintVelocityChart();

  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={s.heading}>Gráficos por Métrica</h2>

      {/* Sprint Velocity */}
      {velocityData && (
        <ChartBox title="Velocidade de Entrega por Equipe (sprints concluídas)" fullWidth>
          <Bar
            data={velocityData}
            options={{
              responsive: true,
              plugins: {
                legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } },
              },
              scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
                y: { min: 0, max: 100, ticks: { color: '#94a3b8', callback: v => `${v}%` }, grid: { color: '#1e293b' } },
              },
            }}
          />
        </ChartBox>
      )}

      <div style={s.grid}>
        <ChartBox title="Score (0–100)">
          <Bar data={ds(sorted.map(m => m.breakdown.score), 'rgba(56,189,248,.8)')} options={chartOpts()} />
        </ChartBox>
        <ChartBox title="Cards Concluídos">
          <Bar data={ds(sorted.map(m => m.cardsDone), 'rgba(34,197,94,.8)')} options={chartOpts()} />
        </ChartBox>
        <ChartBox title="Commits no Repositório">
          <Bar data={ds(sorted.map(m => m.commits), 'rgba(168,85,247,.8)')} options={chartOpts()} />
        </ChartBox>
        <ChartBox title="Mensagens no Discord">
          <Bar data={ds(sorted.map(m => m.discord), 'rgba(236,72,153,.8)')} options={chartOpts()} />
        </ChartBox>
        <ChartBox title="Arquivos no Drive">
          <Bar data={ds(sorted.map(m => m.drive), 'rgba(250,204,21,.8)')} options={chartOpts()} />
        </ChartBox>
        <ChartBox title="Taxa de Entrega Histórica (%)">
          <Bar
            data={{
              labels,
              datasets: [{
                data: sorted.map(m => m.historicalDeliveryRate >= 0 ? Math.round(m.historicalDeliveryRate) : 0),
                backgroundColor: sorted.map(m =>
                  m.historicalDeliveryRate >= 85 ? 'rgba(34,197,94,.8)' :
                  m.historicalDeliveryRate >= 65 ? 'rgba(56,189,248,.8)' :
                  m.historicalDeliveryRate >= 40 ? 'rgba(251,146,60,.8)' :
                  m.historicalDeliveryRate >= 0  ? 'rgba(239,68,68,.8)'  : 'rgba(71,85,105,.5)'
                ),
                borderRadius: 4,
              }],
            }}
            options={{
              ...chartOpts(),
              scales: {
                ...chartOpts().scales,
                x: { ...chartOpts().scales.x, max: 100, ticks: { ...chartOpts().scales.x.ticks, callback: (v: any) => `${v}%` } },
              },
            }}
          />
        </ChartBox>
      </div>
    </section>
  );
}

function ChartBox({ title, children, fullWidth }: { title: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div style={{ ...s.box, ...(fullWidth ? { gridColumn: '1 / -1', marginBottom: 16 } : {}) }}>
      <h3 style={s.boxTitle}>{title}</h3>
      {children}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { fontSize: '1.1rem', color: '#38bdf8', marginBottom: 14, paddingBottom: 6, borderBottom: '1px solid #1e3a5f' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  box: { background: '#1e293b', borderRadius: 12, padding: 18 },
  boxTitle: { fontSize: '0.88rem', color: '#94a3b8', marginBottom: 14 },
};
