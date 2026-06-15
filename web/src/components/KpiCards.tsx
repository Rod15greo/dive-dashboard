import { DashboardMember } from '../types';

interface Props { members: DashboardMember[] }

export default function KpiCards({ members }: Props) {
  const avgScore    = Math.round(members.reduce((s, m) => s + m.breakdown.score, 0) / members.length);
  const avgPresence = Math.round(members.reduce((s, m) => s + m.breakdown.presencePts, 0) / members.length);
  const avgDelivery = Math.round(members.reduce((s, m) => s + m.breakdown.deliveryPts, 0) / members.length);
  const atRiskList  = members.filter(m => m.breakdown.score < 45);

  return (
    <div style={s.grid}>
      <KpiCard value={avgScore}    label="Score médio"            accent="#38bdf8" />
      <KpiCard value={`${avgPresence}%`} label="Presença média"  accent="#22c55e" />
      <KpiCard value={`${avgDelivery}%`} label="Entrega média"   accent="#fbbf24" />
      <KpiCard
        value={atRiskList.length}
        label="Score < 45 (atenção)"
        accent="#ef4444"
        tooltip={atRiskList.length > 0 ? atRiskList.map(m => `${m.name} (${m.breakdown.score})`).join('\n') : undefined}
      />
    </div>
  );
}

function KpiCard({ value, label, accent, tooltip }: { value: number | string; label: string; accent: string; tooltip?: string }) {
  return (
    <div style={{ ...s.card, borderLeftColor: accent }} title={tooltip}>
      <div style={{ ...s.val, color: accent }}>{value}</div>
      <div style={s.label}>{label}</div>
      {tooltip && <div style={s.hint}>↑ passe o mouse</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 },
  card: {
    background: '#1e293b', borderRadius: 12, padding: '18px 20px',
    borderLeft: '4px solid transparent',
  },
  val: { fontSize: '1.9rem', fontWeight: 700, marginBottom: 4 },
  label: { fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)' },
  hint: { fontSize: '0.68rem', color: '#475569', marginTop: 4 },
};
