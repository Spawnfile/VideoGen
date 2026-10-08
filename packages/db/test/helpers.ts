import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { loadConfig } from '@videogen/shared';
import { MIGRATIONS_DIR, runMigrations } from '../src/migrate.ts';
import { VG_LOCK_NS } from '../src/publish.ts';

/** Plan M7 Y2: template builds and every `CREATE DATABASE … TEMPLATE` share one session lock on the admin database. */
const LOCK_TEST_TEMPLATE = 100;
const NAME_RE = /^[a-z0-9_]+$/;

export function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** `<prefix>` + the first 12 hex of sha256 over the folder's `.sql` files and `meta/_journal.json`: a changed migration set is a new template. */
export function templateName(migrationsDir: string, prefix = 'vg_tpl_'): string {
  if (!NAME_RE.test(prefix)) throw new Error(`geçersiz şablon öneki: ${prefix}`);
  const h = createHash('sha256');
  const files = [...readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort(), 'meta/_journal.json'];
  for (const f of files) h.update(`${f}\0`).update(readFileSync(join(migrationsDir, f))).update('\0');
  return `${prefix}${h.digest('hex').slice(0, 12)}`;
}

async function connectAdmin(adminUrl: string): Promise<pg.Client> {
  const admin = new pg.Client({ connectionString: adminUrl });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(`Postgres'e bağlanılamadı (${(e as Error).message}). Önce: npm run db:up`);
  }
  return admin;
}

async function locked<T>(admin: pg.Client, fn: () => Promise<T>): Promise<T> {
  await admin.query('SELECT pg_advisory_lock($1, $2)', [VG_LOCK_NS, LOCK_TEST_TEMPLATE]);
  try {
    return await fn();
  } finally {
    await admin.query('SELECT pg_advisory_unlock($1, $2)', [VG_LOCK_NS, LOCK_TEST_TEMPLATE]);
  }
}

/** 55006 "being accessed by other users": a just-closed connection may still be exiting; wait once and retry. */
async function retryBusy(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if ((e as { code?: string }).code !== '55006') throw e;
    await new Promise((r) => setTimeout(r, 1_000));
    await fn();
  }
}

const exists = async (admin: pg.Client, name: string) =>
  (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount === 1;

/**
 * Builds the template once per migration set (plan M7 Y2): into `<name>_building`, renamed only when every migration ran, so a half-built
 * one never counts. A leftover `_building` is dropped; other templates are never touched (another worktree's run may be using them).
 */
export async function ensureTemplate(adminUrl: string, o: { migrationsDir?: string; prefix?: string } = {}): Promise<string> {
  const dir = o.migrationsDir ?? MIGRATIONS_DIR;
  const name = templateName(dir, o.prefix);
  const admin = await connectAdmin(adminUrl);
  try {
    await locked(admin, async () => {
      if (await exists(admin, name)) return;
      const building = `${name}_building`;
      await admin.query(`DROP DATABASE IF EXISTS ${building} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${building}`);
      await runMigrations(withDb(adminUrl, building), dir);
      await retryBusy(() => admin.query(`ALTER DATABASE ${building} RENAME TO ${name}`));
    });
  } finally {
    await admin.end();
  }
  return name;
}

/** `CREATE DATABASE <name> TEMPLATE <template>` under the template lock (Postgres refuses a copy while anyone else is connected to the template). */
export async function cloneTemplate(adminUrl: string, template: string, name: string): Promise<string> {
  if (!NAME_RE.test(template) || !NAME_RE.test(name)) throw new Error(`geçersiz veritabanı adı: ${template} / ${name}`);
  const admin = await connectAdmin(adminUrl);
  try {
    await locked(admin, () => retryBusy(() => admin.query(`CREATE DATABASE ${name} TEMPLATE ${template}`)));
  } finally {
    await admin.end();
  }
  return name;
}

export async function createTestDb() {
  const cfg = loadConfig();
  const name = `vg_test_${randomBytes(4).toString('hex')}`;
  const template = templateName(MIGRATIONS_DIR);
  const admin = await connectAdmin(cfg.adminDatabaseUrl);
  const ready = await exists(admin, template);
  if (!ready) await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const adminUrl = withDb(cfg.adminDatabaseUrl, name);
  const appUrl = withDb(cfg.databaseUrl, name);
  if (ready) {
    await cloneTemplate(cfg.adminDatabaseUrl, template, name);
  } else {
    // No template (globalSetup did not run, e.g. a script): migrate this database directly, as before M7.
    try {
      await runMigrations(adminUrl);
    } catch (e) {
      const a = new pg.Client({ connectionString: cfg.adminDatabaseUrl });
      await a.connect();
      await a.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await a.end();
      throw e;
    }
  }
  const pool = new pg.Pool({ connectionString: appUrl, max: 8 });
  return {
    name,
    pool,
    adminUrl,
    appUrl,
    async drop() {
      await pool.end();
      const a = new pg.Client({ connectionString: cfg.adminDatabaseUrl });
      await a.connect();
      await a.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}
