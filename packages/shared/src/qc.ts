import { z } from 'zod';
import { GATES, RUBRIC_VERSION, type DimensionId, type GateId } from './rubric.ts';

/** Plan E4. Folklore-tagged limits (LRA, bitrate) are revised after the first ten posts (spec §8.4). */
export const QC_LIMITS = {
  width: 1080, height: 1920, fps: '30/1', minS: 35, maxS: 55, maxBytes: 64 * 1024 * 1024,
  lufs: -14, lufsTol: 1, truePeak: -1, lra: 11, lraMinS: 10, firstAudioS: 0.15, silenceS: 0.3, silenceDb: -50,
  blackS: 0.1, freezeS: 0.5, flashDelta: 20, flashPerS: 3, loopSsim: 0.9, gopFrames: 60, minKbps: 3000, maxKbps: 11000, edgeDensity: 0.02,
} as const;

export type QcVariant = 'music' | 'tiktok';
export const QC_CHECK_IDS = [
  'g1_video', 'g1_size', 'g1_fps', 'g1_color', 'g1_audio', 'g1_duration', 'g1_bytes', 'g5_flash', 'g6_layout', 'g6_edges',
  'd6_loudness', 'd6_true_peak', 'd6_lra', 'd6_first_audio', 'd6_silence', 'd7_gop', 'd7_bitrate', 'd7_faststart', 'd7_cover',
  'd2_black', 'd3_freeze', 'd8_loop',
] as const;
export type QcCheckId = (typeof QC_CHECK_IDS)[number];
export interface QcCheckDef { label_tr: string; gate?: GateId; dimension?: DimensionId; points: number; variants: readonly QcVariant[] }

const BOTH: readonly QcVariant[] = ['music', 'tiktok'];
const MUSIC: readonly QcVariant[] = ['music'];
/**
 * Plan E3: stable ids. Points only for the dimensions the orchestrator owns (D6 12, D7 5); D2/D3/D8 measurements carry no points
 * here, they are inputs for their reviewer (M5b). The TikTok variant (sound added in the app) is checked for delivery and peak only.
 */
export const QC_CHECKS: Record<QcCheckId, QcCheckDef> = {
  g1_video: { label_tr: 'Kodek', gate: 'G1', points: 0, variants: BOTH },
  g1_size: { label_tr: 'Boyut', gate: 'G1', points: 0, variants: BOTH },
  g1_fps: { label_tr: 'Kare hızı', gate: 'G1', points: 0, variants: BOTH },
  g1_color: { label_tr: 'Renk etiketleri', gate: 'G1', points: 0, variants: BOTH },
  g1_audio: { label_tr: 'Ses kodeği', gate: 'G1', points: 0, variants: BOTH },
  g1_duration: { label_tr: 'Süre', gate: 'G1', points: 0, variants: BOTH },
  g1_bytes: { label_tr: 'Dosya boyutu', gate: 'G1', points: 0, variants: BOTH },
  g5_flash: { label_tr: 'Flaş', gate: 'G5', points: 0, variants: MUSIC },
  g6_layout: { label_tr: 'Metin güvenli alanda', gate: 'G6', points: 0, variants: MUSIC },
  g6_edges: { label_tr: 'Güvenli alanda metin izi', gate: 'G6', points: 0, variants: MUSIC },
  d6_loudness: { label_tr: 'Yüksek ses', dimension: 'D6', points: 4, variants: MUSIC },
  d6_true_peak: { label_tr: 'Gerçek tepe', dimension: 'D6', points: 2, variants: BOTH },
  d6_lra: { label_tr: 'Dinamik aralık', dimension: 'D6', points: 1, variants: MUSIC },
  d6_first_audio: { label_tr: 'İlk ses', dimension: 'D6', points: 2, variants: MUSIC },
  d6_silence: { label_tr: 'Sessizlik', dimension: 'D6', points: 3, variants: MUSIC },
  d7_gop: { label_tr: 'Anahtar kare aralığı', dimension: 'D7', points: 2, variants: MUSIC },
  d7_bitrate: { label_tr: 'Bit hızı', dimension: 'D7', points: 1, variants: MUSIC },
  d7_faststart: { label_tr: 'Hızlı başlatma', dimension: 'D7', points: 1, variants: MUSIC },
  d7_cover: { label_tr: 'Kapak', dimension: 'D7', points: 1, variants: MUSIC },
  d2_black: { label_tr: 'Siyah bölüm', dimension: 'D2', points: 0, variants: MUSIC },
  d3_freeze: { label_tr: 'Donma', dimension: 'D3', points: 0, variants: MUSIC },
  d8_loop: { label_tr: 'Döngü benzerliği', dimension: 'D8', points: 0, variants: MUSIC },
};

export interface Span { start: number; end: number }
/** Raw qc_probe measurements of one file (apps/worker/src/render/qc.ts). Times in seconds. */
export interface QcMeasure {
  video: {
    codec: string; profile: string | null; width: number; height: number; fps: string; pixFmt: string; colorRange: string | null; colorSpace: string | null;
    colorPrimaries: string | null; colorTransfer: string | null; frames: number; durationS: number; bitrateKbps: number; maxGopFrames: number; faststart: boolean;
  };
  audio: { codec: string; sampleRate: number } | null;
  bytes: number;
  loudness: { i: number; tp: number; lra: number } | null;
  /** End of the leading silence; null when the file is silent throughout. */
  firstAudioS: number | null;
  /** Silences (−50 dBFS, ≥ 0.3 s) after the first audio. */
  silences: Span[];
  blacks: Span[];
  freezes: Span[];
  flashMaxPerS: number;
  flashAt: number | null;
  /** SSIM of the last frame against the first (D8 loop). */
  loopSsim: number | null;
  /** Edge density in the G6 bands (0..1), only measured without a layout manifest. */
  edgeBands: { maxDensity: number; at: number | null };
}
/** A text box of layout.json outside the safe area (G6 manifest check). Box: [x0, y0, x1, y1] px at 1080×1920. */
export interface LayoutIssue { frame: number; kind: 'hook' | 'beat' | 'label'; id?: string; box: [number, number, number, number] }

export const QcCheckResultSchema = z.object({ id: z.enum(QC_CHECK_IDS), pass: z.boolean(), value: z.string(), limit: z.string(), at: z.number().min(0).optional() });
export type QcCheckResult = z.infer<typeof QcCheckResultSchema>;

const n1 = (x: number) => x.toFixed(1).replace('.', ',');

/** Plan E3/E4: deterministic, one result per applicable check id. */
export function evaluateQc(m: QcMeasure, o: { variant: QcVariant; layoutIssues?: LayoutIssue[] | null; coverOk?: boolean }): QcCheckResult[] {
  const L = QC_LIMITS;
  const v = m.video;
  const out: QcCheckResult[] = [];
  const add = (id: QcCheckId, pass: boolean, value: string, limit: string, at?: number | null) => {
    if (QC_CHECKS[id].variants.includes(o.variant)) out.push({ id, pass, value, limit, ...(at === undefined || at === null ? {} : { at: Math.round(at * 100) / 100 }) });
  };
  add('g1_video', v.codec === 'h264' && v.profile === 'High', `${v.codec} ${v.profile ?? '?'}`, 'h264 High');
  add('g1_size', v.width === L.width && v.height === L.height, `${v.width}×${v.height}`, `${L.width}×${L.height}`);
  add('g1_fps', v.fps === L.fps, v.fps, L.fps);
  const color = [v.pixFmt, v.colorRange, v.colorSpace, v.colorPrimaries, v.colorTransfer];
  add('g1_color', v.pixFmt === 'yuv420p' && v.colorRange === 'tv' && [v.colorSpace, v.colorPrimaries, v.colorTransfer].every((x) => x === 'bt709'),
    color.map((x) => x ?? 'yok').join('/'), 'yuv420p/tv/bt709');
  add('g1_audio', m.audio?.codec === 'aac' && m.audio.sampleRate === 48000, m.audio ? `${m.audio.codec} ${m.audio.sampleRate} Hz` : 'ses yok', 'aac 48000 Hz');
  add('g1_duration', v.durationS >= L.minS && v.durationS <= L.maxS, `${n1(v.durationS)} sn`, '35–55 sn');
  add('g1_bytes', m.bytes < L.maxBytes, `${n1(m.bytes / 1048576)} MB`, '< 64 MB');
  add('g5_flash', m.flashMaxPerS <= L.flashPerS, `${m.flashMaxPerS}/sn`, '≤ 3/sn', m.flashAt);
  if (o.layoutIssues) add('g6_layout', o.layoutIssues.length === 0, `${o.layoutIssues.length} kutu dışarıda`, '0', o.layoutIssues[0] ? o.layoutIssues[0].frame / 30 : null);
  else add('g6_edges', m.edgeBands.maxDensity <= L.edgeDensity, m.edgeBands.maxDensity.toFixed(3), `≤ ${L.edgeDensity}`, m.edgeBands.at);
  const ld = m.loudness;
  add('d6_loudness', !!ld && Math.abs(ld.i - L.lufs) <= L.lufsTol, ld ? `${n1(ld.i)} LUFS` : 'ölçülemedi', '−14 ±1 LUFS');
  add('d6_true_peak', !!ld && ld.tp <= L.truePeak, ld ? `${n1(ld.tp)} dBTP` : 'ölçülemedi', '≤ −1 dBTP');
  if (v.durationS >= L.lraMinS) add('d6_lra', !!ld && ld.lra <= L.lra, ld ? `${n1(ld.lra)} LU` : 'ölçülemedi', '≤ 11 LU');
  add('d6_first_audio', m.firstAudioS !== null && m.firstAudioS <= L.firstAudioS, m.firstAudioS === null ? 'ses yok' : `${m.firstAudioS.toFixed(2).replace('.', ',')} sn`, '≤ 0,15 sn');
  const gap = m.silences.find((s) => s.end - s.start > L.silenceS);
  add('d6_silence', m.firstAudioS !== null && !gap, gap ? `${n1(gap.end - gap.start)} sn` : 'yok', '≤ 0,3 sn', gap?.start);
  add('d7_gop', v.maxGopFrames <= L.gopFrames, `${v.maxGopFrames} kare`, `≤ ${L.gopFrames} kare`);
  add('d7_bitrate', v.bitrateKbps >= L.minKbps && v.bitrateKbps <= L.maxKbps, `${n1(v.bitrateKbps / 1000)} Mbps`, '3–11 Mbps');
  add('d7_faststart', v.faststart, v.faststart ? 'var' : 'yok', 'moov başta');
  add('d7_cover', o.coverOk === true, o.coverOk ? 'var' : 'yok', 'var');
  const black = m.blacks.find((s) => s.end - s.start >= L.blackS);
  add('d2_black', !black, black ? `${n1(black.end - black.start)} sn` : 'yok', '< 0,1 sn', black?.start);
  const freeze = m.freezes.find((s) => s.end - s.start > L.freezeS);
  add('d3_freeze', !freeze, freeze ? `${n1(freeze.end - freeze.start)} sn` : 'yok', '≤ 0,5 sn', freeze?.start);
  add('d8_loop', m.loopSsim !== null && m.loopSsim >= L.loopSsim, m.loopSsim === null ? 'ölçülemedi' : m.loopSsim.toFixed(2).replace('.', ','), '≥ 0,90');
  return out;
}

export function qcScores(results: QcCheckResult[]): { D6: number; D7: number } {
  const sum = (d: DimensionId) => results.filter((c) => c.pass && QC_CHECKS[c.id].dimension === d).reduce((a, c) => a + QC_CHECKS[c.id].points, 0);
  return { D6: sum('D6'), D7: sum('D7') };
}

export function qcGates(results: QcCheckResult[]): { G1: boolean; G5: boolean; G6: boolean } {
  const ok = (g: GateId) => results.filter((c) => QC_CHECKS[c.id].gate === g).every((c) => c.pass);
  return { G1: ok('G1'), G5: ok('G5'), G6: ok('G6') };
}

export const QcReportSchema = z.object({
  rubric_version: z.literal(RUBRIC_VERSION),
  music: z.array(QcCheckResultSchema),
  tiktok: z.array(QcCheckResultSchema),
  scores: z.object({ D6: z.number().min(0).max(12), D7: z.number().min(0).max(5) }),
  gates: z.object({ G1: z.boolean(), G5: z.boolean(), G6: z.boolean() }),
  pass: z.boolean(),
});
export type QcReport = z.infer<typeof QcReportSchema>;

/** Gates from both variants; D6/D7 scores from the music variant (the reviewed one, spec §7.1 step 10). */
export function buildQcReport(music: QcCheckResult[], tiktok: QcCheckResult[]): QcReport {
  const gates = qcGates([...music, ...tiktok]);
  return { rubric_version: RUBRIC_VERSION, music, tiktok, scores: qcScores(music), gates, pass: gates.G1 && gates.G5 && gates.G6 };
}

/** Failed gate checks as Turkish reasons ("Güvenli alan: 1 kutu dışarıda (3,0 sn)"). */
export function qcFailures(r: QcReport): string[] {
  const line = (c: QcCheckResult, variant: QcVariant) => {
    const gate = QC_CHECKS[c.id].gate!;
    const head = `${GATES[gate].label_tr}${variant === 'tiktok' ? ' (müziksiz)' : ''}`;
    const body = gate === 'G6' ? c.value : `${QC_CHECKS[c.id].label_tr} ${c.value} (${c.limit})`;
    return `${head}: ${body}${c.at !== undefined ? ` (${n1(c.at)} sn)` : ''}`;
  };
  return [
    ...r.tiktok.filter((c) => !c.pass && QC_CHECKS[c.id].gate).map((c) => line(c, 'tiktok')),
    ...r.music.filter((c) => !c.pass && QC_CHECKS[c.id].gate).map((c) => line(c, 'music')),
  ];
}
