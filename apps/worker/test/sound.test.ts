import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssetRecord } from '@videogen/db';
import { AudioPlanSchema } from '@videogen/shared';
import { defaultAudioPlan, duckingEnvelope, effectiveAudioPlan, LicenseError, soundPlan, type SfxCue } from '../src/pipeline/sound.ts';
import { masterAudio, masterVariant, measureLoudnorm, mixTrack, parseLoudnormJson } from '../src/render/audio.ts';
import { encodeDelivery, fakeFinal, muxVariant } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const FX = resolve(import.meta.dirname, '../../../tests/fixtures');
const tmp = () => mkdtempSync(join(tmpdir(), 'vg-sound-'));
const asset = (o: Partial<AssetRecord>): AssetRecord => ({
  id: 'a', kind: 'sfx', title: 't', blobSha: 'x', licenseSpdx: 'CC0-1.0', sourceUrl: null, author: 'a', attribution: null, licenseSnapshotSha: null, allowed: true, tags: [], durationMs: 100, createdAt: '', revokedAt: null, revokeReason: null, updatedAt: null, ...o,
});
const lib = Object.fromEntries(['y_snap', 'y_tap', 'y_land'].map((n) => [n, asset({ id: `sfx-${n}`, title: n })])) as Record<SfxCue['name'], AssetRecord>;

// Real ffmpeg under parallel files (plan M7 Y2): at least 60 s per test.
describe('sound plan, mix, mastering and the two variants', { timeout: 60_000 }, () => {
  it('soundPlan: the cues with their gains and the fixed music; a sound that is not allowed today is refused (spec §9 license gate, Z5)', () => {
    const gen = { sha: 'a'.repeat(64), file: '/x/music.wav' };
    const cues: SfxCue[] = [{ atMs: 5200, name: 'y_snap', source: 'event:l1' }, { atMs: 9000, name: 'y_land', source: 'event:l2' }];
    expect(soundPlan(cues, lib, gen)).toEqual({
      cues: [{ atMs: 5200, name: 'y_snap', source: 'event:l1', assetId: 'sfx-y_snap', gainDb: -9 }, { atMs: 9000, name: 'y_land', source: 'event:l2', assetId: 'sfx-y_land', gainDb: -7 }],
      music: { generatedSha: gen.sha, title: 'YAKLASIM müziği', license: 'LicenseRef-VideoGen-Generated', gainDb: -18 },
    });
    expect(() => soundPlan(cues, { ...lib, y_snap: asset({ allowed: false }) }, gen)).toThrow('izinsiz ses: y_snap');
    // Today's policy, not only the stored flag: a CC-BY row whose attribution was cleared is refused at use.
    expect(() => soundPlan(cues, { ...lib, y_land: asset({ licenseSpdx: 'CC-BY-4.0', attribution: null }) }, gen)).toThrow(LicenseError);
  });

  it('defaultAudioPlan and effectiveAudioPlan (spec Z5): the fixed stem is the music; none rendered or a stored plan naming a ledger track is a license error; a stored plan wins; exclude and the offsets reach the cues', () => {
    const gen = { sha: 'a'.repeat(64), file: '/x/music.wav' };
    const d = effectiveAudioPlan({ stored: null, mode: 'silent', generated: gen });
    expect(d).toEqual({ persist: true, generated: gen, plan: { version: 1, mode: 'silent', music: { source: 'generated', asset_id: null, gain_db: -18 }, vo_gain_db: 0, duck_db: 12, sfx: { gain_offset_db: 0, exclude: [] }, mastering: { target_lufs: -14, tp: -1 } } });
    expect(AudioPlanSchema.safeParse(d.plan).success).toBe(true);
    expect(defaultAudioPlan({ mode: 'silent' })).toEqual(d.plan);
    const cues: SfxCue[] = [{ atMs: 5200, name: 'y_snap', source: 'event:l1' }, { atMs: 6000, name: 'y_tap', source: 'beat:b3' }];
    expect(soundPlan(cues, lib, gen, d.plan)).toEqual(soundPlan(cues, lib, gen)); // the default plan changes no gain
    const stored = { ...d.plan, music: { ...d.plan.music, gain_db: -22 }, sfx: { gain_offset_db: -3, exclude: ['y_tap' as const] } };
    expect(effectiveAudioPlan({ stored, mode: 'silent', generated: gen })).toEqual({ plan: stored, persist: false, generated: gen });
    expect(soundPlan(cues, lib, gen, stored)).toEqual({
      cues: [{ atMs: 5200, name: 'y_snap', source: 'event:l1', assetId: 'sfx-y_snap', gainDb: -12 }],
      music: { generatedSha: gen.sha, title: 'YAKLASIM müziği', license: 'LicenseRef-VideoGen-Generated', gainDb: -22 },
    });
    expect(() => effectiveAudioPlan({ stored: null, mode: 'silent', generated: null })).toThrow(/üretilen müzik bulunamadı/);
    expect(() => effectiveAudioPlan({ stored: { ...stored, music: { asset_id: '11111111-1111-4111-8111-111111111111', gain_db: -18 } }, mode: 'silent', generated: gen })).toThrow(/defterden bir müzik/);
  });

  it("duckingEnvelope: −duck_db under each VO line with 150 ms ramps and the 150/300 ms margins, 0 dB in the gaps, '1' without lines", () => {
    const o = { duckDb: 12, preMs: 150, postMs: 300, rampMs: 150 };
    expect(duckingEnvelope([], o)).toBe('1');
    const lines = [{ start_ms: 1000, end_ms: 2000 }, { start_ms: 5000, end_ms: 6000 }];
    const expr = duckingEnvelope(lines, o);
    expect(duckingEnvelope(lines, o)).toBe(expr);
    // evaluate the expression the way ffmpeg does (t in seconds)
    const clip = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
    const gainDb = (t: number) => 20 * Math.log10(new Function('t', 'clip', 'min', `return ${expr}`)(t, clip, Math.min) as number);
    expect(gainDb(0)).toBeCloseTo(0, 6);
    expect(gainDb(0.7)).toBeCloseTo(0, 6); // before the down ramp (starts at 0.7 s)
    expect(gainDb(0.775)).toBeCloseTo(-4.07, 1); // mid ramp: linear in amplitude (0.625)
    expect(gainDb(0.85)).toBeCloseTo(-12, 1); // plateau starts 150 ms before the line
    expect(gainDb(1)).toBeCloseTo(-12, 1);
    expect(gainDb(2.3)).toBeCloseTo(-12, 1); // plateau ends 300 ms after the line
    expect(gainDb(2.375)).toBeCloseTo(-4.07, 1);
    expect(gainDb(2.45)).toBeCloseTo(0, 6);
    expect(gainDb(3.5)).toBeCloseTo(0, 6);
    expect(gainDb(5.5)).toBeCloseTo(-12, 1);
    // a line at 0 ms: the window starts at 0, its down ramp before 0 prints as `t+x` (no `t--x`), the plateau holds from t = 0
    const zero = duckingEnvelope([{ start_ms: 0, end_ms: 1000 }], o);
    expect(zero).not.toContain('--');
    const zeroDb = (t: number) => 20 * Math.log10(new Function('t', 'clip', 'min', `return ${zero}`)(t, clip, Math.min) as number);
    expect([zeroDb(0), zeroDb(1.3), zeroDb(1.375), zeroDb(1.5)].map((x) => Math.round(x * 10) / 10)).toEqual([-12, -12, -4.1, 0]);
    // lines closer than the ramps share one plateau; the depth follows duck_db
    expect(duckingEnvelope([{ start_ms: 1000, end_ms: 2000 }, { start_ms: 2400, end_ms: 3000 }], o)).toBe(duckingEnvelope([{ start_ms: 1000, end_ms: 3000 }], o));
    expect(duckingEnvelope(lines, { ...o, duckDb: 6 })).not.toBe(expr);
  });

  it('parses loudnorm measurements, including a silent input', () => {
    const out = 'x\n[Parsed_loudnorm_0 @ 0x1] \n{\n\t"input_i" : "-23.41",\n\t"input_tp" : "-3.10",\n\t"input_lra" : "20.60",\n\t"input_thresh" : "-33.80",\n\t"output_i" : "-14.0",\n\t"target_offset" : "0.05"\n}\n';
    expect(parseLoudnormJson(out)).toEqual({ i: -23.41, tp: -3.1, lra: 20.6, thresh: -33.8, offset: 0.05 });
    expect(parseLoudnormJson('{\n "input_i" : "-inf",\n "input_tp" : "-inf",\n "input_lra" : "0.00",\n "input_thresh" : "-70.00",\n "target_offset" : "inf"\n}')!.i).toBeNaN();
    expect(parseLoudnormJson('no json here')).toBeNull();
  });

  it('masters a quiet mix to −14 LUFS ±1 with a true peak ≤ −1 dBTP, also after the AAC encode of the variant', async () => {
    const d = tmp();
    const quiet = join(d, 'quiet.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=12:c=pink:r=48000:a=0.05:seed=3', '-f', 'lavfi', '-i', 'sine=f=330:d=12:sample_rate=48000', '-filter_complex', '[0][1]amix=inputs=2,volume=-12dB', '-ac', '2', quiet]);
    const out = join(d, 'master.wav');
    const r = await masterAudio(FFMPEG, quiet, out);
    expect(r.before!.i).toBeLessThan(-20);
    const after = (await measureLoudnorm(FFMPEG, out))!;
    expect(Math.abs(after.i + 14)).toBeLessThanOrEqual(1);
    expect(after.tp).toBeLessThanOrEqual(-1);
    // Clicks (sharp attacks): the AAC encode overshoots the limiter; masterVariant lowers it and keeps the loudness.
    const clicks = join(d, 'clicks.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*2400*t)*exp(-mod(t,0.25)*60)':d=12:s=48000", '-ac', '2', clicks]);
    const video = join(d, 'v.mp4');
    await fakeFinal(FFMPEG, join(d, 'm.mp4'), { frames: 360 });
    await encodeDelivery(FFMPEG, join(d, 'm.mp4'), video, { preset: 'ultrafast' });
    const variant = join(d, 'variant.mp4');
    const v = await masterVariant(FFMPEG, clicks, video, variant);
    expect(v.tp!).toBeLessThanOrEqual(-1);
    const delivered = (await measureLoudnorm(FFMPEG, variant))!;
    expect(Math.abs(delivered.i + 14)).toBeLessThanOrEqual(1);
  });

  it('mixes cues into a 48 kHz track and muxes it next to a stream-copied delivery video (AAC 48 kHz, High profile, faststart)', async () => {
    const d = tmp();
    const master = join(d, 'master.mp4');
    await fakeFinal(FFMPEG, master, { frames: 90 });
    const video = join(d, 'video.mp4');
    await encodeDelivery(FFMPEG, master, video, { preset: 'ultrafast' });
    const cue = join(d, 'click.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*2400*t)*exp(-t*90)':d=0.06:s=48000", cue]);
    const mix = join(d, 'mix.wav');
    await mixTrack(FFMPEG, { cues: [{ atMs: 0, file: cue, gainDb: -6 }, { atMs: 1500, file: cue, gainDb: -6 }], durationS: 3, out: mix });
    const out = join(d, 'final.mp4');
    await muxVariant(FFMPEG, video, mix, out);
    const probe = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,sample_rate,channels', '-of', 'json', out]).toString()) as { streams: Record<string, string | number>[] };
    expect(probe.streams.find((s) => s.codec_type === 'video')).toMatchObject({ codec_name: 'h264', profile: 'High' });
    expect(probe.streams.find((s) => s.codec_type === 'audio')).toMatchObject({ codec_name: 'aac', sample_rate: '48000', channels: 2 });
    const md5 = (f: string) => execFileSync(FFMPEG, ['-v', 'error', '-i', f, '-map', '0:v', '-c', 'copy', '-f', 'md5', '-']).toString();
    expect(md5(out)).toBe(md5(video));
    const head = readFileSync(out).subarray(0, 64).toString('latin1');
    expect(head.indexOf('moov')).toBeGreaterThan(-1);
  });
});
