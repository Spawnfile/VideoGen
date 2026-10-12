import { describe, expect, it } from 'vitest';
import { AudioPlanSchema, type AudioPlan } from '../src/audio-plan.ts';

const plan = (exclude: string[]) => ({ version: 1, mode: 'silent', music: { source: 'generated', asset_id: null, gain_db: -18 }, vo_gain_db: 0, duck_db: 12, sfx: { gain_offset_db: 0, exclude }, mastering: { target_lufs: -14, tp: -1 } });

describe('AudioPlan (spec Z5 read-compat)', () => {
  it('an old plan that excluded a retired library sound still reads; duplicates and junk are refused', () => {
    expect(AudioPlanSchema.safeParse(plan(['whoosh', 'click'])).success).toBe(true);
    expect(AudioPlanSchema.safeParse(plan(['y_tap'])).success).toBe(true);
    expect(AudioPlanSchema.safeParse(plan(['y_tap', 'y_tap'])).success).toBe(false);
    expect(AudioPlanSchema.safeParse(plan([''])).success).toBe(false);
    const p: AudioPlan = AudioPlanSchema.parse(plan([]));
    expect(p.sfx.exclude).toEqual([]);
  });
});
