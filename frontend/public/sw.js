// VEINMusic PWA Service Worker
const CACHE_NAME = "veinmusic-cache-v5";
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon-512.png",
  "/feed",
  "/leaderboard",
  "/about",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only this site's own GET requests are cached. Everything else (the API
  // on its subdomain, avatars from other hosts, POSTs) goes straight to the
  // network: fetching it from here would be subject to the site's CSP
  // connect-src and fail for image hosts.
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Stale-while-revalidate for pages and static assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse?.status === 200 &&
            networkResponse?.type === "basic"
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        // Offline and nothing cached: a network error, never `undefined`
        .catch(() => cachedResponse || Response.error());

      return cachedResponse || fetchPromise;
    }),
  );
});

// Web Push Notification Handler
self.addEventListener("push", (event) => {
  let data = {
    title: "VEIN Music",
    body: "Новое событие в вашей музыкальной ленте!",
  };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: "/icon-512.png",
    badge: "/icon-512.png",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});
