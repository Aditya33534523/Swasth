import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Bot } from 'lucide-react';
import { QuickReplies } from './QuickReplies';
import type { ChatMessage as ChatMessageType } from '../types';

interface ChatMessageProps {
  message: ChatMessageType;
  userName?: string;
  onQuickReply?: (reply: string) => void;
}

/** Simple markdown: **bold** and newlines → <br> */
function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} style={{ fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    // Handle newlines within non-bold parts
    return part.split('\n').map((line, j) => (
      <React.Fragment key={`${i}-${j}`}>
        {j > 0 && <br />}
        {line}
      </React.Fragment>
    ));
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, userName, onQuickReply }) => {
  const shouldReduceMotion = useReducedMotion();
  const isBot = message.role === 'bot' || message.role === 'system';
  const time = useMemo(() => formatTime(message.timestamp), [message.timestamp]);
  const renderedText = useMemo(() => renderMarkdown(message.text), [message.text]);
  const userInitial = (userName || 'U').charAt(0).toUpperCase();

  if (message.role === 'system') return null;

  return (
    <motion.div
      className={`flex flex-col ${isBot ? 'items-start' : 'items-end'} mb-3.5`}
      initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Name + avatar + timestamp row */}
      <div className={`flex items-center gap-1.5 mb-1 px-1 ${isBot ? '' : 'flex-row-reverse'}`}>
        <div
          className={`avatar ${isBot ? 'avatar-bot' : 'avatar-user'}`}
          style={{ width: 20, height: 20, fontSize: 10 }}
        >
          {isBot ? <Bot size={12} strokeWidth={2} /> : userInitial}
        </div>
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          {isBot ? 'SwasthSetu' : userName || 'You'}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
          {time}
        </span>
      </div>

      <div
        className={`max-w-[85%] px-4 py-[10px] text-[15px] leading-relaxed ${
          isBot ? 'bubble-bot' : 'bubble-user'
        }`}
        style={{
          borderRadius: isBot ? '4px 20px 20px 20px' : '20px 4px 20px 20px',
          color: 'var(--text-primary)',
        }}
      >
        <span style={{ letterSpacing: '-0.01em' }}>{renderedText}</span>

        {isBot && message.quickReplies && onQuickReply && (
          <QuickReplies replies={message.quickReplies} onSelect={onQuickReply} />
        )}
      </div>
    </motion.div>
  );
};