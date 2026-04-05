// ============================================================
// MzDocs Pro – Service Worker
// Cache estratégico para funcionamento offline
// ============================================================

const CACHE_NAME = 'mzdocs-pro-v1';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@300;400;600;700&display=swap'
];

// ──────────────────────────────────────────────
// INSTALL – guarda os recursos essenciais
// ──────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_URLS).catch(err => {
        console.warn('[SW] Alguns recursos não foram cacheados:', err);
      });
    })
  );
  self.skipWaiting();
});

// ──────────────────────────────────────────────
// ACTIVATE – limpa caches antigos
// ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ──────────────────────────────────────────────
// FETCH – Cache First para recursos locais,
//         Network First para recursos externos
// ──────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Ignora requisições não-GET e pedidos ao WhatsApp
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('wa.me')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cache apenas respostas válidas
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        return response;
      }).catch(() => {
        // Fallback offline – retorna a página principal
        return caches.match('/index.html');
      });
    })
  );
});
