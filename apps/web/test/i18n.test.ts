import { describe, expect, it } from 'vitest';
import {
  canMarkPublished, CHANNEL_STYLES, DIMENSIONS, FINAL_CHECKS, DRAFT_CHECKS, DURATION_SOURCE_LABELS, GATES, HOOK_PATTERN_LABELS, PUBLICATION_STATUSES, publishChecklist, QC_CHECKS,
  ROLE_LABELS, STEP_LABELS, STEP_STATUS_LABEL, VIDEO_STATUS_LABEL,
} from '@videogen/shared/browser';
import {
  CHECKLIST_EN, DIMENSION_EN, FINAL_CHECK_EN, STYLE_EN, DRAFT_CHECK_EN, DURATION_SOURCE_EN, GATE_EN, HOOK_PATTERN_EN, markBlocker, percent, PUBLICATION_STATUS_EN, QC_CHECK_EN,
  ROLE_EN, score, STEP_EN, STEP_STATUS_EN, VIDEO_STATUS_EN, windowLabel,
} from '../src/lib/i18n.ts';

const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
const covers = (shared: object, en: Record<string, string>) => {
  for (const id of Object.keys(shared)) {
    expect(en[id], `missing English label for "${id}"`).toBeTruthy();
    expect(en[id], `"${id}" is still Turkish`).not.toMatch(TURKISH);
  }
};

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
    covers(Object.fromEntries(PUBLICATION_STATUSES.map((s) => [s, s])), PUBLICATION_STATUS_EN);
    for (const variant of ['tiktok', 'music'] as const) for (const aigcRequired of [true, false]) {
      for (const i of publishChecklist({ variant, aigcRequired })) expect(CHECKLIST_EN(i), i.id).not.toMatch(TURKISH);
    }
  });

  it('formats scores with a decimal point and one digit', () => {
    expect([score(87.5), score(91.46), score(4), score(0.05)]).toEqual(['87.5', '91.5', '4.0', '0.1']);
  });

  it('formats windows in seconds and percentages after the number', () => {
    expect(windowLabel({ minS: 30, maxS: 45 })).toBe('30–45 s');
    expect([percent(0.58), percent(0), percent(null), percent(undefined)]).toEqual(['58%', '0%', '—', '—']);
  });

  it('markBlocker agrees with canMarkPublished and explains in English', () => {
    const items = publishChecklist({ variant: 'tiktok', aigcRequired: false });
    const all = Object.fromEntries(items.map((i) => [i.id, true]));
    const url = 'https://www.tiktok.com/@videogen.lab/video/7350000000000000000';
    const cases: [Record<string, boolean>, string][] = [[{}, url], [all, 'https://example.com/x'], [all, ''], [all, url]];
    for (const [ticked, u] of cases) {
      const en = markBlocker(items, ticked, u);
      expect(en === null).toBe(canMarkPublished(items, ticked, u) === null);
      if (en) expect(en).not.toMatch(TURKISH);
    }
    expect(markBlocker(items, {}, url)).toBe('Tick the required item: Add a sound in the TikTok app');
    expect(markBlocker(items, all, '')).toBe('Enter a valid TikTok video link');
  });
});
