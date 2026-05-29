const CACHE_NAME = 'roua-v221-resilient';

// Assets to pre-cache during install.
// All URLs use paths that BYPASS next-intl middleware:
//   - /sw.js, /manifest.json, /favicon.svg, /offline.html → served from public/ before middleware
//   - /api/pwa-asset?file=... → API routes never hit middleware
const APP_SHELL = [
  '/manifest.json',
  '/favicon.svg',
  '/api/pwa-asset?file=icon-192.png',
  '/api/pwa-asset?file=icon-512.png',
  '/offline.html',
];

// ── Install: cache static assets (RESILIENT — one failure doesn't kill the SW) ──
self.addEventListener('install', (event) => {
  // skipWaiting FIRST so the new SW activates immediately,
  // even if caching takes time or partially fails
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use Promise.allSettled instead of cache.addAll
      // cache.addAll rejects ENTIRELY if ANY single file fails
      // Promise.allSettled caches what it can and logs failures
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          fetch(url)
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
              console.warn('[SW] Failed to cache (non-OK):', url, response.status);
            })
            .catch((err) => {
              console.warn('[SW] Failed to cache:', url, err.message);
            })
        )
      );
    })
  );
});

// ── Activate: clean old caches + claim clients immediately ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Push Notification Support ──
self.addEventListener('push', (event) => {
  let data = {
    title: 'رؤى للتداول',
    body: 'لديك إشعار جديد',
    icon: '/api/pwa-asset?file=icon-192.png',
    badge: '/api/pwa-asset?file=icon-192.png',
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

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Pass through all RSC requests (Next.js App Router client-side navigation)
  if (
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('rsc') === '1' ||
    (request.headers.get('accept') || '').includes('text/x-component')
  ) {
    return;
  }

  // Pass through all API calls and WebSocket — never cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) {
    return;
  }

  // ── Navigation requests: Network-first with offline fallback ──
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match('/offline.html').then((offlinePage) => {
              if (offlinePage) return offlinePage;
              // Ultimate fallback: return a basic offline response
              return new Response(
                '<html><body style="background:#0B0E14;color:#fff;font-family:sans-serif;text-align:center;padding-top:40vh"><h1>لا يوجد اتصال</h1><p>تحقق من اتصال الإنترنت وحاول مرة أخرى</p></body></html>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              );
            });
          });
        })
    );
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
