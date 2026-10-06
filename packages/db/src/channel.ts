import { CHANNEL_STYLE_IDS, DEFAULT_CHANNEL_STYLE, type ChannelStyleId } from '@videogen/shared';
import type { Queryable } from './client.ts';

/** K19: the chosen channel style (settings `channel.style`); `chosen: false` = the provisional default is in use. */
export async function getChannelStyle(db: Queryable): Promise<{ id: ChannelStyleId; chosen: boolean }> {
  const { rows } = await db.query("SELECT value FROM settings WHERE key = 'channel.style'");
  const id = rows[0]?.value?.id;
  return (CHANNEL_STYLE_IDS as readonly string[]).includes(id) ? { id, chosen: true } : { id: DEFAULT_CHANNEL_STYLE, chosen: false };
}

export async function setChannelStyle(db: Queryable, id: ChannelStyleId): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('channel.style', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify({ id, at: new Date().toISOString() })],
  );
}
