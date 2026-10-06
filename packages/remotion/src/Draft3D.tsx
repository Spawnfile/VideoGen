import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AbsoluteFill, cancelRender, continueRender, delayRender, interpolate, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyFrameFov, parseGlb, projectAnchor, sceneCamera, SceneClock } from '@videogen/scene3d';
import { activeBeat, DRAFT_FPS, draftLayout, placeLabels, type DraftProps, type LabelBox } from './props.ts';

type Vec = [number, number, number];
/** Draft approximations of the vg_blender studio presets (y-up glTF space). The environment map gives metals something to reflect (M4b §8). */
const LIGHTS: Record<DraftProps['lighting'], { ambient: number; key: { pos: Vec; color: string; i: number }; rim: { pos: Vec; color: string; i: number } }> = {
  key_rim_warm: { ambient: 0.35, key: { pos: [60, 90, 80], color: '#ffe2bf', i: 2.4 }, rim: { pos: [-80, 60, -60], color: '#ffd28a', i: 1.6 } },
  key_rim_cool: { ambient: 0.35, key: { pos: [60, 90, 80], color: '#eaf2ff', i: 2.4 }, rim: { pos: [-80, 60, -60], color: '#5cc8ff', i: 1.8 } },
  soft_box: { ambient: 0.8, key: { pos: [0, 120, 100], color: '#ffffff', i: 1.8 }, rim: { pos: [0, 80, -100], color: '#ffffff', i: 0.8 } },
};

/** The GLB once per URL; Remotion waits for it (delayRender) and fails the render loudly if it cannot load. */
function useGltf(url: string): GLTF | null {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [handle] = useState(() => delayRender('GLB yükleniyor'));
  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`GLB ${r.status}`); return r.arrayBuffer(); })
      .then(parseGlb)
      .then((g) => { if (live) setGltf(g); continueRender(handle); }, (e: unknown) => cancelRender(e));
    return () => { live = false; };
  }, [url, handle]);
  return gltf;
}

function Stage({ gltf, cam, lighting }: { gltf: GLTF; cam: THREE.PerspectiveCamera; lighting: DraftProps['lighting'] }) {
  const set = useThree((s) => s.set);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // The GLB camera drives the view; its fov/aspect come from camera_track (applyFrameFov), so r3f must not resize it.
  useLayoutEffect(() => { Object.assign(cam, { manual: true }); set({ camera: cam }); }, [cam, set]);
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  const L = LIGHTS[lighting];
  return (
    <>
      <ambientLight intensity={L.ambient} />
      <directionalLight position={L.key.pos} color={L.key.color} intensity={L.key.i} />
      <directionalLight position={L.rim.pos} color={L.rim.color} intensity={L.rim.i} />
      <primitive object={gltf.scene} />
    </>
  );
}

/**
 * Spec §7.1 step 5 / K7: the Three.js draft of the scene Blender built (K23: the GLB is the only geometry and motion source).
 * Transparent canvas (r3f default sRGB output, not `linear`: grilling C29) over the channel style's backdrop, the hook and beat
 * lines inside the safe area, and up to six labels anchored with the same math as the equivalence check (packages/scene3d).
 */
export const Draft3D: React.FC<DraftProps> = (p) => {
  const frame = useCurrentFrame();
  const gltf = useGltf(p.glbUrl);
  const rig = useMemo(() => (gltf ? { clock: new SceneClock(gltf), cam: sceneCamera(gltf) } : null), [gltf]);
  const t = frame / DRAFT_FPS;
  const beat = activeBeat(p.beats, t);
  const L = draftLayout(p.width, p.height);
  const s = p.width / 1080;
  let labels: LabelBox[] = [];
  if (gltf && rig) {
    // History-free seek (probe P6) + per-frame lens, before the canvas renders this frame.
    rig.clock.seek(t);
    applyFrameFov(rig.cam, { fps: DRAFT_FPS, yfov: p.yfov }, frame, p.width, p.height);
    const anchors = (beat?.beat.parts ?? []).map((id) => ({ id, text: p.labels[id] ?? id, at: projectAnchor(gltf, rig.cam, id, p.width, p.height) }));
    labels = placeLabels(anchors, p.width, p.height, L.labelArea);
  }
  const fade = beat ? interpolate(frame - Math.round(beat.beat.t_start * DRAFT_FPS), [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${p.background.top}, ${p.background.bottom})`, fontFamily: 'Inter, "DejaVu Sans", sans-serif' }}>
      {gltf && rig ? (
        <ThreeCanvas width={p.width} height={p.height}>
          <Stage gltf={gltf} cam={rig.cam} lighting={p.lighting} />
        </ThreeCanvas>
      ) : null}
      <svg width={p.width} height={p.height} style={{ position: 'absolute', inset: 0 }}>
        {labels.map((b) => (
          <g key={b.id}>
            <line x1={b.ax} y1={b.ay} x2={b.x > b.ax ? b.x : b.x + b.w} y2={b.y + b.h / 2} stroke={p.text.line} strokeWidth={2 * s} />
            <circle cx={b.ax} cy={b.ay} r={4 * s} fill={p.text.line} />
          </g>
        ))}
      </svg>
      {labels.map((b) => (
        <div key={b.id} data-label={b.id} style={{
          position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, boxSizing: 'border-box', padding: `0 ${Math.round(12 * s)}px`,
          fontSize: b.font, lineHeight: `${b.h}px`, color: p.text.color, background: p.text.plate, borderRadius: 8 * s,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{b.text}</div>
      ))}
      {beat?.index === 0 ? (
        <div data-text="hook" style={{ position: 'absolute', left: L.safe.left, top: L.hookTop, width: L.safe.right - L.safe.left, fontSize: L.hookFont, fontWeight: 500, lineHeight: 1.15, color: p.text.color }}>{p.hook}</div>
      ) : beat ? (
        <div data-text="beat" style={{ position: 'absolute', left: L.safe.left, bottom: L.lineBottom, width: L.safe.right - L.safe.left, opacity: fade, fontSize: L.lineFont, fontWeight: 500, lineHeight: 1.25, color: p.text.color }}>
          <span style={{ background: p.text.plate, padding: `${6 * s}px ${14 * s}px`, borderRadius: 10 * s, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{beat.beat.text}</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
