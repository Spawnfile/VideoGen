#!/usr/bin/env node
// Backups (spec §11.3, plan M7 Y9): `node bin/backup.mjs now` · `node bin/backup.mjs list`
// · `node bin/backup.mjs restore <file> --into <new_db>` (only into a database that does not exist; prints audit_verify and row counts)
import { resolve } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const { loadConfig } = await import('../packages/shared/src/config.ts');
const { appendAudit, createPool, latestMaintenance } = await import('../packages/db/src/index.ts');
const { BackupError, listBackups, restoreBackup } = await import('../apps/worker/src/maintenance/backup.ts');
const { MaintenanceService } = await import('../apps/worker/src/maintenance/service.ts');
const [cmd, ...rest] = process.argv.slice(2);
const config = loadConfig();
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

if (cmd === 'now' || cmd === 'list') {
  const pool = createPool(config.adminDatabaseUrl, 2);
  try {
    if (cmd === 'now') {
      const audit = (action, data) => appendAudit(pool, { actorType: 'user', action, data }).then(() => {}, () => {});
      const r = await new MaintenanceService({ pool, dataDir: config.dataDir, config, audit }).runNow('backup');
      if (!r) { console.error('başka bir bakım işi çalışıyor; sonra yeniden deneyin'); process.exitCode = 3; }
      else if (r.status === 'failed') { console.error(`yedek alınamadı: ${r.detail.error}`); process.exitCode = 1; }
      else console.log(`yedek alındı: ${r.detail.file} (${mb(r.detail.bytes)}, ${r.detail.ms} ms, ${r.detail.via})${r.detail.pruned.length ? ` · silinen: ${r.detail.pruned.join(', ')}` : ''}`);
    } else {
      const files = await listBackups(config.dataDir);
      if (!files.length) console.log('yedek yok');
      for (const f of files) console.log(`${f.file}\t${mb(f.bytes)}\t${f.mtime}`);
      const last = await latestMaintenance(pool, 'backup').catch(() => null);
      if (last) console.log(`son iş: ${last.status} ${last.startedAt}${last.detail?.error ? ` · ${last.detail.error}` : ''}`);
    }
  } finally {
    await pool.end();
  }
} else if (cmd === 'restore' && rest[0] && rest[1] === '--into' && rest[2]) {
  try {
    const r = await restoreBackup({ config, file: resolve(rest[0]), into: rest[2] });
    console.log(`geri yüklendi: ${r.database} (${r.via})`);
    console.log(`audit_verify: ${r.verify.ok ? 'ok' : `BOZUK (seq ${r.verify.firstBadSeq})`} · ${r.verify.checked} satır`);
    for (const [t, n] of Object.entries(r.counts)) console.log(`${t}\t${n}`);
    if (!r.verify.ok) process.exitCode = 4;
  } catch (e) {
    console.error(e instanceof BackupError ? e.message : `geri yükleme başarısız (${e?.name ?? 'hata'})`);
    process.exitCode = e instanceof BackupError ? e.exitCode : 1;
  }
} else {
  console.error('kullanım: node bin/backup.mjs now | list | restore <dosya> --into <yeni_veritabanı>\n  geri yükleme yalnızca var olmayan bir veritabanına yapılır (ad: küçük harf, rakam, _)');
  process.exitCode = 2;
}
