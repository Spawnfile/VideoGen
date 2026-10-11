import type React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fonts, palette } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);

/** Ortalı panel kabuğu: aşağıdan kayarak gelir, kenarlarda söner. Sağdan 150 px boşluk (TikTok butonları). */
export const Panel: React.FC<{
  readonly from: number;
  readonly until: number;
  readonly top: number;
  readonly children: React.ReactNode;
  readonly width?: number;
}> = ({ from, until, top, children, width = 860 }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > until) return null;
  const a = interpolate(frame, [from, from + 10], [0, 1], { ...clamp, easing: out });
  const z = interpolate(frame, [until - 8, until], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 150,
        top,
        display: "flex",
        justifyContent: "center",
        opacity: a * z,
        translate: `0 ${(1 - a) * 30}px`,
        scale: String(0.96 + 0.04 * a),
      }}
    >
      <div
        style={{
          width,
          padding: "18px 26px",
          borderRadius: 26,
          background: "rgba(7,10,20,0.74)",
          backdropFilter: "blur(8px)",
          border: `3px solid ${palette.accent}`,
          boxShadow: "0 10px 34px rgba(0,0,0,0.45)",
          color: "white",
          fontFamily: fonts.body,
          textAlign: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
};

const Letter: React.FC<{
  readonly ch: string;
  readonly color?: string;
  readonly bg?: string;
  readonly size?: number;
  readonly pop?: number;
}> = ({ ch, color = "white", bg = "rgba(255,255,255,0.08)", size = 40, pop = 1 }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size * 1.2,
      margin: 2,
      borderRadius: 8,
      background: bg,
      color,
      fontFamily: fonts.mono,
      fontWeight: 700,
      fontSize: size * 0.72,
      scale: String(pop),
    }}
  >
    {ch}
  </span>
);

/** s03: makinede yazılan ENIGMA ve lambada yanan gerçek şifre harfleri. */
export const TypeStrip: React.FC<{
  readonly from: number;
  readonly until: number;
  readonly events: { f: number; key: string; out: string }[];
}> = ({ from, until, events }) => {
  const frame = useCurrentFrame();
  return (
    <Panel from={from} until={until} top={230} width={760}>
      {[
        ["Yazılan", (e: { key: string }) => e.key, "white"],
        ["Lambada", (e: { out: string }) => e.out, palette.highlight],
      ].map(([label, pick, color]) => (
        <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 14, margin: "4px 0" }}>
          <span style={{ width: 170, textAlign: "right", fontSize: 30, fontWeight: 700, color: palette.muted }}>
            {label as string}
          </span>
          {events.map((e) => {
            const on = frame >= e.f + 2;
            const p = interpolate(frame, [e.f + 2, e.f + 5, e.f + 9], [1.35, 1.35, 1], clamp);
            return (
              <Letter
                key={e.f}
                ch={on ? (pick as (x: typeof e) => string)(e) : "·"}
                color={color as string}
                size={58}
                pop={on ? p : 1}
              />
            );
          })}
        </div>
      ))}
    </Panel>
  );
};

/** s04: olası ayar sayısı yuvarlanarak gelir. */
export const SettingsCounter: React.FC<{ readonly from: number; readonly roll: [number, number]; readonly until: number; readonly daily: number }> = ({
  from,
  roll,
  until,
  daily,
}) => {
  const frame = useCurrentFrame();
  const DIG = "158962555217826360000";
  const u = interpolate(frame, [roll[0], roll[1]], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const shown = DIG.split("")
    .map((d, i) => {
      const lock = u * DIG.length > i + 0.5;
      return lock ? d : String((Math.floor(frame * 1.7 + i * 7) % 10 + 10) % 10);
    })
    .join("");
  const grouped = shown.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dailyOn = interpolate(frame, [daily, daily + 8], [0, 1], clamp);
  return (
    <Panel from={from} until={until} top={230} width={860}>
      <div style={{ fontSize: 30, fontWeight: 700, color: palette.muted, opacity: dailyOn }}>
        📅 Ayarlar her gün değişiyordu
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontWeight: 700,
          fontSize: 50,
          color: palette.highlight,
          letterSpacing: 1,
          margin: "8px 0 2px",
        }}
      >
        {grouped}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700 }}>
        olası ayar ≈ <span style={{ color: palette.highlight }}>159 kentilyon</span>
      </div>
    </Panel>
  );
};

/** s08: aynı tuş, her basışta başka harf. */
export const PressTape: React.FC<{
  readonly from: number;
  readonly until: number;
  readonly presses: { f: number; out: string }[];
}> = ({ from, until, presses }) => {
  const frame = useCurrentFrame();
  return (
    <Panel from={from} until={until} top={210} width={700}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 18 }}>
        <div>
          {presses.map((p, i) => (
            <Letter key={i} ch="A" size={56} />
          ))}
        </div>
        <span style={{ fontSize: 44, color: palette.muted }}>→</span>
        <div>
          {presses.map((p, i) => {
            const on = frame >= p.f + 3;
            const pop = interpolate(frame, [p.f + 3, p.f + 6, p.f + 10], [1.4, 1.4, 1], clamp);
            return (
              <Letter
                key={i}
                ch={on ? p.out : "·"}
                size={56}
                color={palette.highlight}
                bg={on && frame < p.f + 24 ? "rgba(255,210,63,0.25)" : undefined}
                pop={on ? pop : 1}
              />
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: palette.muted, marginTop: 6 }}>
        Aynı tuş · her basışta başka harf
      </div>
    </Panel>
  );
};

/** s09–s10: reflektör yüzünden hiçbir harf kendisi olamaz. */
export const AhaPanel: React.FC<{ readonly from: number; readonly stamp: number; readonly until: number }> = ({
  from,
  stamp,
  until,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - stamp, fps, config: { damping: 11 } });
  return (
    <Panel from={from} until={until} top={230} width={640}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 20, position: "relative" }}>
        <Letter ch="A" size={96} />
        <span style={{ fontSize: 64, color: palette.muted }}>→</span>
        <Letter ch="A" size={96} color={frame >= stamp ? "rgba(255,255,255,0.4)" : "white"} />
        {frame >= stamp ? (
          <span
            style={{
              position: "absolute",
              right: 92,
              top: -14,
              fontSize: 150,
              lineHeight: 1,
              color: palette.wrong,
              fontWeight: 900,
              scale: String(0.4 + 0.6 * s),
              opacity: Math.min(1, s * 1.5),
              textShadow: "0 4px 18px rgba(0,0,0,0.6)",
            }}
          >
            ✕
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: palette.muted, marginTop: 6 }}>
        Reflektör sinyali hep <span style={{ color: palette.highlight }}>başka</span> bir yoldan geri yollar
      </div>
    </Panel>
  );
};

/** Kısa bilgi çipi (bayrak + metin). */
export const Chip: React.FC<{
  readonly from: number;
  readonly until: number;
  readonly top: number;
  readonly children: React.ReactNode;
}> = ({ from, until, top, children }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > until) return null;
  const a = interpolate(frame, [from, from + 10], [0, 1], { ...clamp, easing: out });
  const z = interpolate(frame, [until - 8, until], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 150,
        top,
        display: "flex",
        justifyContent: "center",
        opacity: a * z,
        translate: `${(1 - a) * -40}px 0`,
      }}
    >
      <div
        style={{
          padding: "14px 26px",
          borderRadius: 999,
          background: "rgba(7,10,20,0.78)",
          border: `3px solid ${palette.accent}`,
          color: "white",
          fontFamily: fonts.body,
          fontWeight: 700,
          fontSize: 36,
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </div>
    </div>
  );
};

// Gerçek simülasyon (blender/rotors.py, I-II-III, UKW-B, başlangıç D-L-U): "ANX" + WETTERBERICHT + "NULL"
const CIPHER = "YFLJFMQYQWRESJVYOIKZ";
const CRIB = "WETTERBERICHT";
const TRUE_OFF = 3;

/** s12–s13: tahmin edilen kelime (hava raporu) şifreli metin boyunca kayar; harfin kendisiyle çakıştığı konum elenir. */
export const CribPanel: React.FC<{
  readonly from: number;
  readonly slide: [number, number];
  readonly bombe: number;
  readonly until: number;
}> = ({ from, slide, bombe, until }) => {
  const frame = useCurrentFrame();
  const n = CIPHER.length - CRIB.length + 1; // 8 konum
  const u = interpolate(frame, [slide[0], slide[1]], [0, n - 1], clamp);
  const off = Math.round(u);
  const done = (k: number) => frame >= slide[0] + ((slide[1] - slide[0]) * (k + 0.6)) / (n - 1) || frame > slide[1];
  const hits = (k: number) => CRIB.split("").flatMap((c, i) => (CIPHER[k + i] === c ? [i] : []));
  const BOX = 36;
  const ROW = CIPHER.length * (BOX + 4); // Letter: genişlik + 2×2 px kenar boşluğu
  const shiftPx = interpolate(u, [0, n - 1], [0, (n - 1) * (BOX + 4)]);
  const survivors = Array.from({ length: n }, (_, k) => k).filter((k) => hits(k).length === 0);
  const bombeOn = frame >= bombe;
  return (
    <Panel from={from} until={until} top={210} width={880}>
      <div style={{ fontSize: 28, fontWeight: 700, color: palette.muted, marginBottom: 6 }}>
        Tahmin: <span style={{ color: palette.highlight }}>WETTERBERICHT</span> = hava raporu
      </div>
      <div style={{ display: "flex", width: ROW, margin: "0 auto" }}>
        {CIPHER.split("").map((c, i) => {
          const hit = frame >= slide[0] && off >= 0 && i - off >= 0 && i - off < CRIB.length && CRIB[i - off] === c;
          return <Letter key={i} ch={c} size={BOX} bg={hit ? "rgba(255,77,94,0.55)" : undefined} />;
        })}
      </div>
      <div style={{ position: "relative", height: BOX * 1.2 + 6, width: ROW, margin: "0 auto" }}>
        <div style={{ position: "absolute", left: shiftPx, top: 0, display: "flex", opacity: frame >= slide[0] - 10 ? 1 : 0 }}>
          {CRIB.split("").map((c, i) => {
            const hit = CIPHER[off + i] === c && frame >= slide[0];
            return <Letter key={i} ch={c} size={BOX} color={hit ? palette.wrong : palette.highlight} bg="rgba(255,210,63,0.12)" />;
          })}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 8 }}>
        {Array.from({ length: n }, (_, k) => {
          const shown = done(k) && frame >= slide[0];
          const bad = hits(k).length > 0;
          const isTrue = bombeOn && k === TRUE_OFF;
          return (
            <span
              key={k}
              style={{
                width: 70,
                padding: "4px 0",
                borderRadius: 10,
                fontSize: 28,
                fontWeight: 700,
                background: !shown ? "rgba(255,255,255,0.06)" : bad ? "rgba(255,77,94,0.3)" : isTrue ? "rgba(75,224,138,0.45)" : "rgba(75,224,138,0.18)",
                color: !shown ? palette.muted : bad ? palette.wrong : palette.ok,
              }}
            >
              {!shown ? k + 1 : bad ? "✕" : "✓"}
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: bombeOn ? "white" : palette.muted }}>
        {bombeOn ? `🔄 Bombe: kalan ${survivors.length} konumu tarıyor` : "Bir harf kendisiyle çakışırsa → o konum imkânsız"}
      </div>
    </Panel>
  );
};
