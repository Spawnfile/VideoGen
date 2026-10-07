import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkHistory, fixReportRefErrors, fixScope, FixReportSchema, loopAction, pickBest, STOP_NOTE, tracked,
  type FixReport, type ProductResearch, type RoundChecks, type SceneSpec, type Storyboard,
} from '../src/index.ts';

const fx = <T>(n: string): T => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8')) as T;
const clone = <T>(v: T): T => structuredClone(v);

describe('fix loop', () => {
  it('FixReport: every failed check accounted for exactly once; the round matches; voice is not in reach', () => {
    const r = FixReportSchema.parse(fx('fix-report-compose'));
    const failed = ['text_readable', 'text_dwell', 'payoff'];
    expect(fixReportRefErrors(r, { round: 1, failed })).toEqual([]);
    expect(fixReportRefErrors(r, { round: 2, failed: ['text_readable', 'text_dwell', 'hero_frame0'] })).toEqual([
      'round: 2 olmalı', 'hero_frame0: addressed ya da not_addressed içinde olmalı', 'payoff: başarısız kontroller arasında değil',
    ]);
    expect(fixReportRefErrors({ ...r, not_addressed: [] }, { round: 1, failed })).toEqual(['payoff: addressed ya da not_addressed içinde olmalı']);
    expect(fixReportRefErrors({ ...r, rerender_scope: 'voice' }, { round: 1, failed })).toEqual(["rerender_scope: seslendirme kapsamı M5c'de"]);
    const dup: FixReport = { ...r, not_addressed: [{ check_id: 'text_readable', reason: 'x' }] };
    expect(FixReportSchema.safeParse(dup).success).toBe(false);
  });

  it('fixScope: the step computes the scope from what changed, not from the fixer\'s claim', () => {
    const base = { storyboard: fx<Storyboard>('storyboard-kalem'), scene: fx<SceneSpec>('scene-kalem'), research: fx<ProductResearch>('research-kalem'), productSha: 'a'.repeat(64) };
    const next = (f: (x: typeof base) => void) => { const n = clone(base); f(n); return fixScope({ prev: base, next: n }); };
    // same state, keys in another order
    const shuffled = { ...base, scene: Object.fromEntries(Object.entries(base.scene).reverse()) as unknown as SceneSpec };
    expect(fixScope({ prev: base, next: shuffled })).toEqual({ scope: 'none', changed: [] });
    expect(next((x) => { x.storyboard.beats[2]!.onscreen_text.tr = 'Kısa yazı'; })).toEqual({ scope: 'compose', changed: ['storyboard.text'] });
    expect(next((x) => { x.scene.parts[0]!.name_tr = 'Kalem gövdesi'; })).toEqual({ scope: 'compose', changed: ['scene.labels'] });
    const none = { scope: 'none', changed: [] };
    expect(next((x) => { x.storyboard.loop_strategy = 'Başka bir döngü'; })).toEqual(none);
    expect(next((x) => { x.storyboard.cta = { tr: 'Başka çağrı' }; })).toEqual(none);
    expect(next((x) => { x.storyboard.version = 2; })).toEqual(none);
    expect(next((x) => { x.storyboard.beats[0]!.sfx_cues = ['click']; })).toEqual({ scope: 'compose', changed: ['storyboard.text'] });
    expect(next((x) => { x.storyboard.hook.text_tr = 'Başka bir kanca'; })).toEqual({ scope: 'compose', changed: ['storyboard.text'] });
    expect(next((x) => { x.storyboard.hook.pattern = 'question'; })).toEqual({ scope: 'compose', changed: ['storyboard.structure'] });
    expect(next((x) => { x.storyboard.audio_mode = 'vo'; })).toEqual({ scope: 'compose', changed: ['storyboard.structure'] });
    expect(next((x) => { x.storyboard.beats[0]!.vo_text = { tr: 'Merhaba' }; })).toEqual({ scope: 'compose', changed: ['storyboard.structure'] });
    expect(next((x) => { x.scene.parts[0]!.recipe.note = 'başka not'; }).scope).toBe('none');
    expect(next((x) => { x.storyboard.beats[0]!.claim_ids = []; }).scope).toBe('compose');
    expect(next((x) => { x.scene.camera_keys[1]!.lens_mm = 100; })).toEqual({ scope: 'build', changed: ['scene.render'] });
    expect(next((x) => { x.storyboard.beats[1]!.t_end = 9.5; x.storyboard.beats[2]!.t_start = 9.5; })).toEqual({ scope: 'compose', changed: ['storyboard.structure'] });
    expect(next((x) => { x.productSha = 'b'.repeat(64); })).toEqual({ scope: 'build', changed: ['product.py'] });
    expect(next((x) => { x.research.engineer_insight = 'Başka bir içgörü'; }).changed).toEqual(['research']);
  });

  it('history: regressions only on tracked checks; oscillation needs fail, pass, fail across evaluated rounds', () => {
    expect(tracked('hero_frame0')).toBe(true);
    expect(tracked('materials')).toBe(false);
    expect(tracked('no_third_party')).toBe(true);
    expect(tracked('g6_layout')).toBe(true);
    expect(tracked('d7_bitrate')).toBe(false);
    expect(tracked('constructor')).toBe(false);
    const rc = (round: number, failed: string[], passed: string[]): RoundChecks => ({ round, versionId: `v${round}`, total: 70, verdict: 'fix', failed, passed });
    const h = checkHistory([rc(0, ['text_readable', 'hero_frame0'], ['payoff', 'materials']), rc(1, ['payoff', 'materials'], ['text_readable', 'hero_frame0'])]);
    expect(h.regressed).toEqual(['payoff']);
    expect(h.fixed).toEqual(['text_readable', 'hero_frame0']);
    expect(h.oscillating).toEqual([]);
    expect(checkHistory([rc(0, ['hero_frame0'], []), rc(1, [], []), rc(2, [], ['hero_frame0']), rc(3, ['hero_frame0'], [])]).oscillating).toEqual(['hero_frame0']);
    expect(checkHistory([rc(0, ['hero_frame0'], []), rc(1, [], []), rc(2, ['hero_frame0'], [])]).oscillating).toEqual([]);
    expect(checkHistory([rc(0, ['hero_frame0'], []), rc(1, [], ['hero_frame0']), rc(2, [], ['hero_frame0']), rc(3, ['hero_frame0'], [])]).oscillating).toEqual(['hero_frame0']);
    expect(checkHistory([rc(0, ['hero_frame0'], []), rc(1, [], []), rc(2, [], ['hero_frame0']), rc(3, [], ['hero_frame0']), rc(4, ['hero_frame0'], [])]).oscillating).toEqual(['hero_frame0']);
    expect(checkHistory([rc(0, ['contrast'], []), rc(1, [], ['contrast']), rc(2, ['contrast'], [])]).oscillating).toEqual([]);
    expect(checkHistory([rc(0, [], ['payoff']), rc(1, [], []), rc(2, ['payoff'], [])]).regressed).toEqual(['payoff']);
    expect(checkHistory([rc(0, ['payoff'], []), rc(1, [], []), rc(2, [], ['payoff'])]).fixed).toEqual(['payoff']);
  });

  it('loopAction and pickBest: ready first, then the round limit, usage, oscillation, rework, fix; best round avoids regressions', () => {
    const o = { fixRound: 0, oscillating: false, usageBlocked: false };
    expect(loopAction({ ...o, verdict: 'ready', fixRound: 3, oscillating: true, usageBlocked: true })).toEqual({ kind: 'ready' });
    expect(loopAction({ ...o, verdict: 'fix', fixRound: 3, usageBlocked: true })).toEqual({ kind: 'stop', reason: 'limit' });
    expect(loopAction({ ...o, verdict: 'fix', usageBlocked: true, oscillating: true })).toEqual({ kind: 'stop', reason: 'usage' });
    expect(loopAction({ ...o, verdict: 'rework', oscillating: true })).toEqual({ kind: 'stop', reason: 'oscillation' });
    expect(loopAction({ ...o, verdict: 'rework' })).toEqual({ kind: 'rework' });
    expect(loopAction({ ...o, verdict: 'fix', fixRound: 2 })).toEqual({ kind: 'fix' });
    expect(STOP_NOTE).toEqual({
      limit: '3 düzeltme turundan sonra eşik geçilemedi',
      oscillation: 'aynı kontrol düzelip yeniden bozuldu; döngü durduruldu',
      unchanged: 'düzeltme turu hiçbir şeyi değiştirmedi',
      usage: 'kullanım sınırı yakın; yeni düzeltme turu başlatılmadı',
      no_fixer: 'düzeltme yapacak ajan bağlı değil',
    });
    const r = (round: number, total: number | null, regressed: boolean, verdict: RoundChecks['verdict'] = 'fix') => ({ round, versionId: `v${round}`, total, verdict, failed: [], passed: [], regressed });
    expect(pickBest([r(0, 90, false, 'ready'), r(1, 95, false, 'ready'), r(2, 60, false)])?.round).toBe(1);
    expect(pickBest([r(0, 70, false), r(1, 78, true), r(2, 74, false), r(3, null, false)])?.round).toBe(2);
    expect(pickBest([r(0, 70, false), r(1, 70, false)])?.round).toBe(1);
    expect(pickBest([r(0, 60, true), r(1, 75, true), r(2, 70, true)])?.round).toBe(1);
    expect(pickBest([r(0, null, false)])?.round).toBe(0);
    expect(pickBest([r(0, 0, false), r(1, null, false)])?.round).toBe(0);
    expect(pickBest([])).toBeNull();
  });
});
