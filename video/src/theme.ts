// アプリ（app/web/src/styles/tokens.css）と同じ色と書体
import { loadFont as loadHead } from "@remotion/google-fonts/ZenMaruGothic";
import { loadFont as loadBody } from "@remotion/google-fonts/BIZUDPGothic";

export const head = loadHead("normal", { weights: ["700", "900"] }).fontFamily;
export const body = loadBody("normal", { weights: ["400", "700"] }).fontFamily;

export const C = {
  paper: "#F7F3EA",
  card: "#FFFDF8",
  sand: "#EEE7D8",
  line: "#D9D2C3",
  ink: "#1E2A3A",
  ink2: "#3A4552",
  muted: "#5B6572",
  orange: "#E27A3F",
  orangeSoft: "#FBE6D8",
  teal: "#1FA39F",
  tealSoft: "#D9F0EE",
};

export const FPS = 30;
export const W = 1920;
export const H = 1080;
/** シーンのあいだの溶け込み（フレーム） */
export const FADE = 12;
