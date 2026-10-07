import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssetRecord } from '@videogen/db';
import { LicenseError, matchSfx, pickMusic, planSfx, soundPlan, withImportedSfx, type SfxCue } from '../src/pipeline/sound.ts';
import { masterAudio, masterVariant, measureLoudnorm, mixTrack, parseLoudnormJson } from '../src/render/audio.ts';
import { encodeDelivery, fakeFinal, muxVariant } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const FX = resolve(import.meta.dirname, '../../../tests/fixtures');
const tmp = () => mkdtempSync(join(tmpdir(), 'vg-sound-'));
const asset = (o: Partial<AssetRecord>): AssetRecord => ({
  id: 'a', kind: 'sfx', title: 't', blobSha: 'x', licenseSpdx: 'CC0-1.0', sourceUrl: null, author: 'a', attribution: null, licenseSnapshotSha: null, allowed: true, tags: [], durationMs: 100, createdAt: '', ...o,
});
const lib = Object.fromEntries(['whoosh', 'swoosh', 'click', 'snap', 'tick', 'thud'].map((n) => [n, asset({ id: `sfx-${n}`, title: n })])) as Record<SfxCue['name'], AssetRecord>;

describe('sound plan, mix, mastering and the two variants', () => {
  it('plans SFX from scene events and storyboard cues: the hook whoosh at 0 ms, one cue per 2 frames, ≤ 3 of one sound per 10 s', () => {
    const events = (JSON.parse(readFileSync(join(FX, 'scene/kalem/events.json'), 'utf8')) as { events: { id: string; type: 'explode_start' | 'part_lock' | 'label_in' | 'zoom'; frame: number }[] }).events;
    const beats = (JSON.parse(readFileSync(join(FX, 'artifacts/storyboard-kalem.json'), 'utf8')) as { beats: { id: string; t_start: number; sfx_cues: string[] }[] }).beats;
    const cues = planSfx({ events, beats, fps: 30, durationS: 45 });
    expect(cues[0]).toEqual({ atMs: 0, name: 'whoosh', source: 'hook' });
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.atMs - cues[i - 1]!.atMs).toBeGreaterThanOrEqual(66);
    for (const c of cues) expect(cues.filter((k) => k.name === c.name && k.atMs <= c.atMs && c.atMs - k.atMs < 10_000).length).toBeLessThanOrEqual(3);
    expect(cues.some((c) => c.source.startsWith('event:explode_start') && c.name === 'whoosh')).toBe(true);
    const locks = planSfx({ events: [1, 2, 3, 4, 5].map((s) => ({ id: `l${s}`, type: 'part_lock' as const, frame: s * 30 })), beats: [], fps: 30, durationS: 40 });
    expect(locks.filter((c) => c.name === 'click').map((c) => c.atMs)).toEqual([1000, 2000, 3000]);
    expect([matchSfx('Whoosh'), matchSfx('kapak çıt sesi'), matchSfx('tık'), matchSfx('müzik')]).toEqual(['whoosh', 'snap', 'click', null]);
  });

  it('an imported allowed SFX whose title or tag names a library sound replaces the procedural one; a disallowed one never does', () => {
    const imported = [
      asset({ id: 'z-whoosh', title: 'Büyük whoosh efekti' }), asset({ id: 'b-whoosh', title: 'Hızlı vuş' }), asset({ id: 'a-click', title: 'Düğme', tags: ['Click'] }),
      asset({ id: 'c-thud', title: 'thud', allowed: false }), asset({ id: 'd-nc', title: 'snap', licenseSpdx: 'CC-BY-NC-4.0' }), asset({ id: 'm-song', kind: 'music', title: 'tick' }), asset({ id: 'n-plain', title: 'Ambiyans' }),
    ];
    const out = withImportedSfx(lib, imported);
    expect([out.whoosh.id, out.click.id]).toEqual(['b-whoosh', 'a-click']);
    expect([out.thud.id, out.snap.id, out.tick.id, out.swoosh.id]).toEqual(['sfx-thud', 'sfx-snap', 'sfx-tick', 'sfx-swoosh']);
    // an asset whose first named sound is already claimed takes its next candidate
    const spill = withImportedSfx(lib, [asset({ id: 'a-1', title: 'tık' }), asset({ id: 'a-2', title: 'tık', tags: ['snap'] })]);
    expect([spill.click.id, spill.snap.id]).toEqual(['a-1', 'a-2']);
    expect(withImportedSfx(lib, Object.values(lib))).toEqual(lib);
    expect(withImportedSfx(lib, [])).toEqual(lib);
    // the plan then uses the imported asset for that sound
    expect(soundPlan([{ atMs: 0, name: 'whoosh', source: 'hook' }], out, null).cues[0]).toMatchObject({ assetId: 'b-whoosh' });
  });

  it('picks music deterministically among allowed tracks only, and refuses any disallowed asset in the plan (spec §9 license gate)', () => {
    const tracks = [asset({ id: 'm1', kind: 'music', title: 'A' }), asset({ id: 'm2', kind: 'music', title: 'B' }), asset({ id: 'm3', kind: 'music', allowed: false, licenseSpdx: 'CC-BY-NC-4.0' }), asset({ id: 's', kind: 'sfx' })];
    const a = pickMusic(tracks, 'video-1');
    expect(['m1', 'm2']).toContain(a!.id);
    expect(pickMusic(tracks, 'video-1')!.id).toBe(a!.id);
    expect(pickMusic([tracks[2]!, tracks[3]!], 'video-1')).toBeNull();
    const cues: SfxCue[] = [{ atMs: 0, name: 'whoosh', source: 'hook' }];
    expect(soundPlan(cues, lib, tracks[0]!)).toEqual({ cues: [{ atMs: 0, name: 'whoosh', source: 'hook', assetId: 'sfx-whoosh', gainDb: -6 }], music: { assetId: 'm1', title: 'A', license: 'CC0-1.0', attribution: null, gainDb: -18 } });
    expect(() => soundPlan(cues, lib, tracks[2]!)).toThrow(LicenseError);
    expect(() => soundPlan(cues, { ...lib, whoosh: asset({ allowed: false }) }, null)).toThrow('izinsiz ses: whoosh');
    // Today's policy, not only the stored flag: a CC-BY row whose attribution was cleared is refused at use.
    expect(() => soundPlan(cues, lib, asset({ id: 'm9', kind: 'music', licenseSpdx: 'CC-BY-4.0', attribution: null }))).toThrow(LicenseError);
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
