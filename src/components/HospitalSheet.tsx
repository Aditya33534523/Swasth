import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Navigation, Phone } from 'lucide-react';
import type { FilteredHospital } from '../types';

interface HospitalSheetProps {
  hospital: FilteredHospital | null;
  onClose: () => void;
}

export const HospitalSheet: React.FC<HospitalSheetProps> = ({ hospital, onClose }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {hospital && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60]"
            style={{ background: 'rgba(0,0,0,0.2)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] glass-strong"
            style={{
              maxHeight: '55vh',
              borderRadius: '24px 24px 0 0',
              padding: '20px 24px 28px',
              overflowY: 'auto',
            }}
            initial={shouldReduceMotion ? { y: 0 } : { y: '100%' }}
            animate={{ y: 0 }}
            exit={shouldReduceMotion ? { y: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* Handle bar */}
            <div
              className="mx-auto mb-4"
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: 'var(--text-secondary)',
                opacity: 0.4,
              }}
            />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full glass-hover cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Close details"
            >
              <X size={16} strokeWidth={2} />
            </button>

            {/* Hospital name */}
            <h2
              className="text-xl font-semibold pr-8 mb-2"
              style={{
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {hospital.name}
            </h2>

            {/* Scheme badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              {hospital.acceptsMaa && (
                <span
                  className="px-3 py-1 text-xs font-medium rounded-full"
                  style={{
                    background: 'rgba(52,199,89,0.15)',
                    color: 'var(--maa)',
                    border: '0.5px solid rgba(52,199,89,0.3)',
                  }}
                >
                  MAA Card
                </span>
              )}
              {hospital.acceptsAyushman && (
                <span
                  className="px-3 py-1 text-xs font-medium rounded-full"
                  style={{
                    background: 'rgba(255,159,10,0.15)',
                    color: 'var(--ayushman)',
                    border: '0.5px solid rgba(255,159,10,0.3)',
                  }}
                >
                  Ayushman Bharat
                </span>
              )}
              {hospital.emergency && (
                <span
                  className="px-3 py-1 text-xs font-medium rounded-full"
                  style={{
                    background: 'rgba(255,59,48,0.1)',
                    color: '#ff3b30',
                    border: '0.5px solid rgba(255,59,48,0.2)',
                  }}
                >
                  24/7 Emergency
                </span>
              )}
            </div>

            {/* Details */}
            <div className="space-y-2 mb-5" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              <p>{hospital.address}</p>
              <p>
                {hospital.district}, {hospital.state} — {hospital.pincode}
              </p>
              <p>
                <strong style={{ color: 'var(--text-primary)' }}>Distance:</strong>{' '}
                {hospital.distanceKm.toFixed(1)} km
              </p>
            </div>

            {/* Specialities */}
            <div className="mb-5">
              <p
                className="text-xs font-medium mb-2"
                style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Specialities
              </p>
              <div className="flex flex-wrap gap-2">
                {hospital.specialities.map((s) => (
                  <span
                    key={s}
                    className="px-3 py-1 text-xs rounded-full"
                    style={{
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.lat},${hospital.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-medium text-sm"
                style={{ background: 'var(--accent)', textDecoration: 'none' }}
              >
                <Navigation size={16} strokeWidth={2} />
                Get Directions
              </a>
              <a
                href={`tel:${hospital.phone}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-medium text-sm glass glass-hover"
                style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
              >
                <Phone size={16} strokeWidth={2} />
                Call Hospital
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
