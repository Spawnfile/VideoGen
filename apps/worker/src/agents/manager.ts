import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import type pg from 'pg';
import { classifyLiveness, type Liveness, type RateLimitInfoLike, type RoleName, type SessionKind, type SessionStatus } from '@videogen/shared';
import { appendAudit, getSession, insertSession, publishEvent, publishLive, toSessionView, updateSession } from '@videogen/db';
import {
  allowedTools, disallowedTools, evaluateToolUse, FILE_WRITE_TOOLS, groupAlive, killGroup, memAvailableMb, permissiveValidator,
  resolveRole, rolePromptFor, SpecStore, videogenTools, writeTarget,
  type ClaudeDriver, type DriverSession, type FakeScript, type McpPorts, type RoleDef, type RoleOverrides, type SessionSpec, type SpecValidator,
} from '@videogen/claude';
import { errorTag } from '../errors.ts';
import { fileSha256, putBlob } from '../media.ts';
import { removePidFile, writePidFile } from './pids.ts';
import { SessionRunner, type RunEnd, type RunnerDeps } from './runner.ts';

export interface UsageGate {
  allowsNewPipeline(): boolean;
  resumeAt(): string | null;
  observeRateLimit(info: RateLimitInfoLike): Promise<void>;
  onClear(fn: () => void): void;
}
export const OPEN_GATE: UsageGate = { allowsNewPipeline: () => true, resumeAt: () => null, observeRateLimit: async () => {}, onClear: () => {} };

export interface ManagerDeps {
  pool: pg.Pool;
  dataDir: string;
  driver: ClaudeDriver;
  pluginDir: string;
  gate?: UsageGate;
  sdkVersion?: string | null;
  validator?: SpecValidator;
  slots?: { pipeline: number; chat: number };
  minFreeMb?: number;
  memAvailableMb?: () => number;
  pumpRetryMs?: number;
  sampleEveryMs?: number;
  chatIdleMs?: number;
  quietAfterMs?: number;
  stuckAfterMs?: number;
  runner?: Pick<RunnerDeps, 'flushMs' | 'resultWaitMs' | 'cancelGraceMs' | 'killGraceMs'>;
  archive?: (s: { sessionId: string; claudeSessionId: string }) => Promise<string | null>;
  home?: string;
  log?: (msg: string) => void;
}

export interface StartRequest {
  id?: string;
  kind: SessionKind;
  role: RoleName;
  prompt: string;
  runId?: string | null;
  stepId?: string | null;
  threadId?: string | null;
  claudeSessionId?: string;
  resume?: boolean;
  parentSessionId?: string | null;
  outputFormat?: SessionSpec['outputFormat'];
  fakeScript?: FakeScript;
  /** false: the caller resumes a rate-limited session itself (pipeline steps); the manager does not open its own child. */
  autoResume?: boolean;
}
export interface ManagerEvents {
  onTurnComplete?(sessionId: string, r: { turn: number; text: string | null; structured: unknown }): void | Promise<void>;
  /** `limited`: the session stopped on a rejected rate limit and waits for the reset (Task 9). */
  onEnd?(sessionId: string, end: RunEnd, info: { limited: boolean }): void | Promise<void>;
  /** report_progress after clamping to [last, 99]. */
  onProgress?(sessionId: string, percent: number, message: string): void | Promise<void>;
  /** Every published status change (queued, starting, thinking, tool, idle, waiting_limit, done, failed, cancelled). */
  onStatus?(sessionId: string, status: SessionStatus): void | Promise<void>;
}

export const RESUME_PROMPT = 'Önceki oturum kesildi. Durumu kontrol et ve göreve kaldığın yerden devam et.';

type Req = StartRequest & { claudeSessionId: string };
interface Pending { id: string; req: Req; def: RoleDef; runDir: string; deferred?: 'ram' | 'limit' }
/** inputEnded: idle close or cancel closed the input; the process may still be exiting and must not get another turn. */
interface Live { id: string; kind: SessionKind; req: Req; session: DriverSession; runner: SessionRunner; idle: NodeJS.Timeout | null; liveness: Liveness | null; pid: number | null; inputEnded: boolean }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Sole owner of Claude processes (spec §5.1): slots, RAM pre-check, chat idle close, liveness, cancel/retry. */
export class SessionManager {
  events: ManagerEvents = {};
  private listeners = new Set<ManagerEvents>();
  private queue: Pending[] = [];
  private live = new Map<string, Live>();
  /** Last reported percent per session; kept outside `live` because a tool may report before the slot entry exists. */
  private progress = new Map<string, number>();
  /** Pipeline sessions stopped by a rejected rate limit; resumed as child sessions when the gate clears. */
  private limited = new Set<string>();
  private overrides: RoleOverrides = {};
  private pumpTimer: NodeJS.Timeout | null = null;
  private sampleTimer: NodeJS.Timeout;
  private sampling = false;
  private stopping = false;
  private readonly gate: UsageGate;
  private readonly slots: { pipeline: number; chat: number };
  private readonly log: (msg: string) => void;

  constructor(private readonly d: ManagerDeps) {
    this.gate = d.gate ?? OPEN_GATE;
    this.slots = d.slots ?? { pipeline: 3, chat: 1 };
    this.log = d.log ?? ((m) => process.stderr.write(`manager: ${m}\n`));
    this.gate.onClear(() => { void this.resumeLimited(); this.pump(); });
    this.sampleTimer = setInterval(() => { void this.sampleAll(); }, d.sampleEveryMs ?? 2000);
  }

  setRoleOverrides(o: RoleOverrides): void { this.overrides = o; }
  isLive(id: string): boolean { return this.live.has(id); }

  isStopping(): boolean { return this.stopping; }

  /** Several consumers (chat service, orchestrator); `events` stays as one more listener for M3 code and tests. */
  subscribe(listener: ManagerEvents): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private async emit<K extends keyof ManagerEvents>(key: K, ...args: Parameters<NonNullable<ManagerEvents[K]>>): Promise<void> {
    for (const l of [this.events, ...this.listeners]) {
      const fn = l[key] as ((...a: unknown[]) => unknown) | undefined;
      if (!fn) continue;
      try { await fn.apply(l, args); } catch (e) { this.log(`listener ${String(key)} failed (${errorTag(e)})`); }
    }
  }

  async start(req: StartRequest): Promise<string> {
    const id = req.id ?? randomUUID();
    const claudeSessionId = req.claudeSessionId ?? id;
    const def = resolveRole(req.role, this.overrides);
    const runDir = req.kind === 'chat' ? join(this.d.dataDir, 'chat', req.threadId ?? id) : join(this.d.dataDir, 'runs', req.runId ?? `adhoc-${id}`);
    await mkdir(runDir, { recursive: true });
    await insertSession(this.d.pool, {
      id, kind: req.kind, role: def.role, model: def.model, effort: def.effort, claudeSessionId, parentSessionId: req.parentSessionId ?? null,
      threadId: req.threadId ?? null, runId: req.runId ?? null, stepId: req.stepId ?? null, runDir, status: 'queued', sdkVersion: this.d.sdkVersion ?? null,
    });
    await appendAudit(this.d.pool, {
      actorType: 'orchestrator', action: 'agent.session.queued', sessionId: id, subjectType: 'role', subjectId: def.role,
      data: { kind: req.kind, model: def.model, effort: def.effort, resume: !!req.resume, claudeSessionId, parentSessionId: req.parentSessionId ?? null },
    });
    await this.publish(id);
    this.queue.push({ id, req: { ...req, claudeSessionId }, def, runDir });
    this.pump();
    return id;
  }

  /** Sends the next turn to a live chat process; returns that turn's number, or null when no process can take it (none, or closing). */
  sendChat(id: string, text: string): number | null {
    const l = this.live.get(id);
    if (!l || l.kind !== 'chat' || l.inputEnded) return null;
    if (l.idle) { clearTimeout(l.idle); l.idle = null; }
    l.runner.send(text);
    return l.runner.turn;
  }

  async cancel(id: string): Promise<boolean> {
    const qi = this.queue.findIndex((p) => p.id === id);
    if (qi >= 0) {
      this.queue.splice(qi, 1);
      await updateSession(this.d.pool, id, { status: 'cancelled', endedAt: new Date(), terminalReason: 'cancelled' });
      await appendAudit(this.d.pool, { actorType: 'orchestrator', action: 'agent.session.cancelled_queued', sessionId: id });
      await this.publish(id);
      await this.emit('onEnd', id, { status: 'cancelled', rateLimit: null, resultIsError: false }, { limited: false });
      return true;
    }
    const l = this.live.get(id);
    if (!l) return false;
    l.inputEnded = true;
    await l.runner.cancel();
    return true;
  }

  async retry(id: string, reason: 'user' | 'limit' = 'user'): Promise<string | null> {
    const rec = await getSession(this.d.pool, id);
    if (!rec) return null;
    if (this.live.has(id) || this.queue.some((p) => p.id === id)) await this.cancel(id);
    const nid = await this.start({ kind: rec.kind, role: rec.role, prompt: RESUME_PROMPT, runId: rec.runId, threadId: rec.threadId, claudeSessionId: rec.claudeSessionId, resume: true, parentSessionId: id });
    await appendAudit(this.d.pool, { actorType: reason === 'user' ? 'user' : 'orchestrator', action: 'agent.session.retry', sessionId: nid, data: { from: id, reason } });
    return nid;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.sampleTimer);
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    const lives = [...this.live.values()];
    for (const l of lives) { if (l.idle) clearTimeout(l.idle); l.session.kill('SIGTERM'); }
    await Promise.race([Promise.all(lives.map((l) => l.runner.run())), sleep(3000)]);
    for (const l of this.live.values()) l.session.kill('SIGKILL');
  }

  private used(kind: SessionKind): number {
    let n = 0;
    for (const l of this.live.values()) if (l.kind === kind) n++;
    return n;
  }

  private pump(): void {
    if (this.stopping) return;
    for (const p of [...this.queue]) {
      if (this.used(p.req.kind) >= this.slots[p.req.kind]) continue;
      if (p.req.kind === 'pipeline' && !this.gate.allowsNewPipeline()) { this.defer(p, 'limit'); continue; }
      const free = (this.d.memAvailableMb ?? memAvailableMb)();
      if (free < (this.d.minFreeMb ?? 1024)) { this.defer(p, 'ram', free); this.schedulePump(); continue; }
      this.queue.splice(this.queue.indexOf(p), 1);
      this.launch(p);
    }
  }

  private schedulePump(): void {
    if (this.pumpTimer || this.stopping) return;
    this.pumpTimer = setTimeout(() => { this.pumpTimer = null; this.pump(); }, this.d.pumpRetryMs ?? 5000);
  }

  private defer(p: Pending, why: 'ram' | 'limit', freeMb?: number): void {
    if (p.deferred === why) return;
    p.deferred = why;
    void (async () => {
      if (why === 'limit') {
        const at = this.gate.resumeAt();
        await updateSession(this.d.pool, p.id, { status: 'waiting_limit', waitingUntil: at ? new Date(at) : null });
      }
      await appendAudit(this.d.pool, {
        actorType: 'orchestrator', action: why === 'ram' ? 'agent.session.deferred_ram' : 'agent.session.deferred_limit', sessionId: p.id,
        data: why === 'ram' ? { freeMb: freeMb ?? null, minFreeMb: this.d.minFreeMb ?? 1024 } : { resumeAt: this.gate.resumeAt() },
      });
      await this.publish(p.id);
    })().catch((e) => this.log(`defer ${p.id} failed (${errorTag(e)})`));
  }

  /** Synchronous up to live.set: the slot is taken before anything awaits, so pump() never over-commits. */
  private launch(p: Pending): void {
    const { id, req, def, runDir } = p;
    const before = new Map<string, string | null>();
    const ctx = { role: def, runDir, home: this.d.home ?? homedir(), dataDir: this.d.dataDir };
    const spec: SessionSpec = {
      sessionId: id, claudeSessionId: req.claudeSessionId, resume: !!req.resume, role: def.role, prompt: req.prompt,
      model: def.model, effort: def.effort, maxTurns: def.maxTurns, cwd: runDir,
      appendSystemPrompt: rolePromptFor(def, this.d.pluginDir, { runDir, sessionId: id }),
      allowedTools: allowedTools(def), disallowedTools: disallowedTools(def), outputFormat: req.outputFormat ?? null,
      tools: videogenTools({ role: def, runDir, specs: new SpecStore(join(runDir, 'spec'), this.d.validator ?? permissiveValidator), ports: this.ports(id, req, runDir) }),
      preToolUse: async (tool, input, toolUseId) => {
        const decision = evaluateToolUse(ctx, tool, input);
        if (decision.allow && FILE_WRITE_TOOLS.has(tool)) {
          const target = writeTarget(tool, input);
          before.set(toolUseId, target ? await fileSha256(resolve(runDir, target)) : null);
        }
        return decision;
      },
      disableBackgroundTasks: true,
      fakeScript: req.fakeScript,
    };
    const session = this.d.driver.start(spec);
    const runner = new SessionRunner({ pool: this.d.pool, dataDir: this.d.dataDir, ...this.d.runner }, { id, kind: req.kind, role: def.role, cwd: runDir, beforeSha: before }, session, {
      onTurnComplete: (r) => this.onTurn(id, r),
      onRateLimit: (info) => this.gate.observeRateLimit(info),
      onStatus: (s) => { void this.emit('onStatus', id, s); },
    });
    this.live.set(id, { id, kind: req.kind, req, session, runner, idle: null, liveness: null, pid: null, inputEnded: false });
    void (async () => {
      await updateSession(this.d.pool, id, { status: 'starting', startedAt: new Date(), waitingUntil: null });
      await appendAudit(this.d.pool, { actorType: 'orchestrator', action: 'agent.session.opened', sessionId: id, data: { role: def.role, model: def.model, effort: def.effort, driver: this.d.driver.kind, resume: !!req.resume } });
      await this.publish(id);
      return runner.run();
    })().then(
      (end) => this.onEnd(id, end),
      (e) => this.onEnd(id, { status: 'failed', error: errorTag(e), rateLimit: null, resultIsError: false }),
    );
  }

  private ports(id: string, req: Req, runDir: string): McpPorts {
    return {
      reportProgress: async (pct, message) => {
        const v = Math.min(99, Math.max(this.progress.get(id) ?? 0, Math.round(pct)));
        this.progress.set(id, v);
        await updateSession(this.d.pool, id, { progress: v, progressSource: 'agent', progressMessage: message.slice(0, 200) });
        await this.publish(id);
        await this.emit('onProgress', id, v, message.slice(0, 200));
        return v;
      },
      registerArtifact: async (abs, kind) => {
        const b = await putBlob(this.d.pool, this.d.dataDir, abs);
        await appendAudit(this.d.pool, { actorType: 'agent', actorId: `${req.role}:${id}`, action: 'artifact.registered', sessionId: id, subjectType: 'blob', subjectId: b.sha256, data: { path: relative(runDir, abs), kind, bytes: b.bytes, mime: b.mime } });
        return { sha256: b.sha256, bytes: b.bytes, mime: b.mime };
      },
      context: () => ({ sessionId: id, role: req.role, kind: req.kind, runDir, runId: req.runId ?? null, stepId: req.stepId ?? null, threadId: req.threadId ?? null }),
    };
  }

  private async onTurn(id: string, r: { turn: number; text: string | null; structured: unknown }): Promise<void> {
    const l = this.live.get(id);
    if (l?.kind === 'chat') {
      if (l.idle) clearTimeout(l.idle);
      l.idle = setTimeout(() => {
        l.idle = null;
        l.inputEnded = true;
        void appendAudit(this.d.pool, { actorType: 'orchestrator', action: 'agent.session.idle_closed', sessionId: id }).catch(() => {});
        l.session.endInput();
      }, this.d.chatIdleMs ?? 600_000);
    }
    await this.emit('onTurnComplete', id, r);
  }

  private async onEnd(id: string, end: RunEnd): Promise<void> {
    const l = this.live.get(id);
    this.live.delete(id);
    this.progress.delete(id);
    if (l?.idle) clearTimeout(l.idle);
    const pid = l?.pid ?? l?.session.pid ?? null;
    if (pid) this.reapLater(pid);
    if (l && this.d.archive && this.d.driver.kind === 'sdk') {
      const sha = await this.d.archive({ sessionId: id, claudeSessionId: l.req.claudeSessionId }).catch(() => null);
      if (sha) await updateSession(this.d.pool, id, { transcriptBlobSha: sha }).catch(() => {});
    }
    const limited = end.status !== 'cancelled' && end.rateLimit?.status === 'rejected' && (end.status === 'failed' || end.resultIsError);
    if (limited) {
      const own = l?.req.autoResume === false;
      const at = this.gate.resumeAt();
      await updateSession(this.d.pool, id, own
        ? { status: 'failed', terminalReason: 'rate_limited', waitingUntil: null }
        : { status: 'waiting_limit', waitingUntil: at ? new Date(at) : null }).catch(() => {});
      await appendAudit(this.d.pool, { actorType: 'orchestrator', action: 'agent.session.waiting_limit', sessionId: id, data: { resumeAt: at, resumedBy: own ? 'caller' : 'manager' } }).catch(() => {});
      await this.publish(id).catch(() => {});
      if (l?.kind === 'pipeline' && !own) this.limited.add(id);
      if (this.gate.allowsNewPipeline()) void this.resumeLimited();
    }
    await this.emit('onEnd', id, end, { limited });
    this.pump();
  }

  private async resumeLimited(): Promise<void> {
    for (const id of [...this.limited]) {
      this.limited.delete(id);
      await updateSession(this.d.pool, id, { status: 'failed', terminalReason: 'rate_limited', waitingUntil: null });
      await this.publish(id);
      await this.retry(id, 'limit');
    }
  }

  /** The CLI normally exits on its own; a group still alive after 10 s gets SIGTERM, then SIGKILL (spec §6.4). */
  private reapLater(pid: number): void {
    const grace = this.d.runner?.cancelGraceMs ?? 10_000;
    const kill = this.d.runner?.killGraceMs ?? 5_000;
    setTimeout(() => {
      if (groupAlive(pid)) killGroup(pid, 'SIGTERM');
      setTimeout(() => {
        if (groupAlive(pid)) killGroup(pid, 'SIGKILL');
        void removePidFile(this.d.dataDir, pid);
      }, kill).unref();
    }, grace).unref();
  }

  private async sampleAll(): Promise<void> {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const now = Date.now();
      for (const l of [...this.live.values()]) {
        const pid = l.session.pid;
        if (pid && l.pid !== pid) {
          l.pid = pid;
          await writePidFile(this.d.dataDir, pid, l.id).catch(() => {});
          await updateSession(this.d.pool, l.id, { pid }).catch(() => {});
        }
        const s = await l.session.sample().catch(() => null);
        const silentMs = now - l.runner.lastEventAt;
        const liveness: Liveness = l.runner.status === 'idle' ? 'active'
          : classifyLiveness({ silentMs, cpuPct: s?.cpuPct ?? null, quietAfterMs: this.d.quietAfterMs, stuckAfterMs: this.d.stuckAfterMs });
        if (liveness === 'maybe_stuck' && l.liveness !== 'maybe_stuck') {
          await appendAudit(this.d.pool, { actorType: 'orchestrator', action: 'agent.session.maybe_stuck', sessionId: l.id, data: { silentMs, cpuPct: s?.cpuPct ?? null } }).catch(() => {});
        }
        l.liveness = liveness;
        await publishLive(this.d.pool, { topic: 'agents', type: 'agent.sample', payload: { sessionId: l.id, cpuPct: s?.cpuPct ?? null, rssMb: s?.rssMb ?? null, silentMs, liveness } }).catch(() => {});
      }
    } finally {
      this.sampling = false;
    }
  }

  private async publish(id: string): Promise<void> {
    const rec = await getSession(this.d.pool, id);
    if (!rec) return;
    await publishEvent(this.d.pool, { topic: 'agents', type: 'agent.session', payload: toSessionView(rec) });
    await this.emit('onStatus', id, rec.status);
  }
}
