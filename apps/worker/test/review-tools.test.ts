import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ToolSession } from '../src/agents/manager.ts';
import { FRAME_BUDGET, ReviewTargets, reviewToolHost, toolHosts } from '../src/pipeline/review-tools.ts';
import { buildQcReport, type QcCheckResult } from '@videogen/shared';
import { fakeDraft } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const size = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim();
const session = (runDir: string, o: Partial<ToolSession> = {}): ToolSession => ({ sessionId: 's1', role: 'reviewer_visual', runId: 'r', stepId: 'step-review', runDir, signal: new AbortController().signal, gpuWait: () => {}, ...o });

async function target() {
  const runDir = mkdtempSync(join(tmpdir(), 'vg-review-tools-'));
  const video = join(runDir, 'draft.mp4');
  await fakeDraft(FFMPEG, video, { width: 540, height: 960, frames: 60 });
  const targets = new ReviewTargets();
  targets.set('step-review', { round: 0, video, frames: 60, fps: 30, durationS: 2, outDir: join(runDir, 'review', 'r0', 'frames') });
  return { runDir, targets };
}

// Real ffmpeg under parallel files (plan M7 Y2): at least 60 s per test.
describe('extract_frames host (draft review)', { timeout: 60_000 }, () => {
  it('writes full frames and 2× crops of the draft under review, clamps times to the last frame, and counts the round budget across sessions', async () => {
    const { runDir, targets } = await target();
    const host = reviewToolHost({ ffmpeg: FFMPEG, targets });
    const ports = host.ports(session(runDir));
    const r = await ports.extractFrames!({ times: [0, 1, 9] });
    expect(r.frames.map((f) => [f.time, f.frame, f.path])).toEqual([
      [0, 0, 'review/r0/frames/t000000.png'], [1, 30, 'review/r0/frames/t001000.png'], [1.967, 59, 'review/r0/frames/t001967.png'],
    ]);
    expect(r.remaining).toBe(FRAME_BUDGET - 3);
    expect(size(join(runDir, r.frames[1]!.path))).toBe('540,960');
    // A schema-fix session of the same round is a new session id but shares the budget.
    const crop = await host.ports(session(runDir, { sessionId: 's2' })).extractFrames!({ times: [1], crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.25 } });
    expect(size(join(runDir, crop.frames[0]!.path))).toBe('540,480');
    expect(crop.remaining).toBe(FRAME_BUDGET - 4);
    await expect(ports.extractFrames!({ times: Array.from({ length: 9 }, (_, i) => i / 10) })).rejects.toThrow('Kare bütçesi: bu incelemede en çok 12 tek kare; kalan 8.');
    // A worker-side retry of the same round registers the draft again: the budget is kept (final review M3); a new round starts fresh.
    const t = targets.get('step-review')!;
    targets.delete('step-review');
    targets.set('step-review', { ...t, round: 0 });
    expect(targets.get('step-review')!.used).toBe(4);
    targets.set('step-review', { ...t, round: 1 });
    expect(targets.get('step-review')!.used).toBe(0);
  });

  it('gives the tool only to reviewer_visual inside a step with a registered draft; other hosts keep their ports', async () => {
    const { runDir, targets } = await target();
    const host = reviewToolHost({ ffmpeg: FFMPEG, targets });
    expect(host.ports(session(runDir, { role: 'builder' }))).toEqual({});
    expect(host.ports(session(runDir, { stepId: null }))).toEqual({});
    // The old-style (draft) call lands as the visual reviewer, pass 1, without a qc report.
    expect(targets.get('step-review')).toMatchObject({ role: 'reviewer_visual', seq: 1, qc: null });
    expect(host.ports(session(runDir)).runQc).toBeUndefined();
    targets.delete('step-review');
    expect(targets.get('step-review')).toBeUndefined();
    await expect(host.ports(session(runDir)).extractFrames!({ times: [0] })).rejects.toThrow('İncelenecek video yok.');
    expect(existsSync(join(runDir, 'review'))).toBe(false);
    const both = toolHosts({ ports: () => ({ buildScene: async () => { throw new Error('x'); } }) }, host).ports(session(runDir));
    expect(Object.keys(both).sort()).toEqual(['buildScene', 'extractFrames']);
  });
});

describe('final review tools', { timeout: 60_000 }, () => {
  const qcReport = () => {
    const ok = (id: QcCheckResult['id']): QcCheckResult => ({ id, pass: true, value: 'tamam', limit: '-' });
    const music: QcCheckResult[] = [ok('g1_video'), { id: 'd7_bitrate', pass: false, value: '2000 kb/sn', limit: '3000–11000 kb/sn' }, { id: 'd3_freeze', pass: true, value: 'yok', limit: '≤ 0,5 sn' }, { id: 'd8_loop', pass: false, value: '0,70', limit: '≥ 0,90' }];
    return buildQcReport(music, [ok('g1_video')]);
  };

  it('each final reviewer role has its own 12-frame budget per round and pass; run_qc returns the stored report; an unregistered role gets nothing', async () => {
    const { runDir, targets } = await target();
    targets.delete('step-review');
    const base = { video: join(runDir, 'draft.mp4'), frames: 60, fps: 30, durationS: 2 };
    const qc = qcReport();
    targets.set('step-review', { ...base, round: 0, role: 'reviewer_visual', seq: 1, qc, outDir: join(runDir, 'review', 'visual') });
    targets.set('step-review', { ...base, round: 0, role: 'reviewer_retention', seq: 1, qc, outDir: join(runDir, 'review', 'retention') });
    const host = reviewToolHost({ ffmpeg: FFMPEG, targets });
    const as = (role: ToolSession['role']) => host.ports(session(runDir, { role }));
    expect((await as('reviewer_visual').extractFrames!({ times: [0, 1] })).remaining).toBe(10);
    expect((await as('reviewer_retention').extractFrames!({ times: [0] })).remaining).toBe(11);
    expect(Object.keys(as('reviewer_retention')).sort()).toEqual(['extractFrames', 'runQc']);
    const r = await as('reviewer_visual').runQc!();
    expect(r.pass).toBe(true);
    expect(r.failed.map((f) => f.id)).toEqual(['d7_bitrate']);
    expect(r.failed[0]).toMatchObject({ variant: 'music', label: 'Bit hızı', value: '2000 kb/sn', limit: '3000–11000 kb/sn' });
    expect(r.measures.map((m) => m.id)).toEqual(['d3_freeze', 'd8_loop']);
    expect(r.scores).toEqual(qc.scores);
    expect(r.gates).toEqual(qc.gates);
    // No target registered for the facts reviewer: no ports at all (its web tools are built in).
    expect(as('reviewer_facts')).toEqual({});
    // A second, independent visual pass has a fresh budget; so has the same pass of a later fix round.
    targets.set('step-review', { ...base, round: 0, role: 'reviewer_visual', seq: 2, qc, outDir: join(runDir, 'review', 'visual2') });
    expect(targets.get('step-review')!.used).toBe(0);
    expect((await as('reviewer_visual').extractFrames!({ times: [0] })).remaining).toBe(11);
    targets.set('step-review', { ...base, round: 0, role: 'reviewer_visual', seq: 1, qc, outDir: join(runDir, 'review', 'visual') });
    expect(targets.get('step-review')!.used).toBe(2);
    targets.set('step-review', { ...base, round: 2, role: 'reviewer_visual', seq: 1, qc, outDir: join(runDir, 'review', 'visual-r2') });
    expect(targets.get('step-review')!.used).toBe(0);
    // delete(stepId, role) removes one role; delete(stepId) all of the step.
    targets.delete('step-review', 'reviewer_visual');
    expect(targets.get('step-review')).toBeUndefined();
    expect(targets.get('step-review', 'reviewer_retention')).toBeDefined();
    targets.delete('step-review');
    expect(targets.get('step-review', 'reviewer_retention')).toBeUndefined();
  });
});
