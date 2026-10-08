import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { FindingRecord, ReviewRecord } from '@videogen/shared';
import type { Queryable } from './client.ts';
import { appendAudit } from './audit.ts';

export interface NewFinding {
  checkId: string; severity: string; dimension?: string | null; gate?: string | null; evidence?: unknown; fixHint?: string | null;
  status?: 'open' | 'regressed';
}
export interface NewReview {
  reviewerRole: string; seq: number; rubricVersion: string; stepId?: string | null; sessionId?: string | null;
  total?: number | null; dimensionScores?: unknown; gates?: unknown; verdict?: string | null; summaryTr?: string | null;
  findings: NewFinding[];
}
export type { FindingRecord, ReviewRecord };

/**
 * Plan F22: one round of the final review in one transaction. Rows are unique per (run, round, role, seq) and written with
 * ON CONFLICT DO NOTHING, so a restarted step replays the same round without a second row. When anything was inserted, earlier rounds'
 * open/regressed findings whose check is in `fixed` become `fixed` in `versionId`; the round's own findings are never closed here.
 */
/** jsonb parameter: SQL NULL for an absent or null value (not the jsonb literal 'null'). */
const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));

export async function recordReviewRound(
  pool: pg.Pool,
  o: { runId: string; round: number; versionId: string | null; rows: NewReview[]; fixed: string[] },
): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const run = await c.query('SELECT video_id FROM runs WHERE id = $1', [o.runId]);
    if (!run.rowCount) throw new Error(`recordReviewRound: run ${o.runId} does not exist`);
    const videoId: string = run.rows[0].video_id;
    let inserted = 0;
    for (const r of o.rows) {
      const ins = await c.query(
        `INSERT INTO reviews (id, video_id, version_id, run_id, step_id, round, reviewer_role, seq, session_id, rubric_version, total, dimension_scores, gates, verdict, summary_tr, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, clock_timestamp()) ON CONFLICT (run_id, round, reviewer_role, seq) DO NOTHING RETURNING id`,
        [randomUUID(), videoId, o.versionId, o.runId, r.stepId ?? null, o.round, r.reviewerRole, r.seq, r.sessionId ?? null, r.rubricVersion, r.total ?? null,
          json(r.dimensionScores), json(r.gates), r.verdict ?? null, r.summaryTr ?? null],
      );
      if (!ins.rowCount) continue;
      inserted++;
      for (const f of r.findings) {
        await c.query(
          `INSERT INTO findings (id, review_id, check_id, severity, dimension, gate, evidence, fix_hint, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp())`,
          [randomUUID(), ins.rows[0].id, f.checkId, f.severity, f.dimension ?? null, f.gate ?? null, json(f.evidence), f.fixHint ?? null, f.status ?? 'open'],
        );
      }
    }
    if (inserted) {
      if (o.fixed.length) {
        await c.query(
          `UPDATE findings f SET status = 'fixed', fixed_in_version_id = $3 FROM reviews r
           WHERE f.review_id = r.id AND r.run_id = $1 AND r.round < $2 AND f.status IN ('open', 'regressed') AND f.check_id = ANY($4::text[])`,
          [o.runId, o.round, o.versionId, o.fixed],
        );
      }
      await appendAudit(c, {
        actorType: 'orchestrator', action: 'review.recorded', subjectType: 'video', subjectId: videoId, runId: o.runId,
        data: { round: o.round, versionId: o.versionId, rows: o.rows.map((r) => ({ role: r.reviewerRole, seq: r.seq, findings: r.findings.length })), fixed: o.fixed },
      });
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const toFinding = (r: Record<string, any>): FindingRecord => ({
  id: r.id, checkId: r.check_id, severity: r.severity, dimension: r.dimension, gate: r.gate, evidence: r.evidence, fixHint: r.fix_hint, status: r.status, fixedInVersionId: r.fixed_in_version_id,
});
const toReview = (r: Record<string, any>, findings: FindingRecord[]): ReviewRecord => ({
  id: r.id, videoId: r.video_id, versionId: r.version_id, runId: r.run_id, stepId: r.step_id, round: r.round, reviewerRole: r.reviewer_role, seq: r.seq, sessionId: r.session_id,
  rubricVersion: r.rubric_version, total: r.total === null ? null : Math.round(Number(r.total) * 10_000) / 10_000, dimensionScores: r.dimension_scores, gates: r.gates,
  verdict: r.verdict, summaryTr: r.summary_tr, createdAt: new Date(r.created_at).toISOString(), findings,
});

async function load(db: Queryable, where: string, id: string): Promise<ReviewRecord[]> {
  const { rows } = await db.query(
    `SELECT * FROM reviews WHERE ${where} = $1 ORDER BY round, (reviewer_role <> 'orchestrator'), reviewer_role, seq, created_at`,
    [id],
  );
  if (!rows.length) return [];
  const f = await db.query('SELECT * FROM findings WHERE review_id = ANY($1::uuid[]) ORDER BY created_at, id', [rows.map((r) => r.id)]);
  const by = new Map<string, FindingRecord[]>();
  for (const r of f.rows) by.set(r.review_id, [...(by.get(r.review_id) ?? []), toFinding(r)]);
  return rows.map((r) => toReview(r, by.get(r.id) ?? []));
}
/** Round → the `orchestrator` summary first → role → seq, with findings. */
export const listRunReviews = (db: Queryable, runId: string) => load(db, 'run_id', runId);
export const listVideoReviews = (db: Queryable, videoId: string) => load(db, 'video_id', videoId);
/** Plan M7 Y7: the rounds that reviewed one version (the library detail's version picker). */
export const listVersionReviews = (db: Queryable, versionId: string) => load(db, 'version_id', versionId);
