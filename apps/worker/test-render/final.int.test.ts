import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHANNEL_STYLES } from '@videogen/shared';
import { BlenderRenderDriver, PYTHON_DIR } from '../src/render/driver.ts';
import { missingFrames } from '../src/render/frames.ts';

const BLENDER = process.env.VG_BLENDER ?? join(homedir(), 'apps/blender-5.2.2-linux-x64/blender');
const FX = resolve(import.meta.dirname, '../../../tests/fixtures/artifacts');
// Under the real home like ~/videogen-data/runs: the sandbox hides $HOME and re-binds only the run directory.
const DATA = mkdtempSync(join(homedir(), '.vg-render-test-'));
afterAll(() => rmSync(DATA, { recursive: true, force: true }));

describe('Blender final render (real GPU)', () => {
  it('renders frames 0–4 of the built pen at full size as RGBA PNGs on NVIDIA and resumes', async () => {
    const run = mkdtempSync(join(DATA, 'run-'));
    mkdirSync(join(run, 'scene'), { recursive: true });
    copyFileSync(join(FX, 'scene-kalem.json'), join(run, 'scene', 'spec.json'));
    copyFileSync(join(FX, 'storyboard-kalem.json'), join(run, 'scene', 'storyboard.json'));
    copyFileSync(join(PYTHON_DIR, 'examples/kalem/product.py'), join(run, 'scene', 'product.py'));
    const d = new BlenderRenderDriver({ blender: BLENDER, bwrap: process.env.VG_BWRAP ?? '/usr/bin/bwrap', dataDir: DATA, home: homedir() });
    const b = await d.build({
      runDir: run, specPath: join(run, 'scene/spec.json'), storyboardPath: join(run, 'scene/storyboard.json'), productPath: join(run, 'scene/product.py'),
      outDir: join(run, 'scene/build'), style: CHANNEL_STYLES.gece_mavisi, owner: 'int',
    });
    expect(b.report.ok).toBe(true);
    const out = join(run, 'final', 'frames');
    const r = await d.final({ runDir: run, blendPath: b.files!.blend, outDir: out, lastFrame: 4, owner: 'int' });
    expect(r).toMatchObject({ frames: 5, skipped: 0, samples: 64 });
    expect(r.renderer).toContain('NVIDIA');
    expect(missingFrames(out, 4)).toEqual([]);
    const png = readFileSync(join(out, 'f00000.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1080, 1920, 6]); // IHDR: width, height, colour type 6 = RGBA
    expect((await d.final({ runDir: run, blendPath: b.files!.blend, outDir: out, lastFrame: 4, owner: 'int' })).skipped).toBe(5);
    console.log(`final render: 5 kare ${r.ms} ms`);
  }, 600_000);
});
