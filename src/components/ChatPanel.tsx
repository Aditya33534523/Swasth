// src/components/ChatPanel.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Send, Square, MessageSquare, Search, Bot, Mic, History, Settings } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { LLMSettingsModal } from './LLMSettingsModal';
import { useAIStream } from '../hooks/useAIStream';
import { useHospitalFSM } from '../hooks/useHospitalFSM';
import { getCurrentChatSession, saveChatMessages, logActivity, createChatSession, getChatSessionList, switchChatSession, deleteChatSession } from '../lib/storage';
import { SYSTEM_PROMPT } from '../constants/emergency';
import type {
  ChatMode,
  ChatMessage as ChatMessageType,
  MapAction,
  FilteredHospital,
  LLMMessage,
  ChatSession,
} from '../types';

interface ChatPanelProps {
  userName: string;
  onMapAction: (action: MapAction) => void;
  onHospitalSelect: (h: FilteredHospital | null) => void;
  onMessagesChange?: (messages: ChatMessageType[], llmContext?: LLMMessage[]) => void;
}

type TypingIndicator = { id: string; role: 'typing' };

let msgCounter = 0;
function uid(): string {
  return `msg_${Date.now()}_${++msgCounter}`;
}

const GREETING_TEXT =
  "Namaste 🙏 I'm SwasthSetu, your AI health assistant. I can help you with:\n\n• **Medicine information** — uses, side effects, interactions\n• **Hospital search** — find nearby scheme hospitals on the map\n• **Health guidance** — first aid, when to see a doctor\n\nAsk me anything, or tap below to find hospitals.";

export const ChatPanel: React.FC<ChatPanelProps> = ({ userName, onMapAction, onHospitalSelect, onMessagesChange }) => {
  const [mode, setMode] = useState<ChatMode>('ai_chat');
  const [messages, setMessages] = useState<(ChatMessageType | TypingIndicator)[]>([]);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const llmMessagesRef = useRef<LLMMessage[]>([{ role: 'system', content: SYSTEM_PROMPT }]);
  const lastKnownCoordsRef = useRef<{ lat: number; lon: number } | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [sessionList, setSessionList] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const addBotMessage = useCallback(async (text: string, quickReplies?: string[]) => {
    setMessages((prev) => [
      ...prev.filter((m) => m.role !== 'typing'),
      { id: uid(), role: 'bot', text, quickReplies, timestamp: Date.now() } as ChatMessageType,
    ]);
  }, []);

  const addUserMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev.filter((m) => m.role !== 'typing'),
      { id: uid(), role: 'user', text, timestamp: Date.now() } as ChatMessageType,
    ]);
  }, []);

  const { isStreaming, streamingText, handleLLMSend, stopStreaming } = useAIStream({
    llmMessagesRef,
    addUserMessage,
    addBotMessage,
    onMapAction,
    onHospitalSelect,
    lastKnownCoordsRef,
  });

  const { fsmState, startHospitalSearch, handleFSMInput, reset: resetFSM } = useHospitalFSM({
    addBotMessage,
    addUserMessage,
    onMapAction,
    onHospitalSelect,
    llmMessagesRef,
    onSwitchToAI: () => setMode('ai_chat'),
    onLocationUpdate: (coords) => {
      lastKnownCoordsRef.current = coords;
    },
  });

  // ─── Auto-scroll ─────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming, streamingText]);

  // ─── Load saved chat on mount ─────────────────────────────
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    (async () => {
      const saved = await getCurrentChatSession();
      if (saved && saved.messages.length > 0) {
        setMessages(saved.messages);
        setActiveSessionId(saved.id);
        if (saved.llmContext?.length) {
          llmMessagesRef.current = saved.llmContext;
        }
      } else {
        if (saved) setActiveSessionId(saved.id);
        addBotMessage(GREETING_TEXT, ['🏥 Find Hospitals']);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Persist messages on change ──────────────────────────
  useEffect(() => {
    const real = messages.filter((m) => m.role !== 'typing') as ChatMessageType[];
    if (real.length > 0) {
      saveChatMessages(real, llmMessagesRef.current).catch(console.error);
      onMessagesChange?.(real, llmMessagesRef.current);
    }
  }, [messages, onMessagesChange]);

  // ─── Chat history handlers ─────────────────────────────
  const resetSessionUiState = useCallback(() => {
    stopStreaming();
    setMode('ai_chat');
    resetFSM();
    lastKnownCoordsRef.current = null;
    onMapAction({ type: 'clear_markers' });
    onHospitalSelect(null);
  }, [stopStreaming, resetFSM, onMapAction, onHospitalSelect]);

  const openHistory = useCallback(async () => {
    const list = await getChatSessionList();
    setSessionList(list);
    setShowHistory(true);
  }, []);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    if (sessionId === activeSessionId) {
      setShowHistory(false);
      return;
    }
    const session = await switchChatSession(sessionId);
    if (!session) return;

    resetSessionUiState();
    setActiveSessionId(session.id);
    setMessages(session.messages);
    llmMessagesRef.current = session.llmContext?.length
      ? session.llmContext
      : [{ role: 'system', content: SYSTEM_PROMPT }];
    setShowHistory(false);
    logActivity('section_switch', `resumed chat ${session.id}`);
  }, [activeSessionId, resetSessionUiState]);

  const handleNewChat = useCallback(async () => {
    resetSessionUiState();
    const session = await createChatSession();
    setActiveSessionId(session.id);
    llmMessagesRef.current = [{ role: 'system', content: SYSTEM_PROMPT }];
    setMessages([]);
    addBotMessage(GREETING_TEXT, ['🏥 Find Hospitals']);
    setShowHistory(false);
  }, [resetSessionUiState, addBotMessage]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await deleteChatSession(sessionId);
    const remaining = await getChatSessionList();
    setSessionList(remaining);

    if (sessionId === activeSessionId) {
      const next = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (next) {
        handleSelectSession(next.id);
      } else {
        handleNewChat();
      }
    }
  }, [activeSessionId, handleSelectSession, handleNewChat]);

  // ─── Unified input handler ─────────────────────────────
  const handleQuickReply = useCallback(
    (reply: string) => {
      // Mode-switching quick replies
      if (reply.includes('Find Hospitals') || reply === '🏥 Find Hospitals') {
        setMode('hospital_search'); // FIXED: Ensure we switch to hospital mode!
        startHospitalSearch();
        return;
      }
      if (reply.includes('Ask AI') || reply === '💬 Ask AI') {
        setMode('ai_chat');
        return;
      }

      // FSM quick replies
      if (mode === 'hospital_search') {
        handleFSMInput(reply);
        return;
      }

      // AI chat quick replies → treat as text input
      handleLLMSend(reply);
    },
    [mode, handleLLMSend, handleFSMInput, startHospitalSearch]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || isStreaming) return;
    setInputText('');

    if (mode === 'hospital_search') {
      handleFSMInput(text);
    } else {
      handleLLMSend(text);
    }
  };

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="avatar-wrap">
              <div className="avatar avatar-bot" style={{ width: 34, height: 34 }}>
                <Bot size={17} strokeWidth={2} />
              </div>
              <span className="online-dot" />
            </div>
            <div className="min-w-0">
              <h2
                className="text-base font-semibold truncate"
                style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
              >
                SwasthSetu Assistant
              </h2>
              <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <span
                  className="inline-block rounded-full"
                  style={{ width: 6, height: 6, background: 'var(--online)' }}
                />
                {mode === 'ai_chat' ? 'Online · AI Health Chat' : 'Hospital Finder'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowSettings(true)}
              className="glass glass-hover flex items-center justify-center w-8 h-8 rounded-full cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="LLM server settings"
              title="LLM server settings"
            >
              <Settings size={15} strokeWidth={1.5} />
            </button>
            <button
              onClick={openHistory}
              className="glass glass-hover flex items-center justify-center w-8 h-8 rounded-full cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Past conversations"
              title="Past conversations"
            >
              <History size={15} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => {
                if (mode === 'ai_chat') {
                  setMode('hospital_search'); // FIXED: Ensure we switch to hospital mode!
                  startHospitalSearch();
                } else {
                  setMode('ai_chat');
                }
              }}
              className="glass glass-hover flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full cursor-pointer"
              style={{ color: 'var(--accent)' }}
            >
              {mode === 'ai_chat' ? (
                <>
                  <Search size={13} strokeWidth={1.5} />
                  Find Hospitals
                </>
              ) : (
                <>
                  <MessageSquare size={13} strokeWidth={1.5} />
                  Ask AI
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <ChatHistoryPanel
        open={showHistory}
        sessions={sessionList}
        activeSessionId={activeSessionId}
        onSelect={handleSelectSession}
        onDelete={handleDeleteSession}
        onNewChat={handleNewChat}
        onClose={() => setShowHistory(false)}
      />

      <LLMSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={() => logActivity('llm_settings_saved')}
      />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto glass-scroll px-4 pb-2 min-h-0"
        role="log"
        aria-live="polite"
      >
        {messages.map((msg) => {
          if (msg.role === 'typing') {
            return (
              <div key={msg.id} className="flex justify-start mb-3">
                <div className="bubble-bot px-4 py-3 flex gap-1.5 items-center" style={{ borderRadius: '4px 20px 20px 20px' }}>
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            );
          }
          return (
            <ChatMessage
              key={msg.id}
              message={msg as ChatMessageType}
              userName={userName}
              onQuickReply={handleQuickReply}
            />
          );
        })}

        {/* Streaming message */}
        {isStreaming && streamingText && (
          <div className="flex justify-start mb-3">
            <div
              className="bubble-bot max-w-[85%] px-5 py-3 text-[16px] leading-relaxed"
              style={{ borderRadius: '4px 20px 20px 20px', color: 'var(--text-primary)' }}
            >
              <span style={{ letterSpacing: '-0.01em', whiteSpace: 'pre-wrap' }}>{streamingText}</span>
              <span className="inline-block w-[2px] h-[16px] ml-0.5 align-text-bottom streaming-cursor" />
            </div>
          </div>
        )}
      </div>

      {/* Input bar - updated style */}
      <form
        onSubmit={handleSubmit}
        className="flex-shrink-0 p-3 pt-1"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{
            background: 'var(--glass-bg)',
            borderRadius: 24,
            border: '1px solid var(--glass-border)',
            boxShadow: '0 2px 8px var(--glass-shadow)',
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              mode === 'ai_chat'
                ? 'Ask about medicines, health, hospitals…'
                : 'Type a pincode, city, or select an option…'
            }
            className="flex-1 bg-transparent border-none outline-none"
            style={{
              color: 'var(--text-primary)',
              fontSize: 16,
              letterSpacing: '-0.01em',
            }}
            aria-label="Chat message input"
            disabled={isStreaming}
          />
          <button
            type="button"
            disabled
            title="Voice input coming soon"
            aria-label="Voice input (coming soon)"
            className="flex items-center justify-center w-8 h-8 rounded-full cursor-not-allowed"
            style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
          >
            <Mic size={16} strokeWidth={1.5} />
          </button>
          {isStreaming ? (
            <button
              type="button"
              onClick={stopStreaming}
              className="flex items-center justify-center w-8 h-8 mr-1 rounded-full cursor-pointer"
              style={{ background: '#ff3b30' }}
              aria-label="Stop generating"
            >
              <Square size={14} color="#fff" fill="#fff" strokeWidth={0} />
            </button>
          ) : (
            <button
              type="submit"
              className="flex items-center justify-center w-8 h-8 mr-1 rounded-full cursor-pointer"
              style={{ background: 'var(--accent-gradient)' }}
              aria-label="Send message"
            >
              <Send size={16} color="#fff" strokeWidth={2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
