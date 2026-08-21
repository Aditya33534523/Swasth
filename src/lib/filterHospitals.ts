import { Hospital, CardType, Coordinates, FilteredHospital } from '../types';
import { hospitals as seededHospitals } from '../data/hospitals';

/**
 * Swappable data source — replace this one-liner with:
 *   const hospitals = await fetch('/api/hospitals').then(r => r.json());
 */
const getHospitals = (): Hospital[] => seededHospitals;

/**
 * Calculate the Haversine distance in km between two coordinates.
 */
function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface FilterOptions {
  lat: number;
  lon: number;
  cardType: CardType;
  radiusKm: number;
  speciality?: string;
  emergencyOnly?: boolean;
}

// FilteredHospital is now defined in types.ts

/**
 * Filter hospitals by card type, distance, and optional speciality/emergency flags.
 */
export function filterHospitals(options: FilterOptions): FilteredHospital[] {
  const { lat, lon, cardType, radiusKm, speciality, emergencyOnly } = options;
  const origin: Coordinates = { lat, lon };

  let results = getHospitals()
    .map((h) => ({ ...h, distanceKm: haversineKm(origin, { lat: h.lat, lon: h.lon }) }))
    .filter((h) => h.distanceKm <= radiusKm);

  // Filter by card type
  if (cardType === 'maa') {
    results = results.filter((h) => h.acceptsMaa);
  } else if (cardType === 'ayushman') {
    results = results.filter((h) => h.acceptsAyushman);
  } else if (cardType === 'both') {
    results = results.filter((h) => h.acceptsMaa && h.acceptsAyushman);
  }
  // cardType === 'none' → show all nearby hospitals

  // Filter by speciality
  if (speciality) {
    const q = speciality.toLowerCase();
    results = results.filter((h) =>
      h.specialities.some((s) => s.toLowerCase().includes(q))
    );
  }

  // Emergency-only filter
  if (emergencyOnly) {
    results = results.filter((h) => h.emergency);
  }

  // Sort by distance
  results.sort((a, b) => a.distanceKm - b.distanceKm);

  return results;
}

/**
 * Get the card type label for display.
 */
export function getCardLabel(cardType: CardType): string {
  switch (cardType) {
    case 'maa':
      return 'MAA Card';
    case 'ayushman':
      return 'Ayushman Bharat';
    case 'both':
      return 'Both (MAA + Ayushman)';
    case 'none':
      return 'General';
  }
}

/**
 * Get the unique specialities from all hospitals.
 */
export function getAllSpecialities(): string[] {
  const set = new Set<string>();
  getHospitals().forEach((h) => h.specialities.forEach((s) => set.add(s)));
  return Array.from(set).sort();
}
