import { Audio } from "@remotion/media";
import type React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import anchorData from "./anchors.json";
import { HudLabel } from "./HudLabel";
import { fonts, palette } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const pop = Easing.bezier(0.16, 1, 0.3, 1);
const sfx = (f: string) => staticFile(`sfx/${f}`);
const A = anchorData.anchors;
type K = keyof typeof A;
const at = (k: K, f: number) => A[k][Math.max(0, Math.min(f, A[k].length - 1))];
const TL = anchorData.timeline;
const TICKS_TOP = anchorData.ticksTop;
const TICKS_BOT = anchorData.ticksBot;
const ROTOR = anchorData.rotorDir;
const RATCHET = anchorData.ratchetDir;

// Zaman çizelgesi (Remotion karesi; Blender'daki T ile aynı — anchors.json'dan okunur)
const DIVE = TL.DIVE;
const SPLIT = TL.SPLIT;
const R1 = TL.R1;
const SLOW_END = TL.SLOW_END;
const REAL = TL.REAL;
const R2 = TL.R2;
const SCORE = TL.SCORE;
const SWAP = TL.SWAP;
const MERGE = TL.MERGE;
const CTA = 914;
const END = 989;
const FULL_A = 112;
const FULL_B = 884;
const PH = 960;

const pad4 = (n: number) => String(n).padStart(4, "0");

/** Lacivert stüdyo; bu bölümde kadran halkası deseni (eşmerkezli çember + dakika çentikleri). */
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    const r0 = i % 5 === 0 ? 452 : 470;
    return (
      <line
        key={i}
        x1={540 + Math.sin(a) * r0}
        y1={960 - Math.cos(a) * r0}
        x2={540 + Math.sin(a) * 486}
        y2={960 - Math.cos(a) * 486}
        stroke="rgba(255,255,255,0.13)"
        strokeWidth={i % 5 === 0 ? 4 : 2}
      />
    );
  });
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 50%, ${palette.bgInner} 0%, ${palette.bgMid} 55%, ${palette.bgOuter} 100%)`,
      }}
    >
      <svg
        width={1080}
        height={1920}
        style={{
          position: "absolute",
          inset: 0,
          maskImage:
            "radial-gradient(circle at 50% 50%, black 30%, transparent 80%)",
        }}
      >
        {[300, 560, 760].map((r) => (
          <circle
            key={r}
            cx={540}
            cy={960}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={2}
          />
        ))}
        <g
          style={{
            transformOrigin: "540px 960px",
            // 8 adım = 6° (bir çentik) → son karede desen ilk kareyle aynı
            rotate: `${Math.floor(((frame + 1) * 264) / 990) * 0.75}deg`,
          }}
        >
          {ticks}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

/** Tam ekran saat (kanca, dalış, geri uçuş). Dalışta zoom-punch + bulanıklık. */
const FullLayer: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > FULL_A && frame < FULL_B) return null;
  const inDive = frame <= FULL_A;
  const scale = inDive
    ? interpolate(frame, [DIVE[1] - 8, DIVE[1], FULL_A], [1, 1.25, 1.7], {
        ...clamp,
        easing: Easing.in(Easing.quad),
      })
    : interpolate(frame, [FULL_B, MERGE[1]], [1.6, 1], {
        ...clamp,
        easing: pop,
      });
  const blur = inDive
    ? interpolate(frame, [DIVE[1] - 6, FULL_A], [0, 16], clamp)
    : interpolate(frame, [FULL_B, MERGE[1] - 4], [14, 0], clamp);
  const opacity = inDive
    ? interpolate(frame, [DIVE[1] + 2, FULL_A], [1, 0], clamp)
    : interpolate(frame, [FULL_B, FULL_B + 10], [0, 1], clamp);
  return (
    <Img
      src={staticFile(`frames/full/${pad4(frame + 1)}.png`)}
      style={{
        position: "absolute",
        width: 1080,
        height: 1920,
        scale,
        opacity,
        filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
      }}
    />
  );
};

/** Raunda göre panel parlaklığı: etkin panel tam, diğeri söner (metin alanı olur). */
const dimOf = (frame: number, top: boolean) => {
  const pts = [R1[0], R1[0] + 10, R2[0] - 6, R2[0] + 6, SCORE[0], SCORE[0] + 10, SWAP - 4, SWAP + 4];
  const topV = [1, 1, 1, 0, 0, 0.45, 0.45, 1];
  const botV = [1, 0, 0, 1, 1, 0.45, 0.45, 1];
  return interpolate(frame, pts, top ? topV : botV, clamp);
};

const Panel: React.FC<{ readonly which: "top" | "bot" }> = ({ which }) => {
  const frame = useCurrentFrame();
  if (frame < SPLIT[0] || frame > MERGE[1]) return null;
  const top = which === "top";
  const dir = top ? -1 : 1;
  const slideIn = interpolate(frame, [SPLIT[0], SPLIT[1]], [dir * 1080, 0], {
    ...clamp,
    easing: pop,
  });
  const slideOut = interpolate(frame, [MERGE[0], MERGE[1]], [0, dir * 1080], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  const d = dimOf(frame, top);
  const swapFlash =
    !top && frame >= SWAP && frame < SWAP + 8
      ? interpolate(frame, [SWAP, SWAP + 8], [0.6, 0], clamp)
      : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: top ? 0 : PH,
        width: 1080,
        height: PH,
        overflow: "hidden",
        translate: `${slideIn + slideOut}px 0px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: top
            ? "linear-gradient(180deg, rgba(255,77,94,0.0) 0%, rgba(255,77,94,0.07) 100%)"
            : "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.0) 100%)",
        }}
      />
      <Img
        src={staticFile(`frames/${which}/${pad4(frame + 1)}.png`)}
        style={{
          position: "absolute",
          width: 1080,
          height: PH,
          filter: `brightness(${0.32 + 0.68 * d}) saturate(${0.4 + 0.6 * d}) blur(${(1 - d) * 2.5}px)`,
        }}
      />
      {swapFlash > 0 ? (
        <AbsoluteFill style={{ background: palette.highlight, opacity: swapFlash * 0.5 }} />
      ) : null}
    </div>
  );
};

/** Orta çizgi + VS rozeti + ülke çipleri. */
const Divider: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < SPLIT[0] + 4 || frame > MERGE[1]) return null;
  const o = interpolate(
    frame,
    [SPLIT[0] + 4, SPLIT[1], MERGE[0], MERGE[0] + 10],
    [0, 1, 1, 0],
    clamp,
  ) * interpolate(frame, [SCORE[0], SCORE[0] + 8, SCORE[1], SCORE[1] + 8], [1, 0, 0, 1], clamp);
  const s = interpolate(frame, [SPLIT[1] - 6, SPLIT[1] + 6], [0.3, 1], {
    ...clamp,
    easing: Easing.spring({ damping: 9 }),
  });
  const chip = (
    label: React.ReactNode,
    style: React.CSSProperties,
    active: number,
  ) => (
    <div
      style={{
        position: "absolute",
        padding: "8px 22px",
        borderRadius: 14,
        background: palette.panel,
        border: `3px solid ${active > 0.5 ? palette.highlight : "rgba(255,255,255,0.25)"}`,
        color: "white",
        fontFamily: fonts.display,
        fontWeight: 900,
        fontSize: 36,
        letterSpacing: 2,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </div>
  );
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: PH - 3,
          height: 6,
          background: `linear-gradient(90deg, rgba(255,210,63,0) 0%, ${palette.highlight} 30%, ${palette.highlight} 70%, rgba(255,210,63,0) 100%)`,
          boxShadow: "0 0 24px rgba(255,210,63,0.5)",
        }}
      />
      {chip("🇨🇭 İSVİÇRE", { left: 60, top: PH - 74 }, dimOf(frame, true))}
      {chip("JAPON 🇯🇵", { right: 160, top: PH + 18 }, dimOf(frame, false))}
      <div
        style={{
          position: "absolute",
          left: 540 - 66,
          top: PH - 66,
          width: 132,
          height: 132,
          borderRadius: 66,
          background: palette.highlight,
          color: "#1a1400",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 62,
          scale: s,
          rotate: "-6deg",
          boxShadow: "0 0 40px rgba(255,210,63,0.45), 0 10px 30px rgba(0,0,0,0.6)",
        }}
      >
        VS
      </div>
    </div>
  );
};

const Hl: React.FC<{
  readonly children: React.ReactNode;
  readonly color?: string;
}> = ({ children, color }) => (
  <span style={{ color: color ?? palette.highlight }}>{children}</span>
);

type CaptionProps = {
  readonly from: number;
  readonly until: number;
  readonly top: number;
  readonly children: React.ReactNode;
  readonly size?: number;
};

/** Seri açıklama kutusu: ortalı koyu cam, aşağıdan kayarak gelir. */
const Caption: React.FC<CaptionProps> = ({
  from,
  until,
  top,
  children,
  size = 46,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > until) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 150,
        top,
        textAlign: "center",
        color: "white",
        fontFamily: fonts.body,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.25,
        textShadow: "0 4px 18px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)",
        opacity: interpolate(frame, [from, from + 8, until - 8, until], [0, 1, 1, 0], clamp),
        translate: interpolate(frame, [from, from + 12], ["0px 30px", "0px 0px"], {
          ...clamp,
          easing: pop,
        }),
        scale: interpolate(frame, [from, from + 12], [0.92, 1], {
          ...clamp,
          easing: pop,
        }),
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "20px 32px",
          borderRadius: 26,
          background: "rgba(7, 10, 20, 0.74)",
          border: "2px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(6px)",
        }}
      >
        {children}
      </div>
    </div>
  );
};

const Sub: React.FC<{
  readonly children: React.ReactNode;
  readonly show?: number;
}> = ({ children, show = 1 }) => (
  <div
    style={{
      fontSize: 32,
      fontWeight: 600,
      color: palette.muted,
      marginTop: 6,
      opacity: show,
    }}
  >
    {children}
  </div>
);

const TopShade: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, DIVE[0], DIVE[0] + 14, 968, END], [1, 1, 0, 0, 1], clamp);
  if (o <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        opacity: o,
        background:
          "linear-gradient(180deg, rgba(7,10,20,0.92) 0%, rgba(7,10,20,0.7) 26%, rgba(7,10,20,0) 40%)",
      }}
    />
  );
};

/** Kanca: yumuşak merak cümlesi + 🇨🇭 VS 🇯🇵 şeridi. */
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > DIVE[0] + 14) return null;
  const line = (t0: number, children: React.ReactNode, style: React.CSSProperties) => {
    const t = frame - t0;
    if (t < 0) return null;
    return (
      <div
        style={{
          ...style,
          opacity: interpolate(t, [0, 3], [0, 1], clamp),
          translate: interpolate(t, [0, 7], ["0px -18px", "0px 0px"], { ...clamp, easing: pop }),
          scale: interpolate(t, [0, 6], [1.25, 1], { ...clamp, easing: pop }),
        }}
      >
        {children}
      </div>
    );
  };
  const body: React.CSSProperties = { fontFamily: fonts.body, fontSize: 56, fontWeight: 700 };
  const vs = frame - 26;
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        top: 170,
        textAlign: "center",
        color: "white",
        textShadow: "0 6px 26px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)",
        opacity: interpolate(frame, [DIVE[0], DIVE[0] + 12], [1, 0], clamp),
        scale: interpolate(frame, [DIVE[0], DIVE[0] + 14], [1, 1.2], clamp),
        filter: `blur(${interpolate(frame, [DIVE[0], DIVE[0] + 14], [0, 10], clamp)}px)`,
      }}
    >
      {line(1, "Herkes İsviçre ve Japon", body)}
      {line(6, "saatinin kalbi", body)}
      {line(
        11,
        <Hl>BAMBAŞKA</Hl>,
        {
          fontFamily: fonts.display,
          fontSize: 118,
          fontWeight: 900,
          lineHeight: 1.0,
          letterSpacing: -2,
        },
      )}
      {line(17, "sanır… 🤫", body)}
      {vs >= 0 ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              padding: "12px 30px",
              borderRadius: 999,
              background: palette.panel,
              border: `3px solid ${palette.highlight}`,
              fontFamily: fonts.display,
              fontWeight: 900,
              fontSize: 44,
              letterSpacing: 1,
              textShadow: "none",
              scale: interpolate(vs, [0, 10], [0.4, 1], {
                ...clamp,
                easing: Easing.spring({ damping: 10 }),
              }),
              opacity: interpolate(vs, [0, 2], [0, 1], clamp),
            }}
          >
            <span>🇨🇭 İSVİÇRE</span>
            <span
              style={{
                padding: "2px 16px",
                borderRadius: 12,
                background: palette.highlight,
                color: "#1a1400",
              }}
            >
              VS
            </span>
            <span>JAPON 🇯🇵</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

/** Retention: "🔒 Sonda: ortak sır" — kancada belirir, sol üste yapışır, twist'te açılır. */
const LockBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const t0 = 40;
  if (frame < t0 || frame > SWAP + 16) return null;
  const docked = interpolate(frame, [DIVE[0], DIVE[0] + 12], [0, 1], { ...clamp, easing: pop });
  const open = frame >= SWAP;
  return (
    <div
      style={{
        position: "absolute",
        left: interpolate(docked, [0, 1], [540, 40]),
        top: interpolate(docked, [0, 1], [1450, 150]),
        translate: `${interpolate(docked, [0, 1], [-50, 0])}% 0`,
        scale:
          interpolate(frame - t0, [0, 8], [1.4, 1], { ...clamp, easing: Easing.spring({ damping: 11 }) }) *
          interpolate(docked, [0, 1], [1, 0.62]) *
          interpolate(frame - SWAP, [0, 3, 8], [1, 1.35, 1.2], clamp),
        transformOrigin: "left top",
        padding: "10px 22px",
        borderRadius: 16,
        border: `3px solid ${open ? palette.ok : palette.highlight}`,
        background: palette.panel,
        color: "white",
        fontFamily: fonts.body,
        fontWeight: 700,
        fontSize: 38,
        whiteSpace: "nowrap",
        opacity: interpolate(frame, [SWAP + 10, SWAP + 16], [1, 0], clamp),
      }}
    >
      {open ? "🔓" : "🔒"} Sonda: <Hl>ortak sır</Hl>
    </div>
  );
};

/** Raunt başlığı (sağ üst). */
const RoundHeader: React.FC<{
  readonly from: number;
  readonly until: number;
  readonly n: string;
  readonly title: string;
}> = ({ from, until, n, title }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > until) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 150,
        top: 146,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "8px 22px 8px 10px",
        borderRadius: 16,
        background: palette.panel,
        border: `3px solid ${palette.accent}`,
        color: "white",
        fontFamily: fonts.display,
        fontWeight: 900,
        fontSize: 34,
        whiteSpace: "nowrap",
        opacity: interpolate(frame, [from, from + 6, until - 8, until], [0, 1, 1, 0], clamp),
        scale: interpolate(frame, [from, from + 10], [1.3, 1], { ...clamp, easing: pop }),
        transformOrigin: "right center",
      }}
    >
      <span
        style={{
          padding: "2px 12px",
          borderRadius: 10,
          background: palette.highlight,
          color: "#1a1400",
          fontSize: 26,
        }}
      >
        {n}
      </span>
      {title}
    </div>
  );
};

/** Yavaş çekimde her tikte çatalın yanında "tik"/"tak" + halka. */
const TickPops: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < R1[0] || frame > SLOW_END + 10) return null;
  const recent = TICKS_TOP.map((t, i) => [t, i] as const).filter(
    ([t]) => t <= frame && frame - t < 16 && t >= R1[0],
  );
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
      {recent.map(([t, i]) => {
        const u = (frame - t) / 16;
        const [x, y] = at("pallet", Math.round(t));
        return (
          <g key={i} opacity={1 - u}>
            <circle cx={x} cy={y} r={20 + u * 70} fill="none" stroke={palette.highlight} strokeWidth={4} />
            <text
              x={x - 150}
              y={y + 10 - u * 40}
              fill={palette.highlight}
              fontFamily={fonts.display}
              fontWeight={900}
              fontStyle="italic"
              fontSize={54}
              textAnchor="middle"
              style={{ textShadow: "0 4px 14px rgba(0,0,0,0.9)" }}
            >
              {i % 2 ? "tak" : "tik"}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const SlowMo: React.FC = () => {
  const frame = useCurrentFrame();
  const from = R1[0] + 4;
  const until = REAL + 6;
  if (frame < from || frame > until) return null;
  const real = frame >= SLOW_END + 8;
  return (
    <div
      style={{
        position: "absolute",
        right: 150,
        top: 226,
        padding: "6px 16px",
        borderRadius: 12,
        background: palette.panel,
        border: `2px solid ${real ? palette.highlight : palette.muted}`,
        color: real ? palette.highlight : palette.muted,
        fontFamily: fonts.body,
        fontWeight: 700,
        fontSize: 28,
        opacity: interpolate(frame, [from, from + 6, until - 6, until], [0, 1, 1, 0], clamp),
      }}
    >
      {real ? "▶▶ gerçek hız" : "⏱ yavaş çekim"}
    </div>
  );
};

/** Gerçek hızda tik sayacı: "saniyede 8 tik" + canlı sayaç. */
const TickCounter: React.FC = () => {
  const frame = useCurrentFrame();
  const from = SLOW_END + 6;
  const until = R1[1] + 2;
  if (frame < from || frame > until) return null;
  const n = TICKS_TOP.filter((t) => t >= REAL - 10 && t <= frame).length;
  const last = TICKS_TOP.filter((t) => t <= frame).pop() ?? 0;
  const beat = interpolate(frame - last, [0, 3], [1.06, 1], clamp);
  const fact = frame >= 338;
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 150,
        top: 1090,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        color: "white",
        fontFamily: fonts.body,
        fontWeight: 700,
        textShadow: "0 4px 18px rgba(0,0,0,0.9)",
        opacity: interpolate(frame, [from, from + 8, until - 6, until], [0, 1, 1, 0], clamp),
      }}
    >
      <div
        style={{
          padding: "18px 34px",
          borderRadius: 26,
          background: "rgba(7, 10, 20, 0.78)",
          border: `3px solid ${palette.highlight}`,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40 }}>
          Saniyede <Hl>8 tik</Hl> ⚡
        </div>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 92,
            color: palette.highlight,
            scale: beat,
            lineHeight: 1.1,
          }}
        >
          {String(n).padStart(3, "0")}
        </div>
        <div style={{ fontSize: 28, color: palette.muted }}>
          28.800 titreşim / saat (ETA 2824 tipi)
        </div>
        {fact ? (
          <div
            style={{
              fontSize: 42,
              marginTop: 10,
              opacity: interpolate(frame, [338, 344], [0, 1], clamp),
              scale: interpolate(frame, [338, 346], [1.2, 1], { ...clamp, easing: pop }),
            }}
          >
            Günde <Hl>691.200</Hl> tik 🤯
          </div>
        ) : null}
      </div>
    </div>
  );
};

const smoothDir = (arr: number[], f: number) => {
  let s = 0;
  for (let k = -3; k <= 3; k++) s += arr[Math.max(0, Math.min(arr.length - 1, f + k))];
  return s / 7;
};

/** Raunt 2: rotor iki yöne (beyaz yay ok), cırcır hep tek yöne (sarı ok) + "bileğini salla" POV çipi. */
const WindArrows: React.FC = () => {
  const frame = useCurrentFrame();
  const from = R2[0] + 10;
  const until = R2[1];
  if (frame < from || frame > until) return null;
  const rd = smoothDir(ROTOR, frame);
  const cd = smoothDir(RATCHET, frame);
  const o = interpolate(frame, [from, from + 8, until - 8, until], [0, 1, 1, 0], clamp);
  const arc = (cx: number, cy: number, r: number, cw: boolean, col: string, w: number) => {
    const a0 = -150;
    const a1 = -30;
    const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    const [hx, hy] = cw ? [x1, y1] : [x0, y0];
    const tang = cw ? a1 + 90 : a0 - 90;
    const tx = Math.cos((tang * Math.PI) / 180);
    const ty = Math.sin((tang * Math.PI) / 180);
    const nx = -ty;
    const ny = tx;
    return (
      <g>
        <path d={`M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" />
        <polygon
          points={`${hx + nx * 22},${hy + ny * 22} ${hx - nx * 22},${hy - ny * 22} ${hx + tx * 34},${hy + ty * 34}`}
          fill={col}
        />
      </g>
    );
  };
  const [rx, ry] = at("rotorHub", frame);
  const [cx, cy] = at("ratchet", frame);
  const moving = Math.abs(rd) > 0.4;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {moving ? arc(rx, ry + PH, 150, rd > 0, "white", 10) : null}
        {cd > 0.02 ? arc(cx, cy + PH, 95, true, palette.highlight, 9) : null}
      </svg>
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 1440,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 20px",
          borderRadius: 14,
          background: palette.panel,
          border: `2px solid ${palette.muted}`,
          color: "white",
          fontFamily: fonts.body,
          fontWeight: 700,
          fontSize: 30,
        }}
      >
        <span style={{ display: "inline-block", rotate: `${Math.max(-25, Math.min(25, rd * 7))}deg`, fontSize: 40 }}>
          🤚
        </span>
        bileğini salla
      </div>
    </div>
  );
};

/** Skor tabelası. */
const Scoreboard: React.FC = () => {
  const frame = useCurrentFrame();
  const from = SCORE[0] + 6;
  const until = SCORE[1] + 4;
  if (frame < from || frame > until) return null;
  const rows: [string, React.ReactNode, React.ReactNode, number][] = [
    ["Tik / saniye", "8", "6", from + 14],
    ["Güç rezervi", "~40 sa", "~41 sa", from + 38],
    ["Oto. kurma", "2 çark", "tek kol 🪄", from + 62],
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 150,
        top: 640,
        opacity: interpolate(frame, [from, from + 8, until - 8, until], [0, 1, 1, 0], clamp),
        scale: interpolate(frame, [from, from + 12], [0.9, 1], { ...clamp, easing: pop }),
      }}
    >
      <div
        style={{
          padding: "26px 28px",
          borderRadius: 28,
          background: "rgba(7, 10, 20, 0.96)",
          border: `3px solid ${palette.accent}`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          color: "white",
          fontFamily: fonts.body,
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontFamily: fonts.display,
            fontWeight: 900,
            fontSize: 40,
            letterSpacing: 3,
            color: palette.highlight,
            marginBottom: 14,
          }}
        >
          SKOR TABELASI
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontWeight: 700, fontSize: 30, color: palette.muted, textAlign: "center" }}>
          <div />
          <div>🇨🇭 İsviçre</div>
          <div>🇯🇵 Japon</div>
        </div>
        {rows.map(([k, a, b, t0]) => (
          <div
            key={k}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              alignItems: "center",
              gap: 6,
              marginTop: 14,
              padding: "12px 0",
              borderTop: "2px solid rgba(255,255,255,0.08)",
              textAlign: "center",
              opacity: interpolate(frame, [t0, t0 + 6], [0, 1], clamp),
              translate: interpolate(frame, [t0, t0 + 10], ["0px 20px", "0px 0px"], { ...clamp, easing: pop }),
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 700, color: palette.muted, textAlign: "left" }}>{k}</div>
            <div style={{ fontSize: 38, fontWeight: 700 }}>{a}</div>
            <div style={{ fontSize: 38, fontWeight: 700 }}>{b}</div>
          </div>
        ))}
        <div style={{ textAlign: "center", fontSize: 24, color: palette.muted, marginTop: 10 }}>
          ETA 2824 tipi · Seiko 7S26 tipi
        </div>
      </div>
    </div>
  );
};

/** Twist: iki panelde tik hızı rozetleri (her tikte nabız). */
const TwistRates: React.FC = () => {
  const frame = useCurrentFrame();
  const from = SWAP + 8;
  const until = MERGE[0] + 4;
  if (frame < from || frame > until) return null;
  const chip = (ticks: number[], label: string, topY: number) => {
    const last = ticks.filter((t) => t <= frame).pop() ?? -99;
    const b = interpolate(frame - last, [0, 3], [1.08, 1], clamp);
    return (
      <div
        style={{
          position: "absolute",
          right: 160,
          top: topY,
          padding: "8px 20px",
          borderRadius: 14,
          background: palette.panel,
          border: `3px solid ${palette.highlight}`,
          color: palette.highlight,
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 36,
          scale: b,
        }}
      >
        {label}
      </div>
    );
  };
  return (
    <div style={{ position: "absolute", inset: 0, opacity: interpolate(frame, [from, from + 8, until - 6, until], [0, 1, 1, 0], clamp) }}>
      {chip(TICKS_TOP, "8 tik / sn", 250)}
      {chip(TICKS_BOT, "6 tik / sn", 1400)}
    </div>
  );
};

const Flash: React.FC<{
  readonly at: number;
  readonly strength?: number;
  readonly color?: string;
}> = ({ at: t0, strength = 0.3, color = "white" }) => {
  const frame = useCurrentFrame();
  const t = frame - t0;
  if (t < 0 || t > 8) return null;
  return <AbsoluteFill style={{ background: color, opacity: interpolate(t, [0, 8], [strength, 0], clamp) }} />;
};

export const SaatIcinde: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: palette.bgOuter }}>
      <Background />
      <FullLayer />
      <Panel which="top" />
      <Panel which="bot" />
      <Divider />
      <TopShade />
      <Hook />
      <LockBadge />
      <Flash at={DIVE[1]} strength={0.35} />

      {/* raunt 1: kalp — İsviçre eşapmanı */}
      <RoundHeader from={R1[0] + 2} until={R2[0]} n="RAUNT 1" title="KALP ❤️ tik-tak" />
      <SlowMo />
      <HudLabel anchor="balanceT" index="1" dx={120} dy={-110} size={38} from={132} until={210} sub="ileri-geri salınır">
        Balans çarkı
      </HudLabel>
      <HudLabel anchor="spring" index="2" dx={280} dy={40} size={38} from={160} until={238} sub="onu geri çeker">
        Spiral yay
      </HudLabel>
      <HudLabel anchor="fork" index="3" dx={230} dy={-190} size={38} from={212} until={272} sub="pallet fork">
        Çatal
      </HudLabel>
      <HudLabel anchor="escwheel" index="4" dx={330} dy={-60} size={38} from={270} until={326} sub="diş diş ilerler">
        Eşapman çarkı
      </HudLabel>
      <TickPops />
      <Caption from={140} until={214} top={1120} size={44}>
        Balans çarkı salınır ↔
        <Sub>spiral yay onu hep geri çeker</Sub>
      </Caption>
      <Caption from={218} until={292} top={1120} size={44}>
        Her salınımda çatal, çarktan
        <br />
        <Hl>bir diş</Hl> bırakır → <Hl>tik!</Hl>
      </Caption>
      <TickCounter />

      {/* raunt 2: motor — Magic Lever */}
      <RoundHeader from={R2[0] + 2} until={SCORE[0]} n="RAUNT 2" title="MOTOR 🔋 oto. kurma" />
      <HudLabel anchor="rotorHub" oy={PH} index="5" dx={-120} dy={120} from={394} until={470} sub="bilekle sallanan ağırlık">
        Rotor
      </HudLabel>
      <HudLabel anchor="lever" oy={PH} index="6" dx={120} dy={130} from={436} until={500} sub="tek parça Y kol · 1959">
        Magic Lever
      </HudLabel>
      <HudLabel anchor="ratchet" oy={PH} index="7" dx={180} dy={150} from={504} until={580} sub="hep tek yöne döner">
        Cırcır çarkı
      </HudLabel>
      <WindArrows />
      <Caption from={400} until={482} top={420} size={44}>
        Bileğini salladıkça
        <br />
        rotor <Hl>iki yöne</Hl> döner ↔
      </Caption>
      <Caption from={486} until={562} top={420} size={44}>
        Magic Lever ikisini de
        <br />
        <Hl>tek yöne</Hl> çevirir ↻
        <Sub>Seiko, 1959</Sub>
      </Caption>
      <Caption from={566} until={628} top={420} size={46}>
        → <Hl>ana yay</Hl> kurulur 🔋
        <Sub>dolu yay ≈ 41 saat çalışır</Sub>
      </Caption>

      {/* raunt 3: skor */}
      <RoundHeader from={SCORE[0] + 2} until={SCORE[1]} n="RAUNT 3" title="SKOR 📊" />
      <Scoreboard />

      {/* twist */}
      <Caption from={SCORE[1] + 2} until={SWAP} top={600} size={50}>
        Peki Japon saatinin
        <br />
        <Hl>kalbi</Hl> ne? 🔒
      </Caption>
      <Flash at={SWAP} strength={0.25} color={palette.ok} />
      <Caption from={SWAP + 6} until={848} top={560} size={50}>
        İkisinin kalbi <Hl>AYNI</Hl> 😉
        <Sub>çatallı eşapman · bugün çoğu mekanik saatte</Sub>
      </Caption>
      <Caption from={850} until={MERGE[0] + 2} top={560} size={46}>
        Ve onu bir <Hl>İngiliz</Hl> icat etti 🇬🇧
        <Sub>Thomas Mudge, 1750'ler</Sub>
      </Caption>
      <TwistRates />
      <HudLabel anchor="balance2" oy={PH} index="✓" dx={-40} dy={150} from={SWAP + 14} until={846} sub="aynı balans + çatal">
        Japon kalbi
      </HudLabel>

      {/* final + CTA */}
      <Flash at={MERGE[1]} strength={0.18} />
      <Caption from={CTA} until={984} top={210} size={62}>
        Sen hangisini
        <br />
        <Hl>seçerdin?</Hl>
        <div style={{ fontSize: 40, marginTop: 14, color: palette.muted }}>🇨🇭 mi 🇯🇵 mu? Yorumlara yaz 👇</div>
      </Caption>

      {/* ses: hepsi kendi sentezimiz; sabit perdeli sinüs (riser/whoosh/tiz darbe yok) */}
      <Audio src={sfx("music.wav")} volume={0.85} />
      <Audio src={sfx("ticks.wav")} volume={0.5} />
      <Audio src={sfx("thrum.wav")} volume={0.2} />
      {[DIVE[1], SWAP, MERGE[1]].map((f) => (
        <Audio key={`t${f}`} src={sfx("thump.wav")} from={f} premountFor={30} volume={0.26} />
      ))}
      <Audio src={sfx("unlock.wav")} from={SWAP + 2} premountFor={30} volume={0.32} />
      {[132, 160, 212, 270, 394, 436, 504, SWAP + 14].map((f) => (
        <Audio key={`l${f}`} src={sfx("pop.wav")} from={f + 6} premountFor={30} volume={0.26} />
      ))}
      {[SCORE[0] + 20, SCORE[0] + 44, SCORE[0] + 68].map((f) => (
        <Audio key={`s${f}`} src={sfx("pop.wav")} from={f} premountFor={30} volume={0.26} />
      ))}
    </AbsoluteFill>
  );
};
