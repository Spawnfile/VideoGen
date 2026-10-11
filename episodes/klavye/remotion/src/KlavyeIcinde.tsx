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
import { Label } from "./Label";
import { fonts, palette } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const pop = Easing.bezier(0.16, 1, 0.3, 1);
const SFX = "https://remotion.media";
const sfx = (f: string) => staticFile(`sfx/${f}`);

// Blender zaman çizelgesi (Remotion karesi r ↔ Blender karesi r + 1)
const TYPED: number[] = anchorData.typed; // harfin dibe indiği kare
const ENTER = anchorData.enter;
const HOOK_CHARS = [
  "İ",
  "Ç",
  "İ",
  "N",
  "D",
  "E",
  " ",
  "N",
  "E",
  " ",
  "V",
  "A",
  "R",
];
const PRESS = [606, 642, 672].map((f) => f + 3); // kontak anı
const RAIN = Array.from({ length: 10 }, (_, i) => 761 + i * 2);

/** Blender'ın şeffaf PNG dizisi. */
const Render3D: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Img
      src={staticFile(`frames/${String(frame + 1).padStart(4, "0")}.png`)}
      style={{ position: "absolute", width: 1080, height: 1920 }}
    />
  );
};

const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 50% 42%, ${palette.bgInner} 0%, #0d1222 55%, ${palette.bgOuter} 100%)`,
    }}
  >
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.045) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.045) 2px, transparent 2px)",
        backgroundSize: "90px 90px",
        maskImage:
          "radial-gradient(circle at 50% 45%, black 20%, transparent 75%)",
      }}
    />
  </AbsoluteFill>
);

/** Vuruş anlarında kısa sarsıntı (Enter, patlama). */
const useShake = () => {
  const frame = useCurrentFrame();
  let x = 0;
  let y = 0;
  for (const [at, amp] of [
    [ENTER, 14],
    [77, 10],
  ] as const) {
    const t = frame - at;
    if (t >= 0 && t < 10) {
      const k = amp * Math.exp(-t / 3);
      x += Math.sin(t * 2.7) * k;
      y += Math.cos(t * 3.3) * k;
    }
  }
  return `translate(${x}px, ${y}px)`;
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
          background: "rgba(7, 10, 20, 0.7)",
          border: "2px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(6px)",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** Kanca: tuşlara basıldıkça yazılan başlık. */
const TypedHook: React.FC = () => {
  const frame = useCurrentFrame();
  const out0 = 82;
  if (frame > out0 + 14) return null;

  const shown = (i: number) => frame >= TYPED[i];
  const ch = (i: number) => {
    const t = frame - TYPED[i];
    if (!shown(i)) return null;
    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          scale: interpolate(t, [0, 5], [1.5, 1], { ...clamp, easing: pop }),
          translate: interpolate(t, [0, 5], ["0px -18px", "0px 0px"], {
            ...clamp,
            easing: pop,
          }),
        }}
      >
        {HOOK_CHARS[i]}
      </span>
    );
  };
  const q = frame - ENTER;
  const lastShown = TYPED.filter((f) => frame >= f).length;
  const cursorOn = frame < ENTER && Math.floor(frame / 7) % 2 === 0;
  const cursor = (
    <span
      style={{ display: "inline-block", width: 0, opacity: cursorOn ? 1 : 0 }}
    >
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 104,
          marginLeft: 8,
          background: palette.highlight,
          verticalAlign: "-10px",
        }}
      />
    </span>
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 50,
        right: 50,
        top: 210,
        textAlign: "center",
        color: "white",
        textShadow: "0 6px 26px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)",
        opacity: interpolate(frame, [out0, out0 + 12], [1, 0], clamp),
        scale: interpolate(frame, [out0, out0 + 14], [1, 1.25], clamp),
        filter: `blur(${interpolate(frame, [out0, out0 + 14], [0, 10], clamp)}px)`,
      }}
    >
      <div
        style={{
          fontFamily: fonts.body,
          fontWeight: 700,
          fontSize: 54,
          marginBottom: 6,
        }}
      >
        Bir klavyenin
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 124,
          lineHeight: 1.04,
          letterSpacing: -2,
          minHeight: 260,
        }}
      >
        <div>
          {[0, 1, 2, 3, 4, 5].map(ch)}
          {lastShown <= 6 ? cursor : null}
        </div>
        <div style={{ color: palette.highlight }}>
          {[7, 8].map(ch)}
          {shown(9) ? " " : ""}
          {[10, 11, 12].map(ch)}
          {q >= 0 ? (
            <span
              style={{
                display: "inline-block",
                scale: interpolate(q, [0, 6], [2.4, 1], {
                  ...clamp,
                  easing: Easing.spring({ damping: 9 }),
                }),
                rotate: `${interpolate(q, [0, 6], [-25, 0], clamp)}deg`,
              }}
            >
              ?
            </span>
          ) : null}
          {lastShown > 6 ? cursor : null}
        </div>
      </div>
    </div>
  );
};

/** Kancada yazının okunması için üstte koyu geçiş. */
const TopShade: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 82, 96], [1, 1, 0], clamp);
  if (o <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        opacity: o,
        background:
          "linear-gradient(180deg, rgba(7,10,20,0.92) 0%, rgba(7,10,20,0.75) 26%, rgba(7,10,20,0) 42%)",
      }}
    />
  );
};

const Flash: React.FC<{ readonly at: number; readonly strength?: number }> = ({
  at,
  strength = 0.35,
}) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 8) return null;
  return (
    <AbsoluteFill
      style={{
        background: "white",
        opacity: interpolate(t, [0, 8], [strength, 0], clamp),
      }}
    />
  );
};

/** Kontak anında yaprakların değdiği noktada elektrik parlaması. */
const Spark: React.FC<{ readonly at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 16) return null;
  const [x, y] = anchorData.anchors.h_contact[frame];
  const a = interpolate(t, [0, 2, 16], [0, 1, 0], clamp);
  const ring = interpolate(t, [0, 14], [20, 260], { ...clamp, easing: pop });
  return (
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
      <div
        style={{
          position: "absolute",
          left: x - 170,
          top: y - 170,
          width: 340,
          height: 340,
          borderRadius: "50%",
          opacity: a,
          background:
            "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(140,215,255,0.85) 16%, rgba(60,140,255,0.35) 40%, rgba(60,140,255,0) 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x - ring / 2,
          top: y - ring / 2,
          width: ring,
          height: ring,
          borderRadius: "50%",
          border: "5px solid rgba(150,220,255,0.9)",
          opacity: a,
        }}
      />
      <svg
        width={1080}
        height={1920}
        style={{ position: "absolute", inset: 0, opacity: a }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const ang = (i / 6) * Math.PI * 2 + at;
          const r0 = 40 + t * 6;
          const r1 = r0 + 46;
          return (
            <line
              key={i}
              x1={x + Math.cos(ang) * r0}
              y1={y + Math.sin(ang) * r0}
              x2={x + Math.cos(ang) * r1}
              y2={y + Math.sin(ang) * r1}
              stroke="#bfe9ff"
              strokeWidth={6}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
};

/** Basış sayacı: her kontakta ekrana bir harf düşer. */
const ScreenLetters: React.FC = () => {
  const frame = useCurrentFrame();
  const from = PRESS[0];
  if (frame < from - 2 || frame > 702) return null;
  const letters = ["H", "E", "Y"];
  const n = PRESS.filter((p) => frame >= p).length;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        translate: "-50% 0",
        top: 372,
        padding: "16px 26px",
        borderRadius: 20,
        background: "rgba(7,10,20,0.78)",
        border: `3px solid ${palette.accent}`,
        fontFamily: fonts.display,
        fontWeight: 900,
        fontSize: 64,
        color: "white",
        opacity: interpolate(
          frame,
          [from - 2, from + 4, 694, 702],
          [0, 1, 1, 0],
          clamp,
        ),
        boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
      }}
    >
      <span
        style={{
          fontFamily: fonts.body,
          fontSize: 30,
          fontWeight: 700,
          color: palette.muted,
          marginRight: 14,
          verticalAlign: "12px",
        }}
      >
        ekran:
      </span>
      {letters.slice(0, n).map((l, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            scale: interpolate(frame - PRESS[i], [0, 6], [1.8, 1], {
              ...clamp,
              easing: pop,
            }),
            color: i === n - 1 ? palette.highlight : "white",
          }}
        >
          {l}
        </span>
      ))}
      <span
        style={{
          opacity: Math.floor(frame / 7) % 2 ? 1 : 0,
          color: palette.highlight,
        }}
      >
        |
      </span>
    </div>
  );
};

export const KlavyeIcinde: React.FC = () => {
  const shake = useShake();
  const labelSize = 42;

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bgOuter }}>
      <Background />
      <AbsoluteFill style={{ transform: shake }}>
        <Render3D />
      </AbsoluteFill>
      <TopShade />
      <Flash at={ENTER} strength={0.28} />
      <TypedHook />

      {/* katmanlar */}
      <Label
        anchor="keycaps"
        dx={60}
        dy={-70}
        side="right"
        from={150}
        until={298}
        size={labelSize}
        sub="61 adet"
      >
        Tuş kapakları
      </Label>
      <Label
        anchor="switch"
        dx={60}
        dy={60}
        side="right"
        from={170}
        until={298}
        size={labelSize}
        sub="her tuşa bir tane"
      >
        Switch'ler
      </Label>
      <Label
        anchor="plate"
        dx={60}
        dy={60}
        side="right"
        from={190}
        until={298}
        size={labelSize}
        sub="pirinç"
      >
        Plaka
      </Label>
      <Label
        anchor="pcb"
        dx={60}
        dy={60}
        side="right"
        from={210}
        until={298}
        size={labelSize}
        sub="devre kartı"
      >
        PCB
      </Label>
      <Label
        anchor="foam"
        dx={60}
        dy={55}
        side="right"
        from={230}
        until={298}
        size={labelSize}
        sub="sesi yumuşatır"
      >
        Köpük
      </Label>
      <Label
        anchor="case"
        dx={60}
        dy={45}
        side="right"
        from={250}
        until={298}
        size={labelSize}
        sub="alüminyum"
      >
        Kasa
      </Label>
      <Caption from={300} until={352} top={150} size={44}>
        Her tuşun altında bir <Hl>switch</Hl> var.
        <br />
        Enter'ınkini açalım 👇
      </Caption>

      {/* Enter switch'i */}
      <Label
        anchor="h_cap"
        dx={-40}
        dy={-110}
        side="left"
        from={452}
        until={556}
        size={labelSize}
      >
        Tuş kapağı
      </Label>
      <Label
        anchor="h_top"
        dx={90}
        dy={-10}
        side="right"
        from={466}
        until={556}
        size={labelSize}
      >
        Üst gövde
      </Label>
      <Label
        anchor="h_stem"
        dx={-150}
        dy={0}
        side="left"
        from={480}
        until={556}
        size={labelSize}
        sub="tuşla birlikte iner"
      >
        Sap
      </Label>
      <Label
        anchor="h_spring"
        dx={130}
        dy={0}
        side="right"
        from={494}
        until={556}
        size={labelSize}
        sub="geri iter"
      >
        Yay
      </Label>
      <Label
        anchor="h_leaves"
        dx={-140}
        dy={0}
        side="left"
        from={508}
        until={556}
        size={labelSize}
        sub="elektrik kontağı"
      >
        Metal yapraklar
      </Label>
      <Label
        anchor="h_bottom"
        dx={170}
        dy={-10}
        side="right"
        from={522}
        until={556}
        size={labelSize}
      >
        Alt gövde
      </Label>

      {/* mekanizma */}
      <Caption from={592} until={638} top={190} size={46}>
        Tuşa basınca <Hl>sap iner</Hl>,
        <br />
        yay sıkışır…
      </Caption>
      <Caption from={640} until={702} top={190} size={46}>
        …iki metal yaprak <Hl>birbirine değer</Hl>.
        <br />
        <Hl color="#8fd6ff">⚡ Devre kapanır</Hl> → harf ekranda!
      </Caption>
      {PRESS.map((p) => (
        <Spark key={p} at={p} />
      ))}
      <ScreenLetters />

      {/* dönüş + kapanış */}
      <Caption from={712} until={788} top={180} size={46}>
        Bir switch <Hl>50 milyondan fazla</Hl>
        <br />
        basışa dayanır
      </Caption>
      <Caption from={795} until={839} top={240} size={66}>
        Sıradaki nesne
        <br />
        <Hl>ne olsun?</Hl>
        <div style={{ fontSize: 40, marginTop: 14, color: palette.muted }}>
          Yorumlara yaz ↓
        </div>
      </Caption>

      {/* müzik + efektler */}
      <Audio src={sfx("music.wav")} volume={0.42} />
      {TYPED.map((f, i) => (
        <Audio
          key={`t${f}`}
          src={sfx(`thock_${(i % 5) + 1}.wav`)}
          from={f - 1}
          premountFor={30}
          volume={0.85}
        />
      ))}
      <Audio
        src={sfx("enter_thock.wav")}
        from={ENTER - 1}
        premountFor={30}
        volume={1}
      />
      <Audio
        src={sfx("impactPlate_light_000.ogg")}
        from={ENTER}
        premountFor={30}
        volume={0.35}
      />
      <Audio
        src={`${SFX}/whoosh.wav`}
        from={74}
        premountFor={30}
        volume={0.8}
      />
      {[78, 82, 86, 90, 94, 98, 102].map((f, i) => (
        <Audio
          key={`p${f}`}
          src={sfx(i % 2 ? "tick_001.ogg" : "tick_002.ogg")}
          from={f}
          premountFor={30}
          volume={0.35}
        />
      ))}
      {[150, 170, 190, 210, 230, 250, 452, 466, 480, 494, 508, 522].map((f) => (
        <Audio
          key={`l${f}`}
          src={sfx("select_001.ogg")}
          from={f}
          premountFor={30}
          volume={0.45}
        />
      ))}
      <Audio
        src={`${SFX}/whoosh.wav`}
        from={343}
        premountFor={30}
        volume={0.7}
      />
      <Audio
        src={`${SFX}/whip.wav`}
        from={403}
        premountFor={30}
        volume={0.45}
      />
      {PRESS.map((p, i) => (
        <Audio
          key={`k${p}`}
          src={sfx(`thock_${i + 1}.wav`)}
          from={p - 1}
          premountFor={30}
          volume={0.9}
        />
      ))}
      {PRESS.map((p) => (
        <Audio
          key={`z${p}`}
          src={sfx("glitch_001.ogg")}
          from={p}
          premountFor={30}
          volume={0.5}
        />
      ))}
      <Audio
        src={`${SFX}/whoosh.wav`}
        from={703}
        premountFor={30}
        volume={0.6}
      />
      {RAIN.map((f, i) => (
        <Audio
          key={`r${f}`}
          src={sfx(`thock_${(i % 5) + 1}.wav`)}
          from={f}
          premountFor={30}
          volume={0.55 + (i % 3) * 0.12}
        />
      ))}
      <Audio
        src={`${SFX}/ding.wav`}
        from={796}
        premountFor={30}
        volume={0.35}
      />
    </AbsoluteFill>
  );
};
