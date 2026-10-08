import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type pg from 'pg';
import { localDay, type Config } from '@videogen/shared';
import { failRunningMaintenance, finishMaintenance, GC_BUSY_TR, GcRefused, gcReport, purgeTrash, startMaintenance, type MaintenanceKind } from '@videogen/db';
import { BackupError, backupDir, backupFile, pruneBackups, takeBackup } from './backup.ts';
import { orphanReport, sweepUploads } from './orphans.ts';
import type { RunFn } from './pgdump.ts';

/**
 * The kinds a `maintenance.run` command may ask for. `gc_delete` is not one: the confirmed delete runs in the API request
 * (POST /api/maintenance/gc) so the user gets the result or the refusal reason at once.
 */
export const RUNNABLE_MAINTENANCE = ['backup', 'gc_report', 'orphan_report'] as const;
export type RunnableMaintenance = (typeof RUNNABLE_MAINTENANCE)[number];
export const isRunnableMaintenance = (v: unknown): v is RunnableMaintenance => typeof v === 'string' && (RUNNABLE_MAINTENANCE as readonly string[]).includes(v);

const FIRST_TICK_MS = 5 * 60_000;
const INTERRUPTED = 'worker yeniden başladı';
const WEEKLY_KEY = 'maintenance.weekly';
const MONDAY = 1;

export interface MaintenanceDeps {
  pool: pg.Pool;
  dataDir: string;
  config: Pick<Config, 'adminDatabaseUrl' | 'backup'>;
  /** Audit sink; never receives the password or a connection string. */
  audit: (action: string, data: Record<string, unknown>) => Promise<void>;
  clock?: { now(): number };
  run?: RunFn;
  firstTickMs?: number;
}
export interface MaintenanceOutcome { id: string; kind: MaintenanceKind; status: 'done' | 'failed'; detail: Record<string, unknown> }

/**
 * Plan M7 Y9/Y10: the daily backup, the weekly GC and orphan reports (the first look on a local Monday) and, on every look, the sweep of
 * upload leftovers (> 1 h) and of trash folders (> 7 days). One job at a time: an in-process flag plus the `maintenance_one_running` row,
 * so a CLI, the API's confirmed delete and the worker never overlap. Looks 5 min after start, then every `VG_MAINTENANCE_MS`.
 */
export class MaintenanceService {
  private busy = false;
  private first: NodeJS.Timeout | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private current: Promise<unknown> = Promise.resolve();
  private readonly clock: { now(): number };

  constructor(private readonly d: MaintenanceDeps) {
    this.clock = d.clock ?? { now: () => Date.now() };
  }

  /** Worker start: a `running` row was left by a dead worker → failed; then the schedule. */
  async recover(): Promise<void> {
    for (const r of await failRunningMaintenance(this.d.pool, INTERRUPTED)) {
      await this.d.audit('maintenance.failed', { id: r.id, kind: r.kind, reason: INTERRUPTED });
      if (r.kind === 'backup') await this.status({ status: 'failed', at: new Date(this.clock.now()).toISOString(), reason: INTERRUPTED });
    }
    if (this.stopped || this.first) return;
    const tick = () => { void this.tick().catch(() => {}); };
    this.first = setTimeout(() => {
      tick();
      if (!this.stopped) { this.timer = setInterval(tick, this.d.config.backup.maintenanceMs); this.timer.unref?.(); }
    }, this.d.firstTickMs ?? FIRST_TICK_MS);
    this.first.unref?.();
  }

  /**
   * One look: today's dump missing → take it (a failed one is retried on the next look); on a local Monday's first look the GC and orphan
   * reports (after the backup, so a delete can follow); always the upload and trash sweep.
   */
  async tick(): Promise<void> {
    if (this.stopped) return;
    const now = this.clock.now();
    if (!existsSync(backupFile(this.d.dataDir, now))) await this.runNow('backup');
    if (new Date(now).getDay() === MONDAY && !this.stopped) {
      const day = localDay(now);
      const { rows } = await this.d.pool.query('SELECT value FROM settings WHERE key = $1', [WEEKLY_KEY]);
      if (rows[0]?.value?.day !== day) {
        await this.d.pool.query(
          'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
          [WEEKLY_KEY, JSON.stringify({ day })],
        );
        await this.runNow('gc_report');
        await this.runNow('orphan_report');
      }
    }
    await this.sweep(now);
  }

  /** Hourly: upload leftovers older than 1 h and trash day folders older than 7 days (Y8, Y10). */
  private async sweep(now: number): Promise<void> {
    const removed = await sweepUploads(this.d.dataDir, now).catch(() => 0);
    if (removed) await this.d.audit('uploads.removed', { count: removed });
    const purged = await purgeTrash(this.d.dataDir, now).catch(() => ({ dirs: [], files: 0 }));
    if (purged.dirs.length) await this.d.audit('trash.purged', purged);
  }

  /** Null when another maintenance job is running (here or in another process). */
  runNow(kind: RunnableMaintenance): Promise<MaintenanceOutcome | null> {
    if (this.busy) return Promise.resolve(null);
    this.busy = true;
    const jobs: Record<RunnableMaintenance, () => Promise<MaintenanceOutcome | null>> = {
      backup: () => this.backup(),
      gc_report: () => this.report('gc_report', async () => {
        const r = await gcReport({ pool: this.d.pool });
        return { id: r.id, detail: { count: r.candidates.length, bytes: r.bytes } };
      }),
      orphan_report: () => this.report('orphan_report', async () => {
        const r = await orphanReport({ pool: this.d.pool, dataDir: this.d.dataDir, now: this.clock.now() });
        return { id: null, detail: { diskOnly: r.diskOnly.length, dbOnly: r.dbOnly.length, sizeMismatch: r.sizeMismatch.length, strayRunDirs: r.strayRunDirs.length, uploadsRemoved: r.uploadsRemoved } };
      }),
    };
    const job = jobs[kind]().finally(() => { this.busy = false; });
    this.current = job.catch(() => {});
    return job;
  }

  /** Tests and shutdown: the running job finished. */
  async idle(): Promise<void> { await this.current; }

  stop(): void {
    this.stopped = true;
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
    this.first = this.timer = null;
  }

  /** The reports own their `maintenance_runs` row; a busy slot is null, any other failure is recorded there and returned as failed. */
  private async report(kind: 'gc_report' | 'orphan_report', fn: () => Promise<{ id: string | null; detail: Record<string, unknown> }>): Promise<MaintenanceOutcome | null> {
    try {
      const r = await fn();
      return { id: r.id ?? '', kind, status: 'done', detail: r.detail };
    } catch (e) {
      if (e instanceof GcRefused && e.message === GC_BUSY_TR) return null;
      const reason = e instanceof GcRefused ? e.message : `${kind} başarısız (${(e as Error)?.name ?? 'hata'})`;
      await this.d.audit('maintenance.failed', { kind, reason });
      return { id: '', kind, status: 'failed', detail: { error: reason } };
    }
  }

  private async backup(): Promise<MaintenanceOutcome | null> {
    const id = await startMaintenance(this.d.pool, 'backup');
    if (!id) return null;
    const now = this.clock.now();
    const at = new Date(now).toISOString();
    try {
      const r = await takeBackup({ pool: this.d.pool, dataDir: this.d.dataDir, config: this.d.config, run: this.d.run }, now);
      const file = basename(r.file);
      // Rotation only after a successful new dump (Y9): a failing backup never deletes the old ones.
      const pruned = pruneBackups(backupDir(this.d.dataDir), this.d.config.backup.keep);
      const detail = { file, bytes: r.bytes, ms: r.ms, via: r.via, pruned };
      await finishMaintenance(this.d.pool, id, 'done', detail);
      await this.d.audit('backup.created', { file, bytes: r.bytes, ms: r.ms, via: r.via });
      if (pruned.length) await this.d.audit('backup.pruned', { files: pruned });
      await this.status({ status: 'done', at, file, bytes: r.bytes, ms: r.ms, via: r.via, lastOk: { at, file, bytes: r.bytes } });
      return { id, kind: 'backup', status: 'done', detail };
    } catch (e) {
      const reason = e instanceof BackupError ? e.message : `yedek alınamadı (${(e as Error)?.name ?? 'hata'})`;
      await finishMaintenance(this.d.pool, id, 'failed', { error: reason }).catch(() => {});
      await this.d.audit('backup.failed', { reason });
      await this.status({ status: 'failed', at, reason });
      return { id, kind: 'backup', status: 'failed', detail: { error: reason } };
    }
  }

  /** Settings `maintenance.backup`: the last outcome, keeping the last success (`lastOk`) for the settings page (T7). */
  private async status(v: Record<string, unknown>): Promise<void> {
    await this.d.pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('maintenance.backup', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = jsonb_build_object('lastOk', settings.value -> 'lastOk') || EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(v)],
    ).catch(() => {});
  }
}
