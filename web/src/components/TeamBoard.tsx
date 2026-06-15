import { TeamStatus, TeamClassification, TeamMemberDelivery, TeamSprintSummary } from '../types';

interface Props {
  teams: TeamStatus[];
  onSelectMember: (id: string) => void;
}

const CLASS_CONFIG: Record<TeamClassification, { label: string; border: string; bg: string; fg: string }> = {
  otimo:     { label: 'Ótimo',     border: '#22c55e', bg: '#166534', fg: '#4ade80' },
  bom:       { label: 'Bom',       border: '#38bdf8', bg: '#1e3a5f', fg: '#7dd3fc' },
  ruim:      { label: 'Ruim',      border: '#fbbf24', bg: '#713f12', fg: '#fde68a' },
  critico:   { label: 'Crítico',   border: '#ef4444', bg: '#7f1d1d', fg: '#fca5a5' },
  'sem-dados':{ label: 'Sem dados', border: '#475569', bg: '#1e293b', fg: '#94a3b8' },
};

function sprintColor(rate: number) {
  if (rate >= 85) return '#4ade80';
  if (rate >= 65) return '#38bdf8';
  if (rate >= 40) return '#fbbf24';
  return '#f87171';
}

function healthIcon(m: TeamMemberDelivery): { icon: string; color: string; hint: string } {
  if (m.currentInReview > 0) return { icon: '●', color: '#4ade80',  hint: 'Em revisão' };
  if (m.currentInProgress > 0) return { icon: '●', color: '#fbbf24', hint: 'Em progresso' };
  if (m.currentDone > 0)       return { icon: '●', color: '#38bdf8', hint: 'Concluiu tasks' };
  if (m.hasCurrentTask)        return { icon: '●', color: '#94a3b8', hint: 'Task atribuída' };
  return { icon: '●', color: '#ef4444', hint: 'Sem task na sprint atual' };
}

function MiniSprintBar({ summary }: { summary: TeamSprintSummary }) {
  const rate = summary.avgDeliveryRate;
  const color = summary.isCurrent ? '#334155' : sprintColor(rate);
  const label = summary.sprintTitle.replace(/sprint\s*/i, 'S').split(' ')[0];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: '0.68rem', color: '#64748b', width: 28, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 7, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
        {summary.isCurrent
          ? <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(45deg,#1e3a5f,#1e3a5f 3px,#0f172a 3px,#0f172a 6px)', borderRadius: 3 }} />
          : <div style={{ width: `${rate}%`, height: '100%', background: color, borderRadius: 3 }} />
        }
      </div>
      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: summary.isCurrent ? '#64748b' : color, width: 32, textAlign: 'right' }}>
        {summary.isCurrent ? '…' : `${Math.round(rate)}%`}
      </span>
    </div>
  );
}

function TeamCard({ team, onSelectMember }: { team: TeamStatus; onSelectMember: (id: string) => void }) {
  const cfg = CLASS_CONFIG[team.classification];
  const completedSprints = team.sprintSummaries.filter(s => s.isPast && s.hasData);
  const currentSprint    = team.sprintSummaries.find(s => s.isCurrent);

  return (
    <div style={{ background: '#1e293b', borderRadius: 12, border: `2px solid ${cfg.border}`, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#e2e8f0' }}>{team.name}</div>
          {team.leaderName && <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>Líder: {team.leaderName}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ background: cfg.bg, color: cfg.fg, padding: '3px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700 }}>
            {cfg.label}
          </span>
          {team.historicalAvg >= 0 && (
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: cfg.fg, marginTop: 4 }}>
              {Math.round(team.historicalAvg)}%
            </div>
          )}
          {team.historicalAvg < 0 && (
            <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 4 }}>sem histórico</div>
          )}
        </div>
      </div>

      {/* Sprint velocity history */}
      {completedSprints.length > 0 && (
        <div>
          <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Histórico de entregas</div>
          {completedSprints.map(s => <MiniSprintBar key={s.sprintId} summary={s} />)}
          {currentSprint && <MiniSprintBar key={currentSprint.sprintId} summary={currentSprint} />}
        </div>
      )}

      {/* Current sprint health */}
      <div>
        <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Sprint atual {currentSprint ? `— ${currentSprint.sprintTitle.split(' ').slice(0, 2).join(' ')}` : ''}
        </div>
        {team.members.map(m => {
          const { icon, color, hint } = healthIcon(m);
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #0f172a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span title={hint} style={{ color, fontSize: '0.7rem' }}>{icon}</span>
                <button
                  onClick={() => onSelectMember(m.id)}
                  style={{ background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.82rem', padding: 0 }}
                >
                  {m.name}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {m.missingSprints?.length > 0 && (
                  <span title={`Sem tasks em: ${m.missingSprints.join(', ')}`} style={{ fontSize: '0.68rem', color: '#f87171', background: '#2d1515', padding: '1px 5px', borderRadius: 4 }}>
                    🚨{m.missingSprints.join(', ')}
                  </span>
                )}
                {m.overdue > 0 && (
                  <span title={`${m.overdue} task(s) atrasada(s)`} style={{ fontSize: '0.68rem', color: '#f87171', background: '#2d1515', padding: '1px 5px', borderRadius: 4 }}>
                    ⚠{m.overdue}
                  </span>
                )}
                {m.historicalRate >= 0 && (
                  <span style={{ fontSize: '0.72rem', color: sprintColor(m.historicalRate), fontWeight: 600 }}>
                    {Math.round(m.historicalRate)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Alerta: sprints passadas sem tasks atribuídas */}
      {team.sprintsWithoutAssignment?.length > 0 && (
        <div style={{ background: '#1c0f0f', border: '1px solid #7f1d1d', borderRadius: 6, padding: '7px 10px', fontSize: '0.75rem' }}>
          <span style={{ color: '#f87171', fontWeight: 600 }}>🚨 Líder não atribuiu tasks: </span>
          <span style={{ color: '#fca5a5' }}>{team.sprintsWithoutAssignment.join(', ')}</span>
        </div>
      )}

      {/* Alerta: membros sem task na sprint atual */}
      {team.leaderId && team.membersWithoutCurrentTask.length > 0 && (
        <div style={{ background: '#2d1b00', border: '1px solid #92400e', borderRadius: 6, padding: '7px 10px', fontSize: '0.75rem' }}>
          <span style={{ color: '#fbbf24', fontWeight: 600 }}>⚠ Sem task agora: </span>
          <span style={{ color: '#fde68a' }}>{team.membersWithoutCurrentTask.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

export default function TeamBoard({ teams, onSelectMember }: Props) {
  if (!teams || teams.length === 0) return null;

  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={s.heading}>Quadro de Equipes</h2>
      <p style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: 12 }}>
        Classificação baseada na média das sprints concluídas. Sprint atual mostra saúde (em andamento).
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {(Object.entries(CLASS_CONFIG) as [TeamClassification, typeof CLASS_CONFIG[TeamClassification]][])
          .filter(([k]) => k !== 'sem-dados')
          .map(([key, cfg]) => (
            <span key={key} style={{ fontSize: '0.72rem', color: cfg.fg, background: cfg.bg, padding: '2px 10px', borderRadius: 999 }}>
              {cfg.label} {key === 'otimo' ? '≥85%' : key === 'bom' ? '≥65%' : key === 'ruim' ? '≥40%' : '<40%'}
            </span>
          ))}
        <span style={{ fontSize: '0.72rem', color: '#4ade80' }}>● rev</span>
        <span style={{ fontSize: '0.72rem', color: '#fbbf24' }}>● prog</span>
        <span style={{ fontSize: '0.72rem', color: '#ef4444' }}>● sem task</span>
        <span style={{ fontSize: '0.72rem', color: '#f87171' }}>⚠N atrasadas</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 16 }}>
        {teams.map(t => <TeamCard key={t.id} team={t} onSelectMember={onSelectMember} />)}
      </div>
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { fontSize: '1.1rem', color: '#38bdf8', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #1e3a5f' },
};
