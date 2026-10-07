import { FINAL_MAX_ROUNDS, formatScore, pickBest, STOP_NOTE, type LoopStop } from '@videogen/shared';
import { appendAudit, findArtifact, latestArtifact, listRunReviews, setBestVersion } from '@videogen/db';
import type pg from 'pg';
import { removeRunFrames } from '../render/frames.ts';
import { openLabels, roundChecks } from './review-step.ts';
import { record, sha, type StepDeps } from './steps.ts';
import type { StepExecutor, StepOutcome } from './types.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** What the `finish` artifact stores (plan F16). */
export interface Finish {
  bestVersionId: string | null;
  round: number;
  total: number | null;
  verdict: 'ready' | 'fix' | 'rework';
  stop: LoopStop | null;
  openFindings: string[];
}

/**
 * Plan F16/I6: the best round of the run's recorded final reviews (`pickBest`) becomes the video's best version, so the library shows it.
 * `finalize` and the orchestrator (a run that ends needs_human/failed after at least one review round) both call it; idempotent.
 */
export async function settleBest(pool: pg.Pool, runId: string) {
  const rows = await listRunReviews(pool, runId);
  const rounds = roundChecks(rows);
  const best = pickBest(rounds);
  if (best?.versionId && rows[0]) await setBestVersion(pool, rows[0].videoId, best.versionId);
  return { best, rounds };
}

const STOPS = Object.keys(STOP_NOTE) as LoopStop[];

/**
 * Spec §7.1 step 11 (plan T9): picks the best version, deletes the final frames and decides the video: `ready` → done, anything else →
 * needs_human with the reason (the loop's stop reason, the best round and score, the open findings).
 */
export function finalizeExecutor(deps: StepDeps): StepExecutor {
  const outcome = (f: Finish): StepOutcome => {
    if (f.verdict === 'ready') return { status: 'done', note: `Yayına hazır · ${formatScore(f.total!)} puan${f.round > 0 ? ` · düzeltme turu ${f.round}/${FINAL_MAX_ROUNDS}` : ''}` };
    const open = f.openFindings.length ? ` Açık bulgular: ${openLabels(f.openFindings)}.` : '';
    return {
      status: 'needs_human',
      reason: `${f.stop ? STOP_NOTE[f.stop] : 'Eşik geçilemedi'}: en iyi sürüm tur ${f.round}${f.total !== null ? ` (${formatScore(f.total)} puan)` : ''}.${open} Videoyu chat'ten sürdürebilirsiniz.`,
    };
  };

  /** Why the loop ended: the review step's audited stop first (it knows usage and no_fixer), else what the artifacts of the last round say. */
  async function stopReason(runId: string, last: number): Promise<LoopStop | null> {
    const audited = await deps.pool.query("SELECT data FROM audit_log WHERE run_id = $1 AND action = 'loop.stop' AND data->>'fixRound' = $2::text ORDER BY id DESC LIMIT 1", [runId, String(last)]);
    const reason = audited.rows[0]?.data?.reason as LoopStop | undefined;
    if (reason && STOPS.includes(reason)) return reason;
    if (last >= FINAL_MAX_ROUNDS) return 'limit';
    const [verdict, fix] = await Promise.all([latestArtifact(deps.pool, runId, 'final_verdict'), latestArtifact(deps.pool, runId, 'fix_report')]);
    if ((verdict?.meta as { fixRound?: number } | null)?.fixRound === last && ((verdict?.content as { oscillating?: unknown[] } | null)?.oscillating?.length ?? 0) > 0) return 'oscillation';
    const m = fix?.meta as { fixRound?: number; scope?: string } | null;
    if (m?.fixRound === last && m.scope === 'none') return 'unchanged';
    return null;
  }

  return {
    key: 'finalize',
    resource: 'heavy_cpu',
    async inputHash(ctx) {
      const [v, f] = await Promise.all(['final_verdict', 'fix_report'].map((k) => latestArtifact(deps.pool, ctx.runId, k)));
      return sha({ step: 'finalize', verdict: v?.id ?? null, fix: f?.id ?? null });
    },
    async run(ctx, hash) {
      const { best, rounds } = await settleBest(deps.pool, ctx.runId);
      const stored = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'finish', inputHash: hash });
      let finish = stored?.content as Finish | undefined;
      if (!finish) {
        if (!best) return { status: 'failed', error: 'sonlandırılacak inceleme turu yok', retry: false };
        const ready = best.verdict === 'ready';
        finish = {
          bestVersionId: best.versionId, round: best.round, total: best.total, verdict: best.verdict, stop: ready ? null : await stopReason(ctx.runId, rounds.at(-1)!.round),
          openFindings: best.failed,
        };
        const dir = join(ctx.runDir, 'review', 'final');
        await mkdir(dir, { recursive: true });
        const file = join(dir, 'finish.json');
        await writeFile(file, JSON.stringify(finish, null, 2));
        await record(deps, ctx, { kind: 'finish', file, content: finish, inputHash: hash, meta: { round: finish.round, verdict: finish.verdict } });
      }
      const dirs = removeRunFrames(deps.dataDir, ctx.runId);
      if (dirs.length) await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'frames.deleted', runId: ctx.runId, stepId: ctx.stepId, data: { dirs } });
      return outcome(finish);
    },
  };
}
