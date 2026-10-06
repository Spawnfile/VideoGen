import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  normalizeProductName, type ArtifactMeta, type AudioMode, type PlanStep, type ProgressSource, type RunKind, type RunStatus, type RunView,
  type StepKey, type StepStatus, type StepView, type UsageMark, type VideoStatus, type VideoView,
} from '@videogen/shared';
import { appendAudit } from './audit.ts';
import { publishEvent } from './events.ts';
import type { Queryable } from './client.ts';

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
/** `real` columns read back as 0.41999998…; usage fractions are kept to 4 decimals. */
const round4 = (v: unknown): number | null => (v === null || v === undefined ? null : Math.round(Number(v) * 10_000) / 10_000);

export interface CreatedRun { productId: string; videoId: string; runId: string; versionId: string }

/** API side of "Üret": user text lands in rows, the worker only gets ids (spec §5.1). One transaction. */
export async function createProduceRun(pool: pg.Pool, inp: { productName: string; audioMode: AudioMode; plan: PlanStep[] }): Promise<CreatedRun> {
  const name = inp.productName.trim().replace(/\s+/g, ' ');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const p = await c.query(
      `INSERT INTO products (id, name, normalized_name) VALUES ($1, $2, $3)
       ON CONFLICT (normalized_name) DO UPDATE SET normalized_name = EXCLUDED.normalized_name RETURNING id`,
      [randomUUID(), name, normalizeProductName(name)],
    );
    const productId: string = p.rows[0].id;
    const videoId = randomUUID();
    const runId = randomUUID();
    const versionId = randomUUID();
    await c.query(
      `INSERT INTO videos (id, product_id, title, audio_mode, status, current_version_id) VALUES ($1, $2, $3, $4, 'queued', $5)`,
      [videoId, productId, `${name} — içinde ne var`, inp.audioMode, versionId],
    );
    await c.query(`INSERT INTO versions (id, video_id, round, reason) VALUES ($1, $2, 0, 'produce')`, [versionId, videoId]);
    await c.query(`INSERT INTO runs (id, video_id, kind, trigger, plan, status) VALUES ($1, $2, 'produce', 'user', $3, 'queued')`, [runId, videoId, JSON.stringify(inp.plan)]);
    for (const [i, s] of inp.plan.entries()) {
      await c.query(`INSERT INTO steps (id, run_id, key, ordinal, weight, status) VALUES ($1, $2, $3, $4, $5, 'pending')`, [randomUUID(), runId, s.key, i, s.weight]);
    }
    await appendAudit(c, {
      actorType: 'user', action: 'video.produce_requested', subjectType: 'video', subjectId: videoId, runId,
      data: { productId, audioMode: inp.audioMode, plan: inp.plan.map((s) => s.key) },
    });
    await c.query('COMMIT');
    return { productId, videoId, runId, versionId };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export interface RunRecord { id: string; videoId: string; kind: RunKind; status: RunStatus; plan: PlanStep[]; progress: number; etaS: number | null; error: string | null; usageStart: UsageMark | null; createdAt: string; startedAt: string | null; endedAt: string | null }
export interface StepRecord extends StepView { inputHash: string | null }
export interface RunPatch { status?: RunStatus; progress?: number; etaS?: number | null; error?: string | null; startedAt?: Date; endedAt?: Date; usageStart?: UsageMark | null; usageEnd?: UsageMark | null }
export interface StepPatch { status?: StepStatus; progress?: number; progressSource?: ProgressSource | null; attempt?: number; inputHash?: string | null; sessionId?: string | null; error?: string | null; note?: string | null; startedAt?: Date | null; endedAt?: Date | null }

const RUN_COLS: Record<keyof RunPatch, string> = { status: 'status', progress: 'progress', etaS: 'eta_s', error: 'error', startedAt: 'started_at', endedAt: 'ended_at', usageStart: 'usage_start', usageEnd: 'usage_end' };
const STEP_COLS: Record<keyof StepPatch, string> = { status: 'status', progress: 'progress', progressSource: 'progress_source', attempt: 'attempt', inputHash: 'input_hash', sessionId: 'session_id', error: 'error', note: 'note', startedAt: 'started_at', endedAt: 'ended_at' };
const JSON_KEYS = new Set(['usageStart', 'usageEnd']);

async function patchRow(db: Queryable, table: 'runs' | 'steps', id: string, p: object, cols: Record<string, string>): Promise<void> {
  const entries = Object.entries(p).filter(([k, v]) => v !== undefined && cols[k]);
  if (!entries.length) return;
  const sets = entries.map(([k], i) => `${cols[k]} = $${i + 2}`);
  await db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1`, [id, ...entries.map(([k, v]) => (JSON_KEYS.has(k) && v !== null ? JSON.stringify(v) : v))]);
}
export const updateRun = (db: Queryable, id: string, p: RunPatch) => patchRow(db, 'runs', id, p, RUN_COLS);
export const updateStep = (db: Queryable, id: string, p: StepPatch) => patchRow(db, 'steps', id, p, STEP_COLS);

export async function updateVideo(db: Queryable, id: string, p: { status?: VideoStatus; statusNote?: string | null }): Promise<void> {
  await db.query(
    `UPDATE videos SET status = coalesce($2, status), status_note = CASE WHEN $3::boolean THEN $4 ELSE status_note END, updated_at = now() WHERE id = $1`,
    [id, p.status ?? null, p.statusNote !== undefined, p.statusNote ?? null],
  );
}

function toRun(r: Record<string, any>): RunRecord {
  return {
    id: r.id, videoId: r.video_id, kind: r.kind, status: r.status, plan: r.plan, progress: Number(r.progress), etaS: r.eta_s, error: r.error,
    usageStart: r.usage_start ?? null, createdAt: iso(r.created_at)!, startedAt: iso(r.started_at), endedAt: iso(r.ended_at),
  };
}
function toStep(r: Record<string, any>): StepRecord {
  return {
    id: r.id, runId: r.run_id, key: r.key as StepKey, ordinal: r.ordinal, weight: Number(r.weight), status: r.status, progress: Number(r.progress),
    progressSource: r.progress_source, attempt: r.attempt, round: r.round, sessionId: r.session_id, error: r.error, note: r.note, inputHash: r.input_hash,
    startedAt: iso(r.started_at), endedAt: iso(r.ended_at),
  };
}
const toStepView = ({ inputHash: _h, ...v }: StepRecord): StepView => v;

export async function getRun(db: Queryable, id: string): Promise<RunRecord | null> {
  const { rows } = await db.query('SELECT * FROM runs WHERE id = $1', [id]);
  return rows[0] ? toRun(rows[0]) : null;
}
export async function listRunSteps(db: Queryable, runId: string): Promise<StepRecord[]> {
  const { rows } = await db.query('SELECT * FROM steps WHERE run_id = $1 ORDER BY ordinal', [runId]);
  return rows.map(toStep);
}
export async function getStep(db: Queryable, id: string): Promise<StepRecord | null> {
  const { rows } = await db.query('SELECT * FROM steps WHERE id = $1', [id]);
  return rows[0] ? toStep(rows[0]) : null;
}

export interface RunContext { run: RunRecord; videoId: string; productId: string; productName: string; audioMode: AudioMode; versionId: string | null }
export async function getRunContext(db: Queryable, runId: string): Promise<RunContext | null> {
  const { rows } = await db.query(
    `SELECT r.*, v.audio_mode, v.current_version_id, p.id AS product_id, p.name AS product_name
     FROM runs r JOIN videos v ON v.id = r.video_id JOIN products p ON p.id = v.product_id WHERE r.id = $1`,
    [runId],
  );
  const r = rows[0];
  return r ? { run: toRun(r), videoId: r.video_id, productId: r.product_id, productName: r.product_name, audioMode: r.audio_mode, versionId: r.current_version_id } : null;
}

export async function getRunView(db: Queryable, id: string): Promise<RunView | null> {
  const run = await getRun(db, id);
  if (!run) return null;
  const { plan: _p, usageStart: _u, ...rest } = run;
  return { ...rest, steps: (await listRunSteps(db, id)).map(toStepView) };
}
export async function listRunViews(db: Queryable, videoId: string): Promise<RunView[]> {
  const { rows } = await db.query('SELECT id FROM runs WHERE video_id = $1 ORDER BY created_at DESC', [videoId]);
  const out: RunView[] = [];
  for (const r of rows) { const v = await getRunView(db, r.id); if (v) out.push(v); }
  return out;
}

const VIDEO_SQL = `
  WITH u AS (
    SELECT r.video_id, count(s.id)::int AS sessions, coalesce(sum(s.tokens), 0)::bigint AS tokens, sum(s.cost_usd) AS cost
    FROM runs r JOIN agent_sessions s ON s.run_id = r.id::text GROUP BY r.video_id),
  w AS (
    SELECT video_id, sum((usage_end->>'fiveHour')::float8 - (usage_start->>'fiveHour')::float8) AS d
    FROM runs
    WHERE usage_start->>'fiveHour' IS NOT NULL AND usage_end->>'fiveHour' IS NOT NULL
      -- Same window: get_usage writes ms (…16:59:59.916Z), rate_limit_event whole seconds (…17:00:00Z) for one reset.
      AND ((usage_start->>'fiveHourResetsAt' IS NULL AND usage_end->>'fiveHourResetsAt' IS NULL)
        OR abs(extract(epoch FROM (usage_end->>'fiveHourResetsAt')::timestamptz - (usage_start->>'fiveHourResetsAt')::timestamptz)) < 60)
    GROUP BY video_id)
  SELECT v.*, p.name AS product_name, p.difficulty, lr.id AS latest_run_id, u.sessions, u.tokens, u.cost, w.d AS five_hour_delta
  FROM videos v JOIN products p ON p.id = v.product_id
  LEFT JOIN LATERAL (SELECT id FROM runs r WHERE r.video_id = v.id ORDER BY r.created_at DESC LIMIT 1) lr ON true
  LEFT JOIN u ON u.video_id = v.id
  LEFT JOIN w ON w.video_id = v.id`;

function toVideo(r: Record<string, any>): VideoView {
  return {
    id: r.id, productId: r.product_id, productName: r.product_name, title: r.title, audioMode: r.audio_mode, status: r.status, statusNote: r.status_note,
    difficulty: r.difficulty, latestRunId: r.latest_run_id, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
    usage: { sessions: r.sessions ?? 0, tokens: Number(r.tokens ?? 0), costUsd: num(r.cost), fiveHourDelta: num(r.five_hour_delta) },
  };
}
export async function getVideoView(db: Queryable, id: string): Promise<VideoView | null> {
  const { rows } = await db.query(`${VIDEO_SQL} WHERE v.id = $1`, [id]);
  return rows[0] ? toVideo(rows[0]) : null;
}
export async function listVideoViews(db: Queryable, limit = 50): Promise<VideoView[]> {
  const { rows } = await db.query(`${VIDEO_SQL} ORDER BY v.updated_at DESC LIMIT $1`, [limit]);
  return rows.map(toVideo);
}

export async function setProductDifficulty(db: Queryable, productId: string, difficulty: string): Promise<void> {
  await db.query('UPDATE products SET difficulty = $2 WHERE id = $1', [productId, difficulty]);
}

export interface NewArtifact {
  runId: string; stepId?: string | null; versionId?: string | null; kind: string; blobSha?: string | null; content?: unknown; inputHash?: string | null; meta?: unknown;
  /** Video artifacts (spec §11.1): length and stream facts from ffprobe. */
  durationMs?: number | null; width?: number | null; height?: number | null; codec?: string | null;
}
export type ArtifactRecord = ArtifactMeta & { content: unknown; inputHash: string | null; meta: unknown };
const toMeta = (r: Record<string, any>): ArtifactMeta => ({ id: r.id, runId: r.run_id, stepId: r.step_id, versionId: r.version_id, kind: r.kind, blobSha: r.blob_sha, createdAt: iso(r.created_at)! });
const toArtifact = (r: Record<string, any>): ArtifactRecord => ({ ...toMeta(r), content: r.content, inputHash: r.input_hash, meta: r.meta });

export async function insertArtifact(db: Queryable, a: NewArtifact): Promise<ArtifactMeta> {
  const { rows } = await db.query(
    `INSERT INTO artifacts (id, run_id, step_id, version_id, kind, blob_sha, content, input_hash, meta, duration_ms, width, height, codec, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, clock_timestamp()) RETURNING *`,
    [randomUUID(), a.runId, a.stepId ?? null, a.versionId ?? null, a.kind, a.blobSha ?? null, a.content === undefined ? null : JSON.stringify(a.content), a.inputHash ?? null,
      a.meta === undefined ? null : JSON.stringify(a.meta), a.durationMs ?? null, a.width ?? null, a.height ?? null, a.codec ?? null],
  );
  return toMeta(rows[0]);
}
export async function findArtifact(db: Queryable, o: { runId: string; kind: string; inputHash: string }): Promise<ArtifactRecord | null> {
  const { rows } = await db.query('SELECT * FROM artifacts WHERE run_id = $1 AND kind = $2 AND input_hash = $3 ORDER BY created_at DESC LIMIT 1', [o.runId, o.kind, o.inputHash]);
  return rows[0] ? toArtifact(rows[0]) : null;
}
export async function latestArtifact(db: Queryable, runId: string, kind: string): Promise<ArtifactRecord | null> {
  const { rows } = await db.query('SELECT * FROM artifacts WHERE run_id = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 1', [runId, kind]);
  return rows[0] ? toArtifact(rows[0]) : null;
}
export async function getArtifact(db: Queryable, id: string): Promise<ArtifactRecord | null> {
  const { rows } = await db.query('SELECT * FROM artifacts WHERE id = $1', [id]);
  return rows[0] ? toArtifact(rows[0]) : null;
}
export async function listArtifacts(db: Queryable, videoId: string): Promise<ArtifactMeta[]> {
  const { rows } = await db.query('SELECT a.* FROM artifacts a JOIN runs r ON r.id = a.run_id WHERE r.video_id = $1 ORDER BY a.created_at DESC', [videoId]);
  return rows.map(toMeta);
}

/** Durations (s) of the most recent finished steps of a kind, newest first: the ETA's history (spec §7.1, §12.1). */
export async function stepHistorySeconds(db: Queryable, key: StepKey, limit = 5): Promise<number[]> {
  const { rows } = await db.query(
    `SELECT extract(epoch FROM ended_at - started_at) AS s FROM steps
     WHERE key = $1 AND status = 'done' AND started_at IS NOT NULL AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT $2`,
    [key, limit],
  );
  return rows.map((r) => Math.round(Number(r.s)));
}

export async function latestUsageMark(db: Queryable): Promise<UsageMark | null> {
  const { rows } = await db.query('SELECT five_hour_util, five_hour_resets_at, seven_day_util FROM usage_snapshots ORDER BY id DESC LIMIT 1');
  const r = rows[0];
  return r ? { fiveHour: round4(r.five_hour_util), fiveHourResetsAt: iso(r.five_hour_resets_at), sevenDay: round4(r.seven_day_util) } : null;
}

/**
 * Both views after any run/step/video change (API and worker publish the same shapes). The read and the inserts share one
 * transaction that first takes the publisher's advisory lock (72720001, migration 0003): a concurrent update cannot slip
 * an older snapshot in after a newer one, so the event stream is as monotone as the rows.
 */
export async function publishRunAndVideo(pool: pg.Pool, runId: string): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(72720001)');
    const run = await getRunView(c, runId);
    if (run) {
      await publishEvent(c, { topic: 'runs', type: 'run.updated', payload: run });
      const video = await getVideoView(c, run.videoId);
      if (video) await publishEvent(c, { topic: 'videos', type: 'video.updated', payload: video });
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Atomic, monotone step progress (≤ 99 while running). A `time` estimate never overwrites an `agent`/`render` value.
 * Returns the run id when something changed.
 */
export async function bumpStepProgress(db: Queryable, stepId: string, percent: number, source: ProgressSource): Promise<string | null> {
  const { rows } = await db.query(
    `UPDATE steps SET progress = GREATEST(progress, LEAST(99, $2::real)), progress_source = $3
     WHERE id = $1 AND status = 'running'
       AND NOT ($3 = 'time' AND coalesce(progress_source, '') IN ('agent', 'render')) -- NULL-safe: a fresh step has no source
       AND (GREATEST(progress, LEAST(99, $2::real)) <> progress OR progress_source IS DISTINCT FROM $3)
     RETURNING run_id`,
    [stepId, Math.round(percent * 10) / 10, source],
  );
  return rows[0]?.run_id ?? null;
}

/** Status change only while the step is active (queued/running/waiting_*); returns the run id when it changed. `note` undefined keeps the note. */
export async function setStepStatusIfActive(db: Queryable, stepId: string, status: StepStatus, note?: string | null): Promise<string | null> {
  const { rows } = await db.query(
    `UPDATE steps SET status = $2, note = CASE WHEN $3::boolean THEN $4 ELSE note END
     WHERE id = $1 AND status IN ('queued', 'running', 'waiting_gpu', 'waiting_limit', 'waiting_disk')
       AND (status IS DISTINCT FROM $2 OR ($3::boolean AND note IS DISTINCT FROM $4))
     RETURNING run_id`,
    [stepId, status, note !== undefined, note ?? null],
  );
  return rows[0]?.run_id ?? null;
}

/** Run progress only rises (spec §12.1). */
export async function raiseRunProgress(db: Queryable, runId: string, progress: number, etaS: number | null): Promise<void> {
  await db.query('UPDATE runs SET progress = GREATEST(progress, $2::real), eta_s = $3 WHERE id = $1', [runId, progress, etaS]);
}

const RUN_IS_RUNNING = "EXISTS (SELECT 1 FROM runs r WHERE r.id = steps.run_id AND r.status = 'running')";

/** pending → queued only while the run is running: a cancel that lands mid-advance cannot be undone. */
export async function queueStepIfRunActive(db: Queryable, stepId: string): Promise<boolean> {
  const { rowCount } = await db.query(`UPDATE steps SET status = 'queued' WHERE id = $1 AND status = 'pending' AND ${RUN_IS_RUNNING}`, [stepId]);
  return (rowCount ?? 0) > 0;
}

/**
 * Plan C6 (inherited D5): the draft review sends the run back. One transaction: only while the review step is still running in
 * `round` and its run is running, steps with ordinals from..to become pending with round + 1 and a fresh attempt counter (the
 * orchestrator's retry budget is per round), and the review's job is closed. A crash before COMMIT changes nothing (the restarted
 * review replays its stored decision); a replay after COMMIT finds the step pending and changes nothing (no double round).
 */
export async function rewindForReview(pool: pg.Pool, o: { runId: string; stepId: string; jobId: number; round: number; fromOrdinal: number; toOrdinal: number; note: string }): Promise<boolean> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const live = await c.query(
      `SELECT 1 FROM steps s JOIN runs r ON r.id = s.run_id
       WHERE s.id = $1 AND s.status = 'running' AND s.round = $2 AND r.status = 'running' FOR UPDATE OF s, r`,
      [o.stepId, o.round],
    );
    if (!live.rowCount) {
      await c.query('ROLLBACK');
      return false;
    }
    await c.query(
      `UPDATE steps SET status = 'pending', round = round + 1, attempt = 0, progress = 0, progress_source = NULL, input_hash = NULL, session_id = NULL,
         error = NULL, note = $4, started_at = NULL, ended_at = NULL
       WHERE run_id = $1 AND ordinal BETWEEN $2 AND $3`,
      [o.runId, o.fromOrdinal, o.toOrdinal, o.note],
    );
    await c.query("UPDATE jobs SET status = 'done', lease_owner = NULL, lease_expires_at = NULL WHERE id = $1", [o.jobId]);
    await c.query('COMMIT');
    return true;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** queued/waiting_* → running only while the run is running: a cancel that lands mid-launch keeps the step from starting. */
export async function startStepIfRunActive(db: Queryable, stepId: string, attempt: number): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE steps SET status = 'running', attempt = $2, started_at = now(), ended_at = NULL, error = NULL, note = NULL
     WHERE id = $1 AND status IN ('queued', 'waiting_gpu', 'waiting_disk') AND ${RUN_IS_RUNNING}`,
    [stepId, attempt],
  );
  return (rowCount ?? 0) > 0;
}
