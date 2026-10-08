import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, renderStill as remotionStill, selectComposition } from '@remotion/renderer';
import { bundleHash, DRAFT_RENDER, FINAL_MASTER } from './hash.ts';
import { DRAFT_COMPOSITION, FINAL_COMPOSITION, type DraftProps, type FinalProps } from './props.ts';
import { SAFE_AREA_CARD } from './SafeAreaCard.tsx';

export { SAFE_AREA_CARD };

export const DRAFT_ENTRY = resolve(import.meta.dirname, 'entry.ts');
const GL_MODES = ['angle', 'swangle', 'egl', 'swiftshader', 'vulkan', 'angle-egl'] as const;
export type GlMode = (typeof GL_MODES)[number];
/** VG_REMOTION_GL: a GPU-less machine (CI, a cloud container) can pick `swangle` (SwiftShader); the laptop keeps the ANGLE default. */
const glMode = (v = process.env.VG_REMOTION_GL): GlMode => (GL_MODES as readonly string[]).includes(v ?? '') ? (v as GlMode) : 'angle';
/** M4b probe P3: the system Chrome as "chrome-for-testing", ANGLE GL; no browser download. */
export const CHROME = { browserExecutable: process.env.VG_CHROME ?? '/usr/bin/google-chrome', chromeMode: 'chrome-for-testing' as const, gl: glMode() };

/**
 * Plan C15: one bundle per template hash under `cacheRoot` (<dataDir>/cache/remotion). Built into a temp dir and renamed, so a
 * half-written bundle is never served; older bundles are pruned (the newest other one is kept).
 */
export async function ensureBundle(cacheRoot: string, onProgress?: (pct: number) => void): Promise<string> {
  const hash = bundleHash();
  const dir = join(cacheRoot, hash);
  if (!existsSync(join(dir, 'index.html'))) {
    await mkdir(cacheRoot, { recursive: true });
    const tmp = `${dir}.tmp-${randomBytes(4).toString('hex')}`;
    await bundle({ entryPoint: DRAFT_ENTRY, outDir: tmp, onProgress });
    if (existsSync(join(dir, 'index.html'))) await rm(tmp, { recursive: true, force: true });
    else await rename(tmp, dir);
  }
  const others = readdirSync(cacheRoot).filter((d) => d !== hash && !d.includes('.tmp-'))
    .map((d) => ({ d, at: statSync(join(cacheRoot, d)).mtimeMs })).sort((a, b) => b.at - a.at);
  for (const o of others.slice(1)) await rm(join(cacheRoot, o.d), { recursive: true, force: true });
  return dir;
}

/**
 * Plan C14 / E7: one random 32-hex token path on 127.0.0.1 serving the GLB and (final) the frame PNGs by exact name; GET only,
 * everything else 404, CORS open for the bundle's own origin. Closed by the caller when the render ends.
 */
export async function serveOnce(o: { glbPath: string; framesDir?: string }): Promise<{ base: string; close: () => void }> {
  const glb = await readFile(o.glbPath);
  const token = randomBytes(16).toString('hex');
  const frame = new RegExp(`^/${token}/frames/(f\\d{5}\\.png)$`);
  const server = createServer((req, res) => {
    const cors = { 'access-control-allow-origin': '*' };
    if (req.method === 'GET' && req.url === `/${token}/scene.glb`) {
      res.writeHead(200, { ...cors, 'content-type': 'model/gltf-binary', 'content-length': glb.length });
      res.end(glb);
      return;
    }
    const m = req.method === 'GET' && o.framesDir ? frame.exec(req.url ?? '') : null;
    if (m) {
      readFile(join(o.framesDir!, m[1]!)).then(
        (png) => { res.writeHead(200, { ...cors, 'content-type': 'image/png', 'content-length': png.length }); res.end(png); },
        () => res.writeHead(404).end(),
      );
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/${token}`, close: () => server.close() };
}

interface RenderRun { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; onStage?: (stage: 'bundle' | 'browser' | 'frames') => void; frameRange?: [number, number]; concurrency?: number; gl?: GlMode }
type Params = { codec: 'h264'; crf: number; x264Preset: string; pixelFormat: string; colorSpace: string };

/** One Remotion render: the cached bundle, system Chrome, the composition sized by its props, silent, cancellable. */
async function renderComposition(id: string, inputProps: Record<string, unknown>, params: Params, cacheRoot: string, out: string, o: RenderRun): Promise<{ frames: number; ms: number }> {
  o.onStage?.('bundle');
  const serveUrl = await ensureBundle(cacheRoot);
  const { cancelSignal, cancel } = makeCancelSignal();
  const onAbort = () => cancel();
  o.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const common = { serveUrl, inputProps, browserExecutable: CHROME.browserExecutable, chromeMode: CHROME.chromeMode, chromiumOptions: { gl: o.gl ?? CHROME.gl } };
    o.onStage?.('browser');
    const composition = await selectComposition({ ...common, id });
    const total = o.frameRange ? o.frameRange[1] - o.frameRange[0] + 1 : composition.durationInFrames;
    o.onStage?.('frames');
    const t0 = Date.now();
    await renderMedia({
      ...common, composition, codec: params.codec, crf: params.crf, x264Preset: params.x264Preset as 'fast', pixelFormat: params.pixelFormat as 'yuv420p',
      colorSpace: params.colorSpace as 'bt709', muted: true, outputLocation: out, concurrency: o.concurrency ?? 2, frameRange: o.frameRange ?? null, cancelSignal,
      onProgress: ({ renderedFrames }) => o.onProgress?.(renderedFrames, total),
    });
    return { frames: total, ms: Date.now() - t0 };
  } finally {
    o.signal?.removeEventListener('abort', onAbort);
  }
}

export interface DraftRenderOptions extends RenderRun { props: Omit<DraftProps, 'glbUrl'>; glbPath: string; out: string; cacheRoot: string }

/** Spec §7.5 / plan C12–C14: the draft MP4 (h264, yuv420p, bt709, silent). */
export async function renderDraftVideo(o: DraftRenderOptions): Promise<{ frames: number; ms: number }> {
  const s = await serveOnce({ glbPath: o.glbPath });
  try {
    return await renderComposition(DRAFT_COMPOSITION, { ...o.props, glbUrl: `${s.base}/scene.glb` }, DRAFT_RENDER, o.cacheRoot, o.out, o);
  } finally {
    s.close();
  }
}

export interface FinalRenderOptions extends RenderRun { props: Omit<FinalProps, 'glbUrl' | 'framesUrl'>; glbPath: string; framesDir: string; out: string; cacheRoot: string }

/** Spec §7.1 step 8 / plan E7–E8: Final3D over the Blender frames → the silent master (CRF 14); the delivery encode follows in ffmpeg. */
export async function renderFinalVideo(o: FinalRenderOptions): Promise<{ frames: number; ms: number }> {
  const s = await serveOnce({ glbPath: o.glbPath, framesDir: o.framesDir });
  try {
    return await renderComposition(FINAL_COMPOSITION, { ...o.props, glbUrl: `${s.base}/scene.glb`, framesUrl: `${s.base}/frames` }, FINAL_MASTER, o.cacheRoot, o.out, o);
  } finally {
    s.close();
  }
}

export interface StillOptions { composition: string; props: Record<string, unknown>; frame: number; out: string; cacheRoot: string; gl?: GlMode }

/** Plan M7 Y17: one frame of a composition as a PNG — the cached bundle, the same system Chrome and VG_REMOTION_GL mode as the videos. */
export async function renderStill(o: StillOptions): Promise<{ out: string; ms: number }> {
  const serveUrl = await ensureBundle(o.cacheRoot);
  const common = { serveUrl, inputProps: o.props, browserExecutable: CHROME.browserExecutable, chromeMode: CHROME.chromeMode, chromiumOptions: { gl: o.gl ?? CHROME.gl } };
  const composition = await selectComposition({ ...common, id: o.composition });
  await mkdir(dirname(o.out), { recursive: true });
  const t0 = Date.now();
  await remotionStill({ ...common, composition, frame: o.frame, output: o.out, imageFormat: 'png', overwrite: true });
  return { out: o.out, ms: Date.now() - t0 };
}

/** The calibration card is uploaded to TikTok by hand (Y16): an ordinary h264 / yuv420p / bt709 file, silent. */
const CARD_RENDER: Params = { codec: 'h264', crf: 18, x264Preset: 'medium', pixelFormat: 'yuv420p', colorSpace: 'bt709' };

/** Plan M7 Y16: `<outDir>/safe-area-card.png` (frame 0, renderStill) and `<outDir>/safe-area-card.mp4` (5 s, 1080×1920). */
export async function renderSafeAreaCard(o: { outDir: string; cacheRoot: string; gl?: GlMode }): Promise<{ png: string; mp4: string; stillMs: number; videoMs: number }> {
  const png = join(o.outDir, 'safe-area-card.png');
  const mp4 = join(o.outDir, 'safe-area-card.mp4');
  const still = await renderStill({ composition: SAFE_AREA_CARD, props: {}, frame: 0, out: png, cacheRoot: o.cacheRoot, ...(o.gl ? { gl: o.gl } : {}) });
  const video = await renderComposition(SAFE_AREA_CARD, {}, CARD_RENDER, o.cacheRoot, mp4, o.gl ? { gl: o.gl } : {});
  return { png, mp4, stillMs: still.ms, videoMs: video.ms };
}
