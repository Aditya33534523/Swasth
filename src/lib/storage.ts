import type { ChatSession, ChatMessage, LLMMessage, ActivityLog, ActivityAction, User } from '../types';
import { getCurrentUser } from './auth';

// ─── Storage keys (structured like a home folder) ─────────────
// localStorage keys are prefixed with "swasthsetu/" to emulate a folder.
// e.g. swasthsetu/{userId}/session/current
//       swasthsetu/{userId}/logs/
//       swasthsetu/{userId}/chats/{sessionId}

const prefix = (userId: string, ...path: string[]) =>
  `swasthsetu/${userId}/${path.join('/')}`;

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════
//  CHAT PERSISTENCE
// ═══════════════════════════════════════════════════════════

const CHAT_INDEX_KEY = (userId: string) => prefix(userId, 'chats', '_index');
const CHAT_DATA_KEY = (userId: string, sessionId: string) =>
  prefix(userId, 'chats', sessionId);

/** Get or create the current chat session for the logged-in user. */
export function getCurrentChatSession(): ChatSession | null {
  const user = getCurrentUser();
  if (!user) return null;

  const currentKey = prefix(user.id, 'session', 'current_chat');
  const sessionId = localStorage.getItem(currentKey);
  if (!sessionId) return null;

  return getChatSession(sessionId);
}

/** Switch which chat session is "current". Returns the session, or null
 *  if it doesn't exist (e.g. was deleted from another tab). */
export function switchChatSession(sessionId: string): ChatSession | null {
  const user = getCurrentUser();
  if (!user) return null;

  const session = getChatSession(sessionId);
  if (!session) return null;

  localStorage.setItem(prefix(user.id, 'session', 'current_chat'), sessionId);
  return session;
}

/** Delete a chat session permanently. If it was the current session, the
 *  current-session pointer is cleared — the caller should switch to
 *  another session or create a new one right after. */
export function deleteChatSession(sessionId: string): void {
  const user = getCurrentUser();
  if (!user) return;

  localStorage.removeItem(CHAT_DATA_KEY(user.id, sessionId));

  const index = getChatIndex(user.id).filter((id) => id !== sessionId);
  localStorage.setItem(CHAT_INDEX_KEY(user.id), JSON.stringify(index));

  const currentKey = prefix(user.id, 'session', 'current_chat');
  if (localStorage.getItem(currentKey) === sessionId) {
    localStorage.removeItem(currentKey);
  }
}

/** Get a specific chat session. */
export function getChatSession(sessionId: string): ChatSession | null {
  const user = getCurrentUser();
  if (!user) return null;

  try {
    const raw = localStorage.getItem(CHAT_DATA_KEY(user.id, sessionId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Create a new chat session and set it as current. */
export function createChatSession(): ChatSession {
  const user = getCurrentUser()!;
  const session: ChatSession = {
    id: generateId(),
    userId: user.id,
    messages: [],
    llmContext: [{ role: 'system', content: '' }], // will be set by ChatPanel
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  localStorage.setItem(CHAT_DATA_KEY(user.id, session.id), JSON.stringify(session));
  localStorage.setItem(prefix(user.id, 'session', 'current_chat'), session.id);

  // Update chat index
  const index = getChatIndex(user.id);
  index.unshift(session.id);
  localStorage.setItem(CHAT_INDEX_KEY(user.id), JSON.stringify(index));

  return session;
}

/** Save messages to the current chat session. */
export function saveChatMessages(
  messages: ChatMessage[],
  llmContext?: LLMMessage[],
): void {
  const user = getCurrentUser();
  if (!user) return;

  const currentKey = prefix(user.id, 'session', 'current_chat');
  const sessionId = localStorage.getItem(currentKey);
  if (!sessionId) return;

  try {
    const raw = localStorage.getItem(CHAT_DATA_KEY(user.id, sessionId));
    const session: ChatSession = raw ? JSON.parse(raw) : null;
    if (!session) return;

    session.messages = messages;
    if (llmContext) session.llmContext = llmContext;
    session.updatedAt = Date.now();

    localStorage.setItem(
      CHAT_DATA_KEY(user.id, sessionId),
      JSON.stringify(session),
    );
  } catch {
    // Storage full or other error — silently fail
  }
}

/** Get all chat session IDs for the user. */
export function getChatSessionList(): ChatSession[] {
  const user = getCurrentUser();
  if (!user) return [];
  const index = getChatIndex(user.id);
  return index
    .map((id) => getChatSession(id))
    .filter((s): s is ChatSession => s !== null);
}

function getChatIndex(userId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAT_INDEX_KEY(userId)) || '[]');
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
//  ACTIVITY LOGGING
// ═══════════════════════════════════════════════════════════

const LOGS_KEY = (userId: string) => prefix(userId, 'logs', 'activity');

/** Log a user activity. */
export function logActivity(
  action: ActivityAction,
  details: string = '',
): void {
  const user = getCurrentUser();
  if (!user) return;

  const entry: ActivityLog = {
    id: generateId(),
    userId: user.id,
    action,
    details,
    timestamp: Date.now(),
  };

  try {
    const logs = getActivityLogs(user.id);
    logs.push(entry);
    // Keep last 2000 entries per user
    if (logs.length > 2000) logs.splice(0, logs.length - 2000);
    localStorage.setItem(LOGS_KEY(user.id), JSON.stringify(logs));
  } catch {
    // Storage full
  }
}

/** Get all activity logs for a user. */
export function getActivityLogs(userId?: string): ActivityLog[] {
  const uid = userId || getCurrentUser()?.id;
  if (!uid) return [];
  try {
    return JSON.parse(localStorage.getItem(LOGS_KEY(uid)) || '[]');
  } catch {
    return [];
  }
}

/** Export all user data (chats + logs) as a JSON string for download. */
export function exportUserData(): string {
  const user = getCurrentUser();
  if (!user) return '{}';

  const data = {
    user,
    chats: getChatSessionList(),
    activityLogs: getActivityLogs(user.id),
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(data, null, 2);
}