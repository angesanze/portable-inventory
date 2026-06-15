/**
 * Minimal Service Worker for Varasto widget offline support.
 *
 * Strategy:
 * - Static assets (JS, CSS, HTML, images): cache-first
 * - API calls: network-first with no cache fallback (operations queue in IndexedDB)
 */

const CACHE_NAME = "pi-widget-v1";
const STATIC_EXTENSIONS = [".js", ".css", ".html", ".svg", ".png", ".jpg", ".woff2"];

self.addEventListener("install", (event) => {
    // Activate immediately — no need to wait for old SW
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    // Claim all clients so the SW starts intercepting right away
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests (POST operations are handled by IndexedDB queue)
    if (event.request.method !== "GET") return;

    // API calls: network-first, no cache fallback
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/widget/")) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(
                    JSON.stringify({ detail: "Offline" }),
                    { status: 503, headers: { "Content-Type": "application/json" } }
                );
            })
        );
        return;
    }

    // Static assets: cache-first
    const isStatic = STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
    if (isStatic) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // HTML navigation: network-first, fall back to cache
    if (event.request.headers.get("accept")?.includes("text/html")) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
                .then((response) => response || caches.match("/"))
        );
        return;
    }
});
