import React from 'react';
import { AbsoluteFill } from 'remotion';
import { DEFAULT_SAFE_AREA } from '@videogen/shared/browser';

/** Remotion composition id of the safe-area calibration card (plan M7 Y16); 5 s at 30 fps, 1080×1920. */
export const SAFE_AREA_CARD = 'SafeAreaCard';
export const SAFE_AREA_CARD_FRAMES = 150;
const W = 1080;
const H = 1920;
/** How far the side rulers reach into the frame (px). */
const REACH = 300;
const BG = '#0b0f14';
/** Line colour and thickness by value: every 100 px white (2 px), every 50 px light, every 10 px dim. */
const tick = (v: number) => (v % 100 === 0 ? { fill: '#ffffff', w: 2 } : v % 50 === 0 ? { fill: '#b8c2cc', w: 1 } : { fill: '#3a434d', w: 1 });
const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
/** Rows where the side rulers carry their labels (a band that masks the horizontal lines). */
const LABEL_ROWS = [300, 960, 1620];
/** The title plate (the y labels under it are left out). */
const TITLE = { top: 1156, bottom: 1270 };
const font = { fontFamily: 'Inter, "DejaVu Sans", sans-serif', fontWeight: 500 } as const;

const Label: React.FC<{ x: number; y: number; text: string; size?: number; anchor?: 'start' | 'middle' | 'end'; rotate?: boolean; color?: string }> = ({ x, y, text, size = 20, anchor = 'start', rotate, color = '#ffffff' }) => (
  <text x={x} y={y} fontSize={size} fill={color} textAnchor={anchor} dominantBaseline="middle" transform={rotate ? `rotate(-90 ${x} ${y})` : undefined} style={font}>{text}</text>
);

/**
 * Plan M7 Y16: the card the user shares privately on TikTok to read where the app's buttons and captions begin. A horizontal line every
 * 10 px of y (labelled every 50 px with its y: the `top` and `bottom` values), a ruler at the right edge (labelled with the distance
 * from the right edge: the `right` value) and one at the left edge (`left`), the frame size in the corners. The default area is dashed.
 */
export const SafeAreaCard: React.FC = () => (
  <AbsoluteFill style={{ background: BG }}>
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" style={{ position: 'absolute', inset: 0 }}>
      {range(10, H - 10, 10).map((y) => { const t = tick(y); return <rect key={`h${y}`} x={0} y={y} width={W} height={t.w} fill={t.fill} />; })}
      {range(10, REACH, 10).map((d) => { const t = tick(d); return <rect key={`r${d}`} x={W - d} y={0} width={t.w} height={H} fill={t.fill} />; })}
      {range(10, 200, 10).map((d) => { const t = tick(d); return <rect key={`l${d}`} x={d} y={0} width={t.w} height={H} fill={t.fill} />; })}
      {/* y labels on plates (left of centre and right of centre, clear of both side rulers) */}
      {range(50, H - 50, 50).filter((y) => y < TITLE.top - 28 || y > TITLE.bottom).flatMap((y) => [210, 640].map((x) => (
        <g key={`yl${x}-${y}`}>
          <rect x={x - 4} y={y + 4} width={66} height={24} fill={BG} />
          <Label x={x} y={y + 16} text={String(y)} />
        </g>
      )))}
      {/* side ruler labels: the distance from the right edge, and from the left edge */}
      {LABEL_ROWS.map((row) => (
        <g key={`row${row}`}>
          <rect x={W - REACH - 6} y={row - 40} width={REACH + 6} height={80} fill={BG} />
          <rect x={0} y={row - 40} width={206} height={80} fill={BG} />
          {range(50, REACH, 50).map((d) => <Label key={`rd${d}`} x={W - d} y={row} text={`${d}`} anchor="middle" rotate />)}
          {range(50, 200, 50).map((d) => <Label key={`ld${d}`} x={d} y={row} text={`${d}`} anchor="middle" rotate />)}
        </g>
      ))}
      <rect x={DEFAULT_SAFE_AREA.left} y={DEFAULT_SAFE_AREA.top} width={W - DEFAULT_SAFE_AREA.right - DEFAULT_SAFE_AREA.left} height={DEFAULT_SAFE_AREA.bottom - DEFAULT_SAFE_AREA.top}
        fill="none" stroke="#ffb000" strokeWidth={2} strokeDasharray="14 10" />
      <rect x={250} y={TITLE.top} width={580} height={TITLE.bottom - TITLE.top} fill={BG} />
      <Label x={540} y={TITLE.top + 26} text="VideoGen güvenli alan kartı" size={34} anchor="middle" />
      <Label x={540} y={TITLE.top + 64} text="satırlar: y · yan cetveller: kenardan uzaklık" size={22} anchor="middle" color="#b8c2cc" />
      <Label x={540} y={TITLE.top + 94} text="1080×1920 piksel · kesikli çizgi: varsayılan alan" size={22} anchor="middle" color="#b8c2cc" />
      {[[8, 20, 'start', '0,0'], [W - 8, 20, 'end', '1080,0'], [8, H - 20, 'start', '0,1920'], [W - 8, H - 20, 'end', '1080,1920']].map(([x, y, a, t]) => (
        <g key={String(t)}>
          <rect x={a === 'start' ? 0 : W - 120} y={(y as number) - 16} width={120} height={32} fill={BG} />
          <Label x={x as number} y={y as number} text={String(t)} size={22} anchor={a as 'start' | 'end'} color="#ffb000" />
        </g>
      ))}
    </svg>
  </AbsoluteFill>
);
