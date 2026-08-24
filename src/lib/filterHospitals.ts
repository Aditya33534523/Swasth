import { Hospital, CardType, Coordinates, FilteredHospital } from '../types';
import { hospitals as fallbackHospitals } from '../data/hospitals';

let cachedHospitalsPromise: Promise<Hospital[]> | null = null;

/**
 * Fetch hospitals from the backend API, with memory caching and fallback.
 */
export const getHospitals = async (): Promise<Hospital[]> => {
  if (cachedHospitalsPromise) return cachedHospitalsPromise;

  cachedHospitalsPromise = (async () => {
    try {
      const res = await fetch('/api/hospitals');
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : data.hospitals;
      if (!Array.isArray(rawList) || rawList.length === 0) {
        throw new Error('Invalid hospital API response');
      }

      // Accept both SQLite rows and the static JSON shape returned by the API.
      const parsed = rawList
        .map((h: any) => {
          let specialities = h.specialities;
          if (typeof specialities === 'string') {
            try {
              specialities = JSON.parse(specialities);
            } catch {
              specialities = [];
            }
          }
          return {
            ...h,
            specialities: Array.isArray(specialities) ? specialities : [],
            acceptsMaa: Boolean(h.acceptsMaa),
            acceptsAyushman: Boolean(h.acceptsAyushman),
            emergency: Boolean(h.emergency),
            lat: Number(h.lat),
            lon: Number(h.lon),
          };
        })
        .filter((h: Hospital) => Number.isFinite(h.lat) && Number.isFinite(h.lon));

      if (parsed.length > 0) {
        return parsed;
      }
      return fallbackHospitals;
    } catch (err) {
      console.warn('Failed to fetch hospitals from API, using fallback data:', err);
      return fallbackHospitals;
    }
  })();

  return cachedHospitalsPromise;
};

/** Calculate the Haversine distance in km between two coordinates. */
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

/**
 * Filter hospitals by card type, distance, and optional speciality/emergency flags.
 */
export async function filterHospitals(options: FilterOptions): Promise<FilteredHospital[]> {
  const { lat, lon, cardType, radiusKm, speciality, emergencyOnly } = options;
  const origin: Coordinates = { lat, lon };

  const allHospitals = await getHospitals();

  let results = allHospitals
    .map((h) => ({ ...h, distanceKm: haversineKm(origin, { lat: h.lat, lon: h.lon }) }))
    .filter((h) => h.distanceKm <= radiusKm);

  // If no hospitals within radius, search up to 200km or take nearest 10
  if (results.length === 0 && radiusKm < 200) {
    results = allHospitals
      .map((h) => ({ ...h, distanceKm: haversineKm(origin, { lat: h.lat, lon: h.lon }) }))
      .filter((h) => h.distanceKm <= 200);
  }

  // Filter by card type
  if (cardType === 'maa') {
    results = results.filter((h) => h.acceptsMaa);
  } else if (cardType === 'ayushman') {
    results = results.filter((h) => h.acceptsAyushman);
  } else if (cardType === 'both') {
    results = results.filter((h) => h.acceptsMaa && h.acceptsAyushman);
  }

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

/** Get the card type label for display. */
export function getCardLabel(cardType: CardType): string {
  switch (cardType) {
    case 'maa': return 'MAA Card';
    case 'ayushman': return 'Ayushman Bharat';
    case 'both': return 'Both (MAA + Ayushman)';
    case 'none': return 'General';
  }
}

/** Get the unique specialities from all hospitals. */
export async function getAllSpecialities(): Promise<string[]> {
  const hospitals = await getHospitals();
  const set = new Set<string>();
  hospitals.forEach((h) => h.specialities.forEach((s) => {
    if (s && s !== '0') set.add(s);
  }));
  return Array.from(set).sort();
}
