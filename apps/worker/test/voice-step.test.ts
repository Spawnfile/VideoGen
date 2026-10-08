import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { estimateVoS, StoryboardSchema, type Storyboard, type VoiceTrack } from '@videogen/shared';
import { getBlob, insertArtifact, setNarratorVoice } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { RenderError } from '../src/render/driver.ts';
import { storyboardExecutor } from '../src/pipeline/steps.ts';
import { lineSeed, voiceExecutor, voiceSource, voKey } from '../src/pipeline/voice-step.ts';
import { fx, voiceHarness } from './voice-helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const harness = () => { const h = voiceHarness(t); cleanups.push(() => h.stop()); return h; };

const sourceBoard = () => fx('storyboard-kalem-vo') as Storyboard;
const audits = async (runId: string, action: string) => (await t.pool.query('SELECT data FROM audit_log WHERE run_id = $1 AND action = $2', [runId, action])).rows.map((r) => r.data);
const trackOf = async (h: ReturnType<typeof harness>, runId: string) => (await h.artifacts(runId, 'voice_track')).at(-1)!;

describe('voice step', () => {
  it('first pass: lines from vo_text, the driver under the GPU lock, a retimed storyboard version (retimedFrom), voice_track with the FLAC stem, words and provenance; the note has lines, length, worst CER and the provisional voice mark; facts.first_word_s ≤ 0,3', async () => {
    // The fixture is itself a valid, realistic VO storyboard.
    const vo = sourceBoard();
    expect(StoryboardSchema.safeParse(vo).success).toBe(true);
    expect(estimateVoS(vo)).toBeGreaterThanOrEqual(36);
    expect(estimateVoS(vo)).toBeLessThanOrEqual(52);

    const h = harness();
    h.flags.realStem = true;
    const { r, runDir, ctx, sourceId } = await h.prepare('Kalem vo 1');
    const c = ctx('voice');
    expect(await h.exec(c)).toEqual({ status: 'done', note: '7 satır · 0:45 · en kötü CER %0,0 · Chatterbox · hazır ses · GEÇİCİ ses (K17)' });

    // (2)(3): one line per beat (target = beat − lead − gap), cache next to the output dir, the lock held by the step.
    expect(h.calls).toHaveLength(1);
    const call = h.calls[0]!;
    expect(call.holder).toBe(c.stepId);
    expect(call.input.lines.map((l) => [l.id, l.text, l.targetMs, l.seed])).toEqual(vo.beats.map((b) => [b.id, b.vo_text!.tr, Math.round((b.t_end - b.t_start) * 1000) - 280, lineSeed(r.runId, b.id)]));
    expect(call.input.cacheDir).toBe(join(runDir, 'voice', 'cache'));
    expect(join(call.input.outDir, '..')).toBe(join(runDir, 'voice'));

    // (7): the Fake lasts exactly its target, so the beat times hold (maxShiftS 0) and the storyboard is a new version marked retimedFrom.
    const boards = await h.artifacts(r.runId, 'storyboard');
    expect(boards).toHaveLength(2);
    expect(boards[1].meta).toMatchObject({ retimedFrom: sourceId, maxShiftS: 0, specVersion: 2 });
    expect(boards[1].content.beats.map((b: { t_start: number; t_end: number }) => [b.t_start, b.t_end])).toEqual(vo.beats.map((b) => [b.t_start, b.t_end]));
    expect((await voiceSource(h.deps, r.runId))!.source.id).toBe(sourceId);

    const rows = await h.artifacts(r.runId, 'voice_track');
    expect(rows).toHaveLength(1);
    const track = rows[0].content as VoiceTrack;
    expect(rows[0].meta).toMatchObject({ fixRound: 0, rebuild: false, sourceStoryboardId: sourceId, voKey: voKey(boards[1].content) });
    expect(track.lines.map((l) => l.start_ms)).toEqual(vo.beats.map((b) => Math.round(b.t_start * 1000) + 100));
    expect(track.facts.first_word_s).toBeLessThanOrEqual(0.3);
    expect(track.provider).toEqual({ engine: 'chatterbox', model: 'fake-tts-chatterbox', voice: { kind: 'preset', id: 'hazir' }, aigc_label: false });
    expect(track.words.length).toBeGreaterThan(40);

    // The stem: a blob on disk, FLAC 48 kHz mono, the video's length; written before the track.
    const stem = (await h.artifacts(r.runId, 'voice_stem'))[0];
    expect(rows[0].meta.stemSha).toBe(stem.blob_sha);
    const blob = (await getBlob(t.pool, stem.blob_sha))!;
    const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'default=nw=1', join(h.dataDir, blob.path)]).toString();
    expect(probe).toMatch(/codec_name=flac/);
    expect(probe).toMatch(/sample_rate=48000/);
    expect(probe).toMatch(/channels=1/);
    expect(Number(/duration=([\d.]+)/.exec(probe)![1])).toBeCloseTo(45, 2);
    // Levelled to −16 LUFS, and the lines sit at their placed moments: silence ends at the first and at a later line's start (±30 ms).
    const heard = spawnSync('ffmpeg', ['-nostats', '-i', join(h.dataDir, blob.path), '-af', 'ebur128,silencedetect=n=-50dB:d=0.05', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const summary = heard.slice(heard.lastIndexOf('Summary:'));
    expect(Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)![1])).toBeGreaterThan(-17);
    expect(Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)![1])).toBeLessThan(-15);
    const speechAt = [...heard.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
    for (const i of [0, 3]) expect(speechAt.some((x) => Math.abs(x - track.lines[i]!.start_ms / 1000) <= 0.03)).toBe(true);
    expect((await audits(r.runId, 'voice.synthesized'))[0]).toMatchObject({ engine: 'chatterbox', lines: 7, attempts: 7, maxCer: 0 });
    expect(await audits(r.runId, 'voice.retimed')).toEqual([{ maxShiftS: 0, rebuild: false }]);

    // "uzun anlatım": every line 0.5 s longer than its target → the beats stretch, a first pass never rebuilds.
    h.flags.realStem = false;
    h.opts.overrunMs = 500;
    const long = await h.prepare('Kalem vo 1 uzun anlatım');
    expect(await h.exec(long.ctx('voice'))).toMatchObject({ status: 'done', note: expect.stringContaining('7 satır · 0:49 ·') });
    const stretched = (await h.artifacts(long.r.runId, 'storyboard')).at(-1)!;
    expect(stretched.meta.maxShiftS).toBe(3.5);
    expect(stretched.content.duration_s).toBe(48.5);
    expect((await trackOf(h, long.r.runId)).meta.rebuild).toBe(false);
  });

  it('replay and restart: a stored voice_track with the same hash is reused without the driver (also in fix round 1 after the track exists: same hash); the source storyboard is the newest one not written by the voice step; unchanged lines come from the line cache', async () => {
    const h = harness();
    const { r, ctx, addSource, sourceId } = await h.prepare('Kalem vo 2');
    const c0 = ctx('voice');
    expect(await h.exec(c0)).toMatchObject({ status: 'done' });
    expect(await h.exec(c0)).toEqual({ status: 'done', note: 'önceki geçerli çıktı kullanıldı' });
    expect(h.calls).toHaveLength(1);

    // The retimed version is the latest storyboard but never the source; a fixer's newer version is.
    expect((await voiceSource(h.deps, r.runId))!.source.id).toBe(sourceId);
    const board = sourceBoard();
    const fixed = await addSource({ ...board, version: 2, beats: board.beats.map((b, i) => (i === 1 ? { ...b, vo_text: { tr: 'Kalemin içinden yalnızca beş parça çıkıyor.' } } : b)) });
    expect((await voiceSource(h.deps, r.runId))!.source.id).toBe(fixed);

    const c1 = ctx('voice', { fixRound: 1 });
    const h1 = await h.executor.inputHash(c1);
    expect(h1).not.toBe(await h.executor.inputHash(c0));
    expect(await h.exec(c1)).toMatchObject({ status: 'done', note: expect.stringContaining('vuruşlar korundu') });
    expect(await h.exec(c1)).toEqual({ status: 'done', note: 'önceki geçerli çıktı kullanıldı' });
    expect(await h.executor.inputHash(c1)).toBe(h1);
    expect(h.calls).toHaveLength(2);

    // Both calls share one cache directory and the unchanged lines carry the same seeds, i.e. the same cache keys.
    expect(h.calls[1]!.input.cacheDir).toBe(h.calls[0]!.input.cacheDir);
    const seeds = (i: number) => h.calls[i]!.input.lines.map((l) => l.seed);
    expect(seeds(1)).toEqual(seeds(0));
    expect(h.calls[1]!.input.lines[0]!.text).toBe(h.calls[0]!.input.lines[0]!.text);

    // Every input of the hash moves it: another fixer source, the engine pin, the narrator setting, the round's cause.
    expect(lineSeed('run-1', 'b1')).toBe(476494104);
    await addSource({ ...board, version: 3 });
    const hSource = await h.executor.inputHash(c1);
    expect(hSource).not.toBe(h1);
    expect(await voiceExecutor(h.deps, { pin: { chatterbox: 'chatterbox-x', freya: 'freya-tts@146d36c1' } }).inputHash(c1)).not.toBe(hSource);
    expect(await voiceExecutor(h.deps, { pin: { chatterbox: 'chatterbox-multilingual-v3@5de7a54a', freya: 'freya-x' } }).inputHash(c1)).not.toBe(hSource);
    let hNarrator = '';
    try {
      await setNarratorVoice(t.pool, { engine: 'freya', voice: { kind: 'preset', id: 'leyla' } });
      hNarrator = await h.executor.inputHash(c1);
    } finally { await t.pool.query("DELETE FROM settings WHERE key = 'narrator.voice'"); }
    expect(hNarrator).not.toBe(hSource);
    expect(await h.executor.inputHash(c1)).toBe(hSource);
    await insertArtifact(t.pool, { runId: r.runId, kind: 'final_verdict', content: { verdict: 'fix', failed: [] }, meta: { fixRound: 0 } });
    await insertArtifact(t.pool, { runId: r.runId, kind: 'fix_report', meta: { fixRound: 0, scope: 'voice', changed: ['storyboard.vo'], claimed: 'compose' } });
    const hCause = await h.executor.inputHash(c1);
    expect(hCause).not.toBe(hSource);
    // A newer verdict of the same round is another cause id.
    await insertArtifact(t.pool, { runId: r.runId, kind: 'final_verdict', content: { verdict: 'fix', failed: [] }, meta: { fixRound: 0 } });
    expect(await h.executor.inputHash(c1)).not.toBe(hCause);
  });

  it('a line that stays over CER 5 % after the retries stops for a human with the beat and the CER; a VO over 55 s stops with the reason; a crash after the retimed storyboard reruns from the same source without a second retimed version', async () => {
    const h = harness();
    h.o.tweak = (out) => ({ ...out, failed: ['b3-hazne'], lines: out.lines.map((l) => (l.id === 'b3-hazne' ? { ...l, cer: 0.074, attempts: 3 } : l)) });
    const bad = await h.prepare('Kalem vo 3a');
    expect(await h.exec(bad.ctx('voice'))).toEqual({
      status: 'needs_human',
      reason: "seslendirme anlaşılmıyor: vuruş b3-hazne, CER %7,4 (3 denemeden sonra); Ayarlar'dan anlatıcı sesini değiştirebilir ya da vo_text'i sadeleştirebilirsiniz",
    });
    expect(await h.artifacts(bad.r.runId, 'voice_track')).toHaveLength(0);
    expect(await h.artifacts(bad.r.runId, 'voice_stem')).toHaveLength(0);

    // Two failed lines: the attempts figure is the largest. A line over 5 % that the CLI did not list as failed counts too.
    h.o.tweak = (out) => ({ ...out, failed: ['b3-hazne', 'b5-mekanizma'], lines: out.lines.map((l) => (l.id === 'b3-hazne' ? { ...l, cer: 0.074, attempts: 2 } : l.id === 'b5-mekanizma' ? { ...l, cer: 0.06, attempts: 3 } : l)) });
    expect(await h.exec((await h.prepare('Kalem vo 3a2')).ctx('voice'))).toMatchObject({ reason: expect.stringContaining('vuruş b3-hazne, CER %7,4; vuruş b5-mekanizma, CER %6,0 (3 denemeden sonra); Ayarlar') });
    h.o.tweak = (out) => ({ ...out, lines: out.lines.map((l) => (l.id === 'b2-patlatma' ? { ...l, cer: 0.0501, attempts: 3 } : l.id === 'b4-ikinci-kanca' ? { ...l, cer: 0.05 } : l)) });
    expect(await h.exec((await h.prepare('Kalem vo 3a3')).ctx('voice'))).toMatchObject({ status: 'needs_human', reason: expect.stringMatching(/^seslendirme anlaşılmıyor: vuruş b2-patlatma, CER %5,0 \(3 denemeden sonra\);/) });

    // A stopped run is not a failed step: the abort is rethrown for the orchestrator.
    h.o.tweak = undefined;
    const stopped = await h.prepare('Kalem vo 3a4');
    h.audioError = new RenderError('aborted', 'seslendirme durduruldu');
    await expect(h.exec(stopped.ctx('voice'))).rejects.toMatchObject({ kind: 'aborted' });
    h.audioError = new RenderError('unavailable', 'GPU yok');
    expect(await h.exec(stopped.ctx('voice'))).toEqual({ status: 'failed', error: 'GPU yok', retry: false });
    h.audioError = null;

    h.o.tweak = undefined;
    h.opts.overrunMs = 3000;
    const long = await h.prepare('Kalem vo 3b');
    expect(await h.exec(long.ctx('voice'))).toEqual({ status: 'needs_human', reason: "seslendirme 55 sn'yi aşıyor (66,0 sn): storyboard'daki VO metni kısaltılmalı" });
    expect(await h.artifacts(long.r.runId, 'storyboard')).toHaveLength(1);

    // A crash between the retimed storyboard and the track (the track is the commit mark): stem and one retimed version exist, the rerun
    // finds the same source and completes without a second version or a second stem row.
    h.opts.overrunMs = 0;
    const { r, ctx, sourceId } = await h.prepare('Kalem vo 3c');
    const c = ctx('voice');
    h.flags.crashAfterStoryboard = true;
    await expect(h.exec(c)).rejects.toThrow('crash after the retimed storyboard');
    h.flags.crashAfterStoryboard = false;
    const isRetimed = async () => (await h.artifacts(r.runId, 'storyboard')).filter((b) => b.meta.retimedFrom);
    expect(await isRetimed()).toHaveLength(1);
    expect(await h.artifacts(r.runId, 'voice_stem')).toHaveLength(1);
    expect(await h.artifacts(r.runId, 'voice_track')).toHaveLength(0);
    const hash = await h.executor.inputHash(c);
    expect(await h.executor.reuse!(c, hash)).toBe(false);
    expect(await h.exec(c)).toMatchObject({ status: 'done', note: expect.stringContaining('7 satır') });
    expect(await isRetimed()).toHaveLength(1);
    expect((await isRetimed())[0].meta.retimedFrom).toBe(sourceId);
    expect(await h.artifacts(r.runId, 'voice_stem')).toHaveLength(1);
    expect(await h.artifacts(r.runId, 'voice_track')).toHaveLength(1);

    // Reuse needs all of it: the stem file on disk and the retimed storyboard row.
    expect(await h.executor.reuse!(c, hash)).toBe(true);
    const stemFile = join(h.dataDir, (await getBlob(t.pool, (await h.artifacts(r.runId, 'voice_stem'))[0].blob_sha))!.path);
    renameSync(stemFile, `${stemFile}.away`);
    expect(await h.executor.reuse!(c, hash)).toBe(false);
    renameSync(`${stemFile}.away`, stemFile);
    expect(await h.executor.reuse!(c, hash)).toBe(true);
    await t.pool.query("DELETE FROM artifacts WHERE run_id = $1 AND kind = 'storyboard' AND meta->>'retimedFrom' IS NOT NULL", [r.runId]);
    expect(await h.executor.reuse!(c, hash)).toBe(false);
  });

  it('voice fix round: keeps the beat times when the new lines fit (rebuild false) and retimes when one overflows by more than 0,3 s (rebuild true, maxShiftS)', async () => {
    const h = harness();
    const { r, ctx, addSource } = await h.prepare('Kalem vo 4');
    const board = sourceBoard();
    const edit = (n: number): Storyboard => ({ ...board, version: board.version + n, beats: board.beats.map((b, i) => (i === 2 ? { ...b, vo_text: { tr: `Hazne yağ bazlı yoğun bir mürekkeple dolu ${n}.` } } : b)) });

    // The new lines fit the beats (the Fake lasts its target): the times stay, no retimed storyboard, no rebuild.
    await addSource(edit(1));
    const keep = await h.exec(ctx('voice', { fixRound: 1 }));
    expect(keep).toMatchObject({ status: 'done', note: expect.stringContaining(' · vuruşlar korundu') });
    const k = await trackOf(h, r.runId);
    expect(k.meta).toMatchObject({ fixRound: 1, rebuild: false, voiceHash: null });
    expect(k.content.lines.map((l: { start_ms: number }) => l.start_ms)).toEqual(board.beats.map((b) => Math.round(b.t_start * 1000) + 100));
    expect((await h.artifacts(r.runId, 'storyboard')).filter((b) => b.meta.retimedFrom)).toHaveLength(0);
    expect(await audits(r.runId, 'voice.retimed')).toEqual([{ maxShiftS: 0, rebuild: false }]);

    // Every line runs 0.4 s past its beat: over the 0.3 s tolerance → retimed, rebuild true.
    h.opts.overrunMs = 400;
    const s2 = await addSource(edit(2));
    const retime = await h.exec(ctx('voice', { fixRound: 2 }));
    expect(retime).toMatchObject({ status: 'done', note: expect.not.stringContaining('vuruşlar korundu') });
    const rt = await trackOf(h, r.runId);
    expect(rt.meta).toMatchObject({ fixRound: 2, rebuild: true, sourceStoryboardId: s2 });
    expect(rt.meta.voKey).not.toBe(k.meta.voKey);
    const re = (await h.artifacts(r.runId, 'storyboard')).filter((b) => b.meta.retimedFrom);
    expect(re).toHaveLength(1);
    expect(re[0].meta).toMatchObject({ retimedFrom: s2, maxShiftS: 2.8 });
    expect(re[0].content.duration_s).toBe(47.8);
    expect(rt.meta.voKey).toBe(voKey(re[0].content));
    // Beat ids are part of the key: renamed ids with equal text and times make the track stale.
    expect(voKey({ ...board, beats: board.beats.map((b) => ({ ...b, id: `${b.id}x` })) })).not.toBe(voKey(board));
    expect(await audits(r.runId, 'voice.retimed')).toContainEqual({ maxShiftS: 2.8, rebuild: true });

    // A rework round (the verdict of round 0 says so) always retimes, even when the lines fit; the build step does its own rework path (rebuild false).
    h.opts.overrunMs = 0;
    await insertArtifact(t.pool, { runId: r.runId, kind: 'final_verdict', content: { verdict: 'rework', failed: [] }, meta: { fixRound: 2 } });
    const s3 = await addSource(edit(3));
    expect(await h.exec(ctx('voice', { fixRound: 3 }))).toMatchObject({ status: 'done', note: expect.not.stringContaining('vuruşlar korundu') });
    const rw = await trackOf(h, r.runId);
    expect(rw.meta).toMatchObject({ fixRound: 3, rebuild: false, sourceStoryboardId: s3 });
    expect(rw.meta.voiceHash).toEqual(expect.any(String));
    expect((await h.artifacts(r.runId, 'storyboard')).filter((b) => b.meta.retimedFrom === s3)).toHaveLength(1);
    expect(existsSync(join(h.dataDir, (await getBlob(t.pool, rt.meta.stemSha))!.path))).toBe(true);
  });

  it('storyboard step in VO mode: a symbol in vo_text or a VO longer than 52 s goes back to the same session with the reason', async () => {
    const h = harness();
    const good = sourceBoard();
    const symbol = { ...good, beats: good.beats.map((b, i) => (i === 1 ? { ...b, vo_text: { tr: 'Tam 5 parça → hepsi burada' } } : b)) };
    const long = { ...good, beats: good.beats.map((b, i) => (i === 1 ? { ...b, vo_text: { tr: b.vo_text!.tr.repeat(3).slice(0, 300) } } : { ...b, vo_text: { tr: `${b.vo_text!.tr} ${b.vo_text!.tr}`.slice(0, 300) } })) };
    expect(estimateVoS(long)).toBeGreaterThan(52);
    const tries = [symbol, long, good];
    const deps = { ...h.deps, fakeScript: (_role: unknown, _ctx: unknown, attempt: number) => ({ fixture: 'basic', structured: tries[attempt] }) };
    const { ctx } = await h.prepare('Kalem vo 5');
    const out = await storyboardExecutor(deps as never).run(ctx('storyboard'), 'h');
    expect(out).toMatchObject({ status: 'done', note: '7 vuruş · 45 sn · kanca: Şaşırtıcı sayı' });
    expect(h.specs).toHaveLength(3);
    expect(h.specs[1]!.prompt).toContain('beats.1.vo_text: okunamayan karakter: →');
    expect(h.specs[2]!.prompt).toMatch(/seslendirme tahmini [\d,]+ sn: en çok 52 sn olmalı/);
  });
});
