// VEINMusic PWA Service Worker
const CACHE_NAME = "veinmusic-cache-v6";
const PRECACHE_URLS = ["/manifest.json", "/icon-512.png"];

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

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response?.status === 200 && response?.type === "basic") {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

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

  // Pages and RSC payloads must not stay pinned to an old deployment.
  if (
    request.mode === "navigate" ||
    !url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Next.js static bundle names contain a content hash and are immutable.
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      const response = await fetch(request);
      if (response?.status === 200 && response?.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
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
