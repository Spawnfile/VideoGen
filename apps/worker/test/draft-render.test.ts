import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { groupAlive } from '@videogen/claude';
import { reapOrphans, writePidFile } from '../src/agents/pids.ts';
import { BlenderRenderDriver, FakeRenderDriver } from '../src/render/driver.ts';
import { draftProbeErrors, extractFrame, probeVideo } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const size = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim();
const props = { yfov: [0.5, 0.5], frames: 59, width: 540, height: 960, background: { top: '#16203a', bottom: '#070a14' }, text: { color: '#fff', plate: '#000', line: '#5cc8ff', accent: '#5cc8ff' }, lighting: 'key_rim_cool' as const, hook: 'x', beats: [], labels: {} };
const CLI = resolve(import.meta.dirname, 'fixtures/fake-remotion-cli.mjs');

describe('draft render: fake driver, probe, frames, real-driver protocol', () => {
  it('the fake draft is a 2 s 540×960 h264 yuv420p tv/bt709 MP4 that passes the draft probe; covers and 2× crops come out of it', async () => {
    const dir = tmp('vg-draft-');
    const progress: number[] = [];
    const out = await new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }).draft({ runDir: dir, props, glbPath: '', outPath: join(dir, 'r0', 'draft.mp4'), owner: 'x', onProgress: (d) => progress.push(d) });
    expect(out).toMatchObject({ frames: 60, concurrency: 1 });
    expect(progress).toEqual([30, 60]);
    const p = await probeVideo(FFMPEG, out.file);
    expect(p).toMatchObject({ codec: 'h264', width: 540, height: 960, pixFmt: 'yuv420p', colorRange: 'tv', colorSpace: 'bt709', fps: '30/1', frames: 60 });
    expect(p.durationS).toBeCloseTo(2, 1);
    expect(draftProbeErrors(p, { width: 540, height: 960, frames: 60 })).toEqual([]);
    await extractFrame(FFMPEG, out.file, join(dir, 'cover.png'), { t: 0, width: 270 });
    expect(size(join(dir, 'cover.png'))).toBe('270,480');
    await extractFrame(FFMPEG, out.file, join(dir, 'crop.png'), { t: 1, crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.25 } });
    expect(size(join(dir, 'crop.png'))).toBe('540,480');
  });

  it('rejects a full-range (yuvj420p / pc) or wrongly sized video with readable reasons', async () => {
    const f = join(tmp('vg-draft-'), 'bad.mp4');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=270x480:r=25', '-frames:v', '10', '-c:v', 'libx264', '-pix_fmt', 'yuvj420p', '-color_range', 'pc', f]);
    const errs = draftProbeErrors(await probeVideo(FFMPEG, f), { width: 540, height: 960, frames: 60 });
    expect(errs).toEqual(expect.arrayContaining([
      'pix_fmt yuvj420p (yuv420p olmalı)', 'color_range pc (tv olmalı)', 'boyut 270×480 (540×960 olmalı)', 'kare hızı 25/1 (30/1 olmalı)', 'kare sayısı 10 (60 olmalı)',
    ]));
  });

  it('the real driver runs the render child with a clean env, reports stages and progress, and retries a GPU failure once with concurrency 1', async () => {
    const data = tmp('vg-draft-data-');
    const audits: [string, Record<string, unknown>][] = [];
    const d = new BlenderRenderDriver({ blender: '/nonexistent', bwrap: '/nonexistent', dataDir: data, home: data, remotionCli: CLI, audit: async (a, x) => { audits.push([a, x]); } });
    const stages: string[] = [];
    const progress: number[] = [];
    const ok = await d.draft({ runDir: data, props, glbPath: '/dev/null', outPath: join(data, 'ok', 'draft.mp4'), owner: 'job', onStage: (s) => stages.push(s), onProgress: (n) => progress.push(n) });
    expect(ok).toMatchObject({ frames: 30, concurrency: 2 });
    expect([stages, progress]).toEqual([['bundle', 'frames'], [10, 20, 30]]);
    const env = JSON.parse(readFileSync(join(data, 'ok', 'draft.mp4.env.json'), 'utf8')) as string[];
    expect(env).toEqual(expect.arrayContaining(['HOME', 'PATH', 'TMPDIR']));
    expect(env.filter((k) => k.startsWith('VG_DATABASE') || k.includes('ANTHROPIC'))).toEqual([]);
    const gpu = await d.draft({ runDir: data, props, glbPath: '/dev/null', outPath: join(data, 'gpu', 'draft.mp4'), owner: 'job' });
    expect(gpu.concurrency).toBe(1);
    expect(audits.filter(([a]) => a === 'render.draft').map(([, x]) => [x.code, x.concurrency])).toEqual([[0, 2], [3, 2], [0, 1]]);
    await expect(d.draft({ runDir: data, props, glbPath: '/dev/null', outPath: join(data, 'fail', 'draft.mp4'), owner: 'job' })).rejects.toThrow(/taslak render başarısız \(kod 1\): Bundle failed/);
    expect(readdirSync(join(data, 'pids'))).toEqual([]);
  });

  it('startup recovery reaps an orphaned render-cli group (grilling C13)', async () => {
    const data = tmp('vg-reap-');
    const child = spawn('bash', ['-c', 'exec -a node-render-cli sleep 30'], { detached: true, stdio: 'ignore' });
    const exited = new Promise((res) => child.once('exit', res));
    await vi.waitFor(() => expect(readFileSync(`/proc/${child.pid}/cmdline`, 'utf8')).toContain('render-cli'));
    await writePidFile(data, child.pid!, 'step-1', 'render');
    expect(await reapOrphans(data)).toEqual([child.pid]);
    await exited;
    expect(groupAlive(child.pid!)).toBe(false);
    expect(existsSync(join(data, 'pids', `${child.pid}.json`))).toBe(false);
  });
});

