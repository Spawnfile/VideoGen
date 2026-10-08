import type { VersionView } from '@videogen/shared';
import type { Queryable } from './client.ts';

/**
 * Plan M7 Y7. The run is the one whose artifacts or reviews carry the version, else the newest run created up to the version row (round 0
 * shares the produce run's transaction). The score is the version's own orchestrator row (highest seq, newest); the finals its own newest
 * music file with the TikTok variant and cover of the same compose (same input hash, as in VIDEO_SQL).
 */
const SQL = `
  SELECT ver.id, ver.round, ver.reason, ver.parent_version_id, ver.created_at,
    coalesce(
      (SELECT a.run_id FROM artifacts a WHERE a.version_id = ver.id ORDER BY a.created_at LIMIT 1),
      (SELECT rv.run_id FROM reviews rv WHERE rv.version_id = ver.id ORDER BY rv.created_at LIMIT 1),
      (SELECT r.id FROM runs r WHERE r.video_id = ver.video_id AND r.created_at <= ver.created_at ORDER BY r.created_at DESC LIMIT 1)
    ) AS run_id,
    sc.total, sc.verdict, sc.dimension_scores,
    fm.blob_sha AS music_sha, fm.duration_ms, ft.blob_sha AS tiktok_sha, fc.blob_sha AS cover_sha,
    (v.best_version_id = ver.id) AS best, (v.current_version_id = ver.id) AS current,
    EXISTS (SELECT 1 FROM publications p WHERE p.version_id = ver.id AND p.status = 'published') AS published
  FROM versions ver JOIN videos v ON v.id = ver.video_id
  LEFT JOIN LATERAL (SELECT rv.total, rv.verdict, rv.dimension_scores FROM reviews rv WHERE rv.version_id = ver.id AND rv.reviewer_role = 'orchestrator'
    ORDER BY rv.seq DESC, rv.created_at DESC LIMIT 1) sc ON true
  LEFT JOIN LATERAL (SELECT a.blob_sha, a.duration_ms, a.input_hash FROM artifacts a
    WHERE a.version_id = ver.id AND a.kind = 'final_video_music' ORDER BY a.created_at DESC LIMIT 1) fm ON true
  LEFT JOIN LATERAL (SELECT a.blob_sha FROM artifacts a
    WHERE a.version_id = ver.id AND a.kind = 'final_video_tiktok' AND a.input_hash = fm.input_hash ORDER BY a.created_at DESC LIMIT 1) ft ON true
  LEFT JOIN LATERAL (SELECT a.blob_sha FROM artifacts a
    WHERE a.version_id = ver.id AND a.kind = 'final_cover' AND a.input_hash = fm.input_hash ORDER BY a.created_at DESC LIMIT 1) fc ON true
  WHERE ver.video_id = $1
  ORDER BY ver.round, ver.created_at, ver.id`;

const round4 = (v: unknown): number | null => (v === null || v === undefined ? null : Math.round(Number(v) * 10_000) / 10_000);

export async function listVersions(db: Queryable, videoId: string): Promise<VersionView[]> {
  const { rows } = await db.query(SQL, [videoId]);
  return rows.map((r) => ({
    id: r.id, round: r.round, reason: r.reason, parentId: r.parent_version_id, createdAt: new Date(r.created_at).toISOString(), runId: r.run_id,
    total: round4(r.total), verdict: r.verdict ?? null, dims: r.dimension_scores ?? null,
    finals: r.music_sha ? { musicSha: r.music_sha, tiktokSha: r.tiktok_sha ?? null, coverSha: r.cover_sha ?? null, durationS: Math.round(Number(r.duration_ms ?? 0) / 100) / 10 } : null,
    best: r.best === true, current: r.current === true, published: r.published === true,
  }));
}

/** The version's video, or null when no such version exists. */
export async function versionVideoId(db: Queryable, versionId: string): Promise<string | null> {
  const { rows } = await db.query('SELECT video_id FROM versions WHERE id = $1', [versionId]);
  return rows[0]?.video_id ?? null;
}
