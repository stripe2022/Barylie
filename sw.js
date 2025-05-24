const CACHE_NAME = 'barylie-cache-v1';
const ASSETS = [
  '/Barylie/',
  '/Barylie/index.html',
  '/Barylie/style.css',
  '/Barylie/app.js',
  '/Barylie/manifest.json',
  '/Barylie/icons/icon-192.png',
  '/Barylie/icons/icon-512.png'
];

// Instala y guarda archivos en cache
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Activa y limpia caches antiguos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
});

// Intercepta fetch y responde desde cache (offline)
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
