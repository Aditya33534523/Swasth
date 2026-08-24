// src/lib/api.ts
const API_URL = import.meta.env.VITE_API_URL || '/api';

let authToken: string | null = localStorage.getItem('swasthsetu-token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('swasthsetu-token', token);
  else localStorage.removeItem('swasthsetu-token');
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}
