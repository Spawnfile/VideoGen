import { describe, expect, it } from 'vitest';
import { classifyLiveness } from '../src/agents.ts';

describe('classifyLiveness', () => {
  it('active → quiet but alive → maybe stuck only when silent AND idle CPU', () => {
    expect(classifyLiveness({ silentMs: 2_000, cpuPct: 0 })).toBe('active');
    expect(classifyLiveness({ silentMs: 15_000, cpuPct: 30 })).toBe('quiet_alive');
    expect(classifyLiveness({ silentMs: 15_000, cpuPct: 0 })).toBe('quiet_alive');
    expect(classifyLiveness({ silentMs: 130_000, cpuPct: 25 })).toBe('quiet_alive');
    expect(classifyLiveness({ silentMs: 130_000, cpuPct: 0.4 })).toBe('maybe_stuck');
    expect(classifyLiveness({ silentMs: 130_000, cpuPct: null })).toBe('maybe_stuck');
    expect(classifyLiveness({ silentMs: 300, cpuPct: 0, quietAfterMs: 100, stuckAfterMs: 200 })).toBe('maybe_stuck');
  });
});
