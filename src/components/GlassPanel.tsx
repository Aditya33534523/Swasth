import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface GlassPanelProps {
  variant?: 'regular' | 'strong';
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  variant = 'regular',
  className = '',
  style,
  children,
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={`${variant === 'strong' ? 'glass-strong' : 'glass'} ${className}`}
      style={style}
      initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 26,
      }}
    >
      {children}
    </motion.div>
  );
};
