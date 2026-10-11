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
const at = (k: keyof typeof A, f: number) =>
  A[k][Math.max(0, Math.min(f, A[k].length - 1))];
const MOVER = anchorData.mover;

// Zaman çizelgesi (Remotion karesi = Blender karesi - 1). 90 BPM → 1 vuruş = 20 kare.
const STAMP = 50;
const HOOK_OUT = 80;
const SCAN = [83, 145] as const;
const CUT = [382, 398] as const;
const SPLIT = 398;
const OSC = [485, 615] as const;
const UNLOCK = 655;
const MOTOR = 703;
const CONTACT = 735;
const REWIND = [765, 817] as const;
const CTA = 822;

/** Blender'ın şeffaf PNG dizisi; damgada zoom-punch, geri sarmada hafif bulanık titreme. */
const Render3D: React.FC = () => {
  const frame = useCurrentFrame();
  const punch = interpolate(
    frame,
    [STAMP - 1, STAMP, STAMP + 10],
    [1, 1.06, 1],
    { ...clamp, easing: pop },
  );
  const rw = frame >= REWIND[0] && frame <= REWIND[1] ? 1 : 0;
  const blur =
    rw *
    interpolate(
      frame,
      [REWIND[0], REWIND[0] + 8, REWIND[1] - 8, REWIND[1]],
      [0, 2.5, 2.5, 0],
      clamp,
    );
  return (
    <Img
      src={staticFile(`frames/${String(frame + 1).padStart(4, "0")}.png`)}
      style={{
        position: "absolute",
        width: 1080,
        height: 1920,
        scale: punch,
        translate: rw ? `${Math.sin(frame * 2.1) * 3}px 0px` : undefined,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
      }}
    />
  );
};

/** Lacivert stüdyo; bu bölümde artı (+) işaretli ızgara. */
const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 50% 46%, ${palette.bgInner} 0%, ${palette.bgMid} 55%, ${palette.bgOuter} 100%)`,
    }}
  >
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.09), rgba(255,255,255,0.09)), linear-gradient(rgba(255,255,255,0.09), rgba(255,255,255,0.09))",
        backgroundSize: "2px 16px, 16px 2px",
        backgroundPosition: "37px 30px, 30px 37px",
        backgroundRepeat: "no-repeat",
        maskImage:
          "radial-gradient(circle at 50% 46%, black 20%, transparent 75%)",
      }}
    />
    <svg
      width={1080}
      height={1920}
      style={{
        position: "absolute",
        inset: 0,
        maskImage:
          "radial-gradient(circle at 50% 46%, black 20%, transparent 75%)",
      }}
    >
      <defs>
        <pattern id="plus" width={72} height={72} patternUnits="userSpaceOnUse">
          <path
            d="M36 29 V43 M29 36 H43"
            stroke="rgba(255,255,255,0.11)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </pattern>
      </defs>
      <rect width={1080} height={1920} fill="url(#plus)" />
    </svg>
  </AbsoluteFill>
);

/** Vuruş anlarında kısa sarsıntı (yalnız 3D katmanı). */
const useShake = () => {
  const frame = useCurrentFrame();
  let x = 0;
  let y = 0;
  for (const [t0, amp] of [
    [STAMP, 18],
    [CONTACT, 9],
    [REWIND[1] + 1, 10],
  ] as const) {
    const t = frame - t0;
    if (t >= 0 && t < 12) {
      const k = amp * Math.exp(-t / 3);
      x += Math.sin(t * 2.7) * k;
      y += Math.cos(t * 3.3) * k;
    }
  }
  return `${x}px ${y}px`;
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
        left: 70,
        right: 150,
        top,
        textAlign: "center",
        color: "white",
        fontFamily: fonts.body,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.25,
        textShadow: "0 4px 18px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)",
        opacity: interpolate(
          frame,
          [from, from + 8, until - 8, until],
          [0, 1, 1, 0],
          clamp,
        ),
        translate: interpolate(
          frame,
          [from, from + 12],
          ["0px 30px", "0px 0px"],
          { ...clamp, easing: pop },
        ),
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
          background: "rgba(7, 10, 20, 0.72)",
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

/** Kanca: titreşim halkaları — iki tutamaktan yayılan yaylar + "vrrrr". */
const BuzzRings: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > 47) return null;
  const fade = interpolate(frame, [0, 4, 44, 47], [0, 1, 1, 0], clamp);
  return (
    <svg
      width={1080}
      height={1920}
      style={{
        position: "absolute",
        inset: 0,
        opacity: fade,
        mixBlendMode: "screen",
      }}
    >
      {(["gripL", "gripR"] as const).map((k) => {
        const [x, y] = at(k, frame);
        return Array.from({ length: 3 }, (_, i) => {
          const u = ((frame + i * 6) % 18) / 18;
          const r = 60 + u * 220;
          return (
            <ellipse
              key={`${k}${i}`}
              cx={x}
              cy={y}
              rx={r}
              ry={r * 0.7}
              fill="none"
              stroke={i === 0 ? "white" : palette.elec}
              strokeWidth={5 - u * 3}
              opacity={(1 - u) * 0.8}
            />
          );
        });
      })}
      <text
        x={at("gripR", frame)[0] - 230 + Math.sin(frame * 3) * 6}
        y={at("gripR", frame)[1] - 210 + Math.cos(frame * 2.6) * 5}
        fill="white"
        fontFamily={fonts.display}
        fontWeight={900}
        fontStyle="italic"
        fontSize={64}
        opacity={0.9}
        style={{ textShadow: "0 0 18px rgba(143,214,255,0.9)" }}
      >
        vrrrr
      </text>
    </svg>
  );
};

/** Kanca: yaygın inanış → yumuşak "Aslında yok 😉" rozeti. Çıkışta büyüyüp bulanıklaşır. */
const MythHook: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > HOOK_OUT + 14) return null;
  const line = (
    t0: number,
    children: React.ReactNode,
    style: React.CSSProperties,
  ) => {
    const t = frame - t0;
    if (t < 0) return null;
    return (
      <div
        style={{
          ...style,
          opacity: interpolate(t, [0, 3], [0, 1], clamp),
          translate: interpolate(t, [0, 7], ["0px -18px", "0px 0px"], {
            ...clamp,
            easing: pop,
          }),
          scale: interpolate(t, [0, 6], [1.25, 1], { ...clamp, easing: pop }),
        }}
      >
        {children}
      </div>
    );
  };
  const st = frame - STAMP;
  const strike = interpolate(st, [0, 6], [0, 100], { ...clamp, easing: pop });
  const dim = st >= 0 ? 0.55 : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        top: 175,
        textAlign: "center",
        color: "white",
        textShadow: "0 6px 26px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)",
        opacity: interpolate(frame, [HOOK_OUT, HOOK_OUT + 12], [1, 0], clamp),
        scale: interpolate(frame, [HOOK_OUT, HOOK_OUT + 14], [1, 1.2], clamp),
        filter: `blur(${interpolate(frame, [HOOK_OUT, HOOK_OUT + 14], [0, 10], clamp)}px)`,
      }}
    >
      <div style={{ opacity: dim }}>
        {line(0, "Herkes bu kolun içinde", {
          fontFamily: fonts.body,
          fontSize: 58,
          fontWeight: 700,
        })}
        {line(7, "dönen bir", {
          fontFamily: fonts.body,
          fontSize: 58,
          fontWeight: 700,
        })}
        {line(
          13,
          <span style={{ position: "relative", display: "inline-block" }}>
            <Hl>MOTOR</Hl>
            {st >= 0 ? (
              <span
                style={{
                  position: "absolute",
                  left: -10,
                  top: "52%",
                  height: 12,
                  width: `calc(${strike}% + 20px)`,
                  background: "rgba(255,255,255,0.92)",
                  borderRadius: 6,
                  boxShadow: "0 0 14px rgba(255,255,255,0.6)",
                }}
              />
            ) : null}
          </span>,
          {
            fontFamily: fonts.display,
            fontSize: 132,
            fontWeight: 900,
            lineHeight: 1.0,
            letterSpacing: -2,
          },
        )}
        {line(20, "var sanır… 🤫", {
          fontFamily: fonts.body,
          fontSize: 58,
          fontWeight: 700,
        })}
      </div>
      {st >= 0 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 390,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              padding: "14px 44px",
              borderRadius: 999,
              color: "#1a1400",
              background: palette.highlight,
              fontFamily: fonts.display,
              fontWeight: 900,
              fontSize: 92,
              letterSpacing: 0,
              textShadow: "none",
              boxShadow:
                "0 0 40px rgba(255,210,63,0.35), 0 12px 40px rgba(0,0,0,0.6)",
              rotate: "-4deg",
              scale: interpolate(st, [0, 10], [0.4, 1], {
                ...clamp,
                easing: Easing.spring({ damping: 9 }),
              }),
              opacity: interpolate(st, [0, 2], [0, 1], clamp),
            }}
          >
            Aslında yok 😉
          </div>
        </div>
      ) : null}
    </div>
  );
};

/** Retention: "🔒 Sonda: tetiğin sırrı" — kancada belirir, köşeye yapışır, tetik sahnesinde açılır. */
const LockBadge: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 60 || frame > UNLOCK + 14) return null;
  const docked = interpolate(frame, [HOOK_OUT, HOOK_OUT + 12], [0, 1], {
    ...clamp,
    easing: pop,
  });
  const open = frame >= UNLOCK;
  const left = interpolate(docked, [0, 1], [540, 40]);
  const top = interpolate(docked, [0, 1], [1420, 150]);
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        translate: `${interpolate(docked, [0, 1], [-50, 0])}% 0`,
        scale:
          interpolate(frame - 60, [0, 8], [1.4, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 11 }),
          }) *
          interpolate(docked, [0, 1], [1, 0.62]) *
          interpolate(frame - UNLOCK, [0, 3, 8], [1, 1.35, 1.2], clamp),
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
        opacity: interpolate(frame, [UNLOCK + 8, UNLOCK + 14], [1, 0], clamp),
      }}
    >
      {open ? "🔓" : "🔒"} Sonda: <Hl>tetiğin sırrı</Hl>
    </div>
  );
};

/** X-ray rozeti + tarama yüzdesi. */
const XrayBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const from = SCAN[0];
  const until = SCAN[1] + 14;
  if (frame < from || frame > until) return null;
  const pct = Math.round(
    interpolate(frame, [SCAN[0], SCAN[1]], [0, 100], clamp),
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 205,
        display: "flex",
        justifyContent: "center",
        opacity: interpolate(
          frame,
          [from, from + 6, until - 8, until],
          [0, 1, 1, 0],
          clamp,
        ),
        scale: interpolate(frame - from, [0, 8], [1.3, 1], {
          ...clamp,
          easing: pop,
        }),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "12px 28px",
          borderRadius: 20,
          border: `3px solid ${palette.xray}`,
          background: palette.panel,
          boxShadow: "0 0 30px rgba(143,214,255,0.25)",
          color: "white",
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 46,
          letterSpacing: 3,
        }}
      >
        <span style={{ color: palette.xray }}>X-RAY</span>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 38,
            letterSpacing: 0,
            color: pct >= 100 ? palette.ok : "white",
          }}
        >
          {pct >= 100 ? "✓ tamam" : `%${pct}`}
        </span>
      </div>
    </div>
  );
};

/** Aktüatör etiketinde iki aktüatörde de nabız halkası. */
const ActPulse: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 300 || frame > 328) return null;
  return (
    <svg
      width={1080}
      height={1920}
      style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}
    >
      {(["act", "actL"] as const).map((k) => {
        const [x, y] = at(k, frame);
        const u = ((frame - 300) % 14) / 14;
        return (
          <circle
            key={k}
            cx={x}
            cy={y}
            r={30 + u * 90}
            fill="none"
            stroke={palette.heat}
            strokeWidth={5}
            opacity={1 - u}
          />
        );
      })}
    </svg>
  );
};

/** Kesit bıçağı: uçta camgöbeği parıltı + kıvılcım çizgileri. */
const BladeGlow: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < CUT[0] || frame > CUT[1] + 1) return null;
  const [x, y] = at("blade", frame);
  return (
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
      <div
        style={{
          position: "absolute",
          left: x - 420,
          top: y - 60,
          width: 840,
          height: 120,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(255,255,255,0.95) 0%, rgba(143,214,255,0.6) 25%, rgba(143,214,255,0) 70%)",
        }}
      />
      <svg
        width={1080}
        height={1920}
        style={{ position: "absolute", inset: 0 }}
      >
        {Array.from({ length: 10 }, (_, i) => {
          const s = i % 2 ? 1 : -1;
          const len = 40 + ((i * 37 + frame * 13) % 70);
          const x0 = x + s * (90 + ((i * 53 + frame * 29) % 160));
          return (
            <line
              key={i}
              x1={x0}
              y1={y}
              x2={x0 + s * len * 0.4}
              y2={y + len}
              stroke={i % 3 ? palette.xray : "white"}
              strokeWidth={3}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
};

const vel = (f: number) =>
  (MOVER[Math.min(f + 1, MOVER.length - 1)] - MOVER[Math.max(f - 1, 0)]) / 2;

/** Mekanizma: hareket yönünde kuvvet oku + bobinde akım kutbu (+ / −). */
const ForceArrows: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < OSC[0] + 4 || frame > OSC[1] - 2) return null;
  const v = vel(frame);
  const vmax = 0.13 * ((2 * Math.PI) / 36);
  const k = Math.min(1, Math.abs(v) / vmax);
  if (k < 0.08) return null;
  const up = v > 0; // yerel +X = ekranda yukarı
  const [mx, my] = at("magN", frame);
  const [cx, cy] = at("coil", frame);
  const col = up ? "#ffb347" : "#5fb8ff";
  const len = 70 + 150 * Math.min(1, k * 1.4);
  const ax = mx + 250;
  const y0 = my + 120;
  const y1 = up ? y0 - len : y0 + len;
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
      <line
        x1={ax}
        y1={y0}
        x2={ax}
        y2={y1}
        stroke={col}
        strokeWidth={14}
        strokeLinecap="round"
        opacity={0.95}
      />
      <polygon
        points={
          up
            ? `${ax - 28},${y1 + 10} ${ax + 28},${y1 + 10} ${ax},${y1 - 34}`
            : `${ax - 28},${y1 - 10} ${ax + 28},${y1 - 10} ${ax},${y1 + 34}`
        }
        fill={col}
      />
      <text
        x={ax + 40}
        y={(y0 + y1) / 2 + 14}
        fill={col}
        fontFamily={fonts.display}
        fontWeight={900}
        fontSize={40}
      >
        {up ? "itme" : "çekme"}
      </text>
      <circle
        cx={cx - 250}
        cy={cy}
        r={44}
        fill={palette.panel}
        stroke={col}
        strokeWidth={5}
      />
      <text
        x={cx - 250}
        y={cy + 22}
        fill={col}
        fontFamily={fonts.display}
        fontWeight={900}
        fontSize={66}
        textAnchor="middle"
      >
        {up ? "+" : "−"}
      </text>
      <text
        x={cx - 250}
        y={cy + 86}
        fill="white"
        fontFamily={fonts.body}
        fontWeight={700}
        fontSize={26}
        textAnchor="middle"
      >
        akım
      </text>
    </svg>
  );
};

/** Canlı titreşim sinyali (hareketli kütlenin konumu) + eski motorla karşılaştırma şeridi. */
const Waveform: React.FC = () => {
  const frame = useCurrentFrame();
  const from = OSC[0];
  const until = OSC[1] + 2;
  if (frame < from || frame > until) return null;
  const x0 = 110;
  const x1 = 910;
  const n = 80;
  const cmp = frame >= 550;
  const yLive = cmp ? 1440 : 1405;
  const pts = Array.from({ length: n }, (_, i) => {
    const f = frame - (n - 1 - i);
    const m = f >= OSC[0] ? MOVER[f] : 0;
    return `${x0 + ((x1 - x0) * i) / (n - 1)},${yLive - (m / 0.13) * 46}`;
  }).join(" ");
  const old = Array.from(
    { length: n },
    (_, i) =>
      `${x0 + ((x1 - x0) * i) / (n - 1)},${1312 - Math.sin((frame - n + i) * 1.3) * 28}`,
  ).join(" ");
  const showOld = interpolate(frame, [550, 558], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: interpolate(
          frame,
          [from, from + 8, until - 6, until],
          [0, 1, 1, 0],
          clamp,
        ),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: x0 - 30,
          width: x1 - x0 + 60,
          top: cmp ? 1222 : 1335,
          bottom: 1920 - 1505,
          borderRadius: 22,
          background: palette.panel,
          border: `3px solid ${palette.accent}`,
        }}
      />
      <svg
        width={1080}
        height={1920}
        style={{ position: "absolute", inset: 0 }}
      >
        {cmp ? (
          <g opacity={showOld}>
            <polyline
              points={old}
              fill="none"
              stroke="#6d7896"
              strokeWidth={5}
            />
            <text
              x={x0}
              y={1272}
              fill={palette.muted}
              fontFamily={fonts.body}
              fontWeight={700}
              fontSize={27}
            >
              ✕ Eski kol: dönen ağırlık → hep aynı “vrrr”
            </text>
          </g>
        ) : null}
        <line
          x1={x0}
          y1={yLive}
          x2={x1}
          y2={yLive}
          stroke="white"
          strokeOpacity={0.12}
          strokeWidth={2}
        />
        <polyline
          points={pts}
          fill="none"
          stroke={palette.highlight}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        <circle
          cx={x1}
          cy={yLive - (MOVER[frame] / 0.13) * 46}
          r={10}
          fill={palette.highlight}
        />
        <text
          x={x0}
          y={cmp ? 1384 : 1362}
          fill="white"
          fontFamily={fonts.body}
          fontWeight={700}
          fontSize={27}
        >
          {cmp ? "✓ Haptik: her his ayrı çizilir" : "titreşim sinyali"}
          {frame >= 575 ? "  · 🌧️ yağmur damlası" : ""}
        </text>
      </svg>
    </div>
  );
};

const SlowMo: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < OSC[0] || frame > 545) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 160,
        top: 1250,
        padding: "6px 16px",
        borderRadius: 12,
        background: palette.panel,
        border: `2px solid ${palette.muted}`,
        color: palette.muted,
        fontFamily: fonts.body,
        fontWeight: 700,
        fontSize: 26,
        opacity: interpolate(
          frame,
          [OSC[0], OSC[0] + 6, 537, 545],
          [0, 1, 1, 0],
          clamp,
        ),
      }}
    >
      ⏱ yavaş çekim
    </div>
  );
};

/** Tetik geri iter: basış yönünün tersine kırmızı-sarı ok. */
const PushBack: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < CONTACT || frame > 760) return null;
  const [rx, ry] = at("lever", 676);
  const [px, py] = at("lever", 686);
  const dx = rx - px;
  const dy = ry - py;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const [lx, ly] = at("lever", frame);
  const t = frame - CONTACT;
  const len =
    interpolate(t, [0, 8], [0, 90], { ...clamp, easing: pop }) +
    Math.sin(t * 0.9) * 10;
  const x0 = lx + ux * 40;
  const y0 = ly + uy * 40;
  const x1 = x0 + ux * len;
  const y1 = y0 + uy * len;
  const nx = -uy;
  const ny = ux;
  return (
    <svg
      width={1080}
      height={1920}
      style={{
        position: "absolute",
        inset: 0,
        opacity: interpolate(frame, [752, 760], [1, 0], clamp),
      }}
    >
      <line
        x1={x0}
        y1={y0}
        x2={x1}
        y2={y1}
        stroke={palette.wrong}
        strokeWidth={16}
        strokeLinecap="round"
      />
      <polygon
        points={`${x1 + nx * 30},${y1 + ny * 30} ${x1 - nx * 30},${y1 - ny * 30} ${x1 + ux * 40},${y1 + uy * 40}`}
        fill={palette.wrong}
      />
      <text
        x={x0 - 24}
        y={y0 + 14}
        fill="white"
        fontFamily={fonts.display}
        fontWeight={900}
        fontSize={42}
        textAnchor="end"
      >
        DİRENÇ
      </text>
    </svg>
  );
};

/** Geri sarma: ⏪ rozeti + yatay hız çizgileri. */
const Rewind: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < REWIND[0] || frame > REWIND[1]) return null;
  const o = interpolate(
    frame,
    [REWIND[0], REWIND[0] + 5, REWIND[1] - 6, REWIND[1]],
    [0, 1, 1, 0],
    clamp,
  );
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <svg
        width={1080}
        height={1920}
        style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}
      >
        {Array.from({ length: 9 }, (_, i) => {
          const y = 520 + ((i * 131 + frame * 23) % 900);
          const x = 1080 - ((i * 211 + frame * 90) % 1400);
          return (
            <line
              key={i}
              x1={x}
              y1={y}
              x2={x + 260}
              y2={y}
              stroke="white"
              strokeOpacity={0.28}
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 150,
          padding: "6px 18px",
          borderRadius: 12,
          background: palette.panel,
          border: `3px solid ${palette.highlight}`,
          color: palette.highlight,
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 34,
          letterSpacing: 2,
          opacity: Math.floor(frame / 8) % 2 ? 0.75 : 1,
        }}
      >
        ⏪ GERİ SAR
      </div>
    </div>
  );
};

const TopShade: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(
    frame,
    [0, HOOK_OUT, HOOK_OUT + 14, 884, 899],
    [1, 1, 0, 0, 1],
    clamp,
  );
  if (o <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        opacity: o,
        background:
          "linear-gradient(180deg, rgba(7,10,20,0.92) 0%, rgba(7,10,20,0.72) 30%, rgba(7,10,20,0) 46%)",
      }}
    />
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
  return (
    <AbsoluteFill
      style={{
        background: color,
        opacity: interpolate(t, [0, 8], [strength, 0], clamp),
      }}
    />
  );
};

export const KolIcinde: React.FC = () => {
  const shake = useShake();
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bgOuter }}>
      <Background />
      <AbsoluteFill style={{ translate: shake }}>
        <Render3D />
      </AbsoluteFill>
      <BuzzRings />
      <TopShade />
      <MythHook />
      <LockBadge />
      <Flash at={STAMP} strength={0.1} color={palette.highlight} />
      <XrayBadge />

      {/* seviye 1: X-ray ile yerinde parçalar — DualSense'in özellikleri */}
      <HudLabel
        anchor="tpad"
        index="1"
        dx={-14}
        dy={-383}
        from={158}
        until={204}
        sub="kaydır, dokun, tıkla"
      >
        Dokunmatik panel
      </HudLabel>
      <HudLabel
        anchor="light"
        index="2"
        dx={20}
        dy={-252}
        from={182}
        until={228}
        sub="oyuncu rengi"
      >
        Işık çubuğu
      </HudLabel>
      <HudLabel
        anchor="imu"
        index="3"
        dx={-8}
        dy={-533}
        from={206}
        until={252}
        sub="6 eksen: eğ, salla"
      >
        Hareket sensörü
      </HudLabel>
      <HudLabel
        anchor="spk"
        index="4"
        dx={20}
        dy={470}
        size={34}
        from={230}
        until={276}
        sub="kol hem duyar hem konuşur"
      >
        Mikrofon + hoparlör
      </HudLabel>
      <HudLabel
        anchor="batt"
        index="5"
        dx={16}
        dy={-524}
        from={254}
        until={300}
        sub="1560 mAh"
      >
        Pil
      </HudLabel>
      <HudLabel
        anchor="trig"
        index="6"
        dx={-20}
        dy={-594}
        from={278}
        until={324}
        sub="🔒 sonra"
      >
        Tetik motoru
      </HudLabel>
      <HudLabel
        anchor="act"
        index="7"
        dx={-50}
        dy={250}
        from={302}
        until={330}
        sub="haptik titreşimi yapan"
      >
        Titreşim aktüatörü ×2
      </HudLabel>
      <ActPulse />
      <Caption from={330} until={378} top={205}>
        Titreşimi bu yapıyor.
        <br />
        Motor değilse <Hl>ne?</Hl> 👇
      </Caption>

      {/* seviye 2: kesit */}
      <BladeGlow />
      <Flash at={SPLIT} strength={0.22} color={palette.xray} />
      <HudLabel
        anchor="coil"
        index="8"
        dx={-120}
        dy={-90}
        from={422}
        until={482}
        sub="bakır tel sargı"
      >
        Bobin
      </HudLabel>
      <HudLabel
        anchor="magN"
        index="9"
        dx={150}
        dy={-150}
        from={436}
        until={482}
        sub="N / S kutuplu"
      >
        Mıknatıs
      </HudLabel>
      <HudLabel
        anchor="mass"
        index="10"
        dx={-150}
        dy={-120}
        from={450}
        until={482}
        sub="mıknatısla oynar"
      >
        Ağırlık
      </HudLabel>
      <HudLabel
        anchor="spring"
        index="11"
        dx={-200}
        dy={60}
        from={462}
        until={482}
        sub="geri yerine çeker"
      >
        Yaylar
      </HudLabel>

      {/* mekanizma */}
      <Caption from={OSC[0]} until={548} top={202} size={44}>
        Bobine akım → mıknatıs <Hl>itilir</Hl> ⚡
        <Sub show={interpolate(frame, [505, 511], [0, 1], clamp)}>
          akım ters dönünce geri çekilir
        </Sub>
      </Caption>
      <Caption from={550} until={OSC[1]} top={202} size={46}>
        Buna <Hl>haptik geri bildirim</Hl> denir 🔊
        <Sub>hoparlör gibi: her his ayrı çizilir</Sub>
      </Caption>
      <ForceArrows />
      <Waveform />
      <SlowMo />

      {/* sürpriz: tetik */}
      <Flash at={UNLOCK} strength={0.18} color={palette.ok} />
      <Caption from={UNLOCK + 10} until={724} top={200}>
        Tetiğin sırrı 🔓
        <br />
        içinde <Hl>gerçek bir motor</Hl> var!
        <Sub>adı: uyarlanabilir tetik</Sub>
      </Caption>
      <HudLabel
        anchor="motor"
        index="12"
        dx={190}
        dy={-120}
        from={664}
        until={724}
        sub="her tetikte bir tane"
      >
        Elektrik motoru
      </HudLabel>
      <HudLabel
        anchor="worm"
        index="13"
        dx={170}
        dy={-70}
        from={678}
        until={724}
        sub="motorun dönüşünü taşır"
      >
        Sonsuz dişli
      </HudLabel>
      <HudLabel
        anchor="gear"
        index="14"
        dx={-170}
        dy={120}
        from={712}
        until={760}
        sub="tetiğin önüne girer"
      >
        Direnç kolu
      </HudLabel>
      <Caption from={727} until={763} top={202}>
        Oyunda yay gerersen 🏹
        <br />
        motor kolu dayar, tetik <Hl>geri iter</Hl>
      </Caption>
      <PushBack />

      {/* geri sarma + özet + CTA */}
      <Rewind />
      <Caption from={REWIND[0] + 4} until={REWIND[1]} top={235} size={42}>
        Haptik titreşim = <Hl>bobin + mıknatıs</Hl> 🔊
        <br />
        Uyarlanabilir tetik = <Hl>motor</Hl> ⚙️
      </Caption>
      <Flash at={REWIND[1] + 1} strength={0.22} />
      <Caption from={CTA} until={895} top={240} size={66}>
        Sıradaki nesne
        <br />
        <Hl>ne olsun?</Hl>
        <div style={{ fontSize: 40, marginTop: 14, color: palette.muted }}>
          Yorumlara yaz ↓
        </div>
      </Caption>

      {/* müzik + efektler: hepsi kendi sentezimiz, sabit perdeli sinüs (riser/whoosh/tiz darbe yok) */}
      <Audio src={sfx("music.wav")} volume={0.85} />
      <Audio src={sfx("buzz.wav")} volume={0.32} />
      <Audio
        src={sfx("stamp.wav")}
        from={STAMP}
        premountFor={30}
        volume={0.55}
      />
      <Audio src={sfx("pop.wav")} from={60} premountFor={30} volume={0.35} />
      <Audio
        src={sfx("scan.wav")}
        from={SCAN[0]}
        premountFor={30}
        volume={0.3}
      />
      {[
        158, 182, 206, 230, 254, 278, 302, 422, 436, 450, 462, 664, 678, 712,
      ].map((f) => (
        <Audio
          key={`l${f}`}
          src={sfx("pop.wav")}
          from={f + 6}
          premountFor={30}
          volume={0.28}
        />
      ))}
      <Audio
        src={sfx("cut.wav")}
        from={CUT[0]}
        premountFor={30}
        volume={0.35}
      />
      <Audio
        src={sfx("thump.wav")}
        from={SPLIT}
        premountFor={30}
        volume={0.35}
      />
      <Audio src={sfx("thrum.wav")} volume={0.5} />
      <Audio
        src={sfx("unlock.wav")}
        from={UNLOCK}
        premountFor={30}
        volume={0.35}
      />
      <Audio
        src={sfx("motor.wav")}
        from={MOTOR}
        premountFor={30}
        volume={0.14}
      />
      <Audio
        src={sfx("thump.wav")}
        from={CONTACT}
        premountFor={30}
        volume={0.45}
      />
      <Audio
        src={sfx("rewind.wav")}
        from={REWIND[0] + 4}
        premountFor={30}
        volume={0.22}
      />
      <Audio
        src={sfx("thump.wav")}
        from={REWIND[1] + 1}
        premountFor={30}
        volume={0.4}
      />
    </AbsoluteFill>
  );
};
