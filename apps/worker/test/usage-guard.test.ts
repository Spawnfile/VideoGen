import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fromGetUsage, fromRateLimitEvent } from '@videogen/shared';
import { getSession, listSessions } from '@videogen/db';
import { FakeClaudeDriver, loadFixture } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { evaluateGuard, UsageGuard } from '../src/agents/usage-guard.ts';
import { FixtureUsageSource, startUsagePoller } from '../src/usage.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const future = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const epoch = (s: number) => Math.ceil(Date.now() / 1000) + s;
const W = (u: number, resetsAt = future(3600)) => ({ utilization: u, resetsAt });

describe('evaluateGuard', () => {
  it('normalizes by source and applies the 80 % / 90 % thresholds', () => {
    const fromPoll = (pct: number) => fromGetUsage({ subscription_type: 'max', rate_limits_available: true, rate_limits: { five_hour: { utilization: pct, resets_at: future(3600) }, seven_day: { utilization: 10, resets_at: future(86400) } } });
    const g = (s: ReturnType<typeof fromPoll>) => evaluateGuard({ fiveHour: s.fiveHour, sevenDay: s.sevenDay, rejectedUntil: null });
    expect(g(fromPoll(79))).toMatchObject({ blocked: false, fiveHour: 0.79 });
    expect(g(fromPoll(80))).toMatchObject({ blocked: true, reason: 'five_hour' });
    expect(g(fromPoll(1))).toMatchObject({ blocked: false, fiveHour: 0.01 });
    const ev = fromRateLimitEvent({ status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.8, resetsAt: epoch(3600) }, seven_day: { utilization: 0.2, resetsAt: epoch(86400) } } });
    expect(evaluateGuard({ fiveHour: ev.fiveHour, sevenDay: ev.sevenDay, rejectedUntil: null })).toMatchObject({ blocked: true, reason: 'five_hour' });
    expect(evaluateGuard({ fiveHour: W(0.1), sevenDay: W(0.9), rejectedUntil: null })).toMatchObject({ blocked: true, reason: 'seven_day' });
    expect(evaluateGuard({ fiveHour: W(0.95, new Date(Date.now() - 1000).toISOString()), sevenDay: W(0.1), rejectedUntil: null })).toMatchObject({ blocked: false, fiveHour: null });
    const until = future(60);
    expect(evaluateGuard({ fiveHour: W(0.5), sevenDay: W(0.1), rejectedUntil: until })).toEqual({ blocked: true, reason: 'rejected', resumeAt: until, fiveHour: 0.5, sevenDay: 0.1 });
  });
});

describe('UsageGuard', () => {
  it('merges partial snapshots, audits each transition once and publishes usage.guard', async () => {
    const g = new UsageGuard({ pool: t.pool });
    cleanups.push(() => g.stop());
    await g.update({ source: 'get_usage', fiveHour: W(0.2), sevenDay: W(0.95), status: null, subscriptionType: 'max', at: new Date().toISOString() });
    expect(g.state()).toMatchObject({ blocked: true, reason: 'seven_day' });
    await g.update({ source: 'rate_limit_event', fiveHour: W(0.3), sevenDay: null, status: 'allowed', subscriptionType: null, at: new Date().toISOString() });
    expect(g.state()).toMatchObject({ blocked: true, reason: 'seven_day', fiveHour: 0.3, sevenDay: 0.95 });
    await g.update({ source: 'get_usage', fiveHour: W(0.3), sevenDay: W(0.5), status: null, subscriptionType: 'max', at: new Date().toISOString() });
    expect(g.allowsNewPipeline()).toBe(true);
    const { rows } = await t.pool.query("SELECT action FROM audit_log WHERE action LIKE 'usage.guard.%' ORDER BY seq");
    expect(rows.map((r) => r.action)).toEqual(['usage.guard.blocked', 'usage.guard.cleared']);
    const ev = await t.pool.query("SELECT payload FROM ui_events WHERE type = 'usage.guard' ORDER BY id");
    expect(ev.rows.map((r) => r.payload.blocked)).toEqual([true, false]);
  });

  it('re-evaluates at resumeAt and notifies onClear listeners', async () => {
    const g = new UsageGuard({ pool: t.pool, marginMs: 10 });
    cleanups.push(() => g.stop());
    const cleared = vi.fn();
    g.onClear(cleared);
    await g.update({ source: 'get_usage', fiveHour: W(0.9, new Date(Date.now() + 200).toISOString()), sevenDay: W(0.1), status: null, subscriptionType: null, at: new Date().toISOString() });
    expect(g.allowsNewPipeline()).toBe(false);
    await vi.waitFor(() => expect(cleared).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(g.allowsNewPipeline()).toBe(true);
  });

  it('hands every get_usage poll snapshot to the guard callback (after recording it)', async () => {
    // The sample fixture's reset times are fixed dates, so assert the hand-off, not the guard state (no time bomb).
    const seen = vi.fn(async (_s: unknown) => {});
    const stop = startUsagePoller(t.pool, new FixtureUsageSource(resolve(import.meta.dirname, '../../../tests/fixtures/usage-response.sample.json')), 60_000, seen);
    cleanups.push(stop);
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    expect(seen.mock.calls[0]![0]).toMatchObject({ source: 'get_usage', fiveHour: { utilization: 0.35 } });
  });
});

describe('guard and SessionManager', () => {
  const make = (g: UsageGuard) => {
    const m = new SessionManager({ pool: t.pool, dataDir: mkdtempSync(join(tmpdir(), 'vg-guard-')), driver: new FakeClaudeDriver({ speed: 0 }), gate: g, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 } });
    cleanups.push(() => m.stop());
    return m;
  };

  it('holds new pipeline sessions in waiting_limit while chat still starts; clearing starts them', async () => {
    const g = new UsageGuard({ pool: t.pool, marginMs: 10 });
    cleanups.push(() => g.stop());
    const m = make(g);
    const resetsAt = new Date(Date.now() + 1500).toISOString();
    await g.update({ source: 'get_usage', fiveHour: W(0.85, resetsAt), sevenDay: W(0.1), status: null, subscriptionType: null, at: new Date().toISOString() });
    const p = await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p', fakeScript: { fixture: 'basic', stall: { afterIndex: 1, ms: 60_000 } } });
    const c = await m.start({ kind: 'chat', role: 'chat', prompt: 'merhaba', fakeScript: { fixture: 'basic', stall: { afterIndex: 1, ms: 60_000 } } });
    await vi.waitFor(async () => expect((await getSession(t.pool, p))!.status).toBe('waiting_limit'));
    expect((await getSession(t.pool, p))!.waitingUntil).toBe(resetsAt);
    await vi.waitFor(async () => expect((await getSession(t.pool, c))!.status).toBe('thinking'));
    await vi.waitFor(async () => expect((await getSession(t.pool, p))!.status).toBe('thinking'), { timeout: 3000 });
  });

  it('a session stopped by a rejected limit waits and resumes automatically as a child session after the reset', async () => {
    const g = new UsageGuard({ pool: t.pool, marginMs: 10 });
    cleanups.push(() => g.stop());
    const m = make(g);
    const resetsAt = epoch(1);
    const rejected = { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt, rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 1, resetsAt } } } };
    const idx = loadFixture('basic').findIndex((l) => l.m.type === 'rate_limit_event');
    const id = await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p', fakeScript: { fixture: 'basic', inject: [{ afterIndex: idx, m: rejected }], failAfter: { index: idx, error: 'Claude Code returned an error result: rate limited' } } });
    await vi.waitFor(async () => expect((await getSession(t.pool, id))!.status).toBe('waiting_limit'));
    expect(g.state().reason).toBe('rejected');
    await vi.waitFor(async () => {
      const kids = (await listSessions(t.pool, { kind: 'pipeline' })).filter((s) => s.parentSessionId === id);
      expect(kids).toHaveLength(1);
      expect(kids[0]!.claudeSessionId).toBe((await getSession(t.pool, id))!.claudeSessionId);
    }, { timeout: 4000 });
    expect(await getSession(t.pool, id)).toMatchObject({ status: 'failed', terminalReason: 'rate_limited' });
  });
});
