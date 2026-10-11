import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DEFAULT_SAFE_AREA, type SafeArea } from '@videogen/shared/browser';
import { api } from '../../lib/api.ts';

const BUTTON = 'min-h-10 rounded-control border border-line-strong px-3 py-1 md:min-h-0 text-[13px] transition-colors duration-100 hover:bg-hover-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow';
const INPUT = 'h-10 rounded-control border border-line bg-inset px-2 md:h-8 text-[13px] tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow';
const SIDES: { key: keyof SafeArea; label: string; hint: string }[] = [
  { key: 'top', label: 'Top', hint: 'no text above this y' },
  { key: 'bottom', label: 'Bottom', hint: 'no text below this y' },
  { key: 'right', label: 'Right', hint: 'pixels kept clear from the right edge' },
  { key: 'left', label: 'Left', hint: 'the text’s left margin' },
];
type Draft = Record<keyof SafeArea, string>;
const toDraft = (a: SafeArea): Draft => ({ top: String(a.top), bottom: String(a.bottom), right: String(a.right), left: String(a.left) });
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' });

/**
 * Plan M7 Y15/Y16: Ayarlar → "Güvenli alan". The four values every final is laid out and checked (G6) in, at 1080×1920; where they came
 * from (default or read off the calibration card on a phone), the device note, the >150 px warnings and the card instructions.
 */
export function SafeAreaSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['safe-area'], queryFn: api.safeArea });
  const [draft, setDraft] = useState<Draft>(toDraft(DEFAULT_SAFE_AREA));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    if (!q.data) return;
    setDraft(toDraft(q.data.area));
    setNote(q.data.note ?? '');
  }, [q.data]);

  const dirty = !!q.data && (SIDES.some((s) => draft[s.key].trim() !== String(q.data.area[s.key])) || note.trim() !== (q.data.note ?? ''));
  const save = async (body: Parameters<typeof api.setSafeArea>[0]) => {
    setBusy(true);
    setMsg(null);
    const r = await api.setSafeArea(body);
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.error, error: true }); return; }
    qc.setQueryData(['safe-area'], r.data);
    setMsg({ text: 'reset' in body ? 'Back to the default area.' : 'Saved. The next compose uses this area.', error: false });
  };
  const submit = () => {
    const area = Object.fromEntries(SIDES.map((s) => [s.key, Number(draft[s.key].trim())])) as unknown as SafeArea;
    if (SIDES.some((s) => draft[s.key].trim() === '' || !Number.isInteger(area[s.key]))) { setMsg({ text: 'All four values must be whole numbers.', error: true }); return; }
    void save({ area, ...(note.trim() ? { note: note.trim() } : {}) });
  };

  return (
    <section data-testid="safe-area-section" className="rounded-card bg-paper p-4" aria-labelledby="safe-area-heading">
      <h2 id="safe-area-heading" className="text-[14px] font-medium">Safe area</h2>
      <p className="mt-1 mb-3 text-[12.5px] text-ink-2">
        The text area the TikTok interface leaves uncovered (1080×1920 pixels). The final’s layout and the G6 check use these values; they are an
        input of the final compose, so older finals are recomposed when they change.
      </p>
      {q.isPending && <p className="text-[12.5px] text-ink-2">Loading the safe area</p>}
      {q.isError && <p role="alert" className="text-[12.5px] text-red">Could not load the safe area.</p>}
      {q.data && (
        <div className="flex flex-col gap-3">
          <p data-testid="safe-area-source" className="text-[12.5px]">
            Source: {q.data.source === 'calibrated' ? <>measured on a phone{q.data.measuredAt ? ` · ${when(q.data.measuredAt)}` : ''}</> : 'default (spec §8.1)'}
            {q.data.note && <span className="text-ink-2"> · {q.data.note}</span>}
          </p>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SIDES.map((s) => (
                <label key={s.key} className="flex flex-col gap-1 text-[12.5px]">
                  <span className="font-medium">{s.label}</span>
                  <input value={draft[s.key]} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} inputMode="numeric" aria-describedby={`safe-${s.key}-hint`} data-testid={`safe-area-${s.key}`} className={`${INPUT} w-24`} />
                  <span id={`safe-${s.key}-hint`} className="text-[11.5px] text-ink-2">{s.hint} (default {DEFAULT_SAFE_AREA[s.key]})</span>
                </label>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-medium">Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Device and TikTok version, e.g. Pixel 7 · TikTok 41.2" className={`${INPUT} max-w-[420px]`} />
            </label>
            {q.data.warnings.length > 0 && (
              <ul data-testid="safe-area-warnings" className="flex flex-col gap-0.5 rounded-input bg-inset px-3 py-2 text-[12.5px]">
                {q.data.warnings.map((w) => <li key={w}>Warning: {w}</li>)}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy || !dirty} className={BUTTON}>Save</button>
              <button type="button" data-testid="safe-area-reset" disabled={busy || q.data.source === 'default'} onClick={() => void save({ reset: true })} className={BUTTON}>Back to default</button>
            </div>
          </form>
          {msg && <p role={msg.error ? 'alert' : 'status'} className={`text-[12.5px] ${msg.error ? 'text-red' : 'text-ink'}`}>{msg.text}</p>}
          <details className="text-[12.5px]">
            <summary className="cursor-pointer py-1 text-ink-2">How to use the calibration card</summary>
            <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-ink-2">
              <li>Make the card: <code className="font-mono text-ink">node bin/safe-area.mjs card</code> → in the data folder, <code className="font-mono text-ink">calibration/safe-area-card.mp4</code> (5 s) and a PNG of the same frame.</li>
              <li>Move the video to the phone by hand (cable or AirDrop). The card never goes through VideoGen’s publishing and does not count as a draft.</li>
              <li>Post it in the TikTok app with “Who can watch: Only me”, open it from your profile in the feed view and take a screenshot; then delete the post.</li>
              <li>On the screenshot, read the ruler values where the interface starts (the tabs at the top, the caption at the bottom, the buttons on the right): row labels are y (Top, Bottom), the right ruler is the distance from the right edge (Right), the left ruler from the left edge (Left).</li>
              <li>Enter the values here and note the device and app version. A value more than 150 pixels off the default shows a warning: read the ruler again.</li>
            </ol>
          </details>
        </div>
      )}
    </section>
  );
}
