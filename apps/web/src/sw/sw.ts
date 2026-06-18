/// <reference lib="webworker" />
import type { SerwistGlobalConfig } from "serwist";
import { Serwist, cacheNames } from "serwist";
import { PrecacheFallbackPlugin } from "@serwist/precaching";
import { NetworkFirst, CacheFirst } from "@serwist/strategies";
import { ExpirationPlugin } from "@serwist/expiration";
import { CacheableResponsePlugin } from "@serwist/cacheable-response";
import { registerRoute, NavigationRoute } from "@serwist/routing";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (string | URL | { url: URL | string; revision: string | null })[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST as any,
  skipWaiting: true,
  clientsClaim: true,
  disableDevLogs: true,
});

// ── Navigation: Network-first with offline fallback ──
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: cacheNames.precache,
      networkTimeoutSeconds: 10,
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new PrecacheFallbackPlugin({
          fallbackUrls: [{ url: "/offline.html" }] as any,
          serwist,
        } as any),
      ],
    })
  )
);

// ── Static assets: Cache-first ──
registerRoute(
  ({ url }) => url.pathname.startsWith("/_next/static/"),
  new CacheFirst({
    cacheName: "next-static",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// ── Images/Icons: Cache-first ──
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "pwa-images",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// ── Push Notifications ──
self.addEventListener("push", (event) => {
  let data: Record<string, unknown> = {
    title: "رؤى للتداول",
    body: "لديك إشعار جديد",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "roua-notification",
    data: {},
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title as string, {
      body: data.body as string,
      icon: data.icon as string,
      badge: data.badge as string,
      tag: data.tag as string,
      data: data.data,
      dir: "rtl",
      lang: "ar",
      vibrate: [100, 50, 100],
      // V268: cast actions to any — the Notifications API type in TS lib.dom
      // doesn't include the `actions` field (it's a Web Notifications extension).
      // The runtime supports it on Chrome/Edge/Firefox.
      actions: (data.actions as any) || [
        { action: "open", title: "فتح" },
        { action: "dismiss", title: "إغلاق" },
      ],
    } as any)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const urlToOpen = (event.notification.data as Record<string, string>)?.url || "/ar/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

serwist.addEventListeners();
