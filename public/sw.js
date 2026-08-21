
const CACHE_NAME = 'swasthsetu-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/main.tsx', // Note: In a real build, these would be hashed assets
  '/src/App.tsx',
  '/src/index.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});