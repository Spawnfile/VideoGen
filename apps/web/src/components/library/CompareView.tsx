import { useEffect, useRef, useState, type RefObject } from 'react';
import { formatClock, type VersionView } from '@videogen/shared/browser';
import { blobUrl } from '../../lib/api.ts';
import { compareView, defaultCompareMode, defaultPair, SIDE_BY_SIDE_MIN, syncPlan, versionLabel, type CompareSide } from '../../lib/compare-view.ts';
import { score as formatScore } from '../../lib/i18n.ts';
import { setActivePlayer } from '../../lib/player.ts';

type Mode = 'side' | 'ab';
const chip = (on: boolean) =>
  `min-h-9 rounded-control px-3.5 py-1 text-[12px] transition-colors md:min-h-0 md:px-3 duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow disabled:opacity-40 ${on ? 'bg-ink font-medium text-canvas' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`;
const signed = (n: number | null) => (n === null ? '–' : `${n > 0 ? '+' : ''}${formatScore(n)}`);
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/**
 * Plan M7 Y7 players. "Yan yana": A leads, one play/pause/seek drives both and B is moved back to A's time when it drifts more than
 * 0.15 s (syncPlan). "A/B": one player switches between A and B at the same time (B key). Play intent and time are kept here, so a new
 * source (version or side) resumes where the old one was.
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
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || e.key.toLowerCase() !== 'b') return;
      e.preventDefault();
      flip();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [mode]);
  // A new source (first load, version, A/B side): back to the kept time, and playing again if it was.
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
            <figcaption className="text-center text-[12px] text-ink-2">B · {b.label} <span className="text-ink-3">(muted)</span></figcaption>
          </figure>
        </div>
      ) : (
        <figure className="mx-auto flex w-full max-w-[320px] flex-col gap-1">
          {video(lead, ra, 'compare-ab', false, true)}
          <figcaption data-testid="ab-side" data-side={shown} className="text-center text-[12px] text-ink-2">{shown === 'a' ? 'A' : 'B'} · {lead.label}</figcaption>
        </figure>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="compare-play"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => (playing ? ctl.current.pause() : ctl.current.play())}
          className="min-h-10 rounded-control border border-line-strong px-3 py-1 text-[13px] hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow md:min-h-0"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          aria-label="Position"
          min={0}
          max={dur || 0}
          step={0.05}
          value={Math.min(t, dur || t)}
          onChange={(e) => ctl.current.seekTo(Number(e.currentTarget.value))}
          className="min-w-0 flex-1 accent-accent-glow"
        />
        <span className="w-20 text-right text-[12px] tabular-nums text-ink-3">{formatClock(t)} / {formatClock(dur)}</span>
        {mode === 'ab' && (
          <button type="button" data-testid="ab-toggle" onClick={flip} aria-keyshortcuts="B" className="min-h-10 w-full rounded-control border border-line-strong px-3 py-1 text-[13px] md:min-h-0 md:w-auto hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow">
            {shown === 'a' ? 'Switch to B' : 'Switch to A'} <span className="hidden text-ink-3 md:inline">(B)</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Picker({ label, value, versions, onChange }: { label: string; value: string | null; versions: VersionView[]; onChange: (id: string) => void }) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-2">
      {label}
      <select
        aria-label={`Version ${label}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="min-h-10 min-w-0 flex-1 rounded-input border border-line-strong bg-paper px-2 py-1 text-[13px] text-ink md:min-h-0 md:flex-none focus-visible:outline-2 focus-visible:outline-accent-glow"
      >
        {!value && <option value="">pick one</option>}
        {versions.map((v) => (
          <option key={v.id} value={v.id} disabled={!v.finals}>
            {versionLabel(v)}{v.finals ? (v.total !== null ? ` · ${formatScore(v.total)} points` : '') : ' · unfinished'}{v.best ? ' · best' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Plan M7 Y7 "Karşılaştır": two versions with a final, side by side or A/B, the score and dimension deltas below. */
export function CompareView({ versions }: { versions: VersionView[] }) {
  const [pair, setPair] = useState(() => defaultPair(versions));
  const [mode, setMode] = useState<Mode>(() => defaultCompareMode(innerWidth));
  const [roomy, setRoomy] = useState(() => innerWidth >= SIDE_BY_SIDE_MIN);
  useEffect(() => {
    const on = () => { const ok = innerWidth >= SIDE_BY_SIDE_MIN; setRoomy(ok); if (!ok) setMode('ab'); };
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  const v = compareView(versions, pair.aId, pair.bId);
  return (
    <section data-testid="compare-view" aria-label="Compare" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <Picker label="A" value={pair.aId} versions={versions} onChange={(id) => setPair((p) => ({ ...p, aId: id }))} />
        <Picker label="B" value={pair.bId} versions={versions} onChange={(id) => setPair((p) => ({ ...p, bId: id }))} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="View" className="flex gap-1">
          {([['side', 'Side by side'], ['ab', 'A/B']] as const).map(([id, label]) => (
            <button key={id} type="button" data-testid="compare-mode" aria-pressed={mode === id} disabled={id === 'side' && !roomy} title={id === 'side' && !roomy ? 'Turn the phone sideways to compare side by side' : undefined} onClick={() => setMode(id)} className={chip(mode === id)}>{label}</button>
          ))}
        </div>
      </div>
      {v.canCompare && v.a && v.b ? <Players a={v.a} b={v.b} mode={mode} /> : <p role="status" data-testid="compare-reason" className="text-[13px] text-ink-2">{v.reason}</p>}
      {v.canCompare && (
        <div className="flex flex-col gap-1.5 overflow-x-auto rounded-input bg-paper px-3 py-2">
          <p className="text-[13px]">
            Score change (B − A): <span data-testid="compare-delta" className="font-medium tabular-nums">{signed(v.delta.total)}</span>
            <span className="text-ink-3 tabular-nums"> · {v.a!.total !== null ? formatScore(v.a!.total) : '–'} → {v.b!.total !== null ? formatScore(v.b!.total) : '–'}</span>
          </p>
          <table aria-label="Dimension changes" className="text-[12.5px] tabular-nums">
            <thead className="text-ink-3"><tr><th className="text-left font-normal">Dimension</th><th className="pl-3 text-right font-normal">A</th><th className="pl-3 text-right font-normal">B</th><th className="pl-3 text-right font-normal">Change</th></tr></thead>
            <tbody>
              {v.delta.dims.map((d) => (
                <tr key={d.id}>
                  <td className="text-ink-2">{d.label}</td>
                  <td className="pl-3 text-right">{d.a === null ? '–' : formatScore(d.a)}</td>
                  <td className="pl-3 text-right">{d.b === null ? '–' : formatScore(d.b)}</td>
                  <td className={`pl-3 text-right ${d.delta !== null && d.delta > 0 ? 'text-green' : ''}`}>{signed(d.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
