import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { loadConfig } from '@videogen/shared';
import { runMigrations } from '../src/migrate.ts';

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

export async function createTestDb() {
  const cfg = loadConfig();
  const name = `vg_test_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: cfg.adminDatabaseUrl });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(`Postgres'e bağlanılamadı (${(e as Error).message}). Önce: npm run db:up`);
  }
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const adminUrl = withDb(cfg.adminDatabaseUrl, name);
  const appUrl = withDb(cfg.databaseUrl, name);
  try {
    await runMigrations(adminUrl);
  } catch (e) {
    const a = new pg.Client({ connectionString: cfg.adminDatabaseUrl });
    await a.connect();
    await a.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await a.end();
    throw e;
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
