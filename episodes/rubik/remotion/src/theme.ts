import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

const inter = loadInter("normal", { weights: ["600", "700"], subsets: ["latin", "latin-ext"] });
const montserrat = loadMontserrat("normal", { weights: ["800", "900"], subsets: ["latin", "latin-ext"] });

export const fonts = {
  body: inter.fontFamily,
  display: montserrat.fontFamily,
};

export const palette = {
  accent: "#3d7bff",
  highlight: "#ffd23f",
  muted: "#a9b6d6",
  bgInner: "#1a2546",
  bgOuter: "#070a14",
};
