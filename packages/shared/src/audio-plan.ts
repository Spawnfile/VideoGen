import { z } from 'zod';
import { SFX_NAMES } from './assets.ts';

/** H4: the mix of a final — music level, SFX offsets and exclusions, mastering target (compose reads it, the fixer may edit levels). */
export const AudioPlanSchema = z.object({
  version: z.number().int().min(1),
  mode: z.enum(['vo', 'silent']),
  /**
   * `source` 'generated' plays the music step's stem (asset_id null; spec Z5: the only music now); 'asset' (or absent, older plans) named a
   * ledger track by asset_id. Kept so stored plans still read.
   */
  music: z.object({ source: z.enum(['generated', 'asset']).optional(), asset_id: z.uuid().nullable(), gain_db: z.number().min(-30).max(-10) }),
  vo_gain_db: z.number().min(-6).max(6),
  duck_db: z.number().min(6).max(18),
  sfx: z.object({ gain_offset_db: z.number().min(-12).max(6), exclude: z.array(z.enum(SFX_NAMES)).max(SFX_NAMES.length) }),
  mastering: z.object({ target_lufs: z.literal(-14), tp: z.literal(-1) }),
}).superRefine((a, ctx) => {
  const dup = a.sfx.exclude.find((n, i) => a.sfx.exclude.indexOf(n) !== i);
  if (dup) ctx.addIssue({ code: 'custom', path: ['sfx', 'exclude'], message: `tekrarlanan ses adı: ${dup}` });
});
export type AudioPlan = z.infer<typeof AudioPlanSchema>;
