import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BuildReportSchema, type BuildReport, type ChannelStyle } from '@videogen/shared';
import type { DraftProps } from '@videogen/remotion/props';
import { fakeDraft, fakeFrames, ffmpegWorks, testStill } from './ffmpeg.ts';
import { missingFrames } from './frames.ts';
import { runProcess, type ProcResult } from './process.ts';
import { sandboxArgv, sandboxWorks } from './sandbox.ts';

export const PYTHON_DIR = resolve(import.meta.dirname, '../../../../python/vg_blender');
export const SCENE_FIXTURES = resolve(import.meta.dirname, '../../../../tests/fixtures/scene/kalem');
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
/** Plan C13: the Remotion render runs in this child process (Chrome dies with its process group). */
export const REMOTION_CLI = resolve(REPO_ROOT, 'packages/remotion/src/render-cli.ts');

export interface BuildInput {
  runDir: string;
  /** All inside runDir (the sandbox can only see and write the run directory). */
  specPath: string;
  storyboardPath: string;
  productPath: string;
  outDir: string;
  style: ChannelStyle;
  owner: string;
  signal?: AbortSignal;
}
export interface BuildFiles { blend: string; glb: string; anchors: string; events: string; cameraTrack: string; report: string }
export interface BuildOutput { report: BuildReport; files: BuildFiles | null; ms: number }
export interface StillsInput { runDir: string; blendPath: string; frames: number[]; outDir: string; scale?: number; samples?: number; owner: string; signal?: AbortSignal; onProgress?: (done: number, total: number) => void }
export interface StillsOutput { files: string[]; renderer: string; ms: number }
export interface DraftInput {
  runDir: string;
  props: Omit<DraftProps, 'glbUrl'>;
  glbPath: string;
  outPath: string;
  owner: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Bundling and Chrome start-up before the first frame (plan: the step says what it is doing). */
  onStage?: (stage: string) => void;
  /** Tests: render only these frames. */
  frameRange?: [number, number];
}
export interface DraftOutput { file: string; frames: number; ms: number; concurrency: number }
export interface FinalInput {
  runDir: string;
  /** Inside runDir (the sandbox sees only the run directory): the step copies the scene .blend there. */
  blendPath: string;
  outDir: string;
  lastFrame: number;
  owner: string;
  /** Default: the .blend's own (64). */
  samples?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}
export interface FinalOutput { dir: string; frames: number; skipped: number; samples: number; renderer: string; ms: number }

/** Spec §14 (plan E5): the default samples first; after a crash the remaining frames once more with 32 (frames already done are kept). */
export async function retryFinal(once: (samples: number | null) => Promise<FinalOutput | null>, samples?: number): Promise<FinalOutput> {
  const out = (await once(samples ?? null)) ?? (await once(32));
  if (!out) throw new RenderError('gpu', 'final render iki kez çöktü (varsayılan ve 32 örnek)');
  return out;
}
export type Capability = { ok: true } | { ok: false; reason: string };

/** A render job that could not finish (not a product.py problem: those come back as report.ok = false). */
export class RenderError extends Error {
  constructor(readonly kind: 'timeout' | 'memory' | 'aborted' | 'crash' | 'gpu' | 'unavailable', message: string) {
    super(message);
    this.name = 'RenderError';
  }
}

export interface RenderDriver {
  readonly kind: 'real' | 'fake';
  capabilities(): Promise<Capability>;
  /** Spec §7.3 build_scene: phase 1 (product.py → geometry) then phase 2 (keys, light, manifests, checks, GLB). CPU only. */
  build(i: BuildInput): Promise<BuildOutput>;
  /** Spec §7.5 Blender preview stills. GPU. */
  stills(i: StillsInput): Promise<StillsOutput>;
  /** Spec §7.1 step 5: the Three.js-in-Remotion draft MP4. GPU (the caller holds the lock). */
  draft(i: DraftInput): Promise<DraftOutput>;
  /** Spec §7.1 step 7: Blender EEVEE RGBA PNG frames 0…lastFrame, resumable. GPU (the caller holds the lock). */
  final(i: FinalInput): Promise<FinalOutput>;
}

export type RenderAudit = (action: string, data: Record<string, unknown>) => Promise<void>;

export interface BlenderDriverOptions {
  blender: string;
  bwrap: string;
  dataDir: string;
  home: string;
  pythonDir?: string;
  phaseTimeoutMs?: number;
  stillsTimeoutMs?: number;
  maxRssMb?: number;
  audit?: RenderAudit;
  /** Draft render child (default REMOTION_CLI), its time limit and the RSS of its group (Chrome included). */
  remotionCli?: string;
  draftTimeoutMs?: number;
  draftMaxRssMb?: number;
  /** Final render (spec §7.5, plan E5): 2 h and 6 GB by default. */
  finalTimeoutMs?: number;
  finalMaxRssMb?: number;
}

/** Grilling C13: runProcess starts from an empty env; the render child needs PATH (node, Chrome), HOME and TMPDIR. */
const draftEnv = (): NodeJS.ProcessEnv => ({ PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: homedir(), TMPDIR: tmpdir(), LANG: 'C.UTF-8', ...(process.env.VG_CHROME ? { VG_CHROME: process.env.VG_CHROME } : {}), ...(process.env.VG_REMOTION_GL ? { VG_REMOTION_GL: process.env.VG_REMOTION_GL } : {}) });

const stoppedError = (r: ProcResult, what: string): RenderError | null => {
  if (r.stopped === 'timeout') return new RenderError('timeout', `${what} zaman aşımına uğradı`);
  if (r.stopped === 'memory') return new RenderError('memory', `${what} bellek sınırını aştı`);
  if (r.stopped === 'aborted') return new RenderError('aborted', `${what} durduruldu`);
  return null;
};

export class BlenderRenderDriver implements RenderDriver {
  readonly kind = 'real' as const;
  private readonly py: string;
  constructor(private readonly o: BlenderDriverOptions) { this.py = o.pythonDir ?? PYTHON_DIR; }

  async capabilities(): Promise<Capability> {
    if (!existsSync(this.o.blender)) return { ok: false, reason: `Blender bulunamadı (${this.o.blender.split('/').at(-1)})` };
    return sandboxWorks(this.o.bwrap);
  }

  /** --disable-autoexec always: phase 2 and renders open a .blend that agent code produced (scripts and drivers must not run). */
  private blenderArgs(script: string, rest: string[]): string[] {
    return [this.o.blender, '-b', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '-P', join(this.py, script), '--', ...rest];
  }

  private async sandboxed(i: { runDir: string; owner: string; signal?: AbortSignal; gpu: boolean; timeoutMs: number; maxRssMb?: number; onLine?: (l: string) => void }, cmd: string[]) {
    const blenderDir = resolve(this.o.blender, '..');
    const { file, args } = sandboxArgv({
      bwrap: this.o.bwrap, home: this.o.home, runDir: i.runDir, roBinds: [blenderDir, this.py], gpu: i.gpu,
      persistentHome: i.gpu ? join(this.o.dataDir, 'cache', 'blender-home') : undefined,
    }, cmd);
    if (i.gpu) await mkdir(join(this.o.dataDir, 'cache', 'blender-home'), { recursive: true });
    return runProcess(file, args, { cwd: i.runDir, dataDir: this.o.dataDir, owner: i.owner, signal: i.signal, timeoutMs: i.timeoutMs, maxRssMb: i.maxRssMb ?? this.o.maxRssMb ?? 4096, onLine: i.onLine });
  }

  async build(i: BuildInput): Promise<BuildOutput> {
    const t0 = Date.now();
    await mkdir(i.outDir, { recursive: true });
    const style = join(i.outDir, 'style.json');
    await writeFile(style, JSON.stringify(i.style));
    const blend = join(i.outDir, 'product.blend');
    const phase = async (name: 'product' | 'scene', rest: string[], reportPath: string): Promise<BuildReport> => {
      const r = await this.sandboxed({ ...i, gpu: false, timeoutMs: this.o.phaseTimeoutMs ?? 120_000 }, this.blenderArgs('build_cli.py', [name, ...rest, '--report', reportPath]));
      await this.o.audit?.(`render.build_${name}`, { ms: r.ms, code: r.code, stopped: r.stopped });
      const stop = stoppedError(r, name === 'product' ? 'product.py çalıştırması' : 'sahne kurulumu');
      if (stop) throw stop;
      const parsed = r.code === 0 ? BuildReportSchema.safeParse(JSON.parse(await readFile(reportPath, 'utf8').catch(() => 'null'))) : null;
      if (!parsed?.success) throw new RenderError('crash', `Blender ${name} aşaması rapor üretmeden bitti (kod ${r.code ?? r.signal})`);
      return parsed.data;
    };
    const p1 = await phase('product', ['--spec', i.specPath, '--product', i.productPath, '--out-blend', blend], join(i.outDir, 'product.json'));
    if (!p1.ok) return { report: p1, files: null, ms: Date.now() - t0 };
    const report = await phase('scene', ['--spec', i.specPath, '--storyboard', i.storyboardPath, '--style', style, '--blend', blend, '--out', i.outDir], join(i.outDir, 'build.json'));
    const files = report.ok ? {
      blend: join(i.outDir, 'scene.blend'), glb: join(i.outDir, 'scene.glb'), anchors: join(i.outDir, 'anchors.json'),
      events: join(i.outDir, 'events.json'), cameraTrack: join(i.outDir, 'camera_track.json'), report: join(i.outDir, 'build.json'),
    } : null;
    return { report, files, ms: Date.now() - t0 };
  }

  async stills(i: StillsInput): Promise<StillsOutput> {
    await mkdir(i.outDir, { recursive: true });
    let renderer = '';
    let gpuError = '';
    const r = await this.sandboxed({
      ...i, gpu: true, timeoutMs: this.o.stillsTimeoutMs ?? 180_000,
      onLine: (l) => {
        const p = /^VG_PROGRESS (\d+) (\d+)$/.exec(l);
        if (p) i.onProgress?.(Number(p[1]), Number(p[2]));
        if (l.startsWith('VG_RENDERER ')) renderer = l.slice(12).trim();
        if (l.startsWith('VG_ERROR ')) gpuError = l.slice(9).trim();
      },
    }, this.blenderArgs('render_cli.py', ['--blend', i.blendPath, '--frames', i.frames.join(','), '--out', i.outDir, '--scale', String(i.scale ?? 50), '--samples', String(i.samples ?? 16)]));
    await this.o.audit?.('render.stills', { ms: r.ms, code: r.code, stopped: r.stopped, frames: i.frames.length, renderer });
    const stop = stoppedError(r, 'önizleme render\'ı');
    if (stop) throw stop;
    if (r.code === 3) throw new RenderError('gpu', gpuError || 'GPU NVIDIA değil');
    if (r.code !== 0) throw new RenderError('crash', `önizleme render'ı başarısız (kod ${r.code ?? r.signal})`);
    return { files: i.frames.map((f) => join(i.outDir, `f${String(f).padStart(5, '0')}.png`)), renderer, ms: r.ms };
  }

  /** Plan C13/C17: the Remotion child under the process-group guard; a Chrome/WebGL failure (exit 3) is retried once with concurrency 1. */
  async draft(i: DraftInput): Promise<DraftOutput> {
    await mkdir(resolve(i.outPath, '..'), { recursive: true });
    const propsPath = `${i.outPath}.props.json`;
    await writeFile(propsPath, JSON.stringify(i.props));
    const once = async (concurrency: number): Promise<DraftOutput | null> => {
      let done: { frames: number; ms: number } | null = null;
      let error = '';
      const r = await runProcess(process.execPath, [
        '--import', 'tsx', this.o.remotionCli ?? REMOTION_CLI, '--props', propsPath, '--glb', i.glbPath, '--out', i.outPath,
        '--cache', join(this.o.dataDir, 'cache', 'remotion'), '--concurrency', String(concurrency), ...(i.frameRange ? ['--frames', i.frameRange.join('-')] : []),
      ], {
        cwd: REPO_ROOT, dataDir: this.o.dataDir, owner: i.owner, signal: i.signal, env: draftEnv(),
        timeoutMs: this.o.draftTimeoutMs ?? 600_000, maxRssMb: this.o.draftMaxRssMb ?? 6144,
        onLine: (l) => {
          const p = /^VG_PROGRESS (\d+) (\d+)$/.exec(l);
          if (p) i.onProgress?.(Number(p[1]), Number(p[2]));
          if (l.startsWith('VG_STAGE ')) i.onStage?.(l.slice(9).trim());
          if (l.startsWith('VG_DONE ')) done = JSON.parse(l.slice(8)) as { frames: number; ms: number };
          if (l.startsWith('VG_ERROR ')) error = l.slice(9).trim();
        },
      });
      await this.o.audit?.('render.draft', { ms: r.ms, code: r.code, stopped: r.stopped, concurrency, frames: (done as { frames: number } | null)?.frames ?? null });
      const stop = stoppedError(r, 'taslak render');
      if (stop) throw stop;
      if (r.code === 3) return null;
      if (r.code !== 0 || !done) throw new RenderError('crash', `taslak render başarısız (kod ${r.code ?? r.signal})${error ? `: ${error}` : ''}`);
      return { file: i.outPath, ...(done as { frames: number; ms: number }), concurrency };
    };
    const out = (await once(2)) ?? (await once(1));
    if (!out) throw new RenderError('gpu', 'taslak render GPU/WebGL hatasıyla iki kez düştü');
    return out;
  }

  async final(i: FinalInput): Promise<FinalOutput> {
    await mkdir(i.outDir, { recursive: true });
    return retryFinal(async (samples) => {
      let renderer = '';
      let skipped = 0;
      let used = 0;
      let gpuError = '';
      const r = await this.sandboxed({
        runDir: i.runDir, owner: i.owner, signal: i.signal, gpu: true, timeoutMs: this.o.finalTimeoutMs ?? 7_200_000, maxRssMb: this.o.finalMaxRssMb ?? 6144,
        onLine: (l) => {
          const p = /^VG_PROGRESS (\d+) (\d+)$/.exec(l);
          if (p) i.onProgress?.(Number(p[1]), Number(p[2]));
          if (l.startsWith('VG_RENDERER ')) renderer = l.slice(12).trim();
          if (l.startsWith('VG_SKIPPED ')) skipped = Number(l.slice(11));
          if (l.startsWith('VG_SAMPLES ')) used = Number(l.slice(11));
          if (l.startsWith('VG_ERROR ')) gpuError = l.slice(9).trim();
        },
      }, this.blenderArgs('final_cli.py', ['--blend', i.blendPath, '--out', i.outDir, '--start', '0', '--end', String(i.lastFrame), ...(samples ? ['--samples', String(samples)] : [])]));
      await this.o.audit?.('render.final', { ms: r.ms, code: r.code, stopped: r.stopped, samples: samples ?? 'blend', skipped, renderer });
      const stop = stoppedError(r, 'final render');
      if (stop) throw stop;
      if (r.code === 3) throw new RenderError('gpu', gpuError || 'GPU NVIDIA değil');
      if (r.code !== 0) return null;
      return { dir: i.outDir, frames: i.lastFrame + 1, skipped, samples: used || samples || 64, renderer, ms: r.ms };
    }, i.samples);
  }
}

/** Spec §16.1 FakeRenderDriver: committed pen build outputs and ffmpeg test stills; no Blender, bwrap or GPU. */
export class FakeRenderDriver implements RenderDriver {
  readonly kind = 'fake' as const;
  constructor(private readonly o: { ffmpeg: string; delayMs?: number; fixtures?: string }) {}

  capabilities(): Promise<Capability> {
    return ffmpegWorks(this.o.ffmpeg).then((ok) => (ok ? { ok: true as const } : { ok: false as const, reason: 'ffmpeg bulunamadı' }));
  }

  private async wait(signal?: AbortSignal): Promise<void> {
    await new Promise((r) => setTimeout(r, this.o.delayMs ?? 50));
    if (signal?.aborted) throw new RenderError('aborted', 'durduruldu');
  }

  /** `# vg-fake-error: <message>` in product.py fails the build with that message (tests of the fix loop). */
  async build(i: BuildInput): Promise<BuildOutput> {
    const t0 = Date.now();
    await this.wait(i.signal);
    const src = await readFile(i.productPath, 'utf8').catch(() => '');
    const fx = this.o.fixtures ?? SCENE_FIXTURES;
    const report = BuildReportSchema.parse(JSON.parse(await readFile(join(fx, 'build.json'), 'utf8')));
    const forced = /^# vg-fake-error: (.+)$/m.exec(src)?.[1];
    if (forced) return { report: { ...report, ok: false, errors: [forced], warnings: [] }, files: null, ms: Date.now() - t0 };
    await mkdir(i.outDir, { recursive: true });
    for (const f of ['scene.glb', 'anchors.json', 'events.json', 'camera_track.json', 'build.json']) await copyFile(join(fx, f), join(i.outDir, f));
    await writeFile(join(i.outDir, 'scene.blend'), 'fake blend\n');
    const files = {
      blend: join(i.outDir, 'scene.blend'), glb: join(i.outDir, 'scene.glb'), anchors: join(i.outDir, 'anchors.json'),
      events: join(i.outDir, 'events.json'), cameraTrack: join(i.outDir, 'camera_track.json'), report: join(i.outDir, 'build.json'),
    };
    return { report, files, ms: Date.now() - t0 };
  }

  async stills(i: StillsInput): Promise<StillsOutput> {
    const t0 = Date.now();
    await mkdir(i.outDir, { recursive: true });
    const files: string[] = [];
    for (const [n, f] of i.frames.entries()) {
      await this.wait(i.signal);
      const out = join(i.outDir, `f${String(f).padStart(5, '0')}.png`);
      await testStill(this.o.ffmpeg, out, { width: 540, height: 960, signal: i.signal });
      files.push(out);
      i.onProgress?.(n + 1, i.frames.length);
    }
    return { files, renderer: 'fake', ms: Date.now() - t0 };
  }

  /** Spec §16.1: a 2 s test-pattern MP4 at the requested size, tagged like the real draft (yuv420p, tv, bt709). */
  async draft(i: DraftInput): Promise<DraftOutput> {
    const t0 = Date.now();
    await mkdir(resolve(i.outPath, '..'), { recursive: true });
    await this.wait(i.signal);
    i.onStage?.('frames');
    i.onProgress?.(30, 60);
    await fakeDraft(this.o.ffmpeg, i.outPath, { width: i.props.width, height: i.props.height, frames: 60, signal: i.signal });
    if (i.signal?.aborted) throw new RenderError('aborted', 'durduruldu');
    i.onProgress?.(60, 60);
    return { file: i.outPath, frames: 60, ms: Date.now() - t0, concurrency: 1 };
  }

  /** Spec §16.1: tiny transparent frames; frames already present are counted as skipped (like the real resume). */
  async final(i: FinalInput): Promise<FinalOutput> {
    const t0 = Date.now();
    await mkdir(i.outDir, { recursive: true });
    await this.wait(i.signal);
    const total = i.lastFrame + 1;
    const skipped = total - missingFrames(i.outDir, i.lastFrame).length;
    if (skipped < total) await fakeFrames(this.o.ffmpeg, i.outDir, total, i.signal);
    if (i.signal?.aborted) throw new RenderError('aborted', 'durduruldu');
    i.onProgress?.(total, total);
    return { dir: i.outDir, frames: total, skipped, samples: i.samples ?? 64, renderer: 'fake', ms: Date.now() - t0 };
  }
}
