import { useState } from 'react';
import { User, DashboardMember } from '../types';
import { useDashboard } from '../hooks/useDashboard';
import Header from './Header';
import KpiCards from './KpiCards';
import ScoreTable from './ScoreTable';
import Charts from './Charts';
import TeamBoard from './TeamBoard';
import MemberModal from './MemberModal';

interface Props { user: User }

export default function Dashboard({ user }: Props) {
  const { data, loading, connected, error } = useDashboard();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const selectedMember: DashboardMember | null =
    selectedMemberId ? (data?.members.find(m => m.id === selectedMemberId) ?? null) : null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header
        user={user}
        connected={connected}
        loading={loading}
        updatedAt={data?.generatedAt ?? null}
      />

      <div style={s.container}>
        {loading && !data && (
          <div style={s.loadingBox}>
            <div style={s.spinner} />
            <p style={s.loadingText}>
              Coletando dados do GitHub, Discord, Fireflies e Calendar...<br />
              <small style={{ color: '#475569' }}>Isso pode levar 30–60 segundos na primeira vez.</small>
            </p>
          </div>
        )}

        {error && (
          <div style={s.errorBox}>
            ⚠ Erro ao atualizar: {error}
          </div>
        )}

        {data && data.members && (
          <>
            <div style={s.metaBar}>
              <span style={s.meta}>
                {data.totalMeetings} reuniões analisadas · {data.members.length} membros
              </span>
              {loading && <span style={s.refreshingTag}>⟳ Atualizando...</span>}
            </div>

            <KpiCards members={data.members} />
            <RiskSection members={data.members} onSelectMember={setSelectedMemberId} />
            <TeamBoard teams={data.teams ?? []} onSelectMember={setSelectedMemberId} />
            <ScoreTable members={data.members} onSelectMember={m => setSelectedMemberId(m.id)} />
            <Charts members={data.members} teams={data.teams} />
            <FormulaLegend />
          </>
        )}
      </div>

      <MemberModal member={selectedMember} onClose={() => setSelectedMemberId(null)} />
    </div>
  );
}

function RiskSection({ members, onSelectMember }: { members: DashboardMember[]; onSelectMember: (id: string) => void }) {
  const atRisk = members.filter(m =>
    m.historicalDeliveryRate !== -1 && (
      m.breakdown.score < 45 ||
      (m.cardsDone === 0 && m.cardsInProgress === 0 && m.cardsInReview === 0)
    )
  );
  if (atRisk.length === 0) return null;

  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: '1.1rem', color: '#38bdf8', marginBottom: 14, paddingBottom: 6, borderBottom: '1px solid #1e3a5f' }}>
        Atenção — membros que podem precisar de suporte
      </h2>
      <div style={{ background: '#1c0f0f', border: '1px solid #7f1d1d', borderRadius: 10, padding: 18 }}>
        <h3 style={{ color: '#f87171', marginBottom: 12, fontSize: '0.95rem' }}>
          ⚠ {atRisk.length} pessoa{atRisk.length > 1 ? 's' : ''} identificada{atRisk.length > 1 ? 's' : ''}
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              {['Pessoa', 'Role', 'Motivo'].map(h => (
                <th key={h} style={{ textAlign: 'left', color: '#64748b', padding: '6px 8px', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {atRisk.map(m => {
              const reasons: string[] = [];
              if (m.breakdown.score < 45) reasons.push(`Score baixo (${m.breakdown.score})`);
              if (m.cardsDone === 0 && m.cardsInProgress === 0 && m.cardsInReview === 0)
                reasons.push('Zero cards ativos');
              return (
                <tr key={m.id}>
                  <td style={{ padding: '8px 8px', borderBottom: '1px solid #2d1515' }}>
                    <button onClick={() => onSelectMember(m.id)} style={{ background: 'none', border: 'none', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: '0.85rem' }}>{m.name}</button>
                  </td>
                  <td style={{ padding: '8px 8px', borderBottom: '1px solid #2d1515', color: '#94a3b8' }}>{m.role}</td>
                  <td style={{ padding: '8px 8px', borderBottom: '1px solid #2d1515', color: '#fca5a5' }}>{reasons.join(' · ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FormulaLegend() {
  return (
    <section style={{ marginBottom: 40 }}>
      <details style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}>
        <summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '0.88rem', fontWeight: 600 }}>
          Ver detalhes da fórmula v2
        </summary>
        <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: 12, lineHeight: 1.7 }}>
          <p><strong style={{ color: '#e2e8f0' }}>3 dimensões (reuniões desativadas temporariamente):</strong></p>
          <ul style={{ marginLeft: 16 }}>
            <li><span style={{ color: '#4ade80' }}>Entrega</span> — taxa Done/Total de cards</li>
            <li><span style={{ color: '#38bdf8' }}>Atividade</span> — técnicos: log(commits); não-técnicos: Drive (60%) + Discord (40%)</li>
            <li><span style={{ color: '#fb923c' }}>Colaboração</span> — Discord capeado em 80 msgs</li>
          </ul>
          <p style={{ marginTop: 8 }}><strong style={{ color: '#e2e8f0' }}>Pesos:</strong> Técnico (45/45/10%) · Liderança (40/30/30%) · Não-técnico (45/30/25%)</p>
        </div>
      </details>
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { maxWidth: 1300, margin: '0 auto', padding: '28px 20px' },
  loadingBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '80px 0' },
  spinner: { width: 40, height: 40, border: '3px solid #1e293b', borderTop: '3px solid #38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  loadingText: { color: '#94a3b8', textAlign: 'center', lineHeight: 1.7 },
  errorBox: { background: '#2d1515', border: '1px solid #7f1d1d', borderRadius: 10, padding: '12px 16px', color: '#fca5a5', fontSize: '0.88rem', marginBottom: 24 },
  metaBar: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 },
  meta: { color: '#64748b', fontSize: '0.82rem' },
  refreshingTag: { color: '#38bdf8', fontSize: '0.82rem', background: '#1e3a5f', padding: '2px 10px', borderRadius: 20 },
};
