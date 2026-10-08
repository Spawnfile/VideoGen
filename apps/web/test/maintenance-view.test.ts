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
    expect(v.backupText).toBe('Son yedek 3 sa önce · 12,3 MB · docker · 7 dosya');
    expect(v.lines).toEqual([
      { label: 'Veri dizini', value: '/home/u/videogen-data' },
      { label: 'Boş disk', value: '41 GB' },
      { label: 'Veritabanı', value: '12,3 MB' },
      { label: 'Medya', value: '1,8 GB' },
    ]);
    expect(v.canDelete).toBe(true);
    expect(v.deleteLabel).toBe('142 dosya · 1,8 GB sil');
    expect(v.deleteNote).toBeNull();
    expect(v.gcText).toBe('Son rapor 2 sa önce: 142 aday · 1,8 GB');
    expect(v.orphanText).toBe('Yalnızca diskte 2 · yalnızca veritabanında 1 · boyutu tutmayan 0 · sahipsiz run klasörü 3 · silinen yükleme artığı 4');

    expect(dataView(info({ backup: { ...info().backup, lastAt: iso(30 * H), lastOkAt: iso(30 * H) } }), NOW)).toMatchObject({
      backupTone: 'old', canDelete: false, deleteNote: 'Silmek için son 24 saatte başarılı bir yedek gerekir.',
    });
    const failed = dataView(info({ backup: { ...info().backup, lastAt: iso(H), ok: false, error: 'pg_dump 16, sunucu 17: VG_PG_DUMP ayarlayın' } }), NOW);
    expect(failed).toMatchObject({ backupTone: 'failed', backupText: 'Yedek alınamadı: pg_dump 16, sunucu 17: VG_PG_DUMP ayarlayın', canDelete: true });
    const never = dataView(info({ backup: { lastAt: null, ok: null, bytes: null, via: null, error: null, lastOkAt: null, count: 0 }, gc: null, orphans: null }), NOW);
    expect(never).toMatchObject({ backupTone: 'never', backupText: 'Henüz yedek yok', canDelete: false, deleteLabel: null, gcText: 'Henüz rapor yok', orphanText: 'Henüz rapor yok' });
    expect(dataView(info({ gc: { ...info().gc!, at: iso(25 * H) } }), NOW)).toMatchObject({ canDelete: false, deleteNote: 'Rapor 24 saatten eski: yeni bir rapor oluşturun.' });
    expect(dataView(info({ gc: { ...info().gc!, candidates: 0, bytes: 0 } }), NOW)).toMatchObject({ canDelete: false, deleteLabel: null, gcText: 'Son rapor 2 sa önce: silinecek dosya yok' });
    expect(dataView(info({ running: 'backup' }), NOW)).toMatchObject({ canDelete: false, deleteNote: 'Bir bakım işi sürüyor.', runningText: 'Yedek alınıyor…' });
    expect(dataView(info({ gc: { ...info().gc!, candidates: 1, bytes: 2048 } }), NOW).deleteLabel).toBe('1 dosya · 2 KB sil');

    expect(diskLabel(41 * 1024)).toEqual({ text: 'disk 41 GB boş', tone: 'ok' });
    expect(diskLabel(10 * 1024)).toEqual({ text: 'disk 10 GB boş', tone: 'ok' });
    expect(diskLabel(9.5 * 1024)).toEqual({ text: 'disk 9,5 GB boş', tone: 'warn' });
    expect(diskLabel(3 * 1024)).toEqual({ text: 'disk 3 GB boş', tone: 'warn' });
    expect(diskLabel(2.5 * 1024)).toEqual({ text: 'disk 2,5 GB boş', tone: 'low' });
    expect(diskLabel(512)).toEqual({ text: 'disk 512 MB boş', tone: 'low' });
    expect(diskLabel(null)).toBeNull();
    expect(bytesLabel(0)).toBe('0 B');
    expect(bytesLabel(1.8 * GB)).toBe('1,8 GB');
  });
});
