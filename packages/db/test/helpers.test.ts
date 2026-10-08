import { randomBytes } from 'node:crypto';
import { appendFileSync, cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { MIGRATIONS_DIR, runMigrations } from '../src/migrate.ts';
import { cloneTemplate, ensureTemplate, templateName, withDb } from './helpers.ts';

const cfg = loadConfig();

async function adminQuery<T extends pg.QueryResultRow>(sql: string, params: unknown[] = [], url = cfg.adminDatabaseUrl): Promise<T[]> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query<T>(sql, params)).rows;
  } finally {
    await c.end();
  }
}

const dbOid = async (name: string) => (await adminQuery<{ oid: string }>('SELECT oid::text FROM pg_database WHERE datname = $1', [name]))[0]?.oid;

/** What a migrated database must carry: its tables, the app role's grants (audit_log is append-only) and the audit trigger. */
async function shape(db: string) {
  const url = withDb(cfg.adminDatabaseUrl, db);
  const tables = (await adminQuery<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`, [], url)).map((r) => r.t);
  const [g] = await adminQuery<{ ins: boolean; upd: boolean }>(
    `SELECT has_table_privilege('videogen_app', 'audit_log', 'INSERT') AS ins, has_table_privilege('videogen_app', 'audit_log', 'UPDATE') AS upd`, [], url);
  const triggers = (await adminQuery<{ n: string }>(`SELECT tgname AS n FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass AND NOT tgisinternal ORDER BY 1`, [], url))
    .map((r) => r.n);
  return { tables, grants: g, triggers };
}

describe('test database templates', () => {
  it('templates: a database created from the template has every table, the app role grants and the audit trigger; migrations run once per template name; a half-built `_building` template is never used; three concurrent creates from one template all succeed; a changed migration set gives a new name', async () => {
    // Never the real `vg_tpl_*`: a scratch copy of the migrations and a per-run `vg_tpltest_` prefix.
    const prefix = `vg_tpltest_${randomBytes(3).toString('hex')}_`;
    const dir = mkdtempSync(join(tmpdir(), 'vg-tpltest-'));
    cpSync(MIGRATIONS_DIR, dir, { recursive: true });
    const reference = `${prefix}ref`;
    try {
      const name = templateName(dir, prefix);
      expect(name).toMatch(new RegExp(`^${prefix}[0-9a-f]{12}$`));
      expect(templateName(dir, prefix)).toBe(name);

      // A crashed earlier build left an empty `_building` behind: it is dropped and rebuilt, never renamed into place.
      await adminQuery(`CREATE DATABASE ${name}_building`);
      expect(await ensureTemplate(cfg.adminDatabaseUrl, { migrationsDir: dir, prefix })).toBe(name);
      expect(await dbOid(`${name}_building`)).toBeUndefined();
      const oid = await dbOid(name);
      expect(oid).toBeDefined();

      // The reference: the same migrations run directly, as `createTestDb` did before templates.
      await adminQuery(`CREATE DATABASE ${reference}`);
      await runMigrations(withDb(cfg.adminDatabaseUrl, reference), dir);
      const want = await shape(reference);
      expect(want.tables).toContain('audit_log');
      expect(want.grants).toEqual({ ins: true, upd: false });
      expect(want.triggers).toContain('audit_log_chain');
      expect(await shape(name)).toEqual(want);

      // Once per name: a second call leaves the template alone.
      expect(await ensureTemplate(cfg.adminDatabaseUrl, { migrationsDir: dir, prefix })).toBe(name);
      expect(await dbOid(name)).toBe(oid);

      const copies = await Promise.all([1, 2, 3].map(() => cloneTemplate(cfg.adminDatabaseUrl, name, `${prefix}c${randomBytes(4).toString('hex')}`)));
      expect(new Set(copies).size).toBe(3);
      for (const c of copies) expect(await shape(c)).toEqual(want);
      // The app role reaches a copy, and its audit trigger chains rows.
      const app = new pg.Client({ connectionString: withDb(cfg.databaseUrl, copies[0]) });
      await app.connect();
      try {
        await app.query(`INSERT INTO audit_log (actor_type, action, data) VALUES ('system', 'tpl.check', '{}')`);
        const { rows } = await app.query<{ seq: string; hash: string }>('SELECT seq::text, hash FROM audit_log');
        expect(rows).toHaveLength(1);
        expect(rows[0].seq).toBe('1');
        expect(rows[0].hash).toMatch(/^[0-9a-f]{64}$/);
      } finally {
        await app.end();
      }

      // A changed migration set is a new template; the old one is left for whoever still uses it.
      const last = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().at(-1)!;
      appendFileSync(join(dir, last), '\n-- changed\n');
      const next = templateName(dir, prefix);
      expect(next).not.toBe(name);
      expect(await ensureTemplate(cfg.adminDatabaseUrl, { migrationsDir: dir, prefix })).toBe(next);
      expect(await dbOid(next)).toBeDefined();
      expect(await dbOid(name)).toBe(oid);
    } finally {
      const left = await adminQuery<{ datname: string }>(`SELECT datname FROM pg_database WHERE starts_with(datname, $1)`, [prefix]);
      for (const { datname } of left) await adminQuery(`DROP DATABASE ${datname} WITH (FORCE)`);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
