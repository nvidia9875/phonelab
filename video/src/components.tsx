import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { body, C, head } from "./theme";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

/** 紙の地と細かい点 */
export const Paper: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <AbsoluteFill
    style={{
      background: dark ? C.ink : C.paper,
      backgroundImage: `radial-gradient(${dark ? "rgba(255,255,255,0.06)" : "rgba(30,42,58,0.05)"} 1.5px, transparent 1.5px)`,
      backgroundSize: "26px 26px",
      fontFamily: body,
      color: dark ? "#fff" : C.ink,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** 下の字幕。少し遅れて下から出る */
export const Caption: React.FC<{ text: string; sub?: string }> = ({ text, sub }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const inP = interpolate(frame, [6, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const outP = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 120,
        right: 120,
        bottom: 56,
        display: "flex",
        justifyContent: "center",
        opacity: inP * outP,
        transform: `translateY(${(1 - inP) * 24}px)`,
      }}
    >
      <div
        style={{
          background: "rgba(30,42,58,0.92)",
          color: "#fff",
          borderRadius: 18,
          padding: "18px 30px",
          maxWidth: 1500,
          textAlign: "center",
          boxShadow: "0 6px 0 rgba(30,42,58,0.25)",
        }}
      >
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 40, lineHeight: 1.4, letterSpacing: "0.02em" }}>{text}</div>
        {sub ? <div style={{ fontSize: 26, color: "#C9D3DE", marginTop: 6, lineHeight: 1.5 }}>{sub}</div> : null}
      </div>
    </div>
  );
};

/** 右下の小さなロゴ */
export const Logo: React.FC = () => (
  <div style={{ position: "absolute", right: 44, top: 36, fontFamily: head, fontWeight: 900, fontSize: 28, color: C.ink, opacity: 0.85 }}>
    PhoneLab
  </div>
);

/** 場面の見出し（左上） */
export const Kicker: React.FC<{ text: string; color?: string }> = ({ text, color = C.orange }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp", easing: ease });
  return (
    <div style={{ position: "absolute", left: 80, top: 44, opacity: p, transform: `translateX(${(1 - p) * -20}px)` }}>
      <span style={{ fontFamily: head, fontWeight: 900, fontSize: 30, color, letterSpacing: "0.1em" }}>{text}</span>
    </div>
  );
};

/** スマホの枠に画面のスクショ。縦に長いときは scroll（0〜1）の範囲でゆっくり送る */
export const Phone: React.FC<{
  src: string;
  imgH: number;
  x?: number;
  scroll?: [number, number];
  focusZoom?: number;
}> = ({ src, imgH, x = 960, scroll = [0, 0], focusZoom = 1 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const innerW = 420;
  const innerH = 860;
  const scale = innerW / 400;
  const maxShift = Math.max(0, imgH * scale - innerH);
  const s = interpolate(frame, [12, durationInFrames - 12], scroll, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const zoom = interpolate(frame, [0, durationInFrames], [1, focusZoom], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: x - (innerW + 36) / 2,
        top: 70 + (1 - enter) * 60,
        opacity: enter,
        width: innerW + 36,
        height: innerH + 36,
        borderRadius: 64,
        background: C.ink,
        padding: 18,
        boxShadow: "0 30px 60px rgba(30,42,58,0.25), 0 8px 0 rgba(30,42,58,0.9)",
        transform: `scale(${zoom})`,
        transformOrigin: "50% 40%",
      }}
    >
      <div style={{ width: innerW, height: innerH, borderRadius: 48, overflow: "hidden", background: C.paper, position: "relative" }}>
        <Img src={staticFile(src)} style={{ width: innerW, position: "absolute", top: -maxShift * s }} />
      </div>
    </div>
  );
};

/** PC のブラウザ枠 */
export const Browser: React.FC<{ src: string; imgW: number; imgH: number; x: number; w: number; h: number; scroll?: [number, number]; zoom?: [number, number]; origin?: string }> = ({
  src,
  imgW,
  imgH,
  x,
  w,
  h,
  scroll = [0, 0],
  zoom = [1, 1],
  origin = "50% 0%",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const bar = 44;
  const scale = w / imgW;
  const maxShift = Math.max(0, imgH * scale - (h - bar));
  const s = interpolate(frame, [12, durationInFrames - 12], scroll, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const z = interpolate(frame, [0, durationInFrames], zoom, { extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 110 + (1 - enter) * 50,
        opacity: enter,
        width: w,
        height: h,
        borderRadius: 18,
        overflow: "hidden",
        background: C.card,
        border: `3px solid ${C.ink}`,
        boxShadow: "0 30px 60px rgba(30,42,58,0.2), 0 6px 0 rgba(30,42,58,0.9)",
      }}
    >
      <div style={{ height: bar, background: C.ink, display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
        {["#E27A3F", "#F2C14E", "#1FA39F"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        <div style={{ marginLeft: 16, flex: 1, height: 24, borderRadius: 12, background: "#2C3B50", color: "#C9D3DE", fontSize: 15, display: "flex", alignItems: "center", padding: "0 14px" }}>
          教員画面 ／ 学級 DEMO-2026
        </div>
      </div>
      <div style={{ position: "relative", width: w, height: h - bar, overflow: "hidden" }}>
        <div style={{ transform: `scale(${z})`, transformOrigin: origin, width: w, height: h - bar }}>
          <Img src={staticFile(src)} style={{ width: w, position: "absolute", top: -maxShift * s }} />
        </div>
      </div>
    </div>
  );
};

/** 実写・画面録画を差し込む場所 */
export const Slot: React.FC<{ kind: "実写" | "画面録画"; what: string; seconds: number; x?: number; y?: number; w?: number; h?: number }> = ({
  kind,
  what,
  seconds,
  x = 80,
  y = 110,
  w = 1760,
  h = 740,
}) => {
  const frame = useCurrentFrame();
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(frame / 18));
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 26,
        border: `4px dashed ${C.orange}`,
        background: `repeating-linear-gradient(135deg, ${C.card}, ${C.card} 22px, #FCEFE4 22px, #FCEFE4 44px)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        textAlign: "center",
        padding: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: "#D9453A", opacity: pulse }} />
        <span style={{ fontFamily: head, fontWeight: 900, fontSize: 34, color: "#B85C2A", letterSpacing: "0.08em" }}>ここに{kind}（{seconds} 秒）</span>
      </div>
      <div style={{ fontFamily: head, fontWeight: 700, fontSize: w > 1000 ? 46 : 32, lineHeight: 1.45, color: C.ink, maxWidth: w - 120 }}>{what}</div>
    </div>
  );
};

/** 図をゆっくり寄せる・送る */
export const Diagram: React.FC<{ src: string; from: [number, number, number]; to: [number, number, number] }> = ({ src, from, to }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { easing: Easing.inOut(Easing.cubic) });
  const [s, x, y] = from.map((v, i) => v + (to[i] - v) * t);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={staticFile(src)} style={{ position: "absolute", width: 1920 * s, left: x, top: y }} />
    </AbsoluteFill>
  );
};

/** 大きな数字（カウントアップ） */
export const Stat: React.FC<{ value: number; suffix?: string; prefix?: string; label: string; note: string; delay: number; color: string }> = ({
  value,
  suffix = "",
  prefix = "",
  label,
  note,
  delay,
  color,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const n = Math.round(interpolate(frame - delay, [0, 24], [0, value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <div style={{ width: 400, opacity: p, transform: `translateY(${(1 - p) * 40}px)`, background: C.card, border: `3px solid ${color}`, boxShadow: `0 6px 0 ${color}`, borderRadius: 24, padding: "30px 28px" }}>
      <div style={{ fontFamily: head, fontWeight: 700, fontSize: 26, color: C.muted }}>{label}</div>
      <div style={{ fontFamily: head, fontWeight: 900, fontSize: 104, color, lineHeight: 1.15 }}>
        {prefix}
        {n.toLocaleString()}
        <span style={{ fontSize: 44 }}>{suffix}</span>
      </div>
      <div style={{ fontSize: 22, color: C.ink2, lineHeight: 1.5 }}>{note}</div>
    </div>
  );
};

/** 文字だけの大きな見出し（1 行ずつ出る） */
export const BigLines: React.FC<{ lines: string[]; dark?: boolean; size?: number }> = ({ lines, dark, size = 76 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 160px", gap: 18 }}>
      {lines.map((l, i) => {
        const p = spring({ frame: frame - i * 14, fps, config: { damping: 200 } });
        return (
          <div key={l} style={{ fontFamily: head, fontWeight: 900, fontSize: size, lineHeight: 1.35, color: dark ? "#fff" : C.ink, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
            {l}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** 右側の大きな説明（スマホの画面の場面で、字幕の代わり） */
export const Side: React.FC<{ title: string; sub?: string; x?: number; y?: number; w?: number; color?: string }> = ({ title, sub, x = 1060, y = 0, w = 780, color = C.ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const b = spring({ frame: frame - 20, fps, config: { damping: 200 } });
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: y ? undefined : 1080, display: "flex", flexDirection: "column", justifyContent: "center", gap: 26 }}>
      <div style={{ width: 90, height: 8, borderRadius: 4, background: color, opacity: a }} />
      <div style={{ fontFamily: head, fontWeight: 900, fontSize: 58, lineHeight: 1.4, color: C.ink, opacity: a, transform: `translateX(${(1 - a) * 30}px)` }}>{title}</div>
      {sub ? <div style={{ fontSize: 34, lineHeight: 1.6, color: C.ink2, opacity: b, transform: `translateX(${(1 - b) * 30}px)` }}>{sub}</div> : null}
    </div>
  );
};
