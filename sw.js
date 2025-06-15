const CACHE_NAME = 'barylie-cache-v2'; // Recuerda subir la versión al actualizar
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

// INSTALACIÓN
self.addEventListener('install', event => {
  self.skipWaiting(); // Forzar activación inmediata
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS).catch(err => {
        return self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ tipo: 'offline-error', mensaje: err.message });
          });
        });
      })
    )
  );
});

// ACTIVACIÓN
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim(); // Tomar control inmediato
});

// FETCH
self.addEventListener('fetch', event => {
  const req = event.request;

  // Si es una navegación (recarga, abrir app), devolver index.html del caché
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/Barylie/index.html')
    );
    return;
  }

  // Para otros recursos (CSS, JS, imágenes, etc.)
  event.respondWith(
    caches.match(req).then(res => {
      return res || fetch(req).catch(() => {
        // Si falla y no está en cache, mensaje simple
        return new Response('<h1>⚠️ Sin conexión y recurso no disponible offline</h1>', {
          headers: { 'Content-Type': 'text/html' }
        });
      });
    })
  );
});
