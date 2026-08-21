import { Coordinates } from '../types';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

// Nominatim's usage policy caps requests at 1/sec. This wasn't previously
// enforced — someone retrying a failed pincode/city lookup a couple of
// times in quick succession could get temporarily blocked. This queues
// every geocoding call so they're always spaced at least 1.1s apart.
let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

function throttledFetch(url: string, options: RequestInit): Promise<Response> {
  const run = queue.then(async () => {
    const wait = Math.max(0, lastRequestAt + 1100 - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  queue = run;
  return run.then(() => fetch(url, options));
}

/**
 * Geocode a pincode to coordinates using Nominatim.
 * Swappable: replace the fetch URL with your own /api/geocode endpoint.
 */
export async function pincodeToCoords(pincode: string): Promise<Coordinates & { placeName: string }> {
  const query = pincode.trim();
  const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(query + ' India')}&format=json&limit=1`;
  
  const res = await throttledFetch(url, {
    headers: { 'Accept-Language': 'en' },
  });
  
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  
  const data = await res.json();
  if (!data.length) throw new Error(`No results for pincode: ${pincode}`);
  
  const place = data[0];
  return {
    lat: parseFloat(place.lat),
    lon: parseFloat(place.lon),
    placeName: place.display_name?.split(',').slice(0, 2).join(',').trim() || query,
  };
}

/**
 * Geocode a city name to coordinates using Nominatim.
 */
export async function cityToCoords(city: string): Promise<Coordinates & { placeName: string }> {
  const query = city.trim();
  const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(query + ' Gujarat India')}&format=json&limit=1`;
  
  const res = await throttledFetch(url, {
    headers: { 'Accept-Language': 'en' },
  });
  
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  
  const data = await res.json();
  if (!data.length) throw new Error(`No results for city: ${city}`);
  
  const place = data[0];
  return {
    lat: parseFloat(place.lat),
    lon: parseFloat(place.lon),
    placeName: place.display_name?.split(',').slice(0, 3).join(',').trim() || query,
  };
}

/**
 * Get the user's current GPS position.
 */
export function getCurrentPosition(): Promise<Coordinates & { placeName: string }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          placeName: 'Your location',
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Location permission denied. Please enter your pincode or city.'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Location information unavailable. Please enter your pincode or city.'));
            break;
          case error.TIMEOUT:
            reject(new Error('Location request timed out. Please try again or enter your pincode.'));
            break;
          default:
            reject(new Error('An unknown error occurred. Please enter your pincode or city.'));
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}