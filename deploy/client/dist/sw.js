/*
 * پودمان‌بان service worker.
 *
 * Rules that matter:
 *  - NEVER touch /api or /socket.io: they carry httpOnly auth cookies and
 *    real-time traffic. Caching them would leak or break sessions.
 *  - Navigations: network-first, fall back to the cached shell when offline.
 *  - Static assets (/assets, /fonts, icons): stale-while-revalidate.
 */
const VERSION = "pb-v1";
const ASSET_CACHE = `${VERSION}-assets`;
const PAGE_CACHE = `${VERSION}-pages`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.addAll(["/"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Auth + realtime: always the network, never the cache.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          // Only cache real pages — a 500/503 error shell must never
          // become the offline fallback.
          if (res.ok) caches.open(PAGE_CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Static assets: serve from cache, refresh in the background.
  const isStatic =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/icon-maskable.svg";
  if (isStatic) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached ?? Response.error());
        return cached ?? network;
      }),
    );
  }
});
