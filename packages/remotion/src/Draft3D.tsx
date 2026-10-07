import React, { useLayoutEffect, useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sceneCamera, SceneClock } from '@videogen/scene3d';
import { useGltf } from './gltf.ts';
import { labelsAt } from './layout.ts';
import { Overlay } from './Overlay.tsx';
import type { DraftProps, LabelBox } from './props.ts';

type Vec = [number, number, number];
/** Draft approximations of the vg_blender studio presets (y-up glTF space). The environment map gives metals something to reflect (M4b §8). */
const LIGHTS: Record<DraftProps['lighting'], { ambient: number; key: { pos: Vec; color: string; i: number }; rim: { pos: Vec; color: string; i: number } }> = {
  key_rim_warm: { ambient: 0.35, key: { pos: [60, 90, 80], color: '#ffe2bf', i: 2.4 }, rim: { pos: [-80, 60, -60], color: '#ffd28a', i: 1.6 } },
  key_rim_cool: { ambient: 0.35, key: { pos: [60, 90, 80], color: '#eaf2ff', i: 2.4 }, rim: { pos: [-80, 60, -60], color: '#5cc8ff', i: 1.8 } },
  soft_box: { ambient: 0.8, key: { pos: [0, 120, 100], color: '#ffffff', i: 1.8 }, rim: { pos: [0, 80, -100], color: '#ffffff', i: 0.8 } },
};

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
 * Transparent canvas (r3f default sRGB output, not `linear`: grilling C29) over the channel style's backdrop, and the shared text
 * layer (Overlay) with labels anchored by the same math as the equivalence check (labelsAt).
 */
export const Draft3D: React.FC<DraftProps> = (p) => {
  const frame = useCurrentFrame();
  const gltf = useGltf(p.glbUrl);
  const rig = useMemo(() => (gltf ? { clock: new SceneClock(gltf), cam: sceneCamera(gltf) } : null), [gltf]);
  // labelsAt seeks the clips and applies this frame's lens before the canvas renders the frame (probe P6).
  const labels: LabelBox[] = gltf && rig ? labelsAt(gltf, rig.clock, rig.cam, p, frame) : [];
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${p.background.top}, ${p.background.bottom})`, fontFamily: 'Inter, "DejaVu Sans", sans-serif' }}>
      {gltf && rig ? (
        <ThreeCanvas width={p.width} height={p.height}>
          <Stage gltf={gltf} cam={rig.cam} lighting={p.lighting} />
        </ThreeCanvas>
      ) : null}
      <Overlay p={p} frame={frame} labels={labels} />
    </AbsoluteFill>
  );
};
