import {
  type ChannelStyleId, type FinalCheckId, type DimensionId, type DraftCheckId, type DurationSource, type DurationWindow, type GateId, type HookPattern,
  type QcCheckId, type RoleName, type StepKey, type StepStatus, type VideoStatus,
} from '@videogen/shared/browser';

/*
 * The interface is English; the shared labels stay Turkish because the agents use them too.
 * These maps translate by id. test/i18n.test.ts fails when a shared map gains an id that has no English label here.
 */

export const STEP_EN: Record<StepKey, string> = {
  research: 'Research', storyboard: 'Storyboard', voice: 'Voiceover', music: 'Music', build: 'Scene build', draft_render: 'Draft render',
  draft_review: 'Draft review', final_render: 'Final render', compose: 'Compose', qc: 'Automatic checks', review: 'Review', finalize: 'Finalize',
};
export const STEP_STATUS_EN: Record<StepStatus, string> = {
  pending: 'waiting', queued: 'queued', running: 'running', waiting_gpu: 'waiting for GPU', waiting_limit: 'waiting for usage limit', waiting_disk: 'waiting for disk space',
  done: 'done', failed: 'failed', skipped: 'skipped', cancelled: 'stopped',
};
export const VIDEO_STATUS_EN: Record<VideoStatus, string> = {
  queued: 'Queued', running: 'In production', ready: 'Ready to publish', needs_human: 'Needs you', failed: 'Failed', cancelled: 'Stopped',
};
export const ROLE_EN: Record<RoleName, string> = {
  researcher: 'Researcher', storyboarder: 'Storyboarder', builder: 'Video builder', audio_director: 'Audio director', reviewer_visual: 'Visual reviewer',
  reviewer_facts: 'Accuracy reviewer', reviewer_retention: 'Retention reviewer', reviewer_audio: 'Audio reviewer', fixer: 'Fixer', chat: 'Chat', summarizer: 'Summarizer',
};
export const DURATION_SOURCE_EN: Record<DurationSource, string> = { default: 'default', agent: 'agent suggestion', user: 'your choice' };
export const HOOK_PATTERN_EN: Record<HookPattern, string> = {
  question: 'Curiosity question', number: 'Surprising number', misconception: 'Common misconception', reveal: 'Visual reveal', contrast: 'Outside vs inside',
};
export const DIMENSION_EN: Record<DimensionId, string> = {
  D1: 'Hook', D2: 'Visual craft', D3: 'Motion and pacing', D4: 'Facts and accuracy', D5: 'Type and labels', D6: 'Sound', D7: 'Technical polish',
  D8: 'Loop and retention', D9: 'Originality',
};
export const GATE_EN: Record<GateId, string> = { G1: 'Delivery', G2: 'Accuracy', G3: 'Rights', G4: 'Disclosure', G5: 'Safety', G6: 'Safe area' };
export const DRAFT_CHECK_EN: Record<DraftCheckId, string> = {
  hero_frame0: 'Hero in the first frame', mechanism_shot: 'Mechanism shot', parts_visible: 'Parts visible', no_intersection: 'No intersecting parts',
  labels_correct: 'Labels correct', text_readable: 'Text readable', motion_flow: 'Motion flow', no_slop: 'Originality',
};
export const QC_CHECK_EN: Record<QcCheckId, string> = {
  g1_video: 'Codec', g1_size: 'Size', g1_fps: 'Frame rate', g1_color: 'Color tags', g1_audio: 'Audio codec', g1_duration: 'Duration', g1_bytes: 'File size',
  g5_flash: 'Flashing', g6_layout: 'Text inside the safe area', g6_edges: 'Text traces in the safe area', d6_loudness: 'Loudness', d6_true_peak: 'True peak',
  d6_lra: 'Dynamic range', d6_first_audio: 'First sound', d6_silence: 'Silence', d7_gop: 'Keyframe interval', d7_bitrate: 'Bitrate', d7_faststart: 'Fast start',
  d7_cover: 'Cover', d2_black: 'Black section', d3_freeze: 'Freeze', d8_loop: 'Loop similarity',
};
export const FINAL_CHECK_EN: Record<FinalCheckId, string> = {
  hero_frame0: 'Hero in the first frame', mechanism_shot: 'Mechanism shot', parts_visible: 'Parts visible', materials: 'Materials and light',
  no_intersection: 'No intersecting parts', contrast: 'Contrast', event_density: 'Event density', no_freeze: 'No freezes', smooth_motion: 'Smooth motion',
  labels_correct: 'Labels correct', text_readable: 'Text readable', text_dwell: 'Text on screen long enough', no_slop: 'No stock phrases',
  no_genai_look: 'No generative-AI look', fresh_hook: 'Fresh hook', no_third_party: 'No third-party rights', honest_cg: 'CG shown honestly',
  claims_supported: 'Claims supported', info_density: 'Information density', mechanism_explained: 'Mechanism explained', engineer_insight: 'Engineering insight',
  storyboard_match: 'Matches the storyboard', claims_verified: 'Claims verified', hook_frame0: 'Hook in the first frame', hook_pattern: 'Hook pattern',
  open_question: 'Open question', hook_text_short: 'Short hook text', loop_seam: 'Loop seam', rehook: 'Re-hook', payoff: 'Payoff moment',
  music_mood: 'Music fit', music_sync: 'Music sync', mix_balance: 'Mix balance',
};
export const STYLE_EN: Record<ChannelStyleId, { name: string; description: string }> = {
  atolye: { name: 'Workshop', description: 'Warm, dark studio with brass accents; an engineer’s desk.' },
  beyaz_lab: { name: 'White lab', description: 'Bright and clean with catalog clarity; soft box light.' },
  gece_mavisi: { name: 'Night blue', description: 'Dark blue technical-drawing mood with a cool rim light (the pilot video’s look).' },
  yaklasim: { name: 'YAKLASIM', description: 'Navy radial gradient with a faint 90 px grid; white Montserrat 900 with one yellow accent; warm key, blue and orange rims.' },
};
export const SEVERITY_EN: Record<string, string> = { blocker: 'blocker', major: 'major', minor: 'minor' };
export const REVIEWER_EN: Record<string, string> = { reviewer_visual: 'Visual', reviewer_facts: 'Accuracy', reviewer_retention: 'Retention', reviewer_audio: 'Audio' };


export const score = (n: number): string => (Math.round(Math.round(n * 100) / 10) / 10).toFixed(1);
export const windowLabel = (w: DurationWindow): string => `${w.minS}–${w.maxS} s`;
export const percent = (u: number | null | undefined): string => (u === null || u === undefined ? '—' : `${Math.round(u * 100)}%`);
