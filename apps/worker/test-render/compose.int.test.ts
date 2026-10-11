import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getBlob, latestArtifact } from '@videogen/db';
import { layoutIssues, type LayoutManifest } from '@videogen/remotion/layout';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { importAsset } from '../src/assets.ts';
import { composeExecutor } from '../src/pipeline/final-steps.ts';
import { finalHarness } from '../test/final-helpers.ts';

/** Moved out of `npm test` by the M5c time budget (plan H18, T1 Step 0); compose with a music bed also runs in the end-to-end "ready" test (qc-step.test.ts) and the other compose-step tests. */
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const harnesses: ReturnType<typeof finalHarness>[] = [];
const setup = () => { const h = finalHarness(t); harnesses.push(h); return h; };
afterAll(async () => { for (const h of harnesses) await h.stop(); });

describe('compose step', () => {
  it('records the layout, the sound plan, the one final video (spec Z4: no music-free variant) and the cover; a second compose reuses it', async () => {
    const h = setup();
    const { deps, dataDir } = h;
    const bed = join(dataDir, 'bed.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=20:c=brown:r=48000:a=0.3:seed=5', '-ac', '2', bed]);
    const lic = join(dataDir, 'lic.txt');
    writeFileSync(lic, 'CC0 1.0 (test)');
    await importAsset(t.pool, dataDir, FFMPEG, { kind: 'music', file: bed, title: 'Test yatağı', spdx: 'CC0-1.0', author: 'VideoGen test', licenseTextFile: lic });
    const { r, ctx, runDir } = await h.framed('Tükenmez kalem');
    const ex = composeExecutor(deps);
    const hash = await ex.inputHash(ctx('compose'));
    expect(await ex.run(ctx('compose'), hash)).toMatchObject({ status: 'done', note: expect.stringMatching(/^1080×1920 · 0:13 · \d+ efekt · müzik: YAKLASIM müziği$/) });
    const kinds = (await t.pool.query('SELECT kind FROM artifacts WHERE run_id = $1 AND input_hash = $2 ORDER BY kind', [r.runId, hash])).rows.map((x) => x.kind);
    expect(kinds).toEqual(['audio', 'audio_plan', 'final_cover', 'final_video_music', 'layout', 'stem_music', 'stem_sfx']);
    const music = (await latestArtifact(t.pool, r.runId, 'final_video_music'))!;
    expect((await t.pool.query('SELECT width, height, codec, duration_ms FROM artifacts WHERE id = $1', [music.id])).rows[0]).toMatchObject({ width: 1080, height: 1920, codec: 'h264', duration_ms: 13033 });
    const layout = (await latestArtifact(t.pool, r.runId, 'layout'))!.content as LayoutManifest;
    expect(layout.frames.length).toBeGreaterThan(75); // 13 s YAKLASIM fixture
    expect(layoutIssues(layout)).toEqual([]);
    expect(await ex.reuse!(ctx('compose'), hash)).toBe(true);
    // Review #1: the master, the delivery encode, the WAVs and the variants are in the blob store; only the small manifests stay.
    expect(readdirSync(join(runDir, 'final', 'compose', hash.slice(0, 16))).sort()).toEqual(['audio_plan.json', 'layout.json']);
  }, 180_000);

});
