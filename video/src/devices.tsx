// スマホと PC の枠。中にスクショを置き、上に Mark・Tap・Pop・Type を画像の座標（px）で重ねる
import React from "react";
import { Img, OffthreadVideo, staticFile } from "remotion";
import type { Clip } from "./footage";
import { keys, prog, useSpring, useT } from "./anim";
import { C } from "./theme";

const IN_W = 420;
const IN_H = 860;
const IMG_W = 400;
const SCALE = IN_W / IMG_W;

/** スマホ。scroll は [[秒, 0〜1], …]（縦に長いスクショをどこまで送るか） */
export const Phone: React.FC<{
  src: string;
  imgH: number;
  x?: number;
  y?: number;
  scroll?: [number, number][];
  enter?: number;
  exit?: number;
  tilt?: boolean;
  children?: React.ReactNode;
  swapTo?: { src: string; imgH: number; at: number };
  /** スクショの代わりに画面収録を流す */
  video?: Clip;
}> = ({ src, imgH, x = 960, y = 100, scroll = [[0, 0]], enter = 0, exit = 999, tilt = true, children, swapTo, video }) => {
  const t = useT();
  const inS = useSpring(enter);
  const out = prog(t, exit, 0.5);
  const maxShift = Math.max(0, imgH * SCALE - IN_H);
  const shift = keys(t, scroll) * maxShift;
  const swap = swapTo ? prog(t, swapTo.at, 0.45) : 0;
  const rot = tilt ? (1 - inS) * -10 + Math.sin(t * 0.8) * 0.6 : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: x - (IN_W + 36) / 2,
        top: y,
        width: IN_W + 36,
        height: IN_H + 36,
        borderRadius: 64,
        background: C.ink,
        padding: 18,
        boxShadow: "0 40px 70px rgba(30,42,58,0.28), 0 8px 0 rgba(30,42,58,0.9)",
        opacity: inS * (1 - out),
        transform: `translateY(${(1 - inS) * 120 + out * 80}px) rotate(${rot}deg)`,
      }}
    >
      <div style={{ width: IN_W, height: IN_H, borderRadius: 48, overflow: "hidden", background: C.paper, position: "relative" }}>
        {video ? (
          <OffthreadVideo src={staticFile(`footage/${video.file}`)} startFrom={Math.round((video.startFrom ?? 0) * 30)} muted={video.muted ?? true} style={{ position: "absolute", inset: 0, width: IN_W, height: IN_H, objectFit: "cover" }} />
        ) : null}
        <div style={{ position: "absolute", left: 0, top: -shift, width: IMG_W, height: imgH, transform: `scale(${SCALE})`, transformOrigin: "0 0", opacity: video ? 0 : 1 - swap }}>
          <Img src={staticFile(src)} style={{ width: IMG_W, display: "block" }} />
          {children}
        </div>
        {swapTo ? (
          <div style={{ position: "absolute", left: 0, top: 0, width: IMG_W, transform: `scale(${SCALE}) translateY(${(1 - swap) * 40}px)`, transformOrigin: "0 0", opacity: swap }}>
            <Img src={staticFile(swapTo.src)} style={{ width: IMG_W, display: "block" }} />
          </div>
        ) : null}
        {video?.label ? <FootageLabel text={video.label} small top /> : null}
        {/* ノッチ */}
        <div style={{ position: "absolute", left: IN_W / 2 - 60, top: 10, width: 120, height: 26, borderRadius: 14, background: C.ink }} />
      </div>
    </div>
  );
};

/** PC のブラウザ。camera は [[秒, 倍率, 中心x, 中心y], …]（画像の座標） */
export const Browser: React.FC<{
  src: string;
  imgW: number;
  x: number;
  y?: number;
  w: number;
  h: number;
  camera: [number, number, number, number][];
  enter?: number;
  children?: React.ReactNode;
  /** スクショの代わりに画面録画を流す */
  video?: Clip;
}> = ({ src, imgW, x, y = 110, w, h, camera, enter = 0, children, video }) => {
  const t = useT();
  const inS = useSpring(enter);
  const bar = 46;
  const vw = w;
  const vh = h - bar;
  const base = vw / imgW;
  const k = (i: number) => keys(t, camera.map((c) => [c[0], c[i]] as [number, number]));
  const z = k(1);
  const cx = k(2);
  const cy = k(3);
  const s = base * z;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + (1 - inS) * 60,
        width: w,
        height: h,
        borderRadius: 18,
        overflow: "hidden",
        background: C.card,
        border: `3px solid ${C.ink}`,
        boxShadow: "0 40px 70px rgba(30,42,58,0.22), 0 6px 0 rgba(30,42,58,0.9)",
        opacity: inS,
      }}
    >
      <div style={{ height: bar, background: C.ink, display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
        {["#E27A3F", "#F2C14E", "#1FA39F"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        <div style={{ marginLeft: 16, flex: 1, height: 26, borderRadius: 13, background: "#2C3B50", color: "#C9D3DE", fontSize: 15, display: "flex", alignItems: "center", padding: "0 14px" }}>
          教員画面 ／ 学級 DEMO-2026
        </div>
      </div>
      <div style={{ position: "relative", width: vw, height: vh, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: imgW, transformOrigin: "0 0", transform: `translate(${vw / 2}px, ${vh / 2}px) scale(${s}) translate(${-cx}px, ${-cy}px)` }}>
          {video ? (
            <OffthreadVideo src={staticFile(`footage/${video.file}`)} startFrom={Math.round((video.startFrom ?? 0) * 30)} muted={video.muted ?? true} style={{ width: imgW, display: "block" }} />
          ) : (
            <Img src={staticFile(src)} style={{ width: imgW, display: "block" }} />
          )}
          {children}
        </div>
      </div>
    </div>
  );
};

/** 映像の左下の注記（CG・再現など） */
export const FootageLabel: React.FC<{ text: string; small?: boolean; top?: boolean }> = ({ text, small, top }) => (
  <div
    style={{
      position: "absolute",
      left: small ? 14 : 22,
      ...(top ? { top: 46 } : { bottom: small ? 14 : 20 }),
      maxWidth: small ? 360 : undefined,
      padding: small ? "5px 10px" : "6px 14px",
      borderRadius: 999,
      background: "rgba(30,42,58,0.72)",
      color: "#fff",
      fontSize: small ? 15 : 20,
      lineHeight: 1.35,
      fontWeight: 700,
    }}
  >
    {text}
  </div>
);
