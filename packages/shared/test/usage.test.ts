import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromGetUsage, fromRateLimitEvent, parseAuthStatus, usageLevel } from '../src/index.ts';

const root = resolve(import.meta.dirname, '../../..');
const at = new Date('2026-10-06T12:00:00Z');

describe('usage mapping', () => {
  it('normalizes per source: get_usage is percent, rate_limit_event is a fraction', () => {
    const win = (utilization: number | null) => ({ utilization, resets_at: '2026-10-06T17:00:00.000Z' });
    const g = (u: number | null) => fromGetUsage({ subscription_type: 'max', rate_limits_available: true, rate_limits: { five_hour: win(u), seven_day: null } }, at).fiveHour?.utilization;
    expect(g(1)).toBe(0.01); // 1% must not become 100%
    expect(g(100)).toBe(1);
    expect(g(0)).toBe(0);
    expect(g(null)).toBeNull();
    const e = (u: number | undefined) => fromRateLimitEvent({ rateLimitType: 'five_hour', utilization: u, resetsAt: 1791252000 }, at).fiveHour?.utilization;
    expect(e(0.01)).toBe(0.01);
    expect(e(1)).toBe(1);
    expect(e(undefined)).toBeNull();
  });

  it('maps the get_usage response', () => {
    const sample = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/usage-response.sample.json'), 'utf8'));
    expect(fromGetUsage(sample.usage, at)).toEqual({
      source: 'get_usage',
      fiveHour: { utilization: 0.35, resetsAt: '2026-10-06T17:00:00.000Z' },
      sevenDay: { utilization: 0.12, resetsAt: '2026-10-11T12:00:00.000Z' },
      status: null,
      subscriptionType: 'max',
      at: at.toISOString(),
    });
  });

  it('maps a rate_limit_event with unifiedWindows (shape observed live 2026-10-06)', () => {
    const info = {
      status: 'allowed' as const, resetsAt: 1791252000, rateLimitType: 'five_hour' as const,
      unifiedWindows: { five_hour: { utilization: 0.35, resetsAt: 1791252000 }, seven_day: { utilization: 0.12, resetsAt: 1791320400 } },
    };
    const s = fromRateLimitEvent(info, at);
    expect(s.fiveHour).toEqual({ utilization: 0.35, resetsAt: new Date(1791252000 * 1000).toISOString() });
    expect(s.sevenDay).toEqual({ utilization: 0.12, resetsAt: new Date(1791320400 * 1000).toISOString() });
    expect(s.status).toBe('allowed');
  });

  it('maps a typed rate_limit_event without unifiedWindows', () => {
    const s = fromRateLimitEvent({ status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.81, resetsAt: 1791320400 }, at);
    expect(s.fiveHour).toBeNull();
    expect(s.sevenDay?.utilization).toBe(0.81);
  });

  it('returns null windows when rate limits are unavailable', () => {
    const s = fromGetUsage({ subscription_type: null, rate_limits_available: false, rate_limits: null }, at);
    expect(s.fiveHour).toBeNull();
    expect(s.sevenDay).toBeNull();
  });

  it.skipIf(!existsSync(resolve(root, 'tests/fixtures/claude-streams/usage-response.json')))('maps the real M0 recording', () => {
    const real = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/claude-streams/usage-response.json'), 'utf8'));
    const s = fromGetUsage(real.usage, at);
    expect(s.fiveHour?.utilization).toBeGreaterThanOrEqual(0);
    expect(s.fiveHour?.utilization).toBeLessThanOrEqual(1);
  });

  it('maps an unparseable date to null instead of throwing', () => {
    const bad = { utilization: 40, resets_at: 'not-a-date' };
    const s = fromGetUsage({ subscription_type: 'max', rate_limits_available: true, rate_limits: { five_hour: bad, seven_day: null } }, at);
    expect(s.fiveHour).toEqual({ utilization: 0.4, resetsAt: null });
    expect(fromRateLimitEvent({ rateLimitType: 'five_hour', utilization: 0.4, resetsAt: Number.NaN }, at).fiveHour?.resetsAt).toBeNull();
  });

  it('classifies levels with statusline thresholds', () => {
    expect([usageLevel(null), usageLevel(0.2), usageLevel(0.5), usageLevel(0.8)]).toEqual(['unknown', 'ok', 'warn', 'high']);
  });
});

describe('claude auth status', () => {
  it('keeps only non-identifying fields', () => {
    const a = parseAuthStatus(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max', email: 'x@y.z', orgId: 'o' }), at);
    expect(a).toEqual({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max', checkedAt: at.toISOString() });
  });
});
