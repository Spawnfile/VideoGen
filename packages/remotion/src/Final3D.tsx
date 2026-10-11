import React, { useMemo } from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { sceneCamera, SceneClock } from '@videogen/scene3d';
import { useGltf } from './gltf.ts';
import { labelsAt, ringAt } from './layout.ts';
import { Overlay } from './Overlay.tsx';
import { frameUrl, type FinalProps, type LabelBox } from './props.ts';
import { YaklasimBackdrop, YaklasimLayer, YaklasimShake } from './yaklasim-layer.tsx';

/**
 * Spec §7.1 step 8 / plan E7: the Blender frame (transparent RGBA) on the channel style's backdrop, under the same text layer as
 * the draft. The GLB is only used for the label anchors (no WebGL here).
 */
export const Final3D: React.FC<FinalProps> = (p) => {
  const frame = useCurrentFrame();
  const gltf = useGltf(p.glbUrl);
  const rig = useMemo(() => (gltf ? { clock: new SceneClock(gltf), cam: sceneCamera(gltf) } : null), [gltf]);
  const labels: LabelBox[] = gltf && rig ? labelsAt(gltf, rig.clock, rig.cam, p, frame) : [];
  if (p.look === 'yaklasim') {
    // YAKLASIM spec Y8–Y11: navy grid backdrop, the Blender frame under the flash shake, the YAKLASIM text layer.
    return (
      <AbsoluteFill>
        <YaklasimBackdrop width={p.width} />
        <YaklasimShake p={p} frame={frame}>
          <Img src={frameUrl(p.framesUrl, frame)} style={{ position: 'absolute', left: 0, top: 0, width: p.width, height: p.height }} />
        </YaklasimShake>
        <YaklasimLayer p={p} frame={frame} ring={gltf && rig ? ringAt(gltf, rig.cam, p, frame) : null} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${p.background.top}, ${p.background.bottom})`, fontFamily: 'Inter, "DejaVu Sans", sans-serif' }}>
      <Img src={frameUrl(p.framesUrl, frame)} style={{ position: 'absolute', left: 0, top: 0, width: p.width, height: p.height }} />
      <Overlay p={p} frame={frame} labels={labels} />
    </AbsoluteFill>
  );
};
