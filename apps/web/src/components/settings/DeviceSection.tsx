/** Settings → This device: how to install the app and which build is running. Filled in by the PWA task (update and cache controls). */
export function DeviceSection() {
  const standalone = typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches;
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
    </section>
  );
}
