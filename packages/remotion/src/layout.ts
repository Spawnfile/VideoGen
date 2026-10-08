import type * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyFrameFov, projectAnchor, sceneCamera, SceneClock } from '@videogen/scene3d';
import { DEFAULT_SAFE_AREA, type CaptionPage, type LayoutIssue, type SafeArea } from '@videogen/shared/browser';
import { activeBeat, DRAFT_FPS, draftLayout, overlayBoxes, placeLabels, safeRect, type DraftProps, type LabelBox, type TextBox } from './props.ts';

type LabelProps = Pick<DraftProps, 'width' | 'height' | 'yfov' | 'beats' | 'labels' | 'safeArea'>;

/** One source for Draft3D, Final3D and layout.json: seek the clips, apply the frame's lens, project and place the beat's labels. */
export function labelsAt(gltf: GLTF, clock: SceneClock, cam: THREE.PerspectiveCamera, p: LabelProps, frame: number): LabelBox[] {
  const t = frame / DRAFT_FPS;
  clock.seek(t);
  applyFrameFov(cam, { fps: DRAFT_FPS, yfov: p.yfov }, frame, p.width, p.height);
  const beat = activeBeat(p.beats, t);
  const anchors = (beat?.beat.parts ?? []).map((id) => ({ id, text: p.labels[id] ?? id, at: projectAnchor(gltf, cam, id, p.width, p.height) }));
  return placeLabels(anchors, p.width, p.height, draftLayout(p.width, p.height, p.safeArea).labelArea);
}

/**
 * `captions: true` marks a VO final: its beat text sits in the top band, which must stay above the label area (absent for silent finals).
 * `safeArea` (plan M7 Y15): the area the final was laid out in, at 1080×1920; a manifest written before M7 has none (= the default).
 */
export interface LayoutManifest { width: number; height: number; fps: number; captions?: true; safeArea?: SafeArea; frames: { frame: number; boxes: TextBox[] }[] }

/** Every 5th frame plus each beat start and the end of its 6-frame fade (spec §7.4 layout.json). */
export function layoutFrames(p: Pick<DraftProps, 'frames' | 'beats'> & { captions?: CaptionPage[] }): number[] {
  const set = new Set<number>();
  for (let f = 0; f <= p.frames; f += 5) set.add(f);
  for (const b of p.beats) for (const f of [Math.round(b.t_start * DRAFT_FPS), Math.round(b.t_start * DRAFT_FPS) + 6]) if (f <= p.frames) set.add(f);
  for (const c of p.captions ?? []) { const f = Math.ceil((c.start_ms * DRAFT_FPS) / 1000); if (f <= p.frames) set.add(f); }
  return [...set].sort((a, b) => a - b);
}

export function layoutManifest(p: LabelProps & Pick<DraftProps, 'frames' | 'hook'> & { captions?: CaptionPage[] }, gltf: GLTF): LayoutManifest {
  const clock = new SceneClock(gltf);
  const cam = sceneCamera(gltf);
  return {
    width: p.width, height: p.height, fps: DRAFT_FPS, ...(p.captions?.length ? { captions: true as const } : {}), safeArea: { ...(p.safeArea ?? DEFAULT_SAFE_AREA) },
    frames: layoutFrames(p).map((frame) => ({ frame, boxes: overlayBoxes(p, frame, labelsAt(gltf, clock, cam, p, frame)) })),
  };
}

/** G6 manifest check (plan E9): text boxes outside the manifest's safe area (M7 Y15; the default for an old manifest), 1 px tolerance for rounding. */
export function layoutIssues(m: LayoutManifest): LayoutIssue[] {
  const area = m.safeArea ?? DEFAULT_SAFE_AREA;
  const r = safeRect(m.width, m.height, area);
  const labelTop = draftLayout(m.width, m.height, area).labelArea.top;
  return m.frames.flatMap((f) => f.boxes
    .filter((b) => b.box[0] < r.left - 1 || b.box[1] < r.top - 1 || b.box[2] > r.right + 1 || b.box[3] > r.bottom + 1
      // VO final: a beat line of three lines would run into the label area under the top band.
      || (m.captions && b.kind === 'beat' && b.box[3] > labelTop + 1))
    .map((b) => ({ frame: f.frame, kind: b.kind, ...(b.id ? { id: b.id } : {}), box: b.box })));
}
