import { useEffect, useState } from 'react';
import { useLive } from '../../lib/live.ts';

/** How long the live stream may be down before the server is checked. */
const GRACE_MS = 6000;

async function reachable(): Promise<boolean> {
  try { return (await fetch('/api/health', { cache: 'no-store' })).ok; } catch { return false; }
}

/**
 * The cached app shell opened but the server cannot be reached (Tailscale off on the phone, the computer asleep or VideoGen stopped).
 * Covers the app until /api/health answers; it checks again every 5 s and on Try again.
 */
export function Unreachable() {
  const { status } = useLive();
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (status === 'open') { setDown(false); return; }
    let alive = true;
    const t = setTimeout(async () => { if (alive && !(await reachable())) setDown(true); }, GRACE_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [status]);
  useEffect(() => {
    if (!down) return;
    const h = setInterval(async () => { if (await reachable()) location.reload(); }, 5000);
    return () => clearInterval(h);
  }, [down]);
  if (!down) return null;
  return (
    <div role="alertdialog" aria-labelledby="unreachable-title" data-testid="unreachable" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-canvas px-8 text-center pt-safe pb-safe">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-ink-3" aria-hidden><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18" /></svg>
      <h1 id="unreachable-title" className="text-[18px] font-medium">Can’t reach the VideoGen server</h1>
      <p className="max-w-[34ch] text-[14px] leading-relaxed text-ink-2">Check that Tailscale is on for this device and that the computer running VideoGen is awake.</p>
      <button type="button" onClick={async () => { if (await reachable()) location.reload(); }} className="min-h-11 rounded-input bg-accent px-6 text-[15px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow">Try again</button>
    </div>
  );
}
