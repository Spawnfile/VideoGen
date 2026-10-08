#!/usr/bin/env node
// Drops leftover test databases (plan M7 Y2): every `vg_test_*` / `vg_tpltest_*` and every `vg_tpl_*` but the current one, when nobody is connected.
import pg from 'pg';
import { register } from 'tsx/esm/api';

register();
const { loadConfig } = await import('../packages/shared/src/config.ts');
const { MIGRATIONS_DIR } = await import('../packages/db/src/migrate.ts');
const { templateName } = await import('../packages/db/test/helpers.ts');
const current = templateName(MIGRATIONS_DIR);
const admin = new pg.Client({ connectionString: loadConfig().adminDatabaseUrl });
await admin.connect();
try {
  const { rows } = await admin.query(
    `SELECT d.datname, (SELECT count(*) FROM pg_stat_activity a WHERE a.datname = d.datname)::int AS conns FROM pg_database d
     WHERE starts_with(d.datname, 'vg_test_') OR starts_with(d.datname, 'vg_tpl_') OR starts_with(d.datname, 'vg_tpltest_') ORDER BY 1`);
  let dropped = 0;
  for (const { datname, conns } of rows) {
    if (datname === current) continue;
    if (!/^[a-z0-9_]+$/.test(datname)) continue;
    if (conns > 0) { console.log(`atlandı (bağlantı var): ${datname}`); continue; }
    try {
      await admin.query(`DROP DATABASE ${datname}`); // no FORCE: a connection that just appeared keeps it
      dropped++;
    } catch (e) {
      console.log(`atlandı (${e.message}): ${datname}`);
    }
  }
  console.log(`${dropped} test veritabanı silindi; güncel şablon: ${current}`);
} finally {
  await admin.end();
}
