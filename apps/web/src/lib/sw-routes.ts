/**
 * What the service worker (public/sw.js) does with a request. `bypass`: the browser goes straight to the network (the API, the live
 * event stream, media with Range, writes, other origins) — the worker never touches them. `asset`: hashed build files and icons,
 * cache first. `shell`: page navigations, network first with the cached app shell as the fallback.
 * public/sw.js repeats SW_RULES and this function (it is not bundled); a test keeps the two tables equal.
 */
export const SW_RULES = { bypass: ['^/api/', '^/events'], asset: ['^/assets/', '^/icons/', '^/k19/', '^/favicon\\.svg$', '^/manifest\\.webmanifest$'] };

export type SwRoute = 'shell' | 'asset' | 'bypass';
export interface SwRequest { url: string; method: string; mode: string; range: boolean }

export function classify(r: SwRequest, origin: string): SwRoute {
  const u = new URL(r.url);
  if (r.method !== 'GET' || r.range || u.origin !== origin) return 'bypass';
  if (SW_RULES.bypass.some((p) => new RegExp(p).test(u.pathname))) return 'bypass';
  if (SW_RULES.asset.some((p) => new RegExp(p).test(u.pathname))) return 'asset';
  return r.mode === 'navigate' ? 'shell' : 'bypass';
}
