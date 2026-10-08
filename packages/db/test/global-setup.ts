import { loadConfig } from '@videogen/shared';
import { ensureTemplate } from './helpers.ts';

/** Plan M7 Y2: migrate once into `vg_tpl_<sha>`; every `createTestDb` copies it. Without Postgres, tests that need it fail in `createTestDb`. */
export default async function setup(): Promise<void> {
  try {
    await ensureTemplate(loadConfig().adminDatabaseUrl);
  } catch (e) {
    console.warn(`[videogen] test şablonu kurulamadı, veritabanları tek tek migrate edilecek: ${(e as Error).message}`);
  }
}
