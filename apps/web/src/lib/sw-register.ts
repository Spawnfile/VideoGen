import { createStore } from './stores.ts';

/** True once a new build's service worker is installed and waiting; UpdateToast offers Reload. */
export const updateReady = createStore<boolean>(false);
let waiting: ServiceWorker | null = null;

/** Registers /sw.js for this build (production and a secure context only: HTTPS through Tailscale, or localhost). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !isSecureContext || !('serviceWorker' in navigator)) return;
  addEventListener('load', () => {
    void navigator.serviceWorker.register(`/sw.js?v=${__BUILD_ID__}`, { scope: '/' }).then((reg) => {
      const offer = (w: ServiceWorker | null) => { if (w && navigator.serviceWorker.controller) { waiting = w; updateReady.set(() => true); } };
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      // A phone app can stay open for days: look for a new build whenever it comes back to the front.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update(); });
    }).catch(() => {});
  });
}

/** Switches to the waiting build and reloads once it controls the page. */
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
