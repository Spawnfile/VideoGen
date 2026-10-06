import type { RateLimitInfoLike } from '@videogen/shared';
import { arr, num, obj, str, type Msg } from './messages.ts';

export interface Accounting {
  numTurns: number;
  costUsd: number | null;
  modelUsage: Record<string, unknown> | null;
  tokens: number;
  terminalReason: string | null;
  results: number;
}
export interface Denial { tool: string; toolUseId: string }

/**
 * Decides when a user turn is finished and accounts for it.
 * A backgrounded subagent makes the CLI emit an early result and, after its task_notification, a follow-up turn with
 * another result (subagent.ndjson: the background set empties BEFORE the first result). A turn is complete when no
 * background task is pending AND results ≥ 1 + notifications of backgrounded tasks.
 */
export class TurnTracker {
  private bg = new Set<string>();
  private backgrounded = new Set<string>();
  private notified = 0;
  private turnResults = 0;
  private all: Msg[] = [];

  beginTurn(): void {
    this.notified = 0;
    this.turnResults = 0;
  }

  push(m: Msg): 'turn_complete' | null {
    if (m.type === 'system' && m.subtype === 'background_tasks_changed') {
      this.bg = new Set(arr(m.tasks).map((t) => str(obj(t)?.task_id)).filter((x): x is string => !!x));
      return null;
    }
    if (m.type === 'system' && m.subtype === 'task_started' && m.is_backgrounded === true) {
      const id = str(m.task_id);
      if (id) this.backgrounded.add(id);
      return null;
    }
    if (m.type === 'system' && m.subtype === 'task_notification' && this.backgrounded.has(str(m.task_id) ?? '')) {
      this.notified++;
      return null;
    }
    if (m.type !== 'result') return null;
    this.all.push(m);
    this.turnResults++;
    return this.bg.size === 0 && this.turnResults >= 1 + this.notified ? 'turn_complete' : null;
  }

  get lastResult(): Msg | null {
    return this.all.at(-1) ?? null;
  }

  /** Last result's cumulative modelUsage / total_cost_usd; num_turns is a per-result segment and is summed. */
  accounting(): Accounting {
    const last = this.lastResult;
    const modelUsage = (obj(last?.modelUsage) ?? null) as Record<string, unknown> | null;
    let tokens = 0;
    for (const u of Object.values(modelUsage ?? {})) {
      const x = obj(u) ?? {};
      tokens += (num(x.inputTokens) ?? 0) + (num(x.outputTokens) ?? 0) + (num(x.cacheReadInputTokens) ?? 0) + (num(x.cacheCreationInputTokens) ?? 0);
    }
    return {
      numTurns: this.all.reduce((s, r) => s + (num(r.num_turns) ?? 0), 0),
      costUsd: num(last?.total_cost_usd) ?? null,
      modelUsage,
      tokens,
      terminalReason: str(last?.terminal_reason) ?? null,
      results: this.all.length,
    };
  }

  permissionDenials(): Denial[] {
    const seen = new Map<string, Denial>();
    for (const r of this.all) {
      for (const d of arr(r.permission_denials)) {
        const o = obj(d);
        const id = str(o?.tool_use_id);
        if (id) seen.set(id, { tool: str(o?.tool_name) ?? 'unknown', toolUseId: id });
      }
    }
    return [...seen.values()];
  }
}

/** interrupt() makes the SDK iterator throw this after the aborted result (M0). */
export function isAbortError(e: unknown): boolean {
  return e instanceof Error && /Claude Code returned an error result/.test(e.message);
}

export function rateLimitInfo(m: Msg): RateLimitInfoLike | null {
  return m.type === 'rate_limit_event' ? ((obj(m.rate_limit_info) ?? null) as RateLimitInfoLike | null) : null;
}
