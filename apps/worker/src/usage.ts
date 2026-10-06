import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { cleanChildEnv, fromGetUsage, type UsageSnapshot } from '@videogen/shared';
import { appendAudit, publishEvent } from '@videogen/db';
import { errorTag, TimeoutError } from './errors.ts';

export async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(message)), ms); });
  try { return await Promise.race([p, timeout]); } finally { clearTimeout(timer); }
}

const USAGE_TIMEOUT_MS = 30_000;

export interface UsageSource { read(): Promise<UsageSnapshot | null> }

/** Zero-token read: opens an idle streaming session and asks for /usage data without sending a turn.
 *  The SDK names this API experimental; it is isolated here so an SDK change touches one file. */
export class SdkUsageSource implements UsageSource {
  async read(): Promise<UsageSnapshot | null> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    async function* noMessages() { await gate; }
    const q = query({
      prompt: noMessages(),
      options: { settingSources: [], strictMcpConfig: true, mcpServers: {}, env: cleanChildEnv(), model: 'haiku', permissionMode: 'dontAsk', permissionPrompts: 'none' },
    });
    // Handler attached at creation: the drain may reject before anyone awaits it.
    const drain = (async () => { for await (const _m of q) { /* idle: no turns are sent */ } })().catch(() => {});
    try {
      const call = q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });
      call.catch(() => {}); // if the timeout wins, close() rejects this later; nobody awaits it
      return fromGetUsage(await withTimeout(call, USAGE_TIMEOUT_MS, 'usage read timed out'));
    } finally {
      q.close(); // kills the CLI child (also on timeout)
      release();
      await drain;
    }
  }
}

export class FixtureUsageSource implements UsageSource {
  constructor(private readonly path: string) {}
  async read(): Promise<UsageSnapshot | null> {
    return fromGetUsage(JSON.parse(await readFile(this.path, 'utf8')).usage);
  }
}

export async function recordUsage(pool: pg.Pool, s: UsageSnapshot): Promise<void> {
  await pool.query(
    `INSERT INTO usage_snapshots (source, five_hour_util, five_hour_resets_at, seven_day_util, seven_day_resets_at, status, subscription_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [s.source, s.fiveHour?.utilization ?? null, s.fiveHour?.resetsAt ?? null, s.sevenDay?.utilization ?? null, s.sevenDay?.resetsAt ?? null, s.status, s.subscriptionType],
  );
  await publishEvent(pool, { topic: 'system', type: 'usage', payload: s });
}

export function startUsagePoller(pool: pg.Pool, src: UsageSource, everyMs: number): () => void {
  if (!everyMs) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const s = await src.read();
      if (s) await recordUsage(pool, s);
    } catch (e) {
      await appendAudit(pool, { actorType: 'system', action: 'usage.read_failed', data: { error: errorTag(e) } }).catch(() => {});
    } finally {
      running = false;
    }
  };
  void tick();
  const h = setInterval(tick, everyMs);
  return () => clearInterval(h);
}
