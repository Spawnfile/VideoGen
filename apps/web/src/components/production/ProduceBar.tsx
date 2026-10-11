import { useEffect, useRef, useState } from 'react';
import { BRIEF_MAX, DURATION_HARD, type AudioMode } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { BRIEF_DEFAULTS, durationBadge, initialDurationState, onBriefChange, onDurationEdit, onDurationMode, producePayload } from '../../lib/brief-view.ts';
import { PRODUCE_VO_HINT } from '../../lib/production-view.ts';

const MODES: { id: AudioMode; label: string; hint: string }[] = [
  { id: 'silent', label: 'No voiceover', hint: 'On-screen text and sound effects carry the story' },
  { id: 'vo', label: 'With voiceover', hint: PRODUCE_VO_HINT },
];
const DURATION_MODES = [{ id: 'auto', label: 'Auto' }, { id: 'manual', label: 'Manual' }] as const;
const pill = (on: boolean) =>
  `min-h-9 rounded-full px-3.5 text-[13px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow md:min-h-0 md:px-3 md:py-1 ${on ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`;
const field = 'rounded-input border border-line bg-inset outline-none transition-shadow duration-150 placeholder:text-ink-3 focus:border-accent-glow/60 focus:shadow-glow';

/**
 * The production form. `bar`: the tablet/desktop strip above the Studio. `sheet`: inside the phone's "New video" sheet.
 * `hero`: the empty Studio on a phone (the first thing a new user sees). All three are the same form with the same `#product-name`.
 */
export function ProduceForm({ variant, onCreated }: { variant: 'bar' | 'sheet' | 'hero'; onCreated: (videoId: string) => void }) {
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
  const stacked = variant !== 'bar';

  const submit = async () => {
    if (name.trim().length < 2 || lock.current) return; // a ref, not state: two clicks in one frame start one run
    if (duration.mode === 'manual' && (typed.minS.trim() === '' || typed.maxS.trim() === '')) { setError('Fill in both length boxes.'); return; }
    const p = producePayload({ name, mode, brief, duration });
    if (!p.ok) { setError(p.error); return; }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await api.produce(p.body);
      if (r.ok) { setName(''); setBrief(''); setDuration(initialDurationState()); onCreated(r.videoId); } else setError(r.error);
    } catch {
      setError('Could not reach the server.');
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
        className={`${field} w-16 px-2 py-1.5 text-[13px] tabular-nums md:py-1`}
      />
    </label>
  );
  const create = (
    <button
      type="submit"
      disabled={busy || name.trim().length < 2}
      className={`rounded-input bg-accent font-medium text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow disabled:opacity-40 ${stacked ? 'min-h-12 w-full text-[15px]' : 'px-5 py-2.5 text-[14px]'}`}
    >
      {busy ? 'Creating…' : 'Create video'}
    </button>
  );
  const modes = (
    <div role="radiogroup" aria-label="Voiceover" className="flex flex-wrap gap-1">
      {MODES.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} title={m.hint} onClick={() => setMode(m.id)} className={pill(mode === m.id)}>
          {m.label}
        </button>
      ))}
    </div>
  );

  return (
    <section aria-label="New production" className={variant === 'bar' ? 'border-b border-line bg-paper px-6 py-4' : ''}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-3">
        <div className={stacked ? 'flex flex-col gap-3' : 'flex flex-wrap items-center gap-3'}>
          <label htmlFor="product-name" className="sr-only">Product name</label>
          <input
            id="product-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Product name, e.g. ballpoint pen"
            autoComplete="off"
            enterKeyHint="go"
            className={`${field} min-w-0 flex-1 px-4 text-[15px] ${stacked ? 'min-h-12' : 'min-w-64 py-2.5'} ${variant === 'hero' ? 'border-accent-glow/35 shadow-glow' : ''}`}
          />
          {modes}
          {!stacked && create}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[13px] text-ink-2">Length</span>
          <div role="radiogroup" aria-label="Length" className="flex gap-1">
            {DURATION_MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={duration.mode === m.id} onClick={() => setDuration((d) => onDurationMode(d, m.id))} className={pill(duration.mode === m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          {duration.mode === 'manual' && <span className="flex items-center gap-2">{bound('minS', 'min')}{bound('maxS', 'max')}<span className="text-[13px] text-ink-3">s</span></span>}
          <span data-testid="duration-badge" className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2">{durationBadge(duration)}</span>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="produce-brief" className="text-[13px] text-ink-2">Brief <span className="text-ink-3">(optional)</span></label>
          <textarea
            id="produce-brief"
            value={brief}
            onChange={(e) => { setBrief(e.target.value); setDuration((d) => onBriefChange(d, e.target.value)); }}
            maxLength={BRIEF_MAX}
            rows={stacked ? 3 : 2}
            placeholder="e.g. keep it under 20 seconds; focus on the moment the spring pushes back; fast pace, open with a question."
            className={`${field} resize-y px-3 py-2 text-[14px] leading-relaxed`}
          />
          <div className="flex items-start justify-between gap-4 text-[11.5px] text-ink-3">
            <p className="max-w-[90ch]">{BRIEF_DEFAULTS}</p>
            <span className="shrink-0 tabular-nums">{brief.length}/{BRIEF_MAX}</span>
          </div>
        </div>
        {stacked && create}
      </form>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-red">{error}</p>}
    </section>
  );
}

/** Phone: the docked "New video" box above the tab bar; the one glowing element in the app. */
export function ProduceDock({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="border-t border-line/60 bg-canvas px-4 pt-2 pb-2.5">
      <button
        type="button"
        data-testid="produce-dock"
        onClick={onOpen}
        className="flex min-h-12 w-full items-center gap-3 rounded-input border border-accent-glow/35 bg-inset pr-1.5 pl-4 text-left text-[16px] text-ink-3 shadow-glow focus-visible:outline-2 focus-visible:outline-accent-glow"
      >
        <span className="flex-1 truncate">Product name, e.g. ballpoint pen</span>
        <span aria-hidden className="flex size-9 items-center justify-center rounded-[10px] bg-accent text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </span>
        <span className="sr-only">New video</span>
      </button>
    </div>
  );
}
