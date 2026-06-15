import { useEffect, useState } from 'react';

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    const em  = params.get('email');
    if (err) setError(err);
    if (em)  setEmail(em);
  }, []);

  const errorMsg: Record<string, string> = {
    unauthorized: `O e-mail ${email ?? ''} não tem permissão de acesso. Apenas coordenadores podem entrar.`,
    auth_failed:  'Falha na autenticação. Tente novamente.',
    no_code:      'Autorização cancelada. Tente novamente.',
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>📊</div>
        <h1 style={s.title}>Dive Smart Factory</h1>
        <p style={s.subtitle}>Dashboard de Engajamento</p>
        <p style={s.description}>
          Acesso restrito aos coordenadores do projeto.
        </p>

        {error && (
          <div style={s.errorBox}>
            {errorMsg[error] ?? 'Erro desconhecido. Tente novamente.'}
          </div>
        )}

        <a href="/auth/google" style={s.googleBtn}>
          <GoogleIcon />
          Entrar com Google
        </a>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: 10 }}>
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
    </svg>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
    padding: 24,
  },
  card: {
    background: '#1e293b',
    borderRadius: 20,
    padding: '48px 40px',
    maxWidth: 400,
    width: '100%',
    textAlign: 'center',
    border: '1px solid #334155',
    boxShadow: '0 24px 64px rgba(0,0,0,.5)',
  },
  logo: { fontSize: '3rem', marginBottom: 16 },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: '0.95rem', color: '#38bdf8', marginBottom: 16 },
  description: { fontSize: '0.875rem', color: '#64748b', marginBottom: 32, lineHeight: 1.6 },
  errorBox: {
    background: '#2d1515',
    border: '1px solid #7f1d1d',
    borderRadius: 10,
    padding: '12px 16px',
    color: '#fca5a5',
    fontSize: '0.85rem',
    marginBottom: 24,
    lineHeight: 1.5,
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fff',
    color: '#1e293b',
    fontWeight: 600,
    fontSize: '0.95rem',
    padding: '12px 24px',
    borderRadius: 10,
    border: 'none',
    width: '100%',
    transition: 'opacity .15s',
    textDecoration: 'none',
  },
};
