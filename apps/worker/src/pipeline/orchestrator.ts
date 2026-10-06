import { join } from 'node:path';
import type pg from 'pg';
import {
  ACTIVE_STEP_STATUSES, DRAFT_MAX_RETURNS, etaSeconds, expectedSeconds, overallPercent, STEP_LABELS, timeCurvePercent,
  type ProgressSource, type ProgressStep, type Resource, type RunStatus, type StepKey,
} from '@videogen/shared';
import {
  appendAudit, cancelRunJobs, claimJob, enqueueJob, finishJob, getRun, getRunContext, getStep, heartbeatJobs, latestUsageMark, listRunSteps,
  bumpStepProgress, claimQueuedRun, publishRunAndVideo, queueStepIfRunActive, raiseRunProgress, recoverJobs, rewindForReview, setStepStatusIfActive, requeueJob, startStepIfRunActive, stepHistorySeconds, updateRun, updateStep, updateVideo,
  type JobRecord, type RunContext, type StepRecord,
} from '@videogen/db';
import type { UsageGate } from '../agents/manager.ts';
import { errorTag } from '../errors.ts';
import { withResource } from '../render/gate.ts';
import type { LockedResource, ResourceLocks } from '../render/locks.ts';
import { precheck, type Probe } from './resources.ts';
import type { StepContext, StepExecutor, StepOutcome } from './types.ts';

export interface OrchestratorDeps {
  pool: pg.Pool;
  dataDir: string;
  executors: Partial<Record<StepKey, StepExecutor>>;
  probe?: Probe;
  /** Plan C21: GPU and heavy-CPU steps go through the same in-process lock and §6.4 gate as the MCP render tools (K22, B8). */
  locks?: ResourceLocks;
  /** Plan C25 (spec §6.4, M4a minor 4): no new run starts while the usage guard blocks pipelines. */
  gate?: Pick<UsageGate, 'allowsNewPipeline' | 'resumeAt'>;
  owner?: string;
  capacity?: Partial<Record<Resource, number>>;
  leaseMs?: number;
  heartbeatMs?: number;
  tickMs?: number;
  timeTickMs?: number;
  retryDelayMs?: number;
  waitDelayMs?: number;
  maxAttempts?: number;
  /** Tests: fixed expected durations instead of history. */
  expectedS?: Partial<Record<StepKey, number>>;
  log?: (m: string) => void;
}

const RESOURCES: Resource[] = ['claude', 'gpu', 'heavy_cpu'];
const CAPACITY: Record<Resource, number> = { claude: 3, gpu: 1, heavy_cpu: 1 };
const TERMINAL: RunStatus[] = ['done', 'needs_human', 'failed', 'cancelled'];
const LAUNCHABLE = new Set(['queued', 'waiting_gpu', 'waiting_disk']);

/** K13: a plan that ends before finalize leaves the video needs_human with a positive note about what exists and what is next. */
const NOT_YET: Partial<Record<StepKey, string>> = {
  research: 'Storyboard, sahne kurulumu ve taslak render bu sürümde henüz yok.',
  storyboard: 'Sahne kurulumu ve taslak render bu sürümde henüz yok.',
  build: 'Taslak render bu sürümde henüz yok.',
  draft_render: 'Taslak incelemesi bu sürümde henüz yok.',
};
/** M4 ends with a reviewed draft (spec §17: S2 with the draft instead of the final); final render, sound and review gates are M5. */
const DONE_NOTE: Partial<Record<StepKey, string>> = { draft_review: 'Taslak hazır ve incelendi. Final render bu sürümde henüz yok.' };
export const PIPELINE_INCOMPLETE_NOTE = (last: StepKey) => DONE_NOTE[last] ?? `${STEP_LABELS[last]} hazır. ${NOT_YET[last] ?? 'Sonraki adımlar bu sürümde henüz yok.'}`;
/** Plan C25: why a run waits in the queue (no Turkish case suffix on the time). */
export const LIMIT_NOTE = (resumeAt: string | null) =>
  `Kullanım sınırı yakın: üretim sınır açılınca kendiliğinden başlar${resumeAt ? ` (açılış ${new Date(resumeAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })})` : ''}.`;

interface Running { jobId: number; stepId: string; runId: string; resource: Resource; abort: AbortController }

/** Spec §5.1: runs and steps live in the worker; jobs carry leases (§14); one executor per step key. */
export class Orchestrator {
  readonly owner: string;
  private running = new Map<string, Running>();
  private timers: NodeJS.Timeout[] = [];
  private ticking = false;
  private again = false;
  private stopped = false;
  private history = new Map<StepKey, { at: number; s: number[] }>();
  private readonly log: (m: string) => void;

  constructor(private readonly d: OrchestratorDeps) {
    this.owner = d.owner ?? `worker-${process.pid}-${Date.now()}`;
    this.log = d.log ?? ((m) => process.stderr.write(`orchestrator: ${m}\n`));
  }

  start(): void {
    this.stopped = false;
    this.timers.push(setInterval(() => { void this.tick(); }, this.d.tickMs ?? 1000));
    this.timers.push(setInterval(() => { void this.heartbeat(); }, this.d.heartbeatMs ?? 30_000));
    this.timers.push(setInterval(() => { void this.timeProgress(); }, this.d.timeTickMs ?? 5000));
  }

  /** Leases stay in the DB; the next worker start recovers them. */
  stop(): void {
    this.stopped = true;
    for (const h of this.timers.splice(0)) clearInterval(h);
  }

  private audit(action: string, runId: string, more: { stepId?: string; data?: unknown; actor?: 'orchestrator' | 'user' } = {}): Promise<void> {
    return appendAudit(this.d.pool, { actorType: more.actor ?? 'orchestrator', action, runId, stepId: more.stepId, data: more.data }).then(() => {}, (e) => this.log(`audit ${action} failed (${errorTag(e)})`));
  }
  private publish(runId: string): Promise<void> {
    return publishRunAndVideo(this.d.pool, runId).catch((e) => this.log(`publish ${runId} failed (${errorTag(e)})`));
  }

  async recover(): Promise<void> {
    const { pool } = this.d;
    for (const j of await recoverJobs(pool, { owner: this.owner, foreign: true })) {
      const step = await getStep(pool, j.stepId);
      if (!step) continue;
      // Grilling C6: only an active step goes back to the queue; a lease left on a finished or rewound step is stale.
      if (!(await setStepStatusIfActive(pool, step.id, 'queued', 'worker yeniden başladı'))) {
        await finishJob(pool, j.jobId, 'cancelled');
        continue;
      }
      await this.audit('job.recovered', step.runId, { stepId: step.id, data: { jobId: j.jobId } });
      await this.publish(step.runId);
    }
    await this.startQueued();
    const idle = await pool.query(
      `SELECT r.id FROM runs r WHERE r.status = 'running' AND NOT EXISTS (
         SELECT 1 FROM jobs j JOIN steps s ON s.id = j.step_id WHERE s.run_id = r.id AND j.status IN ('queued', 'leased'))`,
    );
    for (const r of idle.rows) await this.advance(r.id);
    this.kick();
  }

  /** Queued runs in order (worker start, and the usage guard clearing: plan C25). */
  async startQueued(): Promise<void> {
    const { rows } = await this.d.pool.query("SELECT id FROM runs WHERE status = 'queued' ORDER BY created_at");
    for (const r of rows) await this.startRun(r.id);
  }

  async startRun(runId: string): Promise<void> {
    const ctx = await getRunContext(this.d.pool, runId);
    if (!ctx || ctx.run.status !== 'queued') return;
    if (this.d.gate && !this.d.gate.allowsNewPipeline()) return this.deferRun(ctx);
    // A conditional claim, not a blind write: a concurrent start (run.start command, recover, guard clear) or a cancel that landed
    // since the check above must not start the run twice or undo the cancel (final review M5).
    if (!(await claimQueuedRun(this.d.pool, runId, await latestUsageMark(this.d.pool)))) return;
    await updateVideo(this.d.pool, ctx.videoId, { status: 'running', statusNote: null });
    await this.audit('run.started', runId, { data: { videoId: ctx.videoId, plan: ctx.run.plan.map((s) => s.key) } });
    await this.advance(runId);
  }

  /** Plan C25: the run stays queued with the reason on the video; audited once per reason (the note is the marker, it survives a restart). */
  private async deferRun(ctx: RunContext): Promise<void> {
    const note = LIMIT_NOTE(this.d.gate!.resumeAt());
    const { rows } = await this.d.pool.query('SELECT status_note FROM videos WHERE id = $1', [ctx.videoId]);
    if (rows[0]?.status_note === note) return;
    await updateVideo(this.d.pool, ctx.videoId, { statusNote: note });
    await this.audit('run.deferred_limit', ctx.run.id, { data: { resumeAt: this.d.gate!.resumeAt() } });
    await this.publish(ctx.run.id);
  }

  async cancel(runId: string, actor: 'user' | 'orchestrator' = 'user'): Promise<boolean> {
    const { pool } = this.d;
    const run = await getRun(pool, runId);
    if (!run || TERMINAL.includes(run.status)) return false;
    await updateRun(pool, runId, { status: 'cancelled', endedAt: new Date(), etaS: null, usageEnd: await latestUsageMark(pool) });
    await cancelRunJobs(pool, runId);
    await pool.query(
      `UPDATE steps SET status = 'cancelled', ended_at = coalesce(ended_at, now()) WHERE run_id = $1 AND status NOT IN ('done', 'skipped', 'failed')`,
      [runId],
    );
    await updateVideo(pool, run.videoId, { status: 'cancelled', statusNote: 'Kullanıcı durdurdu' });
    for (const r of this.running.values()) if (r.runId === runId) r.abort.abort();
    await this.audit('run.cancelled', runId, { actor });
    await this.publish(runId);
    return true;
  }

  private kick(): void {
    if (!this.stopped) setImmediate(() => { void this.tick(); });
  }

  private inUse(r: Resource): number {
    let n = 0;
    for (const x of this.running.values()) if (x.resource === r) n++;
    return n;
  }

  async tick(): Promise<void> {
    if (this.stopped) return;
    if (this.ticking) { this.again = true; return; }
    this.ticking = true;
    try {
      do {
        this.again = false;
        for (;;) {
          const free = RESOURCES.filter((r) => this.inUse(r) < (this.d.capacity?.[r] ?? CAPACITY[r]));
          const job = await claimJob(this.d.pool, { owner: this.owner, resources: free, leaseMs: this.d.leaseMs ?? 120_000 });
          if (!job) break;
          // A claimed job that fails to launch is not heartbeated and there is no periodic sweep: put it back now.
          await this.launch(job).catch(async (e) => {
            this.running.delete(job.stepId);
            this.log(`launch ${job.id} failed (${errorTag(e)})`);
            await requeueJob(this.d.pool, job.id, this.d.waitDelayMs ?? 15_000).catch(() => {});
          });
        }
      } while (this.again);
    } catch (e) {
      this.log(`tick failed (${errorTag(e)})`);
    } finally {
      this.ticking = false;
    }
  }

  private async heartbeat(): Promise<void> {
    const ids = [...this.running.values()].map((r) => r.jobId);
    await heartbeatJobs(this.d.pool, this.owner, ids, this.d.leaseMs ?? 120_000).catch((e) => this.log(`heartbeat failed (${errorTag(e)})`));
  }

  private async launch(job: JobRecord): Promise<void> {
    const { pool } = this.d;
    const step = await getStep(pool, job.stepId);
    const ctx = step ? await getRunContext(pool, step.runId) : null;
    const ex = step ? this.d.executors[step.key] : undefined;
    if (!step || !ctx || ctx.run.status !== 'running' || !LAUNCHABLE.has(step.status) || !ex) {
      await finishJob(pool, job.id, 'cancelled');
      return;
    }
    // With locks the pre-check runs inside the gate (plan C21: one door); without them (tests) it stays here.
    if (ex.resource !== 'claude' && this.d.probe && !this.d.locks) {
      const pc = precheck(ex.resource, await this.d.probe.snapshot(), ex.extraDiskMb ?? 0);
      if (!pc.ok) {
        await requeueJob(pool, job.id, this.d.waitDelayMs ?? 15_000);
        if ((step.status !== pc.status || step.note !== pc.reason) && (await setStepStatusIfActive(pool, step.id, pc.status, pc.reason))) {
          await this.audit('step.waiting', step.runId, { stepId: step.id, data: { status: pc.status, reason: pc.reason } });
          await this.publish(step.runId);
        }
        return;
      }
    }
    const abort = new AbortController();
    const attempt = step.attempt + 1;
    // Registered before the conditional start: a cancel from here on aborts it; one that came earlier makes the start a no-op.
    this.running.set(step.id, { jobId: job.id, stepId: step.id, runId: step.runId, resource: ex.resource, abort });
    if (!(await startStepIfRunActive(pool, step.id, attempt)) || abort.signal.aborted) {
      this.running.delete(step.id);
      await finishJob(pool, job.id, 'cancelled');
      return;
    }
    await this.audit('step.started', step.runId, { stepId: step.id, data: { key: step.key, attempt } });
    await this.recompute(step.runId);
    await this.publish(step.runId);
    void this.execute(ex, this.stepContext(ctx, step, attempt, abort.signal), job, step);
  }

  private stepContext(ctx: RunContext, step: StepRecord, attempt: number, signal: AbortSignal): StepContext {
    // Status changes of one step apply in order (a late "waiting_gpu" must not overwrite the "running" that followed it).
    let statuses = Promise.resolve();
    return {
      runId: step.runId, stepId: step.id, key: step.key, attempt, round: step.round, videoId: ctx.videoId, productId: ctx.productId, productName: ctx.productName,
      audioMode: ctx.audioMode, versionId: ctx.versionId, runDir: join(this.d.dataDir, 'runs', step.runId), signal,
      progress: (pct, source) => { void this.stepProgress(step.id, pct, source); },
      status: (s, note) => { statuses = statuses.then(() => this.stepStatus(step.id, s, note)).catch(() => {}); },
      session: (sessionId) => { void updateStep(this.d.pool, step.id, { sessionId }).then(() => this.publish(step.runId)); },
    };
  }

  private async execute(ex: StepExecutor, ctx: StepContext, job: JobRecord, step: StepRecord): Promise<void> {
    let outcome: StepOutcome;
    try {
      const hash = await ex.inputHash(ctx);
      await updateStep(this.d.pool, step.id, { inputHash: hash });
      if (await ex.reuse?.(ctx, hash)) outcome = { status: 'done', note: 'önceki geçerli çıktı kullanıldı' };
      else if (ex.resource !== 'claude' && this.d.locks) outcome = await this.gated(ex, ctx, () => ex.run(ctx, hash));
      else outcome = await ex.run(ctx, hash);
    } catch (e) {
      outcome = ctx.signal.aborted ? { status: 'cancelled' } : { status: 'failed', error: errorTag(e) };
    }
    this.running.delete(step.id);
    // Shutting down: leave the lease in place; the next start recovers the job and runs the step again.
    if (this.stopped) return;
    await this.settle(step, ctx.attempt, job, outcome).catch((e) => this.log(`settle ${step.id} failed (${errorTag(e)})`));
    this.kick();
  }

  /** Plan C21 (K22, B8): the in-process lock, then the §6.4 pre-check in a loop, then the work; the lock is released in any case. */
  private gated(ex: StepExecutor, ctx: StepContext, fn: () => Promise<StepOutcome>): Promise<StepOutcome> {
    return withResource(this.d.locks!, ex.resource as LockedResource, {
      owner: ctx.stepId, signal: ctx.signal, probe: this.d.probe, extraDiskMb: ex.extraDiskMb, waitMs: this.d.waitDelayMs,
      onWait: (w) => ctx.status(w.status ?? 'waiting_gpu', w.reason ?? `GPU sırası bekleniyor (sırada ${w.position ?? 1})`),
      onRun: () => ctx.status('running', null),
    }, fn);
  }

  private async settle(step: StepRecord, attempt: number, job: JobRecord, o: StepOutcome): Promise<void> {
    const { pool } = this.d;
    const run = await getRun(pool, step.runId);
    if (!run || run.status !== 'running' || o.status === 'cancelled') {
      await finishJob(pool, job.id, 'cancelled');
      return;
    }
    if (o.status === 'rewind') return this.rewind(step, attempt, job, o);
    if (o.status === 'done' || o.status === 'needs_human') {
      await finishJob(pool, job.id, 'done');
      await updateStep(pool, step.id, { status: 'done', progress: 100, endedAt: new Date(), note: o.status === 'done' ? (o.note ?? null) : o.reason });
      await this.audit('step.done', step.runId, { stepId: step.id, data: { key: step.key, attempt } });
      if (o.status === 'needs_human') {
        // Progress counts this step, then freezes: gate-skipped steps earn nothing (no "%99" for a stopped product).
        await this.recompute(step.runId);
        await pool.query("UPDATE steps SET status = 'skipped', note = 'durduruldu: insan gerekli' WHERE run_id = $1 AND status = 'pending'", [step.runId]);
        return this.finish(step.runId, 'needs_human', o.reason);
      }
      await this.recompute(step.runId);
      return this.advance(step.runId);
    }
    const max = this.d.maxAttempts ?? 2;
    if (o.retry !== false && attempt < max) {
      await requeueJob(pool, job.id, this.d.retryDelayMs ?? 3000);
      await updateStep(pool, step.id, { status: 'queued', error: o.error, note: `yeniden deneniyor (${attempt + 1}/${max})` });
      await this.audit('step.retry', step.runId, { stepId: step.id, data: { key: step.key, attempt, error: o.error } });
      await this.publish(step.runId);
      return;
    }
    await finishJob(pool, job.id, 'failed');
    await updateStep(pool, step.id, { status: 'failed', error: o.error, endedAt: new Date() });
    await this.audit('step.failed', step.runId, { stepId: step.id, data: { key: step.key, attempt, error: o.error } });
    await pool.query("UPDATE steps SET status = 'cancelled' WHERE run_id = $1 AND status = 'pending'", [step.runId]);
    return this.finish(step.runId, 'failed', `${STEP_LABELS[step.key]}: ${o.error}`);
  }

  /** Plan C6: the draft review sends the run back to `to`; past DRAFT_MAX_RETURNS the run stops for a human with the reason. */
  private async rewind(step: StepRecord, attempt: number, job: JobRecord, o: Extract<StepOutcome, { status: 'rewind' }>): Promise<void> {
    const { pool } = this.d;
    const target = (await listRunSteps(pool, step.runId)).find((s) => s.key === o.to);
    if (!target || target.ordinal >= step.ordinal) return this.settle(step, attempt, job, { status: 'failed', error: `geçersiz geri dönüş: ${o.to}`, retry: false });
    if (step.round >= DRAFT_MAX_RETURNS) return this.settle(step, attempt, job, { status: 'needs_human', reason: o.reason });
    const round = step.round + 1;
    const note = `taslak turu ${round}/${DRAFT_MAX_RETURNS}: ${o.reason}`.slice(0, 300);
    if (!(await rewindForReview(pool, { runId: step.runId, stepId: step.id, jobId: job.id, round: step.round, fromOrdinal: target.ordinal, toOrdinal: step.ordinal, note }))) {
      await finishJob(pool, job.id, 'cancelled');
      return;
    }
    await this.audit('step.rewind', step.runId, { stepId: step.id, data: { key: step.key, to: o.to, round, reason: o.reason } });
    await this.recompute(step.runId);
    return this.advance(step.runId);
  }

  /** Queue the first pending step, or finish the run when none is left. */
  private async advance(runId: string): Promise<void> {
    const { pool } = this.d;
    const run = await getRun(pool, runId);
    if (!run || run.status !== 'running') return;
    const steps = await listRunSteps(pool, runId);
    if (steps.some((s) => ACTIVE_STEP_STATUSES.includes(s.status))) {
      await this.publish(runId);
      return;
    }
    const next = steps.find((s) => s.status === 'pending');
    if (!next) return this.finish(runId, 'done');
    const ex = this.d.executors[next.key];
    if (!ex) {
      await updateStep(pool, next.id, { status: 'failed', error: 'bu sürümde yürütücü yok' });
      return this.finish(runId, 'failed', `${STEP_LABELS[next.key]}: bu sürümde yürütücü yok`);
    }
    if (!(await queueStepIfRunActive(pool, next.id))) return; // cancelled meanwhile
    await enqueueJob(pool, { stepId: next.id, resource: ex.resource });
    await this.recompute(runId);
    await this.publish(runId);
    this.kick();
  }

  private async finish(runId: string, status: 'done' | 'needs_human' | 'failed', reason?: string): Promise<void> {
    const { pool } = this.d;
    const ctx = await getRunContext(pool, runId);
    if (!ctx || TERMINAL.includes(ctx.run.status)) return;
    const plan = ctx.run.plan;
    // K13: "yayına hazır" needs the M5 review gates, so only a plan that reaches finalize may mark the video ready.
    const complete = status === 'done' && plan.some((s) => s.key === 'finalize');
    await updateRun(pool, runId, { status, endedAt: new Date(), etaS: null, error: status === 'failed' ? (reason ?? null) : null, usageEnd: await latestUsageMark(pool) });
    if (status === 'done') {
      const last = plan.at(-1)?.key ?? 'research';
      await updateVideo(pool, ctx.videoId, complete ? { status: 'ready', statusNote: null } : { status: 'needs_human', statusNote: PIPELINE_INCOMPLETE_NOTE(last) });
    } else {
      await updateVideo(pool, ctx.videoId, { status, statusNote: reason ?? null });
    }
    if (status !== 'needs_human') await this.recompute(runId, complete);
    await this.audit(`run.${status}`, runId, { data: reason ? { reason } : undefined });
    await this.publish(runId);
  }

  private async expected(key: StepKey): Promise<number> {
    const fixed = this.d.expectedS?.[key];
    if (fixed !== undefined) return fixed;
    const h = this.history.get(key);
    if (h && Date.now() - h.at < 60_000) return expectedSeconds(key, h.s);
    const s = await stepHistorySeconds(this.d.pool, key);
    this.history.set(key, { at: Date.now(), s });
    return expectedSeconds(key, s);
  }

  private async recompute(runId: string, complete = false): Promise<void> {
    const { pool } = this.d;
    const run = await getRun(pool, runId);
    if (!run) return;
    const steps = await listRunSteps(pool, runId);
    const ps: ProgressStep[] = [];
    for (const s of steps) {
      ps.push({ key: s.key, weight: s.weight, status: s.status, progress: s.progress, startedAt: s.startedAt ? Date.parse(s.startedAt) : null, expectedS: await this.expected(s.key) });
    }
    const progress = overallPercent(ps, run.progress, complete);
    const etaS = TERMINAL.includes(run.status) ? null : etaSeconds(ps, Date.now());
    if (progress !== run.progress || etaS !== run.etaS) await raiseRunProgress(pool, runId, progress, etaS);
  }

  private async stepProgress(stepId: string, pct: number, source: ProgressSource): Promise<void> {
    const runId = await bumpStepProgress(this.d.pool, stepId, pct, source);
    if (!runId) return;
    await this.recompute(runId);
    await this.publish(runId);
  }

  private async stepStatus(stepId: string, status: 'running' | 'waiting_limit' | 'waiting_gpu' | 'waiting_disk', note?: string | null): Promise<void> {
    // Conditional in SQL: a late status emission must not resurrect a step that settle() already finished.
    const runId = await setStepStatusIfActive(this.d.pool, stepId, status, note);
    if (runId) await this.publish(runId);
  }

  private async timeProgress(): Promise<void> {
    for (const r of [...this.running.values()]) {
      const s = await getStep(this.d.pool, r.stepId).catch(() => null);
      if (!s || s.status !== 'running' || !s.startedAt || s.progressSource === 'agent' || s.progressSource === 'render') continue;
      const pct = timeCurvePercent((Date.now() - Date.parse(s.startedAt)) / 1000, await this.expected(s.key));
      if (pct > s.progress) await this.stepProgress(s.id, pct, 'time');
    }
  }
}
