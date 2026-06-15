import { useEffect, useRef } from 'react';
import { Chart, RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip } from 'chart.js';
import { DashboardMember, ScoreRole, SprintRecord } from '../types';

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

interface Props {
  member: DashboardMember | null;
  onClose: () => void;
}

const ROLE_LABELS: Record<ScoreRole, string> = {
  technical: 'Técnico', nontechnical: 'Não-técnico', leadership: 'Liderança',
};
const ROLE_COLORS: Record<ScoreRole, [string, string]> = {
  technical:    ['#1e3a5f', '#38bdf8'],
  nontechnical: ['#2d1b4e', '#a78bfa'],
  leadership:   ['#1c2a1c', '#4ade80'],
};

function scoreBg(s: number) {
  if (s >= 75) return '#166534'; if (s >= 60) return '#1e3a5f';
  if (s >= 45) return '#713f12'; return '#7f1d1d';
}
function scoreFg(s: number) {
  if (s >= 75) return '#4ade80'; if (s >= 60) return '#38bdf8';
  if (s >= 45) return '#fbbf24'; return '#f87171';
}
function rateColor(r: number) {
  if (r >= 85) return '#4ade80'; if (r >= 65) return '#38bdf8';
  if (r >= 40) return '#fbbf24'; return '#f87171';
}

function StatBox({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 1 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.65rem', color: '#475569' }}>{sub}</div>}
    </div>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ background: '#0f172a', borderRadius: 3, height: 5, overflow: 'hidden', marginTop: 3 }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  );
}

function SprintTable({ history }: { history: SprintRecord[] }) {
  const rows = history.filter(s => !s.isFuture && (s.assigned > 0 || s.isCurrent));
  const firstTaskIdx = history.findIndex(s => s.assigned > 0);
  const missingSprints = firstTaskIdx === -1 ? [] :
    history.slice(firstTaskIdx).filter(s => s.isPast && s.assigned === 0);
  if (rows.length === 0 && missingSprints.length === 0) return <p style={{ color: '#475569', fontSize: '0.78rem' }}>Nenhuma sprint com tasks atribuídas ainda.</p>;

  return (
    <>
    {missingSprints.length > 0 && (
      <div style={{ background: '#1c0f0f', border: '1px solid #7f1d1d', borderRadius: 6, padding: '7px 10px', marginBottom: 8, fontSize: '0.75rem' }}>
        <span style={{ color: '#f87171', fontWeight: 600 }}>🚨 Sem tasks atribuídas: </span>
        <span style={{ color: '#fca5a5' }}>
          {missingSprints.map(s => s.sprintTitle.replace(/sprint\s*/i, 'S').split(' ').slice(0,2).join(' ')).join(', ')}
        </span>
      </div>
    )}
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
      <thead>
        <tr>
          {['Sprint', 'Atribuídas', 'Feitas', 'Taxa'].map(h => (
            <th key={h} style={{ textAlign: 'left', color: '#64748b', padding: '4px 6px', fontWeight: 600, borderBottom: '1px solid #1e293b' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(s => {
          const label = s.sprintTitle.replace(/sprint\s*/i, 'S');
          const color = s.isCurrent ? '#64748b' : rateColor(s.deliveryRate);
          return (
            <tr key={s.sprintId}>
              <td style={{ padding: '5px 6px', color: '#e2e8f0', borderBottom: '1px solid #0f172a' }}>
                {label} {s.isCurrent && <span style={{ fontSize: '0.65rem', background: '#1e3a5f', color: '#38bdf8', borderRadius: 3, padding: '1px 5px', marginLeft: 4 }}>atual</span>}
              </td>
              <td style={{ padding: '5px 6px', color: '#94a3b8', borderBottom: '1px solid #0f172a', textAlign: 'center' }}>{s.assigned}</td>
              <td style={{ padding: '5px 6px', color: '#94a3b8', borderBottom: '1px solid #0f172a', textAlign: 'center' }}>{s.done}</td>
              <td style={{ padding: '5px 6px', fontWeight: 700, color, borderBottom: '1px solid #0f172a', textAlign: 'center' }}>
                {s.isCurrent ? '…' : `${Math.round(s.deliveryRate)}%`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </>
  );
}

export default function MemberModal({ member, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!member || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const bd = member.breakdown;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'radar',
      data: {
        labels: ['Entrega', 'Atividade', 'Colaboração'],
        datasets: [{
          data: [Math.round(bd.deliveryPts), Math.round(bd.activityPts), Math.round(bd.collabPts)],
          backgroundColor: 'rgba(56,189,248,.12)',
          borderColor: '#38bdf8',
          pointBackgroundColor: '#38bdf8',
          borderWidth: 2,
        }],
      },
      options: {
        scales: {
          r: { min: 0, max: 100, ticks: { color: '#475569', stepSize: 25 }, grid: { color: '#334155' }, pointLabels: { color: '#94a3b8', font: { size: 11 } } },
        },
        plugins: { legend: { display: false } },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [member]);

  if (!member) return null;

  const bd = member.breakdown;
  const [roleBg, roleFg] = ROLE_COLORS[member.scoreRole];
  const currentSprint = member.sprintHistory.find(s => s.isCurrent);
  const inProgressTotal = member.cardsInProgress + member.cardsInReview;

  const dims = [
    { label: 'Entrega',     pts: bd.deliveryPts, w: bd.weights.delivery, color: '#4ade80',
      sub: member.historicalDeliveryRate >= 0 ? `${Math.round(member.historicalDeliveryRate)}% média hist.` : 'snapshot' },
    { label: 'Atividade',   pts: bd.activityPts, w: bd.weights.activity, color: '#38bdf8', sub: '' },
    { label: 'Colaboração', pts: bd.collabPts,   w: bd.weights.collab,   color: '#fb923c', sub: '' },
  ];

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.box} onClick={e => e.stopPropagation()}>
        <button style={s.close} onClick={onClose}>✕</button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>{member.name}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{member.role}</span>
              <span style={{ background: roleBg, color: roleFg, padding: '1px 8px', borderRadius: 4, fontSize: '0.72rem' }}>{ROLE_LABELS[member.scoreRole]}</span>
            </div>
          </div>
          {member.historicalDeliveryRate === -1 ? (
            <span style={{ background: '#1e293b', color: '#64748b', padding: '4px 12px', borderRadius: 999, fontSize: '0.78rem', border: '1px solid #334155', flexShrink: 0 }}>
              Em avaliação
            </span>
          ) : (
            <span style={{ background: scoreBg(bd.score), color: scoreFg(bd.score), padding: '4px 14px', borderRadius: 999, fontWeight: 700, fontSize: '1.1rem', flexShrink: 0 }}>
              {bd.score}
            </span>
          )}
        </div>
        {member.historicalDeliveryRate === -1 && (
          <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.78rem', color: '#64748b', borderLeft: '3px solid #334155' }}>
            Sem sprints concluídas ainda. Score disponível a partir da próxima sprint encerrada.
          </div>
        )}

        {/* Sprint history */}
        <div style={{ marginBottom: 16 }}>
          <div style={s.sectionLabel}>Histórico de Sprints</div>
          <SprintTable history={member.sprintHistory} />
          {member.historicalDeliveryRate >= 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, padding: '6px 6px', background: '#0f172a', borderRadius: 6 }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Média histórica (sprints concluídas)</span>
              <span style={{ fontWeight: 700, color: rateColor(member.historicalDeliveryRate), fontSize: '0.9rem' }}>
                {Math.round(member.historicalDeliveryRate)}%
              </span>
            </div>
          )}
        </div>

        {/* Sprint atual */}
        <div style={{ marginBottom: 16 }}>
          <div style={s.sectionLabel}>Sprint Atual</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <StatBox label="Feitas" value={currentSprint?.done ?? member.cardsDone} color="#4ade80" />
            <StatBox label="Em Progresso" value={currentSprint?.inProgress ?? inProgressTotal} color="#fbbf24" sub="sprint atual" />
            <StatBox label="Atrasadas" value={member.cardsOverdue} color="#f87171" sub="sprint anterior" />
          </div>
        </div>

        {/* Atividade */}
        <div style={{ marginBottom: 16 }}>
          <div style={s.sectionLabel}>Atividade</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {member.technical
              ? <StatBox label="Commits" value={member.commits} color="#a78bfa" />
              : <StatBox label="Drive" value={member.drive} color="#a78bfa" />
            }
            <StatBox label="Discord" value={member.discord} color="#fb923c" />
          </div>
        </div>

        {/* Score dimensions */}
        <div style={{ marginBottom: 16 }}>
          <div style={s.sectionLabel}>Dimensões do Score</div>
          {dims.map(d => (
            <div key={d.label} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <span style={{ color: d.color }}>{d.label} {d.sub && <small style={{ color: '#475569' }}>({d.sub})</small>}</span>
                <span style={{ color: '#94a3b8' }}>{Math.round(d.pts)}pts × {d.w} = <strong style={{ color: '#e2e8f0' }}>{Math.round(d.pts * d.w)}</strong></span>
              </div>
              <Bar value={d.pts} color={d.color} />
            </div>
          ))}
        </div>

        {/* Radar */}
        <canvas ref={canvasRef} style={{ maxWidth: 240, margin: '0 auto', display: 'block' }} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto' },
  box: { background: '#1e293b', borderRadius: 16, padding: '24px 28px', maxWidth: 460, width: '100%', position: 'relative', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' },
  close: { position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' },
  sectionLabel: { fontSize: '0.68rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 },
};
