const CACHE_NAME = 'roua-v8';

const APP_SHELL = [
  '/',
  '/dashboard',
  '/mobile',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: cache app shell
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

// Helper: only GET requests can be cached
function isCacheable(request) {
  return request.method === 'GET';
}

// ── Push Notification Support ──

// Receive push messages from the server
self.addEventListener('push', (event) => {
  let data = {
    title: 'روعة التجارية',
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

  // Determine correct URL based on which version (mobile/dashboard) the user was on
  const dataUrl = event.notification.data?.url || '';
  // Smart default: if the notification specifies a URL use it, otherwise
  // detect if the user was on mobile or dashboard and route accordingly
  let urlToOpen = dataUrl || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, navigate and focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // If no explicit URL, detect mobile vs desktop from the client URL
          if (!dataUrl) {
            urlToOpen = client.url.includes('/mobile') ? '/mobile' : '/dashboard';
          }
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ── Fetch: network-first for API, cache-first for static assets ──

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── FIX: Bypass Next.js RSC (React Server Components) routing requests ──
  // Next.js App Router performs client-side navigation by fetching RSC payloads.
  // If the SW intercepts these and serves cached HTML, the Next.js router crashes
  // and the navigation silently fails (AbortError).
  const isRSC = 
    url.searchParams.has('_rsc') || 
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-State-Tree') !== null ||
    (request.headers.get('accept') || '').includes('text/x-component');

  if (isRSC) {
    return; // Bypass Service Worker completely for Next.js router fetches
  }

  // Non-GET requests: network only, no caching
  if (!isCacheable(request)) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'Network error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Network-first for API calls (GET only)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful GET API responses briefly
          if (response.ok && isCacheable(request)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache when offline
          return caches.match(request);
        })
    );
    return;
  }

  // Stale-while-revalidate for static assets (JS, CSS, images)
  // This ensures the browser always gets a fresh version eventually
  // while still being fast if cached. Prevents stale JS/HTML mismatch.
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        // Always fetch fresh version in background, serve cached if available
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok && isCacheable(request)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        }).catch(() => cached);
        // Return cached immediately if available, otherwise wait for network
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Network-first for everything else (HTML pages)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && isCacheable(request)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match('/dashboard');
        });
      })
  );
});
