import React from 'react';
import { Composition } from 'remotion';
import { Draft } from './Draft';
export const Root: React.FC = () => (
  <Composition id="Draft" component={Draft} durationInFrames={1351} fps={30} width={1080} height={1920}
    defaultProps={{ glbUrl: '', scale: 1 }}
    calculateMetadata={({ props }) => ({ width: Math.round(1080 * props.scale), height: Math.round(1920 * props.scale) })} />
);
