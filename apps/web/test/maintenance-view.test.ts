import { describe, expect, it } from 'vitest';
import type { MaintenanceInfo } from '@videogen/shared/browser';
import { bytesLabel, dataView, diskLabel } from '../src/lib/maintenance-view.ts';

const NOW = new Date('2026-10-08T12:00:00Z').getTime();
const H = 3_600_000;
const GB = 1024 ** 3;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const info = (o: Partial<MaintenanceInfo> = {}): MaintenanceInfo => ({
  dataDir: '/home/u/videogen-data', diskFreeMb: 41 * 1024, dbBytes: 12.3 * 1024 ** 2, mediaBytes: 1.8 * GB,
  backup: { lastAt: iso(3 * H), ok: true, bytes: 12.3 * 1024 ** 2, via: 'docker', error: null, lastOkAt: iso(3 * H), count: 7 },
  gc: { reportId: 'r1', at: iso(2 * H), candidates: 142, bytes: 1.8 * GB, top: [], lastDelete: null },
  orphans: { at: iso(5 * H), diskOnly: 2, dbOnly: 1, sizeMismatch: 0, strayRunDirs: 3, uploadsRemoved: 4, samples: { diskOnly: [], dbOnly: [], sizeMismatch: [], strayRunDirs: [] } },
  running: null, ...o,
});

describe('data and backup helpers (plan M7 T7)', () => {
  it('dataView and diskLabel: backup tone (ok, old, failed, never), delete label with count and size, disabled without a fresh backup; disk warns under 10 GB and is red under 3 GB', () => {
    const v = dataView(info(), NOW);
    expect(v.backupTone).toBe('ok');
    expect(v.backupText).toBe('Last backup 3 h ago · 12.3 MB · docker · 7 files');
    expect(v.lines).toEqual([
      { label: 'Data folder', value: '/home/u/videogen-data' },
      { label: 'Free disk', value: '41 GB' },
      { label: 'Database', value: '12.3 MB' },
      { label: 'Media', value: '1.8 GB' },
    ]);
    expect(v.canDelete).toBe(true);
    expect(v.deleteLabel).toBe('Delete 142 files · 1.8 GB');
    expect(v.deleteNote).toBeNull();
    expect(v.gcText).toBe('Last report 2 h ago: 142 candidates · 1.8 GB');
    expect(v.orphanText).toBe('Only on disk 2 · only in the database 1 · size mismatch 0 · stray run folders 3 · upload leftovers removed 4');

    expect(dataView(info({ backup: { ...info().backup, lastAt: iso(30 * H), lastOkAt: iso(30 * H) } }), NOW)).toMatchObject({
      backupTone: 'old', canDelete: false, deleteNote: 'Deleting needs a successful backup in the last 24 hours.',
    });
    const failed = dataView(info({ backup: { ...info().backup, lastAt: iso(H), ok: false, error: 'pg_dump 16, sunucu 17: VG_PG_DUMP ayarlayın' } }), NOW);
    expect(failed).toMatchObject({ backupTone: 'failed', backupText: 'Backup failed: pg_dump 16, sunucu 17: VG_PG_DUMP ayarlayın', canDelete: true });
    const never = dataView(info({ backup: { lastAt: null, ok: null, bytes: null, via: null, error: null, lastOkAt: null, count: 0 }, gc: null, orphans: null }), NOW);
    expect(never).toMatchObject({ backupTone: 'never', backupText: 'No backup yet', canDelete: false, deleteLabel: null, gcText: 'No report yet', orphanText: 'No report yet' });
    expect(dataView(info({ gc: { ...info().gc!, at: iso(25 * H) } }), NOW)).toMatchObject({ canDelete: false, deleteNote: 'The report is older than 24 hours: create a new one.' });
    expect(dataView(info({ gc: { ...info().gc!, candidates: 0, bytes: 0 } }), NOW)).toMatchObject({ canDelete: false, deleteLabel: null, gcText: 'Last report 2 h ago: nothing to delete' });
    expect(dataView(info({ running: 'backup' }), NOW)).toMatchObject({ canDelete: false, deleteNote: 'A maintenance job is running.', runningText: 'Backing up…' });
    expect(dataView(info({ gc: { ...info().gc!, candidates: 1, bytes: 2048 } }), NOW).deleteLabel).toBe('Delete 1 file · 2 KB');

    expect(diskLabel(41 * 1024)).toEqual({ text: '41 GB free', tone: 'ok' });
    expect(diskLabel(10 * 1024)).toEqual({ text: '10 GB free', tone: 'ok' });
    expect(diskLabel(9.5 * 1024)).toEqual({ text: '9.5 GB free', tone: 'warn' });
    expect(diskLabel(3 * 1024)).toEqual({ text: '3 GB free', tone: 'warn' });
    expect(diskLabel(2.5 * 1024)).toEqual({ text: '2.5 GB free', tone: 'low' });
    expect(diskLabel(512)).toEqual({ text: '512 MB free', tone: 'low' });
    expect(diskLabel(null)).toBeNull();
    expect(bytesLabel(0)).toBe('0 B');
    expect(bytesLabel(1.8 * GB)).toBe('1.8 GB');
  });
});
