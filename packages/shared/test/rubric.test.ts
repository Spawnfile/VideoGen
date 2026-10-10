import { describe, expect, it } from 'vitest';
import {
  buildQcReport, DIMENSIONS, evaluateQc, GATES, QC_CHECK_IDS, QC_CHECKS, qcFailures, QcReportSchema, qcScores, RUBRIC_VERSION, type QcMeasure,
} from '../src/index.ts';

/** What qc_probe measures on a well made 45 s final (music variant). */
const good = (): QcMeasure => ({
  video: {
    codec: 'h264', profile: 'High', width: 1080, height: 1920, fps: '30/1', pixFmt: 'yuv420p', colorRange: 'tv', colorSpace: 'bt709', colorPrimaries: 'bt709',
    colorTransfer: 'bt709', frames: 1351, durationS: 45.03, bitrateKbps: 6200, maxGopFrames: 60, faststart: true,
  },
  audio: { codec: 'aac', sampleRate: 48000 },
  bytes: 36 * 1024 * 1024,
  loudness: { i: -14.2, tp: -1.4, lra: 6.1 },
  firstAudioS: 0, silences: [], blacks: [], freezes: [], flashMaxPerS: 0, flashAt: null, loopSsim: 0.93, edgeBands: { maxDensity: 0.004, at: null },
});
/** The pen pilot (spec §8.3): −23.4 LUFS, LRA 20.6, first sound at 0.79 s, silences, freezes, wrong colour tags, text in the unsafe area. */
const pilot = (): QcMeasure => {
  const m = good();
  return {
    ...m,
    video: { ...m.video, pixFmt: 'yuvj420p', colorRange: 'pc', colorSpace: null, colorPrimaries: null, colorTransfer: null },
    loudness: { i: -23.4, tp: -3.1, lra: 20.6 }, firstAudioS: 0.79, silences: [{ start: 12.1, end: 13.4 }], freezes: [{ start: 20, end: 21.2 }],
    edgeBands: { maxDensity: 0.061, at: 3.5 },
  };
};
const failed = (r: { id: string; pass: boolean }[]) => r.filter((c) => !c.pass).map((c) => c.id).sort();

describe('rubric final@2 and the QC contract', () => {
  it('has the spec weights, one owner per dimension, and QC points only on D6 (8 of 12: the audio reviewer has 4, final@2) and D7 (5)', () => {
    expect(RUBRIC_VERSION).toBe('final@2');
    expect(Object.values(DIMENSIONS).reduce((a, d) => a + d.weight, 0)).toBe(100);
    expect(DIMENSIONS.D6).toMatchObject({ weight: 12, owner: 'orchestrator' });
    expect(GATES.G6.owner).toBe('orchestrator');
    const points = (d: string) => QC_CHECK_IDS.filter((id) => QC_CHECKS[id].dimension === d).reduce((a, id) => a + QC_CHECKS[id].points, 0);
    expect([points('D6'), points('D7'), points('D2'), points('D3'), points('D8')]).toEqual([8, 5, 0, 0, 0]);
  });

  it('passes a well made final: every gate and full qc D6 (8) / D7', () => {
    const r = evaluateQc(good(), { variant: 'music', layoutIssues: [], coverOk: true });
    expect(failed(r)).toEqual([]);
    expect(qcScores(r)).toEqual({ D6: 8, D7: 5 });
    expect(r.map((c) => c.id)).toContain('g6_layout');
    expect(r.map((c) => c.id)).not.toContain('g6_edges');
  });

  it('the pilot\'s seven known errors all fail (spec §8.3 calibration)', () => {
    const r = evaluateQc(pilot(), { variant: 'music', layoutIssues: null, coverOk: true });
    expect(failed(r)).toEqual(['d3_freeze', 'd6_first_audio', 'd6_loudness', 'd6_lra', 'd6_silence', 'g1_color', 'g6_edges']);
    expect(r.find((c) => c.id === 'd6_loudness')).toMatchObject({ value: '-23,4 LUFS', limit: '−14 ±1 LUFS' });
    expect(r.find((c) => c.id === 'd6_silence')).toMatchObject({ at: 12.1 });
    expect(qcScores(r).D6).toBe(1); // only the true peak (−3,1 dBTP) passes (1 point in final@2)
  });

  it('checks only delivery and true peak on the TikTok variant (its sound is added in the app); LRA only on ≥ 10 s', () => {
    const t = evaluateQc({ ...good(), loudness: { i: -30, tp: -2, lra: 30 }, firstAudioS: 2, silences: [{ start: 3, end: 9 }] }, { variant: 'tiktok' });
    expect(t.map((c) => c.id).sort()).toEqual(['d6_true_peak', 'g1_audio', 'g1_bytes', 'g1_color', 'g1_duration', 'g1_fps', 'g1_size', 'g1_video']);
    expect(failed(t)).toEqual([]);
    // Brief design Y9: G1 checks the video's own window
    const w20 = evaluateQc({ ...good(), video: { ...good().video, durationS: 22 } }, { variant: 'music', layoutIssues: [], window: { minS: 20, maxS: 25 } });
    expect(w20.find((c) => c.id === 'g1_duration')).toMatchObject({ pass: true, limit: '20–25 sn' });
    const atTop = (d: number) => evaluateQc({ ...good(), video: { ...good().video, durationS: d } }, { variant: 'music', layoutIssues: [], window: { minS: 20, maxS: 25 } }).find((c) => c.id === 'g1_duration')!.pass;
    expect([atTop(751 / 30), atTop(25.1)]).toEqual([true, false]); // a 25 s storyboard renders 751 frames
    expect(evaluateQc({ ...good(), video: { ...good().video, durationS: 22 } }, { variant: 'music', layoutIssues: [] }).find((c) => c.id === 'g1_duration')).toMatchObject({ pass: false, limit: '35–55 sn' });
    const short = evaluateQc({ ...good(), video: { ...good().video, durationS: 8 }, loudness: { i: -14, tp: -2, lra: 25 } }, { variant: 'music', layoutIssues: [] });
    expect(short.map((c) => c.id)).not.toContain('d6_lra');
  });

  it('G6 from the layout manifest: a text box outside the safe area fails with its frame; no manifest → the visual edge scan', () => {
    const r = evaluateQc(good(), { variant: 'music', layoutIssues: [{ frame: 90, kind: 'beat', box: [24, 1500, 900, 1580] }], coverOk: true });
    expect(r.find((c) => c.id === 'g6_layout')).toMatchObject({ pass: false, value: '1 kutu dışarıda', at: 3 });
    const e = evaluateQc(good(), { variant: 'music', layoutIssues: null, coverOk: true });
    expect(e.find((c) => c.id === 'g6_edges')).toMatchObject({ pass: true });
  });

  it('builds a report: gates from both variants, scores from the music variant, Turkish reasons for failed gates', () => {
    const music = evaluateQc(good(), { variant: 'music', layoutIssues: [{ frame: 90, kind: 'label', id: 'yay', box: [900, 600, 1060, 650] }], coverOk: true });
    const tiktok = evaluateQc({ ...good(), video: { ...good().video, pixFmt: 'yuvj420p', colorRange: 'pc' } }, { variant: 'tiktok' });
    const rep = buildQcReport(music, tiktok);
    expect(QcReportSchema.safeParse(rep).success).toBe(true);
    expect(rep).toMatchObject({ rubric_version: 'final@2', gates: { G1: false, G5: true, G6: false }, scores: { D6: 8, D7: 5 }, pass: false });
    expect(qcFailures(rep)).toEqual(['Teslim (müziksiz): Renk etiketleri yuvj420p/pc/bt709/bt709/bt709 (yuv420p/tv/bt709)', 'Güvenli alan: 1 kutu dışarıda (3,0 sn)']);
  });
});
