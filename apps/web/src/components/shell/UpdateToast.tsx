import { applyUpdate, updateReady } from '../../lib/sw-register.ts';
import { useStore } from '../../lib/stores.ts';

/** "A new version is ready." with Reload; nothing reloads by itself while a production may be on screen. */
export function UpdateToast() {
  const ready = useStore(updateReady);
  if (!ready) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-40 flex items-center gap-3 rounded-input border border-line bg-inset px-4 py-3 text-[14px] shadow-glow md:inset-x-auto md:right-6 md:bottom-14 md:w-[360px]" style={{ animation: 'fade-up 200ms ease-out both' }}>
      <span className="flex-1">A new version is ready.</span>
      <button type="button" onClick={applyUpdate} className="min-h-9 rounded-control px-3 font-medium text-accent-glow hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow">Reload</button>
    </div>
  );
}
