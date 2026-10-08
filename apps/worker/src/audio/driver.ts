import { constants, existsSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { NarratorVoice } from '@videogen/shared';
import { RenderError, type Capability, type RenderAudit } from '../render/driver.ts';
import { runProcess } from '../render/process.ts';

/** Plan M5c T4 (H2): the voice CLI as a child process under the caller's GPU lock; the K22 owner of the lock is the orchestrator. */

export interface VoiceInput {
  runDir: string;
  /** Job file, result, and the line WAVs of this attempt. */
  outDir: string;
  /** Line cache (H24): a sibling of outDir; survives restarts. */
  cacheDir: string;
  /** The step id (PID file owner). */
  owner: string;
  narrator: NarratorVoice;
  /** The decrypted-free reference WAV of a clone voice; null for a preset. */
  refWav: string | null;
  /** targetMs: how long the beat leaves for the line; the real CLI ignores it, the fake lasts exactly this. */
  lines: { id: string; text: string; targetMs: number; seed: number }[];
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface VoiceOutput {
  engine: string;
  model: string;
  /** `wav` is an absolute path. Word times are in ms from the start of their own line. */
  lines: { id: string; wav: string; durationMs: number; seed: number; attempts: number; cer: number; normalized: string; asr: string; words: { text: string; startMs: number; endMs: number }[] }[];
  /** Lines that stayed over the CER gate (exit 4); the result is complete otherwise. */
  failed: string[];
  ms: number;
}

export interface AudioDriver {
  readonly kind: 'real' | 'fake';
  /** Files only; starts no process and touches no GPU. */
  /** `refWav`: the clone voice's reference file, when the narrator is a clone. */
  capabilities(v: NarratorVoice, o?: { refWav?: string | null }): Promise<Capability>;
  voice(i: VoiceInput): Promise<VoiceOutput>;
}

// ---------------------------------------------------------------- real

const ResultSchema = z.object({
  engine: z.string(), model: z.string(), failed: z.array(z.string()), ms: z.number(),
  lines: z.array(z.object({
    id: z.string(), wav: z.string(), duration_ms: z.number(), seed: z.number(), attempts: z.number(), cer: z.number(), normalized: z.string(), asr: z.string(),
    words: z.array(z.object({ text: z.string(), start_ms: z.number(), end_ms: z.number() })),
  })),
});

export interface PythonAudioDriverOptions {
  python: string;
  freyaPython: string;
  modelsDir: string;
  hfHome: string;
  dataDir: string;
  timeoutMs?: number;
  maxRssMb?: number;
  /** RSS sampling interval of the process guard (tests). */
  sampleMs?: number;
  audit?: RenderAudit;
}

const CHATTERBOX_FILES = ['t3_mtl23ls_v3.safetensors', 's3gen.pt', 've.pt', 'conds.pt'] as const;
const WHISPER_SNAPSHOT = 'models--mobiuslabsgmbh--faster-whisper-large-v3-turbo';
const FREYA_SNAPSHOT = 'models--freyavoice--freya-tts';
/** The Whisper revision align.py loads (WHISPER_REVISION); a hub folder without this snapshot would trigger a download that offline mode refuses. */
const WHISPER_REVISION = '0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf';
/** The CLI's line id rule (voice_cli.py _ID). */
const LINE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

const lastLine = (tail: string[]): string => [...tail].reverse().find((l) => l.trim() && !l.startsWith('VG_PROGRESS '))?.trim().slice(0, 300) ?? '';

export class PythonAudioDriver implements AudioDriver {
  readonly kind = 'real' as const;
  constructor(private readonly o: PythonAudioDriverOptions) {}

  private pythonOf(engine: NarratorVoice['engine']): string { return engine === 'freya' ? this.o.freyaPython : this.o.python; }

  async capabilities(v: NarratorVoice, o: { refWav?: string | null } = {}): Promise<Capability> {
    const py = this.pythonOf(v.engine);
    if (!(await access(py, constants.X_OK).then(() => true, () => false))) {
      return { ok: false, reason: `${v.engine === 'freya' ? 'Freya ' : ''}Python bulunamadı (${py.split('/').slice(-4).join('/')})` };
    }
    const hub = join(this.o.hfHome, 'hub');
    if (v.engine === 'chatterbox') {
      const missing = CHATTERBOX_FILES.find((f) => !existsSync(join(this.o.modelsDir, 'chatterbox', f)));
      if (missing) return { ok: false, reason: `Chatterbox ağırlığı yok (${missing})` };
    } else if (!existsSync(join(hub, FREYA_SNAPSHOT))) {
      return { ok: false, reason: `Freya ağırlığı yok (${FREYA_SNAPSHOT})` };
    }
    if (v.voice.kind === 'clone' && !(o.refWav && existsSync(o.refWav))) return { ok: false, reason: 'klon ses için referans kaydı bulunamadı' };
    if (!existsSync(join(hub, WHISPER_SNAPSHOT, 'snapshots', WHISPER_REVISION))) return { ok: false, reason: `Whisper ağırlığı yok (faster-whisper-large-v3-turbo @ ${WHISPER_REVISION.slice(0, 8)})` };
    return { ok: true };
  }

  async voice(i: VoiceInput): Promise<VoiceOutput> {
    if (i.signal?.aborted) throw new RenderError('aborted', 'seslendirme durduruldu');
    if (i.narrator.voice.kind === 'clone' && !i.refWav) throw new RenderError('unavailable', 'klon ses için referans kaydı bulunamadı');
    await mkdir(i.outDir, { recursive: true });
    await mkdir(i.cacheDir, { recursive: true });
    const jobPath = resolve(i.outDir, 'job.json');
    await writeFile(jobPath, JSON.stringify({
      engine: i.narrator.engine,
      voice: i.narrator.voice.kind === 'clone' ? { kind: 'clone', ref_wav: i.refWav } : { kind: 'preset', id: i.narrator.voice.id },
      lines: i.lines.map((l) => ({ id: l.id, text: l.text, seed: l.seed })),
      cache_dir: i.cacheDir, out_dir: i.outDir, max_attempts: 3, cer_max: 0.05, sample_rate: 48000,
    }));
    // runProcess starts from an empty env: no paid keys, no proxy, no CUDA_VISIBLE_DEVICES; offline hub (H2).
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: homedir(), LANG: 'C.UTF-8', HF_HOME: this.o.hfHome, HF_HUB_OFFLINE: '1', VG_MODELS_DIR: this.o.modelsDir,
      // Python >= 3.11: do not prepend the cwd to sys.path (belt and braces with the neutral cwd below).
      PYTHONSAFEPATH: '1',
    };
    const r = await runProcess(this.pythonOf(i.narrator.engine), ['-m', 'audio_service.voice_cli', '--job', jobPath], {
      // Not the run dir: agents write there, and a planted audio_service/ or numpy.py would be imported by `python -m` (audio_service is installed editable).
      cwd: resolve(i.outDir), dataDir: this.o.dataDir, owner: i.owner, signal: i.signal, env, timeoutMs: this.o.timeoutMs ?? 900_000, maxRssMb: this.o.maxRssMb ?? 6000,
      sampleMs: this.o.sampleMs,
      onLine: (l) => {
        const p = /^VG_PROGRESS (\d+) (\d+)$/.exec(l);
        if (p) i.onProgress?.(Number(p[1]), Number(p[2]));
      },
    });
    await this.o.audit?.('audio.voice', { ms: r.ms, code: r.code, stopped: r.stopped, engine: i.narrator.engine, lines: i.lines.length });
    if (r.stopped === 'timeout') throw new RenderError('timeout', 'seslendirme zaman aşımına uğradı');
    if (r.stopped === 'memory') throw new RenderError('memory', 'seslendirme bellek sınırını aştı');
    if (r.stopped === 'aborted') throw new RenderError('aborted', 'seslendirme durduruldu');
    const why = lastLine(r.tail);
    // Exit codes (voice_cli.py): 0 done, 4 CER gate (result still written), 2 invalid job, 3 no GPU/model, 5 unexpected crash.
    if (r.code === 3) throw new RenderError('unavailable', why || 'GPU ya da model yok');
    if (r.code !== 0 && r.code !== 4) throw new RenderError('crash', `seslendirme başarısız (kod ${r.code ?? r.signal})${why ? `: ${why}` : ''}`);
    let raw: unknown = null;
    try { raw = JSON.parse(await readFile(join(i.outDir, 'result.json'), 'utf8')); } catch { /* handled below */ }
    if (raw === null && r.code === 0) throw new RenderError('crash', 'seslendirme sonuç dosyası okunamadı');
    const parsed = ResultSchema.safeParse(raw);
    if (!parsed.success) throw new RenderError('crash', `seslendirme sonuç dosyası yazmadan bitti (kod ${r.code})`);
    const res = parsed.data;
    const base = resolve(i.outDir);
    for (const l of res.lines) if (!resolve(base, l.wav).startsWith(base + sep)) throw new RenderError('crash', `seslendirme sonucu çıktı klasörünün dışında bir dosya gösteriyor (${l.id})`);
    return {
      engine: res.engine, model: res.model, failed: res.failed, ms: res.ms,
      lines: res.lines.map((l) => ({
        id: l.id, wav: resolve(i.outDir, l.wav), durationMs: l.duration_ms, seed: l.seed, attempts: l.attempts, cer: l.cer, normalized: l.normalized, asr: l.asr,
        words: l.words.map((w) => ({ text: w.text, startMs: w.start_ms, endMs: w.end_ms })),
      })),
    };
  }
}

// ---------------------------------------------------------------- fake

export interface FakeAudioOptions {
  /** Kept for symmetry with FakeRenderDriver; the fake writes its WAVs itself and starts no process. */
  ffmpeg?: string;
  /** Every line lasts this much longer than its target (tests of the voice step's too-long path; the driver sees lines only, so this is an option and not a marker). */
  overrunMs?: number;
  delayMs?: number;
}

const RATE = 48000;

function hash32(s: string): number {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Seeded pink noise (Paul Kellet's filter) with a 4 Hz amplitude modulation, 16-bit PCM mono WAV. */
/** Float sample → 16-bit PCM; over-range saturates (symmetric ±32767), NaN is silence. */
export const toPcm16 = (v: number): number => (Number.isNaN(v) ? 0 : Math.max(-32767, Math.min(32767, Math.round(v * 32767))));

export function fakeVoiceWav(seed: number, durationMs: number): Buffer {
  const n = Math.round((durationMs * RATE) / 1000);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8, 'ascii');
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36, 'ascii'); buf.writeUInt32LE(n * 2, 40);
  const rnd = mulberry32(seed);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let k = 0; k < n; k++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    const pink = (b0 + b1 + b2 + w * 0.1848) / 4;
    const am = 0.65 + 0.35 * Math.sin((2 * Math.PI * 4 * k) / RATE);
    buf.writeInt16LE(toPcm16(pink * am * 0.9), 44 + k * 2);
  }
  return buf;
}

/** Splits a line's duration over its words by character length: contiguous, monotone, the last word ends with the line. */
function fakeWords(text: string, durationMs: number): { text: string; startMs: number; endMs: number }[] {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((s, w) => s + w.length, 0) || 1;
  let at = 0, chars = 0;
  return words.map((w, k) => {
    chars += w.length;
    const end = k === words.length - 1 ? durationMs : Math.max(at + 1, Math.round((durationMs * chars) / total));
    const out = { text: w, startMs: at, endMs: end };
    at = end;
    return out;
  });
}

/** Spec §16.1 / plan H17: no Python, no GPU, no ffmpeg process. A line with "kekeme" is read twice (the first attempt misses the CER gate). */
export class FakeAudioDriver implements AudioDriver {
  readonly kind = 'fake' as const;
  constructor(private readonly o: FakeAudioOptions = {}) {}

  async capabilities(_v?: NarratorVoice, _o?: { refWav?: string | null }): Promise<Capability> { return { ok: true }; }

  async voice(i: VoiceInput): Promise<VoiceOutput> {
    const t0 = Date.now();
    await mkdir(i.outDir, { recursive: true });
    for (const l of i.lines) {
      if (!LINE_ID.test(l.id)) throw new RenderError('crash', `satır kimliği geçersiz: ${JSON.stringify(l.id)}`);
      if (!Number.isFinite(l.targetMs) || l.targetMs < 0) throw new RenderError('crash', `satır ${l.id}: hedef süre geçersiz`);
    }
    const total = i.lines.length * 2;
    const lines: VoiceOutput['lines'] = [];
    let done = 0;
    for (const l of i.lines) {
      if (this.o.delayMs) await new Promise((r) => setTimeout(r, this.o.delayMs));
      if (i.signal?.aborted) throw new RenderError('aborted', 'seslendirme durduruldu');
      const attempts = /kekeme/i.test(l.text) ? 2 : 1;
      const seed = l.seed + 1000 * (attempts - 1);
      const durationMs = Math.max(200, Math.round(l.targetMs + (this.o.overrunMs ?? 0)));
      const wav = join(i.outDir, `${l.id}.wav`);
      await writeFile(wav, fakeVoiceWav((seed ^ hash32(l.text)) >>> 0, durationMs));
      const asr = l.text.toLocaleLowerCase('tr').replace(/[.,;:!?"()]/g, '').replace(/\s+/g, ' ').trim();
      lines.push({ id: l.id, wav, durationMs, seed, attempts, cer: 0, normalized: asr, asr, words: fakeWords(l.text, durationMs) });
      done += 1;
      i.onProgress?.(done, total);
    }
    // The alignment phase, one tick per line (the real CLI counts 2 x lines).
    for (let k = 0; k < i.lines.length; k++) { done += 1; i.onProgress?.(done, total); }
    return { engine: i.narrator.engine, model: `fake-tts-${i.narrator.engine}`, lines, failed: [], ms: Date.now() - t0 };
  }
}
