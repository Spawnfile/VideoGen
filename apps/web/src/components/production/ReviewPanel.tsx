import { useState } from 'react';
import type { ReviewRecord, VideoStatus } from '@videogen/shared/browser';
import { formatClock } from '@videogen/shared/browser';
import { blobUrl } from '../../lib/api.ts';
import { seekFinal } from '../../lib/player.ts';
import { panelView, reviewBadge, type PanelFinding } from '../../lib/production-view.ts';
import { score as formatScore, SEVERITY_EN } from '../../lib/i18n.ts';

const card = 'rounded-card bg-paper px-4 py-3';
const SEVERITY = SEVERITY_EN;
const GATE_BADGE = { true: 'bg-green/10 text-green', false: 'bg-red/10 text-red', null: 'bg-inset text-ink-3' } as const;
const GATE_WORD = { true: 'passed', false: 'failed', null: 'unknown' } as const;

/** Clicking a finding's time opens the Final tab and seeks there; without a final video the time is plain text. */
function Finding({ f, canSeek }: { f: PanelFinding; canSeek: boolean }) {
  const seek = () => seekFinal(f.timecode!);
  return (
    <li className="flex flex-col gap-0.5">
      <span className="text-[13px]">
        {f.label}
        <span className="tabular-nums text-ink-3"> · {SEVERITY[f.severity] ?? f.severity}</span>
        {f.status === 'regressed' && <span className="ml-1.5 rounded-full bg-inset px-2 py-0.5 text-[11.5px] text-ink">regressed</span>}
        {f.timecode !== undefined && (canSeek ? (
          <button
            type="button"
            data-testid="finding-time"
            aria-label={`${f.label}: jump the final to ${formatClock(f.timecode)}`}
            onClick={seek}
            className="ml-1.5 min-h-8 rounded-control px-1.5 text-[12px] tabular-nums text-accent-glow hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-accent-glow"
          >
            {formatClock(f.timecode)}
          </button>
        ) : <span className="ml-1.5 text-[12px] tabular-nums text-ink-3">{formatClock(f.timecode)}</span>)}
      </span>
      {f.hint && <span className="text-[12.5px] leading-relaxed text-ink-2">{f.hint}</span>}
    </li>
  );
}

/**
 * Spec §8/§13.1 final review (plan T10): K13 total and verdict, nine dimension bars with the 60 % floor, six gates, one card per reviewer.
 * Plan M7 Y7: round chips pick an earlier round (null = the newest); the host may hold the round (`onRound`) to show that round's sheet.
 */
export function ReviewPanel({ reviews, runId, status, sheetSha, canSeek, failed, round: held, onRound }: {
  reviews: ReviewRecord[]; runId: string | null; status: VideoStatus; sheetSha: string | null; canSeek: boolean; failed: boolean;
  round?: number | null; onRound?: (round: number | null) => void;
}) {
  const [own, setOwn] = useState<number | null>(null);
  const picked = onRound ? (held ?? null) : own;
  const pick = onRound ?? setOwn;
  // A round the run does not have (another run, or before its rows arrive) falls back to the newest.
  const v = panelView(reviews, runId, picked) ?? panelView(reviews, runId);
  if (!v && failed) return <p data-testid="review-error" className="text-[12px] text-ink-3">Could not load the review</p>;
  if (!v) return null;
  const badge = reviewBadge(v.verdict, status);
  return (
    <section role="region" aria-label="Review" data-testid="review-panel" className={`${card} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[14px] font-medium">Review</h3>
        <span data-testid="panel-score" className="text-[18px] font-medium tabular-nums">{v.total !== null ? `${formatScore(v.total)} points` : 'no score'}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${badge.ok ? 'bg-green/10 text-green' : 'bg-inset text-ink'}`}>{badge.text}</span>
        {v.rounds.length > 1 ? (
          <span role="group" aria-label="Round" className="ml-auto flex flex-wrap gap-1">
            {v.rounds.map((r) => (
              <button
                key={r}
                type="button"
                data-testid="round-chip"
                aria-pressed={v.round === r}
                aria-label={`round ${r + 1}${r === v.rounds.at(-1) ? ' (newest)' : ''}`}
                onClick={() => pick(r === v.rounds.at(-1) ? null : r)}
                className={`rounded-control px-2.5 py-0.5 text-[12px] tabular-nums transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow ${v.round === r ? 'bg-ink font-medium text-canvas' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
              >
                round {r + 1}
              </button>
            ))}
          </span>
        ) : <span className="ml-auto text-[12px] tabular-nums text-ink-3">round {v.round + 1}</span>}
      </div>

      <ul aria-label="Dimensions" className="flex flex-col gap-1.5">
        {v.dimensions.map((d) => (
          <li key={d.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-[12.5px] md:grid-cols-[9rem_minmax(0,1fr)_3.5rem]">
            <span className={d.low ? 'text-red/90' : 'text-ink-2'}>{d.label}</span>
            <span
              role="meter"
              aria-label={d.label}
              aria-valuemin={0}
              aria-valuemax={d.weight}
              aria-valuenow={d.score ?? undefined}
              aria-valuetext={d.score === null ? 'unknown' : `${formatScore(d.score)} / ${d.weight}${d.low ? ' (below the floor)' : ''}`}
              className="relative h-1.5 overflow-hidden rounded-full bg-inset"
            >
              <span className={`absolute inset-y-0 left-0 rounded-full ${d.low ? 'bg-red/60' : 'bg-ink-2'}`} style={{ width: `${d.score === null ? 0 : Math.min(100, (d.score / d.weight) * 100)}%` }} />
              <span aria-hidden className="absolute inset-y-0 left-[60%] w-px bg-ink-3" />
            </span>
            <span className="text-right tabular-nums text-ink-3">{d.score === null ? '–' : formatScore(d.score)}/{d.weight}</span>
          </li>
        ))}
      </ul>

      <ul aria-label="Gates" className="flex flex-wrap gap-1.5">
        {v.gates.map((g) => (
          <li key={g.id} className={`rounded-full px-2.5 py-0.5 text-[12px] ${GATE_BADGE[String(g.pass) as keyof typeof GATE_BADGE]}`}>
            {g.label} <span aria-hidden>{g.pass === null ? '?' : g.pass ? '✓' : '✗'}</span>
            <span className="sr-only">{GATE_WORD[String(g.pass) as keyof typeof GATE_WORD]}</span>
          </li>
        ))}
      </ul>

      {sheetSha && (
        <a href={blobUrl(sheetSha)} target="_blank" rel="noreferrer" aria-label="Reviewed frames: open the contact sheet" className="self-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow">
          <img data-testid="review-sheet" src={blobUrl(sheetSha)} alt="Contact sheet of the reviewed frames" loading="lazy" className="h-24 w-auto rounded-control border border-line/60" />
        </a>
      )}

      <div className="flex flex-col gap-2">
        {v.auto && (
          <article data-testid="auto-card" aria-label="Automatic checks" className="rounded-input bg-inset/60 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <h4 className="text-[13px] font-medium">Automatic checks</h4>
              <span className="text-[12px] text-ink-3">{v.auto.findings.length} findings</span>
            </div>
            <ul aria-label="Findings" className="mt-2 flex flex-col gap-1.5">{v.auto.findings.map((f) => <Finding key={f.id} f={f} canSeek={canSeek} />)}</ul>
          </article>
        )}
        {v.reviewers.map((r) => (
          <article key={r.role} data-testid="reviewer-card" aria-label={`${r.label} review`} className="rounded-input bg-inset/60 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <h4 className="text-[13px] font-medium">{r.label}</h4>
              <span className="text-[12px] text-ink-3">{r.merged ? 'two independent reviews, averaged' : r.findings.length ? `${r.findings.length} findings` : 'no findings'}</span>
            </div>
            {r.summary && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{r.summary}</p>}
            {r.findings.length > 0 && <ul aria-label="Findings" className="mt-2 flex flex-col gap-1.5">{r.findings.map((f) => <Finding key={f.id} f={f} canSeek={canSeek} />)}</ul>}
          </article>
        ))}
      </div>
    </section>
  );
}
