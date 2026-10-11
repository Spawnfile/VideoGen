import type React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import anchorData from "./anchors.json";
import { fonts, palette } from "./theme";

export type AnchorKey = keyof typeof anchorData.anchors;

type Props = {
  readonly anchor: AnchorKey;
  readonly children: React.ReactNode;
  readonly sub?: string;
  /** Kutunun çapaya göre ötelemesi (px). Çizgi önce 45° çapraz, sonra yatay gider. */
  readonly dx: number;
  readonly dy: number;
  readonly from: number;
  readonly until: number;
  readonly index: string;
  /** Başlık yazı boyutu (px); alt yazı orantılı küçülür. */
  readonly size?: number;
  /** Panel çapalarında dikey öteleme (alt panel: 960). */
  readonly oy?: number;
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);

/** Klavye etiketlerinin kardeşi (saat: panel çapaları için oy): beyaz çizgi + nokta + mavi halka, yuvarlak kutu; farkı dirsekli çizgi ve sarı numara. */
export const HudLabel: React.FC<Props> = ({
  anchor,
  children,
  sub,
  dx,
  dy,
  from,
  until,
  index,
  size = 42,
  oy = 0,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > until) return null;
  const track = anchorData.anchors[anchor];
  const [ax, ay0] = track[Math.min(frame, track.length - 1)];
  if (ax < -500) return null;
  const ay = ay0 + oy;
  const tx = ax + dx;
  const ty = ay + dy;
  const sign = dx >= 0 ? 1 : -1;
  const diag = Math.min(Math.abs(dy), Math.abs(dx));
  const ex = ax + sign * diag;
  const total = Math.hypot(ex - ax, ty - ay) + Math.abs(tx - ex);
  const draw = interpolate(frame, [from, from + 10], [0, total], {
    ...clamp,
    easing: out,
  });
  const fade = interpolate(frame, [until - 10, until], [1, 0], clamp);
  const right = dx >= 0;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: fade }}>
      <svg
        width={1080}
        height={1920}
        style={{ position: "absolute", inset: 0 }}
      >
        <polyline
          points={`${ax},${ay} ${ex},${ty} ${tx},${ty}`}
          fill="none"
          stroke="white"
          strokeOpacity={0.85}
          strokeWidth={3}
          strokeDasharray={`${draw} ${total}`}
        />
        <circle
          cx={ax}
          cy={ay}
          r={interpolate(frame, [from, from + 6], [0, 9], clamp)}
          fill="white"
        />
        <circle
          cx={ax}
          cy={ay}
          r={interpolate(frame, [from, from + 12], [0, 18], clamp)}
          fill="none"
          stroke={palette.accent}
          strokeWidth={3}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: tx,
          top: ty,
          translate: right ? "0 -50%" : "-100% -50%",
          transformOrigin: right ? "left center" : "right center",
          scale: interpolate(frame, [from + 6, from + 18], [0.6, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 12 }),
          }),
          opacity: interpolate(frame, [from + 6, from + 12], [0, 1], clamp),
          padding: "12px 24px",
          borderRadius: 18,
          background: palette.panel,
          border: `3px solid ${palette.accent}`,
          boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
          color: "white",
          whiteSpace: "nowrap",
          textAlign: right ? "left" : "right",
          fontFamily: fonts.body,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: size, lineHeight: 1.1 }}>
          <span
            style={{
              display: "inline-block",
              minWidth: 38,
              marginRight: 12,
              padding: "2px 8px",
              borderRadius: 10,
              background: palette.highlight,
              color: "#1a1400",
              fontSize: 24,
              fontWeight: 700,
              textAlign: "center",
              verticalAlign: 8,
            }}
          >
            {index}
          </span>
          {children}
        </div>
        {sub ? (
          <div
            style={{
              fontSize: Math.round(size * 0.69),
              fontWeight: 600,
              color: palette.muted,
              marginTop: 4,
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
};
