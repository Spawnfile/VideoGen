import { useEffect, useRef, useState, type RefObject } from 'react';
import { formatClock, formatScore, type VersionView } from '@videogen/shared/browser';
import { blobUrl } from '../../lib/api.ts';
import { compareView, defaultPair, syncPlan, versionLabel, type CompareSide, type CompareVariant } from '../../lib/compare-view.ts';
import { setActivePlayer } from '../../lib/player.ts';

type Mode = 'side' | 'ab';
const chip = (on: boolean) =>
  `rounded-full px-3 py-1 text-[12px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:opacity-40 ${on ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`;
const signed = (n: number | null) => (n === null ? '–' : `${n > 0 ? '+' : ''}${formatScore(n)}`);
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/**
 * Plan M7 Y7 players. "Yan yana": A leads, one play/pause/seek drives both and B is moved back to A's time when it drifts more than
 * 0.15 s (syncPlan). "A/B": one player switches between A and B at the same time (B key). Play intent and time are kept here, so a new
 * source (variant, version or side) resumes where the old one was.
 */
function Players({ a, b, mode }: { a: CompareSide; b: CompareSide; mode: Mode }) {
  const ra = useRef<HTMLVideoElement>(null);
  const rb = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState<'a' | 'b'>('a');
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const time = useRef(0);
  const want = useRef(false);
  want.current = playing;
  const els = () => [ra.current, mode === 'side' ? rb.current : null].filter((v): v is HTMLVideoElement => !!v);
  // Rebuilt every render (the mode decides which elements play); the registered player calls through the ref.
  const ctl = useRef({ play: () => {}, pause: () => {}, seekTo: (_s: number) => {} });
  ctl.current = {
    play: () => { setPlaying(true); for (const v of els()) void v.play().catch(() => {}); },
    pause: () => { setPlaying(false); for (const v of els()) v.pause(); },
    seekTo: (s: number) => {
      const max = Math.max(0, ...els().map((v) => (Number.isFinite(v.duration) ? v.duration : 0)));
      const to = Math.max(0, max ? Math.min(max, s) : s);
      time.current = to;
      setT(to);
      for (const v of els()) v.currentTime = to;
    },
  };
  useEffect(() => {
    setActivePlayer({
      kind: 'final',
      toggle: () => (want.current ? ctl.current.pause() : ctl.current.play()),
      pause: () => ctl.current.pause(),
      seekBy: (s) => ctl.current.seekTo(time.current + s),
      seekTo: (s) => ctl.current.seekTo(s),
    });
    return () => setActivePlayer(null);
  }, []);
  const flip = () => {
    if (ra.current) time.current = ra.current.currentTime;
    setShown((x) => (x === 'a' ? 'b' : 'a'));
  };
  useEffect(() => {
    if (mode !== 'ab') return;
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || e.key.toLocaleLowerCase('tr') !== 'b') return;
      e.preventDefault();
      flip();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [mode]);
  // A new source (first load, variant, version, A/B side): back to the kept time, and playing again if it was.
  const loaded = (v: HTMLVideoElement) => {
    v.currentTime = Math.min(time.current, Number.isFinite(v.duration) ? v.duration : time.current);
    if (v === ra.current && Number.isFinite(v.duration)) setDur(v.duration);
    if (want.current) void v.play().catch(() => {});
  };
  const tick = () => {
    const A = ra.current;
    if (!A || A.seeking) return;
    time.current = A.currentTime;
    setT(A.currentTime);
    const B = rb.current;
    if (mode !== 'side' || !B || B.seeking || B.readyState < 1) return;
    const plan = syncPlan(A.currentTime, B.currentTime);
    if (plan.seekB !== undefined && plan.seekB <= (Number.isFinite(B.duration) ? B.duration : Infinity)) B.currentTime = plan.seekB;
  };
  const ended = () => { setPlaying(false); for (const v of els()) v.pause(); };
  const lead = mode === 'ab' && shown === 'b' ? b : a;
  const video = (side: CompareSide, ref: RefObject<HTMLVideoElement | null>, testId: string, muted: boolean, isLead: boolean) => (
    <video
      ref={ref}
      data-testid={testId}
      src={blobUrl(side.sha)}
      poster={side.coverSha ? blobUrl(side.coverSha) : undefined}
      muted={muted}
      playsInline
      preload="metadata"
      onLoadedMetadata={(e) => loaded(e.currentTarget)}
      onTimeUpdate={isLead ? tick : undefined}
      onEnded={isLead ? ended : undefined}
      className="aspect-[9/16] w-full rounded-card bg-inset"
    />
  );
  return (
    <div className="flex flex-col gap-2">
      {mode === 'side' ? (
        <div className="grid grid-cols-2 gap-2">
          <figure className="flex flex-col gap-1">
            {video(a, ra, 'compare-a', false, true)}
            <figcaption className="text-center text-[12px] text-ink-2">A · {a.label}</figcaption>
          </figure>
          <figure className="flex flex-col gap-1">
            {video(b, rb, 'compare-b', true, false)}
            <figcaption className="text-center text-[12px] text-ink-2">B · {b.label} <span className="text-ink-3">(sessiz)</span></figcaption>
          </figure>
        </div>
      ) : (
        <figure className="mx-auto flex w-full max-w-[320px] flex-col gap-1">
          {video(lead, ra, 'compare-ab', false, true)}
          <figcaption data-testid="ab-side" data-side={shown} className="text-center text-[12px] text-ink-2">{shown === 'a' ? 'A' : 'B'} · {lead.label}</figcaption>
        </figure>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="compare-play"
          aria-label={playing ? 'Duraklat' : 'Oynat'}
          onClick={() => (playing ? ctl.current.pause() : ctl.current.play())}
          className="rounded-control border border-line-strong px-3 py-1 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-ink"
        >
          {playing ? 'Duraklat' : 'Oynat'}
        </button>
        <input
          type="range"
          aria-label="Konum"
          min={0}
          max={dur || 0}
          step={0.05}
          value={Math.min(t, dur || t)}
          onChange={(e) => ctl.current.seekTo(Number(e.currentTarget.value))}
          className="flex-1 accent-[#016a71]"
        />
        <span className="w-20 text-right text-[12px] tabular-nums text-ink-3">{formatClock(t)} / {formatClock(dur)}</span>
        {mode === 'ab' && (
          <button type="button" data-testid="ab-toggle" onClick={flip} aria-keyshortcuts="B" className="rounded-control border border-line-strong px-3 py-1 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-ink">
            {shown === 'a' ? "B'ye geç" : "A'ya geç"} <span className="text-ink-3">(B)</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Picker({ label, value, versions, onChange }: { label: string; value: string | null; versions: VersionView[]; onChange: (id: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
      {label}
      <select
        aria-label={`${label} sürümü`}
        value={value ?? ''}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="rounded-input border border-line-strong bg-paper px-2 py-1 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-ink"
      >
        {!value && <option value="">seçin</option>}
        {versions.map((v) => (
          <option key={v.id} value={v.id} disabled={!v.finals}>
            {versionLabel(v)}{v.finals ? (v.total !== null ? ` · ${formatScore(v.total)} puan` : '') : ' · tamamlanmadı'}{v.best ? ' · en iyi' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Plan M7 Y7 "Karşılaştır": two versions with a final, side by side or A/B, the variant on both, the score and dimension deltas below. */
export function CompareView({ versions }: { versions: VersionView[] }) {
  const [pair, setPair] = useState(() => defaultPair(versions));
  const [mode, setMode] = useState<Mode>('side');
  const [variant, setVariant] = useState<CompareVariant>('music');
  const v = compareView(versions, pair.aId, pair.bId, variant);
  const tiktok = !!(v.a && versions.find((x) => x.id === v.a!.id)?.finals?.tiktokSha) || !!(v.b && versions.find((x) => x.id === v.b!.id)?.finals?.tiktokSha);
  return (
    <section data-testid="compare-view" aria-label="Karşılaştır" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Picker label="A" value={pair.aId} versions={versions} onChange={(id) => setPair((p) => ({ ...p, aId: id }))} />
        <Picker label="B" value={pair.bId} versions={versions} onChange={(id) => setPair((p) => ({ ...p, bId: id }))} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Görünüm" className="flex gap-1">
          {([['side', 'Yan yana'], ['ab', 'A/B']] as const).map(([id, label]) => (
            <button key={id} type="button" data-testid="compare-mode" aria-pressed={mode === id} onClick={() => setMode(id)} className={chip(mode === id)}>{label}</button>
          ))}
        </div>
        <div role="group" aria-label="Varyant" className="flex gap-1">
          {([['music', 'Müzikli'], ['tiktok', 'Müziksiz']] as const).map(([id, label]) => (
            <button key={id} type="button" data-testid="variant-chip" aria-pressed={variant === id} disabled={id === 'tiktok' && !tiktok} onClick={() => setVariant(id)} className={chip(variant === id)}>{label}</button>
          ))}
        </div>
      </div>
      {v.canCompare && v.a && v.b ? <Players a={v.a} b={v.b} mode={mode} /> : <p role="status" data-testid="compare-reason" className="text-[13px] text-ink-2">{v.reason}</p>}
      {v.canCompare && (
        <div className="flex flex-col gap-1.5 rounded-control border border-line/60 px-3 py-2">
          <p className="text-[13px]">
            Puan farkı (B − A): <span data-testid="compare-delta" className="font-medium tabular-nums">{signed(v.delta.total)}</span>
            <span className="text-ink-3 tabular-nums"> · {v.a!.total !== null ? formatScore(v.a!.total) : '–'} → {v.b!.total !== null ? formatScore(v.b!.total) : '–'}</span>
          </p>
          <table aria-label="Boyut farkları" className="text-[12.5px] tabular-nums">
            <thead className="text-ink-3"><tr><th className="text-left font-normal">Boyut</th><th className="text-right font-normal">A</th><th className="text-right font-normal">B</th><th className="text-right font-normal">Fark</th></tr></thead>
            <tbody>
              {v.delta.dims.map((d) => (
                <tr key={d.id}>
                  <td className="text-ink-2">{d.label}</td>
                  <td className="text-right">{d.a === null ? '–' : formatScore(d.a)}</td>
                  <td className="text-right">{d.b === null ? '–' : formatScore(d.b)}</td>
                  <td className="text-right">{signed(d.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
