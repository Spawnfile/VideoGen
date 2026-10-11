import { constants, existsSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import type { MusicScore } from '@videogen/shared';
import { RenderError, type Capability, type RenderAudit } from '../render/driver.ts';
import { fakeMusicBed } from '../render/ffmpeg.ts';
import { runProcess } from '../render/process.ts';

/** Agent music design A2: a MusicScore to a 48 kHz stereo WAV (`renderS` long: the final holds one frame more than the storyboard). */
export interface MusicInput { score: MusicScore; out: string; renderS: number; owner: string; signal?: AbortSignal }
export interface MusicOutput { file: string; durationS: number; notes: number; peakDb: number | null; renderer: 'fluidsynth' | 'fake' }
/** YAKLASIM spec Y14: the fixed generator (audio_service.yaklasim_cli) — the video's length and the sparse-drum windows. */
export interface YaklasimMusicInput { durationS: number; sparse: [number, number][]; out: string; owner: string; signal?: AbortSignal }
export interface MusicDriver {
  readonly kind: 'fluidsynth' | 'fake';
  capabilities(): Promise<Capability>;
  render(i: MusicInput): Promise<MusicOutput>;
  /** Only the Python service (no soundfont, no FluidSynth). */
  yaklasimCapabilities(): Promise<Capability>;
  renderYaklasim(i: YaklasimMusicInput): Promise<MusicOutput>;
}

export interface FluidMusicDriverOptions { python: string; soundfont: string; dataDir: string; timeoutMs?: number; audit?: RenderAudit }

const lastLine = (tail: string[]) => tail.filter((l) => l.trim() && !l.includes('GLib')).at(-1)?.trim() ?? '';

/** python -m audio_service.music_cli: score → MIDI → FluidSynth (FluidR3 GM) → mastered WAV. CPU only, seconds. */
export class FluidMusicDriver implements MusicDriver {
  readonly kind = 'fluidsynth' as const;
  constructor(private readonly o: FluidMusicDriverOptions) {}

  async capabilities(): Promise<Capability> {
    if (!(await access(this.o.python, constants.X_OK).then(() => true, () => false))) return { ok: false, reason: 'ses servisi Python\'u bulunamadı' };
    if (!existsSync(this.o.soundfont)) return { ok: false, reason: `soundfont yok (${this.o.soundfont}); sudo apt install fluid-soundfont-gm` };
    const which = await runProcess('/usr/bin/env', ['which', 'fluidsynth'], { cwd: homedir(), dataDir: this.o.dataDir, owner: 'music-cap', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' }, timeoutMs: 5000 });
    return which.code === 0 ? { ok: true } : { ok: false, reason: 'fluidsynth yok; sudo apt install fluidsynth' };
  }

  async render(i: MusicInput): Promise<MusicOutput> {
    if (i.signal?.aborted) throw new RenderError('aborted', 'müzik durduruldu');
    await mkdir(dirname(i.out), { recursive: true });
    const jobPath = `${i.out}.job.json`;
    await writeFile(jobPath, JSON.stringify({ score: { ...i.score, duration_s: i.renderS }, out: resolve(i.out), soundfont: this.o.soundfont }));
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: homedir(), LANG: 'C.UTF-8', PYTHONSAFEPATH: '1' };
    let last = '';
    const r = await runProcess(this.o.python, ['-m', 'audio_service.music_cli', '--job', jobPath], {
      cwd: dirname(resolve(i.out)), dataDir: this.o.dataDir, owner: i.owner, signal: i.signal, env, timeoutMs: this.o.timeoutMs ?? 180_000, maxRssMb: 2048,
      onLine: (l) => { if (l.startsWith('{')) last = l; },
    });
    await this.o.audit?.('audio.music', { ms: r.ms, code: r.code, stopped: r.stopped });
    if (r.stopped === 'aborted') throw new RenderError('aborted', 'müzik durduruldu');
    if (r.stopped) throw new RenderError(r.stopped === 'timeout' ? 'timeout' : 'memory', `müzik sentezi ${r.stopped === 'timeout' ? 'zaman aşımına uğradı' : 'bellek sınırını aştı'}`);
    // Exit codes (music_cli.py): 0 done, 2 invalid job, 3 synthesizer/soundfont missing, 1 crash.
    if (r.code === 3) throw new RenderError('unavailable', lastLine(r.tail) || 'müzik sentezleyici yok');
    if (r.code !== 0 || !last) throw new RenderError('crash', `müzik sentezi başarısız (kod ${r.code ?? r.signal})${lastLine(r.tail) ? `: ${lastLine(r.tail)}` : ''}`);
    const res = JSON.parse(last) as { duration_s: number; notes: number; peak_db: number };
    return { file: i.out, durationS: res.duration_s, notes: res.notes, peakDb: res.peak_db, renderer: 'fluidsynth' };
  }
  yaklasimCapabilities(): Promise<Capability> { return pythonOk(this.o.python); }
  renderYaklasim(i: YaklasimMusicInput): Promise<MusicOutput> { return runYaklasimMusic(this.o, i); }
}

/** The audio service's Python is there: the YAKLASIM generator needs nothing else. */
async function pythonOk(python: string): Promise<Capability> {
  return (await access(python, constants.X_OK).then(() => true, () => false)) ? { ok: true } : { ok: false, reason: 'ses servisi Python\'u bulunamadı' };
}

/** python -m audio_service.yaklasim_cli --job: 120 BPM Am–F–C–G, sparse drums in the macro windows; CPU, seconds. */
export async function runYaklasimMusic(o: FluidMusicDriverOptions, i: YaklasimMusicInput): Promise<MusicOutput> {
  if (i.signal?.aborted) throw new RenderError('aborted', 'müzik durduruldu');
  await mkdir(dirname(i.out), { recursive: true });
  const jobPath = `${i.out}.job.json`;
  await writeFile(jobPath, JSON.stringify({ kind: 'music', duration_s: i.durationS, sparse: i.sparse, seed: 7, out: resolve(i.out) }));
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: homedir(), LANG: 'C.UTF-8', PYTHONSAFEPATH: '1' };
  let last = '';
  const r = await runProcess(o.python, ['-m', 'audio_service.yaklasim_cli', '--job', jobPath], {
    cwd: dirname(resolve(i.out)), dataDir: o.dataDir, owner: i.owner, signal: i.signal, env, timeoutMs: o.timeoutMs ?? 180_000, maxRssMb: 2048,
    onLine: (l) => { if (l.startsWith('{')) last = l; },
  });
  await o.audit?.('audio.music', { ms: r.ms, code: r.code, stopped: r.stopped, generator: 'yaklasim' });
  if (r.stopped === 'aborted') throw new RenderError('aborted', 'müzik durduruldu');
  if (r.stopped) throw new RenderError(r.stopped === 'timeout' ? 'timeout' : 'memory', `müzik üretimi ${r.stopped === 'timeout' ? 'zaman aşımına uğradı' : 'bellek sınırını aştı'}`);
  if (r.code !== 0 || !last) throw new RenderError('crash', `müzik üretimi başarısız (kod ${r.code ?? r.signal})${lastLine(r.tail) ? `: ${lastLine(r.tail)}` : ''}`);
  const res = JSON.parse(last) as { duration_s: number };
  return { file: i.out, durationS: res.duration_s, notes: 0, peakDb: null, renderer: 'fluidsynth' };
}

/** Fake driver (tests, smoke, a machine without FluidSynth): a quiet A-minor pad of the right length from ffmpeg. */
export class FakeMusicDriver implements MusicDriver {
  readonly kind = 'fake' as const;
  constructor(private readonly o: { ffmpeg: string }) {}
  async capabilities(): Promise<Capability> { return { ok: true }; }
  async render(i: MusicInput): Promise<MusicOutput> {
    await mkdir(dirname(i.out), { recursive: true });
    await fakeMusicBed(this.o.ffmpeg, i.out, i.renderS, i.signal);
    return { file: i.out, durationS: Number(i.renderS.toFixed(3)), notes: i.score.sections.length, peakDb: null, renderer: 'fake' };
  }
  async yaklasimCapabilities(): Promise<Capability> { return { ok: true }; }
  async renderYaklasim(i: YaklasimMusicInput): Promise<MusicOutput> {
    await mkdir(dirname(i.out), { recursive: true });
    await fakeMusicBed(this.o.ffmpeg, i.out, i.durationS, i.signal);
    return { file: i.out, durationS: Number(i.durationS.toFixed(3)), notes: 0, peakDb: null, renderer: 'fake' };
  }
}
