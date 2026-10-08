import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_NARRATOR, loadConfig, producePlan, UPLOAD_MAX_BYTES, type AudioPlan } from '@videogen/shared';
import { createProduceRun, getAsset, getNarratorVoice, getRunContext, insertArtifact, insertAsset, listAssets, setNarratorVoice } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { FakeAudioDriver } from '../../worker/src/audio/driver.ts';
import { seedReadyVideo } from '../../worker/src/dev/seed-ready.ts';
import { audioRefErrors } from '../../worker/src/pipeline/fixer.ts';
import { runPreflight } from '../../worker/src/pipeline/preflight.ts';
import { effectiveAudioPlan, LicenseError, soundPlan, withImportedSfx } from '../../worker/src/pipeline/sound.ts';
import type { StepDeps } from '../../worker/src/pipeline/steps.ts';
import type { StepContext } from '../../worker/src/pipeline/types.ts';
import { voiceExecutor } from '../../worker/src/pipeline/voice-step.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const H = { host: '127.0.0.1:5180' };
const EVIL = { ...H, origin: 'http://evil.example' };
const MAX = 256 * 1024;
let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;
const dataDir = mkdtempSync(join(tmpdir(), 'vg-api-assets-'));
const work = mkdtempSync(join(tmpdir(), 'vg-api-assets-src-'));

const tone = (name: string, hz: number, s: number) => {
  const f = join(work, name);
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${s}`, '-ac', '1', '-ar', '48000', f]);
  return readFileSync(f);
};

beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent', dataDir }, uploadMaxBytes: MAX });
});
afterAll(async () => {
  await app.close(); await hub.stop(); await t.drop();
  rmSync(dataDir, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true });
});

const upload = (body: Buffer, ext = 'wav', headers: Record<string, string> = H) =>
  app.inject({ method: 'POST', url: `/api/uploads?ext=${encodeURIComponent(ext)}`, headers: { ...headers, 'content-type': 'application/octet-stream' }, payload: body });
const uploaded = async (body: Buffer, ext = 'wav') => {
  const r = await upload(body, ext);
  expect(r.statusCode).toBe(201);
  return r.json() as { uploadId: string; sha: string; bytes: number; durationMs: number };
};
const importAsset = (payload: object, headers: Record<string, string> = H) => app.inject({ method: 'POST', url: '/api/assets', headers, payload });
const uploads = () => (existsSync(join(dataDir, 'uploads')) ? readdirSync(join(dataDir, 'uploads')) : []);
const audit = async (action: string) => (await t.pool.query('SELECT subject_id, data FROM audit_log WHERE action = $1 ORDER BY seq', [action])).rows;
const base = { kind: 'music', author: 'Ada Yazar', licenseText: 'Creative Commons lisans metni (test)' };

describe('asset ledger endpoints (plan M7 T5)', () => {
  it('upload then import: a CC0 track is allowed, a CC-BY track without attribution is stored as rejected with the Turkish reason, a duplicate returns the stored verdict; a non-audio file, a disallowed extension, an upload over 200 MB, a non-uuid or unknown uploadId (path traversal) and a non-local Origin are refused; the upload file is removed after import', async () => {
    expect(UPLOAD_MAX_BYTES).toBe(200 * 1024 * 1024);
    const calm = tone('calm.wav', 330, 1);
    const up = await uploaded(calm);
    expect(up).toMatchObject({ uploadId: expect.stringMatching(/^[0-9a-f-]{36}$/), sha: expect.stringMatching(/^[0-9a-f]{64}$/), bytes: calm.length });
    expect(Math.abs(up.durationMs - 1000)).toBeLessThan(50);
    expect(uploads()).toEqual([`${up.uploadId}.wav`]);

    const cc0 = await importAsset({ ...base, uploadId: up.uploadId, title: 'Sakin', license: 'CC0-1.0', source: 'https://example.org/sakin' });
    expect(cc0.statusCode).toBe(201);
    expect(cc0.json()).toMatchObject({ created: true, asset: { title: 'Sakin', kind: 'music', licenseSpdx: 'CC0-1.0', allowed: true, reason: null, sourceUrl: 'https://example.org/sakin', blobSha: up.sha, used: 0 } });
    expect(uploads()).toEqual([]);

    const bed = await uploaded(tone('bed.wav', 440, 1));
    const ccby = await importAsset({ ...base, uploadId: bed.uploadId, title: 'Yatak', license: 'CC-BY-4.0' });
    expect(ccby.statusCode).toBe(201);
    expect(ccby.json()).toMatchObject({ created: true, asset: { title: 'Yatak', allowed: false, reason: 'CC-BY-4.0 atıf metni olmadan kullanılamaz' } });

    // The same bytes again (another license claimed): the stored verdict, not a new judgement.
    const again = await uploaded(calm, 'wav');
    const dup = await importAsset({ ...base, uploadId: again.uploadId, title: 'Başka ad', license: 'CC-BY-NC-4.0' });
    expect(dup.statusCode).toBe(200);
    expect(dup.json()).toMatchObject({ created: false, asset: { id: cc0.json().asset.id, title: 'Sakin', licenseSpdx: 'CC0-1.0', allowed: true } });
    expect(uploads()).toEqual([]);

    // Refusals: not audio, an extension outside the list, too large, a bad or unknown upload id, a foreign Origin.
    const text = await upload(Buffer.from('bu bir ses dosyası değil\n'.repeat(20)));
    expect([text.statusCode, text.json().error]).toEqual([400, 'dosya ses olarak okunamadı']);
    for (const ext of ['exe', 'wav/../x', '']) expect((await upload(calm, ext)).statusCode).toBe(400);
    const big = await upload(Buffer.alloc(MAX + 1));
    expect(big.statusCode).toBe(413);
    expect(uploads()).toEqual([]);
    for (const uploadId of ['../../etc/passwd', `${'0'.repeat(36)}`, 'ABCDEF00-0000-4000-8000-000000000000.wav']) {
      expect((await importAsset({ ...base, uploadId, title: 'x', license: 'CC0-1.0' })).statusCode).toBe(400);
    }
    expect((await importAsset({ ...base, uploadId: crypto.randomUUID(), title: 'x', license: 'CC0-1.0' })).statusCode).toBe(404);
    expect((await upload(calm, 'wav', EVIL)).statusCode).toBe(403);
    const pending = await uploaded(tone('third.wav', 550, 1));
    expect((await importAsset({ ...base, uploadId: pending.uploadId, title: 'x', license: 'CC0-1.0' }, EVIL)).statusCode).toBe(403);
    expect((await importAsset({ ...base, uploadId: pending.uploadId, kind: 'font', title: 'x', license: 'CC0-1.0' })).statusCode).toBe(400);
    expect((await importAsset({ ...base, uploadId: pending.uploadId, title: 'x', license: 'CC0-1.0', licenseText: ' ' })).statusCode).toBe(400);
    expect(uploads()).toEqual([`${pending.uploadId}.wav`]);

    expect((await audit('asset.imported')).map((r) => r.data.title)).toEqual(['Sakin']);
    expect((await audit('asset.rejected')).map((r) => r.data)).toEqual([expect.objectContaining({ title: 'Yatak', reason: 'CC-BY-4.0 atıf metni olmadan kullanılamaz' })]);
    expect((await audit('asset.exists')).map((r) => r.subject_id)).toEqual([cc0.json().asset.id]);
  });

  it('GET /api/assets lists license fields, revocation and usage by kind; POST revoke audits asset.revoked with the reason; bin/assets.mjs revoke does the same and prints no path outside the data dir', async () => {
    const [sakin] = (await listAssets(t.pool, { kind: 'music', allowedOnly: true })).filter((a) => a.title === 'Sakin');
    const r = await createProduceRun(t.pool, { productName: 'Liste', audioMode: 'silent', plan: producePlan('silent') });
    await insertArtifact(t.pool, { runId: r.runId, versionId: r.versionId, kind: 'audio_plan', content: { cues: [], music: { assetId: sakin!.id, title: 'Sakin', license: 'CC0-1.0', attribution: null, gainDb: -20 } } });
    const sfx = await uploaded(tone('tik.wav', 1200, 0.2));
    expect((await importAsset({ ...base, uploadId: sfx.uploadId, kind: 'sfx', title: 'tık', license: 'LicenseRef-Pixabay', tags: ['click'] })).statusCode).toBe(201);
    await insertAsset(t.pool, { kind: 'font', title: 'Yazı tipi', blobSha: sakin!.blobSha, licenseSpdx: 'CC0-1.0', author: 'F', allowed: true });

    const music = (await app.inject({ url: '/api/assets?kind=music', headers: H })).json();
    expect(music.map((a: { title: string }) => a.title)).toEqual(['Sakin', 'Yatak']);
    expect(music[0]).toEqual({
      id: sakin!.id, kind: 'music', title: 'Sakin', licenseSpdx: 'CC0-1.0', author: 'Ada Yazar', sourceUrl: 'https://example.org/sakin', attribution: null, allowed: true, reason: null,
      revokedAt: null, revokeReason: null, durationMs: expect.any(Number), tags: [], blobSha: sakin!.blobSha, createdAt: expect.any(String), used: 1,
    });
    expect((await app.inject({ url: '/api/assets?kind=sfx', headers: H })).json()).toEqual([expect.objectContaining({ title: 'tık', licenseSpdx: 'LicenseRef-Pixabay', tags: ['click'], used: 0 })]);
    // Without a kind: music, SFX and voice references only (fonts, HDRIs and 3D are not the pipeline's).
    expect((await app.inject({ url: '/api/assets', headers: H })).json().map((a: { title: string }) => a.title)).toEqual(['Sakin', 'Yatak', 'tık']);
    expect((await app.inject({ url: '/api/assets?kind=font', headers: H })).statusCode).toBe(400);

    const revoke = (id: string, payload: object, headers = H) => app.inject({ method: 'POST', url: `/api/assets/${id}/revoke`, headers, payload });
    expect((await revoke(sakin!.id, { reason: '  ' })).statusCode).toBe(400);
    expect((await revoke('not-a-uuid', { reason: 'r' })).statusCode).toBe(400);
    expect((await revoke(crypto.randomUUID(), { reason: 'r' })).statusCode).toBe(404);
    expect((await revoke(sakin!.id, { reason: 'r' }, EVIL)).statusCode).toBe(403);
    const ok = await revoke(sakin!.id, { reason: 'Kaynak sitesi lisansı değiştirdi' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ asset: { id: sakin!.id, allowed: false, revokeReason: 'Kaynak sitesi lisansı değiştirdi', revokedAt: expect.any(String), reason: 'Kaynak sitesi lisansı değiştirdi', used: 1 }, narratorReset: false });
    expect((await revoke(sakin!.id, { reason: 'tekrar' })).statusCode).toBe(409);
    expect(await audit('asset.revoked')).toEqual([{ subject_id: sakin!.id, data: { kind: 'music', title: 'Sakin', reason: 'Kaynak sitesi lisansı değiştirdi' } }]);
    expect((await app.inject({ url: '/api/assets?kind=music', headers: H })).json()[0]).toMatchObject({ allowed: false, revokeReason: 'Kaynak sitesi lisansı değiştirdi' });

    const cli = (...args: string[]) => new Promise<{ code: number; out: string }>((done) => {
      execFile(process.execPath, [join(ROOT, 'bin/assets.mjs'), ...args], {
        cwd: ROOT, timeout: 30_000, env: { ...process.env, VG_DATA_DIR: dataDir, VG_DATABASE_URL: t.appUrl, VG_ADMIN_DATABASE_URL: t.adminUrl },
      }, (err, stdout, stderr) => done({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` }));
    });
    const tik = (await listAssets(t.pool, { kind: 'sfx' })).find((a) => a.title === 'tık')!;
    expect((await cli('revoke', tik.id)).code).toBe(2);
    const done = await cli('revoke', tik.id, '--reason', 'Pixabay sayfası kaldırıldı');
    expect(done.code).toBe(0);
    expect(done.out).toContain('izin geri alındı: tık');
    expect((done.out.match(/\/[^\s'"()]+/g) ?? []).filter((p) => !p.startsWith(dataDir))).toEqual([]);
    expect(await getAsset(t.pool, tik.id)).toMatchObject({ allowed: false, revokeReason: 'Pixabay sayfası kaldırıldı' });
    const twice = await cli('revoke', tik.id, '--reason', 'yine');
    expect(twice.code).toBe(3);
    expect(twice.out).toContain('zaten geri alınmış');
    expect((await audit('asset.revoked')).map((r) => [r.subject_id, r.data.reason])).toEqual([[sakin!.id, 'Kaynak sitesi lisansı değiştirdi'], [tik.id, 'Pixabay sayfası kaldırıldı']]);
  });

  it('a revoked asset is refused by compose (sound plan), the fixer\'s audio check, the preflight music count and publish; a revoked voice reference is refused by the voice preflight and the voice step, and revoking the narrator\'s reference resets the narrator to the stock voice in the same transaction (audited); an existing final stays playable', { timeout: 60_000 }, async () => {
    const v = await seedReadyVideo(t.pool, dataDir, FFMPEG);
    const revoke = (id: string, reason: string) => app.inject({ method: 'POST', url: `/api/assets/${id}/revoke`, headers: H, payload: { reason } });
    const allowedMusic = async () => listAssets(t.pool, { kind: 'music', allowedOnly: true });
    const ctx = (await getRunContext(t.pool, v.runId))!;
    const preflight = runPreflight({ pool: t.pool, audio: new FakeAudioDriver(), dataDir });
    const silent = { ...ctx, audioMode: 'silent' as const, run: { ...ctx.run, plan: producePlan('silent') } };
    const before = (await allowedMusic()).length;
    expect(before).toBeGreaterThan(0);
    expect(await preflight(silent)).toBeNull();
    expect((await app.inject({ method: 'POST', url: `/api/videos/${v.videoId}/exports/shorts`, headers: H, payload: {} })).statusCode).toBe(200);

    expect((await revoke(v.musicAssetId, 'atıf sahibi izni geri çekti')).statusCode).toBe(200);
    expect((await revoke(v.sfxAssetId, 'efekt kaynağı kaldırıldı')).statusCode).toBe(200);
    const bed = (await getAsset(t.pool, v.musicAssetId))!;
    const klik = (await getAsset(t.pool, v.sfxAssetId))!;

    // Compose: a stored plan naming the track no longer resolves; handing the asset in directly is refused; the imported SFX drops out of the library.
    const stored: AudioPlan = { version: 1, mode: 'silent', music: { asset_id: bed.id, gain_db: -18 }, vo_gain_db: 0, duck_db: 12, sfx: { gain_offset_db: 0, exclude: [] }, mastering: { target_lufs: -14, tp: -1 } };
    expect(() => effectiveAudioPlan({ stored, mode: 'silent', music: [bed], seed: v.videoId })).toThrow(LicenseError);
    const tracks = await allowedMusic();
    expect(() => effectiveAudioPlan({ stored, mode: 'silent', music: tracks, seed: v.videoId })).toThrow(LicenseError);
    const lib = Object.fromEntries(['whoosh', 'swoosh', 'click', 'snap', 'tick', 'thud'].map((n) => [n, { ...klik, allowed: true, revokedAt: null, id: `lib-${n}` }])) as Parameters<typeof soundPlan>[1];
    expect(() => soundPlan([], lib, bed)).toThrow(/izinsiz müzik: Yatak/);
    expect(() => soundPlan([{ name: 'click', atMs: 0, source: 'hook' }], { ...lib, click: klik }, null)).toThrow(/izinsiz ses: click/);
    expect(withImportedSfx(lib, [{ ...klik, title: 'click' }]).click.id).toBe('lib-click');

    // The fixer may not point the plan at it.
    const allowedMap = new Map((await allowedMusic()).map((a) => [a.id, a.title]));
    expect(audioRefErrors({ next: stored, prev: { ...stored, music: { asset_id: null, gain_db: -18 } }, mode: 'silent', allowedMusic: allowedMap })[0]).toMatch(`ses planı: müzik ${bed.id} izinli müzik listesinde yok`);

    // The preflight count drops by one; with every track revoked a silent video is refused.
    expect((await allowedMusic()).length).toBe(before - 1);
    for (const a of await allowedMusic()) expect((await revoke(a.id, 'hepsi')).statusCode).toBe(200);
    expect(await preflight(silent)).toMatch(/^Seslendirmesiz video için izinli bir müzik parçası gerekli/);

    // Publish and the Shorts export refuse; the existing final is still served.
    const shorts = await app.inject({ method: 'POST', url: `/api/videos/${v.videoId}/exports/shorts`, headers: H, payload: {} });
    expect([shorts.statusCode, shorts.json().error]).toEqual([409, 'Klik artık izinli değil; Yatak artık izinli değil']);
    expect((await app.inject({ url: `/api/blobs/${v.musicSha}`, headers: H })).statusCode).toBe(200);

    // Voice: an own-voice reference becomes the narrator; revoking it resets the narrator to the stock voice with an audit row.
    const ref = await uploaded(tone('ses.wav', 180, 2));
    const own = (await importAsset({ ...base, uploadId: ref.uploadId, kind: 'voice_ref', title: 'Kendi sesim', license: 'LicenseRef-Own-Voice', author: 'Alper' })).json().asset;
    expect(own.allowed).toBe(true);
    const clone = { engine: 'chatterbox' as const, voice: { kind: 'clone' as const, asset_id: own.id } };
    expect((await app.inject({ method: 'PUT', url: '/api/narrator-voice', headers: H, payload: clone })).statusCode).toBe(200);
    const vo = { ...ctx, audioMode: 'vo' as const, run: { ...ctx.run, plan: producePlan('vo') } };
    expect(await preflight(vo)).toBeNull();
    const r = await revoke(own.id, 'rıza geri çekildi');
    expect(r.json()).toMatchObject({ narratorReset: true, asset: { allowed: false } });
    expect(await getNarratorVoice(t.pool)).toEqual({ voice: DEFAULT_NARRATOR, chosen: true });
    expect((await audit('settings.narrator_voice')).at(-1)!.data).toEqual({ from: clone, to: DEFAULT_NARRATOR, reason: 'revoked' });
    expect((await app.inject({ url: '/api/narrator-voice', headers: H })).json().options[0].voices.map((o: { kind: string }) => o.kind)).toEqual(['preset']);

    // A stale setting still naming the revoked (or a never-allowed) reference is refused by the voice preflight and the voice step.
    const foreign = (await importAsset({ ...base, uploadId: (await uploaded(tone('baska.wav', 210, 2))).uploadId, kind: 'voice_ref', title: 'Başkasının sesi', license: 'CC0-1.0' })).json().asset;
    expect(foreign.allowed).toBe(false);
    const deps = { pool: t.pool, dataDir, audio: new FakeAudioDriver() } as unknown as StepDeps;
    const step = voiceExecutor(deps);
    const stepCtx = { runId: v.runId, videoId: v.videoId, stepId: crypto.randomUUID(), audioMode: 'vo', fixRound: 0, runDir: join(dataDir, 'runs', v.runId), progress: () => {}, status: () => {}, signal: new AbortController().signal } as unknown as StepContext;
    for (const [id, why] of [[own.id, 'ses referansının izni geri alındı: Kendi sesim'], [foreign.id, 'ses referansı izinli değil: Başkasının sesi']] as const) {
      await setNarratorVoice(t.pool, { engine: 'chatterbox', voice: { kind: 'clone', asset_id: id } });
      expect(await preflight(vo)).toBe(`Seslendirme kullanılamıyor: ${why}`);
      expect(await step.run(stepCtx, 'h'.repeat(64))).toEqual({ status: 'failed', error: why, retry: false });
    }
    await setNarratorVoice(t.pool, { ...DEFAULT_NARRATOR, voice: { ...DEFAULT_NARRATOR.voice } });
  });
});
