import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Settings, X, RotateCcw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { checkLLMHealth } from '../lib/llm';
import {
  getLLMSettings,
  saveLLMSettings,
  resetLLMSettings,
  type LLMSettings,
} from '../lib/llmSettings';

interface LLMSettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after settings are saved, so ChatPanel can pick up the change
   *  immediately without needing a reload. */
  onSaved?: () => void;
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

const FIELD_STYLE: React.CSSProperties = {
  height: 44,
  padding: '0 14px',
  color: 'var(--text-primary)',
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  fontSize: 14,
};

export const LLMSettingsModal: React.FC<LLMSettingsModalProps> = ({
  open,
  onClose,
  onSaved,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [settings, setSettings] = useState<LLMSettings>({ baseUrl: '', model: 'gemma' });
  const [testState, setTestState] = useState<TestState>('idle');

  // Reload from storage every time the modal opens, so stale edits from a
  // previous open (that were cancelled, not saved) don't linger.
  useEffect(() => {
    if (open) {
      setSettings(getLLMSettings());
      setTestState('idle');
    }
  }, [open]);

  const handleTest = async () => {
    setTestState('testing');
    const ok = await checkLLMHealth(settings.baseUrl.trim() || undefined);
    setTestState(ok ? 'ok' : 'fail');
  };

  const handleSave = () => {
    saveLLMSettings(settings);
    onSaved?.();
    onClose();
  };

  const handleReset = () => {
    resetLLMSettings();
    setSettings(getLLMSettings());
    setTestState('idle');
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[80]"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="glass-strong w-full max-w-sm p-6"
              style={{ borderRadius: 24 }}
              initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? {} : { opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 40, height: 40, background: 'var(--accent-soft)' }}
                >
                  <Settings size={18} style={{ color: 'var(--accent)' }} strokeWidth={2} />
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full glass-hover cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label="Close"
                >
                  <X size={15} strokeWidth={2} />
                </button>
              </div>

              <h2 className="text-lg font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                LLM Server
              </h2>
              <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                Leave the server URL blank to use the default — it's proxied through Vite to{' '}
                <code>localhost:11434</code> (Ollama) and works over a Cloudflare Tunnel. Only set an
                absolute URL if you're pointing at a different local or remote server.
              </p>

              <label
                htmlFor="llm-base-url"
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Server URL
              </label>
              <input
                id="llm-base-url"
                type="text"
                value={settings.baseUrl}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, baseUrl: e.target.value }));
                  setTestState('idle');
                }}
                placeholder="/llm-api (default)"
                className="w-full mb-4 rounded-xl outline-none"
                autoComplete="off"
                spellCheck={false}
                style={FIELD_STYLE}
              />

              <label
                htmlFor="llm-model"
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Model name
              </label>
              <input
                id="llm-model"
                type="text"
                value={settings.model}
                onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                placeholder="gemma"
                className="w-full mb-4 rounded-xl outline-none"
                autoComplete="off"
                spellCheck={false}
                style={FIELD_STYLE}
              />

              <button
                onClick={handleTest}
                disabled={testState === 'testing'}
                className="w-full mb-5 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium glass glass-hover cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                {testState === 'testing' && (
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                )}
                {testState === 'ok' && <CheckCircle2 size={15} strokeWidth={2} color="#34c759" />}
                {testState === 'fail' && <XCircle size={15} strokeWidth={2} color="#ff3b30" />}
                {testState === 'idle' && 'Test Connection'}
                {testState === 'testing' && 'Testing…'}
                {testState === 'ok' && 'Server reachable'}
                {testState === 'fail' && 'Could not reach server'}
              </button>

              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl font-medium text-sm glass glass-hover cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Reset to default"
                >
                  <RotateCcw size={14} strokeWidth={2} />
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-2xl font-medium text-sm glass glass-hover cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 rounded-2xl font-medium text-sm text-white cursor-pointer"
                  style={{ background: 'var(--accent)', border: 'none' }}
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
