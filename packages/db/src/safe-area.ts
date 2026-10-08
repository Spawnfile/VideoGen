import { defaultSafeAreaSetting, SafeAreaSchema, type SafeAreaSetting } from '@videogen/shared';
import type { Queryable } from './client.ts';

/**
 * Plan M7 Y15: the text safe area (settings `safe_area`). Nothing stored, or a stored value that no longer validates, reads as the default
 * (G6 of spec §8.1).
 */
export async function getSafeArea(db: Queryable): Promise<SafeAreaSetting> {
  const { rows } = await db.query("SELECT value FROM settings WHERE key = 'safe_area'");
  const v = rows[0]?.value as Partial<SafeAreaSetting> | undefined;
  const area = SafeAreaSchema.safeParse(v?.area);
  if (!area.success || v?.source !== 'calibrated') return defaultSafeAreaSetting();
  return { area: area.data, source: 'calibrated', measuredAt: typeof v.measuredAt === 'string' ? v.measuredAt : null, note: typeof v.note === 'string' ? v.note : null };
}

export async function setSafeArea(db: Queryable, s: SafeAreaSetting): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('safe_area', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(s)],
  );
}
