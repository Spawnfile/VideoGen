import type pg from 'pg';
import { fromRateLimitEvent, type GuardState, type RateLimitInfoLike, type UsageSnapshot, type UsageWindow } from '@videogen/shared';
import { appendAudit, publishEvent } from '@videogen/db';
import { recordUsage } from '../usage.ts';
import type { UsageGate } from './manager.ts';

export interface GuardThresholds { fiveHour: number; sevenDay: number }
export const DEFAULT_THRESHOLDS: GuardThresholds = { fiveHour: 0.8, sevenDay: 0.9 };
const OPEN: GuardState = { blocked: false, reason: null, resumeAt: null, fiveHour: null, sevenDay: null };

/** Spec §6.4. Inputs are already normalized per source (fractions 0..1); a window past its reset no longer counts. */
export function evaluateGuard(
  w: { fiveHour: UsageWindow | null; sevenDay: UsageWindow | null; rejectedUntil: string | null },
  th: GuardThresholds = DEFAULT_THRESHOLDS,
  now = Date.now(),
): GuardState {
  const current = (x: UsageWindow | null) => (x && (!x.resetsAt || Date.parse(x.resetsAt) > now) ? x : null);
  const fh = current(w.fiveHour);
  const sd = current(w.sevenDay);
  const base = { fiveHour: fh?.utilization ?? null, sevenDay: sd?.utilization ?? null };
  if (w.rejectedUntil && Date.parse(w.rejectedUntil) > now) return { blocked: true, reason: 'rejected', resumeAt: w.rejectedUntil, ...base };
  if (base.sevenDay !== null && base.sevenDay >= th.sevenDay) return { blocked: true, reason: 'seven_day', resumeAt: sd?.resetsAt ?? null, ...base };
  if (base.fiveHour !== null && base.fiveHour >= th.fiveHour) return { blocked: true, reason: 'five_hour', resumeAt: fh?.resetsAt ?? null, ...base };
  return { blocked: false, reason: null, resumeAt: null, ...base };
}

export class UsageGuard implements UsageGate {
  private w: { fiveHour: UsageWindow | null; sevenDay: UsageWindow | null } = { fiveHour: null, sevenDay: null };
  private rejectedUntil: string | null = null;
  private st: GuardState = OPEN;
  /** The stored state may be stale from a previous worker: the first evaluation always rewrites and republishes it. */
  private stored = false;
  private listeners = new Set<() => void>();
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly d: { pool: pg.Pool; thresholds?: GuardThresholds; marginMs?: number }) {}

  allowsNewPipeline(): boolean { return !this.st.blocked; }
  resumeAt(): string | null { return this.st.resumeAt; }
  state(): GuardState { return this.st; }
  onClear(fn: () => void): void { this.listeners.add(fn); }
  stop(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  /** Partial snapshots (a rate_limit_event may carry one window) only replace what they contain. */
  update(s: UsageSnapshot): Promise<void> {
    if (s.fiveHour) this.w.fiveHour = s.fiveHour;
    if (s.sevenDay) this.w.sevenDay = s.sevenDay;
    return this.reevaluate();
  }

  async observeRateLimit(info: RateLimitInfoLike): Promise<void> {
    const snap = fromRateLimitEvent(info);
    await recordUsage(this.d.pool, snap).catch(() => {});
    if (info.status === 'rejected') this.rejectedUntil = info.resetsAt ? new Date(info.resetsAt * 1000).toISOString() : null;
    else if (info.status) this.rejectedUntil = null;
    await this.update(snap);
  }

  private reevaluate(): Promise<void> {
    this.chain = this.chain.then(async () => {
      const next = evaluateGuard({ ...this.w, rejectedUntil: this.rejectedUntil }, this.d.thresholds ?? DEFAULT_THRESHOLDS);
      const prev = this.st;
      this.st = next;
      this.schedule(next);
      const changed = prev.blocked !== next.blocked || prev.reason !== next.reason;
      if (!changed && this.stored) return;
      this.stored = true;
      await this.d.pool.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('usage.guard', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(next)],
      );
      if (changed) {
        await appendAudit(this.d.pool, {
          actorType: 'orchestrator', action: next.blocked ? 'usage.guard.blocked' : 'usage.guard.cleared',
          data: { reason: next.reason ?? prev.reason, fiveHour: next.fiveHour, sevenDay: next.sevenDay, resumeAt: next.resumeAt },
        });
      }
      await publishEvent(this.d.pool, { topic: 'system', type: 'usage.guard', payload: next });
      if (changed && !next.blocked) for (const f of this.listeners) f();
    }).catch((e) => { process.stderr.write(`usage guard: ${String((e as Error)?.name)}\n`); });
    return this.chain;
  }

  private schedule(s: GuardState): void {
    this.stop();
    if (!s.blocked || !s.resumeAt) return;
    const ms = Math.max(0, Date.parse(s.resumeAt) - Date.now()) + (this.d.marginMs ?? 1000);
    this.timer = setTimeout(() => { this.timer = null; void this.reevaluate(); }, ms);
    this.timer.unref();
  }
}
