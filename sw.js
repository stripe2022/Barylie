// service-worker.js — Blindado para /Barylie

const CACHE_NAME = 'barylie-cache-v2';
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

// ===== INSTALACIÓN =====
// Precarga assets; NO usamos skipWaiting automático.
self.addEventListener('install', event => {
  console.log('[SW-Barylie] install -> precache');
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
      .catch(err => console.error('[SW-Barylie] precache error', err))
  );
});

// ===== ACTIVACIÓN =====
// NO borramos otros cachés; tomamos control sin recarga.
self.addEventListener('activate', event => {
  console.log('[SW-Barylie] activate -> no cleanup');
  event.waitUntil(self.clients.claim());
});

// ===== FETCH =====
self.addEventListener('fetch', event => {
  const req = event.request;

  // Navegación SPA: siempre el index.html del caché
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/Barylie/index.html').then(res => {
        if (res) return res;
        return fetch('/Barylie/index.html').catch(() =>
          new Response('<h1>⚠️ Sin conexión</h1><p>No hay index.html en caché.</p>', {
            headers: { 'Content-Type': 'text/html' }
          })
        );
      })
    );
    return;
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  // Archivos listados en ASSETS -> cache-only (si no está, intenta red una vez y guarda)
  if (ASSETS.includes(pathname)) {
    event.respondWith(
      caches.match(req).then(res => {
        if (res) return res;
        return fetch(req).then(netRes => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(req, netRes.clone());
            return netRes;
          });
        }).catch(() => new Response('', { status: 504, statusText: 'Offline y sin caché' }));
      })
    );
    return;
  }

  // Resto (imagenes, etc.) -> cache-first, sin guardar automáticamente
  event.respondWith(
    caches.match(req).then(res => {
      if (res) return res;
      return fetch(req).catch(() => new Response('', { status: 504, statusText: 'Offline y sin caché' }));
    })
  );
});

// ===== COMANDOS MANUALES =====
self.addEventListener('message', async (event) => {
  const { type } = event.data || {};

  if (type === 'CLEAR_CACHE') {
    const ok = await caches.delete(CACHE_NAME);
    console.log('[SW-Barylie] CLEAR_CACHE ->', ok);
    event.source?.postMessage({ tipo: 'cache', estado: ok ? 'borrado' : 'no-existia' });
  }

  if (type === 'WARMUP_CACHE') {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    console.log('[SW-Barylie] WARMUP_CACHE -> precargado');
    event.source?.postMessage({ tipo: 'cache', estado: 'precargado' });
  }

  if (type === 'SKIP_WAITING') {
    await self.skipWaiting();
    console.log('[SW-Barylie] SKIP_WAITING -> forzado');
  }
});
