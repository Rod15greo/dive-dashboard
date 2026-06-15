import { User } from '../types';
import { logout, triggerRefresh } from '../api';

interface Props {
  user: User;
  connected: boolean;
  loading: boolean;
  updatedAt: string | null;
}

export default function Header({ user, connected, loading, updatedAt }: Props) {
  const formatted = updatedAt
    ? new Date(updatedAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : null;

  return (
    <header style={s.header}>
      <div style={s.left}>
        <span style={s.logo}>📊</span>
        <div>
          <h1 style={s.title}>Dashboard de Engajamento</h1>
          <p style={s.subtitle}>Dive Smart Factory · Fórmula v2</p>
        </div>
      </div>

      <div style={s.right}>
        {/* SSE status dot */}
        <div style={s.status}>
          <span style={{ ...s.dot, background: connected ? '#22c55e' : '#ef4444' }} />
          <span style={s.statusText}>{connected ? 'Ao vivo' : 'Desconectado'}</span>
        </div>

        {formatted && (
          <span style={s.updated}>Atualizado {formatted}</span>
        )}

        <button
          style={{ ...s.btn, opacity: loading ? 0.5 : 1 }}
          onClick={triggerRefresh}
          disabled={loading}
          title="Atualizar dados agora"
        >
          {loading ? '⟳ Atualizando...' : '⟳ Atualizar'}
        </button>

        <div style={s.user}>
          {user.picture && (
            <img src={user.picture} alt={user.name} style={s.avatar} />
          )}
          <div style={s.userInfo}>
            <span style={s.userName}>{user.name}</span>
            <button style={s.logoutBtn} onClick={logout}>Sair</button>
          </div>
        </div>
      </div>
    </header>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: {
    background: 'linear-gradient(135deg, #1e3a5f, #0f2d4a)',
    borderBottom: '2px solid #334155',
    padding: '12px 28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  left: { display: 'flex', alignItems: 'center', gap: 14 },
  logo: { fontSize: '1.8rem' },
  title: { fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8' },
  subtitle: { fontSize: '0.78rem', color: '#64748b', marginTop: 2 },
  right: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  status: { display: 'flex', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'block' },
  statusText: { fontSize: '0.78rem', color: '#64748b' },
  updated: { fontSize: '0.78rem', color: '#475569' },
  btn: {
    background: '#1e3a5f',
    border: '1px solid #38bdf8',
    color: '#38bdf8',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: '0.82rem',
    fontWeight: 600,
    transition: 'background .15s',
  },
  user: { display: 'flex', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: '50%', border: '2px solid #334155' },
  userInfo: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  userName: { fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0' },
  logoutBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: '0.72rem',
    padding: 0,
    cursor: 'pointer',
  },
};
