import type { User } from '../types';

const USERS_KEY = 'swasthsetu_users';
const SESSION_KEY = 'swasthsetu_session';

/**
 * Password lives only in this internal storage record — it is stripped
 * before a user is ever returned to the rest of the app (state, exports,
 * activity logs, etc). Like the rest of this demo's data it's still kept
 * in plaintext in localStorage; that's fine for a local prototype but
 * should never be the pattern for a real backend.
 */
interface StoredUser extends User {
  password: string;
}

function generateId(): string {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function toPublicUser(user: StoredUser): User {
  const { password: _password, ...publicUser } = user;
  return publicUser;
}

/** Register a new user. Returns the user or an error string. */
export function register(
  name: string,
  email: string,
  phone: string,
  password: string,
): User | string {
  if (!name.trim() || !email.trim() || !phone.trim() || !password) {
    return 'All fields are required.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Please enter a valid email.';
  }
  if (!/^\d{10}$/.test(phone.trim())) {
    return 'Please enter a 10-digit phone number.';
  }
  if (password.length < 6) {
    return 'Password must be at least 6 characters.';
  }

  const users = getUsers();
  if (users.some((u) => u.email === email.trim().toLowerCase())) {
    return 'An account with this email already exists.';
  }

  const user: StoredUser = {
    id: generateId(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    password,
    createdAt: Date.now(),
  };

  users.push(user);
  saveUsers(users);
  localStorage.setItem(SESSION_KEY, user.id);
  return toPublicUser(user);
}

/** Login by email + password. Returns the user or an error string. */
export function login(email: string, password: string): User | string {
  if (!email.trim()) return 'Please enter your email.';
  if (!password) return 'Please enter your password.';

  const users = getUsers();
  const user = users.find((u) => u.email === email.trim().toLowerCase());
  if (!user) return 'No account found with this email.';

  // Accounts created before password support was added have no stored
  // password — ask them to re-register rather than silently letting
  // anyone in.
  if (!user.password) {
    return 'This account predates password login — please register again.';
  }
  if (user.password !== password) return 'Incorrect password.';

  localStorage.setItem(SESSION_KEY, user.id);
  return toPublicUser(user);
}

/** Get the currently logged-in user. */
export function getCurrentUser(): User | null {
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  const user = getUsers().find((u) => u.id === id);
  return user ? toPublicUser(user) : null;
}

/** Log out. */
export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** Check if a user is logged in. */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem(SESSION_KEY);
}

/**
 * Permanently delete a user account and every piece of data tied to it —
 * profile, all chat sessions, and activity logs (everything stored under
 * the `swasthsetu/{userId}/...` key prefix by storage.ts, plus the user
 * record itself). This cannot be undone. Logs the user out as part of
 * deletion since their session would otherwise point at a user that no
 * longer exists.
 */
export function deleteAccount(userId: string): void {
  // Remove the user record itself
  const users = getUsers().filter((u) => u.id !== userId);
  saveUsers(users);

  // Remove every localStorage key under this user's namespace
  // (swasthsetu/{userId}/session/..., /chats/..., /logs/...)
  const ownedPrefix = `swasthsetu/${userId}/`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(ownedPrefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));

  // If the deleted account was the active session, log out
  if (localStorage.getItem(SESSION_KEY) === userId) {
    localStorage.removeItem(SESSION_KEY);
  }
}