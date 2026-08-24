import React, { useState, useCallback, useEffect, useRef } from 'react';
import { LoginPage } from './components/LoginPage';
import { AppHeader, type AppSection } from './components/AppHeader';
import { ChatPanel } from './components/ChatPanel';
import { MapPanel } from './components/MapPanel';
import { HospitalSheet } from './components/HospitalSheet';
import { getCurrentUser, logout as authLogout } from './lib/auth';
import { logActivity, createChatSession, getCurrentChatSession, saveChatMessages } from './lib/storage';
import type { User, MapAction, FilteredHospital, ChatMessage, LLMMessage } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = localStorage.getItem('swasthsetu-theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [activeSection, setActiveSection] = useState<AppSection>('chat');
  const [mapAction, setMapAction] = useState<MapAction | null>(null);
  const [selectedHospital, setSelectedHospital] = useState<FilteredHospital | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ─── Auth ──────────────────────────────────────────────
  const didAuthInitRef = useRef(false);
  useEffect(() => {
    if (didAuthInitRef.current) return; // StrictMode double-invokes this in dev
    didAuthInitRef.current = true;

    (async () => {
      const u = await getCurrentUser();
      if (u) {
        setUser(u);
        localStorage.setItem('swasthsetu-user-cache', JSON.stringify(u));
        logActivity('login', u.email);
        const existing = await getCurrentChatSession();
        if (!existing) {
          await createChatSession();
        }
      }
      setIsLoading(false);
    })();
  }, []);

  // ─── Theme ─────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem('swasthsetu-theme') === null) {
        setIsDark(e.matches);
      }
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    logActivity('theme_toggle', isDark ? 'dark → light' : 'light → dark');
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem('swasthsetu-theme', next ? 'dark' : 'light');
      return next;
    });
  }, [isDark]);

  const handleAuth = useCallback(async (u: User) => {
    localStorage.setItem('swasthsetu-user-cache', JSON.stringify(u));
    setUser(u);
    await createChatSession();
  }, []);

  const handleLogout = useCallback(async () => {
    await authLogout();
    setUser(null);
    setActiveSection('chat');
    setMapAction(null);
    setSelectedHospital(null);
  }, []);

  const handleAccountDeleted = useCallback(() => {
    setUser(null);
    setActiveSection('chat');
    setMapAction(null);
    setSelectedHospital(null);
  }, []);

  // ─── Map / Hospital callbacks ───────────────────────────
  const handleMapAction = useCallback((action: MapAction) => {
    setMapAction(action);
    if (action.type === 'show_markers') {
      logActivity('hospital_result', `${action.hospitals?.length || 0} hospitals shown`);
    }
  }, []);

  const handleHospitalSelect = useCallback((h: FilteredHospital | null) => {
    setSelectedHospital(h);
    if (h) logActivity('hospital_sheet_open', h.name);
  }, []);

  // ─── Chat persistence callback (from ChatPanel) ──────────
  const handleMessagesChange = useCallback(
    (messages: ChatMessage[], llmContext?: LLMMessage[]) => {
      saveChatMessages(messages, llmContext).catch(console.error);
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-gradient)' }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Loading SwasthSetu…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative w-full h-dvh overflow-hidden">
        <div className="app-background app-background--login" aria-hidden="true" />
        <LoginPage onAuth={handleAuth} />
      </div>
    );
  }

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      <div className="app-background app-background--app" aria-hidden="true" />

      <div className="relative z-10 flex flex-col w-full h-full">
        <div className="flex-shrink-0 px-3 pt-3">
          <div className="glass" style={{ borderRadius: 16 }}>
            <AppHeader
              user={user}
              activeSection={activeSection}
              isDark={isDark}
              onSectionChange={setActiveSection}
              onToggleTheme={toggleTheme}
              onLogout={handleLogout}
              onAccountDeleted={handleAccountDeleted}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 p-3 pt-2">
          <div className="glass h-full overflow-hidden" style={{ borderRadius: 20 }}>
            {activeSection === 'chat' ? (
              <ChatPanel
                userName={user.name}
                onMapAction={handleMapAction}
                onHospitalSelect={handleHospitalSelect}
                onMessagesChange={handleMessagesChange}
              />
            ) : (
              <MapPanel
                mapAction={mapAction}
                isDark={isDark}
                onHospitalSelect={handleHospitalSelect}
              />
            )}
          </div>
        </div>
      </div>

      <HospitalSheet hospital={selectedHospital} onClose={() => setSelectedHospital(null)} />
    </div>
  );
}
