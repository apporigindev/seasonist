/**
 * sw.js
 * Offline support: precaches the app shell and runtime-caches the CDN
 * dependencies (fonts, MediaPipe runtime + face model) after first use.
 * User photos are never cached — analysis state lives in memory only.
 *
 * BUILD is stamped with the commit SHA by the deploy workflow, so every
 * deploy ships a byte-different sw.js → new install → fresh shell cache.
 */

const BUILD = "__BUILD__";
const SHELL_CACHE = "seasonist-shell-" + BUILD;
// Stable across deploys: holds the immutable versioned CDN payloads (fonts,
// MediaPipe runtime, ~3 MB face model) so shell releases don't re-download them.
const RUNTIME_CACHE = "seasonist-runtime-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/analysis.js",
  "./js/classify.js",
  "./js/palettes.js",
  "./js/compare.js",
  "./manifest.webmanifest",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];

// The MediaPipe ESM bundle is imported before the SW controls the first
// page, so runtime caching alone would never capture it. Best-effort — an
// unreachable CDN must not fail the install.
const CDN_PRECACHE = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14",
];

const RUNTIME_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "storage.googleapis.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      // cache: "reload" bypasses the HTTP cache — never precache a copy that
      // may be up to 10 minutes stale (GitHub Pages serves max-age=600).
      await shell.addAll(APP_SHELL.map((u) => new Request(u, { cache: "reload" })));
      const runtime = await caches.open(RUNTIME_CACHE);
      await Promise.all(CDN_PRECACHE.map((u) => runtime.add(u).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        // "hue-" covers caches from before the app was renamed to Seasonist.
        Promise.all(
          keys
            .filter((k) => (k.startsWith("seasonist-") || k.startsWith("hue-")) && !keep.has(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigate(event, url));
    return;
  }

  // Same-origin assets: serve cached immediately, refresh in the background
  // so content-only deploys still propagate between service-worker updates.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
    return;
  }

  // Known CDNs: cache first — fonts and the MediaPipe runtime/model are
  // immutable-versioned, and this is what makes the app work offline.
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  }
});

async function handleNavigate(event, url) {
  try {
    const res = await fetch(event.request);
    // Refresh the cached shell only from OK responses to the app's own URL —
    // never from 404 pages, raw repo files, or captive-portal responses,
    // which would otherwise poison every offline launch.
    const root = new URL("./", self.location.href).pathname;
    if (res.ok && (url.pathname === root || url.pathname === root + "index.html")) {
      const copy = res.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put("./index.html", copy)));
    }
    return res;
  } catch {
    return (await caches.match("./index.html")) || Response.error();
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const cached = await caches.match(event.request);
  const refresh = fetch(event.request).then(async (res) => {
    if (res.status === 200) {
      const cache = await caches.open(cacheName);
      await cache.put(event.request, res.clone());
    }
    return res;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh.catch(async () => (await caches.match(event.request)) || Response.error());
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  // Only verified-complete responses: never cache partial (206) responses,
  // and never opaque bodies that could hide an error page.
  if (res.status === 200) {
    const cache = await caches.open(cacheName);
    try {
      await cache.put(request, res.clone());
    } catch {
      // Quota or clone failures must not break the response.
    }
  }
  return res;
}
