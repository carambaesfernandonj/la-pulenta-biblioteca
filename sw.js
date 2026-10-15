/* La Pulenta Biblioteca v1.5.4 — Offline First.
   Cachea la interfaz y las librerías del lector durante la primera conexión.
   Los archivos personales siguen en la carpeta elegida por el usuario o en IndexedDB. */
const CACHE_PREFIX = 'pulenta-offline-';
const VERSION = 'v1.5.4-grid-offline-1';
const SHELL_CACHE = CACHE_PREFIX + 'shell-' + VERSION;
const RUNTIME_CACHE = CACHE_PREFIX + 'runtime-' + VERSION;
const SHELL = ['./index.html', './styles.css', './app.js', './manifest.json'];
const REMOTE_LIBS = [
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js'
];

async function cacheRemoteLibrary(url) {
  const cache = await caches.open(RUNTIME_CACHE);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { mode: 'no-cors', cache: 'reload', signal: controller.signal });
    if (response && (response.ok || response.type === 'opaque')) await cache.put(url, response.clone());
  } catch (error) {
    // Si una CDN no responde durante la instalación, la app igual se instala.
    // El próximo intento será en una petición normal con conexión.
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL);
    const runtime = await caches.open(RUNTIME_CACHE);
    // Intentar guardar todas las librerías sin bloquear la instalación si alguna falla.
    await Promise.allSettled(REMOTE_LIBS.map(cacheRemoteLibrary));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const keep = [SHELL_CACHE, RUNTIME_CACHE];
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && !keep.includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put('./index.html', response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) {
        const cache = await caches.open(url.origin === self.location.origin ? SHELL_CACHE : RUNTIME_CACHE);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      // El caché puede tener la URL exacta aunque sea una librería de CDN.
      return (await caches.match(request)) || Response.error();
    }
  })());
});
