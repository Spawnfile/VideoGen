import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ToolSession } from '../src/agents/manager.ts';
import { FRAME_BUDGET, ReviewTargets, reviewToolHost, toolHosts } from '../src/pipeline/review-tools.ts';
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

describe('extract_frames host (draft review)', () => {
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
    targets.delete('step-review');
    await expect(host.ports(session(runDir)).extractFrames!({ times: [0] })).rejects.toThrow('İncelenecek taslak yok.');
    expect(existsSync(join(runDir, 'review'))).toBe(false);
    const both = toolHosts({ ports: () => ({ buildScene: async () => { throw new Error('x'); } }) }, host).ports(session(runDir));
    expect(Object.keys(both).sort()).toEqual(['buildScene', 'extractFrames']);
  });
});
