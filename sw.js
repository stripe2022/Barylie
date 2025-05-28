const CACHE_NAME = 'barylie-cache-v1';
const ASSETS = [
  '/Barylie/',
  '/Barylie/index.html',
  '/Barylie/style.css',
  '/Barylie/app.js',
  '/Barylie/movimientos.js',
  '/Barylie/historial.js',
  '/Barylie/manifest.json',
  '/Barylie/icons/icon-192.png',
  '/Barylie/icons/icon-512.png'
];

// INSTALACIÓN: Intenta cachear todos los archivos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS)
        .then(() => {
          self.skipWaiting();
        })
        .then(() => {
          return self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({ tipo: 'offline-listo' });
            });
          });
        })
        .catch(err => {
          return self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({ tipo: 'offline-error', mensaje: err.message });
            });
          });
        });
    })
  );
});

// ACTIVACIÓN
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
});

// FETCH: Intenta servir desde caché y luego desde red
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      if (res) return res;

      return fetch(e.request).catch(() => {
        return new Response('<h1>⚠️ Sin conexión y recurso no disponible offline</h1>', {
          headers: { 'Content-Type': 'text/html' }
        });
      });
    })
  );
});
