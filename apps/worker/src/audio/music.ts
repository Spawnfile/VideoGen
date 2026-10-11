import { constants } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { RenderError, type Capability, type RenderAudit } from '../render/driver.ts';
import { fakeMusicBed } from '../render/ffmpeg.ts';
import { runProcess } from '../render/process.ts';

export interface MusicOutput { file: string; durationS: number; notes: number; peakDb: number | null; renderer: 'yaklasim' | 'fake' }
/** YAKLASIM spec Y14: the fixed generator (audio_service.yaklasim_cli) — the video's length and the sparse-drum windows. */
export interface YaklasimMusicInput { durationS: number; sparse: [number, number][]; out: string; owner: string; signal?: AbortSignal }
/** Spec Z3: the only music is the fixed YAKLASIM bed (the free composer and its FluidSynth renderer are gone). */
export interface MusicDriver {
  readonly kind: 'yaklasim' | 'fake';
  yaklasimCapabilities(): Promise<Capability>;
  renderYaklasim(i: YaklasimMusicInput): Promise<MusicOutput>;
}

export interface YaklasimMusicOptions { python: string; dataDir: string; timeoutMs?: number; audit?: RenderAudit }

const lastLine = (tail: string[]) => tail.filter((l) => l.trim() && !l.includes('GLib')).at(-1)?.trim() ?? '';

/** The audio service's YAKLASIM generator (CPU, seconds). */
export class YaklasimMusicDriver implements MusicDriver {
  readonly kind = 'yaklasim' as const;
  constructor(private readonly o: YaklasimMusicOptions) {}
  yaklasimCapabilities(): Promise<Capability> { return pythonOk(this.o.python); }
  renderYaklasim(i: YaklasimMusicInput): Promise<MusicOutput> { return runYaklasimMusic(this.o, i); }
}

/** The audio service's Python is there: the YAKLASIM generator needs nothing else. */
async function pythonOk(python: string): Promise<Capability> {
  return (await access(python, constants.X_OK).then(() => true, () => false)) ? { ok: true } : { ok: false, reason: 'ses servisi Python\'u bulunamadı' };
}

/** python -m audio_service.yaklasim_cli --job: 120 BPM Am–F–C–G, sparse drums in the macro windows; CPU, seconds. */
export async function runYaklasimMusic(o: YaklasimMusicOptions, i: YaklasimMusicInput): Promise<MusicOutput> {
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
  return { file: i.out, durationS: res.duration_s, notes: 0, peakDb: null, renderer: 'yaklasim' };
}

/** Fake driver (tests, smoke): a quiet A-minor pad of the right length from ffmpeg. */
export class FakeMusicDriver implements MusicDriver {
  readonly kind = 'fake' as const;
  constructor(private readonly o: { ffmpeg: string }) {}
  async yaklasimCapabilities(): Promise<Capability> { return { ok: true }; }
  async renderYaklasim(i: YaklasimMusicInput): Promise<MusicOutput> {
    await mkdir(dirname(i.out), { recursive: true });
    await fakeMusicBed(this.o.ffmpeg, i.out, i.durationS, i.signal);
    return { file: i.out, durationS: Number(i.durationS.toFixed(3)), notes: 0, peakDb: null, renderer: 'fake' };
  }
}
