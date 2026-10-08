import { readdir, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { GcCandidate, MaintenanceInfo } from '@videogen/shared';
import { appendAudit, gcDelete, GcRefused, latestMaintenance, runningMaintenance, type MaintenanceRun } from '@videogen/db';
import { sendCommand } from './notify.ts';

const DUMP_RE = /^videogen-\d{4}-\d{2}-\d{2}\.dump$/;
const GcBody = z.object({ reportId: z.string().uuid(), confirm: z.union([z.string().trim().regex(/^\d{1,6}$/), z.number().int().min(0)]) });
/** POST path → the worker's `maintenance.run` kind (the reports and the backup run in the worker; it owns pg_dump and the schedule). */
const RUNS = { backup: 'backup', 'gc-report': 'gc_report', orphans: 'orphan_report' } as const;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const at = (r: MaintenanceRun) => r.endedAt ?? r.startedAt;

async function diskFreeMb(dir: string): Promise<number | null> {
  try {
    const s = await statfs(dir);
    return Math.floor((Number(s.bavail) * Number(s.bsize)) / 1048576);
  } catch {
    return null;
  }
}

/**
 * Plan M7 Y10/Y11: Settings → "Veri ve yedek". Reads are cheap (rows, statfs, a directory listing). Backup and the reports are commands to
 * the worker (202). The confirmed GC delete runs here, in the request, through the db package's `gcDelete` (all Y10 conditions, per-blob
 * exclusive locks, trash, audit) so the answer is the result or a Turkish 409 — not a fire-and-forget. Writes need a local Origin (guard.ts).
 */
export function registerMaintenanceRoutes(app: FastifyInstance, deps: { pool: pg.Pool; dataDir: string }): void {
  const { pool, dataDir } = deps;

  app.get('/api/maintenance', async (): Promise<MaintenanceInfo> => {
    const [disk, db, media, backup, okBackup, gc, del, orphans, running, dumps] = await Promise.all([
      diskFreeMb(dataDir),
      pool.query('SELECT pg_database_size(current_database())::bigint AS n'),
      pool.query('SELECT coalesce(sum(bytes), 0)::bigint AS n FROM blobs'),
      latestMaintenance(pool, 'backup', ['done', 'failed']),
      latestMaintenance(pool, 'backup', ['done']),
      latestMaintenance(pool, 'gc_report', ['done']),
      latestMaintenance(pool, 'gc_delete', ['done', 'failed']),
      latestMaintenance(pool, 'orphan_report', ['done']),
      runningMaintenance(pool),
      readdir(join(dataDir, 'backups')).catch(() => [] as string[]),
    ]);
    const o = orphans?.detail ?? {};
    const samples = (o.samples ?? {}) as Record<string, unknown>;
    return {
      dataDir,
      diskFreeMb: disk,
      dbBytes: Number(db.rows[0].n),
      mediaBytes: Number(media.rows[0].n),
      backup: {
        lastAt: backup ? at(backup) : null,
        ok: backup ? backup.status === 'done' : null,
        bytes: okBackup ? num(okBackup.detail?.bytes) : null,
        via: okBackup ? str(okBackup.detail?.via) : null,
        error: backup?.status === 'failed' ? (str(backup.detail?.error) ?? 'yedek alınamadı') : null,
        lastOkAt: okBackup ? at(okBackup) : null,
        count: dumps.filter((f) => DUMP_RE.test(f)).length,
      },
      gc: gc ? {
        reportId: gc.id, at: gc.startedAt, candidates: num(gc.detail?.count), bytes: num(gc.detail?.bytes),
        top: (Array.isArray(gc.detail?.top) ? gc.detail.top : []) as GcCandidate[],
        lastDelete: del ? {
          at: at(del), reportId: str(del.detail?.reportId), deleted: num(del.detail?.deleted), skipped: num(del.detail?.skipped), bytes: num(del.detail?.bytes),
          ok: del.status === 'done', error: del.status === 'failed' ? str(del.detail?.error) : null,
        } : null,
      } : null,
      orphans: orphans ? {
        at: at(orphans), diskOnly: num(o.diskOnly), dbOnly: num(o.dbOnly), sizeMismatch: num(o.sizeMismatch), strayRunDirs: num(o.strayRunDirs), uploadsRemoved: num(o.uploadsRemoved),
        samples: { diskOnly: strs(samples.diskOnly), dbOnly: strs(samples.dbOnly), sizeMismatch: strs(samples.sizeMismatch), strayRunDirs: strs(samples.strayRunDirs) },
      } : null,
      running,
    };
  });

  for (const [path, kind] of Object.entries(RUNS)) {
    app.post(`/api/maintenance/${path}`, async (_req, reply) => {
      await sendCommand(pool, { type: 'maintenance.run', kind });
      await appendAudit(pool, { actorType: 'user', action: 'maintenance.requested', data: { kind } });
      return reply.code(202).send({ accepted: true, kind });
    });
  }

  app.post('/api/maintenance/gc', async (req, reply) => {
    const b = GcBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'geçersiz istek' });
    try {
      return await gcDelete({ pool, dataDir, actor: 'user' }, { reportId: b.data.reportId, confirm: b.data.confirm });
    } catch (e) {
      if (e instanceof GcRefused) return reply.code(409).send({ error: e.message });
      throw e;
    }
  });
}
