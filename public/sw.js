/* BRWAZWNEON production service worker
 * Cache version: brwazwneon-production-v1
 * Strategy:
 *   - Navigation (HTML): NetworkFirst — always fetch latest, fall back to cache only offline
 *   - JS/CSS under /assets/: CacheFirst — hashed filenames change per deploy, safe to cache
 *   - Images (any format): StaleWhileRevalidate — never block layout
 *   - Everything else: NetworkOnly
 */

const CACHE_NAME = "brwazwneon-production-v1";
const STATIC_ASSET_CACHE = "brwazwneon-assets-v1";
const IMAGE_CACHE = "brwazwneon-images-v1";

// Old cache name patterns to delete on activation
const OLD_CACHE_PATTERNS = [
  /^brw-app-shell-/,
  /^workbox-/,
  /^html-nav/,
  /^images/,
  /^google-fonts/,
  /^brwazwneon-/,
];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Delete old caches
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key === CACHE_NAME || key === STATIC_ASSET_CACHE || key === IMAGE_CACHE) return;
          if (OLD_CACHE_PATTERNS.some((p) => p.test(key))) return caches.delete(key);
          return;
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const pathname = url.pathname;

  // Navigation (HTML) — NetworkFirst
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithTimeout(request, 3000));
    return;
  }

  // Hashed JS/CSS under /assets/ — CacheFirst (immutable by filename)
  if (pathname.startsWith("/assets/") && (pathname.endsWith(".js") || pathname.endsWith(".css") || pathname.endsWith(".mjs"))) {
    event.respondWith(cacheFirst(request, STATIC_ASSET_CACHE));
    return;
  }

  // Images — StaleWhileRevalidate
  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  // Service worker itself — never cache
  if (pathname.endsWith("/sw.js") || pathname.endsWith("firebase-messaging-sw.js")) {
    return;
  }

  // Everything else — network only
  return;
});

/** NetworkFirst with a timeout fallback to cache */
async function networkFirstWithTimeout(request, timeoutMs) {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    if (response && response.ok) {
      const cloned = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}

/** CacheFirst: return cached if available, otherwise fetch and cache */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cloned = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, cloned));
    }
    return response;
  } catch {
    return new Response("", { status: 504, statusText: "Gateway Timeout" });
  }
}

/** StaleWhileRevalidate: return cached immediately, then update cache from network */
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response && response.ok) {
      caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);

  if (cached) {
    // Fire-and-forget the network update
    fetchPromise.catch(() => {});
    return cached;
  }

  // Nothing in cache — wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;
  return new Response("", { status: 504 });
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHES") {
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => OLD_CACHE_PATTERNS.some((p) => p.test(key)) || key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    );
  }
});
