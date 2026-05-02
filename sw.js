// sw.js — Service Worker com Workbox + offline fallback + idb importado

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');
importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js');

workbox.setConfig({ debug: false });

// ── PRECACHING ──────────────────────────────────────────────────────────────
workbox.precaching.precacheAndRoute([
    { url: '/',               revision: '3.1' },
    { url: '/index.html',     revision: '3.1' },
    { url: '/offline.html',   revision: '3.1' },
    { url: '/manifest.json',  revision: '3.1' },
    { url: '/assets/css/styles.css',  revision: '3.1' },
    { url: '/assets/css/editor.css',  revision: '3.1' },
    { url: '/assets/css/auth.css',    revision: '3.1' },
    { url: '/assets/js/app.js',       revision: '3.1' },
]);

// ── ESTRATÉGIAS DE CACHE ────────────────────────────────────────────────────
workbox.routing.registerRoute(
    /^https:\/\/fonts\.googleapis\.com\//,
    new workbox.strategies.CacheFirst({
        cacheName: 'google-fonts',
        plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 })]
    })
);

workbox.routing.registerRoute(
    /^https:\/\/fonts\.gstatic\.com\//,
    new workbox.strategies.CacheFirst({
        cacheName: 'google-fonts-files',
        plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 })]
    })
);

workbox.routing.registerRoute(
    /^https:\/\/cdn\.jsdelivr\.net\//,
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'cdn-libraries',
        plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 })]
    })
);

workbox.routing.registerRoute(
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
    new workbox.strategies.CacheFirst({
        cacheName: 'images',
        plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 })]
    })
);

workbox.routing.registerRoute(
    /\/api\/generate-document/,
    new workbox.strategies.NetworkFirst({
        cacheName: 'api-cache',
        networkTimeoutSeconds: 30,
        plugins: [new workbox.backgroundSync.BackgroundSyncPlugin('document-queue', { maxRetentionTime: 24 * 60 })]
    })
);

// ── OFFLINE FALLBACK PARA NAVEGAÇÃO ────────────────────────────────────────
const navigationHandler = async (params) => {
    try {
        return await new workbox.strategies.NetworkFirst({ cacheName: 'pages' }).handle(params);
    } catch {
        return caches.match('/offline.html');
    }
};
workbox.routing.registerRoute(
    new workbox.routing.NavigationRoute(navigationHandler)
);

// ── BACKGROUND SYNC ─────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
    if (event.tag === 'document-sync') event.waitUntil(syncDocuments());
});

async function syncDocuments() {
    const db = await idb.openDB('mzdocs-offline', 1);
    const pending = await db.getAll('pending');
    for (const item of pending) {
        try {
            const res = await fetch('/api/generate-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.body)
            });
            if (res.ok) {
                await db.delete('pending', item.id);
                self.registration.showNotification('✅ Documento pronto!', {
                    body: 'O seu documento foi gerado com sucesso.',
                    icon: '/assets/icons/icon-192x192.png',
                    badge: '/assets/icons/icon-192x192.png'
                });
            }
        } catch (e) { console.error('[SW] Sync error:', e); }
    }
}

// ── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
    const data = event.data?.json() || {};
    event.waitUntil(
        self.registration.showNotification(data.title || 'MzDocs Pro', {
            body: data.body || 'Nova notificação',
            icon: '/assets/icons/icon-192x192.png',
            data: data.url || '/'
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data));
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
