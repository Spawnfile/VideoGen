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
const OPEN = TL.OPEN;
const FLY = TL.FLY;
const W2 = TL.W2;
const L2 = TL.L2;
const WRONG_IN = TL.WRONG_IN;
const JAM = TL.JAM;
const WRONG_OUT = TL.WRONG_OUT;
const RIGHT_IN = TL.RIGHT_IN;
const CHECK = TL.CHECK;
const TURN = TL.TURN;
const BACK = TL.BACK;
const TURN1 = TL.TURN1;
const POP = TL.POP;
const FACT1 = TL.FACT1;
const FACT2 = TL.FACT2;
const CTA = TL.CTA;
const END = TL.END;
const CHECK_W = anchorData.checkWrong;
const CHECK_R = anchorData.checkRight;
const WRONG_PIN = 2;

const pad4 = (n: number) => String(n).padStart(4, "0");

/** Lacivert stüdyo; bu bölümde soluk anahtar dişi profili (zikzak) şeritleri. Kayma son karede başa döner. */
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  // 240 px kayma = 2 desen periyodu (120 px) → kare 989'da desen kare 0 ile aynı
  const shift = Math.floor(((frame + 1) * 240) / 990);
  const zig = (y: number, dir: number, op: number) => {
    const pts: string[] = [];
    for (let x = -240; x <= 1320; x += 120) {
      const xx = x + dir * shift;
      pts.push(
        `${xx},${y} ${xx + 22},${y} ${xx + 46},${y + 34} ${xx + 62},${y + 34} ${xx + 86},${y + 8} ${xx + 98},${y + 8} ${xx + 120},${y}`,
      );
    }
    return (
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={`rgba(255,255,255,${op})`}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    );
  };
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
            "radial-gradient(ellipse 60% 48% at 50% 50%, transparent 35%, black 90%)",
        }}
      >
        {zig(330, 1, 0.07)}
        {zig(420, -1, 0.05)}
        {zig(1500, 1, 0.05)}
        {zig(1590, -1, 0.07)}
      </svg>
    </AbsoluteFill>
  );
};

/** Blender kareleri; anahtar deliğine dalışta zoom-punch (dünya 1 → 2), dönüşte ters zoom (2 → 1). */
const Render3D: React.FC = () => {
  const frame = useCurrentFrame();
  let scale = 1;
  let blur = 0;
  if (frame >= FLY[1] - 10 && frame < W2) {
    scale = interpolate(frame, [FLY[1] - 10, W2 - 1], [1, 1.5], {
      ...clamp,
      easing: Easing.in(Easing.quad),
    });
    blur = interpolate(frame, [FLY[1] - 6, W2 - 1], [0, 14], clamp);
  } else if (frame >= W2 && frame < W2 + 12) {
    scale = interpolate(frame, [W2, W2 + 12], [0.72, 1], {
      ...clamp,
      easing: pop,
    });
    blur = interpolate(frame, [W2, W2 + 10], [12, 0], clamp);
  } else if (frame >= BACK - 8 && frame < BACK) {
    scale = interpolate(frame, [BACK - 8, BACK - 1], [1, 0.7], {
      ...clamp,
      easing: Easing.in(Easing.quad),
    });
    blur = interpolate(frame, [BACK - 6, BACK - 1], [0, 12], clamp);
  } else if (frame >= BACK && frame < BACK + 12) {
    scale = interpolate(frame, [BACK, BACK + 12], [1.45, 1], {
      ...clamp,
      easing: pop,
    });
    blur = interpolate(frame, [BACK, BACK + 10], [12, 0], clamp);
  }
  return (
    <Img
      src={staticFile(`frames/${pad4(frame + 1)}.png`)}
      style={{
        position: "absolute",
        width: 1080,
        height: 1920,
        scale,
        filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
      }}
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
        opacity: interpolate(
          frame,
          [from, from + 8, until - 8, until],
          [0, 1, 1, 0],
          clamp,
        ),
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

/** Kanca ve finalde üstte koyu gradyan (yazı okunurluğu); son karede geri gelir → döngü. */
const TopShade: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(
    frame,
    [0, OPEN[0], OPEN[0] + 14, END - 22, END],
    [1, 1, 0, 0, 1],
    clamp,
  );
  if (o <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        opacity: o,
        background:
          "linear-gradient(180deg, rgba(7,10,20,0.92) 0%, rgba(7,10,20,0.7) 20%, rgba(7,10,20,0) 34%)",
      }}
    />
  );
};

/** Kanca: yumuşak merak cümlesi, POV el anahtarı yaklaştırırken. */
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > OPEN[0] + 14) return null;
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
  const body: React.CSSProperties = {
    fontFamily: fonts.body,
    fontSize: 54,
    fontWeight: 700,
  };
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        top: 160,
        textAlign: "center",
        color: "white",
        textShadow: "0 6px 26px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)",
        opacity: interpolate(frame, [OPEN[0], OPEN[0] + 12], [1, 0], clamp),
        scale: interpolate(frame, [OPEN[0], OPEN[0] + 14], [1, 1.2], clamp),
        filter: `blur(${interpolate(frame, [OPEN[0], OPEN[0] + 14], [0, 10], clamp)}px)`,
      }}
    >
      {line(1, "Herkes anahtarın deliğe", body)}
      {line(
        7,
        <Hl>UYDUĞU</Hl>,
        {
          fontFamily: fonts.display,
          fontSize: 104,
          fontWeight: 900,
          lineHeight: 1.0,
          letterSpacing: -2,
        },
      )}
      {line(13, "için açtığını sanır… 🤫", body)}
    </div>
  );
};

/** Retention: "Aslında 5 minik pim karar verir 😉" → sol üste yapışan "🔍 pimleri say n/5" sayacı. */
const PinCounter: React.FC = () => {
  const frame = useCurrentFrame();
  const t0 = 30;
  if (frame < t0 || frame > BACK + 40) return null;
  const docked = interpolate(frame, [OPEN[0], OPEN[0] + 14], [0, 1], {
    ...clamp,
    easing: pop,
  });
  // sayaç: yanlış taramada ✓ olanları sayar, sonra sıfırlanır; doğru taramada 1..5
  let n = 0;
  let wrong = false;
  if (frame >= CHECK_W[0] && frame < WRONG_OUT[1]) {
    n = CHECK_W.filter((t, i) => t <= frame && i !== WRONG_PIN).length;
    wrong = frame >= CHECK_W[WRONG_PIN];
  } else if (frame >= CHECK_R[0]) {
    n = CHECK_R.filter((t) => t <= frame).length;
  }
  const done = n === 5 && !wrong;
  const lastTick = [...CHECK_W, ...CHECK_R].filter((t) => t <= frame).pop() ?? -99;
  const beat = interpolate(frame - lastTick, [0, 3, 8], [1, 1.22, 1], clamp);
  const fade = interpolate(frame, [BACK + 30, BACK + 40], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: interpolate(docked, [0, 1], [540, 40]),
        top: interpolate(docked, [0, 1], [500, 150]),
        translate: `${interpolate(docked, [0, 1], [-50, 0])}% 0`,
        transformOrigin: "left top",
        scale:
          interpolate(frame - t0, [0, 8], [1.4, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 11 }),
          }) *
          interpolate(docked, [0, 1], [1, 0.7]) *
          beat,
        padding: "12px 26px",
        borderRadius: 18,
        border: `3px solid ${done ? palette.ok : wrong ? palette.wrong : palette.highlight}`,
        background: palette.panel,
        color: "white",
        fontFamily: fonts.body,
        fontWeight: 700,
        fontSize: 44,
        whiteSpace: "nowrap",
        opacity: fade,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
      }}
    >
      {docked < 0.5 ? (
        <>
          Aslında <Hl>5 minik pim</Hl> karar verir 😉
        </>
      ) : (
        <>
          🔍 pimleri say:{" "}
          <span
            style={{
              fontFamily: fonts.mono,
              color: done ? palette.ok : wrong ? palette.wrong : palette.highlight,
            }}
          >
            {n}/5 {done ? "✓" : wrong ? "✕" : ""}
          </span>
        </>
      )}
    </div>
  );
};

/** Taramada her pim ayrımının yanında ✓ / ✕ işareti. */
const PinMarks: React.FC<{
  readonly checks: number[];
  readonly until: number;
  readonly wrong: boolean;
}> = ({ checks, until, wrong }) => {
  const frame = useCurrentFrame();
  if (frame < checks[0] || frame > until) return null;
  const fade = interpolate(frame, [until - 8, until], [1, 0], clamp);
  return (
    <svg
      width={1080}
      height={1920}
      style={{ position: "absolute", inset: 0, opacity: fade }}
    >
      {checks.map((t, i) => {
        if (frame < t) return null;
        const bad = wrong && i === WRONG_PIN;
        const [x, y] = at(`gap${i + 1}` as K, frame);
        if (x < -500) return null;
        const u = frame - t;
        const s = interpolate(u, [0, 4, 9], [0.3, 1.25, 1], clamp);
        const col = bad ? palette.wrong : palette.ok;
        const ring = interpolate(u, [0, 14], [18, 70], clamp);
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r={ring}
              fill="none"
              stroke={col}
              strokeWidth={4}
              opacity={interpolate(u, [0, 14], [0.9, 0], clamp)}
            />
            <g transform={`translate(${x} ${y - 300}) scale(${s})`}>
              <circle r={34} fill={palette.panel} stroke={col} strokeWidth={4} />
              <text
                y={14}
                textAnchor="middle"
                fill={col}
                fontFamily={fonts.display}
                fontWeight={900}
                fontSize={42}
              >
                {bad ? "✕" : "✓"}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
};

/** Ölçek şoku çipi. */
const ScaleChip: React.FC = () => {
  const frame = useCurrentFrame();
  const from = W2 + 6;
  const until = L2[0] - 4;
  if (frame < from || frame > until) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 150,
        top: 236,
        padding: "8px 20px",
        borderRadius: 14,
        background: palette.panel,
        border: `3px solid ${palette.highlight}`,
        color: palette.highlight,
        fontFamily: fonts.display,
        fontWeight: 900,
        fontSize: 38,
        opacity: interpolate(
          frame,
          [from, from + 6, until - 8, until],
          [0, 1, 1, 0],
          clamp,
        ),
        scale: interpolate(frame, [from, from + 10], [1.6, 1], {
          ...clamp,
          easing: Easing.spring({ damping: 10 }),
        }),
        transformOrigin: "right center",
      }}
    >
      🔍 anahtar deliğinin içi
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
  return (
    <AbsoluteFill
      style={{
        background: color,
        opacity: interpolate(t, [0, 8], [strength, 0], clamp),
      }}
    />
  );
};

export const KilitIcinde: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: palette.bgOuter }}>
      <Background />
      <Render3D />
      <TopShade />
      <Hook />
      <PinCounter />
      <Flash at={W2} strength={0.3} />
      <Flash at={BACK} strength={0.22} />

      {/* 1. seviye: asma kilidin parçaları */}
      <HudLabel anchor="body" index="1" dx={-200} dy={120} from={110} until={170} sub="pirinç kabuk">
        Gövde
      </HudLabel>
      <HudLabel anchor="shackle" index="2" dx={-170} dy={140} from={124} until={190} sub="shackle">
        U kol
      </HudLabel>
      <HudLabel anchor="cyl1" index="3" dx={200} dy={150} from={172} until={214} sub="anahtarın girdiği kalp">
        Silindir
      </HudLabel>
      <HudLabel anchor="ballL" index="4" dx={40} dy={-330} from={180} until={214} sub="U kolu çentiğinden tutar">
        Kilitleme bilyesi
      </HudLabel>
      <Caption from={FLY[0]} until={FLY[1] - 4} top={1300} size={46}>
        Peki silindir <Hl>doğru anahtarı</Hl>
        <br />
        nasıl tanıyor? 🤔
      </Caption>

      {/* 2. seviye: ölçek şoku + pimler */}
      <ScaleChip />
      <Caption from={W2 + 8} until={L2[0] - 2} top={1300} size={44}>
        Gerçekte bir pim <Hl>≈ 3 mm</Hl> 🤏
        <Sub>şimdi dev sütunların arasındayız 😮</Sub>
      </Caption>
      <HudLabel anchor="plug" index="5" dx={80} dy={220} from={374} until={420} sub="plug · anahtarla döner">
        Silindir
      </HudLabel>
      <HudLabel anchor="keypin2" index="6" dx={60} dy={300} from={410} until={466} sub="anahtara değer">
        Anahtar pimi
      </HudLabel>
      <HudLabel anchor="driver4" index="7" dx={-60} dy={-330} from={412} until={470} sub="driver pin">
        Üst pim
      </HudLabel>
      <HudLabel anchor="spring2" index="8" dx={40} dy={-260} from={426} until={470} sub="pimleri aşağı bastırır">
        Pim yayı
      </HudLabel>
      <HudLabel anchor="gap3" index="9" dx={40} dy={480} from={456} until={510} sub="shear line">
        Kesme çizgisi
      </HudLabel>
      <Caption from={472} until={512} top={230} size={42}>
        Üst pimler çizgiyi <Hl>kesiyor</Hl> → kilitli 🔒
      </Caption>

      {/* ya bu parça olmasaydı? yanlış anahtar */}
      <Caption from={WRONG_IN[0]} until={CHECK_W[0] - 2} top={230} size={46}>
        Ya <Hl color={palette.wrong}>yanlış anahtar</Hl> olsaydı?
        <Sub>deliğe girer ama…</Sub>
      </Caption>
      <PinMarks checks={CHECK_W} until={WRONG_OUT[0]} wrong />
      <Caption from={JAM[0]} until={WRONG_OUT[1]} top={230} size={44}>
        Tek bir pim <Hl color={palette.wrong}>çizgide kalırsa</Hl> ✕
        <Sub>silindir dönmez</Sub>
      </Caption>

      {/* doğru anahtar */}
      <Caption from={RIGHT_IN[0]} until={CHECK_R[0] - 2} top={230} size={46}>
        Şimdi <Hl>doğru anahtar</Hl> 🔑
        <Sub>dişleri her pimi tam yüksekliğe iter</Sub>
      </Caption>
      <PinMarks checks={CHECK_R} until={BACK - 2} wrong={false} />
      <Caption from={CHECK[1] - 4} until={BACK - 2} top={230} size={48}>
        <Hl color={palette.ok}>5/5 hizalandı ✓</Hl>
        <Sub>silindir döner!</Sub>
      </Caption>

      {/* dönüş: asma kilit açılır */}
      <Caption from={BACK + 8} until={FACT1[0] - 2} top={1290} size={42}>
        Silindir dönünce <Hl>kam</Hl> döner →
        <br />
        bilyeler çekilir → <Hl>U kol açılır</Hl> 🔓
      </Caption>
      <Caption from={FACT1[0]} until={FACT1[1]} top={1290} size={44}>
        5 pim × 10 derinlik =
        <br />
        <Hl>100.000</Hl> farklı anahtar 🤯
        <Sub>teorik; üreticiler daha azını kullanır</Sub>
      </Caption>
      <Caption from={FACT2[0]} until={FACT2[1]} top={1290} size={44}>
        Fikir <Hl>binlerce yıllık</Hl> 😉
        <Sub>Antik Mısır'ın ahşap pimli kilidi → Yale, 1860'lar</Sub>
      </Caption>
      <Caption from={CTA[0]} until={CTA[1]} top={190} size={60}>
        Sıradaki nesne
        <br />
        <Hl>ne olsun?</Hl>
        <div style={{ fontSize: 40, marginTop: 14, color: palette.muted }}>
          Yorumlara yaz 👇
        </div>
      </Caption>

      {/* ses: hepsi kendi sentezimiz; sabit perdeli sinüs (riser/whoosh/tiz darbe yok) */}
      <Audio src={sfx("music.wav")} volume={0.85} />
      <Audio src={sfx("pins.wav")} volume={0.42} />
      <Audio src={sfx("thump.wav")} from={W2} premountFor={30} volume={0.28} />
      <Audio src={sfx("thump.wav")} from={BACK} premountFor={30} volume={0.24} />
      {[110, 124, 172, 180, 374, 410, 412, 426, 456].map((f) => (
        <Audio key={`l${f}`} src={sfx("pop.wav")} from={f + 6} premountFor={30} volume={0.24} />
      ))}
      {CHECK_W.map((f, i) =>
        i === WRONG_PIN ? (
          <Audio key={`w${f}`} src={sfx("fail.wav")} from={f} premountFor={30} volume={0.4} />
        ) : (
          <Audio key={`w${f}`} src={sfx("check.wav")} from={f} premountFor={30} volume={0.22} />
        ),
      )}
      {CHECK_R.map((f) => (
        <Audio key={`r${f}`} src={sfx("check.wav")} from={f} premountFor={30} volume={0.24} />
      ))}
      <Audio src={sfx("click.wav")} from={TURN[0] + 2} premountFor={30} volume={0.34} />
      <Audio src={sfx("click.wav")} from={TURN1[0] + 4} premountFor={30} volume={0.3} />
      <Audio src={sfx("unlock.wav")} from={POP[0]} premountFor={30} volume={0.32} />
    </AbsoluteFill>
  );
};
