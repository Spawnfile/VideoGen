import { createHash } from 'node:crypto';
import { isNumericClaim, QC_CHECKS, researchWarnings, type FinalReviewerRole, type ProductResearch, type QcReport, type Storyboard } from '@videogen/shared';
import type { Queryable } from '@videogen/db';

/** Plan F10: one URL of one claim the facts reviewer must open. */
export interface WebTarget { claim_id: string; url: string; why: 'numeric' | 'sample' }

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/** The claims the video shows: storyboard `claim_ids` that exist in the research, in research order. */
export function usedClaims(research: ProductResearch, storyboard: Storyboard): ProductResearch['claims'] {
  const used = new Set(storyboard.beats.flatMap((b) => b.claim_ids));
  return research.claims.filter((c) => used.has(c.id));
}

/** The sources that satisfy the G2 rule of a numeric claim (the `researchWarnings` rule): the primary ones, else the independent ones when there are ≥ 2 hosts. */
function ruleSources(c: ProductResearch['claims'][number]): ProductResearch['claims'][number]['sources'] {
  const primary = c.sources.filter((s) => s.type === 'primary');
  if (primary.length) return primary;
  const independent = c.sources.filter((s) => s.type === 'independent');
  return new Set(independent.map((s) => new URL(s.url).hostname)).size >= 2 ? independent : [];
}

/**
 * Plan F10: the web targets, decided by the step (not the reviewer): every numeric claim of the video with its rule-satisfying sources, plus a
 * 30 % sample (rounded up) of the remaining (claim, URL) pairs ordered by a seeded hash; at most `max`.
 */
export function webCheckTargets(research: ProductResearch, storyboard: Storyboard, seed: string, max = 16): WebTarget[] {
  const out: WebTarget[] = [];
  const seen = new Set<string>();
  const rest: { claim_id: string; url: string }[] = [];
  const add = (claim_id: string, url: string, why: WebTarget['why']) => {
    const key = `${claim_id}\n${url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    out.push({ claim_id, url, why });
    return true;
  };
  for (const c of usedClaims(research, storyboard)) {
    const numeric = isNumericClaim(c.text_tr) ? ruleSources(c) : [];
    for (const s of numeric) add(c.id, s.url, 'numeric');
    for (const s of c.sources) if (!numeric.includes(s) && !rest.some((r) => r.claim_id === c.id && r.url === s.url)) rest.push({ claim_id: c.id, url: s.url });
  }
  const sample = rest
    .map((r) => ({ ...r, h: hash(`${seed}\n${r.claim_id}\n${r.url}`) }))
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0))
    .slice(0, Math.ceil(rest.length * 0.3));
  for (const r of sample) add(r.claim_id, r.url, 'sample');
  return out.slice(0, max);
}

/** Numeric claims of the video without a rule-satisfying source: G2 fails deterministically, the reviewer is not asked (plan T7). */
export function numericGaps(research: ProductResearch, storyboard: Storyboard): string[] {
  return researchWarnings({ ...research, claims: usedClaims(research, storyboard) });
}

/** Hook-sheet times for the retention reviewer (F9): 0, 0.5, 1, 2, 3 s, the re-hook, the payoff and the last frame (clamped, 30 fps). */
export function retentionTimes(storyboard: Storyboard, durationS: number): number[] {
  const last = Math.max(0, Math.floor(durationS * 30 - 1) / 30);
  const round = (n: number) => Math.round(Math.min(n, last) * 100) / 100;
  return [0, 0.5, 1, 2, 3, storyboard.rehook_at, storyboard.payoff_at, last].map(round);
}

export interface ManifestFacts { maxEventGapS: number; eventGapAtS: number; minBeatDwellS: number; minLabelDwellS: number | null; maxLabelsAtOnce: number }

/**
 * Measured facts for D3/D5 (plan F9): the longest gap between scene events (events.json frames ∪ beat starts ∪ 0 ∪ the end), the shortest beat,
 * and from layout.json (sampled every 5 frames) the shortest label run and the most labels on screen at once.
 */
export function manifestFacts(o: {
  events: { frame: number }[]; beats: Storyboard['beats']; layout: { frames: { frame: number; boxes: { kind: string; id?: string }[] }[] } | null; fps: number; durationS: number;
}): ManifestFacts {
  const times = [...new Set([0, o.durationS, ...o.events.map((e) => e.frame / o.fps), ...o.beats.map((b) => b.t_start)].map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
  let gap = 0;
  let at = 0;
  for (let i = 1; i < times.length; i++) if (times[i]! - times[i - 1]! > gap) { gap = times[i]! - times[i - 1]!; at = times[i - 1]!; }
  const frames = o.layout?.frames ?? [];
  const labelRuns: number[] = [];
  const open = new Map<string, number>();
  frames.forEach((f, i) => {
    const here = new Set(f.boxes.filter((b) => b.kind === 'label' && b.id).map((b) => b.id!));
    for (const [id, from] of open) if (!here.has(id)) { labelRuns.push((f.frame - from) / o.fps); open.delete(id); }
    for (const id of here) if (!open.has(id)) open.set(id, f.frame);
    if (i === frames.length - 1) for (const from of open.values()) labelRuns.push((Math.max(f.frame + 5, from + 1) - from) / o.fps);
  });
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    maxEventGapS: r(gap),
    eventGapAtS: r(at),
    minBeatDwellS: r(Math.min(...o.beats.map((b) => b.t_end - b.t_start))),
    minLabelDwellS: labelRuns.length ? r(Math.min(...labelRuns)) : null,
    maxLabelsAtOnce: Math.max(0, ...frames.map((f) => f.boxes.filter((b) => b.kind === 'label').length)),
  };
}

/** The newest hooks of other videos (D9 `fresh_hook`): each other video's latest storyboard, newest first. */
export async function recentHooks(db: Queryable, videoId: string, n = 10): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT s.content FROM (
       SELECT DISTINCT ON (r.video_id) a.id, a.content, a.created_at FROM artifacts a JOIN runs r ON r.id = a.run_id
       WHERE a.kind = 'storyboard' AND r.video_id <> $1 AND a.content IS NOT NULL ORDER BY r.video_id, a.created_at DESC, a.id DESC
     ) s ORDER BY s.created_at DESC, s.id DESC LIMIT $2`, [videoId, n],
  );
  return rows.map((r) => (r.content as Storyboard | null)?.hook?.text_tr).filter((h): h is string => typeof h === 'string');
}

export interface QcFact { id: string; label: string; value: string; limit: string; at?: number }

const QC_FACT_IDS: Record<FinalReviewerRole, (keyof typeof QC_CHECKS)[]> = {
  reviewer_visual: ['d2_black', 'd3_freeze', 'g6_layout'],
  reviewer_retention: ['d8_loop', 'd6_first_audio'],
  reviewer_facts: [],
};

/** The recorded qc measurements a role may look at (music variant); the reviewer never re-measures (F9). */
export function qcFacts(role: FinalReviewerRole, qc: QcReport): QcFact[] {
  return QC_FACT_IDS[role].flatMap((id) => {
    const c = qc.music.find((x) => x.id === id);
    return c ? [{ id, label: QC_CHECKS[id].label_tr, value: String(c.value), limit: String(c.limit), ...(c.at !== undefined ? { at: c.at } : {}) }] : [];
  });
}
