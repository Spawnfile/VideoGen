import type { AuditActionCount, AuditFilter, AuditRow, AuditVerifyResult } from '@videogen/shared/browser';

/** Plan M7 Y6: what the explorer keeps in the URL (`/audit?run=…`); dates are the picked days (YYYY-MM-DD, both inclusive). */
export type AuditQueryFilter = Pick<AuditFilter, 'runId' | 'videoId' | 'sessionId' | 'role' | 'action' | 'from' | 'to'>;
export type AuditTone = 'neutral' | 'ok' | 'warn' | 'error';
export interface AuditRowView { seq: number; time: string; actor: string; action: string; subject: string; summary: string; tone: AuditTone }
export type ChainState = (AuditVerifyResult & { cached?: boolean }) | null;
export type ToolInputView = { kind: 'edit'; path: string; before: string; after: string } | { kind: 'write'; path: string; content: string } | { kind: 'json'; text: string };

const TZ = 'Europe/Istanbul';
const SUMMARY_MAX = 120;
const ACTOR: Record<string, string> = { user: 'Kullanıcı', orchestrator: 'Orkestratör', system: 'Sistem', agent: 'Agent' };

const day = (d: Date) => d.toLocaleDateString('tr-TR', { timeZone: TZ });
const clock = (d: Date, seconds: boolean) =>
  d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false, timeZone: TZ });

/** Thousands grouped with a no-break space ("12 345"), as the spec writes counts. */
export const groupInt = (n: number): string => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function tone(action: string): AuditTone {
  const last = action.slice(action.lastIndexOf('.') + 1);
  if (/(^|_)(failed|rejected|refused)$/.test(last)) return 'error';
  if (last.includes('cancel')) return 'warn';
  if (/(^|_)(completed|succeeded|done)$/.test(last)) return 'ok';
  return 'neutral';
}

function actor(r: AuditRow): string {
  if (r.actorType === 'agent' && r.actorId) return r.actorId.split(':')[0]!;
  return ACTOR[r.actorType] ?? r.actorType;
}

/** A uuid shows its first 8 characters, a path its last segment, anything else up to 24 characters. */
function shortId(id: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return `${id.slice(0, 8)}…`;
  const tail = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) || id : id;
  return tail.length > 24 ? `${tail.slice(0, 23)}…` : tail;
}

function summary(data: unknown): string {
  if (data === null || data === undefined) return '';
  const text = typeof data !== 'object'
    ? String(data)
    : Array.isArray(data)
      ? JSON.stringify(data)
      : Object.entries(data as Record<string, unknown>).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
}

/** Table rows: time (with the date when not today, Istanbul time), actor, action, subject, short data and a tone. */
export function auditView(rows: AuditRow[], now: Date = new Date()): { rows: AuditRowView[] } {
  const today = day(now);
  return {
    rows: rows.map((r) => {
      const d = new Date(r.ts);
      const time = day(d) === today ? clock(d, true) : `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: TZ })} ${clock(d, false)}`;
      const subject = r.subjectType ? (r.subjectId ? `${r.subjectType} ${shortId(r.subjectId)}` : r.subjectType) : '—';
      return { seq: r.seq, time, actor: actor(r), action: r.action, subject, summary: summary(r.data), tone: tone(r.action) };
    }),
  };
}

/** The chain badge: valid with the count and check time, broken at the first bad row, unknown when the check failed. */
export function chainView(v: ChainState, error?: unknown): { text: string; tone: AuditTone; detail: string } {
  if (!v) {
    if (error) return { text: 'Doğrulanamadı', tone: 'neutral', detail: error instanceof Error ? error.message : String(error) };
    return { text: 'Zincir doğrulanıyor…', tone: 'neutral', detail: '' };
  }
  const took = v.ms < 100 ? `${Math.round(v.ms)} ms'de` : `${(v.ms / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sn'de`;
  const detail = `${groupInt(v.checked)} satır ${took} tarandı${v.cached ? ' · önbellekten' : ''}`;
  if (!v.ok) return { text: `Zincir bozuk: satır ${v.firstBadSeq ?? '?'}`, tone: 'error', detail };
  return { text: `Zincir geçerli · ${groupInt(v.checked)} satır · ${clock(new Date(v.checkedAt), false)}`, tone: 'ok', detail };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Same shapes the API accepts (apps/api/src/routes/audit.ts), so a hand-edited URL never turns into a 400.
const KEYS: [param: string, key: keyof AuditQueryFilter, ok: (s: string) => boolean][] = [
  ['run', 'runId', (s) => UUID.test(s)],
  ['video', 'videoId', (s) => UUID.test(s)],
  ['session', 'sessionId', (s) => UUID.test(s)],
  ['role', 'role', (s) => /^[a-z][a-z0-9_]{0,39}$/.test(s)],
  ['action', 'action', (s) => /^[a-z0-9_.]{1,80}\*?$/.test(s)],
  ['from', 'from', (s) => DAY.test(s) && !Number.isNaN(Date.parse(s))],
  ['to', 'to', (s) => DAY.test(s) && !Number.isNaN(Date.parse(s))],
];

export function filterFromQuery(search: string): AuditQueryFilter {
  const q = new URLSearchParams(search);
  const f: AuditQueryFilter = {};
  for (const [param, key, ok] of KEYS) {
    const v = q.get(param);
    if (v && ok(v)) f[key] = v;
  }
  return f;
}

/** `?run=…&action=publish.*` (empty string when nothing is set). */
export function queryFromFilter(f: AuditQueryFilter): string {
  const q = new URLSearchParams();
  for (const [param, key] of KEYS) {
    const v = f[key];
    if (v) q.set(param, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** GET /api/audit path: picked days become Istanbul midnights, `to` moves to the next day (the API's bound is exclusive). */
export function auditListPath(f: AuditQueryFilter, before?: number | null, limit?: number): string {
  const q = new URLSearchParams();
  if (f.runId) q.set('run', f.runId);
  if (f.videoId) q.set('video', f.videoId);
  if (f.sessionId) q.set('session', f.sessionId);
  if (f.role) q.set('role', f.role);
  if (f.action) q.set('action', f.action);
  if (f.from) q.set('from', `${f.from}T00:00:00+03:00`);
  if (f.to) q.set('to', `${nextDay(f.to)}T00:00:00+03:00`);
  if (before) q.set('before', String(before));
  if (limit) q.set('limit', String(limit));
  const s = q.toString();
  return `/api/audit${s ? `?${s}` : ''}`;
}

/** The action filter list: actions grouped under their first segment, each group selectable as a prefix (`publish.*`). */
export function actionGroups(counts: AuditActionCount[]): { prefix: string; n: number; actions: AuditActionCount[] }[] {
  const groups = new Map<string, AuditActionCount[]>();
  for (const c of counts) {
    const prefix = c.action.split('.')[0]!;
    groups.set(prefix, [...(groups.get(prefix) ?? []), c]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, actions]) => ({ prefix, n: actions.reduce((s, a) => s + a.n, 0), actions: [...actions].sort((a, b) => a.action.localeCompare(b.action)) }));
}

const str = (v: unknown): v is string => typeof v === 'string';

/** Detail view of a tool call's input: Edit as before/after columns, Write as its content, anything else as pretty JSON. */
export function toolInputView(tool: string, input: unknown): ToolInputView {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (tool === 'Edit' && str(i.file_path) && str(i.old_string) && str(i.new_string)) return { kind: 'edit', path: i.file_path, before: i.old_string, after: i.new_string };
  if (tool === 'Write' && str(i.file_path) && str(i.content)) return { kind: 'write', path: i.file_path, content: i.content };
  return { kind: 'json', text: JSON.stringify(input, null, 2) ?? String(input) };
}
