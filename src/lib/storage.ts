// src/lib/storage.ts
import { apiFetch } from './api';
import { getCachedUser } from './auth';
import type { ChatSession, ChatMessage, LLMMessage, ActivityLog, ActivityAction, User } from '../types';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════
//  CHAT PERSISTENCE (SERVER-BASED)
// ═══════════════════════════════════════════════════════════

/** Get the current chat session for the logged-in user. */
export async function getCurrentChatSession(): Promise<ChatSession | null> {
  const user = getCachedUser();
  if (!user) return null;

  const data = await apiFetch('/sessions');
  const sessions = data.sessions as any[];
  const current = sessions.find(s => s.current === 1);
  if (!current) return null;

  return parseSession(current);
}

/** Switch which chat session is "current". Returns the session, or null if it doesn't exist. */
export async function switchChatSession(sessionId: string): Promise<ChatSession | null> {
  const user = getCachedUser();
  if (!user) return null;

  await apiFetch(`/sessions/${sessionId}/current`, { method: 'PUT' });
  const sessionData = await apiFetch(`/sessions/${sessionId}`);
  return parseSession(sessionData.session);
}

/** Delete a chat session permanently. */
export async function deleteChatSession(sessionId: string): Promise<void> {
  await apiFetch(`/sessions/${sessionId}`, { method: 'DELETE' });
}

/** Get a specific chat session. */
export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  try {
    const data = await apiFetch(`/sessions/${sessionId}`);
    return parseSession(data.session);
  } catch {
    return null;
  }
}

/** Create a new chat session and set it as current. */
export async function createChatSession(): Promise<ChatSession> {
  const data = await apiFetch('/sessions', { method: 'POST' });
  return parseSession(data.session);
}

/** Save messages to the current chat session. */
export async function saveChatMessages(
  messages: ChatMessage[],
  llmContext?: LLMMessage[],
): Promise<void> {
  const currentSession = await getCurrentChatSession();
  if (!currentSession) return;

  await apiFetch(`/sessions/${currentSession.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      messages,
      llm_context: llmContext || currentSession.llmContext,
    }),
  });
}

/** Get all chat sessions for the user. */
export async function getChatSessionList(): Promise<ChatSession[]> {
  const data = await apiFetch('/sessions');
  return data.sessions.map(parseSession);
}

// Helper to parse the server session object into the client's ChatSession shape
function parseSession(raw: any): ChatSession {
  return {
    id: raw.id,
    userId: raw.user_id,
    messages: JSON.parse(raw.messages || '[]'),
    llmContext: JSON.parse(raw.llm_context || '[]'),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

// ═══════════════════════════════════════════════════════════
//  ACTIVITY LOGGING (SERVER-BASED)
// ═══════════════════════════════════════════════════════════

/** Log a user activity (fire-and-forget, async). */
export async function logActivity(
  action: ActivityAction,
  details: string = '',
): Promise<void> {
  const user = getCachedUser();
  if (!user) return;

  // Fire-and-forget: don't block the UI if the server is unreachable
  try {
    await apiFetch('/activities', {
      method: 'POST',
      body: JSON.stringify({ action, details }),
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

/** Get all activity logs for a user. */
export async function getActivityLogs(userId?: string): Promise<ActivityLog[]> {
  const uid = userId || getCachedUser()?.id;
  if (!uid) return [];

  try {
    const data = await apiFetch('/activities');
    return data.activities.map((a: any) => ({
      id: a.id,
      userId: a.user_id,
      action: a.action,
      details: a.details || '',
      timestamp: a.timestamp,
    }));
  } catch (err) {
    console.error('Failed to fetch activity logs:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
//  DATA EXPORT
// ═══════════════════════════════════════════════════════════

export async function exportUserData(): Promise<string> {
  const user = getCachedUser();
  if (!user) return '{}';

  const sessions = await getChatSessionList();
  const activityLogs = await getActivityLogs(user.id);

  const data = {
    user,
    chats: sessions,
    activityLogs,
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(data, null, 2);
}
