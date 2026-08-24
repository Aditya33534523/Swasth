// src/lib/auth.ts
import { apiFetch, setAuthToken } from './api';
import type { User } from '../types';

export async function register(name: string, email: string, phone: string, password: string): Promise<User> {
  const data = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, phone, password }),
  });
  setAuthToken(data.token);
  localStorage.setItem('swasthsetu-user-cache', JSON.stringify(data.user));
  return data.user;
}

export async function login(email: string, password: string): Promise<User> {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAuthToken(data.token);
  localStorage.setItem('swasthsetu-user-cache', JSON.stringify(data.user));
  return data.user;
}

export async function getCurrentUser(): Promise<User | null> {
  if (!localStorage.getItem('swasthsetu-token')) return null;
  try {
    const data = await apiFetch('/me');
    localStorage.setItem('swasthsetu-user-cache', JSON.stringify(data.user));
    return data.user;
  } catch {
    setAuthToken(null);
    return null;
  }
}

export async function logout(): Promise<void> {
  setAuthToken(null);
  localStorage.removeItem('swasthsetu-user-cache');
}

export async function deleteAccount(userId: string): Promise<void> {
  await apiFetch('/me', { method: 'DELETE' });
  setAuthToken(null);
  localStorage.removeItem('swasthsetu-user-cache');
}

export function getCachedUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem('swasthsetu-user-cache') || 'null');
  } catch {
    return null;
  }
}
