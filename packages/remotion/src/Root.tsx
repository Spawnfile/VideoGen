import React from 'react';
import { Composition } from 'remotion';
import { Draft3D } from './Draft3D.tsx';
import { DRAFT_COMPOSITION, DRAFT_FPS, type DraftProps } from './props.ts';

/** Placeholder props; the renderer and the Player always pass real ones (calculateMetadata sizes the composition from them). */
export const EMPTY_DRAFT: DraftProps = {
  glbUrl: '', yfov: [0.5, 0.5], frames: 1, width: 540, height: 960,
  background: { top: '#16203a', bottom: '#070a14' }, text: { color: '#eef3ff', plate: 'rgba(8,12,24,0.72)', line: '#5cc8ff', accent: '#5cc8ff' },
  lighting: 'key_rim_cool', hook: '', beats: [], labels: {},
};

export const Root: React.FC = () => (
  <Composition
    id={DRAFT_COMPOSITION}
    component={Draft3D}
    fps={DRAFT_FPS}
    width={540}
    height={960}
    durationInFrames={2}
    defaultProps={EMPTY_DRAFT}
    calculateMetadata={({ props }) => ({ durationInFrames: props.frames + 1, width: props.width, height: props.height })}
  />
);
