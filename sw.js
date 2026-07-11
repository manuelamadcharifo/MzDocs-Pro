// sw.js — Service Worker com Workbox + offline fallback + idb importado
//
// 🔑 CACHE_VERSION: mudar este valor a cada deploy para invalidar o cache
//    em todos os clientes e forçar download dos ficheiros novos.
//    Formato sugerido: 'v<versao>-<YYYYMMDD>' ex: 'v7-20260515'
const CACHE_VERSION = 'v24-20260711'; // Push notifications: notificationclick foca aba existente em vez de abrir sempre nova; vibrate/tag/renotify adicionados ao showNotification.

// CORRIGIDO (bug crítico — causa raiz de "a app não abre sem dados/internet"):
// Antes, o Service Worker carregava o Workbox e o idb via importScripts a partir
// de CDNs externos (storage.googleapis.com, cdn.jsdelivr.net) EM TEMPO DE
// INSTALAÇÃO/ACTIVAÇÃO do próprio SW. O loader "workbox-sw.js" além disso faz,
// internamente, mais importScripts em cadeia para cada submódulo usado
// (workbox-core, workbox-precaching, workbox-strategies, workbox-routing,
// workbox-expiration), todos pedidos ao vivo à CDN da Google. Se o telemóvel
// estivesse sem dados exactamente no momento em que o browser tenta (re)instalar
// o SW — o que acontece sempre que o ficheiro sw.js muda, ou seja, a cada
// deploy — TODas essas importScripts falhavam, a instalação do SW abortava, e
// sem um SW activo a app deixa de ter QUALQUER capacidade offline: mesmo o
// "/index.html" já precacheado nunca chegava a ser servido, e o utilizador via
// o ecrã de erro nativo do browser em vez da app ou do offline.html.
// Agora o Workbox e o idb estão auto-alojados em /assets/vendor/ — ficheiros
// estáticos normais, servidos como qualquer outro asset do site, sem depender
// de uma CDN de terceiros estar acessível no momento exacto da instalação.
importScripts('/assets/vendor/workbox/workbox-sw.js');
importScripts('/assets/vendor/idb.umd.js');

workbox.setConfig({ debug: false, modulePathPrefix: '/assets/vendor/workbox' });

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
    // CORRIGIDO: faltavam TODOS os 14 prompt builders (./services/prompts/*.js,
    // importados em cascata por Services.js → sem eles, NENHUM documento pode
    // ser gerado offline, porque o import ES module falha), os 14 templates do
    // marketplace (./marketplace/templates/*.js, importados por
    // TemplateLibrary.js → sem eles, "Escolher Modelo" falha offline), e mais
    // 3 módulos auxiliares (SampleData.js, LegalContext.js,
    // DocumentEditorStyles.js, pageSimulationScript.js). Esta lacuna repetia
    // exactamente o mesmo tipo de bug já registado como "auditoria A-2" mais
    // abaixo — novos ficheiros criados depois daquela auditoria nunca foram
    // adicionados ao precache.
    { url: '/assets/js/services/prompts/index.js',           revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/cv.js',               revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/carta.js',             revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/trabalho.js',          revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/arrendamento.js',      revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/requerimento.js',      revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/recibo.js',            revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/procuracao.js',        revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/orcamento.js',         revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/residencia.js',        revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/prestacao.js',         revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/recomendacao.js',      revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/planonegocio.js',      revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/licenca.js',           revision: CACHE_VERSION },
    { url: '/assets/js/services/prompts/acta.js',              revision: CACHE_VERSION },
    { url: '/assets/js/services/LegalContext.js',              revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/SampleData.js',              revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/index.js',         revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/cv.js',             revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/carta.js',          revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/trabalho.js',       revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/arrendamento.js',   revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/requerimento.js',   revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/recibo.js',         revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/procuracao.js',     revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/orcamento.js',      revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/residencia.js',     revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/prestacao.js',      revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/recomendacao.js',   revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/planonegocio.js',   revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/licenca.js',        revision: CACHE_VERSION },
    { url: '/assets/js/marketplace/templates/acta.js',           revision: CACHE_VERSION },
    { url: '/assets/js/components/DocumentEditorStyles.js',      revision: CACHE_VERSION },
    { url: '/assets/js/components/pageSimulationScript.js',      revision: CACHE_VERSION },
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
// CORRIGIDO: dois problemas que faziam a app "não abrir" sem dados/internet:
// 1. Sem networkTimeoutSeconds, o NetworkFirst esperava indefinidamente por
//    uma rede instável (sinal fraco/sem dados mas com wi-fi "ligado" sem
//    internet real) antes de desistir — parecia que a app tinha travado.
// 2. Em falha, ia direto para '/offline.html' sem primeiro tentar a app
//    shell já precacheada ('/index.html'). Isso é irrelevante para o URL
//    exacto "/" (que o precache já intercepta antes disto), mas afecta
//    QUALQUER outro pedido de navegação — ex: "/?ref=MAN77831" (o link do
//    panfleto com QR code), "/perfil.html", "/templates.html" — que nunca
//    tinham sido visitados com rede nesta versão do cache. Agora, se a
//    cache de páginas também falhar, tenta servir a app shell precacheada
//    antes de desistir para offline.html.
const navigationHandler = async (params) => {
    try {
        return await new workbox.strategies.NetworkFirst({
            cacheName: `pages-${CACHE_VERSION}`,
            networkTimeoutSeconds: 4,
        }).handle(params);
    } catch {
        const shell = await caches.match('/index.html');
        if (shell) return shell;
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
            icon: data.icon || '/assets/icons/icon-192x192.png',
            badge: '/assets/icons/icon-192x192.png',
            data: data.url || '/',
            vibrate: [100, 50, 100],
            tag: 'mzdocs-push', // notificações novas substituem a anterior, sem empilhar
            renotify: true,
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const targetUrl = event.notification.data || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (const client of windowClients) {
                // Já há uma aba aberta da app — foca-a e navega, em vez de abrir outra.
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(targetUrl).catch(() => {});
                    return client.focus();
                }
            }
            return clients.openWindow(targetUrl);
        })
    );
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
