/** Plan M7 Y5: one audit_log row as the audit explorer reads it (ids are text in the table). */
export interface AuditRow {
  seq: number;
  ts: string;
  actorType: string;
  actorId: string | null;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  runId: string | null;
  stepId: string | null;
  sessionId: string | null;
  toolUseId: string | null;
  data: unknown;
  hash: string;
}

/** `action` ending in `*` is a prefix (`publish.*`); `from` is inclusive, `to` exclusive (ISO); `before` is the seq cursor. */
export interface AuditFilter {
  runId?: string;
  videoId?: string;
  sessionId?: string;
  role?: string;
  action?: string;
  from?: string;
  to?: string;
  before?: number;
  limit?: number;
}

export interface AuditPage { rows: AuditRow[]; nextBefore: number | null }
export interface AuditActionCount { action: string; n: number }

export const AUDIT_LIMIT_MAX = 200;
export const AUDIT_LIMIT_DEFAULT = 50;
/** Tool input in the detail view: every string cut at this many characters, the whole input at most AUDIT_TOOL_INPUT_MAX bytes. */
export const AUDIT_STRING_CAP = 4000;
export const AUDIT_TOOL_INPUT_MAX = 32 * 1024;

export interface AuditDetail {
  row: AuditRow;
  links: {
    session?: { id: string; role: string; model: string; transcriptSha: string | null };
    /** Input from the session's assistant event that carried this tool_use id, redacted and capped; `truncated` when any cut applied. */
    tool?: { name: string; input: unknown; truncated: boolean };
    artifact?: { id: string; kind: string; blobSha: string | null; versionId: string | null };
    file?: { path: string; beforeSha: string | null; afterSha: string | null };
  };
}

export interface AuditVerifyResult {
  ok: boolean;
  checked: number;
  firstBadSeq: number | null;
  lastSeq: number | null;
  checkedAt: string;
  ms: number;
}
