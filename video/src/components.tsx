import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { twoLines } from "./anim";
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
      // 日本語は文節で折り返す（「センサ／ー」「出な／い」のような切れ方をしない）
      wordBreak: "auto-phrase" as React.CSSProperties["wordBreak"],
      lineBreak: "strict",
    }}
    lang="ja"
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
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 40, lineHeight: 1.4, letterSpacing: "0.02em" }}>{twoLines(text)}</div>
        {sub ? <div style={{ fontSize: 26, color: "#C9D3DE", marginTop: 6, lineHeight: 1.5, whiteSpace: "nowrap" }}>{sub}</div> : null}
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
