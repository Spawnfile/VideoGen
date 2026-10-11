import { Audio } from "@remotion/media";
import type React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from "remotion";
import anchorData from "./anchors.json";
import { HudLabel } from "./HudLabel";
import { fonts, palette } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const pop = Easing.bezier(0.16, 1, 0.3, 1);
const SFX = "https://remotion.media";
const sfx = (f: string) => staticFile(`sfx/${f}`);

// Zaman çizelgesi (Remotion karesi = Blender karesi - 1). Müzik 75 BPM → 1 vuruş = 24 kare, kesmeler yarım vuruşta.
const HOOK_OUT = 80;
const LASER = [84, 108] as const;
const LID_UP = 108;
const LID_AWAY = 180;
const FLIP = 264;
const UNFLIP = 336;
const DIVE = [360, 396] as const;
const [CUT_IN, CUT_OUT] = anchorData.cuts; // 450, 736
const GATE = [
  [612, 648],
  [672, 694],
] as const;
const STROBE = [696, 720] as const;
const SLAM = 806;
const ANSWER = 746;
const CTA = 812;

/** Blender'ın şeffaf PNG dizisi + ölçek değişiminde yumuşak zoom geçişi. */
const Render3D: React.FC = () => {
  const frame = useCurrentFrame();
  const sIn = interpolate(frame, [CUT_IN - 8, CUT_IN - 1, CUT_IN, CUT_IN + 10], [1, 1.3, 0.8, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.quad),
  });
  const sOut = interpolate(frame, [CUT_OUT - 8, CUT_OUT - 1, CUT_OUT, CUT_OUT + 10], [1, 0.8, 1.3, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.quad),
  });
  const blur =
    interpolate(frame, [CUT_IN - 8, CUT_IN, CUT_IN + 10], [0, 10, 0], clamp) +
    interpolate(frame, [CUT_OUT - 8, CUT_OUT, CUT_OUT + 10], [0, 10, 0], clamp) +
    interpolate(frame, [DIVE[0] + 20, DIVE[1] - 2, DIVE[1] + 6], [0, 4, 0], clamp);
  return (
    <Img
      src={staticFile(`frames/${String(frame + 1).padStart(4, "0")}.png`)}
      style={{
        position: "absolute",
        width: 1080,
        height: 1920,
        scale: sIn * sOut,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
      }}
    />
  );
};

/** Klavyedeki lacivert stüdyo; çizgi ızgara yerine soluk nokta ızgara. */
const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 50% 46%, ${palette.bgInner} 0%, ${palette.bgMid} 55%, ${palette.bgOuter} 100%)`,
    }}
  >
    <AbsoluteFill
      style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 2.5px, transparent 2.5px)",
        backgroundSize: "60px 60px",
        maskImage: "radial-gradient(circle at 50% 46%, black 20%, transparent 75%)",
      }}
    />
  </AbsoluteFill>
);

/** Vuruş anlarında kısa sarsıntı. */
const useShake = () => {
  const frame = useCurrentFrame();
  let x = 0;
  let y = 0;
  for (const [at, amp] of [
    [LID_UP, 8],
    [SLAM, 14],
  ] as const) {
    const t = frame - at;
    if (t >= 0 && t < 10) {
      const k = amp * Math.exp(-t / 3);
      x += Math.sin(t * 2.7) * k;
      y += Math.cos(t * 3.3) * k;
    }
  }
  return `${x}px ${y}px`;
};

const Hl: React.FC<{ readonly children: React.ReactNode; readonly color?: string }> = ({ children, color }) => (
  <span style={{ color: color ?? palette.highlight }}>{children}</span>
);

type CaptionProps = {
  readonly from: number;
  readonly until: number;
  readonly top: number;
  readonly children: React.ReactNode;
  readonly size?: number;
};

/** Klavye açıklama kutusu: ortalı koyu cam, aşağıdan kayarak gelir. */
const Caption: React.FC<CaptionProps> = ({ from, until, top, children, size = 46 }) => {
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
        opacity: interpolate(frame, [from, from + 8, until - 8, until], [0, 1, 1, 0], clamp),
        translate: interpolate(frame, [from, from + 12], ["0px 30px", "0px 0px"], { ...clamp, easing: pop }),
        scale: interpolate(frame, [from, from + 12], [0.92, 1], { ...clamp, easing: pop }),
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

const Chip: React.FC<{
  readonly letter: string;
  readonly text: string;
  readonly at: number;
  readonly state?: "idle" | "right" | "wrong";
}> = ({ letter, text, at, state = "idle" }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0) return <div style={{ width: 300 }} />;
  const c = state === "right" ? palette.ok : state === "wrong" ? "#4a5470" : palette.accent;
  return (
    <div
      style={{
        width: 300,
        padding: "12px 0",
        textAlign: "center",
        borderRadius: 18,
        border: `3px solid ${c}`,
        background: state === "right" ? "rgba(75,224,138,0.2)" : palette.panel,
        boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
        fontFamily: fonts.body,
        fontWeight: 700,
        fontSize: 40,
        color: state === "wrong" ? "#6d7896" : "white",
        textDecoration: state === "wrong" ? "line-through" : undefined,
        scale: interpolate(t, [0, 8], [1.5, 1], { ...clamp, easing: Easing.spring({ damping: 11 }) }),
        opacity: interpolate(t, [0, 3], [0, 1], clamp),
      }}
    >
      <span style={{ color: state === "right" ? palette.ok : palette.highlight, fontFamily: fonts.display, fontWeight: 900 }}>
        {letter}
      </span>{" "}
      {text}
      {state === "right" ? " ✓" : ""}
    </div>
  );
};

/** Kanca: tahmin oyunu. Çıkışta klavyedeki gibi büyüyüp bulanıklaşır. */
const QuizHook: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > HOOK_OUT + 14) return null;
  const line = (at: number, children: React.ReactNode, style: React.CSSProperties) => {
    const t = frame - at;
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
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        top: 165,
        textAlign: "center",
        color: "white",
        textShadow: "0 6px 26px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)",
        opacity: interpolate(frame, [HOOK_OUT, HOOK_OUT + 12], [1, 0], clamp),
        scale: interpolate(frame, [HOOK_OUT, HOOK_OUT + 14], [1, 1.2], clamp),
        filter: `blur(${interpolate(frame, [HOOK_OUT, HOOK_OUT + 14], [0, 10], clamp)}px)`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        {line(
          0,
          <div
            style={{
              padding: "8px 24px",
              borderRadius: 14,
              background: palette.highlight,
              color: "#1a1400",
              fontFamily: fonts.display,
              fontWeight: 900,
              fontSize: 36,
              letterSpacing: 2,
              textShadow: "none",
            }}
          >
            TAHMİN ET 🤔
          </div>,
          {},
        )}
      </div>
      {line(3, "Bu minik çipte", { fontFamily: fonts.body, fontSize: 58, fontWeight: 700 })}
      {line(8, "kaç tane", { fontFamily: fonts.body, fontSize: 58, fontWeight: 700 })}
      {line(
        14,
        <span>
          <Hl>ANAHTAR</Hl> var?
        </span>,
        { fontFamily: fonts.display, fontSize: 112, fontWeight: 900, lineHeight: 1.05, letterSpacing: -2 },
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 28 }}>
        <Chip letter="A" text="20 bin" at={24} />
        <Chip letter="B" text="20 milyon" at={36} />
        <Chip letter="C" text="20 milyar" at={48} />
      </div>
    </div>
  );
};

/** "Cevap sonda" rozeti: kancada belirir, sonra sol üst köşeye küçülüp kalır. */
const AnswerPromise: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 60 || frame >= ANSWER) return null;
  const docked = interpolate(frame, [HOOK_OUT, HOOK_OUT + 12], [0, 1], { ...clamp, easing: pop });
  return (
    <div
      style={{
        position: "absolute",
        left: interpolate(docked, [0, 1], [540, 40]),
        top: interpolate(docked, [0, 1], [1525, 150]),
        translate: `${interpolate(docked, [0, 1], [-50, 0])}% 0`,
        scale:
          interpolate(frame - 60, [0, 8], [1.4, 1], { ...clamp, easing: Easing.spring({ damping: 11 }) }) *
          interpolate(docked, [0, 1], [1, 0.62]),
        transformOrigin: "left top",
        padding: "10px 22px",
        borderRadius: 16,
        border: `3px solid ${palette.highlight}`,
        background: palette.panel,
        color: "white",
        fontFamily: fonts.body,
        fontWeight: 700,
        fontSize: 36,
        whiteSpace: "nowrap",
        opacity: interpolate(frame, [ANSWER - 8, ANSWER], [1, 0], clamp),
      }}
    >
      👀 Cevap <Hl>sonda</Hl>
    </div>
  );
};

/** Kancada CPU'nun üstünden geçen yumuşak ışık taraması. */
const ScanLine: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > 70) return null;
  const y = interpolate(frame, [0, 64], [880, 1560], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const a = interpolate(frame, [0, 6, 56, 70], [0, 0.85, 0.85, 0], clamp);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: a, mixBlendMode: "screen" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: y - 140,
          height: 140,
          background: "linear-gradient(180deg, rgba(143,214,255,0) 0%, rgba(143,214,255,0.16) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: y - 1.5,
          height: 3,
          background: "rgba(220,240,255,0.9)",
          boxShadow: `0 0 16px ${palette.elec}`,
        }}
      />
    </div>
  );
};

const TopShade: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, HOOK_OUT, HOOK_OUT + 14], [1, 1, 0], clamp);
  if (o <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        opacity: o,
        background: "linear-gradient(180deg, rgba(7,10,20,0.92) 0%, rgba(7,10,20,0.72) 34%, rgba(7,10,20,0) 50%)",
      }}
    />
  );
};

const Flash: React.FC<{ readonly at: number; readonly strength?: number }> = ({ at, strength = 0.3 }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 8) return null;
  return <AbsoluteFill style={{ background: "white", opacity: interpolate(t, [0, 8], [strength, 0], clamp) }} />;
};

/** Lazer ucunda turuncu parıltı + kıvılcımlar. */
const LaserSparks: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < LASER[0] || frame > LASER[1] + 2) return null;
  const [x, y] = anchorData.anchors.laser[frame];
  if (x < -500) return null;
  return (
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
      <div
        style={{
          position: "absolute",
          left: x - 110,
          top: y - 110,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,150,80,0.8) 18%, rgba(255,110,50,0.25) 45%, rgba(255,110,50,0) 70%)",
        }}
      />
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: 12 }, (_, i) => {
          const birth = frame - (i % 4);
          const ang = random(`s${birth}-${i}`) * Math.PI * 2;
          const len = 20 + random(`l${birth}-${i}`) * 80;
          const r0 = 10 + (i % 4) * 14;
          return (
            <line
              key={i}
              x1={x + Math.cos(ang) * r0}
              y1={y + Math.sin(ang) * r0 - (i % 4) * 6}
              x2={x + Math.cos(ang) * (r0 + len)}
              y2={y + Math.sin(ang) * (r0 + len) - (i % 4) * 10}
              stroke={i % 2 ? "#ffe2b8" : "#ffd23f"}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={1 - (i % 4) / 4}
            />
          );
        })}
      </svg>
    </div>
  );
};

/** Yakınlaştırma göstergesi: cm → mm → µm → nm. */
const ZoomBar: React.FC = () => {
  const frame = useCurrentFrame();
  const from = DIVE[0] - 4;
  const until = CUT_OUT + 34;
  if (frame < from || frame > until) return null;
  const pos = interpolate(
    frame,
    [DIVE[0], DIVE[1], CUT_IN - 1, CUT_IN + 40, 540, CUT_OUT - 10, CUT_OUT, CUT_OUT + 30],
    [0, 1, 1.25, 2, 3, 3, 1.4, 0],
    clamp,
  );
  const mag = Math.pow(10, interpolate(pos, [0, 1, 2, 3], [0, 1.3, 4, 6]));
  const fmt = (n: number) => {
    const r = n < 100 ? Math.round(n) : n < 10000 ? Math.round(n / 10) * 10 : Math.round(n / 1000) * 1000;
    return r.toLocaleString("tr-TR");
  };
  const stops = ["cm", "mm", "µm", "nm"];
  const x0 = 130;
  const x1 = 830;
  const cx = x0 + (x1 - x0) * (pos / 3);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: interpolate(frame, [from, from + 8, until - 8, until], [0, 1, 1, 0], clamp),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: x0 - 20,
          top: 1385,
          fontFamily: fonts.body,
          fontWeight: 700,
          fontSize: 32,
          color: "white",
          textShadow: "0 3px 12px rgba(0,0,0,0.9)",
        }}
      >
        <span style={{ color: palette.muted, fontWeight: 600 }}>Yakınlaştırma </span>
        <span style={{ color: palette.highlight, fontFamily: fonts.display, fontWeight: 900 }}>×{fmt(mag)}</span>
      </div>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <line x1={x0} y1={1462} x2={x1} y2={1462} stroke="white" strokeOpacity={0.22} strokeWidth={6} strokeLinecap="round" />
        <line x1={x0} y1={1462} x2={cx} y2={1462} stroke={palette.accent} strokeWidth={6} strokeLinecap="round" />
        {stops.map((s, i) => {
          const x = x0 + ((x1 - x0) * i) / 3;
          const on = pos >= i - 0.05;
          return (
            <g key={s}>
              <circle cx={x} cy={1462} r={9} fill={on ? palette.accent : "#26304a"} />
              <text x={x} y={1506} fill={on ? "white" : "#5b6680"} fontFamily={fonts.body} fontWeight={700} fontSize={27} textAnchor="middle">
                {s}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={1462} r={15} fill={palette.highlight} stroke="white" strokeWidth={3} />
      </svg>
    </div>
  );
};

const isOn = (f: number) =>
  GATE.some(([a, b]) => f >= a + 2 && f <= b) ||
  (f >= STROBE[0] && f <= STROBE[1] && Math.floor((f - STROBE[0]) / 2) % 2 === 0);

/** Kanal boyunca kaynaktan akaca akan elektron okları. */
const ElectronFlow: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < GATE[0][0] || frame > STROBE[1] || !isOn(frame)) return null;
  const [sx, sy] = anchorData.anchors.source[frame];
  const [dx, dy] = anchorData.anchors.drain[frame];
  const [cx, cy] = anchorData.anchors.channel[frame];
  const y0 = sy - 40;
  const y1 = dy - 40;
  const d = `M ${sx + 30} ${y0} Q ${cx} ${cy - 70} ${dx - 30} ${y1}`;
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
      <path d={d} fill="none" stroke={palette.elec} strokeOpacity={0.3} strokeWidth={10} />
      <path
        d={d}
        fill="none"
        stroke="white"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray="2 46"
        strokeDashoffset={-frame * 9}
      />
      <text x={sx + 40} y={y0 - 26} fill={palette.elec} fontFamily={fonts.display} fontWeight={900} fontSize={36}>
        e⁻ →
      </text>
    </svg>
  );
};

/** Çıkış göstergesi (klavyedeki "ekran:" kutusunun kardeşi): kapı açıksa 1, kapalıysa 0; strobe'da bit dizisi. */
const SignalReadout: React.FC = () => {
  const frame = useCurrentFrame();
  const from = GATE[0][0] - 4;
  const until = STROBE[1] + 2;
  if (frame < from || frame > until) return null;
  const on = isOn(frame);
  const strobe = frame >= STROBE[0];
  const bits = Array.from({ length: 14 }, (_, i) => (random(`b${Math.floor(frame / 2) - i}`) > 0.5 ? "1" : "0")).join("");
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 150,
        top: 1250,
        display: "flex",
        justifyContent: "center",
        opacity: interpolate(frame, [from, from + 6, until - 4, until], [0, 1, 1, 0], clamp),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "12px 28px",
          borderRadius: 20,
          background: palette.panel,
          border: `3px solid ${palette.accent}`,
          boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
          color: "white",
        }}
      >
        <span style={{ fontFamily: fonts.body, fontSize: 30, fontWeight: 700, color: palette.muted }}>çıkış:</span>
        {strobe ? (
          <span style={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 52, color: palette.highlight }}>{bits}</span>
        ) : (
          <span
            style={{
              fontFamily: fonts.display,
              fontWeight: 900,
              fontSize: 80,
              lineHeight: 1,
              color: on ? palette.highlight : "#5b6680",
            }}
          >
            {on ? "1" : "0"}
          </span>
        )}
      </div>
    </div>
  );
};

/** Cevap kartı: şıklar geri gelir, C yanar. */
const AnswerCard: React.FC = () => {
  const frame = useCurrentFrame();
  const until = SLAM - 2;
  if (frame < ANSWER || frame > until) return null;
  const t = frame - ANSWER;
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        top: 165,
        textAlign: "center",
        color: "white",
        opacity: interpolate(frame, [ANSWER, ANSWER + 4, until - 6, until], [0, 1, 1, 0], clamp),
        textShadow: "0 6px 26px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)",
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "8px 24px",
          borderRadius: 14,
          background: palette.ok,
          color: "#002210",
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 36,
          letterSpacing: 2,
          textShadow: "none",
          scale: interpolate(t, [0, 8], [1.7, 1], { ...clamp, easing: Easing.spring({ damping: 10 }) }),
        }}
      >
        CEVAP: C ✓
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 124,
          fontWeight: 900,
          letterSpacing: -3,
          lineHeight: 1.05,
          marginTop: 12,
          scale: interpolate(t - 6, [0, 10], [0.5, 1], { ...clamp, easing: Easing.spring({ damping: 11 }) }),
          opacity: interpolate(t - 6, [0, 3], [0, 1], clamp),
        }}
      >
        ≈<Hl>20 MİLYAR</Hl>
      </div>
      <div style={{ fontFamily: fonts.body, fontSize: 42, fontWeight: 700, opacity: interpolate(t - 14, [0, 6], [0, 1], clamp) }}>
        transistör{" "}
        <span style={{ color: palette.muted, fontWeight: 600, fontSize: 31 }}>(üst seviye masaüstü işlemci)</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 24, scale: 0.75 }}>
        <Chip letter="A" text="20 bin" at={ANSWER + 2} state="wrong" />
        <Chip letter="B" text="20 milyon" at={ANSWER + 4} state="wrong" />
        <Chip letter="C" text="20 milyar" at={ANSWER + 6} state="right" />
      </div>
    </div>
  );
};

/** Kapak oturduğunda şok dalgası. */
const SlamRing: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame - SLAM;
  if (t < 0 || t > 18) return null;
  const [x, y] = anchorData.anchors.tim[frame];
  const r = interpolate(t, [0, 18], [40, 650], { ...clamp, easing: pop });
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.55} fill="none" stroke="white" strokeWidth={6} opacity={interpolate(t, [0, 18], [0.8, 0], clamp)} />
      <ellipse cx={x} cy={y} rx={r * 0.7} ry={r * 0.38} fill="none" stroke={palette.highlight} strokeWidth={4} opacity={interpolate(t, [0, 14], [0.8, 0], clamp)} />
    </svg>
  );
};

export const CpuIcinde: React.FC = () => {
  const shake = useShake();
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bgOuter }}>
      <Background />
      <AbsoluteFill style={{ translate: shake }}>
        <Render3D />
      </AbsoluteFill>
      <ScanLine />
      <TopShade />
      <QuizHook />
      <AnswerPromise />
      <LaserSparks />
      <Flash at={LID_UP} strength={0.15} />

      {/* seviye 1: paket katmanları */}
      <HudLabel anchor="ihs" index="1" dx={-90} dy={260} from={126} until={178} sub="nikel kaplı bakır">
        Isı kapağı
      </HudLabel>
      <HudLabel anchor="tim" index="2" dx={-90} dy={-250} from={184} until={226} sub="ısıyı kapağa taşır">
        Termal lehim
      </HudLabel>
      <HudLabel anchor="die" index="3" dx={110} dy={230} from={214} until={262} sub="asıl beyin burası">
        Silikon çip
      </HudLabel>
      <HudLabel anchor="caps" index="4" dx={90} dy={-250} from={228} until={262} sub="gerilimi dengeler">
        Kondansatörler
      </HudLabel>
      <HudLabel anchor="pads" index="5" dx={130} dy={200} from={290} until={334} sub="anakartla bağlantı">
        ~1700 altın temas
      </HudLabel>
      <Caption from={UNFLIP + 2} until={DIVE[1] - 2} top={205}>
        Şimdi çipin <Hl>içine küçülüyoruz</Hl> 👇
      </Caption>

      {/* seviye 2: çip → çekirdek → bakır yollar */}
      <HudLabel anchor="core" index="6" dx={150} dy={130} from={400} until={446} sub="her biri ayrı bir işlemci">
        Çekirdek ×8
      </HudLabel>
      <HudLabel anchor="cache" index="7" dx={150} dy={-230} from={404} until={430} sub="çipin hızlı hafızası">
        Önbellek
      </HudLabel>
      <Caption from={CUT_IN + 8} until={530} top={205}>
        Transistörlerin üstünde
        <br />
        <Hl>15'ten fazla kat</Hl> bakır yol
        <div style={{ fontSize: 32, fontWeight: 600, color: palette.muted }}>çipin otoyolları</div>
      </Caption>

      {/* seviye 3: transistör ve mekanizma */}
      <Caption from={542} until={606} top={205}>
        İşte bir <Hl>transistör</Hl>:
        <br />
        minicik bir elektrik anahtarı
      </Caption>
      <HudLabel anchor="gate" index="8" dx={150} dy={-150} from={550} until={606} sub="aç / kapa düğmesi">
        Kapı
      </HudLabel>
      <HudLabel anchor="source" index="9" dx={70} dy={200} from={562} until={606} sub="elektron girişi">
        Kaynak
      </HudLabel>
      <HudLabel anchor="drain" index="10" dx={-70} dy={200} from={574} until={606} sub="elektron çıkışı">
        Akaç
      </HudLabel>
      <HudLabel anchor="channel" index="11" dx={-150} dy={-250} from={586} until={606}>
        Kanal
      </HudLabel>
      <Caption from={GATE[0][0]} until={GATE[1][0] - 2} top={205}>
        Kapıya <Hl>voltaj</Hl> gelince ⚡
        <br />
        elektronlar akar = <Hl>1</Hl>
        <div style={{ opacity: interpolate(frame, [GATE[0][1], GATE[0][1] + 6], [0, 1], clamp) }}>
          Voltaj yoksa akış durur = <Hl color={palette.muted}>0</Hl>
        </div>
      </Caption>
      <Caption from={GATE[1][0]} until={ANSWER - 2} top={205} size={50}>
        Bunu saniyede
        <br />
        <Hl>5 milyar</Hl> kez yapar!
        <div style={{ fontSize: 32, fontWeight: 600, color: palette.muted }}>
          5 GHz · milyarlarca 1 ve 0 = bütün bilgisayar
        </div>
      </Caption>
      <ElectronFlow />
      <SignalReadout />
      <ZoomBar />

      {/* final: cevap + kapak geri + CTA */}
      <AnswerCard />
      <Flash at={CUT_IN} strength={0.25} />
      <Flash at={CUT_OUT} strength={0.2} />
      <Flash at={SLAM} strength={0.28} />
      <SlamRing />
      <Caption from={CTA} until={895} top={240} size={66}>
        Tahminin
        <br />
        <Hl>tuttu mu?</Hl>
        <div style={{ fontSize: 40, marginTop: 14, color: palette.muted }}>
          Yorumlara yaz ↓
          <br />
          sıradaki nesneyi de söyle
        </div>
      </Caption>

      {/* müzik + efektler (gürültüsüz, yumuşak) */}
      <Audio src={sfx("music.wav")} volume={0.5} />
      <Audio src={`${SFX}/whoosh.wav`} from={LID_AWAY - 2} premountFor={30} volume={0.35} />
      <Audio src={sfx("heat.wav")} from={LID_AWAY + 2} premountFor={30} volume={0.3} />
      <Audio src={`${SFX}/whip.wav`} from={FLIP} premountFor={30} volume={0.3} />
      <Audio src={`${SFX}/whip.wav`} from={UNFLIP} premountFor={30} volume={0.25} />
      {[184, 214, 228, 290, 400, 404, 550, 562, 574, 586].map((f) => (
        <Audio key={`l${f}`} src={sfx("pop.wav")} from={f + 6} premountFor={30} volume={0.35} />
      ))}
      <Audio src={`${SFX}/whoosh.wav`} from={CUT_IN - 10} premountFor={30} volume={0.4} />
      <Audio src={sfx("punch.wav")} from={CUT_IN} premountFor={30} volume={0.6} />
      {GATE.map(([, b]) => (
        <Audio key={`o${b}`} src={sfx("switch_002.ogg")} from={b} premountFor={30} volume={0.4} />
      ))}
      {Array.from({ length: 6 }, (_, i) => STROBE[0] + i * 4).map((f) => (
        <Audio key={`s${f}`} src={sfx("blip.wav")} from={f} premountFor={30} volume={0.3} />
      ))}
      <Audio src={`${SFX}/whoosh.wav`} from={CUT_OUT - 10} premountFor={30} volume={0.35} />
      <Audio src={sfx("confirmation_001.ogg")} from={ANSWER} premountFor={30} volume={0.5} />
      <Audio src={`${SFX}/whoosh.wav`} from={SLAM - 30} premountFor={30} volume={0.3} />
      <Audio src={sfx("impactMetal_light_000.ogg")} from={SLAM} premountFor={30} volume={0.7} />
      <Audio src={sfx("punch.wav")} from={SLAM} premountFor={30} volume={0.5} />
      <Audio src={`${SFX}/ding.wav`} from={CTA + 2} premountFor={30} volume={0.3} />
    </AbsoluteFill>
  );
};
