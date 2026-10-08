import { DISK_LOW_MB, DISK_WARN_MB, GC_BACKUP_MAX_AGE_MS, GC_REPORT_MAX_AGE_MS, type MaintenanceInfo, type MaintenanceJobKind } from '@videogen/shared/browser';
import { ago } from './format.ts';

const one = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/** Binary units with a Turkish decimal comma: "1,8 GB", "12,3 MB", "2 KB". */
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
  return { text: `disk ${value} boş`, tone: mb < DISK_LOW_MB ? 'low' : mb < DISK_WARN_MB ? 'warn' : 'ok' };
}

export type BackupTone = 'ok' | 'old' | 'failed' | 'never';
const RUNNING_TR: Record<MaintenanceJobKind, string> = {
  backup: 'Yedek alınıyor…', gc_report: 'Çöp toplama raporu hazırlanıyor…', gc_delete: 'Siliniyor…', orphan_report: 'Yetim dosya raporu hazırlanıyor…',
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
  const backupText = backupTone === 'never' ? 'Henüz yedek yok'
    : backupTone === 'failed' ? `Yedek alınamadı: ${b.error ?? 'bilinmeyen hata'}`
      : ['Son yedek ' + ago(b.lastOkAt, now), b.bytes !== null ? bytesLabel(b.bytes) : null, b.via, `${b.count} dosya`].filter(Boolean).join(' · ');
  const gc = m.gc;
  const gcText = !gc ? 'Henüz rapor yok' : `Son rapor ${ago(gc.at, now)}: ${gc.candidates ? `${gc.candidates} aday · ${bytesLabel(gc.bytes)}` : 'silinecek dosya yok'}`;
  const deleteLabel = gc && gc.candidates > 0 ? `${gc.candidates} dosya · ${bytesLabel(gc.bytes)} sil` : null;
  const deleteNote = !deleteLabel ? null
    : m.running ? 'Bir bakım işi sürüyor.'
      : !fresh(gc!.at, GC_REPORT_MAX_AGE_MS) ? 'Rapor 24 saatten eski: yeni bir rapor oluşturun.'
        : !fresh(b.lastOkAt, GC_BACKUP_MAX_AGE_MS) ? 'Silmek için son 24 saatte başarılı bir yedek gerekir.' : null;
  const o = m.orphans;
  const orphanText = !o ? 'Henüz rapor yok'
    : `Yalnızca diskte ${o.diskOnly} · yalnızca veritabanında ${o.dbOnly} · boyutu tutmayan ${o.sizeMismatch} · sahipsiz run klasörü ${o.strayRunDirs} · silinen yükleme artığı ${o.uploadsRemoved}`;
  return {
    lines: [
      { label: 'Veri dizini', value: m.dataDir },
      { label: 'Boş disk', value: m.diskFreeMb === null ? '—' : diskLabel(m.diskFreeMb)!.text.replace(/^disk | boş$/g, '') },
      { label: 'Veritabanı', value: bytesLabel(m.dbBytes) },
      { label: 'Medya', value: bytesLabel(m.mediaBytes) },
    ],
    backupTone, backupText, gcText, orphanText,
    canDelete: deleteLabel !== null && deleteNote === null,
    deleteLabel, deleteNote,
    runningText: m.running ? RUNNING_TR[m.running] : null,
  };
}
