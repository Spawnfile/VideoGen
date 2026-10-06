import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dirname);
const SCENE3D = resolve(import.meta.dirname, '../../scene3d/src');
const PKG = resolve(import.meta.dirname, '../package.json');
/** Node-only files: they are not part of the browser bundle, so editing them must not invalidate drafts. */
const NODE_ONLY = new Set(['hash.ts', 'render.ts', 'render-cli.ts']);

/** Fixed draft render parameters (plan C12); part of the §8.3 input hash. */
export const DRAFT_RENDER = { width: 540, height: 960, fps: 30, codec: 'h264', crf: 18, x264Preset: 'veryfast', pixelFormat: 'yuv420p', colorSpace: 'bt709' } as const;

const sources = (dir: string, skip = new Set<string>()) =>
  (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f) && !skip.has(f)).sort();

/**
 * Spec §8.3 / plan C15: the template's identity — every source file that ends up in the Remotion bundle (this package and
 * packages/scene3d) plus the pinned dependency versions. Names the bundle cache directory and enters the draft's input hash.
 */
export function bundleHash(): string {
  const h = createHash('sha256');
  for (const [tag, dir, files] of [['remotion', SRC, sources(SRC, NODE_ONLY)], ['scene3d', SCENE3D, sources(SCENE3D)]] as const) {
    for (const f of files) {
      h.update(`${tag}/${f}\n`);
      h.update(readFileSync(join(dir, f)));
    }
  }
  h.update(JSON.stringify((JSON.parse(readFileSync(PKG, 'utf8')) as { dependencies: unknown }).dependencies));
  return h.digest('hex').slice(0, 16);
}
