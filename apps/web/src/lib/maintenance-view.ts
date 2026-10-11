import { DISK_LOW_MB, DISK_WARN_MB, GC_BACKUP_MAX_AGE_MS, GC_REPORT_MAX_AGE_MS, type MaintenanceInfo, type MaintenanceJobKind } from '@videogen/shared/browser';
import { ago } from './format.ts';

const one = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 1 });

/** Binary units: "1.8 GB", "12.3 MB", "2 KB". */
export function bytesLabel(b: number): string {
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 ** 2) return `${one(b / 1024)} KB`;
  if (b < 1024 ** 3) return `${one(b / 1024 ** 2)} MB`;
  return `${one(b / 1024 ** 3)} GB`;
}

export type DiskTone = 'ok' | 'warn' | 'low';
/** Footer: "disk 41 GB boş" (spec §13.1); under 10 GB warn, under 3 GB low (red). */
export function diskLabel(mb: number | null | undefined): { text: string; tone: DiskTone } | null {
  if (mb === null || mb === undefined) return null;
  const gb = mb / 1024;
  const value = mb < 1024 ? `${Math.round(mb)} MB` : `${gb >= 10 ? Math.round(gb) : one(gb)} GB`;
  return { text: `${value} free`, tone: mb < DISK_LOW_MB ? 'low' : mb < DISK_WARN_MB ? 'warn' : 'ok' };
}

export type BackupTone = 'ok' | 'old' | 'failed' | 'never';
const RUNNING: Record<MaintenanceJobKind, string> = {
  backup: 'Backing up…', gc_report: 'Preparing the cleanup report…', gc_delete: 'Deleting…', orphan_report: 'Preparing the orphan file report…',
};

export interface DataView {
  lines: { label: string; value: string }[];
  backupTone: BackupTone;
  backupText: string;
  gcText: string;
  orphanText: string;
  canDelete: boolean;
  /** "142 dosya · 1,8 GB sil"; null when there is nothing to delete. */
  deleteLabel: string | null;
  /** Why "Sil…" is disabled (null when it is enabled or there is nothing to delete). */
  deleteNote: string | null;
  runningText: string | null;
}

/** Plan M7 Y11: the "Veri ve yedek" section. Deletion is offered only with a fresh report and a backup in the last 24 h (Y10). */
export function dataView(m: MaintenanceInfo, now = Date.now()): DataView {
  const b = m.backup;
  const fresh = (iso: string | null, maxMs: number) => iso !== null && now - Date.parse(iso) <= maxMs;
  const backupTone: BackupTone = !b.lastAt ? 'never' : b.ok === false ? 'failed' : fresh(b.lastOkAt, GC_BACKUP_MAX_AGE_MS) ? 'ok' : 'old';
  const backupText = backupTone === 'never' ? 'No backup yet'
    : backupTone === 'failed' ? `Backup failed: ${b.error ?? 'unknown error'}`
      : ['Last backup ' + ago(b.lastOkAt, now), b.bytes !== null ? bytesLabel(b.bytes) : null, b.via, `${b.count} files`].filter(Boolean).join(' · ');
  const gc = m.gc;
  const gcText = !gc ? 'No report yet' : `Last report ${ago(gc.at, now)}: ${gc.candidates ? `${gc.candidates} candidates · ${bytesLabel(gc.bytes)}` : 'nothing to delete'}`;
  const deleteLabel = gc && gc.candidates > 0 ? `Delete ${gc.candidates} file${gc.candidates === 1 ? '' : 's'} · ${bytesLabel(gc.bytes)}` : null;
  const deleteNote = !deleteLabel ? null
    : m.running ? 'A maintenance job is running.'
      : !fresh(gc!.at, GC_REPORT_MAX_AGE_MS) ? 'The report is older than 24 hours: create a new one.'
        : !fresh(b.lastOkAt, GC_BACKUP_MAX_AGE_MS) ? 'Deleting needs a successful backup in the last 24 hours.' : null;
  const o = m.orphans;
  const orphanText = !o ? 'No report yet'
    : `Only on disk ${o.diskOnly} · only in the database ${o.dbOnly} · size mismatch ${o.sizeMismatch} · stray run folders ${o.strayRunDirs} · upload leftovers removed ${o.uploadsRemoved}`;
  return {
    lines: [
      { label: 'Data folder', value: m.dataDir },
      { label: 'Free disk', value: m.diskFreeMb === null ? '—' : diskLabel(m.diskFreeMb)!.text.replace(/ free$/, '') },
      { label: 'Database', value: bytesLabel(m.dbBytes) },
      { label: 'Media', value: bytesLabel(m.mediaBytes) },
    ],
    backupTone, backupText, gcText, orphanText,
    canDelete: deleteLabel !== null && deleteNote === null,
    deleteLabel, deleteNote,
    runningText: m.running ? RUNNING[m.running] : null,
  };
}
