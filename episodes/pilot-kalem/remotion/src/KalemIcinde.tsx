import { Audio } from "@remotion/media";
import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Label } from "./Label";
import { fonts, palette } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SFX = "https://remotion.media";

/** Blender'ın şeffaf PNG dizisi; Remotion karesi r ↔ Blender karesi r + 1. */
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
    {/* teknik çizim havası veren soluk ızgara */}
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.045) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.045) 2px, transparent 2px)",
        backgroundSize: "90px 90px",
        maskImage: "radial-gradient(circle at 50% 45%, black 20%, transparent 75%)",
      }}
    />
  </AbsoluteFill>
);

type TextBlockProps = {
  readonly from: number;
  readonly until: number;
  readonly top: number;
  readonly children: React.ReactNode;
  readonly size?: number;
};

/** Ekranın ortasında, aşağıdan kayarak gelen açıklama yazısı. */
const Caption: React.FC<TextBlockProps> = ({ from, until, top, children, size = 46 }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > until) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 90,
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
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "18px 30px",
          borderRadius: 24,
          background: "rgba(7, 10, 20, 0.62)",
          backdropFilter: "blur(6px)",
        }}
      >
        {children}
      </div>
    </div>
  );
};

const Hl: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => (
  <span style={{ color: palette.highlight }}>{children}</span>
);

const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = 2.6 * fps;
  if (frame > out) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 250,
        textAlign: "center",
        color: "white",
        textShadow: "0 6px 24px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.9)",
        opacity: interpolate(frame, [out - 8, out], [1, 0], clamp),
      }}
    >
      <div
        style={{
          fontFamily: fonts.body,
          fontWeight: 700,
          fontSize: 52,
          opacity: interpolate(frame, [0, 6], [0, 1], clamp),
        }}
      >
        Bir tükenmez kalemin
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 112,
          lineHeight: 1.05,
          letterSpacing: -2,
          marginTop: 8,
          scale: interpolate(frame, [4, 16], [0.4, 1], { ...clamp, easing: Easing.spring({ damping: 10 }) }),
          opacity: interpolate(frame, [4, 8], [0, 1], clamp),
        }}
      >
        İÇİNDE
        <br />
        <Hl>NE VAR?</Hl>
      </div>
    </div>
  );
};

export const KalemIcinde: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bgOuter }}>
      <Background />
      <Render3D />

      <Hook />

      {/* patlatılmış görünüm etiketleri */}
      <Label anchor="button" dx={120} dy={-10} side="right" from={150} until={425}>
        Buton
      </Label>
      <Label anchor="cam" dx={130} dy={0} side="right" from={172} until={425}>
        Döner mekanizma
      </Label>
      <Label anchor="upper" dx={-90} dy={0} side="left" from={194} until={425}>
        Gövde
      </Label>
      <Label anchor="lower" dx={30} dy={290} side="right" from={216} until={425}>
        Tutma yeri
      </Label>
      <Label anchor="refill" dx={-120} dy={130} side="left" from={238} until={425} sub="(refil)">
        Mürekkep
      </Label>
      <Label anchor="spring" dx={-110} dy={0} side="left" from={260} until={425}>
        Yay
      </Label>
      <Caption from={292} until={425} top={1570} size={42}>
        Her basışta mekanizma <Hl>bir diş döner</Hl>:
        <br />
        uç ya kilitlenir ya da yay onu geri iter.
      </Caption>

      {/* uç yakın çekimi */}
      <Label anchor="ball" dx={-150} dy={0} side="left" from={512} until={600} sub="0,7 mm">
        Çelik bilye
      </Label>
      <Caption from={522} until={600} top={1330}>
        Yazarken bilye <Hl>döner</Hl> ve
        <br />
        mürekkebi kâğıda sürer.
      </Caption>

      {/* kapanış */}
      <Caption from={655} until={719} top={250} size={64}>
        Sıradaki nesne
        <br />
        <Hl>ne olsun?</Hl>
        <div style={{ fontSize: 40, marginTop: 14, color: palette.muted }}>Yorumlara yaz ↓</div>
      </Caption>

      {/* efekt sesleri */}
      <Audio src={`${SFX}/mouse-click.wav`} from={20} premountFor={fps} volume={0.9} />
      <Audio src={`${SFX}/whoosh.wav`} from={66} premountFor={fps} volume={0.7} />
      <Audio src={`${SFX}/switch.wav`} from={156} premountFor={fps} volume={0.25} />
      <Audio src={`${SFX}/switch.wav`} from={178} premountFor={fps} volume={0.25} />
      <Audio src={`${SFX}/switch.wav`} from={200} premountFor={fps} volume={0.25} />
      <Audio src={`${SFX}/switch.wav`} from={222} premountFor={fps} volume={0.25} />
      <Audio src={`${SFX}/switch.wav`} from={244} premountFor={fps} volume={0.25} />
      <Audio src={`${SFX}/switch.wav`} from={266} premountFor={fps} volume={0.25} />
      <Audio src={`${SFX}/whoosh.wav`} from={428} premountFor={fps} volume={0.6} />
      <Audio src={`${SFX}/whoosh.wav`} from={612} premountFor={fps} volume={0.6} />
      <Audio src={`${SFX}/ding.wav`} from={656} premountFor={fps} volume={0.35} />
    </AbsoluteFill>
  );
};
