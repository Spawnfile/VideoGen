import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Minimal shapes of the vg_blender manifests (packages/shared SceneAnchors / CameraTrack; kept structural so the browser bundle stays zod-free). */
export interface AnchorsLike { width: number; height: number; frames: Record<string, Record<string, number[]>> }
export interface TrackLike { fps: number; yfov: number[] }

/** Parses a GLB (Node or browser). vg_blender GLBs carry no image textures, so no DOM image loader is needed in Node. */
export function parseGlb(data: ArrayBuffer | Uint8Array): Promise<GLTF> {
  const buf = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  return new Promise((ok, ko) => new GLTFLoader().parse(buf as ArrayBuffer, '', ok, ko));
}

/**
 * Plays every clip of a vg_blender GLB at an absolute time. History-free: a finished LoopOnce action is paused by the mixer and
 * `mixer.setTime` would leave it at time 0 (probe P6, 16 611 px); here every action is re-enabled and placed directly.
 */
export class SceneClock {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions: THREE.AnimationAction[];

  constructor(readonly gltf: GLTF) {
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    this.actions = gltf.animations.map((clip) => {
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
      return a;
    });
  }

  seek(seconds: number): void {
    for (const a of this.actions) {
      a.enabled = true;
      a.paused = false;
      a.time = Math.min(Math.max(0, seconds), a.getClip().duration);
    }
    this.mixer.update(0);
    this.gltf.scene.updateMatrixWorld(true);
  }
}

export function sceneCamera(gltf: GLTF): THREE.PerspectiveCamera {
  const cam = gltf.cameras[0];
  if (!(cam instanceof THREE.PerspectiveCamera)) throw new Error('GLB has no perspective camera');
  return cam;
}

/** glTF does not animate the lens: the per-frame vertical FOV comes from camera_track.json. */
export function applyFrameFov(cam: THREE.PerspectiveCamera, track: TrackLike, frame: number, width: number, height: number): void {
  const yfov = track.yfov[Math.min(Math.max(0, Math.round(frame)), track.yfov.length - 1)]!;
  cam.fov = THREE.MathUtils.radToDeg(yfov);
  cam.aspect = width / height;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

/** Screen position (px, top-left origin) of `anchor_<partId>`; null when the node is missing or behind the camera. */
export function projectAnchor(gltf: GLTF, cam: THREE.PerspectiveCamera, partId: string, width: number, height: number): [number, number] | null {
  const node = gltf.scene.getObjectByName(`anchor_${partId}`);
  if (!node) return null;
  const world = node.getWorldPosition(new THREE.Vector3());
  if (world.clone().applyMatrix4(cam.matrixWorldInverse).z >= 0) return null;
  const p = world.project(cam);
  return [((p.x + 1) / 2) * width, ((1 - p.y) / 2) * height];
}

export interface EquivalenceResult { worstPx: number; pass: boolean; missing: string[]; rows: { frame: number; partId: string; px: number }[] }

/** Spec §7.3: anchors from Blender (anchors.json) against three.js math on the same GLB, on the given frames; fails above 8 px. */
export function checkEquivalence(gltf: GLTF, anchors: AnchorsLike, track: TrackLike, frames: number[], limitPx = 8): EquivalenceResult {
  const clock = new SceneClock(gltf);
  const cam = sceneCamera(gltf);
  const rows: EquivalenceResult['rows'] = [];
  const missing = new Set<string>();
  for (const frame of frames) {
    const ref = anchors.frames[String(frame)];
    if (!ref) { missing.add(`frame:${frame}`); continue; }
    clock.seek(frame / track.fps);
    applyFrameFov(cam, track, frame, anchors.width, anchors.height);
    for (const [partId, [bx, by]] of Object.entries(ref)) {
      const p = projectAnchor(gltf, cam, partId, anchors.width, anchors.height);
      if (!p) { missing.add(partId); continue; }
      rows.push({ frame, partId, px: Math.round(Math.hypot(p[0] - bx!, p[1] - by!) * 1000) / 1000 });
    }
  }
  const worstPx = rows.reduce((m, r) => Math.max(m, r.px), 0);
  return { worstPx, pass: missing.size === 0 && worstPx <= limitPx, missing: [...missing].sort(), rows };
}
