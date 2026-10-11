import type React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import words from "./captions.json";
import { fonts, palette } from "./theme";

/** captions.json: tts/say.py'nin ürettiği kelime zamanları (kare, senaryodaki doğru yazım). */
type Word = { id: string; text: string; start: number; end: number };
type Page = { words: Word[]; from: number; until: number };

const W = words as Word[];
const MAX_WORDS = 4;

/** Cümle içinde 2–4 kelimelik parçalar; noktalama sonrası böl, tek kelime artığı önceki parçaya eklenir. */
const buildPages = (): Page[] => {
  const pages: Word[][] = [];
  const sentences = new Map<string, Word[]>();
  for (const w of W) {
    sentences.set(w.id, [...(sentences.get(w.id) ?? []), w]);
  }
  for (const ws of sentences.values()) {
    let cur: Word[] = [];
    const flush = () => {
      if (cur.length) pages.push(cur);
      cur = [];
    };
    ws.forEach((w, i) => {
      cur.push(w);
      const rest = ws.length - i - 1;
      const punct = /[,;:?.!]$/.test(w.text);
      if ((punct && cur.length >= 2 && rest !== 1) || cur.length >= MAX_WORDS) {
        if (rest === 1) return; // son kelime yalnız kalmasın
        flush();
      }
    });
    flush();
  }
  return pages.map((ws, i) => {
    const next = pages[i + 1];
    const last = ws[ws.length - 1];
    const gapEnd = next ? next[0].start - 1 : last.end + 12;
    return {
      words: ws,
      from: ws[0].start - 3,
      until: Math.min(gapEnd, last.end + 14),
    };
  });
};

const PAGES = buildPages();
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Kanalın yeni imzası: karaoke altyazı. top: kutunun üst kenarı (px). */
export const Karaoke: React.FC<{ readonly top: number }> = ({ top }) => {
  const frame = useCurrentFrame();
  const page = PAGES.find((p) => frame >= p.from && frame <= p.until);
  if (!page) return null;
  const enter = interpolate(frame, [page.from, page.from + 5], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const exit = interpolate(frame, [page.until - 4, page.until], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 150,
        top,
        display: "flex",
        justifyContent: "center",
        opacity: enter * exit,
        translate: `0 ${(1 - enter) * 18}px`,
      }}
    >
      <div
        style={{
          maxWidth: 860,
          padding: "16px 28px 20px",
          borderRadius: 24,
          background: "rgba(7, 10, 20, 0.66)",
          backdropFilter: "blur(6px)",
          textAlign: "center",
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 66,
          lineHeight: 1.18,
          color: "white",
          textShadow: "0 3px 10px rgba(0,0,0,0.55)",
        }}
      >
        {page.words.map((w, i) => {
          const active = frame >= w.start && frame < (page.words[i + 1]?.start ?? page.until + 1);
          const said = frame >= w.start;
          const pop = interpolate(frame, [w.start, w.start + 3, w.start + 8], [1, 1.12, 1], clamp);
          return (
            <span
              key={`${w.id}-${i}`}
              style={{
                display: "inline-block",
                margin: "0 0.2em",
                color: active ? palette.highlight : said ? "white" : "rgba(255,255,255,0.78)",
                scale: active ? String(pop) : "1",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
