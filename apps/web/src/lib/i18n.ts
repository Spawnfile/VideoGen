import {
  isTikTokVideoUrl, type ChecklistItem, type DimensionId, type DraftCheckId, type DurationSource, type DurationWindow, type GateId, type HookPattern,
  type PublicationStatus, type QcCheckId, type RoleName, type StepKey, type StepStatus, type VideoStatus,
} from '@videogen/shared/browser';

/*
 * The interface is English; the shared labels stay Turkish because the agents and the TikTok caption use them too.
 * These maps translate by id. test/i18n.test.ts fails when a shared map gains an id that has no English label here.
 */

export const STEP_EN: Record<StepKey, string> = {
  research: 'Research', storyboard: 'Storyboard', voice: 'Voiceover', music: 'Music', build: 'Scene build', draft_render: 'Draft render',
  draft_review: 'Draft review', final_render: 'Final render', compose: 'Compose', qc: 'Automatic checks', review: 'Review', finalize: 'Finalize', remix: 'Audio mix',
};
export const STEP_STATUS_EN: Record<StepStatus, string> = {
  pending: 'waiting', queued: 'queued', running: 'running', waiting_gpu: 'waiting for GPU', waiting_limit: 'waiting for usage limit', waiting_disk: 'waiting for disk space',
  done: 'done', failed: 'failed', skipped: 'skipped', cancelled: 'stopped',
};
export const VIDEO_STATUS_EN: Record<VideoStatus, string> = {
  queued: 'Queued', running: 'In production', ready: 'Ready to publish', needs_human: 'Needs you', failed: 'Failed', cancelled: 'Stopped', published: 'Published',
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
export const PUBLICATION_STATUS_EN: Record<PublicationStatus, string> = {
  queued: 'queued', uploading: 'uploading', processing: 'processing', waiting: 'waiting for TikTok', sent: 'in your inbox', failed: 'not sent', published: 'published',
};
export const SEVERITY_EN: Record<string, string> = { blocker: 'blocker', major: 'major', minor: 'minor' };
export const REVIEWER_EN: Record<string, string> = { reviewer_visual: 'Visual', reviewer_facts: 'Accuracy', reviewer_retention: 'Retention', reviewer_audio: 'Audio' };

/** The finish card's checklist line; the wording depends on the item's variant (`required`), the id alone does not say it. */
export function CHECKLIST_EN(i: Pick<ChecklistItem, 'id' | 'required'>): string {
  switch (i.id) {
    case 'sound': return i.required ? 'Add a sound in the TikTok app' : 'Add a sound in the TikTok app (optional: this variant has music)';
    case 'visibility': return 'Visibility: Everyone';
    case 'aigc': return i.required ? 'I turned on the AI label in TikTok (cloned voice)' : 'No AI label needed: stock TTS voice and Blender CG';
    case 'commercial': return 'Commercial content disclosure: leave it off (no brand deal)';
  }
}

/** Same rule as shared `canMarkPublished`, in English. */
export function markBlocker(items: ChecklistItem[], ticked: Record<string, boolean>, url: string): string | null {
  const missing = items.find((i) => i.required && !ticked[i.id]);
  if (missing) return `Tick the required item: ${CHECKLIST_EN(missing)}`;
  if (!isTikTokVideoUrl(url)) return 'Enter a valid TikTok video link';
  return null;
}

export const score = (n: number): string => (Math.round(Math.round(n * 100) / 10) / 10).toFixed(1);
export const windowLabel = (w: DurationWindow): string => `${w.minS}–${w.maxS} s`;
export const percent = (u: number | null | undefined): string => (u === null || u === undefined ? '—' : `${Math.round(u * 100)}%`);
