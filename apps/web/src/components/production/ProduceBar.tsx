import { useRef, useState } from 'react';
import type { AudioMode } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { PRODUCE_VO_HINT } from '../../lib/production-view.ts';

const MODES: { id: AudioMode; label: string; hint: string }[] = [
  { id: 'silent', label: 'Seslendirmesiz', hint: 'Anlatımı ekran yazısı ve efekt sesleri taşır' },
  { id: 'vo', label: 'Seslendirmeli', hint: PRODUCE_VO_HINT },
];

export function ProduceBar({ onCreated }: { onCreated: (videoId: string) => void }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<AudioMode>('silent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  const submit = async () => {
    const value = name.trim();
    if (value.length < 2 || lock.current) return; // a ref, not state: two clicks in one frame start one run
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await api.produce(value, mode);
      if (r.ok) { setName(''); onCreated(r.videoId); } else setError(r.error);
    } catch {
      setError('Sunucuya ulaşılamadı.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <section aria-label="Yeni üretim" className="border-b border-line bg-paper px-6 py-4">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-wrap items-center gap-3">
        <label htmlFor="product-name" className="sr-only">Ürün adı</label>
        <input
          id="product-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Ürün adı, ör. tükenmez kalem"
          autoComplete="off"
          className="min-w-64 flex-1 rounded-input border border-line bg-canvas px-4 py-2.5 text-[15px] outline-none transition-shadow duration-150 placeholder:text-ink-3 focus:border-accent/50 focus:shadow-[0_0_0_4px_rgb(1_106_113_/_0.12)]"
        />
        <div role="radiogroup" aria-label="Ses modu" className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              title={m.hint}
              onClick={() => setMode(m.id)}
              className={`rounded-full px-3 py-1 text-[13px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${mode === m.id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="rounded-control bg-accent px-5 py-2.5 text-[14px] font-medium text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
        >
          Üret
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-red/80">{error}</p>}
    </section>
  );
}
