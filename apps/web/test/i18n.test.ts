import { describe, expect, it } from 'vitest';
import {
  CHANNEL_STYLES, DIMENSIONS, FINAL_CHECKS, DRAFT_CHECKS, DURATION_SOURCE_LABELS, GATES, HOOK_PATTERN_LABELS, QC_CHECKS,
  ROLE_LABELS, STEP_LABELS, STEP_STATUS_LABEL, VIDEO_STATUS_LABEL,
} from '@videogen/shared/browser';
import {
  DIMENSION_EN, FINAL_CHECK_EN, STYLE_EN, DRAFT_CHECK_EN, DURATION_SOURCE_EN, GATE_EN, HOOK_PATTERN_EN, percent, QC_CHECK_EN,
  ROLE_EN, roleEn, score, STEP_EN, STEP_STATUS_EN, VIDEO_STATUS_EN, windowLabel,
} from '../src/lib/i18n.ts';

const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
const covers = (shared: object, en: Record<string, string>) => {
  for (const id of Object.keys(shared)) {
    expect(en[id], `missing English label for "${id}"`).toBeTruthy();
    expect(en[id], `"${id}" is still Turkish`).not.toMatch(TURKISH);
  }
};

describe('role labels of old sessions (spec Z3)', () => {
  it('a retired role keeps its label; an unknown role shows its id instead of undefined', () => {
    expect(roleEn('audio_director')).toBe('Audio director');
    expect(roleEn('retired_x')).toBe('retired_x');
  });
});

describe('English labels for shared ids (shared labels also feed the agents, so the web maps them)', () => {
  it('every shared id has an English label', () => {
    covers(STEP_LABELS, STEP_EN);
    covers(STEP_STATUS_LABEL, STEP_STATUS_EN);
    covers(VIDEO_STATUS_LABEL, VIDEO_STATUS_EN);
    covers(ROLE_LABELS, ROLE_EN);
    covers(DURATION_SOURCE_LABELS, DURATION_SOURCE_EN);
    covers(HOOK_PATTERN_LABELS, HOOK_PATTERN_EN);
    covers(DIMENSIONS, DIMENSION_EN);
    covers(GATES, GATE_EN);
    covers(DRAFT_CHECKS, DRAFT_CHECK_EN);
    covers(QC_CHECKS, QC_CHECK_EN);
    covers(FINAL_CHECKS, FINAL_CHECK_EN);
    covers(CHANNEL_STYLES, Object.fromEntries(Object.entries(STYLE_EN).map(([k, v]) => [k, v.name])));
    for (const s of Object.values(STYLE_EN)) expect(s.description).not.toMatch(TURKISH);
  });

  it('formats scores with a decimal point and one digit', () => {
    expect([score(87.5), score(91.46), score(4), score(0.05)]).toEqual(['87.5', '91.5', '4.0', '0.1']);
  });

  it('formats windows in seconds and percentages after the number', () => {
    expect(windowLabel({ minS: 30, maxS: 45 })).toBe('30–45 s');
    expect([percent(0.58), percent(0), percent(null), percent(undefined)]).toEqual(['58%', '0%', '—', '—']);
  });

});
