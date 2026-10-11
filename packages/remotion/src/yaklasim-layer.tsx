import React from 'react';
import { AbsoluteFill, continueRender, delayRender } from 'remotion';
import { splitAccent, YAKLASIM } from '@videogen/shared/browser';
import montserrat900 from '@fontsource/montserrat/files/montserrat-latin-900-normal.woff2';
import { activeBeat, DRAFT_FPS, type DraftProps } from './props.ts';
import { beatScale, beatText, counterProgress, counterText, flashAt, sinceBeat, wrap, yaklasimLayout, Y_FONT } from './yaklasim.ts';

/** Montserrat 900 from the package (no network at render time); the render waits for it so frame 0 never shows a fallback font. */
if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
  const handle = delayRender('Montserrat 900');
  const face = new FontFace('Montserrat', `url(${montserrat900}) format('woff2')`, { weight: '900' });
  face.load().then((f) => { document.fonts.add(f); continueRender(handle); }, () => continueRender(handle));
}

const P = YAKLASIM.palette;

/** Spec Y8: the navy radial gradient with the faint 90 px grid fading towards the edges (episodes/rubik Background). */
export const YaklasimBackdrop: React.FC<{ width: number }> = ({ width }) => {
  const s = width / 1080;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 42%, ${P.inner} 0%, ${P.mid} 55%, ${P.outer} 100%)` }}>
      <AbsoluteFill style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.045) 2px, transparent 2px)',
        backgroundSize: `${P.gridPx * s}px ${P.gridPx * s}px`,
        maskImage: 'radial-gradient(circle at 50% 45%, black 20%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(circle at 50% 45%, black 20%, transparent 75%)',
      }} />
    </AbsoluteFill>
  );
};

/** The frame (3D) moved by the flash cut's shake and zoom punch (spec Y11). */
export const YaklasimShake: React.FC<{ p: Pick<DraftProps, 'beats'>; frame: number; children: React.ReactNode }> = ({ p, frame, children }) => {
  const f = flashAt(p.beats, frame);
  return <AbsoluteFill style={{ transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.zoom})`, transformOrigin: '50% 50%' }}>{children}</AbsoluteFill>;
};

/** The wrapped lines of `text` with the accent span coloured, even when it breaks across lines (ranges over the plain text). */
const AccentLines: React.FC<{ text: string; font: number; maxW: number }> = ({ text, font, maxW }) => {
  const a = splitAccent(text) ?? { before: text.replaceAll('*', ''), accent: null, after: '' };
  const plain = `${a.before}${a.accent ?? ''}${a.after}`.replace(/\s+/g, ' ').trim();
  const lead = a.before.replace(/\s+/g, ' ').trimStart().length;
  const range = a.accent ? [lead, lead + a.accent.replace(/\s+/g, ' ').length] : [0, 0];
  let at = 0;
  return (
    <>
      {wrap(plain, font, maxW).map((l, i) => {
        const start = plain.indexOf(l, at);
        at = start + l.length;
        const [s0, s1] = [Math.max(0, range[0]! - start), Math.min(l.length, range[1]! - start)];
        return (
          <div key={i}>{s1 > s0 ? <>{l.slice(0, s0)}<span style={{ color: P.accent }}>{l.slice(s0, s1)}</span>{l.slice(s1)}</> : l}</div>
        );
      })}
    </>
  );
};

/** Spec Y9–Y11: the text (instant, centred in the top band, one yellow accent), the counter, the hero ring and the white flash. */
export const YaklasimLayer: React.FC<{ p: Pick<DraftProps, 'width' | 'height' | 'hook' | 'beats' | 'safeArea'>; frame: number; ring: [number, number] | null }> = ({ p, frame, ring }) => {
  const s = p.width / 1080;
  const L = yaklasimLayout(p.width, p.height, p.safeArea!);
  const active = activeBeat(p.beats, frame / DRAFT_FPS);
  const fx = flashAt(p.beats, frame);
  if (!active) return null;
  const b = active.beat;
  const d = sinceBeat(b, frame);
  const t = beatText(p, active.index);
  const font = t.kind === 'hook' ? L.hookFont : L.lineFont;
  const line = (size: number): React.CSSProperties => ({
    fontFamily: Y_FONT, fontWeight: 900, fontSize: size, lineHeight: 1.08, color: P.text, textAlign: 'center', letterSpacing: -0.5 * s,
    textShadow: `0 ${4 * s}px ${18 * s}px rgba(0,0,0,0.55)`,
  });
  const pulse = 1 + 0.08 * Math.sin((frame / DRAFT_FPS) * Math.PI * 4);
  return (
    <>
      {ring ? (
        <div data-ring style={{
          position: 'absolute', left: ring[0] - 110 * s * pulse, top: ring[1] - 110 * s * pulse, width: 220 * s * pulse, height: 220 * s * pulse,
          borderRadius: '50%', border: `${9 * s}px solid ${P.accent}`, boxShadow: `0 0 ${24 * s}px rgba(255,210,63,0.55)`,
        }} />
      ) : null}
      <div data-text={t.kind} style={{
        position: 'absolute', left: L.safe.left, top: L.textTop, width: L.maxW, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 * s,
        transform: `scale(${beatScale(active.index, d)})`, transformOrigin: '50% 0%',
      }}>
        {b.role === 'counter' && b.counter ? <div data-text="counter" style={{ ...line(L.counterFont), color: P.accent }}>{counterText(b.counter.value, counterProgress(b, frame))}</div> : null}
        <div style={line(font)}><AccentLines text={t.text} font={font} maxW={L.maxW} /></div>
      </div>
      {fx.white > 0 ? <AbsoluteFill style={{ background: '#ffffff', opacity: fx.white }} /> : null}
    </>
  );
};
