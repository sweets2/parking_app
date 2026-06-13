/**
 * app/sw.ts — F-12 PWA Service Worker
 *
 * Compiled to sw.js by esbuild at build time.
 * This file runs inside a ServiceWorkerGlobalScope, not a Window.
 *
 * Strategies:
 *   App shell (index.html, app.js, style.css, manifest.json, Leaflet CDN):
 *     Cache-first — serve from cache, fall back to network.
 *
 *   data/latest.json:
 *     Network-first — try network, update cache on success, fall back to cache.
 *     If both fail, return a plain-text offline message.
 */

// Service worker global scope — typed as unknown to avoid lib conflicts with DOM.
// The TypeScript compiler targets the DOM lib; at runtime this file runs in SW scope.
const sw = self as unknown as {
  skipWaiting(): void;
  clients: { claim(): Promise<void> };
  addEventListener(type: string, listener: (event: Record<string, unknown>) => void): void;
};

const CACHE_NAME = "hoboken-parking-v2";

const APP_SHELL_URLS: string[] = [
  '/',
  'index.html',
  'app.js',
  'style.css',
  'manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asExtendable(event: Record<string, unknown>): {
  waitUntil(promise: Promise<unknown>): void;
} {
  return event as unknown as { waitUntil(promise: Promise<unknown>): void };
}

function asFetchEvent(event: Record<string, unknown>): {
  request: Request;
  respondWith(response: Promise<Response>): void;
} {
  return event as unknown as {
    request: Request;
    respondWith(response: Promise<Response>): void;
  };
}

// ─── Install: pre-cache app shell ─────────────────────────────────────────────

sw.addEventListener("install", (event) => {
  asExtendable(event).waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  // Activate immediately without waiting for existing tabs to close
  sw.skipWaiting();
});

// ─── Activate: delete old caches ──────────────────────────────────────────────

sw.addEventListener("activate", (event) => {
  asExtendable(event).waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  void sw.clients.claim();
});

// ─── Fetch: routing ───────────────────────────────────────────────────────────

sw.addEventListener("fetch", (event) => {
  const fetchEvent = asFetchEvent(event);
  const url = new URL(fetchEvent.request.url);

  // Network-first for latest.json
  if (url.pathname.endsWith("latest.json")) {
    fetchEvent.respondWith(networkFirstLatestJson(fetchEvent.request));
    return;
  }

  // Cache-first for everything else (app shell)
  fetchEvent.respondWith(cacheFirst(fetchEvent.request));
});

// ─── Cache-first strategy ─────────────────────────────────────────────────────

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached !== undefined) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

// ─── Network-first strategy for latest.json ───────────────────────────────────

async function networkFirstLatestJson(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached !== undefined) {
      return cached;
    }
    // Both network and cache failed — return offline fallback
    return new Response(
      "No data available — go online to load parking signs",
      {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      }
    );
  }
}
