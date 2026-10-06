import { join } from 'node:path';
import type pg from 'pg';
import {
  ACTIVE_STEP_STATUSES, etaSeconds, expectedSeconds, overallPercent, STEP_LABELS, timeCurvePercent,
  type ProgressSource, type ProgressStep, type Resource, type RunStatus, type StepKey,
} from '@videogen/shared';
import {
  appendAudit, cancelRunJobs, claimJob, enqueueJob, finishJob, getRun, getRunContext, getStep, heartbeatJobs, latestUsageMark, listRunSteps,
  bumpStepProgress, publishRunAndVideo, queueStepIfRunActive, raiseRunProgress, recoverJobs, setStepStatusIfActive, requeueJob, startStepIfRunActive, stepHistorySeconds, updateRun, updateStep, updateVideo,
  type JobRecord, type RunContext, type StepRecord,
} from '@videogen/db';
import { errorTag } from '../errors.ts';
import { precheck, type Probe } from './resources.ts';
import type { StepContext, StepExecutor, StepOutcome } from './types.ts';

export interface OrchestratorDeps {
  pool: pg.Pool;
  dataDir: string;
  executors: Partial<Record<StepKey, StepExecutor>>;
  probe?: Probe;
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

export const PIPELINE_INCOMPLETE_NOTE = (last: StepKey) => `${STEP_LABELS[last]} hazır. Sahne kurulumu ve taslak render bu sürümde henüz yok.`;

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
      await updateStep(pool, step.id, { status: 'queued', note: 'worker yeniden başladı' });
      await this.audit('job.recovered', step.runId, { stepId: step.id, data: { jobId: j.jobId } });
      await this.publish(step.runId);
    }
    const queued = await pool.query("SELECT id FROM runs WHERE status = 'queued' ORDER BY created_at");
    for (const r of queued.rows) await this.startRun(r.id);
    const idle = await pool.query(
      `SELECT r.id FROM runs r WHERE r.status = 'running' AND NOT EXISTS (
         SELECT 1 FROM jobs j JOIN steps s ON s.id = j.step_id WHERE s.run_id = r.id AND j.status IN ('queued', 'leased'))`,
    );
    for (const r of idle.rows) await this.advance(r.id);
    this.kick();
  }

  async startRun(runId: string): Promise<void> {
    const ctx = await getRunContext(this.d.pool, runId);
    if (!ctx || ctx.run.status !== 'queued') return;
    await updateRun(this.d.pool, runId, { status: 'running', startedAt: new Date(), usageStart: await latestUsageMark(this.d.pool) });
    await updateVideo(this.d.pool, ctx.videoId, { status: 'running', statusNote: null });
    await this.audit('run.started', runId, { data: { videoId: ctx.videoId, plan: ctx.run.plan.map((s) => s.key) } });
    await this.advance(runId);
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
    if (ex.resource !== 'claude' && this.d.probe) {
      const pc = precheck(ex.resource, await this.d.probe.snapshot());
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
    return {
      runId: step.runId, stepId: step.id, key: step.key, attempt, videoId: ctx.videoId, productId: ctx.productId, productName: ctx.productName,
      audioMode: ctx.audioMode, versionId: ctx.versionId, runDir: join(this.d.dataDir, 'runs', step.runId), signal,
      progress: (pct, source) => { void this.stepProgress(step.id, pct, source); },
      status: (s, note) => { void this.stepStatus(step.id, s, note); },
      session: (sessionId) => { void updateStep(this.d.pool, step.id, { sessionId }).then(() => this.publish(step.runId)); },
    };
  }

  private async execute(ex: StepExecutor, ctx: StepContext, job: JobRecord, step: StepRecord): Promise<void> {
    let outcome: StepOutcome;
    try {
      const hash = await ex.inputHash(ctx);
      await updateStep(this.d.pool, step.id, { inputHash: hash });
      outcome = (await ex.reuse?.(ctx, hash)) ? { status: 'done', note: 'önceki geçerli çıktı kullanıldı' } : await ex.run(ctx, hash);
    } catch (e) {
      outcome = ctx.signal.aborted ? { status: 'cancelled' } : { status: 'failed', error: errorTag(e) };
    }
    this.running.delete(step.id);
    // Shutting down: leave the lease in place; the next start recovers the job and runs the step again.
    if (this.stopped) return;
    await this.settle(step, ctx.attempt, job, outcome).catch((e) => this.log(`settle ${step.id} failed (${errorTag(e)})`));
    this.kick();
  }

  private async settle(step: StepRecord, attempt: number, job: JobRecord, o: StepOutcome): Promise<void> {
    const { pool } = this.d;
    const run = await getRun(pool, step.runId);
    if (!run || run.status !== 'running' || o.status === 'cancelled') {
      await finishJob(pool, job.id, 'cancelled');
      return;
    }
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
