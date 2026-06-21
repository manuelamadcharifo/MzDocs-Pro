// sw.js — Service Worker com Workbox + offline fallback + idb importado
//
// 🔑 CACHE_VERSION: mudar este valor a cada deploy para invalidar o cache
//    em todos os clientes e forçar download dos ficheiros novos.
//    Formato sugerido: 'v<versao>-<YYYYMMDD>' ex: 'v7-20260515'
const CACHE_VERSION = 'v17-20260621b'; // Editor de Documentos: Preview agora usa o mesmo motor A4Renderer (folhas reais); tabelas corrigidas no modo Editar

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
    { url: '/assets/js/utils/Sanitizer.js',                   revision: CACHE_VERSION },
    { url: '/assets/js/components/PDFExporter.js',           revision: CACHE_VERSION },
    { url: '/assets/js/components/WordExporter.js',          revision: CACHE_VERSION },
    { url: '/assets/js/components/HTMLToDocxExporter.js',    revision: CACHE_VERSION },
    { url: '/assets/js/components/ExcelExporter.js',         revision: CACHE_VERSION },
    { url: '/assets/js/utils/Storage.js',                    revision: CACHE_VERSION },
    { url: '/assets/js/utils/Formatter.js',                  revision: CACHE_VERSION },
    { url: '/assets/js/utils/IndexedDB.js',                  revision: CACHE_VERSION },
    { url: '/assets/js/utils/A4Renderer.js',                 revision: CACHE_VERSION },
    // Marketplace & Academic modules
    { url: '/assets/js/marketplace/TemplatePicker.js',       revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/TemplateLibrary.js',      revision: CACHE_VERSION },
    { url: '/assets/js/academic/AcademicEngine.js',          revision: CACHE_VERSION },
    { url: '/assets/js/academic/AcademicUI.js',              revision: CACHE_VERSION },
    { url: '/assets/js/controllers/TemplateController.js',   revision: CACHE_VERSION },
    // CORRIGIDO (auditoria A-2): ficheiros que existiam no disco mas não
    // estavam na lista de precache — causavam falha offline silenciosa.
    { url: '/assets/js/homeController.js',                   revision: CACHE_VERSION },
    { url: '/assets/js/analytics/Analytics.js',              revision: CACHE_VERSION },
    { url: '/assets/js/components/HTMLPDFExporter.js',       revision: CACHE_VERSION },
    { url: '/assets/js/partners/NearbyPartners.js',          revision: CACHE_VERSION },
    { url: '/assets/js/convert/FileConverter.js',            revision: CACHE_VERSION },
    { url: '/assets/js/admin/AdminApp.js',                   revision: CACHE_VERSION },
    { url: '/assets/js/admin/AdminDashboard.js',             revision: CACHE_VERSION },
    { url: '/assets/js/admin/AdminTransactions.js',          revision: CACHE_VERSION },
    // Ícones
    { url: '/assets/icons/icon.svg',            revision: CACHE_VERSION },
    { url: '/assets/icons/icon-192x192.png',    revision: CACHE_VERSION },
    { url: '/assets/icons/icon-512x512.png',    revision: CACHE_VERSION },
    { url: '/assets/icons/apple-touch-icon.png',revision: CACHE_VERSION },
]);

// ── ESTRATÉGIAS DE CACHE ────────────────────────────────────────────────────
// Google Fonts — usar NetworkFirst com fallback silencioso.
workbox.routing.registerRoute(
    /^https:\/\/fonts\.googleapis\.com\//,
    new workbox.strategies.NetworkFirst({
        cacheName: `google-fonts-${CACHE_VERSION}`,
        networkTimeoutSeconds: 3,
        plugins: [
            new workbox.expiration.ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
            {
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

// CORRIGIDO: CDN (jsdelivr) usa NetworkFirst em vez de StaleWhileRevalidate.
// StaleWhileRevalidate servia versões antigas de módulos JS enquanto carregava novas
// em background — isso causava módulos misturados na mesma sessão e os event
// listeners ficavam "pendurados" em instâncias antigas (botões que param de funcionar).
workbox.routing.registerRoute(
    /^https:\/\/cdn\.jsdelivr\.net\//,
    new workbox.strategies.NetworkFirst({
        cacheName: `cdn-libraries-${CACHE_VERSION}`,
        networkTimeoutSeconds: 5,
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

// CORRIGIDO: usar NetworkOnly para generate-document.
// BackgroundSyncPlugin foi removido intencionalmente:
// — O crédito é debitado ANTES da chamada à IA pelo cliente.
// — Um retry silencioso em background não mostra resultado ao utilizador
//   mas consome o crédito uma segunda vez se o deduct-credit for chamado de novo,
//   e deixa o utilizador sem feedback (sintoma: "debitou mas não gerou").
// — Em caso de falha de rede, o DocumentController já trata com _queueOffline()
//   via IndexedDB + sync manual, que SÍ notifica o utilizador.
workbox.routing.registerRoute(
    /\/api\/generate-document/,
    new workbox.strategies.NetworkOnly()
);

// ── OFFLINE FALLBACK PARA NAVEGAÇÃO ────────────────────────────────────────
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
        Promise.all([
            // 1. Apagar caches antigos
            caches.keys().then(keys => Promise.all(
                keys
                    .filter(k => !k.endsWith(CACHE_VERSION) && k !== 'workbox-precache-v2')
                    .map(k => {
                        console.log('[SW] A apagar cache antigo:', k);
                        return caches.delete(k);
                    })
            )),
            // 2. Tomar controlo imediato de todos os clientes
            self.clients.claim(),
        ]).then(() => {
            // CORRIGIDO: notificar clientes com postMessage em vez de client.navigate().
            // client.navigate() forçava reload imediato mesmo com modais abertos ou
            // documento a ser gerado — causava botões que param de funcionar porque
            // os event listeners ficavam presos numa instância antiga do controller.
            // Com postMessage, o cliente decide quando é seguro recarregar
            // (sem modal aberto e sem geração em curso) — ver listener em app.js.
            return self.clients.matchAll({ type: 'window' }).then(clientList => {
                clientList.forEach(client => {
                    try {
                        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
                    } catch (_) { /* ignorar se o cliente já não existe */ }
                });
            });
        })
    );
});
