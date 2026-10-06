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

// Keys are normalized (lowercase, alphanumerics only) so accessToken, access_token, x-api-key and
// ANTHROPIC_API_KEY all match. Anchored at the end: input_tokens / tokenCount normalize to
// ...tokens / tokencount and stay allowed.
const SECRET_KEY = /(token|secret|password|passwd|apikey|authorization|cookie|privatekey)$/;

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
