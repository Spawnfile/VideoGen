import type pg from 'pg';
import { LOCK_TIKTOK_RATE, VG_LOCK_NS } from '@videogen/db';
import { realClock, type Clock } from './clock.ts';

/** Plan M6 Y7: TikTok allows ~6 API calls a minute per access token; the upload PUT is not counted. */
export interface RateGate { acquire(): Promise<void> }

const WINDOW_MS = 60_000;

export function memoryRateGate(o: { perMinute: number; clock?: Clock }): RateGate {
  const clock = o.clock ?? realClock;
  const calls: number[] = [];
  return {
    async acquire() {
      for (;;) {
        const now = clock.now();
        while (calls.length && calls[0]! <= now - WINDOW_MS) calls.shift();
        if (calls.length < o.perMinute) { calls.push(now); return; }
        await clock.sleep(calls[0]! + WINDOW_MS - now);
      }
    },
  };
}

/** Shared by the API (connection test) and the worker (sends): the call times live in `settings` under an advisory lock. */
export function pgRateGate(pool: pg.Pool, o: { perMinute: number; clock?: Clock }): RateGate {
  const clock = o.clock ?? realClock;
  return {
    async acquire() {
      for (;;) {
        const c = await pool.connect();
        let wait = 0;
        try {
          await c.query('BEGIN');
          await c.query('SELECT pg_advisory_xact_lock($1, $2)', [VG_LOCK_NS, LOCK_TIKTOK_RATE]);
          const { rows } = await c.query("SELECT value FROM settings WHERE key = 'tiktok.calls'");
          const now = clock.now();
          const calls = ((rows[0]?.value?.calls ?? []) as number[]).filter((x) => typeof x === 'number' && x > now - WINDOW_MS).sort((a, b) => a - b);
          if (calls.length < o.perMinute) {
            calls.push(now);
            await c.query(
              "INSERT INTO settings (key, value, updated_at) VALUES ('tiktok.calls', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
              [JSON.stringify({ calls })],
            );
          } else {
            wait = calls[0]! + WINDOW_MS - now;
          }
          await c.query('COMMIT');
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          c.release();
        }
        if (!wait) return;
        await clock.sleep(wait);
      }
    },
  };
}
