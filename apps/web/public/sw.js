/* VideoGen service worker: caches the app shell only. The API, the live event stream (/events) and media (Range) always go to the
 * network untouched. Rules mirror apps/web/src/lib/sw-routes.ts (test/sw-routes.test.ts keeps them equal). */
const RULES = {"bypass":["^/api/","^/events"],"asset":["^/assets/","^/icons/","^/k19/","^/favicon\\.svg$","^/manifest\\.webmanifest$"]};
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `vg-shell-${BUILD}`;
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon-180.png'];
const NAV_TIMEOUT_MS = 4000;

function classify(r, origin) {
  const u = new URL(r.url);
  if (r.method !== 'GET' || r.range || u.origin !== origin) return 'bypass';
  if (RULES.bypass.some((p) => new RegExp(p).test(u.pathname))) return 'bypass';
  if (RULES.asset.some((p) => new RegExp(p).test(u.pathname))) return 'asset';
  return r.mode === 'navigate' ? 'shell' : 'bypass';
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('vg-shell-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The page asks for the new version only when the user taps Reload (no silent reload in the middle of a production).
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

async function shell(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(request), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), NAV_TIMEOUT_MS))]);
    if (res.ok) await cache.put('/', res.clone());
    return res;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const r = e.request;
  const route = classify({ url: r.url, method: r.method, mode: r.mode, range: r.headers.has('range') }, self.location.origin);
  if (route === 'bypass') return;
  e.respondWith(route === 'shell' ? shell(r) : asset(r));
});
