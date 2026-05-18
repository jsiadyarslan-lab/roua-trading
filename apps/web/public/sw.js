const CACHE_NAME = 'roua-v200-rebuild';

const APP_SHELL = [
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: cache only static assets (NOT HTML pages)
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
  let urlToOpen = dataUrl || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if (!dataUrl) {
            urlToOpen = client.url.includes('/mobile') ? '/mobile' : '/dashboard';
          }
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ── Fetch: MINIMAL caching to never break Next.js navigation ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ══════════════════════════════════════════════════════════════
  // CRITICAL: Let the browser handle ALL navigation and HTML fetches
  // DO NOT intercept:
  //   - Any GET request for a page (text/html)
  //   - RSC payload requests (Next.js client-side routing)
  //   - Anything with _rsc query param
  //   - Anything from the same origin that is a document navigation
  // ══════════════════════════════════════════════════════════════

  // Pass through all navigation requests (clicking links, back/forward)
  if (request.mode === 'navigate') {
    return; // browser handles it natively
  }

  // Pass through all RSC requests (Next.js App Router client-side navigation)
  if (
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('rsc') === '1' ||
    (request.headers.get('accept') || '').includes('text/x-component')
  ) {
    return; // bypass SW completely
  }

  // Pass through all API calls - never cache, always network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) {
    return; // browser handles it natively
  }

  // Only cache static assets (_next/static/) with cache-first strategy
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

  // Cache small static files (icons, manifest) with cache-first
  if (
    request.destination === 'image' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.svg' ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico')
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

  // Everything else: network only, no caching, no fallback
  // This prevents the SW from ever returning a stale/wrong response
  // that breaks Next.js routing.
});
