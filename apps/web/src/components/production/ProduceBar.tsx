import { useEffect, useRef, useState } from 'react';
import { BRIEF_MAX, DURATION_HARD, type AudioMode } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { BRIEF_DEFAULTS_TR, durationBadge, initialDurationState, onBriefChange, onDurationEdit, onDurationMode, producePayload } from '../../lib/brief-view.ts';
import { PRODUCE_VO_HINT } from '../../lib/production-view.ts';

const MODES: { id: AudioMode; label: string; hint: string }[] = [
  { id: 'silent', label: 'Seslendirmesiz', hint: 'Anlatımı ekran yazısı ve efekt sesleri taşır' },
  { id: 'vo', label: 'Seslendirmeli', hint: PRODUCE_VO_HINT },
];
const DURATION_MODES = [{ id: 'auto', label: 'Otomatik' }, { id: 'manual', label: 'Elle' }] as const;
const pill = (on: boolean) =>
  `rounded-full px-3 py-1 text-[13px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow ${on ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`;
const field = 'rounded-input border border-line bg-canvas outline-none transition-shadow duration-150 placeholder:text-ink-3 focus:border-accent-glow/60 focus:shadow-glow';

export function ProduceBar({ onCreated }: { onCreated: (videoId: string) => void }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<AudioMode>('silent');
  const [brief, setBrief] = useState('');
  const [duration, setDuration] = useState(initialDurationState);
  // What the two boxes show while typing (may be empty); the window takes a value only once it is a number.
  const [typed, setTyped] = useState({ minS: String(duration.minS), maxS: String(duration.maxS) });
  useEffect(() => { setTyped((t) => ({ minS: Number(t.minS) === duration.minS ? t.minS : String(duration.minS), maxS: Number(t.maxS) === duration.maxS ? t.maxS : String(duration.maxS) })); }, [duration.minS, duration.maxS]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  const submit = async () => {
    if (name.trim().length < 2 || lock.current) return; // a ref, not state: two clicks in one frame start one run
    if (duration.mode === 'manual' && (typed.minS.trim() === '' || typed.maxS.trim() === '')) { setError('süre kutularını doldurun'); return; }
    const p = producePayload({ name, mode, brief, duration });
    if (!p.ok) { setError(p.error); return; }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await api.produce(p.body);
      if (r.ok) { setName(''); setBrief(''); setDuration(initialDurationState()); onCreated(r.videoId); } else setError(r.error);
    } catch {
      setError('Sunucuya ulaşılamadı.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const bound = (key: 'minS' | 'maxS', label: string) => (
    <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={DURATION_HARD.minS}
        max={DURATION_HARD.maxS}
        step={1}
        value={typed[key]}
        onChange={(e) => {
          const v = e.target.value;
          setTyped((t) => ({ ...t, [key]: v }));
          if (v.trim() !== '' && Number.isFinite(Number(v))) setDuration((d) => onDurationEdit(d, { [key]: Number(v) }));
        }}
        className={`${field} w-16 px-2 py-1 text-[13px] tabular-nums`}
      />
    </label>
  );

  return (
    <section aria-label="Yeni üretim" className="border-b border-line bg-paper px-6 py-4">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="product-name" className="sr-only">Ürün adı</label>
          <input
            id="product-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Ürün adı, ör. tükenmez kalem"
            autoComplete="off"
            className={`${field} min-w-64 flex-1 px-4 py-2.5 text-[15px]`}
          />
          <div role="radiogroup" aria-label="Ses modu" className="flex gap-1">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} title={m.hint} onClick={() => setMode(m.id)} className={pill(mode === m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={busy || name.trim().length < 2}
            className="rounded-control bg-accent px-5 py-2.5 text-[14px] font-medium text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow disabled:opacity-40"
          >
            Üret
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-ink-2">Süre</span>
          <div role="radiogroup" aria-label="Süre" className="flex gap-1">
            {DURATION_MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={duration.mode === m.id} onClick={() => setDuration((d) => onDurationMode(d, m.id))} className={pill(duration.mode === m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          {duration.mode === 'manual' && <>{bound('minS', 'en az')}{bound('maxS', 'en çok')}<span className="text-[13px] text-ink-3">sn</span></>}
          <span data-testid="duration-badge" className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2">{durationBadge(duration)}</span>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="produce-brief" className="text-[13px] text-ink-2">Yönerge <span className="text-ink-3">(isteğe bağlı)</span></label>
          <textarea
            id="produce-brief"
            value={brief}
            onChange={(e) => { setBrief(e.target.value); setDuration((d) => onBriefChange(d, e.target.value)); }}
            maxLength={BRIEF_MAX}
            rows={2}
            placeholder="ör. 20 saniyeyi geçmesin; yayın geri itme anına odaklan; tempo hızlı, kanca bir soru olsun."
            className={`${field} resize-y px-3 py-2 text-[14px] leading-relaxed`}
          />
          <div className="flex items-start justify-between gap-4 text-[11.5px] text-ink-3">
            <p className="max-w-[90ch]">{BRIEF_DEFAULTS_TR}</p>
            <span className="shrink-0 tabular-nums">{brief.length}/{BRIEF_MAX}</span>
          </div>
        </div>
      </form>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-red/80">{error}</p>}
    </section>
  );
}
