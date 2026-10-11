import { Audio } from "@remotion/media";
import type React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import anchorData from "./anchors.json";
import { fonts, palette } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const pop = Easing.bezier(0.16, 1, 0.3, 1);
const sfx = (f: string) => staticFile(`sfx/${f}`);

// Blender zaman çizelgesi (Remotion karesi r ↔ Blender karesi r + 1)
const M = anchorData.marks;
const B = (f: number) => f - 1;
const T_SKEL = B(M.S2);
const T_FOOT = B(M.S3);
const T_LOCK = B(M.S4);
const T_MIX = B(M.S5);
const T_END = B(M.S6);
const T_LAND = B(M.land);
const FOOT = anchorData.anchors.foot;
export const DURATION = anchorData.frames;

/** Blender'ın şeffaf kare dizisi. */
const Render3D: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Img
      src={staticFile(`frames/${String(frame + 1).padStart(4, "0")}.png`)}
      style={{ position: "absolute", width: 1080, height: 1920 }}
    />
  );
};

/** Klavye bölümünün arka planı: lacivert radyal gradyan + soluk 90 px ızgara. */
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

/** Sert kesmelerde ve kenetlenmede kısa sarsıntı + zoom vuruşu. */
const HITS: [number, number][] = [
  [T_FOOT, 8],
  [T_LOCK, 8],
  [T_LAND, 14],
];
const useShake = () => {
  const frame = useCurrentFrame();
  let x = 0;
  let y = 0;
  let s = 1;
  for (const [at, amp] of HITS) {
    const t = frame - at;
    if (t >= 0 && t < 10) {
      const k = amp * Math.exp(-t / 3);
      x += Math.sin(t * 2.7) * k;
      y += Math.cos(t * 3.3) * k;
      s += 0.035 * Math.exp(-t / 2.5);
    }
  }
  // ilk karede patlama zaten başlamış: hafif zoom-out vuruşu (kanca enerjisi)
  s += 0.05 * Math.exp(-frame / 6);
  return `translate(${x}px, ${y}px) scale(${s})`;
};

const Hl: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => (
  <span style={{ color: palette.highlight }}>{children}</span>
);

/**
 * Büyük başlık: fade yok, anında belirir (ilk karede tam görünür), 5 karede hafif büyüyüp oturur.
 */
const Title: React.FC<{
  readonly from: number;
  readonly until: number;
  readonly lines: React.ReactNode[];
  readonly sizes?: number[];
  readonly top?: number;
}> = ({ from, until, lines, sizes = [74, 104], top = 250 }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= until) return null;
  const t = frame - from;
  const scale = from === 0 ? 1 : interpolate(t, [0, 5], [1.12, 1], { ...clamp, easing: pop });
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 120,
        top,
        textAlign: "center",
        color: "white",
        fontFamily: fonts.display,
        fontWeight: 900,
        lineHeight: 1.04,
        letterSpacing: -1,
        textShadow: "0 6px 24px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.9)",
        scale,
      }}
    >
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: sizes[i] ?? sizes[sizes.length - 1] }}>
          {l}
        </div>
      ))}
    </div>
  );
};

/** Gizli ayağın etrafında atan sarı halka. */
const FootRing: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < T_FOOT + 12 || frame >= T_LOCK) return null;
  const [x, y] = FOOT[frame + 1] ?? [-999, -999];
  if (x < 0) return null;
  const t = frame - (T_FOOT + 12);
  const r = 120 + 10 * Math.sin(t / 4);
  const appear = interpolate(t, [0, 6], [1.6, 1], { ...clamp, easing: pop });
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: 2 * r,
        height: 2 * r,
        borderRadius: "50%",
        border: `8px solid ${palette.highlight}`,
        boxShadow: `0 0 30px ${palette.highlight}`,
        scale: appear,
        opacity: interpolate(t, [0, 3], [0, 1], clamp),
      }}
    />
  );
};

/** 43.252.003.274.489.856.000'a hızla tırmanan sayaç (basamak sayısı büyür, rakamlar döner). */
const TOTAL = "43252003274489856000";
const group = (d: string) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const rolling = (frame: number, u: number) => {
  if (u >= 1) return group(TOTAL);
  const n = Math.max(2, Math.round(2 + u * 18));
  let d = "";
  for (let i = 0; i < n; i++) {
    d += i === 0 ? String(1 + ((frame * 7 + 3) % 9)) : String((frame * (13 + i * 7) + i * 31) % 10);
  }
  return group(d);
};
const Counter: React.FC = () => {
  const frame = useCurrentFrame();
  const from = T_MIX;
  const until = T_END;
  if (frame < from || frame >= until) return null;
  const u = interpolate(frame, [from, from + 46], [0, 1], clamp);
  const str = rolling(frame, u);
  const done = u >= 1;
  const t = frame - (from + 46);
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 120,
        top: 230,
        textAlign: "center",
        fontFamily: fonts.display,
        fontWeight: 900,
        color: "white",
        textShadow: "0 6px 24px rgba(0,0,0,0.85)",
      }}
    >
      <div
        style={{
          fontSize: 50,
          fontVariantNumeric: "tabular-nums",
          color: done ? palette.highlight : "white",
          scale: done ? interpolate(t, [0, 5], [1.15, 1], { ...clamp, easing: pop }) : 1,
        }}
      >
        {str}
      </div>
      <div style={{ fontSize: 88, lineHeight: 1.05, marginTop: 6 }}>
        {done ? <Hl>43 QUINTILLION</Hl> : " "}
      </div>
      <div style={{ fontSize: 56, marginTop: 4 }}>ways to mix it</div>
    </div>
  );
};

/** Sert kesmelerde 3 karelik beyaz parlama (kenetlenme anında daha güçlü). */
const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  let o = 0;
  for (const [at, a] of [
    [T_FOOT, 0.25],
    [T_LOCK, 0.2],
    [T_LAND, 0.35],
  ] as const) {
    const t = frame - at;
    if (t >= 0 && t < 4) o = Math.max(o, a * (1 - t / 4));
  }
  return <AbsoluteFill style={{ background: "white", opacity: o }} />;
};

export const RubikIcinde: React.FC = () => {
  const transform = useShake();
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ transform }}>
        <Render3D />
        <FootRing />
      </AbsoluteFill>
      <Flash />

      <Title
        from={0}
        until={T_SKEL}
        lines={["Why doesn't it", <Hl key="h">FALL APART?</Hl>]}
        sizes={[78, 112]}
      />
      <Title
        from={T_SKEL}
        until={T_FOOT}
        lines={["A hidden", <Hl key="h">skeleton.</Hl>]}
        sizes={[80, 112]}
      />
      <Title
        from={T_FOOT}
        until={T_LOCK}
        lines={["Every piece has a", <Hl key="h">secret foot.</Hl>]}
        sizes={[66, 104]}
      />
      <Title
        from={T_LOCK}
        until={T_MIX}
        lines={[<span key="a">They <Hl>lock</Hl></span>, "each other in."]}
        sizes={[100, 76]}
      />
      <Counter />
      <Title
        from={T_END}
        until={T_LAND}
        lines={["…or just", <Hl key="h">do this 😉</Hl>]}
        sizes={[78, 112]}
      />
      {/* döngü: kenetlenmeden sonra kanca yazısı geri gelir → 0. kareye kesintisiz geçiş */}
      <Title
        from={T_LAND}
        until={DURATION}
        lines={["Why doesn't it", <Hl key="h">FALL APART?</Hl>]}
        sizes={[78, 112]}
      />

      <Audio src={sfx("music.wav")} volume={0.5} />
      {anchorData.snaps.map((f, i) =>
        i % 2 === 0 ? (
          <Sequence key={`s${i}`} from={B(f)} layout="none">
            <Audio src={sfx("snap.wav")} volume={0.4} />
          </Sequence>
        ) : null,
      )}
      <Sequence from={B(M.turn) - 2} layout="none">
        <Audio src={sfx("snap.wav")} volume={0.45} />
      </Sequence>
      {anchorData.scramble.map((f, i) => (
        <Sequence key={`m${i}`} from={B(f) + 5} layout="none">
          <Audio src={sfx("tap.wav")} volume={0.3} />
        </Sequence>
      ))}
      <Sequence from={T_LAND} layout="none">
        <Audio src={sfx("land.wav")} volume={0.55} />
      </Sequence>
    </AbsoluteFill>
  );
};
