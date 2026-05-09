// sw.js — Service Worker com Workbox + offline fallback + idb importado

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');
importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js');

workbox.setConfig({ debug: false });

// ── PRECACHING ──────────────────────────────────────────────────────────────
workbox.precaching.precacheAndRoute([
    { url: '/',               revision: '3.4' },
    { url: '/index.html',     revision: '3.4' },
    { url: '/offline.html',   revision: '3.4' },
    { url: '/manifest.json',  revision: '3.4' },
    // CSS
    { url: '/assets/css/styles.css',  revision: '3.4' },
    { url: '/assets/css/editor.css',  revision: '3.4' },
    { url: '/assets/css/auth.css',    revision: '3.4' },
    { url: '/assets/css/admin.css',   revision: '3.4' },
    // JS — entry point e todos os módulos
    { url: '/assets/js/app.js',                              revision: '3.4' },
    { url: '/assets/js/models/Models.js',                    revision: '3.4' },
    { url: '/assets/js/views/Views.js',                      revision: '3.4' },
    { url: '/assets/js/controllers/DocumentController.js',   revision: '3.4' },
    { url: '/assets/js/controllers/PaymentController.js',    revision: '3.4' },
    { url: '/assets/js/controllers/OCRController.js',        revision: '3.4' },
    { url: '/assets/js/controllers/HistoryController.js',    revision: '3.4' },
    { url: '/assets/js/services/Services.js',                revision: '3.4' },
    { url: '/assets/js/services/ServiceDefinitions.js',      revision: '3.4' },
    { url: '/assets/js/services/PaymentService.js',          revision: '3.4' },
    { url: '/assets/js/services/MPesaService.js',            revision: '3.4' },
    { url: '/assets/js/auth/AuthManager.js',                 revision: '3.4' },
    { url: '/assets/js/auth/AuthUI.js',                      revision: '3.4' },
    { url: '/assets/js/auth/AuthGuard.js',                   revision: '3.4' },
    { url: '/assets/js/components/DocumentEditor.js',        revision: '3.4' },
    { url: '/assets/js/components/PDFExporter.js',           revision: '3.4' },
    { url: '/assets/js/components/WordExporter.js',          revision: '3.4' },
    { url: '/assets/js/components/ExcelExporter.js',         revision: '3.4' },
    { url: '/assets/js/components/SignatureCanvas.js',        revision: '3.4' },
    { url: '/assets/js/utils/Storage.js',                    revision: '3.4' },
    { url: '/assets/js/utils/Formatter.js',                  revision: '3.4' },
    { url: '/assets/js/utils/IndexedDB.js',                  revision: '3.4' },
    // Ícones
    { url: '/assets/icons/icon.svg',            revision: '3.4' },
    { url: '/assets/icons/icon-192x192.png',    revision: '3.4' },
    { url: '/assets/icons/icon-512x512.png',    revision: '3.4' },
    { url: '/assets/icons/apple-touch-icon.png',revision: '3.4' },
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
// IMPORTANTE: /admin.html é EXCLUÍDO do cache — deve sempre ir à rede
// para que a verificação de autenticação funcione correctamente.
const navigationHandler = async (params) => {
    try {
        return await new workbox.strategies.NetworkFirst({ cacheName: 'pages' }).handle(params);
    } catch {
        return caches.match('/offline.html');
    }
};
workbox.routing.registerRoute(
    new workbox.routing.NavigationRoute(navigationHandler, {
        denylist: [/^\/admin\.html/]
    })
);

// /admin.html — sempre da rede, nunca do cache
workbox.routing.registerRoute(
    ({ url }) => url.pathname === '/admin.html',
    new workbox.strategies.NetworkOnly()
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
