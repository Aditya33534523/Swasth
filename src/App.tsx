import React, { useState, useCallback, useEffect, useRef } from 'react';
import { LoginPage } from './components/LoginPage';
import { AppHeader, type AppSection } from './components/AppHeader';
import { ChatPanel } from './components/ChatPanel';
import { MapPanel } from './components/MapPanel';
import { HospitalSheet } from './components/HospitalSheet';
import { getCurrentUser, isAuthenticated, logout as authLogout } from './lib/auth';
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

  // ─── Auth ──────────────────────────────────────────────
  const didAuthInitRef = useRef(false);
  useEffect(() => {
    if (didAuthInitRef.current) return; // StrictMode double-invokes this in dev
    didAuthInitRef.current = true;

    if (isAuthenticated()) {
      const u = getCurrentUser();
      if (u) {
        setUser(u);
        logActivity('login', u.email);
        // Resume the existing session on reload instead of always
        // starting a blank one — createChatSession() unconditionally
        // here was silently wiping the visible chat on every refresh.
        if (!getCurrentChatSession()) {
          createChatSession();
        }
      }
    }
  }, []);

  // ─── Theme ─────────────────────────────────────────────
  // Apply the current theme to the document. Note this effect does NOT
  // persist to localStorage — only an explicit user toggle does (see
  // toggleTheme below). That distinction is what lets us tell "inferred
  // from system preference" apart from "user picked this on purpose",
  // which the live-sync effect right after this one relies on.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Live-follow the OS theme for as long as the user hasn't explicitly
  // chosen one in this app. Once they tap the toggle, their choice sticks
  // (a stored 'swasthsetu-theme' value exists) and this stops overriding
  // it — otherwise switching your phone to dark mode at night would keep
  // silently reverting an explicit light-mode choice back to dark.
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

  const handleAuth = useCallback((u: User) => {
    setUser(u);
    createChatSession();
  }, []);

  const handleLogout = useCallback(() => {
    authLogout();
    setUser(null);
    setActiveSection('chat');
    setMapAction(null);
    setSelectedHospital(null);
  }, []);

  const handleAccountDeleted = useCallback(() => {
    // deleteAccount() (called from AppHeader) already wipes the user
    // record, all their chat/activity data, and clears the session —
    // this just resets the React state the same way logout does.
    setUser(null);
    setActiveSection('chat');
    setMapAction(null);
    setSelectedHospital(null);
  }, []);

  // ─── Map / Hospital callbacks ───────────────────────────
  const handleMapAction = useCallback((action: MapAction) => {
    setMapAction(action);
    if (action.type === 'show_markers') {
      logActivity(
        'hospital_result',
        `${action.hospitals?.length || 0} hospitals shown`,
      );
    }
  }, []);

  const handleHospitalSelect = useCallback((h: FilteredHospital | null) => {
    setSelectedHospital(h);
    if (h) logActivity('hospital_sheet_open', h.name);
  }, []);

  // ─── Chat persistence callback (from ChatPanel) ──────────
  const handleMessagesChange = useCallback(
    (messages: ChatMessage[], llmContext?: LLMMessage[]) => {
      saveChatMessages(messages, llmContext);
    },
    [],
  );

  // ─── Login screen ───────────────────────────────────────
  if (!user) {
    return (
      <div className="relative w-full h-dvh overflow-hidden">
        <div className="app-background app-background--login" aria-hidden="true" />
        <LoginPage onAuth={handleAuth} />
      </div>
    );
  }

  // ─── Authenticated app ──────────────────────────────────
  return (
    <div className="relative w-full h-dvh overflow-hidden">
      <div className="app-background app-background--app" aria-hidden="true" />

      <div className="relative z-10 flex flex-col w-full h-full">
        {/* Header with navigation */}
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

        {/* Full-screen content area */}
        <div className="flex-1 min-h-0 p-3 pt-2">
          <div
            className="glass h-full overflow-hidden"
            style={{ borderRadius: 20 }}
          >
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

      {/* Hospital detail sheet */}
      <HospitalSheet
        hospital={selectedHospital}
        onClose={() => setSelectedHospital(null)}
      />
    </div>
  );
}