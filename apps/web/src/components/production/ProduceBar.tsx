import { useRef, useState } from 'react';
import { BRIEF_MAX } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { BRIEF_DEFAULTS, producePayload, YAKLASIM_LINE } from '../../lib/brief-view.ts';

const field = 'rounded-input border border-line bg-inset outline-none transition-shadow duration-150 placeholder:text-ink-3 focus:border-accent-glow/60 focus:shadow-glow';
const section = 'label-mono text-ink-3';

/**
 * The production form. `bar`: the tablet/desktop strip above the Studio. `sheet`: inside the phone's "New video" sheet.
 * `hero`: the empty Studio on a phone (the first thing a new user sees). All three are the same form with the same `#product-name`.
 * YAKLASIM (spec Y1/Y2): the product and an optional brief; the approach fixes length, voice and look.
 */
export function ProduceForm({ variant, onCreated }: { variant: 'bar' | 'sheet' | 'hero'; onCreated: (videoId: string) => void }) {
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const stacked = variant !== 'bar';

  const submit = async () => {
    if (name.trim().length < 2 || lock.current) return; // a ref, not state: two clicks in one frame start one run
    const p = producePayload({ name, brief });
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await api.produce(p.body);
      if (r.ok) { setName(''); setBrief(''); onCreated(r.videoId); } else setError(r.error);
    } catch {
      setError('Could not reach the server.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const create = (
    <button
      type="submit"
      disabled={busy || name.trim().length < 2}
      className={`rounded-input bg-ember font-bold text-white shadow-ember transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow disabled:opacity-40 disabled:shadow-none ${stacked ? 'min-h-[50px] w-full text-[15px]' : 'px-5 py-2.5 text-[14px]'}`}
    >
      {busy ? 'Creating…' : 'Create video'}
    </button>
  );
  return (
    <section aria-label="New production" className={variant === 'bar' ? 'border-b border-line bg-paper px-6 py-4' : ''}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-3">
        <div className={stacked ? 'flex flex-col gap-3' : 'flex flex-wrap items-center gap-3'}>
          <label htmlFor="product-name" className="sr-only">Product name</label>
          {stacked && <span aria-hidden className={`${section} -mb-1.5`}>Product</span>}
          <input
            id="product-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Product name, e.g. ballpoint pen"
            autoComplete="off"
            enterKeyHint="go"
            className={`${field} min-w-0 flex-1 px-4 text-[15px] focus:ring-ember focus:[--ring-fill:var(--color-inset)] ${stacked ? 'min-h-12' : 'min-w-64 py-2.5'}`}
          />
          {!stacked && create}
        </div>

        <div className="flex flex-col gap-1.5">
          {stacked && <span aria-hidden className={section}>Approach</span>}
          <p data-testid="yaklasim-line" className="w-fit rounded-control border border-line px-2 py-1 font-mono text-[11.5px] text-ink-2">{YAKLASIM_LINE}</p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="produce-brief" className={stacked ? section : 'text-[13px] text-ink-2'}>Brief <span className="text-ink-3">(optional)</span></label>
          <textarea
            id="produce-brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            maxLength={BRIEF_MAX}
            rows={stacked ? 3 : 2}
            placeholder="e.g. make the hidden spring the hero; count the clicks a pen lasts; end with the pen solving itself."
            className={`${field} resize-y px-3 py-2 text-[14px] leading-relaxed`}
          />
          <div className="flex items-start justify-between gap-4 text-[11.5px] text-ink-3">
            <p className="max-w-[90ch]">{BRIEF_DEFAULTS}</p>
            <span className="shrink-0 font-mono tabular-nums">{brief.length}/{BRIEF_MAX}</span>
          </div>
        </div>
        {stacked && create}
      </form>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-red">{error}</p>}
    </section>
  );
}

/** Phone: the docked "New video" box above the tab bar; its key is the screen's one filled ember block (spec E16). */
export function ProduceDock({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="border-t border-line/60 bg-canvas/90 px-4 pt-2 pb-2.5 backdrop-blur">
      <button
        type="button"
        data-testid="produce-dock"
        onClick={onOpen}
        className="flex min-h-12 w-full items-center gap-3 rounded-input border border-line bg-paper pr-1.5 pl-4 text-left text-[16px] text-ink-3 focus-visible:outline-2 focus-visible:outline-accent-glow"
      >
        <span className="flex-1 truncate">Product name, e.g. ballpoint pen</span>
        <span className="flex min-h-10 shrink-0 items-center rounded-control bg-ember px-3.5 text-[13px] font-bold text-white shadow-ember">New video</span>
      </button>
    </div>
  );
}
