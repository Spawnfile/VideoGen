import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

// Seri fontları (klavye ile aynı aile); mono yalnızca sayaç/bit dizisi için.
const inter = loadInter("normal", { weights: ["600", "700"], subsets: ["latin", "latin-ext"] });
const montserrat = loadMontserrat("normal", { weights: ["800", "900"], subsets: ["latin", "latin-ext"] });
const mono = loadMono("normal", { weights: ["700"], subsets: ["latin", "latin-ext"] });

export const fonts = {
  body: inter.fontFamily,
  display: montserrat.fontFamily,
  mono: mono.fontFamily,
};

// Klavye/CPU lacivert stüdyo ailesi; bu bölümde artı (+) ızgara, X-ray camgöbeği ve yalnız kancada damga kırmızısı.
export const palette = {
  accent: "#4d9bff",
  highlight: "#ffd23f",
  elec: "#8fd6ff",
  heat: "#ff8a3d",
  ok: "#4be08a",
  wrong: "#ff4d5e",
  xray: "#8fd6ff",
  muted: "#a9b6d6",
  bgInner: "#1b2c4d",
  bgMid: "#0e1526",
  bgOuter: "#070a14",
  panel: "rgba(10, 16, 34, 0.84)",
};
