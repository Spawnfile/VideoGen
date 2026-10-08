import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NARRATOR, type NarratorVoice } from '@videogen/shared';
import { FakeAudioDriver, PythonAudioDriver, toPcm16, type VoiceInput } from '../src/audio/driver.ts';

const FAKE_CLI = resolve(import.meta.dirname, 'fixtures/fake-voice-cli.mjs');
const root = mkdtempSync(join(tmpdir(), 'vg-audio-'));
let n = 0;
const dir = () => { const d = join(root, `d${n++}`); mkdirSync(d, { recursive: true }); return d; };

const input = (over: Partial<VoiceInput> = {}): VoiceInput => {
  const base = dir();
  return {
    runDir: base, outDir: join(base, 'out'), cacheDir: join(base, 'cache'), owner: 'step-1', narrator: DEFAULT_NARRATOR as NarratorVoice, refWav: null,
    lines: [{ id: 'b1', text: 'Bu kalem tam bir ölçü aleti', targetMs: 2000, seed: 11 }, { id: 'b2', text: 'kekeme bir satır', targetMs: 1500, seed: 22 }, { id: 'b3', text: 'Son söz', targetMs: 800, seed: 33 }],
    onProgress: () => {}, ...over,
  };
};

/** Header fields of a 16-bit PCM WAV written by the fake driver. */
function wavInfo(file: string) {
  const b = readFileSync(file);
  return { size: b.readUInt32LE(4), fmtId: b.toString('ascii', 8, 16), fmtLen: b.readUInt32LE(16), pcm: b.readUInt16LE(20), byteRate: b.readUInt32LE(28), align: b.readUInt16LE(32), dataId: b.toString('ascii', 36, 40), total: b.length, riff: b.toString('ascii', 0, 4), channels: b.readUInt16LE(22), rate: b.readUInt32LE(24), bits: b.readUInt16LE(34), data: b.readUInt32LE(40), peak: Math.max(...Array.from({ length: (b.length - 44) / 2 }, (_, i) => Math.abs(b.readInt16LE(44 + i * 2)))) };
}

describe('fake TTS', () => {
  it('writes 48 kHz mono WAVs in Node (no ffmpeg) that last their target, words monotone inside each line, a "kekeme" line takes two attempts', async () => {
    const d = new FakeAudioDriver({ ffmpeg: '/nonexistent/ffmpeg' });
    expect(await d.capabilities(DEFAULT_NARRATOR as NarratorVoice)).toEqual({ ok: true });
    const progress: string[] = [];
    const i = input({ onProgress: (a, b) => progress.push(`${a}/${b}`) });
    const out = await d.voice(i);
    expect(out.failed).toEqual([]);
    expect(out.lines.map((l) => [l.id, l.durationMs, l.attempts, l.cer])).toEqual([['b1', 2000, 1, 0], ['b2', 1500, 2, 0], ['b3', 800, 1, 0]]);
    // The delivered attempt's seed: seed + 1000 per extra attempt (the CLI's rule).
    expect(out.lines.map((l) => l.seed)).toEqual([11, 1022, 33]);
    // Two ticks per line (TTS then alignment phase), total 2n like the real CLI.
    expect(progress).toEqual(['1/6', '2/6', '3/6', '4/6', '5/6', '6/6']);
    // ffprobe agrees with the header.
    const probe = execFileSync(process.env.VG_FFPROBE ?? 'ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', out.lines[0]!.wav]).toString();
    const pj = JSON.parse(probe) as { streams: { codec_name: string; sample_rate: string; channels: number }[]; format: { duration: string } };
    expect(pj.streams[0]).toMatchObject({ codec_name: 'pcm_s16le', sample_rate: '48000', channels: 1 });
    expect(Number(pj.format.duration)).toBeCloseTo(2, 2);
    // The 16-bit clamp: over-range samples saturate instead of wrapping.
    expect([toPcm16(2), toPcm16(-2), toPcm16(0.5), toPcm16(Number.NaN)]).toEqual([32767, -32767, 16384, 0]);
    // Line ids follow the CLI's rule; a bad target is refused.
    for (const id of ['', '.x', 'a b', 'ç']) await expect(d.voice(input({ lines: [{ id, text: 'x', targetMs: 500, seed: 1 }] }))).rejects.toMatchObject({ kind: 'crash' });
    await expect(d.voice(input({ lines: [{ id: 'ok', text: 'x', targetMs: Number.NaN, seed: 1 }] }))).rejects.toMatchObject({ kind: 'crash' });
    await expect(d.voice(input({ lines: [{ id: 'ok', text: 'x', targetMs: -5, seed: 1 }] }))).rejects.toMatchObject({ kind: 'crash' });
    for (const l of out.lines) {
      const w = wavInfo(l.wav);
      expect(w).toMatchObject({ riff: 'RIFF', fmtId: 'WAVEfmt ', fmtLen: 16, pcm: 1, channels: 1, rate: 48000, byteRate: 96000, align: 2, bits: 16, dataId: 'data' });
      expect(w.size).toBe(36 + w.data);
      expect(w.total).toBe(44 + w.data);
      expect(w.data).toBe(Math.round((l.durationMs * 48000) / 1000) * 2);
      expect(w.peak).toBeGreaterThan(500);
      // Words come from the line text (original case and punctuation, like map_words).
      expect(l.words.map((x) => x.text).join(' ')).toBe(i.lines.find((x) => x.id === l.id)!.text);
      let t = 0;
      for (const x of l.words) { expect(x.startMs).toBeGreaterThanOrEqual(t); expect(x.endMs).toBeGreaterThan(x.startMs); t = x.endMs; }
      expect(t).toBeLessThanOrEqual(l.durationMs);
    }
    // Deterministic: the same seed and text give the same bytes.
    const again = await d.voice(input({ lines: i.lines }));
    expect(readFileSync(again.lines[0]!.wav).equals(readFileSync(out.lines[0]!.wav))).toBe(true);
    // The overrun option (tests of the voice step): lines last longer than the target.
    const long = await new FakeAudioDriver({ ffmpeg: 'x', overrunMs: 500 }).voice(input({ lines: i.lines.slice(2) }));
    expect(long.lines[0]!.durationMs).toBe(1300);
    // A cancel before the work starts.
    const ac = new AbortController();
    ac.abort();
    await expect(d.voice(input({ signal: ac.signal }))).rejects.toMatchObject({ name: 'RenderError', kind: 'aborted' });
  });
});

describe('python driver', () => {
  const opts = (over: Record<string, unknown> = {}) => ({ python: FAKE_CLI, freyaPython: FAKE_CLI, modelsDir: dir(), hfHome: dir(), dataDir: dir(), ...over });
  const control = (i: VoiceInput, c: Record<string, unknown>) => { mkdirSync(i.outDir, { recursive: true }); writeFileSync(join(i.outDir, 'fake.json'), JSON.stringify(c)); };
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const dead = async (pid: number) => { for (let k = 0; k < 40 && alive(pid); k++) await new Promise((r) => setTimeout(r, 25)); return !alive(pid); };
  const audits: { action: string; data: Record<string, unknown> }[] = [];

  it('writes the job, passes only the allowed env (HF offline, no paid keys), parses progress and the result, maps exit 2/3/4, a cancel, the timeout and the RSS limit each kill the group; capabilities report a missing python or weights without starting a process', async () => {
    const o = opts();
    const audit = async (action: string, data: Record<string, unknown>) => { audits.push({ action, data }); };
    const d = new PythonAudioDriver({ ...o, audit });

    // The job, the env and the result.
    const i = input();
    const progress: string[] = [];
    process.env.ANTHROPIC_API_KEY = 'sk-should-not-leak';
    let out: Awaited<ReturnType<typeof d.voice>>;
    try { out = await d.voice({ ...i, onProgress: (a, b) => progress.push(`${a}/${b}`) }); } finally { delete process.env.ANTHROPIC_API_KEY; }
    const job = JSON.parse(readFileSync(join(i.outDir, 'job.json'), 'utf8'));
    expect(job).toMatchObject({ engine: 'chatterbox', voice: { kind: 'preset', id: 'hazir' }, cache_dir: i.cacheDir, out_dir: i.outDir, max_attempts: 3, cer_max: 0.05, sample_rate: 48000 });
    expect(job.lines).toEqual([{ id: 'b1', text: 'Bu kalem tam bir ölçü aleti', seed: 11 }, { id: 'b2', text: 'kekeme bir satır', seed: 22 }, { id: 'b3', text: 'Son söz', seed: 33 }]);
    expect(JSON.parse(readFileSync(join(i.outDir, 'argv.json'), 'utf8'))).toEqual(['-m', 'audio_service.voice_cli', '--job', join(i.outDir, 'job.json')]);
    const env = JSON.parse(readFileSync(join(i.outDir, 'env.json'), 'utf8')) as Record<string, string>;
    expect(Object.keys(env).filter((k) => !k.startsWith('_') && k !== 'PWD' && k !== 'SHLVL' && k !== 'OLDPWD').sort()).toEqual(['HF_HOME', 'HF_HUB_OFFLINE', 'HOME', 'LANG', 'PATH', 'PYTHONSAFEPATH', 'VG_MODELS_DIR']);
    // Not the run dir: a planted <runDir>/audio_service or numpy.py must not be importable; PYTHONSAFEPATH keeps the cwd off sys.path anyway.
    expect(env.PYTHONSAFEPATH).toBe('1');
    expect(realpathSync(readFileSync(join(i.outDir, 'cwd.txt'), 'utf8'))).toBe(realpathSync(i.outDir));
    expect(env).toMatchObject({ HF_HOME: o.hfHome, HF_HUB_OFFLINE: '1', VG_MODELS_DIR: o.modelsDir });
    expect(progress.at(-1)).toBe('6/6');
    expect(out).toMatchObject({ engine: 'chatterbox', model: 'fake-model', failed: [] });
    expect(out.lines[0]).toEqual({ id: 'b1', wav: join(i.outDir, 'b1.wav'), durationMs: 1000, seed: 11, attempts: 1, cer: 0, normalized: 'bu kalem tam bir ölçü aleti', asr: 'bu kalem tam bir ölçü aleti', words: expect.any(Array) });
    expect(out.lines[0]!.words[1]).toEqual({ text: 'kalem', startMs: 200, endMs: 350 });
    expect(audits.at(-1)).toMatchObject({ action: 'audio.voice', data: { code: 0, stopped: null, engine: 'chatterbox' } });

    // A clone voice goes in as ref_wav; without a reference it is refused before any process starts.
    const ref = join(dir(), 'ref.wav');
    writeFileSync(ref, 'RIFF');
    const cloneNarrator: NarratorVoice = { engine: 'chatterbox', voice: { kind: 'clone', asset_id: '11111111-1111-4111-8111-111111111111' } };
    const c = input({ narrator: cloneNarrator, refWav: ref });
    await d.voice(c);
    expect(JSON.parse(readFileSync(join(c.outDir, 'job.json'), 'utf8')).voice).toEqual({ kind: 'clone', ref_wav: ref });
    await expect(d.voice(input({ narrator: cloneNarrator, refWav: null }))).rejects.toMatchObject({ kind: 'unavailable' });

    // Exit codes: 2 → crash with the last stderr line, 3 → unavailable, 4 → the result with `failed`, 5 → crash.
    for (const [code, kind, stderr] of [[2, 'crash', 'satır b1: metin boş'], [3, 'unavailable', 'CUDA yok'], [5, 'crash', 'Ses üretimi başarısız: KeyError: x']] as const) {
      const j = input();
      control(j, { exit: code, stderr });
      await expect(d.voice(j)).rejects.toMatchObject({ name: 'RenderError', kind, message: expect.stringContaining(stderr) });
    }
    const four = input();
    control(four, { exit: 4 });
    expect((await d.voice(four)).failed).toEqual(['b2']);

    // A signal that is already aborted never starts the process; a result that cannot be read or points outside outDir is a crash.
    const pre = new AbortController();
    pre.abort();
    const early = input({ signal: pre.signal });
    await expect(d.voice(early)).rejects.toMatchObject({ kind: 'aborted' });
    expect(existsSync(join(early.outDir, 'pid.txt'))).toBe(false);
    const badJson = input();
    control(badJson, { resultRaw: '{not json' });
    await expect(d.voice(badJson)).rejects.toMatchObject({ kind: 'crash', message: expect.stringContaining('sonuç dosyası okunamadı') });
    const escape = input();
    control(escape, { wavPrefix: '../../' });
    await expect(d.voice(escape)).rejects.toMatchObject({ kind: 'crash', message: expect.stringContaining('dışında') });
    const noisy = input();
    control(noisy, { exit: 5, noProgressTail: true });
    await expect(d.voice(noisy)).rejects.toMatchObject({ kind: 'crash', message: expect.not.stringContaining('VG_PROGRESS') });

    // A cancel kills the group; so do the time limit and the RSS limit.
    const ac = new AbortController();
    const cancelled = input({ signal: ac.signal, onProgress: () => ac.abort() });
    control(cancelled, { mode: 'sleep' });
    await expect(d.voice(cancelled)).rejects.toMatchObject({ kind: 'aborted' });
    expect(await dead(Number(readFileSync(join(cancelled.outDir, 'pid.txt'), 'utf8')))).toBe(true);

    const slow = input();
    control(slow, { mode: 'sleep' });
    await expect(new PythonAudioDriver({ ...o, timeoutMs: 400, audit }).voice(slow)).rejects.toMatchObject({ kind: 'timeout' });
    expect(await dead(Number(readFileSync(join(slow.outDir, 'pid.txt'), 'utf8')))).toBe(true);

    const fat = input();
    control(fat, { mode: 'alloc' });
    await expect(new PythonAudioDriver({ ...o, maxRssMb: 150, sampleMs: 50, audit }).voice(fat)).rejects.toMatchObject({ kind: 'memory' });
    expect(await dead(Number(readFileSync(join(fat.outDir, 'pid.txt'), 'utf8')))).toBe(true);
    expect(await d.voice(input()).then(() => true)).toBe(true);
    expect(audits.map((a) => a.data.stopped)).toEqual(expect.arrayContaining(['aborted', 'timeout', 'memory']));

    // Capabilities look at files only.
    expect(await new PythonAudioDriver({ ...o, python: join(root, 'no-python') }).capabilities(DEFAULT_NARRATOR as NarratorVoice)).toEqual({ ok: false, reason: expect.stringContaining('Python bulunamadı') });
    const cap = await d.capabilities(DEFAULT_NARRATOR as NarratorVoice);
    expect(cap).toEqual({ ok: false, reason: expect.stringContaining('t3_mtl23ls_v3.safetensors') });
    for (const f of ['t3_mtl23ls_v3.safetensors', 's3gen.pt', 've.pt', 'conds.pt']) { mkdirSync(join(o.modelsDir, 'chatterbox'), { recursive: true }); writeFileSync(join(o.modelsDir, 'chatterbox', f), 'x'); }
    expect(await d.capabilities(DEFAULT_NARRATOR as NarratorVoice)).toEqual({ ok: false, reason: expect.stringContaining('faster-whisper-large-v3-turbo') });
    const whisper = join(o.hfHome, 'hub', 'models--mobiuslabsgmbh--faster-whisper-large-v3-turbo');
    mkdirSync(join(whisper, 'snapshots', 'deadbeef'), { recursive: true });
    expect(await d.capabilities(DEFAULT_NARRATOR as NarratorVoice)).toEqual({ ok: false, reason: expect.stringContaining('0a363e91') });
    mkdirSync(join(whisper, 'snapshots', '0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf'), { recursive: true });
    expect(await d.capabilities(DEFAULT_NARRATOR as NarratorVoice)).toEqual({ ok: true });
    expect(await d.capabilities(cloneNarrator, { refWav: join(root, 'missing.wav') })).toEqual({ ok: false, reason: expect.stringContaining('referans') });
    expect(await d.capabilities(cloneNarrator, { refWav: ref })).toEqual({ ok: true });
    const freya: NarratorVoice = { engine: 'freya', voice: { kind: 'preset', id: 'leyla' } };
    expect(await d.capabilities(freya)).toEqual({ ok: false, reason: expect.stringContaining('freya-tts') });
    expect(await new PythonAudioDriver({ ...o, freyaPython: join(root, 'no-freya') }).capabilities(freya)).toEqual({ ok: false, reason: expect.stringContaining('Freya') });
  }, 30_000);
});
