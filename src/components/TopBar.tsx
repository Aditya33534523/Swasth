import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { TrafficLights } from './TrafficLights';

interface TopBarProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ isDark, onToggleTheme }) => {
  return (
    <div className="relative z-50 flex items-center justify-between px-4 py-2 mx-4 mt-4 glass" style={{ height: 52 }}>
      <div className="flex items-center gap-3">
        <TrafficLights />
        <h1
          className="text-base font-semibold tracking-[-0.02em]"
          style={{ color: 'var(--text-primary)' }}
        >
          SwasthSetu
        </h1>
      </div>

      <button
        onClick={onToggleTheme}
        className="glass glass-hover flex items-center justify-center w-9 h-9 rounded-full cursor-pointer"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? (
          <Sun size={16} style={{ color: 'var(--text-primary)' }} strokeWidth={1.5} />
        ) : (
          <Moon size={16} style={{ color: 'var(--text-primary)' }} strokeWidth={1.5} />
        )}
      </button>
    </div>
  );
};
