import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createGzip } from 'node:zlib';
import type pg from 'pg';
import type { LiveTraceItem, RateLimitInfoLike, RoleName, SessionKind, SessionStatus, TraceOp, TraceRow } from '@videogen/shared';
import { appendAudit, getSession, insertAgentEvent, publishEvent, publishLive, redactSecretKeys, toSessionView, updateSession } from '@videogen/db';
import { isAbortError, rateLimitInfo, str, TraceMapper, TurnTracker, type DriverSession, type Msg } from '@videogen/claude';
import { errorTag } from '../errors.ts';
import { chunkLive } from './live-chunks.ts';

const STRING_CAP = 20_000;
const FILE_WRITES = new Set(['Write', 'Edit', 'NotebookEdit']);

export interface RunnerDeps {
  pool: pg.Pool;
  dataDir: string;
  flushMs?: number;
  resultWaitMs?: number;
  cancelGraceMs?: number;
  killGraceMs?: number;
}
export interface RunnerInfo { id: string; kind: SessionKind; role: RoleName; cwd: string; beforeSha?: Map<string, string | null> }
export type RunEnd = { status: 'done' | 'failed' | 'cancelled'; error?: string; rateLimit: RateLimitInfoLike | null; resultIsError: boolean };
export interface RunnerHooks {
  onTurnComplete?(r: { turn: number; text: string | null; structured: unknown }): void | Promise<void>;
  onRateLimit?(info: RateLimitInfoLike): void | Promise<void>;
  onStatus?(s: SessionStatus): void;
}

/** jsonb rejects \u0000 (a `cat` of a binary file puts it in tool results): it becomes U+FFFD before anything is stored. */
const noNul = (s: string): string => (s.includes('\u0000') ? s.replaceAll('\u0000', '\uFFFD') : s);

function capStrings(v: unknown, cap = STRING_CAP): unknown {
  if (typeof v === 'string') return noNul(v.length > cap ? `${v.slice(0, cap)}…[kırpıldı]` : v);
  if (Array.isArray(v)) return v.map((x) => capStrings(x, cap));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, capStrings(x, cap)]));
  return v;
}
async function sha256Of(p: string): Promise<string | null> {
  try { return createHash('sha256').update(await readFile(p)).digest('hex'); } catch { return null; }
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One agent session: persistence, live trace, audit and the cancel ladder (spec §6.4, §11, §12). */
export class SessionRunner {
  readonly id: string;
  status: SessionStatus = 'starting';
  turn = 0;
  lastEventAt = Date.now();
  private readonly t0 = Date.now();
  private evSeq = 0;
  private inTurn = true;
  private mapper: TraceMapper;
  private tracker = new TurnTracker();
  private raw: ReturnType<typeof createGzip>;
  private rawClosed: Promise<void>;
  private pendingRows = new Map<string, TraceRow>();
  private pendingLive: LiveTraceItem[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private chain: Promise<void> = Promise.resolve();
  private audited = new Map<string, string>();
  private cancelRequested = false;
  private ended: Promise<RunEnd> | null = null;
  private lastRateLimit: RateLimitInfoLike | null = null;

  constructor(private readonly d: RunnerDeps, private readonly info: RunnerInfo, private readonly session: DriverSession, private readonly hooks: RunnerHooks = {}) {
    this.id = info.id;
    this.mapper = new TraceMapper({ sessionId: info.id, cwd: info.cwd });
    const dir = join(d.dataDir, 'agent-raw');
    mkdirSync(dir, { recursive: true });
    this.raw = createGzip();
    const file = createWriteStream(join(dir, `${info.id}.ndjson.gz`));
    this.raw.pipe(file);
    this.rawClosed = new Promise((r) => { file.on('close', () => r()); file.on('error', () => r()); });
  }

  run(): Promise<RunEnd> {
    this.ended ??= this.loop();
    return this.ended;
  }

  /** Next chat turn on the same process. */
  send(text: string): void {
    this.turn++;
    this.inTurn = true;
    this.tracker.beginTurn();
    this.session.send(text);
    this.setStatus('thinking');
  }

  async cancel(): Promise<void> {
    const done = this.run().then(() => true);
    if (this.cancelRequested) { await done; return; }
    this.cancelRequested = true;
    await this.enqueue(() => appendAudit(this.d.pool, { actorType: 'orchestrator', action: 'agent.session.cancel_requested', sessionId: this.id }).then(() => {}));
    const wait = this.d.resultWaitMs ?? 5_000;
    const settled = (ms: number) => Promise.race([done, sleep(ms).then(() => false)]);
    await Promise.race([this.session.interrupt().catch(() => {}), sleep(wait)]);
    const quick = await settled(wait);
    this.session.endInput();
    if (quick) return;
    if (await settled(this.d.cancelGraceMs ?? 10_000)) return;
    this.session.kill('SIGTERM');
    if (await settled(this.d.killGraceMs ?? 5_000)) return;
    this.session.kill('SIGKILL');
    await done;
  }

  async publishView(): Promise<void> {
    const rec = await getSession(this.d.pool, this.id);
    if (rec) await publishEvent(this.d.pool, { topic: 'agents', type: 'agent.session', payload: toSessionView(rec) });
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(fn).catch((e) => { process.stderr.write(`runner ${this.id}: write failed (${errorTag(e)})\n`); });
    return this.chain;
  }

  private setStatus(s: SessionStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.hooks.onStatus?.(s);
    void this.enqueue(async () => {
      await updateSession(this.d.pool, this.id, { status: s, lastEventAt: new Date(this.lastEventAt) });
      await this.publishView();
    });
  }

  private async loop(): Promise<RunEnd> {
    let status: RunEnd['status'] = 'done';
    let error: string | undefined;
    try {
      for await (const m of this.session.messages) await this.onMessage(m);
      if (this.cancelRequested) status = 'cancelled';
    } catch (e) {
      if (this.cancelRequested) status = 'cancelled';
      else { status = 'failed'; error = isAbortError(e) ? 'aborted' : errorTag(e); }
    }
    this.queueOps(this.mapper.finish(status));
    await this.flush();
    this.raw.end();
    await this.rawClosed;
    const end: RunEnd = { status, error, rateLimit: this.lastRateLimit, resultIsError: this.tracker.lastResult?.is_error === true };
    await this.enqueue(() => this.close(end));
    return end;
  }

  private async onMessage(m: Msg): Promise<void> {
    const now = Date.now();
    this.lastEventAt = now;
    this.raw.write(`${JSON.stringify({ t: now - this.t0, m })}\n`);
    if (m.type !== 'stream_event' && !(m.type === 'system' && m.subtype === 'thinking_tokens')) {
      const seq = ++this.evSeq;
      const turn = this.turn;
      void this.enqueue(() => insertAgentEvent(this.d.pool, {
        sessionId: this.id, seq, turn, type: m.type, subtype: m.subtype ?? null, parentToolUseId: str(m.parent_tool_use_id) ?? null,
        toolUseId: str(m.tool_use_id) ?? null, taskId: str(m.task_id) ?? null, payload: capStrings(m),
      }));
    }
    if (m.type === 'system' && m.subtype === 'init') {
      void this.enqueue(() => updateSession(this.d.pool, this.id, { cliVersion: str(m.claude_code_version) ?? null, model: str(m.model) }));
    }
    const rl = rateLimitInfo(m);
    if (rl) { this.lastRateLimit = rl; await this.hooks.onRateLimit?.(rl); }
    this.queueOps(this.mapper.push(m, this.turn, now));
    if (this.inTurn) this.setStatus(this.mapper.activity());
    if (this.tracker.push(m) === 'turn_complete') {
      this.inTurn = false;
      // While cancelling, this is the aborted result: in streaming-input mode the CLI now waits for input and the
      // iterator throws only after the input closes (M3 real check). It is not a completed turn.
      if (this.cancelRequested) { this.session.endInput(); return; }
      const r = this.tracker.lastResult;
      if (this.info.kind === 'chat') this.setStatus('idle');
      await this.flush();
      await this.hooks.onTurnComplete?.({ turn: this.turn, text: str(r?.result) ?? null, structured: r?.structured_output ?? null });
      if (this.info.kind === 'pipeline') this.session.endInput();
    }
  }

  private queueOps(ops: TraceOp[]): void {
    for (const op of ops) {
      if (op.op === 'upsert') {
        const row = capStrings(op.row, Number.POSITIVE_INFINITY) as TraceRow; // no NUL into jsonb (rows and their audit)
        this.pendingRows.set(row.id, row);
        this.auditRow(row);
      }
      else if (op.op === 'delta') this.pendingLive.push({ rowId: op.rowId, text: op.text });
      else this.pendingLive.push({ rowId: op.rowId, tokens: op.tokens });
    }
    if (ops.length && !this.flushTimer) this.flushTimer = setTimeout(() => { this.flushTimer = null; void this.flush(); }, this.d.flushMs ?? 100);
  }

  private flush(): Promise<void> {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    const rows = [...this.pendingRows.values()];
    const live = this.pendingLive;
    this.pendingRows = new Map();
    this.pendingLive = [];
    if (!rows.length && !live.length) return this.chain;
    return this.enqueue(async () => {
      for (const payload of chunkLive(this.id, live)) await publishLive(this.d.pool, { topic: `session:${this.id}`, type: 'trace.delta', payload });
      // One bad row must not drop the rest of the batch.
      for (const row of rows) {
        await publishEvent(this.d.pool, { topic: `session:${this.id}`, type: 'trace.row', payload: row })
          .catch((e) => { process.stderr.write(`runner ${this.id}: trace row ${row.id} not stored (${errorTag(e)})\n`); });
      }
    });
  }

  private auditRow(r: TraceRow): void {
    if ((r.kind !== 'tool' && r.kind !== 'subagent') || r.status === 'running' || this.audited.get(r.id) === r.status) return;
    this.audited.set(r.id, r.status);
    const actorId = `${this.info.role}:${this.id}`;
    const data = redactSecretKeys({ tool: r.tool ?? null, status: r.status, summary: r.detail ?? null, turn: r.turn, parentToolUseId: r.parentToolUseId });
    void this.enqueue(() => appendAudit(this.d.pool, { actorType: 'agent', actorId, action: 'agent.tool', subjectType: 'tool', subjectId: r.tool, sessionId: this.id, toolUseId: r.id, data }).then(() => {}));
    if (r.status === 'done' && r.tool && FILE_WRITES.has(r.tool) && r.detail) {
      const path = r.detail;
      void this.enqueue(async () => {
        const abs = resolve(this.info.cwd, path);
        const after = existsSync(abs) ? await sha256Of(abs) : null;
        await appendAudit(this.d.pool, { actorType: 'agent', actorId, action: 'agent.file_write', subjectType: 'file', subjectId: path, sessionId: this.id, toolUseId: r.id, data: { path, beforeSha: this.info.beforeSha?.get(r.id) ?? null, afterSha: after } });
      });
    }
  }

  private async close(end: RunEnd): Promise<void> {
    const a = this.tracker.accounting();
    this.status = end.status;
    await updateSession(this.d.pool, this.id, {
      status: end.status, endedAt: new Date(), lastEventAt: new Date(this.lastEventAt), usage: a.modelUsage, costUsd: a.costUsd, tokens: a.tokens,
      numTurns: a.numTurns, terminalReason: a.terminalReason ?? (end.status === 'cancelled' ? 'cancelled' : null), error: end.error ?? null,
      permissionDenials: this.tracker.permissionDenials(), rawPath: join('agent-raw', `${this.id}.ndjson.gz`),
    });
    await appendAudit(this.d.pool, {
      actorType: 'agent', actorId: `${this.info.role}:${this.id}`, action: 'agent.session.closed', sessionId: this.id,
      data: { status: end.status, terminalReason: a.terminalReason, numTurns: a.numTurns, costUsd: a.costUsd, tokens: a.tokens, error: end.error ?? null },
    });
    this.hooks.onStatus?.(end.status);
    await this.publishView();
  }
}
