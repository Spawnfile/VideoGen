import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serveOnce } from '@videogen/remotion/render';
import { FakeRenderDriver } from '../src/render/driver.ts';
import { probeVideo } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const tmp = () => mkdtempSync(join(tmpdir(), 'vg-compose-'));

// Real ffmpeg under parallel files (plan M7 Y2): at least 60 s per test.
describe('final compose: frame server and the fake compose', { timeout: 60_000 }, () => {
  it('serves the GLB and exact frame names under one random token; everything else is 404', async () => {
    const d = tmp();
    mkdirSync(join(d, 'frames'));
    writeFileSync(join(d, 'scene.glb'), 'glb');
    writeFileSync(join(d, 'frames', 'f00003.png'), 'png');
    writeFileSync(join(d, 'secret.txt'), 'no');
    const s = await serveOnce({ glbPath: join(d, 'scene.glb'), framesDir: join(d, 'frames') });
    try {
      expect(s.base).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}$/);
      const get = async (path: string, method = 'GET') => { const r = await fetch(`${s.base}${path}`, { method }); return [r.status, r.status === 200 ? await r.text() : ''] as const; };
      expect(await get('/scene.glb')).toEqual([200, 'glb']);
      expect(await get('/frames/f00003.png')).toEqual([200, 'png']);
      expect((await fetch(`${s.base}/frames/f00003.png`)).headers.get('content-type')).toBe('image/png');
      for (const bad of ['/frames/f3.png', '/frames/f00004.png', '/frames/..%2Fsecret.txt', '/frames/../secret.txt', '/secret.txt']) expect((await get(bad))[0]).toBe(404);
      expect((await get('/scene.glb', 'POST'))[0]).toBe(404);
      expect((await fetch(s.base.replace(/[0-9a-f]{32}$/, '0'.repeat(32)) + '/scene.glb')).status).toBe(404);
    } finally {
      s.close();
    }
  });

  it('the fake compose writes a 1080×1920 30 fps master with frames + 1 frames', async () => {
    const out = join(tmp(), 'master.mp4');
    const seen: number[] = [];
    const r = await new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }).compose({
      runDir: tmp(), props: { frames: 89 } as never, glbPath: '/x.glb', framesDir: '/x', outPath: out, owner: 'o', onProgress: (n) => seen.push(n),
    });
    expect(r).toMatchObject({ file: out, frames: 90 });
    const p = await probeVideo(FFMPEG, out);
    expect([p.width, p.height, p.fps, p.frames, p.codec, p.pixFmt]).toEqual([1080, 1920, '30/1', 90, 'h264', 'yuv420p']);
    expect(seen.at(-1)).toBe(90);
  });
});
