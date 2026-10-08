import {
  AUDIT_LIMIT_DEFAULT, AUDIT_LIMIT_MAX, AUDIT_STRING_CAP, AUDIT_TOOL_INPUT_MAX,
  type AuditActionCount, type AuditDetail, type AuditFilter, type AuditPage, type AuditRow, type AuditVerifyResult,
} from '@videogen/shared';
import type { Queryable } from './client.ts';
import { isUuid } from './agents.ts';
import { redactSecretKeys } from './audit.ts';

export type { AuditActionCount, AuditDetail, AuditFilter, AuditPage, AuditRow, AuditVerifyResult };

const COLS = 'seq, ts, actor_type, actor_id, action, subject_type, subject_id, run_id, step_id, session_id, tool_use_id, data, hash';
const toRow = (r: Record<string, any>): AuditRow => ({
  seq: Number(r.seq), ts: new Date(r.ts).toISOString(), actorType: r.actor_type, actorId: r.actor_id, action: r.action, subjectType: r.subject_type,
  subjectId: r.subject_id, runId: r.run_id, stepId: r.step_id, sessionId: r.session_id, toolUseId: r.tool_use_id, data: r.data, hash: r.hash,
});
const likeEscape = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/**
 * Plan M7 Y5: newest first by seq; `before` is an exclusive seq cursor, so pages never skip or repeat a row while rows are appended.
 * `videoId` covers the video's own rows, its runs' rows and the rows of those runs' sessions. `role` is the part of `actor_id` before `:`.
 */
export async function listAudit(db: Queryable, f: AuditFilter = {}): Promise<AuditPage> {
  const limit = Math.min(Math.max(Math.trunc(f.limit ?? AUDIT_LIMIT_DEFAULT), 1), AUDIT_LIMIT_MAX);
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  let with_ = '';
  if (f.videoId !== undefined) {
    if (!isUuid(f.videoId)) return { rows: [], nextBefore: null };
    const v = p(f.videoId);
    with_ = `WITH vr AS (SELECT id::text AS id FROM runs WHERE video_id = ${v}::text::uuid),
      vs AS (SELECT id::text AS id FROM agent_sessions WHERE run_id IN (SELECT id FROM vr)) `;
    where.push(`((subject_type = 'video' AND subject_id = ${v}::text) OR run_id IN (SELECT id FROM vr) OR session_id IN (SELECT id FROM vs))`);
  }
  if (f.runId !== undefined) where.push(`run_id = ${p(f.runId)}`);
  if (f.sessionId !== undefined) where.push(`session_id = ${p(f.sessionId)}`);
  if (f.role !== undefined) where.push(`(actor_id = ${p(f.role)} OR actor_id LIKE ${p(`${likeEscape(f.role)}:%`)})`);
  if (f.action !== undefined) {
    where.push(f.action.endsWith('*') ? `action LIKE ${p(`${likeEscape(f.action.slice(0, -1))}%`)}` : `action = ${p(f.action)}`);
  }
  if (f.from !== undefined) where.push(`ts >= ${p(f.from)}::timestamptz`);
  if (f.to !== undefined) where.push(`ts < ${p(f.to)}::timestamptz`);
  if (f.before !== undefined) where.push(`seq < ${p(f.before)}`);
  const { rows } = await db.query(
    `${with_}SELECT ${COLS} FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq DESC LIMIT ${p(limit + 1)}`,
    params,
  );
  const page = rows.slice(0, limit).map(toRow);
  return { rows: page, nextBefore: rows.length > limit ? page.at(-1)!.seq : null };
}

export async function auditActions(db: Queryable): Promise<AuditActionCount[]> {
  const { rows } = await db.query('SELECT action, count(*) AS n FROM audit_log GROUP BY action ORDER BY action');
  return rows.map((r) => ({ action: r.action, n: Number(r.n) }));
}

const CUT = '…[kırpıldı]';
function capStrings(v: unknown, cap: number, cut: { any: boolean }): unknown {
  if (typeof v === 'string') {
    if (v.length <= cap) return v;
    cut.any = true;
    return `${v.slice(0, cap)}${CUT}`;
  }
  if (Array.isArray(v)) return v.map((x) => capStrings(x, cap, cut));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, capStrings(x, cap, cut)]));
  return v;
}
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v) ?? '');

/** Redacted, every string ≤ AUDIT_STRING_CAP characters, the whole ≤ AUDIT_TOOL_INPUT_MAX bytes (tighter caps, then a JSON preview string). */
export function boundToolInput(input: unknown): { input: unknown; truncated: boolean } {
  const red = redactSecretKeys(input);
  const cut = { any: false };
  for (const cap of [AUDIT_STRING_CAP, 1000, 250, 60]) {
    const out = capStrings(red, cap, cut);
    if (bytes(out) <= AUDIT_TOOL_INPUT_MAX) return { input: out, truncated: cut.any };
  }
  let s = JSON.stringify(capStrings(red, 60, cut)).slice(0, AUDIT_TOOL_INPUT_MAX - CUT.length);
  while (bytes(s + CUT) > AUDIT_TOOL_INPUT_MAX) s = s.slice(0, Math.floor(s.length * 0.9));
  return { input: s + CUT, truncated: true };
}

type Block = { type?: unknown; id?: unknown; name?: unknown; input?: unknown };

/** Plan M7 Y5: the row plus what it points at. Tool input comes from the session's assistant event holding the `tool_use` block. */
export async function auditDetail(db: Queryable, seq: number): Promise<AuditDetail | null> {
  if (!Number.isSafeInteger(seq) || seq < 1) return null;
  const { rows } = await db.query(`SELECT ${COLS} FROM audit_log WHERE seq = $1`, [seq]);
  if (!rows[0]) return null;
  const row = toRow(rows[0]);
  row.data = redactSecretKeys(row.data);
  const links: AuditDetail['links'] = {};
  if (row.sessionId && isUuid(row.sessionId)) {
    const s = await db.query('SELECT id, role, model, transcript_blob_sha FROM agent_sessions WHERE id = $1', [row.sessionId]);
    if (s.rows[0]) links.session = { id: s.rows[0].id, role: s.rows[0].role, model: s.rows[0].model, transcriptSha: s.rows[0].transcript_blob_sha };
    if (row.toolUseId) {
      const e = await db.query(
        `SELECT payload FROM agent_events WHERE session_id = $1 AND type = 'assistant' AND payload->'message'->'content' @> $2::jsonb ORDER BY seq LIMIT 1`,
        [row.sessionId, JSON.stringify([{ type: 'tool_use', id: row.toolUseId }])],
      );
      const content = (e.rows[0]?.payload?.message?.content ?? []) as Block[];
      const b = content.find((x) => x?.type === 'tool_use' && x.id === row.toolUseId);
      if (b) links.tool = { name: typeof b.name === 'string' ? b.name : 'tool', ...boundToolInput(b.input ?? null) };
    }
  }
  if (row.subjectType === 'artifact' && row.subjectId && isUuid(row.subjectId)) {
    const a = await db.query('SELECT id, kind, blob_sha, version_id FROM artifacts WHERE id = $1', [row.subjectId]);
    if (a.rows[0]) links.artifact = { id: a.rows[0].id, kind: a.rows[0].kind, blobSha: a.rows[0].blob_sha, versionId: a.rows[0].version_id };
  }
  if (row.action === 'agent.file_write' && row.data && typeof row.data === 'object') {
    const d = row.data as Record<string, unknown>;
    const s = (x: unknown) => (typeof x === 'string' ? x : null);
    links.file = { path: s(d.path) ?? row.subjectId ?? '', beforeSha: s(d.beforeSha), afterSha: s(d.afterSha) };
  }
  return { row, links };
}

/** `audit_verify()` is a full scan; one statement, so `lastSeq` and the scan see the same snapshot. */
export async function verifyAuditTimed(db: Queryable): Promise<AuditVerifyResult> {
  const t0 = performance.now();
  const { rows } = await db.query('SELECT v.ok, v.checked, v.first_bad_seq, (SELECT max(seq) FROM audit_log) AS last_seq FROM audit_verify() v');
  const r = rows[0];
  return {
    ok: r.ok, checked: Number(r.checked), firstBadSeq: r.first_bad_seq === null ? null : Number(r.first_bad_seq),
    lastSeq: r.last_seq === null ? null : Number(r.last_seq), checkedAt: new Date().toISOString(), ms: Math.round(performance.now() - t0),
  };
}
