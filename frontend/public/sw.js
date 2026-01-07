/**
 * Service Worker for PWA Capabilities
 *
 * Features:
 * - Offline support
 * - Asset caching
 * - API response caching
 * - Background sync
 */

const CACHE_NAME = 'dermatology-ehr-v1';
const STATIC_CACHE = 'static-v1';
const API_CACHE = 'api-v1';

// Assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );

  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE && cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Claim all clients immediately
  self.clients.claim();
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // API requests - Network First strategy with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful GET requests
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return offline page if no cache
            return caches.match('/offline.html');
          });
        })
    );
    return;
  }

  // Static assets - Cache First strategy
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff|woff2|ttf|eot)$/) ||
    STATIC_ASSETS.includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((response) => {
          // Cache the fetched response
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
    );
    return;
  }

  // HTML pages - Network First strategy
  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          return cachedResponse || caches.match('/offline.html');
        });
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);

  if (event.tag === 'sync-offline-changes') {
    event.waitUntil(syncOfflineChanges());
  }
});

async function syncOfflineChanges() {
  // Implement logic to sync offline changes when connection is restored
  console.log('[Service Worker] Syncing offline changes...');

  // Get offline requests from IndexedDB or cache
  // Send them to server
  // Update UI on success

  return Promise.resolve();
}

// Push notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);

  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    vibrate: [200, 100, 200],
    tag: 'notification',
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification('Dermatology EHR', options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked');

  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});

// Message from client
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] Periodic sync:', event.tag);

  if (event.tag === 'check-updates') {
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  // Check for app updates
  console.log('[Service Worker] Checking for updates...');
  return Promise.resolve();
}
