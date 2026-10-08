import type pg from 'pg';
import { RUBRIC_VERSION } from '@videogen/shared';
import { findArtifact, insertArtifact, snapshotClaims, type PublishSource } from '@videogen/db';

/**
 * Plan M6 Y15: at a version's first send, its claims (status per gate: G2 of the version's review) and a `provenance` artifact — the assets
 * with licenses, the TTS provider and the role models. Idempotent: claims ON CONFLICT DO NOTHING, provenance keyed by the version id.
 */
export async function snapshotForPublish(pool: pg.Pool, src: PublishSource): Promise<void> {
  if (!src.versionId || !src.runId) return;
  await snapshotClaims(pool, { videoId: src.videoId, versionId: src.versionId, claims: src.claims, verifiedAt: src.g2?.passed ? src.g2.at : null });
  if (await findArtifact(pool, { runId: src.runId, kind: 'provenance', inputHash: src.versionId })) return;
  const assets = (await pool.query(
    'SELECT id, kind, title, license_spdx, attribution, source_url, author FROM assets WHERE id = ANY($1::uuid[]) ORDER BY title', [src.assets.map((a) => a.id)],
  )).rows.map((a) => ({ id: a.id, kind: a.kind, title: a.title, license: a.license_spdx, attribution: a.attribution, sourceUrl: a.source_url, author: a.author }));
  const track = (await pool.query("SELECT content FROM artifacts WHERE run_id = $1 AND kind = 'voice_track' ORDER BY created_at DESC LIMIT 1", [src.runId])).rows[0]?.content;
  const roles = Object.fromEntries((await pool.query('SELECT DISTINCT role, model FROM agent_sessions WHERE run_id = $1 ORDER BY role', [src.runId])).rows.map((r) => [r.role, r.model]));
  await insertArtifact(pool, {
    runId: src.runId, versionId: src.versionId, kind: 'provenance', inputHash: src.versionId,
    content: { versionId: src.versionId, assets, tts: track?.provider ?? null, roles, rubric: RUBRIC_VERSION },
  });
}
