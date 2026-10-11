import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHANNEL_STYLES, DEFAULT_CHANNEL_STYLE, FINAL_CHECKS, normalizeProductName, RUBRIC_VERSION, type FinalCheckId, type FinalReview, type MusicScore, type FixReport, type ProductResearch, type Storyboard } from '@videogen/shared';
import type { FakeScript } from '@videogen/claude';
import { webCheckTargets } from './review-inputs.ts';
import type { FakeExtra, PipelineRole } from './steps.ts';
import type { StepContext } from './types.ts';

const DIR = resolve(import.meta.dirname, '../../../../tests/fixtures/artifacts');
const PRODUCT = resolve(import.meta.dirname, '../../../../python/vg_blender/examples/kalem/product.py');
const load = (name: string) => JSON.parse(readFileSync(resolve(DIR, `${name}.json`), 'utf8')) as Record<string, unknown>;

/**
 * Fake driver only: recorded streams with scripted structured output (and, for the builder, the files it "writes").
 * "imkansız …" exercises the difficulty gate; "bozuk sahne …" makes the first build fail once (the same-session fix loop);
 * "yavaş …" keeps the builder busy (silent, CPU alive) so a test can stop a running build.
 * In a draft fix round (ctx.round ≥ 1) the builder changes the first camera lens, except for "inatçı …" (the unchanged-fix rule).
 * The final review (ctx.key 'review'; plan F20): triggers `rötuş` (text checks fail in fix round 0), `geometri` (mechanism and parts fail in round 0), `dengesiz`
 * (the retention hook fails in rounds 0 and 2), `vasat` (every score 0.55 in round 0), `sınırda` (visual 0.7, the second review passes), `değişmez` (like `rötuş`
 * in every round, and its fixer changes nothing). The fixer writes the next spec version into <runDir>/spec/<kind>/ the way write_spec does.
 * "öneri …": the researcher recommends 40–50 s and two brief lines (brief design Y5).
 * `ahenksiz` (agent music design A13): the audio reviewer fails music_mood in fix round 0; its fixer rewrites the score (scope compose).
 * The draft reviewer passes, except: "kusurlu …" fails the first review only, "umutsuz …" and "inatçı …" fail every review.
 */
export function fakePipelineScript(role: PipelineRole, ctx: StepContext, attempt: number, extra?: FakeExtra): FakeScript {
  // Lower-case the Turkish way first: /i does not fold 'İ' to 'i'.
  const name = normalizeProductName(ctx.productName);
  if (role === 'researcher') {
    const research = load(/[iı]mk[aâ]ns[ıi]z/.test(name) ? 'research-too-hard' : 'research-kalem');
    // Brief design Y5: "öneri …" comes with the agent's duration and brief suggestion (40–50 s holds the 45 s fake storyboard).
    const rec = /öneri/.test(name) ? { recommendation: { duration_min_s: 40, duration_max_s: 50, brief_tr: ['Yayın geri itme anına odaklan.', 'Uçtaki bilyeyi yakın çekimde göster.'], reason_tr: 'Beş parçalı basit bir mekanizma.' } } : {};
    return { fixture: 'websearch', structured: { ...research, ...rec } };
  }
  if (role === 'builder') {
    const styleId = extra?.styleId ?? DEFAULT_CHANNEL_STYLE;
    const broken = attempt === 0 && /bozuk sahne/.test(name) ? "# vg-fake-error: product.py satır 7: NameError: name 'gövde' is not defined\n" : '';
    // YAKLASIM: the 13 s pen.
    const scene = load('scene-kalem') as { camera_keys: { lens_mm: number }[] };
    // The first (and, in a YAKLASIM loop, the last) camera key change together, so the loop rule holds.
    const fix = ctx.round > 0 && !/[iı]nat[çc][ıi]/.test(name) ? { camera_keys: scene.camera_keys.map((k, i, all) => (i === 0 || (ctx.approach === 'yaklasim' && i === all.length - 1) ? { ...k, lens_mm: k.lens_mm + 5 * ctx.round } : k)) } : {};
    return {
      fixture: 'coding',
      ...(/yava[şs]/.test(name) ? { stall: { afterIndex: 20, ms: 600_000, cpuPct: 20 } } : {}),
      files: { 'scene/product.py': broken + readFileSync(PRODUCT, 'utf8') },
      structured: { ...scene, ...fix, style_id: styleId, lighting_preset: CHANNEL_STYLES[styleId].lighting },
    };
  }
  if (role === 'fixer') return fakeFixer(ctx, name, extra);
  if (ctx.key === 'review' && role === 'reviewer_audio') return { fixture: 'basic', structured: fakeAudioReview(ctx, name) };
  if (ctx.key === 'review' && (role === 'reviewer_visual' || role === 'reviewer_facts' || role === 'reviewer_retention')) return { fixture: 'basic', structured: fakeFinalReview(role, ctx, name, extra) };
  if (role === 'reviewer_visual') {
    const fail = /umutsuz|[iı]nat[çc][ıi]/.test(name) || (/kusurlu/.test(name) && ctx.round === 0);
    return { fixture: 'basic', structured: load(fail ? 'review-revise' : 'review-pass') };
  }
  return { fixture: 'basic', structured: load('storyboard-kalem') };
}

type Tweak = { score: number; frame?: number; hint?: string };

/** A pass fixture with some checks set to a score; a score under 0.5 fails with the evidence and hint the contract asks for. */
function tweaked(review: FinalReview, set: Record<string, Tweak>): FinalReview {
  return {
    ...review,
    checks: review.checks.map((c) => {
      const t = set[c.id];
      if (!t) return c;
      if (t.score >= 0.5) return { id: c.id, pass: true, score: t.score };
      const frame = t.frame ?? 30;
      return { id: c.id, pass: false, score: t.score, evidence: { frame, timecode: Math.round((frame / 30) * 100) / 100 }, fix_hint: t.hint ?? 'Düzelt.' };
    }),
  };
}

/** Every check at one score (the `vasat` panel: all 0.55 passes, the total lands under 70). */
const flat = (review: FinalReview, score: number): FinalReview => tweaked(review, Object.fromEntries(review.checks.map((c) => [c.id, { score }])));

function fakeFinalReview(role: 'reviewer_visual' | 'reviewer_facts' | 'reviewer_retention', ctx: StepContext, name: string, extra?: FakeExtra): FinalReview {
  const trig = (re: RegExp) => re.test(name);
  const r = ctx.fixRound;
  if (role === 'reviewer_visual') {
    const pass = load('final-review-visual-pass') as unknown as FinalReview;
    if (extra?.seq === 2) return pass;
    if (trig(/de[ğg]i[şs]mez/) || (trig(/r[öo]tu[şs]/) && r === 0)) return load('final-review-visual-fix') as unknown as FinalReview;
    if (trig(/geometri/) && r === 0) return tweaked(pass, { mechanism_shot: { score: 0.1, frame: 40, hint: 'Mekanizma çekiminde lensi değiştir; uç yuvası kadrajı doldursun.' }, parts_visible: { score: 0.1, frame: 50, hint: 'Parçalar kadrajda üst üste biniyor; lensi uzaklaştır.' } });
    if (trig(/vasat/) && r === 0) return flat(pass, 0.55);
    if (trig(/s[ıi]n[ıi]rda/)) return flat(pass, 0.7);
    return pass;
  }
  if (role === 'reviewer_retention') {
    const pass = load('final-review-retention-pass') as unknown as FinalReview;
    if (trig(/dengesiz/) && (r === 0 || r === 2)) return tweaked(pass, { hook_frame0: { score: 0.1, frame: 0, hint: 'İlk karede kahraman nesne ve kanca yazısı görünsün.' }, hook_pattern: { score: 0.2, frame: 20, hint: 'Kanca kalıbı belirsiz; açılışı net bir kalıba oturt.' } });
    if (trig(/vasat/) && r === 0) return flat(pass, 0.55);
    return pass;
  }
  // The targets come from the kalem fixtures (research-kalem, storyboard-kalem): the fake facts reviewer assumes a kalem run.
  const pass = load('final-review-facts-pass') as unknown as FinalReview;
  const targets = webCheckTargets(load('research-kalem') as unknown as ProductResearch, load('storyboard-kalem') as unknown as Storyboard, `${ctx.runId}:${r}`);
  const base = { ...pass, web_checks: targets.map((t) => ({ claim_id: t.claim_id, url: t.url, reachable: true, supports: true })) };
  return trig(/vasat/) && r === 0 ? flat(base, 0.55) : base;
}

/** The next free spec version number of `kind` in the run's spec dir (what SpecStore.write would take) and its latest value. */
function nextSpec<T>(ctx: StepContext, kind: 'storyboard' | 'scene' | 'music', fallback: T): { path: string; latest: T } {
  const dir = resolve(ctx.runDir, 'spec', kind);
  const taken = (() => { try { return readdirSync(dir); } catch { return [] as string[]; } })().flatMap((n) => { const m = /^v(\d{4})\.json$/.exec(n); return m ? [Number(m[1])] : []; }).sort((a, b) => a - b);
  const last = taken.at(-1);
  const latest = last === undefined ? fallback : (JSON.parse(readFileSync(resolve(dir, `v${String(last).padStart(4, '0')}.json`), 'utf8')) as T);
  return { path: `spec/${kind}/v${String((last ?? 0) + 1).padStart(4, '0')}.json`, latest };
}

function fakeFixer(ctx: StepContext, name: string, extra?: FakeExtra): FakeScript {
  const round = ctx.fixRound + 1;
  const failed = extra?.failed ?? [];
  const unchanged = /de[ğg]i[şs]mez/.test(name);
  const geometry = /geometri/.test(name);
  const files: Record<string, string> = {};
  const audioFix = failed.some((id) => id in FINAL_CHECKS && FINAL_CHECKS[id as FinalCheckId].category === 'audio');
  if (!unchanged && audioFix) {
    // Agent music design A13: a calmer score (90 BPM, no drums) answers the audio reviewer.
    const m = nextSpec(ctx, 'music', fakeScore(13));
    files[m.path] = JSON.stringify({ ...m.latest, version: m.latest.version + 1, bpm: 90, sections: m.latest.sections.map((s) => ({ ...s, layers: s.layers.filter((l) => l.instrument !== 'drums') })) }, null, 2);
  } else if (!unchanged && geometry) {
    const base = load('scene-kalem') as { camera_keys: { lens_mm: number }[] };
    const s = nextSpec(ctx, 'scene', base);
    files[s.path] = JSON.stringify({ ...s.latest, camera_keys: s.latest.camera_keys.map((k, i, all) => (i === 0 || (ctx.approach === 'yaklasim' && i === all.length - 1) ? { ...k, lens_mm: base.camera_keys[0]!.lens_mm + 5 } : k)) }, null, 2);
  } else if (!unchanged) {
    const s = nextSpec(ctx, 'storyboard', load('storyboard-kalem') as unknown as Storyboard);
    files[s.path] = JSON.stringify({ ...s.latest, beats: s.latest.beats.map((b, i) => (i !== 1 ? b : { ...b, onscreen_text: { tr: `Short text ${round}` } })) }, null, 2);
  }
  const touched = Object.keys(files);
  const report: FixReport = {
    round,
    addressed: failed.filter((id) => !id.startsWith('d7_')).map((id) => ({ check_id: id, change_summary_tr: audioFix ? 'Müzik sakinleştirildi (90 BPM, davulsuz)' : geometry ? 'Kamera lensi değiştirildi' : 'Vuruş yazısı kısaltıldı', files: touched })),
    not_addressed: failed.filter((id) => id.startsWith('d7_')).map((id) => ({ check_id: id, reason: 'Kodlama ayarı bu turda değiştirilemez' })),
    rerender_scope: audioFix ? 'compose' : geometry && !unchanged ? 'build' : 'compose',
    spec_diffs: touched.map((f) => `${f} yazıldı`),
  };
  return { fixture: 'coding', files, structured: report };
}

/** Agent music design A9: a valid three-part score for any storyboard length (the fake composer). */
export function fakeScore(durationS: number): MusicScore {
  const a = Math.round(durationS * 0.3 * 100) / 100;
  const b = Math.round(durationS * 0.7 * 100) / 100;
  return {
    version: 1, bpm: 100, key: { root: 'A', mode: 'minor' }, duration_s: durationS, intent_tr: 'Sahte besteci: sakin giriş, ödülde doruk.',
    sections: [
      { id: 'kanca', t_start: 0, t_end: a, chords: ['Am', 'F'], energy: 0.4, layers: [{ instrument: 'pad', pattern: 'swell', level: 0.5 }] },
      { id: 'mekanizma', t_start: a, t_end: b, chords: ['Am', 'F', 'C', 'G'], energy: 0.55, layers: [{ instrument: 'pad', pattern: 'sustain', level: 0.45 }, { instrument: 'bass', pattern: 'pulse', level: 0.5 }] },
      { id: 'odul', t_start: b, t_end: durationS, chords: ['F', 'G', 'Am'], energy: 0.8, layers: [{ instrument: 'pad', pattern: 'sustain', level: 0.5 }, { instrument: 'drums', pattern: 'pulse', level: 0.45 }] },
    ],
    accents: [{ t: 0, kind: 'hit' }, { t: b, kind: 'drop' }],
  };
}

/** Agent music design A10: the fake audio reviewer passes (1.0, so the pass panel keeps its total), except `ahenksiz` in fix round 0 (music_mood fails at the hook). */
function fakeAudioReview(ctx: StepContext, name: string): FinalReview {
  const off = /ahenksiz/.test(name) && ctx.fixRound === 0;
  return {
    rubric_version: RUBRIC_VERSION, reviewer_role: 'reviewer_audio',
    checks: [
      off
        ? { id: 'music_mood', pass: false, score: 0.2, evidence: { frame: 0, timecode: 0 }, fix_hint: 'Müzik ürünün sakin anlatımına göre fazla gergin: tempoyu 90 BPM\'e indir, davulu kaldır, pad ağırlıklı yap.' }
        : { id: 'music_mood', pass: true, score: 1 },
      { id: 'music_sync', pass: true, score: 1 },
      { id: 'mix_balance', pass: true, score: 1 },
    ],
    summary_tr: off ? 'Müzik ruh hâli ürüne uymuyor; denge ve senkron iyi.' : 'Müzik ve karışım videoya uyuyor.',
  };
}
