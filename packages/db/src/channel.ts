import { CHANNEL_STYLE_IDS, DEFAULT_CHANNEL_STYLE, type ChannelStyleId } from '@videogen/shared';
import type { Queryable } from './client.ts';

/** K19: the chosen channel style (settings `channel.style`); `chosen: false` = the provisional default is in use. Pre-YAKLASIM videos only. */
export async function getChannelStyle(db: Queryable): Promise<{ id: ChannelStyleId; chosen: boolean }> {
  const { rows } = await db.query("SELECT value FROM settings WHERE key = 'channel.style'");
  const id = rows[0]?.value?.id;
  return (CHANNEL_STYLE_IDS as readonly string[]).includes(id) && id !== 'yaklasim' ? { id, chosen: true } : { id: DEFAULT_CHANNEL_STYLE, chosen: false };
}

/** YAKLASIM spec Y8: a yaklasim video always gets the approach's identity; an older video keeps the K19 setting. */
export async function styleFor(db: Queryable, approach: string | null | undefined): Promise<{ id: ChannelStyleId; chosen: boolean }> {
  return approach === 'yaklasim' ? { id: 'yaklasim', chosen: true } : getChannelStyle(db);
}

/** The approach of the video a run belongs to (scene tools only know the run directory). */
export async function approachOfRun(db: Queryable, runId: string): Promise<string | null> {
  const { rows } = await db.query('SELECT v.approach FROM runs r JOIN videos v ON v.id = r.video_id WHERE r.id::text = $1', [runId]);
  return rows[0]?.approach ?? null;
}

export async function setChannelStyle(db: Queryable, id: ChannelStyleId): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('channel.style', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify({ id, at: new Date().toISOString() })],
  );
}
