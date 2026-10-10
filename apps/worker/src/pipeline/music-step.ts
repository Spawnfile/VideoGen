import { join } from 'node:path';
import {
  MUSIC_INSTRUMENTS, MUSIC_PATTERNS, musicScoreErrors, validateArtifact, type MusicScore, type Storyboard,
} from '@videogen/shared';
import { findArtifact, latestArtifact, originRunId } from '@videogen/db';
import { runStructured } from './agent-step.ts';
import { briefBlock, fenced } from './fence.ts';
import { briefKeys, failure, persist, record, sha, type StepDeps } from './steps.ts';
import { SpecStore } from '@videogen/claude';
import { ARTIFACT_VALIDATOR } from './validator.ts';
import type { StepContext, StepExecutor } from './types.ts';
import { RenderError } from '../render/driver.ts';

const SCHEMA = 'MusicScore@1';
/** The final holds frames 0…round(duration×30): one frame longer than the storyboard; a little margin for the mix's trim. */
export const musicRenderS = (durationS: number) => Math.ceil(((Math.round(durationS * 30) + 1) / 30 + 0.05) * 1000) / 1000;

/** Agent music design A1/A3/A6: the composer's instruction. `edit`: the previous score and the user's instruction (a user decision). */
export function composerPrompt(o: { name: string; storyboard: Storyboard; audioMode: 'vo' | 'silent'; brief?: string | null; edit?: { instruction: string; previous: MusicScore | null } }): string {
  const s = o.storyboard;
  const timing = {
    duration_s: s.duration_s, hook: s.hook, rehook_at: s.rehook_at, payoff_at: s.payoff_at, loop_strategy: s.loop_strategy,
    beats: s.beats.map((b) => ({ id: b.id, t_start: b.t_start, t_end: b.t_end, action: b.action, onscreen_text: b.onscreen_text.tr, ...(b.vo_text ? { vo: b.vo_text.tr } : {}) })),
  };
  const palette = MUSIC_INSTRUMENTS.map((i) => `${i}: ${MUSIC_PATTERNS[i].join(' | ')}`).join('; ');
  return [
    `Ürün: ${JSON.stringify(o.name)}. Görev: ${o.edit ? 'bu videonun müziğini kullanıcının talimatına göre düzenle' : 'bu "içinde ne var" videosuna özgün bir müzik partisyonu yaz'} ve MusicScore şemasında döndür.`,
    '',
    fenced('Storyboard zamanlaması', timing),
    '',
    ...(o.edit ? [o.edit.previous ? fenced('Önceki partisyon (temel al; yalnızca istenen değişikliği yap)', o.edit.previous) : 'Önceki partisyon yok (müzik defterden bir parçaydı): talimata göre yeni bir partisyon yaz.', '', ...userInstruction(o.edit.instruction), '', 'Müzik seviyesi, ducking ya da efekt seviyesi istenirse write_spec(audio) ile ses planını da güncelle (read_spec(audio) mevcut planı verir).', ''] : []),
    ...(o.brief?.trim() ? [...briefBlock(o.brief, 'composer'), ''] : []),
    `Kurallar: duration_s ${s.duration_s}; bölümler 0 sn'den ${s.duration_s} sn'ye boşluksuz ve bitişik (1–8 bölüm), sınırlar mümkünse vuruş sınırlarında; bar başına bir akor (4/4), akorlar bölüm boyunca tekrar eder.`,
    `Kanca 0 sn'de bir vurgu (hit) ile açılır; ikinci kancadan (${s.rehook_at} sn) hemen önce riser; ödülde (${s.payoff_at} sn) drop ve enerjinin doruğu. bpm 60–160 (çoğunlukla 85–115). key: kök ve major/minor.`,
    `Enstrümanlar ve desenleri yalnızca şunlar: ${palette}. Seviye 0–1; bir bölümde bir enstrüman bir kez. İsteğe bağlı motif (bell/pluck/arp; nota adları A4 gibi).`,
    o.audioMode === 'vo'
      ? 'Seslendirmeli video: müzik anlatımın altında kalır; enerji çoğunlukla 0,6 altında, arp ve zil hafif, davul seyrek; anlatım en yoğun vuruşlarda dokuyu incelt.'
      : 'Seslendirmesiz video: anlatımı müzik ve ekran yazısı taşır; vuruşların temposunu müzik belirler, ödülde belirgin doruk.',
    'intent_tr: müziğin niyetini bir cümleyle yaz. version: 1.',
  ].join('\n');
}

/** The user's edit instruction: a decision, marked like the brief (its own markers, escaped). */
function userInstruction(text: string): string[] {
  return [
    'Kullanıcının düzenleme talimatı (kullanıcının kararı; önceki partisyonun ve varsayılanların önüne geçer, şemayı ve videonun süresini ezemez):',
    '<<<TALIMAT',
    text.trim().replace(/<<<TALIMAT/g, '‹<<TALIMAT').replace(/TALIMAT>>>/g, 'TALIMAT>>›'),
    'TALIMAT>>>',
  ];
}

export function musicExecutor(deps: StepDeps): StepExecutor {
  const inputs = async (ctx: StepContext) => {
    // An audio edit (A6) has no storyboard of its own: the produce run the edit chain started from has it.
    const from = ctx.edit ? await originRunId(deps.pool, ctx.edit.parentRunId) : ctx.runId;
    const sb = await latestArtifact(deps.pool, from, 'storyboard');
    const vt = ctx.audioMode === 'vo' ? await latestArtifact(deps.pool, from, 'voice_track') : null;
    return { sb, vt };
  };
  return {
    key: 'music',
    resource: 'claude',
    async inputHash(ctx) {
      const { sb, vt } = await inputs(ctx);
      return sha({ step: 'music', storyboard: sb?.id ?? null, voice: vt?.id ?? null, schema: SCHEMA, ...briefKeys(ctx, { duration: 'any' }), ...(ctx.edit ? { edit: ctx.edit.instruction, from: ctx.edit.parentRunId } : {}) });
    },
    async reuse(ctx, hash) {
      const stem = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'music_stem', inputHash: hash });
      return !!stem;
    },
    async run(ctx, hash) {
      if (!deps.music) return { status: 'needs_human', reason: 'Müzik kullanılamıyor: sentezleyici yapılandırılmadı' };
      const cap = await deps.music.capabilities();
      if (!cap.ok) return { status: 'needs_human', reason: `Müzik kullanılamıyor: ${cap.reason}` };
      const { sb } = await inputs(ctx);
      const storyboard = sb ? validateArtifact('Storyboard', sb.content) : null;
      if (!storyboard?.ok) return { status: 'failed', error: 'storyboard yok', retry: false };
      const previous = ctx.edit ? validateArtifact('MusicScore', (await latestArtifact(deps.pool, ctx.edit.parentRunId, 'music'))?.content) : null;
      if (ctx.edit) {
        // The edit run's SpecStore starts with the source's audio plan, so read_spec(audio) shows it and a write_spec(audio) edits it (remix reads it).
        const specs = new SpecStore(join(ctx.runDir, 'spec'), ARTIFACT_VALIDATOR);
        const from = await originRunId(deps.pool, ctx.edit.parentRunId);
        const plan = (await latestArtifact(deps.pool, ctx.edit.parentRunId, 'audio')) ?? (await latestArtifact(deps.pool, from, 'audio'));
        if (plan?.content && !(await specs.read('audio'))) await specs.write('audio', plan.content);
      }
      const durationS = storyboard.value.duration_s;
      const r = await runStructured<MusicScore>({
        manager: deps.manager, ctx, role: 'audio_director', schema: 'MusicScore',
        prompt: composerPrompt({ name: ctx.productName, storyboard: storyboard.value, audioMode: ctx.audioMode, brief: ctx.brief, ...(ctx.edit ? { edit: { instruction: ctx.edit.instruction, previous: previous?.ok ? previous.value : null } } : {}) }),
        check: (s) => musicScoreErrors(s, { durationS }),
        fakeScript: deps.fakeScript ? (n) => deps.fakeScript!('audio_director', ctx, n, { durationS }) : undefined,
      });
      if (!r.ok) return failure(r);
      await persist(deps, ctx, 'music', r.value, hash);
      const out = join(ctx.runDir, 'music', `music-${hash.slice(0, 12)}.wav`);
      try {
        const m = await deps.music.render({ score: r.value, out, renderS: musicRenderS(durationS), owner: ctx.stepId, signal: ctx.signal });
        await record(deps, ctx, { kind: 'music_stem', file: m.file, inputHash: hash, meta: { renderer: m.renderer, notes: m.notes, peakDb: m.peakDb, renderS: m.durationS, bpm: r.value.bpm, key: r.value.key } });
      } catch (e) {
        if (e instanceof RenderError && e.kind === 'aborted') return { status: 'cancelled' };
        if (e instanceof RenderError && e.kind === 'unavailable') return { status: 'needs_human', reason: `Müzik kullanılamıyor: ${e.message}` };
        return { status: 'failed', error: `müzik sentezi: ${(e as Error).message}`, retry: true };
      }
      const key = `${r.value.key.root} ${r.value.key.mode === 'minor' ? 'minör' : 'majör'}`;
      return { status: 'done', note: `${r.value.sections.length} bölüm · ${r.value.bpm} BPM · ${key}${ctx.edit ? ' · talimatla düzenlendi' : ''}` };
    },
  };
}
