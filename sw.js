// sw.js — Service Worker avançado com Workbox

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

workbox.setConfig({ debug: false });

// ============================================
// PRECACHING — Assets essenciais
// ============================================
workbox.precaching.precacheAndRoute([
    { url: '/', revision: '1.0.0' },
    { url: '/index.html', revision: '1.0.0' },
    { url: '/assets/css/styles.css', revision: '1.0.0' },
    { url: '/assets/js/app.js', revision: '1.0.0' },
    { url: '/manifest.json', revision: '1.0.0' }
]);

// ============================================
// ESTRATÉGIAS DE CACHE
// ============================================

// Google Fonts — Cache First
workbox.routing.registerRoute(
    /^https:\/\/fonts\.googleapis\.com\//,
    new workbox.strategies.CacheFirst({
        cacheName: 'google-fonts-stylesheets',
        plugins: [
            new workbox.expiration.ExpirationPlugin({
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 ano
            })
        ]
    })
);

// CDN libraries — Stale While Revalidate
workbox.routing.registerRoute(
    /^https:\/\/cdn\.jsdelivr\.net\//,
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'cdn-libraries',
        plugins: [
            new workbox.expiration.ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 dias
            })
        ]
    })
);

// Imagens — Cache First
workbox.routing.registerRoute(
    /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
    new workbox.strategies.CacheFirst({
        cacheName: 'images',
        plugins: [
            new workbox.expiration.ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
            })
        ]
    })
);

// API OpenRouter — Network First (sempre tenta rede primeiro)
workbox.routing.registerRoute(
    /\/api\/generate-document/,
    new workbox.strategies.NetworkFirst({
        cacheName: 'api-cache',
        plugins: [
            new workbox.backgroundSync.BackgroundSyncPlugin('document-queue', {
                maxRetentionTime: 24 * 60 // 24 horas
            })
        ]
    })
);

// ============================================
// BACKGROUND SYNC — Fila offline
// ============================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'document-sync') {
        event.waitUntil(syncDocuments());
    }
});

async function syncDocuments() {
    const db = await openDB('mzdocs-offline', 1);
    const tx = db.transaction('pending', 'readonly');
    const store = tx.objectStore('pending');
    const requests = await store.getAll();

    for (const req of requests) {
        try {
            const response = await fetch('/api/generate-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });

            if (response.ok) {
                // Remover da fila
                const deleteTx = db.transaction('pending', 'readwrite');
                await deleteTx.objectStore('pending').delete(req.id);
                
                // Notificar utilizador
                self.registration.showNotification('✅ Documento pronto!', {
                    body: 'Seu documento foi gerado com sucesso.',
                    icon: '/assets/icons/icon-192x192.png',
                    badge: '/assets/icons/badge-72x72.png'
                });
            }
        } catch (err) {
            console.error('Sync failed:', err);
        }
    }
}

// ============================================
// PUSH NOTIFICATIONS
// ============================================
self.addEventListener('push', (event) => {
    const data = event.data?.json() || {};
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'MzDocs Pro', {
            body: data.body || 'Nova notificação',
            icon: '/assets/icons/icon-192x192.png',
            badge: '/assets/icons/badge-72x72.png',
            data: data.url || '/',
            actions: data.actions || []
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data)
    );
});

// ============================================
// INSTALAÇÃO
// ============================================
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});