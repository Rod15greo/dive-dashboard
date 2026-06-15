import { User } from './types';

export async function fetchMe(): Promise<User | null> {
  const res = await fetch('/api/me');
  if (res.status === 401) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function triggerRefresh(): Promise<void> {
  await fetch('/api/dashboard/refresh', { method: 'POST' });
}

export function logout(): void {
  fetch('/auth/logout', { method: 'POST' }).then(() => {
    window.location.href = '/';
  });
}
