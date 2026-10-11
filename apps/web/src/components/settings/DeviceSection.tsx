import { useState } from 'react';
import { clearAppCache } from '../../lib/sw-register.ts';

/** Settings → This device: install steps (or "installed"), the running build, and a way out of a stuck cached app. */
export function DeviceSection() {
  const standalone = typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches;
  const [busy, setBusy] = useState(false);
  return (
    <section data-testid="device-section" className="rounded-card bg-paper p-4" aria-labelledby="device-heading">
      <h2 id="device-heading" className="text-[14px] font-medium">App on this device</h2>
      {standalone ? (
        <p className="mt-1 text-[12.5px] text-ink-2">VideoGen is installed on this device and opens full screen.</p>
      ) : (
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-ink-2">
          <li>iPhone: tap Share in Safari, then Add to Home Screen.</li>
          <li>Android: open the Chrome menu, then Install app.</li>
          <li>Open VideoGen from its icon; it runs full screen like an app.</li>
        </ol>
      )}
      <dl className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-y-1.5 text-[13px] md:grid-cols-[160px_minmax(0,1fr)]">
        <dt className="text-ink-2">Version</dt>
        <dd data-testid="build-id" className="font-mono text-[12.5px] break-all">{__BUILD_ID__}</dd>
        <dt className="text-ink-2">Address</dt>
        <dd className="break-all">{location.host}</dd>
      </dl>
      <button type="button" disabled={busy} onClick={() => { setBusy(true); void clearAppCache(); }} className="mt-3 min-h-10 rounded-control border border-line-strong px-3 text-[13px] hover:bg-hover-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent-glow md:min-h-0 md:py-1">
        Clear cached app
      </button>
      <p className="mt-1 text-[12px] text-ink-3">Reloads VideoGen from the computer. Your videos and settings are not affected.</p>
    </section>
  );
}
