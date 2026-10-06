import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { label } from '@vg/fake';
import { hue } from './props.ts';
export const Draft: React.FC<{ n: number }> = ({ n }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (<AbsoluteFill style={{ background: '#16203a' }}>
    <ThreeCanvas linear width={width} height={height}><mesh rotation={[0, frame / 20, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={hue(n)} /></mesh><ambientLight /></ThreeCanvas>
    <div style={{ position: 'absolute', top: 200, color: 'white' }}>{label(frame)}</div>
  </AbsoluteFill>);
};
