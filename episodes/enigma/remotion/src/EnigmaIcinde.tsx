import { Audio } from "@remotion/media";
import type React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import anchorData from "./anchors.json";
import tl from "./timeline.json";
import { HudLabel } from "./HudLabel";
import { Karaoke } from "./Karaoke";
import { AhaPanel, Chip, CribPanel, Panel, PressTape, SettingsCounter, TypeStrip } from "./Panels";
import { fonts, palette } from "./theme";
import capWords from "./captions.json";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const A = anchorData.anchors;
type K = keyof typeof A;
const at = (k: K, f: number) => A[k][Math.max(0, Math.min(Math.round(f), A[k].length - 1))];
const T = anchorData.timeline;
const EV = anchorData.events;
const FRAMES: number = anchorData.frames;
const sfx = (f: string) => staticFile(`sfx/${f}`);
const pad4 = (n: number) => String(n).padStart(4, "0");

/** Kelimenin başlangıç karesi (captions.json). */
const W = (sid: string, text: string, nth = 0) =>
  capWords.filter((w) => w.id === sid && w.text.toLowerCase().startsWith(text.toLowerCase()))[nth].start;
const clipOf = (sid: string) => tl.clips.find((c) => c.id === sid)!;

/** Lacivert stüdyo + soluk ızgara; varyasyon: kayan soluk şifre harfi satırları (son karede başa döner). */
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const rows = [300, 560, 820, 1080, 1340, 1600];
  const groups = "QWXZT EVNRK LMOPA SDFGH JUYIB CXRTE NIGMA BDZGO";
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
          maskImage: "radial-gradient(circle at 50% 45%, black 20%, transparent 75%)",
        }}
      />
      <AbsoluteFill style={{ maskImage: "radial-gradient(ellipse at 50% 50%, black 10%, transparent 72%)" }}>
        {rows.map((y, i) => {
          const dir = i % 2 ? -1 : 1;
          const cycle = 660; // bir grup dizisinin piksel genişliği → son karede tam döngü
          const x = (((frame / FRAMES) * cycle * dir) % cycle) - cycle;
          return (
            <div
              key={y}
              style={{
                position: "absolute",
                top: y,
                left: x,
                whiteSpace: "nowrap",
                fontFamily: fonts.mono,
                fontWeight: 700,
                fontSize: 40,
                letterSpacing: 6,
                color: "rgba(160,200,255,0.06)",
              }}
            >
              {(groups + " ").repeat(5)}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Vuruş anlarında zoom-punch (yalnız 3D katmanı). */
const punch = (frame: number) => {
  const z = T.ZAAF as number;
  const e = T.EXPLODE[0] as number;
  const p1 = interpolate(frame, [z - 2, z + 2, z + 16], [1, 1.06, 1], clamp);
  const p2 = interpolate(frame, [e + 4, e + 8, e + 22], [1, 1.035, 1], clamp);
  return p1 * p2;
};

const Render3D: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Img
      src={staticFile(`frames/${pad4(frame + 1)}.webp`)}
      style={{ position: "absolute", width: 1080, height: 1920, scale: String(punch(frame)) }}
    />
  );
};

/** EEVEE'de bloom yok: yanan lamba penceresinin parıltısı burada (çapadan). */
const LampGlow: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {EV.map((e, i) => {
        if (frame < e.lamp_on - 1 || frame > e.lamp_off + 2) return null;
        const [x, y] = at(`lamp${e.out}` as K, frame);
        if (x < -500) return null;
        const a = interpolate(frame, [e.lamp_on - 1, e.lamp_on + 2, e.lamp_off - 3, e.lamp_off + 2], [0, 1, 1, 0], clamp);
        return (
          <div key={i} style={{ position: "absolute", left: x - 70, top: y - 70, width: 140, height: 140, opacity: a, mixBlendMode: "screen" }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(255,240,170,1) 0%, rgba(255,210,63,0.75) 18%, rgba(255,170,40,0.25) 42%, transparent 70%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: fonts.mono,
                fontWeight: 700,
                fontSize: 34,
                color: "#3a2400",
              }}
            >
              {e.out}
            </div>
          </div>
        );
      })}
    </>
  );
};

/** s06–s07: tuş → priz paneli → rotorlar → reflektör → geri → lamba. Sarı, ilerleyen sinyal çizgisi. */
const SignalPath: React.FC = () => {
  const frame = useCurrentFrame();
  const t0 = T.PRESS_IN as number;
  const lampF = (T.LAMP as number) + 6;
  if (frame < t0 || frame > clipOf("s07").end + 14) return null;
  const fwd: [K, number][] = [
    ["keyA", t0],
    ["plugA", W("s06", "priz")],
    ["etw", W("s06", "ve") + 2],
    ["r2", W("s06", "üç")],
    ["r1", W("s06", "üç") + 6],
    ["r0", W("s06", "rotordan") + 4],
    ["ukw", W("s07", "Reflektörden")],
  ];
  const back: [K, number][] = [
    ["r0", W("s07", "geri")],
    ["r1", W("s07", "geri") + 4],
    ["r2", W("s07", "döner")],
    ["etw", W("s07", "döner") + 5],
    ["plugA", W("s07", "ve") + 2],
    [`lampB` as K, lampF],
  ];
  const pts = [
    ...fwd.map(([k, f]) => ({ p: at(k, frame), f, dy: 0 })),
    ...back.map(([k, f]) => ({ p: at(k, frame), f, dy: 22 })),
  ];
  // ilerleme: kare → kaçıncı noktaya kadar çizildi (ara değer)
  const seg: string[] = [];
  let head: [number, number] | null = null;
  for (let i = 0; i < pts.length; i++) {
    const { p, f, dy } = pts[i];
    const P: [number, number] = [p[0], p[1] + dy];
    if (frame >= f) {
      seg.push(`${P[0]},${P[1]}`);
      head = P;
    } else if (i > 0 && frame >= pts[i - 1].f) {
      const u = (frame - pts[i - 1].f) / (f - pts[i - 1].f);
      const Q = pts[i - 1];
      const q: [number, number] = [Q.p[0], Q.p[1] + Q.dy];
      head = [q[0] + (P[0] - q[0]) * u, q[1] + (P[1] - q[1]) * u];
      seg.push(`${head[0]},${head[1]}`);
      break;
    } else break;
  }
  const fade = interpolate(frame, [clipOf("s07").end, clipOf("s07").end + 14], [1, 0], clamp);
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity: fade }}>
      <polyline points={seg.join(" ")} fill="none" stroke="rgba(255,210,63,0.35)" strokeWidth={18} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={seg.join(" ")} fill="none" stroke={palette.highlight} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
      {head ? <circle cx={head[0]} cy={head[1]} r={13} fill="white" stroke={palette.highlight} strokeWidth={5} /> : null}
    </svg>
  );
};

/** Beyaz flaş (zaaf anı). */
const Flash: React.FC<{ readonly at: number }> = ({ at: f0 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [f0, f0 + 2, f0 + 9], [0, 0.55, 0], clamp);
  return o > 0 ? <AbsoluteFill style={{ background: "white", opacity: o }} /> : null;
};

/** İlk 3 sn: yapay zekâ seslendirme bildirimi (model kartı koşulu). */
const AiBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 4, 84, 96], [0, 1, 1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        top: 160,
        opacity: o,
        padding: "8px 16px",
        borderRadius: 12,
        background: "rgba(7,10,20,0.72)",
        color: "white",
        fontFamily: fonts.body,
        fontWeight: 700,
        fontSize: 26,
      }}
    >
      🔊 Seslendirme: yapay zekâ
    </div>
  );
};

/** Kanca rozeti: merak boşluğu (cevap sonda değil, 26. sn'de). */
const HookBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [6, 14, 140, 152], [0, 1, 1, 0], clamp);
  const s = interpolate(frame, [6, 12, 18], [0.6, 1.08, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 0, right: 150, top: 230, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          padding: "14px 30px",
          borderRadius: 999,
          background: palette.highlight,
          color: "#1a1400",
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 44,
          scale: String(s),
          boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
        }}
      >
        🔒 Zaafı neydi?
      </div>
    </div>
  );
};

const ZaafBadge: React.FC<{ readonly from: number; readonly until: number }> = ({ from, until }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > until) return null;
  const s = interpolate(frame, [from, from + 5, from + 10], [0.5, 1.12, 1], clamp);
  const o = interpolate(frame, [from, from + 4, until - 6, until], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 0, right: 150, top: 560, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          padding: "14px 30px",
          borderRadius: 999,
          background: palette.highlight,
          color: "#1a1400",
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 40,
          scale: String(s),
          boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
          whiteSpace: "nowrap",
        }}
      >
        🔓 ZAAF: hiçbir harf kendisi olamaz
      </div>
    </div>
  );
};

/** Altyazının dikey yeri: varsayılan alt bant; nesnenin kritik kısmı alttaysa üst banda. */
const captionTop = (_f: number) => 1250;

export const EnigmaIcinde: React.FC = () => {
  const frame = useCurrentFrame();
  const main = EV.filter((e) => e.kind === "main");
  const typed = EV.filter((e) => e.kind === "hook" && EV.indexOf(e) >= 2);
  const s04 = clipOf("s04");
  const L = (sid: string, w: string) => W(sid, w) - 2;
  return (
    <AbsoluteFill style={{ background: palette.bgOuter }}>
      <Background />
      <Render3D />
      <LampGlow />
      <SignalPath />

      {/* bağlam + kriz */}
      <TypeStrip from={W("s03", "mesajlarını") - 10} until={clipOf("s03").end + 6} events={typed} />
      <SettingsCounter from={s04.start - 2} roll={[W("s04", "yüz"), W("s04", "kentilyon") + 6]} daily={W("s04", "her")} until={s04.end + 12} />

      {/* içine bakalım: etiketler sesle senkron (aynı anda ≤ 3) */}
      <HudLabel anchor="keys" index="1" from={L("s06", "tuşa")} until={L("s06", "priz") - 1} dx={-170} dy={90} sub="harfi yazarsın">
        Klavye
      </HudLabel>
      <HudLabel anchor="plug" index="2" from={L("s06", "priz")} until={L("s06", "priz") + 76} dx={-260} dy={-170} sub="harf çiftlerini takas eder">
        Priz paneli
      </HudLabel>
      <HudLabel anchor="rotors" index="3" from={L("s06", "üç")} until={L("s07", "Reflektörden") - 2} dx={150} dy={-150} sub="her biri karışık kablolu">
        3 rotor
      </HudLabel>
      <HudLabel anchor="ukw_rim" index="4" from={L("s07", "Reflektörden")} until={L("s07", "Reflektörden") + 74} dx={170} dy={-120} sub="sinyali geri yollar">
        Reflektör
      </HudLabel>
      <HudLabel anchor="lampboard" index="5" from={L("s07", "lambayı")} until={L("s07", "lambayı") + 60} dx={-160} dy={-60} sub="şifreli harf yanar">
        Lamba paneli
      </HudLabel>

      {/* rotor: aynı tuş, başka harf */}
      <PressTape from={W("s08", "Her") - 4} until={clipOf("s08").end + 10} presses={main} />
      <AhaPanel from={W("s09", "Ama") - 2} stamp={W("s09", "dönüşemez") + 2} until={clipOf("s10").end + 6} />
      <Flash at={T.ZAAF as number} />
      <ZaafBadge from={(T.ZAAF as number) + 1} until={clipOf("s10").end + 12} />

      {/* çözüm */}
      <Chip from={W("s11", "Polonyalı") - 2} until={W("s11", "Alan") + 4} top={250}>
        🇵🇱 1932 · Polonyalı matematikçiler
      </Chip>
      <Chip from={W("s11", "Alan") - 2} until={clipOf("s11").end + 10} top={250}>
        🇬🇧 Bletchley Park · Alan Turing ve ekibi
      </Chip>
      <CribPanel
        from={W("s12", "Mesajdaki") - 4}
        slide={[W("s13", "Bir"), W("s13", "elendi") + 12]}
        bombe={W("s13", "Bombe") - 2}
        until={clipOf("s13").end + 10}
      />

      {/* vay */}
      <Panel from={clipOf("s14").start - 2} until={clipOf("s14").end + 10} top={230} width={820}>
        <div style={{ fontSize: 34, fontWeight: 700 }}>📅 25–26 Temmuz 1939 · Varşova yakınları</div>
        <div style={{ fontSize: 40, fontWeight: 700, marginTop: 8 }}>
          🇵🇱 ➜ 🇬🇧 🇫🇷 <span style={{ color: palette.highlight }}>savaştan 5 hafta önce</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: palette.muted, marginTop: 6 }}>
          Polonya yöntemini ve kopya Enigma'ları paylaştı
        </div>
      </Panel>

      {/* CTA */}
      <Chip from={clipOf("s15").start} until={FRAMES - 4} top={250}>
        💬 Sıradaki hikâye? <span style={{ color: palette.highlight }}>Yorumlara yaz 👇</span>
      </Chip>

      <AiBadge />
      <HookBadge />
      <Karaoke top={captionTop(frame)} />

      {/* ses: anlatım + konuşma altında kısılan müzik + sabit perdeli efektler (ilk 2 sn efekt yok) */}
      <Audio src={staticFile("vo/vo.wav")} />
      <Audio src={sfx("music_duck.wav")} volume={0.42} />
      {EV.filter((e) => e.f >= 60).map((e, i) => (
        <Audio key={`k${i}`} src={sfx("key.wav")} from={Math.round(e.f)} premountFor={30} volume={0.22} />
      ))}
      {EV.filter((e) => e.lamp_on >= 60 && e.kind === "main").map((e, i) => (
        <Audio key={`l${i}`} src={sfx("lamp.wav")} from={Math.round(e.lamp_on)} premountFor={30} volume={0.16} />
      ))}
      <Audio src={sfx("thump.wav")} from={(T.EXPLODE[0] as number) + 4} premountFor={30} volume={0.32} />
      <Audio src={sfx("thump.wav")} from={T.DIVE[0] as number} premountFor={30} volume={0.26} />
      {[L("s06", "tuşa"), L("s06", "priz"), L("s06", "üç"), L("s07", "Reflektörden"), L("s07", "lambayı")].map((f, i) => (
        <Audio key={`p${i}`} src={sfx("pop.wav")} from={f + 6} premountFor={30} volume={0.2} />
      ))}
      <Audio src={sfx("no.wav")} from={W("s09", "dönüşemez") + 2} premountFor={30} volume={0.3} />
      <Audio src={sfx("yes.wav")} from={W("s13", "Bombe")} premountFor={30} volume={0.2} />
      <Audio src={sfx("cta.wav")} from={clipOf("s15").start + 2} premountFor={30} volume={0.2} />
      <Audio src={sfx("thump.wav")} from={T.ZAAF as number} premountFor={30} volume={0.28} />
    </AbsoluteFill>
  );
};

