import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type pg from 'pg';
import type { Config } from '@videogen/shared';
import { failRunningMaintenance, finishMaintenance, startMaintenance, type MaintenanceKind } from '@videogen/db';
import { BackupError, backupDir, backupFile, pruneBackups, takeBackup } from './backup.ts';
import type { RunFn } from './pgdump.ts';

/** The kinds a `maintenance.run` command may ask for (T7 adds the GC and orphan reports). */
export const RUNNABLE_MAINTENANCE = ['backup'] as const;
export type RunnableMaintenance = (typeof RUNNABLE_MAINTENANCE)[number];
export const isRunnableMaintenance = (v: unknown): v is RunnableMaintenance => typeof v === 'string' && (RUNNABLE_MAINTENANCE as readonly string[]).includes(v);

const FIRST_TICK_MS = 5 * 60_000;
const INTERRUPTED = 'worker yeniden başladı';

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
 * Plan M7 Y9: the daily backup (T7 adds the weekly GC/orphan reports). One job at a time: an in-process flag plus the
 * `maintenance_one_running` row, so a CLI `now` and the worker never overlap. Looks 5 min after start, then every `VG_MAINTENANCE_MS`.
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

  /** One look: today's dump missing → take it (a failed one is retried on the next look). */
  async tick(): Promise<void> {
    if (this.stopped) return;
    if (!existsSync(backupFile(this.d.dataDir, this.clock.now()))) await this.runNow('backup');
  }

  /** Null when another maintenance job is running (here or in another process). */
  runNow(kind: RunnableMaintenance): Promise<MaintenanceOutcome | null> {
    if (this.busy) return Promise.resolve(null);
    this.busy = true;
    const jobs: Record<RunnableMaintenance, () => Promise<MaintenanceOutcome | null>> = { backup: () => this.backup() };
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
