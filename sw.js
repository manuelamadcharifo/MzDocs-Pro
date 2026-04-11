// sw.js — MzDocs Pro v3 Service Worker
const CACHE = 'mzdocs-v3-r1';
const PRECACHE = ['/', '/index.html', '/assets/css/styles.css', '/assets/js/app.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('openrouter.ai')) return;
  if (e.request.url.includes('/.netlify/')) return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('wa.me')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached ||
      fetch(e.request).then(r => {
        if (r && r.status === 200 && r.type !== 'opaque') {
          const responseClone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, responseClone));
        }
        return r;
      }).catch(() => caches.match('/index.html'))
    )
  );
});
