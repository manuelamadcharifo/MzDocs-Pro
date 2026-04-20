/**
 * MzDocs Pro v3 - Service Worker
 * Production-grade service worker with cache strategies
 * Implements cache-first for assets and network-first for API
 * Handles auto-updates and prevents stale cache issues
 */

// Cache version - increment to invalidate all caches
const CACHE_VERSION = 'v1';
const CACHE_NAMES = {
  ASSETS: `assets-${CACHE_VERSION}`,
  API: `api-${CACHE_VERSION}`,
  PAGES: `pages-${CACHE_VERSION}`,
  IMAGES: `images-${CACHE_VERSION}`,
  FONTS: `fonts-${CACHE_VERSION}`
};

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/interactivity-core.js',
  '/interactivity-fix.css'
];

// API endpoints that should use network-first strategy
const API_ENDPOINTS = [
  '/api/',
  '/.netlify/functions/'
];

// Content types that should be cached
const CACHEABLE_CONTENT_TYPES = [
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'image/',
  'font/',
  'application/font',
  'application/x-font-truetype',
  'application/x-font-opentype'
];

/**
 * Install Event - Cache static assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAMES.ASSETS).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to cache:', err);
        // Don't fail install if some assets can't be cached
        return Promise.resolve();
      });
    }).then(() => {
      // Skip waiting to activate immediately
      return self.skipWaiting();
    })
  );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete caches that don't match current version
          if (!Object.values(CACHE_NAMES).includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming clients...');
      return self.clients.claim();
    })
  );
});

/**
 * Fetch Event - Route requests to appropriate cache strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    event.respondWith(
      fetch(request)
        .catch(() => createErrorResponse('Network error'))
    );
    return;
  }

  // API requests - Network-first strategy
  if (isApiRequest(url.pathname)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Document requests (HTML) - Network-first with cache fallback
  if (request.destination === 'document') {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets - Cache-first strategy
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // Default - Network-first
  event.respondWith(networkFirstStrategy(request));
});

/**
 * Cache-First Strategy
 * Try cache first, fall back to network
 * Best for versioned assets (JS, CSS, images with hash)
 */
async function cacheFirstStrategy(request) {
  const cacheName = getCacheName(request.url);
  
  try {
    // Check cache first
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Cache hit:', request.url);
      return cached;
    }

    // Not in cache, fetch from network
    console.log('[SW] Fetching from network:', request.url);
    const response = await fetch(request);

    // Cache successful responses
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      caches.open(cacheName).then((cache) => {
        cache.put(request, responseToCache).catch((err) => {
          console.warn('[SW] Cache put failed:', err);
        });
      });
    }

    return response;
  } catch (error) {
    console.error('[SW] Cache-first error:', error);
    return createErrorResponse('Offline - resource not available');
  }
}

/**
 * Network-First Strategy
 * Try network first, fall back to cache
 * Best for frequently updated content (API, HTML)
 */
async function networkFirstStrategy(request) {
  const cacheName = getCacheName(request.url);
  
  try {
    // Try network first
    console.log('[SW] Fetching from network:', request.url);
    const response = await fetchWithTimeout(request, 5000);

    // Cache successful responses
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      caches.open(cacheName).then((cache) => {
        cache.put(request, responseToCache).catch((err) => {
          console.warn('[SW] Cache put failed:', err);
        });
      });
    }

    return response;
  } catch (error) {
    // Network failed, try cache
    console.log('[SW] Network failed, trying cache for:', request.url);
    
    try {
      const cached = await caches.match(request);
      if (cached) {
        console.log('[SW] Cache hit (fallback):', request.url);
        return cached;
      }
    } catch (cacheError) {
      console.error('[SW] Cache error:', cacheError);
    }

    // No cache available
    return createErrorResponse('Offline - content not available');
  }
}

/**
 * Fetch with timeout
 * Prevents indefinite hanging on slow connections
 */
async function fetchWithTimeout(request, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(request, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Get appropriate cache name based on content type
 */
function getCacheName(url) {
  const urlObj = new URL(url, self.location.origin);
  const pathname = urlObj.pathname;

  if (isApiRequest(pathname)) {
    return CACHE_NAMES.API;
  }

  if (pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
    return CACHE_NAMES.IMAGES;
  }

  if (pathname.match(/\.(woff|woff2|ttf|otf|eot)$/i)) {
    return CACHE_NAMES.FONTS;
  }

  if (pathname.match(/\.html$/i) || pathname === '/') {
    return CACHE_NAMES.PAGES;
  }

  return CACHE_NAMES.ASSETS;
}

/**
 * Check if URL is an API request
 */
function isApiRequest(pathname) {
  return API_ENDPOINTS.some(endpoint => pathname.includes(endpoint));
}

/**
 * Check if URL is a static asset
 */
function isStaticAsset(pathname) {
  return pathname.match(/\.(js|css|jpg|jpeg|png|gif|webp|svg|ico|woff|woff2|ttf|otf|eot)$/i);
}

/**
 * Create error response with offline message
 */
function createErrorResponse(message) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-width: 500px;
          }
          h1 {
            margin: 0 0 10px 0;
            color: #333;
          }
          p {
            margin: 0;
            color: #666;
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📡 You're Offline</h1>
          <p>${message}</p>
          <p style="margin-top: 20px; color: #999; font-size: 14px;">Check your connection and try again.</p>
        </div>
      </body>
    </html>
  `;

  return new Response(htmlContent, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/html; charset=UTF-8'
    }
  });
}

/**
 * Message Handler - Handle messages from clients
 */
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  console.log('[SW] Message received:', type);

  switch (type) {
    // Clear all caches
    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.keys().then((cacheNames) => {
          return Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
          );
        }).then(() => {
          event.ports[0]?.postMessage({ success: true });
        })
      );
      break;

    // Clear specific cache
    case 'CLEAR_CACHE_TYPE':
      event.waitUntil(
        caches.delete(data.cacheName).then(() => {
          event.ports[0]?.postMessage({ success: true });
        })
      );
      break;

    // Get cache stats
    case 'GET_CACHE_STATS':
      event.waitUntil(
        (async () => {
          const stats = {};
          for (const [key, cacheName] of Object.entries(CACHE_NAMES)) {
            try {
              const cache = await caches.open(cacheName);
              const keys = await cache.keys();
              stats[key] = keys.length;
            } catch (err) {
              stats[key] = 0;
            }
          }
          event.ports[0]?.postMessage(stats);
        })()
      );
      break;

    // Skip waiting and activate new version
    case 'SKIP_WAITING':
      self.skipWaiting();
      event.ports[0]?.postMessage({ success: true });
      break;

    default:
      console.warn('[SW] Unknown message type:', type);
  }
});

/**
 * Periodic Background Sync (if supported)
 * Sync pending requests when back online
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-pending-requests') {
    event.waitUntil(syncPendingRequests());
  }
});

/**
 * Sync pending requests from indexedDB
 */
async function syncPendingRequests() {
  // This would sync any pending requests stored in indexedDB
  // Implementation depends on your app's offline-first requirements
  console.log('[SW] Syncing pending requests...');
}

/**
 * Push Notifications (if supported)
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  if (!event.data) {
    console.log('[SW] Push event but no data');
    return;
  }

  const options = {
    body: event.data.text(),
    icon: '/assets/icon-192x192.png',
    badge: '/assets/badge-72x72.png',
    tag: 'notification',
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification('MzDocs Pro', options)
  );
});

/**
 * Notification Click Handler
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Check if window is already open
      for (let client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // If not open, open new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

console.log('[SW] Service Worker loaded');
