const CACHE_NAME = 'roua-v204-pwa-enabled';

const APP_SHELL = [
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ── Push Notification Support ──

self.addEventListener('push', (event) => {
  let data = {
    title: 'رؤى للتداول',
    body: 'لديك إشعار جديد',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'roua-notification',
    data: {},
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    dir: 'rtl',
    lang: 'ar',
    vibrate: [100, 50, 100],
    actions: data.actions || [
      { action: 'open', title: 'فتح' },
      { action: 'dismiss', title: 'إغلاق' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const dataUrl = event.notification.data?.url || '';
  let urlToOpen = dataUrl || '/ar/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ── Fetch: Smart caching that preserves Next.js routing ──

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass through all navigation requests (clicking links, back/forward)
  if (request.mode === 'navigate') {
    return;
  }

  // Pass through all RSC requests (Next.js App Router client-side navigation)
  if (
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('rsc') === '1' ||
    (request.headers.get('accept') || '').includes('text/x-component')
  ) {
    return;
  }

  // Pass through all API calls and WebSocket - never cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) {
    return;
  }

  // Cache static assets (_next/static/) with cache-first strategy
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Cache images, icons, manifest with cache-first
  if (
    request.destination === 'image' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.svg' ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.svg')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network only
});
