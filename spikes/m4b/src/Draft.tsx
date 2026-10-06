import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const Scene: React.FC<{ gltf: GLTF }> = ({ gltf }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const set = useThree((s) => s.set);
  const cam = gltf.cameras[0] as THREE.PerspectiveCamera;
  const mixer = useMemo(() => {
    const m = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) { const a = m.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); }
    return m;
  }, [gltf]);
  useLayoutEffect(() => { cam.aspect = width / height; cam.updateProjectionMatrix(); set({ camera: cam }); }, [cam, width, height, set]);
  // history-free seek (probe P6) + per-frame vertical FOV from Blender (glTF does not animate the lens)
  mixer.stopAllAction();
  for (const clip of gltf.animations) { const a = mixer.clipAction(clip); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.time = Math.min(frame / fps, clip.duration); }
  mixer.update(0);
  const yfov = (window as unknown as { __track?: number[] }).__track?.[frame];
  if (yfov) { cam.fov = THREE.MathUtils.radToDeg(yfov); cam.aspect = width / height; cam.updateProjectionMatrix(); }
  gltf.scene.updateMatrixWorld(true);
  return (<>
    <ambientLight intensity={1.2} />
    <hemisphereLight args={['#dfe8ff', '#202030', 1.2]} />
    <directionalLight position={[10, 20, 10]} intensity={2} />
    <primitive object={gltf.scene} />
  </>);
};

export const Draft: React.FC<{ glbUrl: string; scale: number }> = ({ glbUrl }) => {
  const { width, height } = useVideoConfig();
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [handle] = useState(() => delayRender('glb'));
  useEffect(() => {
    new GLTFLoader().load(glbUrl, (g) => {
      fetch(glbUrl.replace('scene.glb', 'camera_track.json')).then((r) => r.json()).then((t) => { (window as unknown as { __track?: number[] }).__track = t.yfov; setGltf(g); continueRender(handle); });
      return;
      setGltf(g); continueRender(handle);
    }, undefined, (e) => { throw e; });
  }, [glbUrl, handle]);
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(#16203a, #070a14)' }}>
      {gltf ? <ThreeCanvas linear width={width} height={height}><Scene gltf={gltf} /></ThreeCanvas> : null}
    </AbsoluteFill>
  );
};
