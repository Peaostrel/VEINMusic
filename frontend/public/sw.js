// VEINMusic PWA Service Worker
const CACHE_NAME = "veinmusic-cache-v7";
// Answers of the API, so the feed, profiles and statistics opened before
// still show without a connection. The pages delete it on login and logout
// (clearOfflineCache in app/lib/offline.ts).
const API_CACHE = "veinmusic-api-v1";
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = ["/manifest.json", "/icon-512.png", OFFLINE_URL];

// The API lives on another origin; the page passes it when registering
const API_ORIGIN = (() => {
  try {
    return new URL(new URL(self.location.href).searchParams.get("api")).origin;
  } catch {
    return null;
  }
})();

// Read-only API answers worth keeping for offline reading
const API_CACHED_PATHS = [
  /^\/api\/(global-history|friends-history|history-friends)\b/,
  /^\/api\/user\/[^/]+$/,
  /^\/api\/(stats|history|follow-stats|detailed-stats)\//,
  /^\/api\/achievements\/all\//,
  /^\/api\/profile\/preferences$/,
  /^\/api\/music\/(artist|track)\//,
  /^\/api\/leaderboard\b/,
  /^\/api\/discovery\/taste-twins\b/,
  /^\/api\/integrations\/status$/,
];
const API_CACHE_LIMIT = 150;
// On a bad connection wait this long before falling back to the cache
const API_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== API_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
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
    const cached = await cache.match(request);
    if (cached) return cached;
    // A page never opened before: say that there is no connection
    if (request.mode === "navigate") {
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return Response.error();
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  // Oldest entries first (insertion order)
  await Promise.all(
    keys
      .slice(0, Math.max(0, keys.length - API_CACHE_LIMIT))
      .map((key) => cache.delete(key)),
  );
}

// Pages add ?t=<timestamp> to dodge HTTP caches; it must not split the key
const CACHE_BUSTERS = ["t", "_", "ts"];

function apiCacheKey(request) {
  const url = new URL(request.url);
  for (const name of CACHE_BUSTERS) url.searchParams.delete(name);
  return url.toString();
}

async function apiNetworkFirst(request) {
  const cache = await caches.open(API_CACHE);
  const key = apiCacheKey(request);
  const timeout = new Promise((resolve) =>
    setTimeout(resolve, API_TIMEOUT_MS, null),
  );
  const network = fetch(request).then(async (response) => {
    if (response.status === 200) {
      await cache.delete(key);
      await cache.put(key, response.clone());
      await trim(cache);
    }
    return response;
  });
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
    // Slow network: a saved answer now, or keep waiting for the network
    return (await cache.match(key)) || (await network);
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;

  if (API_ORIGIN && url.origin === API_ORIGIN) {
    if (API_CACHED_PATHS.some((re) => re.test(url.pathname))) {
      event.respondWith(apiNetworkFirst(request));
    }
    return;
  }

  // Only this site's own requests besides the API. Avatars and covers from
  // other hosts go straight to the network: fetching them from here would
  // be subject to the site's CSP connect-src and fail.
  if (url.origin !== self.location.origin) {
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
