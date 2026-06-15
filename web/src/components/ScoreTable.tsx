import { useState } from 'react';
import { DashboardMember, ScoreRole } from '../types';

interface Props {
  members: DashboardMember[];
  onSelectMember: (m: DashboardMember) => void;
}

type FilterRole = 'all' | ScoreRole;

const ROLE_LABELS: Record<ScoreRole, string> = {
  technical: 'Técnico', nontechnical: 'Não-técnico', leadership: 'Liderança',
};
const ROLE_COLORS: Record<ScoreRole, [string, string]> = {
  technical:    ['#1e3a5f', '#38bdf8'],
  nontechnical: ['#2d1b4e', '#a78bfa'],
  leadership:   ['#1c2a1c', '#4ade80'],
};

function scoreBg(s: number): string {
  if (s >= 75) return '#166534';
  if (s >= 60) return '#1e3a5f';
  if (s >= 45) return '#713f12';
  return '#7f1d1d';
}
function scoreFg(s: number): string {
  if (s >= 75) return '#4ade80';
  if (s >= 60) return '#38bdf8';
  if (s >= 45) return '#fbbf24';
  return '#f87171';
}

function MiniBar({ bd }: { bd: DashboardMember['breakdown'] }) {
  const w = bd.weights;
  const segs = [
    { v: bd.deliveryPts * w.delivery, c: '#4ade80', label: `Entrega: ${Math.round(bd.deliveryPts)}pts × ${w.delivery}` },
    { v: bd.activityPts * w.activity, c: '#38bdf8', label: `Atividade: ${Math.round(bd.activityPts)}pts × ${w.activity}` },
    { v: bd.collabPts   * w.collab,   c: '#fb923c', label: `Colaboração: ${Math.round(bd.collabPts)}pts × ${w.collab}` },
  ];
  return (
    <div style={{ display: 'flex', gap: 2, width: 90 }} title={segs.map(s => s.label).join('\n')}>
      {segs.map((seg, i) => (
        <div key={i} style={{ height: 8, flex: Math.max(seg.v, 0.1), background: seg.c, borderRadius: 2 }} />
      ))}
    </div>
  );
}

export default function ScoreTable({ members, onSelectMember }: Props) {
  const [filter, setFilter] = useState<FilterRole>('all');
  const [sortKey, setSortKey] = useState<'score' | 'name' | 'cards'>('score');
  const [sortAsc, setSortAsc] = useState(false);

  // Líderes ficam no Quadro de Equipes; aqui mostramos apenas técnicos e não-técnicos
  const nonLeaders = members.filter(m => m.scoreRole !== 'leadership');

  const filtered = nonLeaders
    .filter(m => filter === 'all' || m.scoreRole === filter)
    .sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === 'score')       { va = a.breakdown.score; vb = b.breakdown.score; }
      else if (sortKey === 'name')   { va = a.name; vb = b.name; }
      else                           { va = a.cardsDone; vb = b.cardsDone; }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ?  1 : -1;
      return 0;
    });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const Th = ({ label, sk }: { label: string; sk: typeof sortKey }) => (
    <th style={s.th} onClick={() => toggleSort(sk)}>
      {label}{sortKey === sk ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={s.heading}>Visão Geral da Equipe</h2>
      <p style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: 10 }}>Líderes aparecem no Quadro de Equipes acima. Clique no nome para ver o perfil completo.</p>

      {/* Filter buttons */}
      <div style={s.filters}>
        {(['all', 'technical', 'nontechnical'] as FilterRole[]).map(f => (
          <button
            key={f}
            style={{ ...s.filterBtn, ...(filter === f ? s.filterActive : {}) }}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Todos' : ROLE_LABELS[f as ScoreRole]}
          </button>
        ))}
      </div>

      <p style={{ color: '#475569', fontSize: '0.74rem', marginBottom: 10 }}>
        <span style={{ color: '#4ade80' }}>■</span> Entrega &nbsp;
        <span style={{ color: '#38bdf8' }}>■</span> Atividade &nbsp;
        <span style={{ color: '#fb923c' }}>■</span> Colaboração
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>
              <Th label="Pessoa" sk="name" />
              <th style={{ ...s.th, textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSort('score')}>
                Score {sortKey === 'score' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th style={{ ...s.th, textAlign: 'center' }}>Dimensões</th>
              <Th label="Done" sk="cards" />
              <th style={s.th}>Review</th>
              <th style={s.th}>Prog.</th>
              <th style={s.th}>Backlog</th>
              <th style={s.th}>Commits</th>
              <th style={s.th}>Discord</th>
              <th style={s.th}>Drive</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const [roleBg, roleFg] = ROLE_COLORS[m.scoreRole];
              const total = m.cardsDone + m.cardsInReview + m.cardsInProgress + (m.cardsOverdue ?? 0);
              const deliveryPct = m.historicalDeliveryRate >= 0
                ? Math.round(m.historicalDeliveryRate)
                : (total > 0 ? Math.round((m.cardsDone / total) * 100) : null);
              const deliveryLabel = m.historicalDeliveryRate >= 0 ? 'média hist.' : 'sprint atual';

              return (
                <tr key={m.id} style={s.row} onMouseEnter={e => (e.currentTarget.style.background = '#1a2744')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={s.td}>
                    <button style={s.nameBtn} onClick={() => onSelectMember(m)}>{m.name}</button>
                    <br />
                    <small style={{ color: '#64748b' }}>{m.role}</small>
                    <br />
                    <span style={{ background: roleBg, color: roleFg, padding: '1px 8px', borderRadius: 4, fontSize: '0.72rem' }}>
                      {ROLE_LABELS[m.scoreRole]}
                    </span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    {m.historicalDeliveryRate === -1 ? (
                      <span style={{ background: '#1e293b', color: '#64748b', padding: '2px 10px', borderRadius: 999, fontSize: '0.8rem', border: '1px solid #334155' }}>
                        Em avaliação
                      </span>
                    ) : (
                      <>
                        <span style={{ background: scoreBg(m.breakdown.score), color: scoreFg(m.breakdown.score), padding: '2px 10px', borderRadius: 999, fontWeight: 700, fontSize: '0.9rem' }}>
                          {m.breakdown.score}
                        </span>
                        {deliveryPct !== null && (
                          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 3 }}>{deliveryPct}% {deliveryLabel}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <MiniBar bd={m.breakdown} />
                  </td>
                  <td style={s.num}>{m.cardsDone}</td>
                  <td style={s.num}>{m.cardsInReview}</td>
                  <td style={s.num}>{m.cardsInProgress}</td>
                  <td style={s.num}>{m.cardsTodo > 0 ? <span style={{ color: '#64748b' }}>{m.cardsTodo}</span> : '—'}</td>
                  <td style={s.num}>{m.technical ? m.commits : <span style={s.naBadge}>N/A</span>}</td>
                  <td style={s.num}>{m.discord}</td>
                  <td style={s.num}>{m.drive}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { fontSize: '1.1rem', color: '#38bdf8', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #1e3a5f' },
  filters: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filterBtn: { background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '6px 16px', borderRadius: 20, fontSize: '0.82rem', cursor: 'pointer' },
  filterActive: { background: '#1e3a5f', color: '#38bdf8', borderColor: '#38bdf8' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { background: '#1e293b', color: '#94a3b8', padding: '10px 10px', textAlign: 'left', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  td: { padding: '10px 10px', borderBottom: '1px solid #1e293b', verticalAlign: 'middle' },
  num: { padding: '10px 10px', borderBottom: '1px solid #1e293b', textAlign: 'center', fontWeight: 600 },
  row: { transition: 'background .1s' },
  nameBtn: { background: 'none', border: 'none', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: '0.85rem' },
  naBadge: { color: '#475569', fontSize: '0.7rem', background: '#0f172a', padding: '1px 6px', borderRadius: 4 },
};
