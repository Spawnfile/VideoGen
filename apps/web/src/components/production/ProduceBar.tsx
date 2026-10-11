import { useRef, useState } from 'react';
import { BRIEF_MAX } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';
import { BRIEF_DEFAULTS, producePayload, YAKLASIM_LINE } from '../../lib/brief-view.ts';

const field = 'rounded-input border border-line bg-inset outline-none transition-shadow duration-150 placeholder:text-ink-3 focus:border-accent-glow/60 focus:shadow-glow';

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
      className={`rounded-input bg-accent font-medium text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow disabled:opacity-40 ${stacked ? 'min-h-12 w-full text-[15px]' : 'px-5 py-2.5 text-[14px]'}`}
    >
      {busy ? 'Creating…' : 'Create video'}
    </button>
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
          {!stacked && create}
        </div>

        <p data-testid="yaklasim-line" className="w-fit rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2">{YAKLASIM_LINE}</p>

        <div className="flex flex-col gap-1">
          <label htmlFor="produce-brief" className="text-[13px] text-ink-2">Brief <span className="text-ink-3">(optional)</span></label>
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
