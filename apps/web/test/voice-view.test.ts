import { describe, expect, it } from 'vitest';
import type { ReviewRecord, VoiceTrack } from '@videogen/shared/browser';
import { narratorOptions, panelView, PRODUCE_VO_HINT, voiceView } from '../src/lib/production-view.ts';

const line = (beat_id: string, text_tr: string, start_ms: number, end_ms: number, cer: number) => ({ beat_id, text_tr, normalized_tr: text_tr, start_ms, end_ms, seed: 1, attempts: 1, cer, asr_tr: text_tr });
const track = (voice: VoiceTrack['provider']['voice'], aigc: boolean): VoiceTrack => ({
  lines: [line('b1', 'Merhaba dünya', 100, 2000, 0.012), line('b2', 'Kalem nasıl çalışır', 2300, 5000, 0.041)],
  words: [],
  duration_ms: 35000,
  provider: { engine: 'chatterbox', model: 'chatterbox-multilingual-v3@5de7a54a', voice, aigc_label: aigc },
  facts: { first_word_s: 0.1, syllables_per_s: 5.25, max_cer: 0.041 },
});

describe('voice card helpers', () => {
  it('voiceView: engine and voice with the provisional mark, lines, length, worst CER, first word, pace, the AI label for a clone; null without a voice track', () => {
    expect(voiceView(null, { chosen: true })).toBeNull();
    expect(voiceView({ lines: [] } as unknown as VoiceTrack, { chosen: true })).toBeNull();
    const edge = track({ kind: 'preset', id: 'hazir' }, false);
    edge.lines = [line('b1', 'a', 0, 10, 0.03), line('b2', 'b', 20, 30, 0.0301)];
    expect(voiceView(edge, { chosen: true })!.rows.map((r) => r.warn)).toEqual([false, true]);
    const v = voiceView(track({ kind: 'preset', id: 'hazir' }, false), { chosen: false })!;
    expect(v).toMatchObject({ title: 'Seslendirme · Chatterbox · hazır ses', provisional: true, lines: 2, duration: '35,0 sn', worstCer: '%4,1', firstWord: '0,1 sn', pace: '5,3 hece/sn', aigc: false });
    expect(v.rows).toEqual([
      { beat: 'b1', text: 'Merhaba dünya', cer: '%1,2', warn: false },
      { beat: 'b2', text: 'Kalem nasıl çalışır', cer: '%4,1', warn: true },
    ]);
    expect(voiceView(track({ kind: 'preset', id: 'hazir' }, false), { chosen: true })!.provisional).toBe(false);
    const clone = voiceView(track({ kind: 'clone', asset_id: '11111111-1111-4111-8111-111111111111' }, true), { chosen: true })!;
    expect(clone).toMatchObject({ title: 'Seslendirme · Chatterbox · klon ses', aigc: true });
  });

  it('narratorOptions and the produce hint: the provisional default is marked GEÇİCİ; a clone option only with an allowed reference', () => {
    const state = (clone: boolean, chosen: boolean) => ({
      voice: { engine: 'chatterbox' as const, voice: { kind: 'preset' as const, id: 'hazir' } }, chosen,
      options: [
        { engine: 'chatterbox' as const, voices: [{ kind: 'preset' as const, id: 'hazir', label_tr: 'Hazır ses' }, ...(clone ? [{ kind: 'clone' as const, asset_id: 'a1', label_tr: 'Sesim' }] : [])] },
        { engine: 'freya' as const, voices: [{ kind: 'preset' as const, id: 'leyla', label_tr: 'Leyla' }] },
      ],
    });
    const a = narratorOptions(state(false, false));
    expect(a.items.map((o) => [o.label, o.selected, o.provisional])).toEqual([['Chatterbox · Hazır ses', true, true], ['Freya · Leyla', false, false]]);
    expect(a.hasClone).toBe(false);
    expect(a.note).toBe('Henüz seçilmedi: geçici varsayılan');
    const b = narratorOptions(state(true, true));
    expect(b.items.map((o) => o.label)).toEqual(['Chatterbox · Hazır ses', 'Chatterbox · klon: Sesim', 'Freya · Leyla']);
    expect(b.items[0]).toMatchObject({ selected: true, provisional: false });
    expect(b.hasClone).toBe(true);
    expect(b.note).toBe('');
    expect(PRODUCE_VO_HINT).toBe("Anlatım yerel TTS ile; ses seçimi Ayarlar'da");
    // The orchestrator's G4 finding reads in Turkish, not as a bare gate id.
    const g4: ReviewRecord = { id: 'o', videoId: 'v', versionId: null, runId: 'r', stepId: null, round: 0, reviewerRole: 'orchestrator', seq: 1, sessionId: null, rubricVersion: 'final@1', total: 80, dimensionScores: null, gates: { G4: false }, verdict: 'fix', summaryTr: '', createdAt: '', findings: [{ id: 'f', checkId: 'G4', severity: 'blocker', dimension: null, gate: 'G4', evidence: null, fixHint: 'seslendirme izi bulunamadı', status: 'open', fixedInVersionId: null }] };
    expect(panelView([g4])!.auto!.findings[0]!.label).toBe('AI beyanı (G4)');
  });
});
