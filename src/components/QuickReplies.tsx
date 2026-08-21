import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface QuickRepliesProps {
  replies: string[];
  onSelect: (reply: string) => void;
}

export const QuickReplies: React.FC<QuickRepliesProps> = ({ replies, onSelect }) => {
  const shouldReduceMotion = useReducedMotion();

  if (!replies.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {replies.map((reply, i) => (
        <motion.button
          key={reply}
          className="glass glass-hover px-4 py-[7px] text-[13px] font-medium rounded-full cursor-pointer whitespace-nowrap"
          style={{ color: 'var(--accent)', borderColor: 'var(--accent-2-soft)' }}
          onClick={() => onSelect(reply)}
          initial={shouldReduceMotion ? {} : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.25, ease: 'easeOut' }}
        >
          {reply}
        </motion.button>
      ))}
    </div>
  );
};