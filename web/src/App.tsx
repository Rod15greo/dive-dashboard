import { useEffect, useState } from 'react';
import { User } from './types';
import { fetchMe } from './api';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

export default function App() {
  const [user, setUser] = useState<User | null | 'loading'>('loading');

  useEffect(() => {
    fetchMe().then(u => setUser(u));
  }, []);

  if (user === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: '#38bdf8', fontSize: '1.1rem' }}>Carregando...</div>
      </div>
    );
  }

  if (!user) return <Login />;

  return <Dashboard user={user} />;
}
