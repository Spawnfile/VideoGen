import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fromGetUsage, QC_CHECK_IDS, type QcCheckResult } from '@videogen/shared';
import { runProfile, type RealStep, type StepOutcome } from '../src/real/profile.ts';
import { cerEvidence, initEvidence, qcEvidence, rendererEvidence, usageEvidence } from '../src/real/steps.ts';

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

describe('test:smoke:real profile (plan M7 Y14)', () => {
  it('runProfile: refuses with ANTHROPIC_API_KEY set or the 5 h window at 80 %; runs steps in order, honours --only and --skip, records ms and evidence, writes the JSON report and exits 1 on any fail', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'vg-real-report-'));
    dirs.push(reportDir);
    const reportPath = join(reportDir, 'real-smoke-2026-10-08.json');
    let now = 0;
    const calls: number[] = [];
    const seen: string[] = [];
    const outcomes: Record<number, StepOutcome | Error> = {
      1: { status: 'pass', evidence: { apiKeySource: 'none', hookEvents: 0 } },
      2: { status: 'pass', evidence: { fiveHour: 12 } },
      3: { status: 'fail', evidence: { renderer: 'llvmpipe' }, reason: 'GPU NVIDIA değil' },
      4: { status: 'skip', evidence: {}, reason: 'Chrome yok' },
      5: new Error('ses CLI çöktü'),
      6: { status: 'pass', evidence: { exit: 3, missing: [] } },
    };
    const steps: RealStep[] = [1, 2, 3, 4, 5, 6].map((id) => ({
      id: id as RealStep['id'],
      title_tr: `adım ${id}`,
      run: async (ctx) => {
        calls.push(id);
        seen.push(`${ctx.dataDir}|${ctx.databaseUrl}`);
        now += id * 100;
        const o = outcomes[id]!;
        if (o instanceof Error) throw o;
        return o;
      },
    }));
    let created = 0;
    let disposed = 0;
    let usageReads = 0;
    const base = {
      env: { PATH: '/usr/bin' } as NodeJS.ProcessEnv,
      usage: async () => { usageReads++; return { fiveHour: 12 }; },
      clock: () => now,
      now: () => new Date('2026-10-08T09:00:00Z'),
      workspace: async (date: string) => {
        created++;
        return { dataDir: `/tmp/videogen-real-${date}`, databaseUrl: 'postgres://x@127.0.0.1:5433/videogen_real_check', dispose: async () => { disposed++; } };
      },
      reportDir,
      log: () => {},
    };

    // Preconditions: the paid key is refused before the usage read (it would use the key); nothing is created, no report.
    const keyed = await runProfile(steps, { ...base, env: { ANTHROPIC_API_KEY: 'x' } });
    expect(keyed.exitCode).toBe(2);
    expect(keyed.refused).toMatch(/ANTHROPIC_API_KEY/);
    expect(keyed.results).toEqual([]);
    expect([usageReads, created, calls.length, existsSync(reportPath)]).toEqual([0, 0, 0, false]);
    for (const fiveHour of [80, 93.5]) {
      const busy = await runProfile(steps, { ...base, usage: async () => ({ fiveHour }) });
      expect(busy.exitCode).toBe(2);
      expect(busy.refused).toMatch(/%80/);
    }
    for (const usage of [async () => ({ fiveHour: null }), async () => { throw new Error('oturum açılamadı'); }]) {
      const unknown = await runProfile(steps, { ...base, usage });
      expect(unknown.exitCode).toBe(2);
      expect(unknown.refused).toMatch(/kullanım/);
    }
    expect([created, calls.length, existsSync(reportPath)]).toEqual([0, 0, false]);

    // Full run: in order, ms from the clock, a thrown step is a fail with its message, the workspace is disposed once.
    const full = await runProfile(steps, base);
    expect(calls).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(seen)).toEqual(new Set(['/tmp/videogen-real-2026-10-08|postgres://x@127.0.0.1:5433/videogen_real_check']));
    expect(full.results.map((r) => [r.id, r.status, r.ms])).toEqual([[1, 'pass', 100], [2, 'pass', 200], [3, 'fail', 300], [4, 'skip', 400], [5, 'fail', 500], [6, 'pass', 600]]);
    expect(full.results[0]!.evidence).toEqual({ apiKeySource: 'none', hookEvents: 0 });
    expect(full.results[2]!.reason).toBe('GPU NVIDIA değil');
    expect(full.results[4]!.reason).toBe('ses CLI çöktü');
    expect(full.exitCode).toBe(1);
    expect([usageReads, created, disposed]).toEqual([1, 1, 1]);
    expect(full.reportPath).toBe(reportPath);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report).toMatchObject({ date: '2026-10-08', exitCode: 1, preconditions: { fiveHour: 12 }, only: null, skip: [] });
    expect(report.results).toEqual(JSON.parse(JSON.stringify(full.results)));

    // --only 1,3: the others are skipped without running; still exit 1 (step 3 fails).
    calls.length = 0;
    const only = await runProfile(steps, { ...base, only: [3, 1] });
    expect(calls).toEqual([1, 3]);
    expect(only.results.map((r) => [r.id, r.status])).toEqual([[1, 'pass'], [2, 'skip'], [3, 'fail'], [4, 'skip'], [5, 'skip'], [6, 'skip']]);
    expect(only.results[1]).toMatchObject({ ms: 0, reason: '--only' });
    expect(only.exitCode).toBe(1);
    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({ only: [1, 3], exitCode: 1 });

    // --skip 3,5: no fail left → exit 0; a skip is not a failure.
    calls.length = 0;
    const skipped = await runProfile(steps, { ...base, skip: [5, 3] });
    expect(calls).toEqual([1, 2, 4, 6]);
    expect(skipped.results.filter((r) => r.reason === '--skip').map((r) => r.id)).toEqual([3, 5]);
    expect(skipped.exitCode).toBe(0);
    expect([created, disposed]).toEqual([3, 3]);
  });

  it('evidence parsers: apiKeySource \'none\' and zero hook events pass, any hook event fails; usage percentages outside 0..100 fail; a non-NVIDIA renderer fails; CER above 5 % fails; qc passes only with exit 3 and all seven expected failures, naming the missing ones', () => {
    const init = (apiKeySource: string) => ({ type: 'system', subtype: 'init', apiKeySource, session_id: 's' });
    const turn = [{ type: 'assistant', message: { content: [{ type: 'text', text: 'tamam' }] } }, { type: 'result', subtype: 'success' }];
    expect(initEvidence([init('none'), ...turn])).toEqual({ apiKeySource: 'none', hookEvents: 0, ok: true });
    expect(initEvidence([init('none'), { type: 'system', subtype: 'hook_started', hook_name: 'SessionStart' }, { type: 'system', subtype: 'hook_response' }, ...turn]))
      .toMatchObject({ apiKeySource: 'none', hookEvents: 2, ok: false });
    expect(initEvidence([init('ANTHROPIC_API_KEY'), ...turn])).toMatchObject({ apiKeySource: 'ANTHROPIC_API_KEY', ok: false });
    expect(initEvidence(turn)).toMatchObject({ apiKeySource: null, ok: false });

    const snap = (five: number | null, seven: number | null, resets: string | null = '2026-10-08T14:00:00Z') => fromGetUsage({
      subscription_type: 'max', rate_limits_available: true,
      rate_limits: { five_hour: { utilization: five, resets_at: resets }, seven_day: { utilization: seven, resets_at: '2026-10-12T00:00:00Z' } },
    });
    expect(usageEvidence(snap(12, 40))).toMatchObject({ ok: true, fiveHour: 12, sevenDay: 40, fiveHourResetsAt: '2026-10-08T14:00:00.000Z' });
    expect(usageEvidence(snap(0, 100)).ok).toBe(true);
    expect(usageEvidence(snap(120, 40))).toMatchObject({ ok: false, reason: expect.stringMatching(/0\.\.100/) });
    expect(usageEvidence(snap(12, -1)).ok).toBe(false);
    expect(usageEvidence(snap(null, 40)).ok).toBe(false);
    expect(usageEvidence(snap(12, 40, null))).toMatchObject({ ok: false, reason: expect.stringMatching(/sıfırlanma/) });
    expect(usageEvidence(null)).toMatchObject({ ok: false });

    expect(rendererEvidence('NVIDIA GeForce RTX 4070 Laptop GPU/PCIe/SSE2')).toEqual({ nvidia: true, renderer: 'NVIDIA GeForce RTX 4070 Laptop GPU/PCIe/SSE2', ok: true });
    expect(rendererEvidence('llvmpipe (LLVM 17.0.6, 256 bits)')).toMatchObject({ nvidia: false, ok: false });
    expect(rendererEvidence('')).toMatchObject({ nvidia: false, ok: false });

    const line = (cer: number) => ({ id: 'l1', wav: '/x.wav', durationMs: 2100, seed: 1, attempts: 1, cer, normalized: 'a', asr: 'a', words: [] });
    expect(cerEvidence({ lines: [line(0.03)], failed: [] })).toEqual({ cer: 0.03, ok: true });
    expect(cerEvidence({ lines: [line(0.05)], failed: [] }).ok).toBe(true);
    expect(cerEvidence({ lines: [line(0.06)], failed: ['l1'] })).toEqual({ cer: 0.06, ok: false });
    expect(cerEvidence({ lines: [line(0.051)], failed: [] }).ok).toBe(false);
    expect(cerEvidence({ lines: [], failed: [] }).ok).toBe(false);

    const EXPECTED = ['d6_loudness', 'd6_lra', 'd6_first_audio', 'd6_silence', 'd3_freeze', 'g1_color', 'g6_edges'];
    const checks = (failing: string[]): QcCheckResult[] => QC_CHECK_IDS.filter((id) => id !== 'g6_layout')
      .map((id) => ({ id, pass: !failing.includes(id), value: 'x', limit: 'y' }));
    expect(qcEvidence(checks(EXPECTED))).toMatchObject({ exit: 3, missing: [], ok: true });
    expect(qcEvidence(checks([...EXPECTED, 'd7_gop']))).toMatchObject({ exit: 3, missing: [], unexpected: ['d7_gop'], ok: true });
    expect(qcEvidence(checks(EXPECTED.filter((id) => id !== 'd3_freeze' && id !== 'd6_lra')))).toMatchObject({ exit: 3, missing: ['d6_lra', 'd3_freeze'], ok: false });
    // Without a gate failure (G1/G6) qc-cli exits 0: not the pilot's verdict.
    expect(qcEvidence(checks(EXPECTED.filter((id) => !id.startsWith('g'))))).toMatchObject({ exit: 0, missing: ['g1_color', 'g6_edges'], ok: false });
  });
});
