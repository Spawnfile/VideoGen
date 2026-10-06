import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, EQUIVALENCE_FRAMES } from '@videogen/shared';
import { checkEquivalence, parseGlb } from '@videogen/scene3d';
import { BlenderRenderDriver, PYTHON_DIR } from '../src/render/driver.ts';
import { runProcess } from '../src/render/process.ts';
import { sandboxArgv } from '../src/render/sandbox.ts';

const BLENDER = process.env.VG_BLENDER ?? join(homedir(), 'apps/blender-5.2.2-linux-x64/blender');
const BWRAP = process.env.VG_BWRAP ?? '/usr/bin/bwrap';
const FX = resolve(import.meta.dirname, '../../../tests/fixtures/artifacts');
// Under the real home like ~/videogen-data/runs: the sandbox hides $HOME and re-binds only the run directory.
const DATA = mkdtempSync(join(homedir(), '.vg-render-test-'));
afterAll(() => rmSync(DATA, { recursive: true, force: true }));

function runDir(product = join(PYTHON_DIR, 'examples/kalem/product.py')) {
  const run = mkdtempSync(join(DATA, 'run-'));
  mkdirSync(join(run, 'scene'), { recursive: true });
  copyFileSync(join(FX, 'scene-kalem.json'), join(run, 'scene', 'spec.json'));
  copyFileSync(join(FX, 'storyboard-kalem.json'), join(run, 'scene', 'storyboard.json'));
  copyFileSync(product, join(run, 'scene', 'product.py'));
  return run;
}
const input = (run: string) => ({
  runDir: run, specPath: join(run, 'scene/spec.json'), storyboardPath: join(run, 'scene/storyboard.json'), productPath: join(run, 'scene/product.py'),
  outDir: join(run, 'scene/build'), style: CHANNEL_STYLES.gece_mavisi, owner: 'test',
});
/** pids whose command line mentions `needle` (not `pgrep -f`: it would match the shell that runs it). */
function processesMentioning(needle: string): number[] {
  return readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number).filter((pid) => {
    try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(needle); } catch { return false; }
  });
}
const driver = (o: Partial<ConstructorParameters<typeof BlenderRenderDriver>[0]> = {}) => new BlenderRenderDriver({ blender: BLENDER, bwrap: BWRAP, dataDir: DATA, home: homedir(), ...o });

describe('BlenderRenderDriver (real bubblewrap + Blender)', () => {
  it('passes the startup capability check on this machine', async () => {
    expect(await driver().capabilities()).toEqual({ ok: true });
  });

  it('builds the example pen in the sandbox; Blender and three.js agree within 8 px; previews render on the NVIDIA GPU', async () => {
    const run = runDir();
    const b = await driver().build(input(run));
    expect(b.report.ok, b.report.errors.join('; ')).toBe(true);
    const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
    const eq = checkEquivalence(await parseGlb(readFileSync(b.files!.glb)), json(b.files!.anchors), json(b.files!.cameraTrack), EQUIVALENCE_FRAMES(1350));
    expect(eq.pass, JSON.stringify(eq.rows.filter((r) => r.px > 8))).toBe(true);
    const progress: number[] = [];
    const s = await driver().stills({ runDir: run, blendPath: b.files!.blend, frames: [0, 675], outDir: join(run, 'scene/stills'), scale: 25, samples: 4, owner: 'test', onProgress: (d) => progress.push(d) });
    expect(s.renderer).toContain('NVIDIA');
    expect(progress).toEqual([1, 2]);
    expect(s.files.every((f) => existsSync(f))).toBe(true);
  });

  it('the sandbox has no network, no home directory and only the run directory is writable', async () => {
    const run = runDir();
    const probe = join(run, 'probe.py');
    writeFileSync(probe, [
      'import os, socket',
      'out = []',
      'try:\n    socket.create_connection(("1.1.1.1", 80), timeout=2); out.append("net:open")\nexcept OSError:\n    out.append("net:blocked")',
      `out.append("ssh:" + str(os.path.exists(${JSON.stringify(join(homedir(), '.ssh'))})))`,
      `out.append("repo:" + str(os.path.exists(${JSON.stringify(resolve(PYTHON_DIR, '../../package.json'))})))`,
      'try:\n    open("/usr/x", "w"); out.append("root:writable")\nexcept OSError:\n    out.append("root:readonly")',
      `open(${JSON.stringify(join(run, 'ok.txt'))}, "w").write("ok")`,
      'print(" ".join(out))',
    ].join('\n'));
    const { file, args } = sandboxArgv({ bwrap: BWRAP, home: homedir(), runDir: run, roBinds: [], gpu: false }, ['/usr/bin/python3', probe]);
    const lines: string[] = [];
    const r = await runProcess(file, args, { cwd: run, dataDir: DATA, owner: 'test', timeoutMs: 20_000, onLine: (l) => lines.push(l) });
    expect(r.code).toBe(0);
    expect(lines.join(' ')).toBe('net:blocked ssh:False repo:False root:readonly');
    expect(readFileSync(join(run, 'ok.txt'), 'utf8')).toBe('ok');
  });

  it('a product.py that never returns is stopped by the phase timeout', async () => {
    const run = runDir();
    writeFileSync(join(run, 'scene/product.py'), 'def build(vg):\n    while True:\n        pass\n');
    await expect(driver({ phaseTimeoutMs: 4000 }).build(input(run))).rejects.toMatchObject({ name: 'RenderError', kind: 'timeout' });
    expect(processesMentioning(run)).toEqual([]);
  });
});
