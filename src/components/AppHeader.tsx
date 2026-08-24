import React, { useCallback, useState } from 'react';
import {
  MessageSquare,
  MapPin,
  Sun,
  Moon,
  LogOut,
  Download,
  Trash2,
  Heart,
} from 'lucide-react';
import { deleteAccount } from '../lib/auth';
import { logActivity, exportUserData } from '../lib/storage';
import { ConfirmDeleteAccountModal } from './ConfirmDeleteAccountModal';
import type { User as UserType } from '../types';

export type AppSection = 'chat' | 'map';

interface AppHeaderProps {
  user: UserType;
  activeSection: AppSection;
  isDark: boolean;
  onSectionChange: (s: AppSection) => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  onAccountDeleted: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  user,
  activeSection,
  isDark,
  onSectionChange,
  onToggleTheme,
  onLogout,
  onAccountDeleted,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleLogout = useCallback(() => {
    logActivity('logout');
    onLogout();
  }, [onLogout]);

  const handleExport = useCallback(async () => {
    const data = await exportUserData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swasthsetu_${user.id}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [user.id]);

  const handleConfirmDelete = useCallback(() => {
    deleteAccount(user.id)
      .then(() => {
        setShowDeleteConfirm(false);
        onAccountDeleted();
      })
      .catch((err) => {
        console.error('Failed to delete account:', err);
        // Optionally show an error message to the user
      });
  }, [user.id, onAccountDeleted]);

  const handleSectionChange = useCallback(
    (section: AppSection) => {
      logActivity('section_switch', `chat → ${section}`);
      onSectionChange(section);
    },
    [onSectionChange],
  );

  const initial = user.name.charAt(0).toUpperCase();

  return (
    <header className="flex items-center justify-between px-4 py-2 mx-0" style={{ height: 56 }}>
      {/* Left: Logo */}
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="flex items-center justify-center w-6 h-6 rounded-lg flex-shrink-0"
          style={{ background: 'var(--accent-soft)' }}
        >
          <Heart size={12} style={{ color: 'var(--accent)' }} strokeWidth={2} />
        </div>
        <span
          className="text-sm font-semibold truncate"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
        >
          SwasthSetu
        </span>
      </div>

      {/* Center: Section tabs */}
      <div className="flex rounded-xl p-1" style={{ background: 'var(--accent-soft)' }}>
        <button
          onClick={() => handleSectionChange('chat')}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer"
          style={{
            background: activeSection === 'chat' ? 'var(--accent-gradient)' : 'transparent',
            color: activeSection === 'chat' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          <MessageSquare size={14} strokeWidth={1.5} />
          <span className="hidden sm:inline">Chat</span>
        </button>
        <button
          onClick={() => handleSectionChange('map')}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer"
          style={{
            background: activeSection === 'map' ? 'var(--accent-gradient)' : 'transparent',
            color: activeSection === 'map' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          <MapPin size={14} strokeWidth={1.5} />
          <span className="hidden sm:inline">Map</span>
        </button>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          className="w-8 h-8 flex items-center justify-center rounded-full glass-hover cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
          title="Download my data"
          aria-label="Download data"
        >
          <Download size={15} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-8 h-8 flex items-center justify-center rounded-full glass-hover cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
          title="Delete account"
          aria-label="Delete account"
        >
          <Trash2 size={15} strokeWidth={1.5} />
        </button>
        <button
          onClick={onToggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-full glass-hover cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
          aria-label={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? <Sun size={15} strokeWidth={1.5} /> : <Moon size={15} strokeWidth={1.5} />}
        </button>
        <div
          className="flex items-center gap-1.5 pl-1.5 ml-1"
          style={{ borderLeft: '0.5px solid var(--glass-border)', height: 28 }}
        >
          <div className="avatar avatar-user w-7 h-7 text-xs">{initial}</div>
          <button
            onClick={handleLogout}
            className="w-7 h-7 flex items-center justify-center rounded-full glass-hover cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <ConfirmDeleteAccountModal
        open={showDeleteConfirm}
        userName={user.name}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </header>
  );
};
