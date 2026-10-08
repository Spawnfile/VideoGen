import React from 'react';
import { interpolate } from 'remotion';
import type { CaptionPage } from '@videogen/shared/browser';
import { activeBeat, activeCaption, DRAFT_FPS, draftLayout, type DraftProps, type LabelBox } from './props.ts';

/** The text layer shared by Draft3D and Final3D (plan E7): label lines and plates, the hook on beat 0, then the fading beat line. */
export const Overlay: React.FC<{ p: Pick<DraftProps, 'width' | 'height' | 'hook' | 'beats' | 'text' | 'safeArea'> & { captions?: CaptionPage[] }; frame: number; labels: LabelBox[] }> = ({ p, frame, labels }) => {
  const s = p.width / 1080;
  const L = draftLayout(p.width, p.height, p.safeArea);
  const beat = activeBeat(p.beats, frame / DRAFT_FPS);
  const fade = beat ? interpolate(frame - Math.round(beat.beat.t_start * DRAFT_FPS), [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  const cap = activeCaption(p.captions, (frame * 1000) / DRAFT_FPS);
  const plate = { background: p.text.plate, padding: `${6 * s}px ${14 * s}px`, borderRadius: 10 * s, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' } as const;
  return (
    <>
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
        <div data-text="hook" style={{ position: 'absolute', left: L.safe.left, top: L.hookTop, width: L.safe.right - L.safe.left, fontSize: L.hookFont, fontWeight: 500, lineHeight: 1.15, color: p.text.color, overflowWrap: 'anywhere' }}>
          <span style={plate}>{p.hook}</span>
        </div>
      ) : beat ? (
        <div data-text="beat" style={{ position: 'absolute', left: L.safe.left, ...(p.captions?.length ? { top: L.hookTop } : { bottom: L.lineBottom }), width: L.safe.right - L.safe.left, opacity: fade, fontSize: L.lineFont, fontWeight: 500, lineHeight: 1.25, color: p.text.color, overflowWrap: 'anywhere' }}>
          <span style={plate}>{beat.beat.text}</span>
        </div>
      ) : null}
      {cap ? (
        <div data-text="caption" style={{ position: 'absolute', left: L.safe.left, bottom: L.lineBottom, width: L.safe.right - L.safe.left, fontSize: L.lineFont, fontWeight: 500, lineHeight: 1.25, color: p.text.color, overflowWrap: 'anywhere' }}>
          <span style={plate}>{cap.page.words.map((w, i) => (
            <React.Fragment key={i}>{i ? ' ' : ''}<span style={i === cap.word ? { color: p.text.line } : undefined}>{w.text}</span></React.Fragment>
          ))}</span>
        </div>
      ) : null}
    </>
  );
};
