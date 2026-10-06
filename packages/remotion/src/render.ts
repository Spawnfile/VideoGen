import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { bundleHash, DRAFT_RENDER } from './hash.ts';
import { DRAFT_COMPOSITION, type DraftProps } from './props.ts';

export const DRAFT_ENTRY = resolve(import.meta.dirname, 'entry.ts');
const GL_MODES = ['angle', 'swangle', 'egl', 'swiftshader', 'vulkan', 'angle-egl'] as const;
type GlMode = (typeof GL_MODES)[number];
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

export interface DraftRenderOptions {
  props: Omit<DraftProps, 'glbUrl'>;
  glbPath: string;
  out: string;
  cacheRoot: string;
  concurrency?: number;
  /** Tests: render only these frames. */
  frameRange?: [number, number];
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  onStage?: (stage: 'bundle' | 'browser' | 'frames') => void;
}

/**
 * Spec §7.5 / plan C12–C14: renders the draft MP4 (h264, yuv420p, bt709, silent). The GLB is served once from 127.0.0.1 under a
 * random 32-hex token path (GET only, everything else 404, CORS open for the bundle's own origin) and the server closes afterwards.
 */
export async function renderDraftVideo(o: DraftRenderOptions): Promise<{ frames: number; ms: number }> {
  o.onStage?.('bundle');
  const serveUrl = await ensureBundle(o.cacheRoot);
  const glb = await readFile(o.glbPath);
  const token = randomBytes(16).toString('hex');
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === `/${token}/scene.glb`) {
      res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': glb.length, 'access-control-allow-origin': '*' });
      res.end(glb);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { cancelSignal, cancel } = makeCancelSignal();
  const onAbort = () => cancel();
  o.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const inputProps: DraftProps = { ...o.props, glbUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/${token}/scene.glb` };
    const common = { serveUrl, inputProps, browserExecutable: CHROME.browserExecutable, chromeMode: CHROME.chromeMode, chromiumOptions: { gl: CHROME.gl } };
    o.onStage?.('browser');
    const composition = await selectComposition({ ...common, id: DRAFT_COMPOSITION });
    const total = o.frameRange ? o.frameRange[1] - o.frameRange[0] + 1 : composition.durationInFrames;
    o.onStage?.('frames');
    const t0 = Date.now();
    await renderMedia({
      ...common, composition, codec: DRAFT_RENDER.codec, crf: DRAFT_RENDER.crf, x264Preset: DRAFT_RENDER.x264Preset, pixelFormat: DRAFT_RENDER.pixelFormat,
      colorSpace: DRAFT_RENDER.colorSpace, muted: true, outputLocation: o.out, concurrency: o.concurrency ?? 2, frameRange: o.frameRange ?? null, cancelSignal,
      onProgress: ({ renderedFrames }) => o.onProgress?.(renderedFrames, total),
    });
    return { frames: total, ms: Date.now() - t0 };
  } finally {
    o.signal?.removeEventListener('abort', onAbort);
    server.close();
  }
}
