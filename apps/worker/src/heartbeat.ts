import type pg from 'pg';
import { publishLive, pruneEvents } from '@videogen/db';

export function startHeartbeat(pool: pg.Pool, everyMs = 2000): () => void {
  const started = Date.now();
  const h = setInterval(() => {
    void publishLive(pool, {
      topic: 'system',
      type: 'worker.heartbeat',
      payload: { pid: process.pid, rssMb: Math.round(process.memoryUsage().rss / 1048576), uptimeS: Math.round((Date.now() - started) / 1000) },
    }).catch(() => {});
  }, everyMs);
  const prune = setInterval(() => { void pruneEvents(pool, 30).catch(() => {}); }, 3_600_000);
  return () => { clearInterval(h); clearInterval(prune); };
}
