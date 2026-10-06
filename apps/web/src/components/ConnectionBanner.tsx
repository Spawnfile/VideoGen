import { useLive } from '../lib/live.ts';

export function ConnectionBanner() {
  const { status } = useLive();
  if (status !== 'reconnecting') return null;
  return (
    <div role="status" className="border-b border-line bg-inset px-4 py-1.5 text-center text-[12px] text-ink-2" style={{ animation: 'fade-in 200ms ease-out both' }}>
      Bağlantı koptu, yeniden bağlanıyor… Kaçan olaylar bağlanınca tekrar oynatılacak.
    </div>
  );
}
