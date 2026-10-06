import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Storyboard } from '@videogen/shared';
import { setChannelStyle } from '@videogen/db';
import { SpecStore } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { FakeRenderDriver, type Capability } from '../src/render/driver.ts';
import { ResourceLocks } from '../src/render/locks.ts';
import { buildScene, previewFrames, previewScene, sceneToolHost, toToolResult, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
beforeEach(async () => { await t.pool.query("DELETE FROM settings WHERE key = 'channel.style'"); });

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));
let cap: Capability = { ok: true };
const deps = (o: Partial<SceneDeps> = {}): SceneDeps => ({ pool: t.pool, render: new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }), locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => cap, waitMs: 10, ...o });

async function runDir(o: { scene?: boolean; product?: string } = {}) {
  const run = mkdtempSync(join(tmpdir(), 'vg-scene-'));
  const specs = new SpecStore(join(run, 'spec'), ARTIFACT_VALIDATOR);
  await specs.write('storyboard', fx('storyboard-kalem'));
  if (o.scene !== false) await specs.write('scene', fx('scene-kalem'));
  mkdirSync(join(run, 'scene'), { recursive: true });
  if (o.product !== '') writeFileSync(join(run, 'scene', 'product.py'), o.product ?? 'def build(vg):\n    pass\n');
  return run;
}

describe('scene tools', () => {
  it('builds the latest scene spec, passes the anchor check and remembers the build for previews', async () => {
    cap = { ok: true };
    const run = await runDir();
    const b = await buildScene(deps(), { runDir: run, owner: 's1' });
    expect(b).toMatchObject({ ok: true, errors: [], specVersion: 1, styleId: 'gece_mavisi', equivalence: { pass: true } });
    expect(b.equivalence!.worst_px).toBeLessThan(0.1);
    expect(existsSync(b.files!.glb)).toBe(true);
    expect(JSON.parse(readFileSync(join(run, 'scene', 'builds', 'latest.json'), 'utf8')).specVersion).toBe(1);
    const tool = toToolResult(run, b);
    expect(tool.files!.glb).toMatch(/^scene\/builds\/b\d+\/scene\.glb$/);
  });

  it('explains what is missing: no scene spec, no product.py, a style that is not the channel style', async () => {
    cap = { ok: true };
    expect((await buildScene(deps(), { runDir: await runDir({ scene: false }), owner: 's' })).errors[0]).toMatch(/write_spec/);
    expect((await buildScene(deps(), { runDir: await runDir({ product: '' }), owner: 's' })).errors[0]).toMatch(/product\.py yok/);
    await setChannelStyle(t.pool, 'atolye');
    expect((await buildScene(deps(), { runDir: await runDir(), owner: 's' })).errors.join(' ')).toMatch(/style_id kanal kimliği "atolye"/);
  });

  it('passes product.py errors back and marks a missing render capability as not the agent\'s fault', async () => {
    cap = { ok: true };
    const bad = await buildScene(deps(), { runDir: await runDir({ product: "# vg-fake-error: product.py satır 2: ValueError: parça boş: yay\ndef build(vg):\n    pass\n" }), owner: 's' });
    expect(bad).toMatchObject({ ok: false, unavailable: false, errors: ['product.py satır 2: ValueError: parça boş: yay'] });
    cap = { ok: false, reason: 'bubblewrap çalışmıyor (EPERM)' };
    expect(await buildScene(deps(), { runDir: await runDir(), owner: 's' })).toMatchObject({ ok: false, unavailable: true, errors: ['render kullanılamıyor: bubblewrap çalışmıyor (EPERM)'] });
    cap = { ok: true };
  });

  it('previews frame 0 and the beat midpoints, at most eight', () => {
    const board: Storyboard = fx('storyboard-kalem');
    expect(previewFrames(board, 1350)).toEqual([0, 45, 180, 375, 600, 840, 1080, 1275]);
    expect(previewFrames(board, 1350, 4)).toEqual([0, 180, 840, 1275]);
  });

  it('renders previews under the GPU lock: waits its turn, reports the queue, then makes the contact sheet', async () => {
    cap = { ok: true };
    const d = deps();
    const run = await runDir();
    expect((await buildScene(d, { runDir: run, owner: 's1' })).ok).toBe(true);
    const release = await d.locks.acquire('gpu', 'another-run');
    const waits: unknown[] = [];
    let ran = false;
    const p = previewScene(d, { runDir: run, owner: 's1', onWait: (w) => waits.push(w), onRun: () => { ran = true; } });
    await new Promise((r) => setTimeout(r, 30));
    expect(waits).toEqual([{ position: 1 }]);
    expect(ran).toBe(false);
    release();
    const r = await p;
    expect(r.stills).toHaveLength(8);
    expect(existsSync(r.sheet)).toBe(true);
    const ac = new AbortController();
    const hold = await d.locks.acquire('gpu', 'x');
    const aborted = previewScene(d, { runDir: run, owner: 's2', signal: ac.signal });
    ac.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    hold();
  });

  it('gives the scene tools only to the builder of a run, with run-relative paths', async () => {
    cap = { ok: true };
    const host = sceneToolHost(deps());
    const base = { sessionId: 's', runDir: '/x', signal: new AbortController().signal, gpuWait: () => {} };
    expect(host.ports({ ...base, role: 'chat', runId: null, stepId: null })).toEqual({});
    expect(host.ports({ ...base, role: 'storyboarder', runId: 'r', stepId: 's' })).toEqual({});
    const run = await runDir();
    const ports = host.ports({ ...base, runDir: run, role: 'builder', runId: 'r', stepId: 's' });
    const r = await ports.buildScene!();
    expect(r.ok).toBe(true);
    expect(Object.values(r.files!).every((p) => p.startsWith('scene/builds/'))).toBe(true);
    const gpu: unknown[] = [];
    const sheet = await sceneToolHost(deps()).ports({ ...base, runDir: run, role: 'builder', runId: 'r', stepId: 's', gpuWait: (w) => gpu.push(w) }).previewStills!({ frames: [0, 9999] });
    expect(sheet.stills).toHaveLength(1);
    expect(sheet.contact_sheet).toMatch(/^scene\/builds\/b\d+\/stills-\d+\/preview\.png$/);
    expect(gpu).toEqual([null]); // free GPU: no wait, only the "running" signal
  });
});
