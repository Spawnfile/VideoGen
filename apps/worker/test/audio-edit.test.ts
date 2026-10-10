import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { audioEditPlan, type MusicScore } from '@videogen/shared';
import { createAudioEditRun, getBlob, getRunView, getVideoView, latestArtifact, listVersions } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { runEndToEnd } from './e2e-helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const videoStreamHash = (file: string) => execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'], { encoding: 'utf8' }).trim();

describe('audio edit (agent music design A6/A7)', () => {
  it('a finished video: the instruction reaches the composer, remix keeps the picture, records new finals, stems and qc under a new version that becomes best and current; refusals in Turkish', async () => {
    await runEndToEnd(t, 'Tükenmez kalem düzenleme', {
      after: async ({ o, h, run }) => {
        const before = (await getVideoView(t.pool, run.videoId))!;
        expect(before.status).toBe('ready');
        const finalBefore = (await latestArtifact(t.pool, run.runId, 'final_video_music'))!;
        expect(await createAudioEditRun(t.pool, { videoId: run.videoId, instruction: '   ', plan: audioEditPlan() })).toEqual({ error: 'talimat boş olamaz' });
        const edit = await createAudioEditRun(t.pool, { videoId: run.videoId, instruction: 'Müziği daha sakin yap, davulu kaldır.', plan: audioEditPlan() });
        if ('error' in edit) throw new Error(edit.error);
        // one active run per video
        expect(await createAudioEditRun(t.pool, { videoId: run.videoId, instruction: 'ikinci', plan: audioEditPlan() })).toEqual({ error: 'bu videoda devam eden bir üretim var' });
        await o.startRun(edit.runId);
        await vi.waitFor(async () => expect((await getRunView(t.pool, edit.runId))!.status).toBe('done'), { timeout: 120_000, interval: 300 });
        const view = (await getRunView(t.pool, edit.runId))!;
        expect(view.steps.map((s) => [s.key, s.status])).toEqual([['music', 'done'], ['remix', 'done']]);
        expect(view.steps[1]!.note).toMatch(/^ses yeniden karıştırıldı · 0:45 · \d+ efekt · ölçülen ses \d+\/8$/);
        // the instruction is the composer's (a user decision with its markers), next to the previous score
        const composer = h.specs.filter((s) => s.role === 'audio_director').at(-1)!;
        expect(composer.prompt).toContain('Müziği daha sakin yap, davulu kaldır.');
        expect(composer.prompt).toContain('Önceki partisyon');
        expect(composer.prompt).toContain('<<<TALIMAT');
        // new finals under the edit's version; the picture is the reviewed one, byte for byte
        const after = (await latestArtifact(t.pool, edit.runId, 'final_video_music'))!;
        expect(after.versionId).toBe(edit.versionId);
        const file = async (sha: string) => join(h.dataDir, (await getBlob(t.pool, sha))!.path);
        expect(videoStreamHash(await file(after.blobSha!))).toBe(videoStreamHash(await file(finalBefore.blobSha!)));
        for (const kind of ['stem_music', 'stem_sfx', 'qc_report', 'audio_plan', 'final_video_tiktok', 'final_cover', 'music', 'music_stem']) {
          expect(await latestArtifact(t.pool, edit.runId, kind), kind).not.toBeNull();
        }
        expect(((await latestArtifact(t.pool, edit.runId, 'music'))!.content as MusicScore).duration_s).toBe(45);
        const v = (await getVideoView(t.pool, run.videoId))!;
        expect(v.status).toBe('ready');
        expect((await t.pool.query('SELECT best_version_id, current_version_id FROM videos WHERE id = $1', [run.videoId])).rows[0]).toEqual({ best_version_id: edit.versionId, current_version_id: edit.versionId });
        const versions = await listVersions(t.pool, run.videoId);
        expect(versions.find((x) => x.id === edit.versionId)).toMatchObject({ reason: 'audio_edit' });
        expect((await t.pool.query("SELECT data FROM audit_log WHERE action = 'video.audio_edit_requested' AND run_id = $1", [edit.runId])).rows[0].data).toMatchObject({ parentRunId: run.runId, chars: 37 });
      },
    });
  }, 400_000);
});
