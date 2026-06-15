import { useEffect, useState } from 'react';
import { DashboardData } from '../types';

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/events');

    es.addEventListener('dashboard-update', (e: MessageEvent) => {
      setData(JSON.parse(e.data));
      setLoading(false);
      setError(null);
    });

    es.addEventListener('refresh-start', () => {
      setLoading(true);
    });

    es.addEventListener('refresh-error', (e: MessageEvent) => {
      setError(JSON.parse(e.data).error);
      setLoading(false);
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  return { data, loading, connected, error };
}
