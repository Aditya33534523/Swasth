
const CACHE_NAME = 'swasthsetu-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/main.tsx', // Note: In a real build, these would be hashed assets
  '/src/App.tsx',
  '/src/index.css'
];

// Intentionally a no-op service worker.
// This app needs live llama-server and geocoding, so caching
// would be misleading and could serve stale data.
self.addEventListener('install', () => {});
self.addEventListener('activate', () => {});
self.addEventListener('fetch', () => {});
