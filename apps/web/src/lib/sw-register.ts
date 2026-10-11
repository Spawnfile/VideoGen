import { createStore } from './stores.ts';

/** True once the server has a newer build than this page (or its worker is waiting); UpdateToast offers Reload. */
export const updateReady = createStore<boolean>(false);
let waiting: ServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;

/** `version.json` names the build the server serves now (written by build-stamp.ts). */
export function isNewBuild(current: string, served: unknown): boolean {
  const build = (served as { build?: unknown } | null)?.build;
  return typeof build === 'string' && build !== current;
}

async function checkServerBuild(): Promise<void> {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (r.ok && isNewBuild(__BUILD_ID__, await r.json())) { updateReady.set(() => true); void registration?.update(); }
  } catch { /* offline: the Unreachable screen covers it */ }
}

/** Registers /sw.js for this build (production and a secure context only: HTTPS through Tailscale, or localhost). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !isSecureContext || !('serviceWorker' in navigator)) return;
  addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      registration = reg;
      const offer = (w: ServiceWorker | null) => { if (w && navigator.serviceWorker.controller) { waiting = w; updateReady.set(() => true); } };
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      // A phone app can stay open for days: look for a new build whenever it comes back to the front, and every 10 minutes.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkServerBuild(); });
      setInterval(() => { if (document.visibilityState === 'visible') void checkServerBuild(); }, 10 * 60_000);
    }).catch(() => {});
  });
}

/** Switches to the waiting worker if there is one, then reloads (pages are network first, so the reload gets the new build). */
export function applyUpdate(): void {
  if (!waiting) { location.reload(); return; }
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage('skipWaiting');
}

/** Settings → This device → Clear cached app: drops the worker and its caches, then reloads from the network. */
export async function clearAppCache(): Promise<void> {
  for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
  for (const k of (await caches?.keys?.()) ?? []) await caches.delete(k);
  location.reload();
}
