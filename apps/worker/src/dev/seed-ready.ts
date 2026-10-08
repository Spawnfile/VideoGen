import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import { producePlan, RUBRIC_VERSION } from '@videogen/shared';
import {
  createProduceRun, insertArtifact, insertAsset, listRunSteps, recordReviewRound, setBestVersion, updateRun, updateStep, updateVideo,
} from '@videogen/db';
import { putBlob } from '../media.ts';

const run = (bin: string, args: string[]) => new Promise<void>((resolve, reject) => {
  execFile(bin, args, { timeout: 120_000 }, (err, _o, stderr) => (err ? reject(new Error(`${bin}: ${String(stderr).split('\n').slice(-3).join(' ')}`)) : resolve()));
});

export interface SeededVideo { videoId: string; versionId: string; runId: string; tiktokSha: string; musicSha: string; sfxAssetId: string; musicAssetId: string }

/**
 * Plan M6 T4/T8: a `ready` video without a pipeline run — real 6 s 1080×1920 h264/AAC finals (testsrc2 + sine, tiktok_api_kullanim.md §6),
 * a cover, a sound plan with an imported CC-BY SFX (both variants) and a CC-BY music bed (music variant), a storyboard hook, two research
 * claims, a passed G2 orchestrator review row and a `finish` for the version. Tests call it directly; the smoke stack via a dev command.
 */
/** The generated media do not depend on the video: made once per process (blobs dedupe by content anyway). */
const media = new Map<string, Promise<string>>();
function seedMedia(ffmpeg: string): Promise<string> {
  let p = media.get(ffmpeg);
  if (!p) {
    p = makeMedia(ffmpeg).catch((e) => { media.delete(ffmpeg); throw e; });
    media.set(ffmpeg, p);
  }
  return p;
}

async function makeMedia(ffmpeg: string): Promise<string> {
  const tmp = await mkdtemp(join(tmpdir(), 'vg-seed-'));
  try {
    const final = (out: string, hz: number) => run(ffmpeg, [
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=6', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=6`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out,
    ]);
    const wav = (out: string, hz: number, s: number) => run(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${s}`, '-ar', '48000', out]);
    await Promise.all([
      final(join(tmp, 'tiktok.mp4'), 440), final(join(tmp, 'music.mp4'), 660), wav(join(tmp, 'sfx.wav'), 880, 0.3), wav(join(tmp, 'bed.wav'), 220, 2),
      run(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=540x960', '-frames:v', '1', join(tmp, 'cover.png')]),
    ]);
    await writeFile(join(tmp, 'license.txt'), 'Creative Commons Attribution 4.0 International (test fixture)\n');
    return tmp;
  } catch (e) {
    await rm(tmp, { recursive: true, force: true });
    throw e;
  }
}

export async function seedReadyVideo(pool: pg.Pool, dataDir: string, ffmpeg: string, o: { productName?: string; aigcLabel?: boolean } = {}): Promise<SeededVideo> {
  const name = o.productName ?? 'Tükenmez kalem';
  const tmp = await seedMedia(ffmpeg);
  {
    const blob = (f: string) => putBlob(pool, dataDir, join(tmp, f));
    const [tiktok, music, cover, sfxBlob, bedBlob, lic] = await Promise.all(['tiktok.mp4', 'music.mp4', 'cover.png', 'sfx.wav', 'bed.wav', 'license.txt'].map(blob));
    const asset = async (kind: 'sfx' | 'music', blobSha: string, title: string, attribution: string) => {
      const inserted = await insertAsset(pool, {
        kind, title, blobSha, licenseSpdx: 'CC-BY-4.0', author: 'Test Yazar', attribution, licenseSnapshotSha: lic!.sha256, allowed: true, sourceUrl: null, durationMs: null, tags: [],
      });
      return inserted ?? (await pool.query('SELECT * FROM assets WHERE kind = $1 AND blob_sha = $2', [kind, blobSha])).rows[0] as { id: string };
    };
    const sfx = await asset('sfx', sfxBlob!.sha256, 'Klik', 'Ses efekti: Ada Yazar (CC BY 4.0)');
    const bed = await asset('music', bedBlob!.sha256, 'Yatak', 'Müzik: Bora Besteci (CC BY 4.0)');

    const r = await createProduceRun(pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
    const videoId = r.videoId;
    for (const s of await listRunSteps(pool, r.runId)) await updateStep(pool, s.id, { status: 'done', progress: 100, startedAt: new Date(), endedAt: new Date() });
    const media = { durationMs: 6000, width: 1080, height: 1920, codec: 'h264' };
    await insertArtifact(pool, { runId: r.runId, versionId: r.versionId, kind: 'final_video_tiktok', blobSha: tiktok!.sha256, ...media, meta: { music: null } });
    await insertArtifact(pool, { runId: r.runId, versionId: r.versionId, kind: 'final_video_music', blobSha: music!.sha256, ...media, meta: { music: 'Yatak' } });
    await insertArtifact(pool, { runId: r.runId, versionId: r.versionId, kind: 'final_cover', blobSha: cover!.sha256 });
    await insertArtifact(pool, {
      runId: r.runId, versionId: r.versionId, kind: 'audio_plan',
      content: { cues: [{ name: 'click', atMs: 500, assetId: sfx.id, gainDb: -12 }], music: { assetId: bed.id, title: 'Yatak', license: 'CC-BY-4.0', attribution: 'Müzik: Bora Besteci (CC BY 4.0)', gainDb: -20 } },
    });
    await insertArtifact(pool, { runId: r.runId, kind: 'storyboard', content: { hook: { pattern: 'question', text_tr: 'Bu kalemin içinde 7 parça var' } } });
    await insertArtifact(pool, {
      runId: r.runId, kind: 'research', content: {
        claims: [
          { id: 'c1', text_tr: 'Bilye çapı 0,7 mm', sources: [{ url: 'https://example.com/kalem', quote: '0.7 mm', accessed_at: '2026-10-08', type: 'manufacturer' }] },
          { id: 'c2', text_tr: 'Mürekkep yağ bazlıdır', sources: [{ url: 'https://example.com/murekkep', quote: 'oil-based', accessed_at: '2026-10-08', type: 'reference' }] },
        ],
      },
    });
    const steps = await listRunSteps(pool, r.runId);
    await recordReviewRound(pool, {
      runId: r.runId, round: 0, versionId: r.versionId, fixed: [],
      rows: [{ reviewerRole: 'orchestrator', seq: 1, rubricVersion: RUBRIC_VERSION, stepId: steps.find((s) => s.key === 'review')?.id ?? null, total: 87.5, gates: { G1: true, G2: true, G3: true, G4: true, G5: true, G6: true }, verdict: 'ready', findings: [] }],
    });
    await insertArtifact(pool, {
      runId: r.runId, kind: 'finish',
      content: { bestVersionId: r.versionId, round: 0, total: 87.5, verdict: 'ready', stop: null, openFindings: [], aigcLabel: o.aigcLabel ?? false },
    });
    await setBestVersion(pool, videoId, r.versionId);
    await updateRun(pool, r.runId, { status: 'done', progress: 100, startedAt: new Date(), endedAt: new Date() });
    await updateVideo(pool, videoId, { status: 'ready', statusNote: 'Yayına hazır · 87,5 puan' });
    return { videoId, versionId: r.versionId, runId: r.runId, tiktokSha: tiktok!.sha256, musicSha: music!.sha256, sfxAssetId: sfx.id, musicAssetId: bed.id };
  }
}
