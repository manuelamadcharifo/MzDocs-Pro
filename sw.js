// sw.js — Service Worker com Workbox + offline fallback + idb importado
//
// 🔑 CACHE_VERSION: mudar este valor a cada deploy para invalidar o cache
//    em todos os clientes e forçar download dos ficheiros novos.
//    Formato sugerido: 'v<versao>-<YYYYMMDD>' ex: 'v7-20260515'
const CACHE_VERSION = 'v9-20260521'; // auto-gerado pelo build — não editar manualmente

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');
importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js');

workbox.setConfig({ debug: false });

// ── PRECACHING ──────────────────────────────────────────────────────────────
workbox.precaching.precacheAndRoute([
    { url: '/',               revision: CACHE_VERSION },
    { url: '/index.html',     revision: CACHE_VERSION },
    { url: '/offline.html',   revision: CACHE_VERSION },
    { url: '/manifest.json',  revision: CACHE_VERSION },
    // CSS
    { url: '/assets/css/styles.css',  revision: CACHE_VERSION },
    { url: '/assets/css/editor.css',  revision: CACHE_VERSION },
    { url: '/assets/css/auth.css',    revision: CACHE_VERSION },
    { url: '/assets/css/admin.css',   revision: CACHE_VERSION },
    // JS — entry point e todos os módulos
    { url: '/assets/js/app.js',                              revision: CACHE_VERSION },
    { url: '/assets/js/models/Models.js',                    revision: CACHE_VERSION },
    { url: '/assets/js/views/Views.js',                      revision: CACHE_VERSION },
    { url: '/assets/js/controllers/DocumentController.js',   revision: CACHE_VERSION },
    { url: '/assets/js/controllers/PaymentController.js',    revision: CACHE_VERSION },
    { url: '/assets/js/controllers/OCRController.js',        revision: CACHE_VERSION },
    { url: '/assets/js/controllers/HistoryController.js',    revision: CACHE_VERSION },
    { url: '/assets/js/services/Services.js',                revision: CACHE_VERSION },
    { url: '/assets/js/services/ServiceDefinitions.js',      revision: CACHE_VERSION },
    { url: '/assets/js/services/SmartOCRService.js',         revision: CACHE_VERSION },
    { url: '/assets/js/services/LongDocumentEngine.js',      revision: CACHE_VERSION },
    { url: '/assets/js/services/PaymentService.js',          revision: CACHE_VERSION },
    { url: '/assets/js/services/MPesaService.js',            revision: CACHE_VERSION },
    { url: '/assets/js/auth/AuthManager.js',                 revision: CACHE_VERSION },
    { url: '/assets/js/auth/AuthUI.js',                      revision: CACHE_VERSION },
    { url: '/assets/js/auth/AuthGuard.js',                   revision: CACHE_VERSION },
    { url: '/assets/js/components/DocumentEditor.js',        revision: CACHE_VERSION },
    { url: '/assets/js/utils/ExportManager.js',               revision: CACHE_VERSION },
    { url: '/assets/js/utils/Sanitizer.js',                   revision: CACHE_VERSION },
    { url: '/assets/js/components/PDFExporter.js',           revision: CACHE_VERSION },
    { url: '/assets/js/components/WordExporter.js',          revision: CACHE_VERSION },
    { url: '/assets/js/components/ExcelExporter.js',         revision: CACHE_VERSION },
    { url: '/assets/js/components/SignatureCanvas.js',        revision: CACHE_VERSION },
    { url: '/assets/js/utils/Storage.js',                    revision: CACHE_VERSION },
    { url: '/assets/js/utils/Formatter.js',                  revision: CACHE_VERSION },
    { url: '/assets/js/utils/IndexedDB.js',                  revision: CACHE_VERSION },
    // Ícones
    { url: '/assets/icons/icon.svg',            revision: CACHE_VERSION },
    { url: '/assets/icons/icon-192x192.png',    revision: CACHE_VERSION },
    { url: '/assets/icons/icon-512x512.png',    revision: CACHE_VERSION },
    { url: '/assets/icons/apple-touch-icon.png',revision: CACHE_VERSION },
]);

// ── ESTRATÉGIAS DE CACHE ────────────────────────────────────────────────────
// Google Fonts — usar NetworkFirst com fallback silencioso.
// A CSP do documento inclui fonts.googleapis.com e fonts.gstatic.com no connect-src,
// mas o SW herdava uma CSP antiga em cache. NetworkFirst tenta a rede e,
// se falhar (ex: offline), serve do cache sem lançar erro.
workbox.routing.registerRoute(
    /^https:\/\/fonts\.googleapis\.com\//,
    new workbox.strategies.NetworkFirst({
        cacheName: `google-fonts-${CACHE_VERSION}`,
        networkTimeoutSeconds: 3,
        plugins: [
            new workbox.expiration.ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
            {
                // Capturar erros de rede/CSP silenciosamente — não bloquear a página
                fetchDidFail: async () => { /* silencioso */ },
                handlerDidError: async () => Response.error(),
            }
        ]
    })
);

workbox.routing.registerRoute(
    /^https:\/\/fonts\.gstatic\.com\//,
    new workbox.strategies.NetworkFirst({
        cacheName: `google-fonts-files-${CACHE_VERSION}`,
        networkTimeoutSeconds: 3,
        plugins: [
            new workbox.expiration.ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }),
            {
                fetchDidFail: async () => { /* silencioso */ },
                handlerDidError: async () => Response.error(),
            }
        ]
    })
);

workbox.routing.registerRoute(
    /^https:\/\/cdn\.jsdelivr\.net\//,
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: `cdn-libraries-${CACHE_VERSION}`,
        plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 })]
    })
);

workbox.routing.registerRoute(
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
    new workbox.strategies.CacheFirst({
        cacheName: `images-${CACHE_VERSION}`,
        plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 })]
    })
);

// NOTE: BackgroundSync is only triggered on actual network failures (fetch throws),
// NOT on server errors (409, 500 etc.). The NetworkFirst strategy handles the routing;
// BackgroundSyncPlugin only queues when the network request cannot be made at all.
workbox.routing.registerRoute(
    /\/api\/generate-document/,
    new workbox.strategies.NetworkFirst({
        cacheName: `api-cache-${CACHE_VERSION}`,
        networkTimeoutSeconds: 30,
        plugins: [
            new workbox.backgroundSync.BackgroundSyncPlugin('document-queue', {
                maxRetentionTime: 24 * 60,
                onSync: async ({ queue }) => {
                    let entry;
                    while ((entry = await queue.shiftRequest())) {
                        try {
                            const response = await fetch(entry.request.clone());
                            // Only consider it a success if the server returned 2xx
                            if (!response.ok) {
                                // Server error — do NOT requeue, discard silently
                                console.warn('[SW] Background sync: server returned', response.status, '— discarding');
                            }
                        } catch (error) {
                            // Real network failure — requeue for later
                            await queue.unshiftRequest(entry);
                            throw error;
                        }
                    }
                },
            })
        ]
    })
);

// ── OFFLINE FALLBACK PARA NAVEGAÇÃO ────────────────────────────────────────
// IMPORTANTE: /admin.html é EXCLUÍDO do cache — deve sempre ir à rede
// para que a verificação de autenticação funcione correctamente.
const navigationHandler = async (params) => {
    try {
        return await new workbox.strategies.NetworkFirst({ cacheName: `pages-${CACHE_VERSION}` }).handle(params);
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
    try {
        const db = await idb.openDB('mzdocs-offline', 1);
        const pending = await db.getAll('pending');
        for (const item of pending) {
            try {
                const res = await fetch('/api/generate-document', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(item.body?._authToken ? { 'Authorization': `Bearer ${item.body._authToken}` } : {})
                    },
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
            } catch (e) { console.error('[SW] Sync item error:', e); }
        }
    } catch (e) { console.error('[SW] syncDocuments error:', e); }
}

// ── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
    const data = event.data?.json() || {};
    event.waitUntil(
        self.registration.showNotification(data.title || 'MzDocs Pro', {
            body: data.body || 'Nova notificação',
            icon: '/assets/icons/icon-192x192.png',
            badge: '/assets/icons/icon-192x192.png',
            data: data.url || '/'
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data));
});

// ── LIFECYCLE ────────────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    // Apagar todos os caches que NÃO pertencem à versão actual
                    .filter(k => !k.endsWith(CACHE_VERSION) && k !== 'workbox-precache-v2')
                    .map(k => {
                        console.log('[SW] A apagar cache antigo:', k);
                        return caches.delete(k);
                    })
            ))
            .then(() => self.clients.claim())
    );
});
