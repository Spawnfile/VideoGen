import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPool } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

describe('createPool', () => {
  it('survives an idle connection being terminated by the server', async () => {
    const uncaught = vi.fn();
    process.on('uncaughtException', uncaught);
    const logged = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const pool = createPool(t.appUrl, 2);
    try {
      const c = await pool.connect();
      const { rows } = await c.query<{ pid: number }>('select pg_backend_pid() as pid');
      c.release();
      const admin = new pg.Client({ connectionString: t.adminUrl });
      await admin.connect();
      await admin.query('select pg_terminate_backend($1)', [rows[0].pid]);
      await admin.end();
      await new Promise((r) => setTimeout(r, 200));
      expect(uncaught).not.toHaveBeenCalled();
      const line = logged.mock.calls.map((a) => String(a[0])).join('');
      expect(line).toMatch(/idle client error/);
      expect(line).not.toContain('videogen_app:'); // no connection string / message leakage
      const r = await pool.query('select 1 as one');
      expect(r.rows[0].one).toBe(1);
    } finally {
      logged.mockRestore();
      process.off('uncaughtException', uncaught);
      await pool.end();
    }
  });
});
