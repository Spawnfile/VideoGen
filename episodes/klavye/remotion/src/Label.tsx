import type React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import anchorData from "./anchors.json";
import { fonts, palette } from "./theme";

export type AnchorKey = keyof typeof anchorData.anchors;

type Props = {
  readonly anchor: AnchorKey;
  readonly children: React.ReactNode;
  readonly sub?: string;
  /** Etiketin çapaya göre ötelemesi (px). */
  readonly dx: number;
  readonly dy: number;
  /** Etiket kutusu ötelenen noktanın solunda mı sağında mı duracak. */
  readonly side: "left" | "right";
  readonly from: number;
  readonly until: number;
  readonly size?: number;
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Blender'dan gelen 3D çapa noktasını takip eden, çizgili parça etiketi. */
export const Label: React.FC<Props> = ({ anchor, children, sub, dx, dy, side, from, until, size = 46 }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > until) return null;

  const track = anchorData.anchors[anchor];
  const [ax, ay] = track[Math.min(frame, track.length - 1)];
  const tx = ax + dx;
  const ty = ay + dy;

  const draw = interpolate(frame, [from, from + 10], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const fadeOut = interpolate(frame, [until - 10, until], [1, 0], clamp);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: fadeOut }}>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <line
          x1={ax}
          y1={ay}
          x2={ax + (tx - ax) * draw}
          y2={ay + (ty - ay) * draw}
          stroke="white"
          strokeOpacity={0.85}
          strokeWidth={3}
        />
        <circle cx={ax} cy={ay} r={interpolate(frame, [from, from + 6], [0, 9], clamp)} fill="white" />
        <circle cx={ax} cy={ay} r={interpolate(frame, [from, from + 12], [0, 18], clamp)} fill="none" stroke={palette.accent} strokeWidth={3} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: tx,
          top: ty,
          translate: side === "right" ? "0 -50%" : "-100% -50%",
          scale: interpolate(frame, [from + 6, from + 18], [0.6, 1], { ...clamp, easing: Easing.spring({ damping: 12 }) }),
          opacity: interpolate(frame, [from + 6, from + 12], [0, 1], clamp),
          transformOrigin: side === "right" ? "left center" : "right center",
          padding: "12px 24px",
          borderRadius: 18,
          background: "rgba(10, 16, 34, 0.82)",
          border: `3px solid ${palette.accent}`,
          color: "white",
          fontFamily: fonts.body,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.1,
          whiteSpace: "nowrap",
          textAlign: side === "right" ? "left" : "right",
          boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
        }}
      >
        {children}
        {sub ? (
          <div style={{ fontSize: Math.round(size * 0.68), fontWeight: 600, color: palette.muted, marginTop: 4 }}>{sub}</div>
        ) : null}
      </div>
    </div>
  );
};
