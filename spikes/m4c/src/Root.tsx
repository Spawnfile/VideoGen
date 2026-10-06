import React from 'react';
import { Composition } from 'remotion';
import { Draft } from './Draft.tsx';
export const Root: React.FC = () => <Composition id="Draft" component={Draft} durationInFrames={30} fps={30} width={540} height={960} defaultProps={{ n: 1 }} />;
