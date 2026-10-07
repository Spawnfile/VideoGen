import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QcReportSchema } from '@videogen/shared';
import { latestArtifact } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { qcExecutor } from '../src/pipeline/final-steps.ts';
import { importAsset } from '../src/assets.ts';
import { finalHarness } from '../test/final-helpers.ts';

/** Moved out of `npm test` by the M5c time budget (plan H18, T1 Step 0); the end-to-end "ready" test in qc-step.test.ts also measures both variants and records the report. */
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';

describe('qc step', () => {
  it('measures both variants and records the report; the note carries gates and the D6/D7 scores', async () => {
    const h = finalHarness(t);
    const { r, ctx } = await h.composed('Tükenmez kalem');
    // Review #2: a music track added after the compose changes the next compose's hash, but this final is not stale.
    const bed = join(h.dataDir, 'late.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=5:c=brown:r=48000:a=0.3:seed=8', '-ac', '2', bed]);
    writeFileSync(join(h.dataDir, 'late.txt'), 'CC0 1.0 (test)');
    await importAsset(t.pool, h.dataDir, FFMPEG, { kind: 'music', file: bed, title: 'Geç yatak', spdx: 'CC0-1.0', author: 'VideoGen test', licenseTextFile: join(h.dataDir, 'late.txt') });
    const ex = qcExecutor(h.deps);
    const out = await ex.run(ctx('qc'), await ex.inputHash(ctx('qc')));
    expect(out).toMatchObject({ status: 'done', note: expect.stringMatching(/^G1 ✓ G5 ✓ G6 ✓ · D6 \d+\/12 · D7 \d\/5/) });
    const rep = (await latestArtifact(t.pool, r.runId, 'qc_report'))!;
    expect(QcReportSchema.safeParse(rep.content).success).toBe(true);
    expect(rep.meta).toEqual({ pass: true, musicSha: (await latestArtifact(t.pool, r.runId, 'final_video_music'))!.blobSha });
    expect((rep.content as { tiktok: { id: string }[] }).tiktok.map((c) => c.id)).toContain('g1_color');
    // The ledger is shared by this file's tests but the blob lives in this harness's data dir: take the late track out again.
    await t.pool.query("UPDATE assets SET allowed = false WHERE title = 'Geç yatak'");
    await h.stop();
  }, 240_000);

});
