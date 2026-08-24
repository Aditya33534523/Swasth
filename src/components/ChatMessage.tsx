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

// Simple markdown renderer that handles headings, bold, italic, lists.
function renderMarkdown(text: string): React.ReactNode {
  // Split by double newlines to separate blocks
  const blocks = text.split(/\n\s*\n/);
  return blocks.map((block, blockIdx) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // Heading: lines starting with # (up to 3 hashes)
    if (/^#{1,3}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      const content = trimmed.replace(/^#{1,3}\s+/, '');
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      return (
        <Tag key={blockIdx} style={{ fontWeight: 600, margin: '12px 0 6px', color: 'var(--text-primary)' }}>
          {renderInline(content)}
        </Tag>
      );
    }

    // Unordered list: lines starting with "- " or "* "
    if (/^(\s*[-*]\s+.+(\n|$))+/.test(block)) {
      const items = block.split('\n').filter(line => /^\s*[-*]\s+/.test(line)).map(line => line.replace(/^\s*[-*]\s+/, ''));
      return (
        <ul key={blockIdx} style={{ margin: '8px 0', paddingLeft: '20px', color: 'var(--text-primary)' }}>
          {items.map((item, i) => (
            <li key={i} style={{ marginBottom: '4px' }}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    }

    // Ordered list: lines starting with "1. " etc.
    if (/^(\s*\d+\.\s+.+(\n|$))+/.test(block)) {
      const items = block.split('\n').filter(line => /^\s*\d+\.\s+/.test(line)).map(line => line.replace(/^\s*\d+\.\s+/, ''));
      return (
        <ol key={blockIdx} style={{ margin: '8px 0', paddingLeft: '20px', color: 'var(--text-primary)' }}>
          {items.map((item, i) => (
            <li key={i} style={{ marginBottom: '4px' }}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    }

    // Default paragraph
    return (
      <p key={blockIdx} style={{ margin: '8px 0', lineHeight: 1.6, color: 'var(--text-primary)' }}>
        {renderInline(block)}
      </p>
    );
  });
}

// Inline formatting: bold, italic, and newlines within a paragraph.
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} style={{ fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} style={{ fontStyle: 'italic' }}>
          {part.slice(1, -1)}
        </em>
      );
    }
    // Handle newlines within non-formatted parts
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
      className={`flex flex-col ${isBot ? 'items-start' : 'items-end'} mb-4`}  // more space between messages
      initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Name + avatar + timestamp row */}
      <div className={`flex items-center gap-2 mb-1.5 px-1 ${isBot ? '' : 'flex-row-reverse'}`}>
        <div
          className={`avatar ${isBot ? 'avatar-bot' : 'avatar-user'}`}
          style={{ width: 24, height: 24, fontSize: 11 }}
        >
          {isBot ? <Bot size={14} strokeWidth={2} /> : userInitial}
        </div>
        <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          {isBot ? 'SwasthSetu' : userName || 'You'}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
          {time}
        </span>
      </div>

      <div
        className={`max-w-[85%] px-5 py-3 text-[16px] leading-relaxed ${
          isBot ? 'bubble-bot' : 'bubble-user'
        }`}
        style={{
          borderRadius: isBot ? '4px 20px 20px 20px' : '20px 4px 20px 20px',
          color: isBot ? 'var(--text-primary)' : '#fff',
          fontSize: '16px',
          letterSpacing: '-0.01em',
        }}
      >
        <div>{renderedText}</div>

        {isBot && message.quickReplies && onQuickReply && (
          <QuickReplies replies={message.quickReplies} onSelect={onQuickReply} />
        )}
      </div>
    </motion.div>
  );
};
