#!/usr/bin/env node
// Storage maintenance (spec §11.3, plan M7 Y10): `node bin/maintenance.mjs report` (latest backup / GC / orphan reports)
// · `gc-report` (a new GC report; deletes nothing) · `orphans` (a new orphan report; removes only upload leftovers older than 1 h)
// · `restore-blob <sha>` (brings a trashed blob back from <dataDir>/trash/<day>/). Deleting is only possible from Settings → "Veri ve yedek".
import { register } from 'tsx/esm/api';

register();
const { loadConfig } = await import('../packages/shared/src/config.ts');
const { createPool, GcRefused, gcReport, latestMaintenance, restoreBlob, runningMaintenance } = await import('../packages/db/src/index.ts');
const { orphanReport } = await import('../apps/worker/src/maintenance/orphans.ts');
const [cmd, ...rest] = process.argv.slice(2);
const config = loadConfig();
const mb = (b) => `${(Number(b) / 1048576).toFixed(1)} MB`;
const USAGE = 'kullanım: node bin/maintenance.mjs report | gc-report | orphans | restore-blob <sha>';

if (!['report', 'gc-report', 'orphans', 'restore-blob'].includes(cmd) || (cmd === 'restore-blob' && !rest[0])) {
  console.error(USAGE);
  process.exitCode = 2;
} else {
  const pool = createPool(config.databaseUrl, 2);
  try {
    if (cmd === 'report') {
      const [backup, ok, gc, del, orphans, running] = await Promise.all([
        latestMaintenance(pool, 'backup', ['done', 'failed']), latestMaintenance(pool, 'backup', ['done']), latestMaintenance(pool, 'gc_report', ['done']),
        latestMaintenance(pool, 'gc_delete', ['done', 'failed']), latestMaintenance(pool, 'orphan_report', ['done']), runningMaintenance(pool),
      ]);
      console.log(`veri dizini: ${config.dataDir}`);
      console.log(`son yedek: ${backup ? `${backup.status} ${backup.startedAt}${backup.detail?.error ? ` · ${backup.detail.error}` : ''}` : 'yok'}${ok ? ` · son başarılı ${ok.endedAt} (${mb(ok.detail?.bytes ?? 0)})` : ''}`);
      console.log(`çöp toplama raporu: ${gc ? `${gc.id} · ${gc.startedAt} · ${gc.detail?.count ?? 0} aday · ${mb(gc.detail?.bytes ?? 0)}` : 'yok'}`);
      for (const c of gc?.detail?.top ?? []) console.log(`  ${c.sha}\t${c.mime}\t${mb(c.bytes)}\t${c.touchedAt}`);
      if (del) console.log(`son silme: ${del.status} ${del.startedAt} · ${del.detail?.deleted ?? 0} silindi, ${del.detail?.skipped ?? 0} atlandı`);
      console.log(`yetim raporu: ${orphans ? `${orphans.startedAt} · yalnızca diskte ${orphans.detail?.diskOnly} · yalnızca veritabanında ${orphans.detail?.dbOnly} · boyutu tutmayan ${orphans.detail?.sizeMismatch} · sahipsiz run klasörü ${orphans.detail?.strayRunDirs}` : 'yok'}`);
      if (running) console.log(`süren iş: ${running}`);
    } else if (cmd === 'gc-report') {
      const r = await gcReport({ pool, actor: 'user' });
      console.log(`rapor ${r.id}: ${r.candidates.length} aday · ${mb(r.bytes)} (silme yalnızca Ayarlar → Veri ve yedek'ten, onayla)`);
      for (const c of r.candidates.slice(0, 20)) console.log(`  ${c.sha}\t${c.mime}\t${mb(c.bytes)}\t${c.touchedAt}`);
    } else if (cmd === 'orphans') {
      const r = await orphanReport({ pool, dataDir: config.dataDir, actor: 'user' });
      console.log(`yalnızca diskte: ${r.diskOnly.length} · yalnızca veritabanında: ${r.dbOnly.length} · boyutu tutmayan: ${r.sizeMismatch.length} · sahipsiz run klasörü: ${r.strayRunDirs.length} · silinen yükleme artığı: ${r.uploadsRemoved}`);
      for (const [label, list] of [['diskte', r.diskOnly], ['veritabanında', r.dbOnly], ['boyut', r.sizeMismatch], ['run', r.strayRunDirs]]) {
        for (const x of list.slice(0, 50)) console.log(`  ${label}\t${x}`);
      }
    } else {
      const r = await restoreBlob({ pool, dataDir: config.dataDir, actor: 'user' }, rest[0]);
      console.log(`geri yüklendi: ${r.sha256} → ${r.path} (${mb(r.bytes)}, çöp kutusu ${r.from})`);
    }
  } catch (e) {
    console.error(e instanceof GcRefused ? e.message : `bakım işi başarısız (${e?.name ?? 'hata'})`);
    process.exitCode = e instanceof GcRefused ? 3 : 1;
  } finally {
    await pool.end();
  }
}
