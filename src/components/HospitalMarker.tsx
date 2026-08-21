import React, { useMemo } from 'react';
import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import type { FilteredHospital, CardType } from '../types';

interface HospitalMarkerProps {
  hospital: FilteredHospital;
  onSelect: (h: FilteredHospital) => void;
}

function getSchemeColor(h: FilteredHospital): string {
  if (h.acceptsMaa && h.acceptsAyushman) return 'var(--both)';
  if (h.acceptsMaa) return 'var(--maa)';
  if (h.acceptsAyushman) return 'var(--ayushman)';
  return 'var(--none)';
}

function getSchemeLabel(h: FilteredHospital): string {
  if (h.acceptsMaa && h.acceptsAyushman) return 'Accepts Both';
  if (h.acceptsMaa) return 'Accepts MAA';
  if (h.acceptsAyushman) return 'Accepts Ayushman';
  return 'General Hospital';
}

export const HospitalMarker: React.FC<HospitalMarkerProps> = ({ hospital, onSelect }) => {
  const color = getSchemeColor(hospital);

  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="
            width: 32px; height: 32px;
            border-radius: 50%;
            background: var(--glass-bg-strong);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 2px solid ${color};
            box-shadow: 0 2px 12px -2px ${color}66, 0 4px 16px -4px var(--glass-shadow);
            display: flex; align-items: center; justify-content: center;
            position: relative;
          ">
            <div style="
              width: 12px; height: 12px;
              border-radius: 50%;
              background: ${color};
            "></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -34],
      }),
    [color],
  );

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${hospital.lat},${hospital.lon}`;

  return (
    <Marker
      position={[hospital.lat, hospital.lon]}
      icon={icon}
      eventHandlers={{
        click: () => onSelect(hospital),
      }}
      aria-label={`${hospital.name}, ${hospital.distanceKm.toFixed(1)} km away`}
    >
      <Popup maxWidth={280} minWidth={240}>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--text-primary)' }}>
            {hospital.name}
          </div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: 12 }}>
            {hospital.address}
          </div>

          {/* Scheme badge */}
          <span
            style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 500,
              background: color + '22',
              color: color,
              marginBottom: 8,
              border: `0.5px solid ${color}44`,
            }}
          >
            {getSchemeLabel(hospital)}
          </span>

          {/* Specialities */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {hospital.specialities.slice(0, 3).map((s) => (
              <span
                key={s}
                style={{
                  padding: '1px 8px',
                  borderRadius: 10,
                  fontSize: 10,
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                }}
              >
                {s}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {hospital.distanceKm.toFixed(1)} km
            </span>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--accent)',
                textDecoration: 'none',
              }}
            >
              Get Directions →
            </a>
          </div>

          {hospital.emergency && (
            <div
              style={{
                marginTop: 6,
                padding: '2px 8px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                color: '#ff3b30',
                background: 'rgba(255,59,48,0.1)',
                display: 'inline-block',
              }}
            >
              24/7 Emergency
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
};
