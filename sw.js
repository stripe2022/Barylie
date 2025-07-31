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

// INSTALACIÓN (NO forzar reemplazo)
self.addEventListener('install', event => {
  console.log('🛠 Instalando Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS)
    )
  );
});

// ACTIVACIÓN (NO borrar otras versiones)
self.addEventListener('activate', event => {
  console.log('✅ Activado');
  event.waitUntil(self.clients.claim());
});

// RESPUESTA A FETCH
self.addEventListener('fetch', event => {
  const req = event.request;

  // Navegación: usar index.html del cache
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/Barylie/index.html')
    );
    return;
  }

  // Archivos estáticos
  event.respondWith(
    caches.match(req).then(res => {
      return res || fetch(req).catch(() => {
        return new Response('<h1>⚠️ Sin conexión</h1>', {
          headers: { 'Content-Type': 'text/html' }
        });
      });
    })
  );
});
