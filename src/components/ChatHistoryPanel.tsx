import React, { useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Plus, Trash2, MessageSquare } from 'lucide-react';
import type { ChatSession } from '../types';

interface ChatHistoryPanelProps {
  open: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}

/** First non-empty user message, trimmed, used as a session's title. */
function sessionTitle(session: ChatSession): string {
  const firstUser = session.messages.find((m) => m.role === 'user' && m.text.trim());
  if (firstUser) {
    return firstUser.text.length > 60 ? `${firstUser.text.slice(0, 60)}…` : firstUser.text;
  }
  return 'New conversation';
}

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const ChatHistoryPanel: React.FC<ChatHistoryPanelProps> = ({
  open,
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  onNewChat,
  onClose,
}) => {
  const shouldReduceMotion = useReducedMotion();

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.15)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="absolute top-0 left-0 right-0 z-50 glass-strong overflow-hidden"
            style={{
              borderRadius: '0 0 20px 20px',
              maxHeight: '70%',
              display: 'flex',
              flexDirection: 'column',
            }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '0.5px solid var(--glass-border)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Conversations
              </h3>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full glass-hover cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Close conversation list"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>

            <div className="px-3 pt-3 pb-1 flex-shrink-0">
              <button
                onClick={onNewChat}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
                style={{ background: 'var(--accent-gradient)', color: '#fff' }}
              >
                <Plus size={15} strokeWidth={2} />
                New Chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto glass-scroll px-3 pb-3 min-h-0">
              {sorted.length === 0 ? (
                <p
                  className="text-xs text-center py-6"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  No past conversations yet.
                </p>
              ) : (
                sorted.map((s) => {
                  const isActive = s.id === activeSessionId;
                  return (
                    <div
                      key={s.id}
                      onClick={() => onSelect(s.id)}
                      className="flex items-center gap-2.5 px-3 py-2.5 mt-1 rounded-xl cursor-pointer"
                      style={{
                        background: isActive ? 'var(--accent-soft)' : 'transparent',
                      }}
                    >
                      <div
                        className="flex items-center justify-center rounded-full flex-shrink-0"
                        style={{
                          width: 28,
                          height: 28,
                          background: isActive ? 'var(--accent)' : 'var(--glass-bg-strong)',
                          color: isActive ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        <MessageSquare size={13} strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-[13px] font-medium truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {sessionTitle(s)}
                        </p>
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {formatWhen(s.updatedAt)} · {s.messages.length} message
                          {s.messages.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(s.id);
                        }}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full glass-hover cursor-pointer"
                        style={{ color: '#ff3b30' }}
                        aria-label="Delete conversation"
                      >
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
