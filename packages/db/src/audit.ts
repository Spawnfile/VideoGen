import type { Queryable } from './client.ts';

export interface AuditEntry {
  actorType: 'user' | 'orchestrator' | 'agent' | 'system';
  actorId?: string;
  action: string;
  subjectType?: string;
  subjectId?: string;
  runId?: string;
  stepId?: string;
  sessionId?: string;
  toolUseId?: string;
  data?: unknown;
}

// Keys are normalized (lowercase, alphanumerics only) so accessToken, access_token, x-api-key and ANTHROPIC_API_KEY all
// match. Anchored at the end: input_tokens / tokenCount normalize to ...tokens / tokencount and stay allowed, and so do
// neutral *_key names (cache_key, sort_key); only credential-like *_key suffixes and plural secret nouns are flagged.
const SECRET_KEY = /(token|secret|secrets|password|passwords|passwd|apikey|authorization|cookie|cookies|privatekey|credential|credentials|(access|secret|signing|client|session|encryption|master)key)$/;

function isSecretKey(k: string): boolean {
  return SECRET_KEY.test(k.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

export function findSecretKeys(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findSecretKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      (isSecretKey(k) ? [`${path}.${k}`] : []).concat(findSecretKeys(v, `${path}.${k}`)),
    );
  }
  return [];
}

/** Deep copy with every secret-like key replaced by `redacted_<n>: '[redacted]'` (for agent tool inputs in audit). */
export function redactSecretKeys<T>(value: T): T {
  let n = 0;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        if (isSecretKey(k)) out[`redacted_${++n}`] = '[redacted]';
        else out[k] = walk(x);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

export async function appendAudit(db: Queryable, e: AuditEntry): Promise<{ seq: number; hash: string }> {
  const bad = findSecretKeys(e.data);
  if (bad.length) throw new Error(`audit data contains secret-like keys: ${bad.join(', ')}`);
  const { rows } = await db.query(
    `INSERT INTO audit_log (actor_type, actor_id, action, subject_type, subject_id, run_id, step_id, session_id, tool_use_id, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING seq, hash`,
    [
      e.actorType, e.actorId ?? null, e.action, e.subjectType ?? null, e.subjectId ?? null,
      e.runId ?? null, e.stepId ?? null, e.sessionId ?? null, e.toolUseId ?? null,
      e.data === undefined ? null : JSON.stringify(e.data),
    ],
  );
  return { seq: Number(rows[0].seq), hash: rows[0].hash };
}

export async function verifyAudit(db: Queryable): Promise<{ ok: boolean; checked: number; firstBadSeq: number | null }> {
  const { rows } = await db.query('SELECT ok, checked, first_bad_seq FROM audit_verify()');
  const r = rows[0];
  return { ok: r.ok, checked: Number(r.checked), firstBadSeq: r.first_bad_seq === null ? null : Number(r.first_bad_seq) };
}
