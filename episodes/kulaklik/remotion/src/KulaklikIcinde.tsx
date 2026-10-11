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
const at = (k: K, f: number) =>
  A[k][Math.max(0, Math.min(f, A[k].length - 1))];
const TL = anchorData.timeline;

// Zaman çizelgesi (Remotion karesi; Blender'daki T ile aynı — anchors.json'dan okunur)
const BRIDGE = TL.BRIDGE;
const MECH = TL.MECH;
const ANC = TL.ANC;
const CTA = TL.CTA;
const END = TL.END;
const VIB: number[] = anchorData.vib;
const VIB0: number = anchorData.vib0;
const L1 = 152; // ilk etiket (ilk 5 sn yalnız müzik)
const L1_STEP = 20;
const L2 = TL.L2[0];
const L2_STEP = 18;
const NOISE_HEARD = ANC[0] + 22; // dış mikrofon gürültüyü duyar
const ANTI = ANC[0] + 42; // çip ters dalga üretir
const SILENT = ANC[0] + 64; // toplam düz çizgi
const RAIN = TL.RAIN;

const pad4 = (n: number) => String(n).padStart(4, "0");

/** Halka emisyonu: diyaframın her ileri tepe noktasında bir ses halkası. */
const RINGS: number[] = VIB.flatMap((v, i) =>
  i > 0 && i < VIB.length - 1 && v > 0.5 && v >= VIB[i - 1] && v > VIB[i + 1]
    ? [VIB0 + i]
    : [],
);

/** Lacivert stüdyo + soluk ızgara; varyasyon: soluk ses dalgası çizgileri (son karede başa döner). */
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const shift = (((frame + 1) % 900) * 720) / 900; // 2 dalga boyu (360 px) → döngü
  const wave = (y: number, amp: number, op: number, dir: number) => {
    const pts: string[] = [];
    for (let x = -40; x <= 1120; x += 12) {
      const ph = ((x + dir * shift) / 360) * Math.PI * 2;
      pts.push(`${x},${(y + Math.sin(ph) * amp).toFixed(1)}`);
    }
    return (
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={`rgba(160,200,255,${op})`}
        strokeWidth={3}
      />
    );
  };
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 46%, ${palette.bgInner} 0%, ${palette.bgMid} 55%, ${palette.bgOuter} 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.04) 2px, transparent 2px)",
          backgroundSize: "90px 90px",
          maskImage:
            "radial-gradient(circle at 50% 45%, black 20%, transparent 75%)",
        }}
      />
      <svg
        width={1080}
        height={1920}
        style={{
          position: "absolute",
          inset: 0,
          maskImage:
            "radial-gradient(ellipse at 50% 50%, black 10%, transparent 70%)",
        }}
      >
        {wave(560, 26, 0.05, 1)}
        {wave(980, 40, 0.06, -1)}
        {wave(1400, 26, 0.05, 1)}
      </svg>
    </AbsoluteFill>
  );
};

const Render3D: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Img
      src={staticFile(`frames/${pad4(frame + 1)}.png`)}
      style={{ position: "absolute", width: 1080, height: 1920 }}
    />
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
          padding: "20px 30px",
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

/** Bir panelin içinde sonradan beliren satır. */
const Later: React.FC<{
  readonly at: number;
  readonly children: React.ReactNode;
}> = ({ at: t0, children }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        opacity: interpolate(frame, [t0, t0 + 8], [0, 1], clamp),
        translate: interpolate(frame, [t0, t0 + 10], ["0px 16px", "0px 0px"], {
          ...clamp,
          easing: pop,
        }),
      }}
    >
      {children}
    </div>
  );
};

/** Kanca: kapak açılırken yumuşak merak sorusu, kulaklık kalkınca cevap. */
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const swap = 40;
  const out0 = 80;
  if (frame < 2 || frame > out0 + 14) return null;
  const a = frame < swap + 8;
  const t = a ? frame - 2 : frame - swap;
  const leave = a
    ? interpolate(frame, [swap, swap + 8], [1, 0], clamp)
    : interpolate(frame, [out0, out0 + 12], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 50,
        right: 50,
        top: 200,
        textAlign: "center",
        color: "white",
        textShadow: "0 6px 26px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)",
        opacity: leave,
        scale: a ? 1 : interpolate(frame, [out0, out0 + 14], [1, 1.2], clamp),
        filter: a
          ? `blur(${interpolate(frame, [swap, swap + 8], [0, 8], clamp)}px)`
          : `blur(${interpolate(frame, [out0, out0 + 14], [0, 10], clamp)}px)`,
        translate: a
          ? interpolate(frame, [swap, swap + 8], ["0px 0px", "0px -40px"], clamp)
          : "0px 0px",
      }}
    >
      <div
        style={{
          fontFamily: fonts.body,
          fontWeight: 700,
          fontSize: 50,
          marginBottom: 10,
          color: a ? "white" : palette.muted,
          opacity: interpolate(t, [0, 5], [0, 1], clamp),
          translate: interpolate(t, [0, 8], ["0px 20px", "0px 0px"], {
            ...clamp,
            easing: pop,
          }),
        }}
      >
        {a ? "Herkes içinde sadece" : "Aslında içinde"}
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 84,
          lineHeight: 1.06,
          letterSpacing: -1.5,
          color: a ? "white" : palette.highlight,
          scale: interpolate(t, [2, 12], [0.7, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 11 }),
          }),
          opacity: interpolate(t, [2, 7], [0, 1], clamp),
        }}
      >
        {a ? (
          <>
            bir hoparlör
            <br />
            var sanır… 🤫
          </>
        ) : (
          <>
            3 mikrofon ve
            <br />
            bir çip var 😉
          </>
        )}
      </div>
    </div>
  );
};

/** Kancada (ve döngü için son karelerde) yazı okunurluğu için üstte koyu geçiş. */
const TopShade: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 82, 96, 884, END], [1, 1, 0, 0, 1], clamp);
  if (o <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        opacity: o,
        background:
          "linear-gradient(180deg, rgba(7,10,20,0.9) 0%, rgba(7,10,20,0.7) 24%, rgba(7,10,20,0) 40%)",
      }}
    />
  );
};

/** "Sesi görmek": diyaframın her ileri itişinde perspektif elipsle yayılan ses halkası. */
const SoundRings: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < MECH[0] || frame > MECH[1] + 34) return null;
  return (
    <svg
      width={1080}
      height={1920}
      style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}
    >
      {RINGS.map((r0) => {
        const t = frame - r0;
        if (t < 0 || t > 32) return null;
        const f = Math.min(frame, r0 + 32);
        const [cx0, cy0] = at("d_center", f);
        const [ux, uy] = at("d_rimy", f);
        const [vx, vy] = at("d_rimx", f);
        const [upx, upy] = at("d_up", f);
        const k = interpolate(t, [0, 32], [0, 1], { ...clamp, easing: pop });
        const s = 0.5 + k * 0.8;
        const cx = cx0 + (upx - cx0) * k * 0.5;
        const cy = cy0 + (upy - cy0) * k * 0.5;
        const pts: string[] = [];
        for (let i = 0; i <= 48; i++) {
          const th = (i / 48) * Math.PI * 2;
          pts.push(
            `${(cx + ((ux - cx0) * Math.cos(th) + (vx - cx0) * Math.sin(th)) * s).toFixed(1)},${(cy + ((uy - cy0) * Math.cos(th) + (vy - cy0) * Math.sin(th)) * s).toFixed(1)}`,
          );
        }
        return (
          <polyline
            key={r0}
            points={pts.join(" ")}
            fill="none"
            stroke={palette.elec}
            strokeWidth={interpolate(t, [0, 32], [7, 2], clamp)}
            opacity={interpolate(t, [0, 3, 32], [0, 0.95, 0], clamp)}
          />
        );
      })}
    </svg>
  );
};

/** Kulağımızın duyduğu aralık: 20 → 20.000 sayacı (logaritmik). */
const HearingCounter: React.FC = () => {
  const frame = useCurrentFrame();
  const from = MECH[0] + 22;
  const until = MECH[1] - 2;
  if (frame < from || frame > until) return null;
  const v = Math.round(
    20 * Math.pow(1000, interpolate(frame, [from + 8, from + 34], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) })),
  );
  const shown = v >= 19950 ? 20000 : v < 100 ? v : Math.round(v / 10) * 10;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: 1330,
        translate: "-50% 0",
        padding: "14px 26px",
        borderRadius: 20,
        background: palette.panel,
        border: `3px solid ${palette.accent}`,
        boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
        textAlign: "center",
        whiteSpace: "nowrap",
        opacity: interpolate(frame, [from, from + 6, until - 6, until], [0, 1, 1, 0], clamp),
        scale: interpolate(frame, [from, from + 10], [0.8, 1], { ...clamp, easing: pop }),
      }}
    >
      <div style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 28, color: palette.muted }}>
        Kulağımız saniyede
      </div>
      <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 60, color: "white", lineHeight: 1.1 }}>
        20 → <span style={{ color: palette.highlight }}>{shown.toLocaleString("tr-TR")}</span>
      </div>
      <div style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 28, color: palette.muted }}>
        titreşimi ses olarak duyar
      </div>
    </div>
  );
};

/** Gürültü dalgası örneği (sabit, deterministik "pürüzlü" ses). */
const noise = (x: number) =>
  Math.sin(x * 0.045) * 0.55 + Math.sin(x * 0.11 + 1.3) * 0.3 + Math.sin(x * 0.23 + 0.4) * 0.18;

const wavePts = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  amp: number,
  phase: number,
  sign = 1,
) => {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const pts: string[] = [];
  const n = Math.max(2, Math.floor(len / 6));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const taper = Math.min(1, u * 6, (1 - u) * 6);
    const w = sign * noise(u * len - phase) * amp * taper;
    pts.push(`${(x0 + (x1 - x0) * u + nx * w).toFixed(1)},${(y0 + (y1 - y0) * u + ny * w).toFixed(1)}`);
  }
  return pts.join(" ");
};

/** ANC sahnesi: soldan gelen gürültü → dış mikrofon → çip → kulak ucundan ters dalga → kulakta düz çizgi. */
const AncWaves: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < ANC[0] || frame > ANC[1] + 4) return null;
  const fade = interpolate(frame, [ANC[0], ANC[0] + 8, ANC[1] - 6, ANC[1] + 4], [0, 1, 1, 0], clamp);
  const [mx, my] = at("outermic", frame);
  const [cx, cy] = at("chip", frame);
  const [dx, dy] = at("driver", frame);
  const [tx, ty] = at("tipout", frame);
  const ph = frame * 9;
  const drawIn = interpolate(frame, [ANC[0] + 4, NOISE_HEARD], [0, 1], { ...clamp, easing: pop });
  const sx = 0;
  const sy = my - 160;
  const ex = sx + (mx - 20 - sx) * drawIn;
  const ey = sy + (my - 10 - sy) * drawIn;
  // kulağa ulaşan: önce gürültü geçer, ters dalga gelince düzleşir
  const leak = interpolate(frame, [NOISE_HEARD, NOISE_HEARD + 8], [0, 1], clamp);
  const residual = interpolate(frame, [ANTI + 4, SILENT], [1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const anti = interpolate(frame, [ANTI, ANTI + 10], [0, 1], clamp);
  const pulse = (a0: number, a1: number, x0: number, y0: number, x1: number, y1: number) => {
    const u = interpolate(frame, [a0, a1], [0, 1], clamp);
    if (frame < a0 || frame > a1 + 4) return null;
    return (
      <circle
        cx={x0 + (x1 - x0) * u}
        cy={y0 + (y1 - y0) * u}
        r={14}
        fill={palette.highlight}
        opacity={interpolate(frame, [a1, a1 + 4], [1, 0], clamp)}
      />
    );
  };
  const earX = 1080 - 150;
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity: fade }}>
      <polyline
        points={wavePts(sx, sy, ex, ey, 46, ph)}
        fill="none"
        stroke={palette.heat}
        strokeWidth={7}
        strokeLinecap="round"
      />
      {frame >= NOISE_HEARD ? (
        <circle
          cx={mx}
          cy={my}
          r={interpolate(frame, [NOISE_HEARD, NOISE_HEARD + 12], [10, 60], clamp)}
          fill="none"
          stroke={palette.highlight}
          strokeWidth={5}
          opacity={interpolate(frame, [NOISE_HEARD, NOISE_HEARD + 12], [1, 0], clamp)}
        />
      ) : null}
      {pulse(NOISE_HEARD + 2, NOISE_HEARD + 14, mx, my, cx, cy)}
      {pulse(NOISE_HEARD + 14, ANTI, cx, cy, dx, dy)}
      {/* kulak tarafı: sızan gürültü + ters dalga + toplam */}
      <g opacity={leak}>
        <polyline
          points={wavePts(tx + 20, ty, earX, ty, 40 * residual, ph)}
          fill="none"
          stroke={palette.heat}
          strokeWidth={6}
          opacity={0.5 + 0.5 * residual}
        />
      </g>
      <g opacity={anti * residual}>
        <polyline
          points={wavePts(tx + 20, ty, earX, ty, 40, ph, -1)}
          fill="none"
          stroke={palette.elec}
          strokeWidth={6}
        />
      </g>
      {frame >= SILENT - 6 ? (
        <polyline
          points={`${tx + 20},${ty} ${earX},${ty}`}
          fill="none"
          stroke="white"
          strokeWidth={7}
          strokeLinecap="round"
          opacity={interpolate(frame, [SILENT - 6, SILENT], [0, 1], clamp)}
        />
      ) : null}
    </svg>
  );
};

/** Canlı dalga paneli: gürültü + karşı dalga = 0. */
const WavePanel: React.FC = () => {
  const frame = useCurrentFrame();
  const from = ANC[0] + 14;
  const until = ANC[1];
  if (frame < from || frame > until) return null;
  const W = 760;
  const ph = frame * 9;
  const row = (y: number, sign: number, amp: number, color: string) => {
    const pts: string[] = [];
    for (let x = 0; x <= W - 260; x += 5) {
      pts.push(`${x + 230},${(y + sign * noise(x * 1.6 - ph) * amp).toFixed(1)}`);
    }
    return <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" />;
  };
  const anti = interpolate(frame, [ANTI, ANTI + 10], [0, 1], clamp);
  const sum = interpolate(frame, [ANTI + 4, SILENT], [1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const label = (y: number, text: string, color: string, op = 1) => (
    <text x={20} y={y + 10} fill={color} opacity={op} fontFamily={fonts.body} fontWeight={700} fontSize={30}>
      {text}
    </text>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        top: 1236,
        width: W,
        height: 270,
        borderRadius: 22,
        background: palette.panel,
        border: `3px solid ${palette.accent}`,
        boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
        opacity: interpolate(frame, [from, from + 8, until - 8, until], [0, 1, 1, 0], clamp),
        translate: interpolate(frame, [from, from + 12], ["0px 40px", "0px 0px"], { ...clamp, easing: pop }),
      }}
    >
      <svg width={W} height={270} style={{ position: "absolute", inset: 0 }}>
        {label(52, "Gürültü", palette.heat)}
        {row(52, 1, 26, palette.heat)}
        {label(128, "Ters dalga", palette.elec, anti)}
        <g opacity={anti}>{row(128, -1, 26, palette.elec)}</g>
        {label(204, "= Toplam", "white", anti)}
        <g opacity={anti}>{row(204, 1, 26 * sum, sum < 0.05 ? palette.highlight : "white")}</g>
        {frame >= SILENT ? (
          <text
            x={W - 28}
            y={196}
            textAnchor="end"
            fill={palette.highlight}
            fontFamily={fonts.display}
            fontWeight={900}
            fontSize={38}
            opacity={interpolate(frame, [SILENT, SILENT + 6], [0, 1], clamp)}
          >
            0 🤫
          </text>
        ) : null}
        <text x={20} y={258} fill={palette.muted} fontFamily={fonts.body} fontWeight={600} fontSize={22} opacity={anti}>
          İç mikrofon kulakta kalanı dinleyip düzeltir
        </text>
      </svg>
    </div>
  );
};

export const KulaklikIcinde: React.FC = () => {
  const s = 36; // etiket boyutu
  const l1 = (i: number) => L1 + i * L1_STEP;
  const u1 = (i: number) => Math.min(l1(i) + 58, BRIDGE[0] + 6);
  const l2 = (i: number) => L2 + i * L2_STEP;
  const u2 = (i: number) => Math.min(l2(i) + 62, TL.MERGE[0]);

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bgOuter }}>
      <Background />
      <Render3D />
      <TopShade />
      <Hook />

      {/* 1. seviye: kulaklığın parçaları */}
      <HudLabel anchor="tip" index="1" dx={-120} dy={0} from={l1(0)} until={u1(0)} size={s} sub="silikon">
        Kulak ucu
      </HudLabel>
      <HudLabel anchor="driver" index="2" dx={130} dy={-20} from={l1(1)} until={u1(1)} size={s} sub="sürücüsü">
        Hoparlör
      </HudLabel>
      <HudLabel anchor="innermic" index="3" dx={-160} dy={30} from={l1(2)} until={u1(2)} size={s} sub="kulaktaki sesi dinler">
        İç mikrofon
      </HudLabel>
      <HudLabel anchor="battery" index="4" dx={140} dy={0} from={l1(3)} until={u1(3)} size={s} sub="düğme pil">
        Pil
      </HudLabel>
      <HudLabel anchor="chip" index="5" dx={-170} dy={-40} from={l1(4)} until={u1(4)} size={s} sub="sesi işler">
        Çip
      </HudLabel>
      <HudLabel anchor="outermic" index="6" dx={-25} dy={110} from={l1(5)} until={u1(5)} size={s} sub="gürültüyü duyar">
        Dış mikrofon
      </HudLabel>
      <HudLabel anchor="antenna" index="7" dx={-20} dy={150} from={l1(6)} until={u1(6)} size={s} sub="Bluetooth">
        Anten
      </HudLabel>
      <HudLabel anchor="sensor" index="8" dx={-230} dy={80} from={l1(7)} until={u1(7)} size={s} sub="sık → kontrol et">
        Basınç sensörü
      </HudLabel>
      <HudLabel anchor="contacts" index="9" dx={-300} dy={0} from={l1(8)} until={u1(8)} size={s} sub="kontakları">
        Şarj
      </HudLabel>
      <Caption from={BRIDGE[0]} until={BRIDGE[1]} top={150} size={44}>
        Sesi yapan parça: <Hl>hoparlör sürücüsü</Hl>.
        <br />
        İçine bakalım 👇
      </Caption>

      {/* 2. seviye: sürücünün parçaları */}
      <HudLabel anchor="d_grille" index="A" dx={150} dy={-120} from={l2(0)} until={u2(0)} size={s} sub="korur">
        Izgara
      </HudLabel>
      <HudLabel anchor="d_diaph" index="B" dx={180} dy={-110} from={l2(1)} until={u2(1)} size={s} sub="havayı iter">
        Diyafram
      </HudLabel>
      <HudLabel anchor="d_coil" index="C" dx={200} dy={-120} from={l2(2)} until={u2(2)} size={s} sub="elektrik → hareket">
        Ses bobini
      </HudLabel>
      <HudLabel anchor="d_magnet" index="D" dx={200} dy={-150} from={l2(3)} until={u2(3)} size={s} sub="bobini iter-çeker">
        Mıknatıs
      </HudLabel>
      <HudLabel anchor="d_basket" index="E" dx={-60} dy={-150} from={l2(4)} until={u2(4)} size={s} sub="hepsini tutar">
        Çerçeve
      </HudLabel>

      {/* mekanizma: sesi görmek */}
      <SoundRings />
      <Caption from={MECH[0] - 8} until={MECH[1]} top={160} size={42}>
        <Hl color={palette.elec}>⚡ Elektrik sinyali</Hl> bobini
        <br />
        mıknatısın içinde <Hl>ileri-geri</Hl> iter…
        <Later at={MECH[0] + 28}>
          …diyafram havayı iter → <Hl>SES</Hl> 🔊
        </Later>
      </Caption>
      <HearingCounter />

      {/* gürültü engelleme */}
      <AncWaves />
      <Caption from={ANC[0] + 2} until={ANTI + 2} top={150} size={42}>
        Peki <Hl>gürültü engelleme</Hl>? 🤔
        <br />
        Dış mikrofon gürültüyü duyar…
      </Caption>
      <Caption from={ANTI + 2} until={ANC[1]} top={150} size={42}>
        …çip tam <Hl>TERSİ</Hl> bir dalga üretir.
        <Later at={SILENT - 4}>
          Toplanınca: düz çizgi = <Hl>sessizlik</Hl> 🤫
        </Later>
      </Caption>
      <WavePanel />

      {/* dönüş + kapanış */}
      <Caption from={TL.RETURN[0] + 4} until={CTA[0] - 2} top={160} size={42}>
        Gürültü engelleme sinyali
        <br />
        <Hl>saniyede 200 kez</Hl> yeniden ayarlanır
        <div style={{ fontSize: 26, marginTop: 8, color: palette.muted }}>
          (1. nesil AirPods Pro tipi kulaklık)
        </div>
      </Caption>
      <HudLabel anchor="case" index="★" dx={60} dy={120} from={TL.RETURN[0] + 14} until={CTA[0]} size={s} sub="mıknatısla tutar, şarj eder">
        Şarj kutusu
      </HudLabel>
      <Caption from={CTA[0]} until={CTA[1]} top={220} size={64}>
        Sıradaki nesne
        <br />
        <Hl>ne olsun?</Hl>
        <div style={{ fontSize: 38, marginTop: 12, color: palette.muted }}>
          Yorumlara yaz 👇
        </div>
      </Caption>

      {/* müzik + efektler (ilk 5 sn yalnız müzik) */}
      <Audio src={sfx("music.wav")} volume={0.42} />
      <Audio src={sfx("drive.wav")} volume={0.2} />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <Audio key={`a${i}`} src={sfx("pop.wav")} from={l1(i)} premountFor={30} volume={0.32} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <Audio key={`b${i}`} src={sfx("pop.wav")} from={l2(i)} premountFor={30} volume={0.32} />
      ))}
      <Audio src={sfx("thump.wav")} from={TL.DIVE[0] + 2} premountFor={30} volume={0.35} />
      <Audio src={sfx("thump.wav")} from={TL.HERO_EX[0]} premountFor={30} volume={0.3} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <Audio key={`r${i}`} src={sfx("tap.wav")} from={RAIN[0] + 10 + i * 4} premountFor={30} volume={0.22 + (i % 3) * 0.05} />
      ))}
      <Audio src={sfx("seat.wav")} from={TL.SEAT} premountFor={30} volume={0.42} />
      <Audio src={sfx("lid.wav")} from={TL.LID_CLOSE[1] - 3} premountFor={30} volume={0.42} />
      <Audio src={sfx("cta.wav")} from={CTA[0] + 2} premountFor={30} volume={0.28} />
    </AbsoluteFill>
  );
};
