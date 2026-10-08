import { DAY_MS } from './publish.ts';

/** Plan M7 Y10/Y11: storage maintenance rules shared by the worker, the API and the settings page. */
/** A blob touched (written or re-used by putBlob) in the last 7 days is never a GC candidate. */
export const GC_MIN_AGE_DAYS = 7;
/** Deletion needs a report and a successful backup, both at most 24 h old. */
export const GC_REPORT_MAX_AGE_MS = DAY_MS;
export const GC_BACKUP_MAX_AGE_MS = DAY_MS;
/** At most this many candidate shas are stored in a report (the largest first). */
export const GC_REPORT_MAX_CANDIDATES = 10_000;
/** Trashed media files are purged after 7 days. */
export const TRASH_KEEP_DAYS = 7;
/** Upload leftovers (`<dataDir>/uploads/*`) older than 1 h are removed (not user files). */
export const UPLOAD_MAX_AGE_MS = 60 * 60_000;
/** Footer free-disk thresholds (MB): under 10 GB warn, under 3 GB red (spec §13.1). */
export const DISK_WARN_MB = 10 * 1024;
export const DISK_LOW_MB = 3 * 1024;

export type MaintenanceJobKind = 'backup' | 'gc_report' | 'gc_delete' | 'orphan_report';

export interface GcCandidate { sha: string; bytes: number; mime: string; createdAt: string; touchedAt: string }

/** GET /api/maintenance */
export interface MaintenanceInfo {
  dataDir: string;
  diskFreeMb: number | null;
  dbBytes: number;
  mediaBytes: number;
  backup: {
    /** The last attempt (success or failure). */
    lastAt: string | null; ok: boolean | null; bytes: number | null; via: string | null; error: string | null;
    /** The last successful dump (deletion needs one in the last 24 h). */
    lastOkAt: string | null;
    count: number;
  };
  gc: {
    reportId: string; at: string; candidates: number; bytes: number; top: GcCandidate[];
    lastDelete: { at: string; reportId: string | null; deleted: number; skipped: number; bytes: number; ok: boolean; error: string | null } | null;
  } | null;
  orphans: {
    at: string; diskOnly: number; dbOnly: number; sizeMismatch: number; strayRunDirs: number; uploadsRemoved: number;
    samples: { diskOnly: string[]; dbOnly: string[]; sizeMismatch: string[]; strayRunDirs: string[] };
  } | null;
  running: MaintenanceJobKind | null;
}

/** Local calendar day (the machine's time zone): daily dumps and trash folders are named by it. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
