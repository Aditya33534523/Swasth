import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDeleteAccountModalProps {
  open: boolean;
  userName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRM_WORD = 'DELETE';

export const ConfirmDeleteAccountModal: React.FC<ConfirmDeleteAccountModalProps> = ({
  open,
  userName,
  onConfirm,
  onCancel,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [typed, setTyped] = useState('');

  const canConfirm = typed.trim().toUpperCase() === CONFIRM_WORD;

  const handleCancel = () => {
    setTyped('');
    onCancel();
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    setTyped('');
    onConfirm();
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
            onClick={handleCancel}
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
                  style={{ width: 40, height: 40, background: 'rgba(255,59,48,0.12)' }}
                >
                  <AlertTriangle size={19} color="#ff3b30" strokeWidth={2} />
                </div>
                <button
                  onClick={handleCancel}
                  className="w-8 h-8 flex items-center justify-center rounded-full glass-hover cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label="Cancel"
                >
                  <X size={15} strokeWidth={2} />
                </button>
              </div>

              <h2 className="text-lg font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Delete your account?
              </h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                This permanently deletes {userName}'s account, every chat conversation, and all
                activity history. This cannot be undone — consider downloading your data first.
              </p>

              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Type <strong style={{ color: 'var(--text-primary)' }}>{CONFIRM_WORD}</strong> to
                confirm
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CONFIRM_WORD}
                className="w-full mb-5 rounded-xl outline-none"
                autoComplete="off"
                autoCapitalize="characters"
                style={{
                  height: 44,
                  padding: '0 14px',
                  color: 'var(--text-primary)',
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  fontSize: 14,
                }}
              />

              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-3 rounded-2xl font-medium text-sm glass glass-hover cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="flex-1 py-3 rounded-2xl font-medium text-sm text-white cursor-pointer"
                  style={{
                    background: canConfirm ? '#ff3b30' : 'rgba(255,59,48,0.35)',
                    cursor: canConfirm ? 'pointer' : 'not-allowed',
                    border: 'none',
                  }}
                >
                  Delete Account
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};