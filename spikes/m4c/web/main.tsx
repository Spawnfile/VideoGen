import React from 'react';
import { createRoot } from 'react-dom/client';
import { Player } from '@remotion/player';
import { Draft } from '../src/Draft.tsx';
createRoot(document.getElementById('root')!).render(<Player component={Draft} inputProps={{ n: 1 }} durationInFrames={30} fps={30} compositionWidth={540} compositionHeight={960} controls style={{ width: 270 }} />);
