// 動きの部品。時間は秒で書き、useT() でシーンの中の経過秒を得る
import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, head } from "./theme";

export const ease = Easing.bezier(0.16, 1, 0.3, 1);

export function useT(): number {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return f / fps;
}

/** at 秒から dur 秒かけて 0→1 */
export function prog(t: number, at: number, dur = 0.5, easing = ease): number {
  return interpolate(t, [at, at + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
}

/** at 秒からのばね（0→1、少し行き過ぎる） */
export function useSpring(at: number, bouncy = false): number {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at * fps, fps, config: bouncy ? { damping: 11, stiffness: 160 } : { damping: 200 } });
}

/** 秒のキー [[秒, 値], …] を補間 */
export function keys(t: number, k: [number, number][]): number {
  if (k.length === 1) return k[0][1];
  return interpolate(t, k.map((x) => x[0]), k.map((x) => x[1]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
}

/** 画面の一部を枠で囲む（線が描かれていく）。dim で周りを暗くする */
export const Mark: React.FC<{ x: number; y: number; w: number; h: number; at: number; until?: number; color?: string; dim?: boolean; r?: number; label?: string }> = ({
  x,
  y,
  w,
  h,
  at,
  until = 999,
  color = C.orange,
  dim = false,
  r = 14,
  label,
}) => {
  const t = useT();
  const draw = prog(t, at, 0.6);
  const out = 1 - prog(t, until, 0.3);
  const o = Math.min(prog(t, at, 0.2), out);
  if (o <= 0) return null;
  const pad = 6;
  return (
    <div style={{ position: "absolute", left: x - pad, top: y - pad, width: w + pad * 2, height: h + pad * 2, opacity: o, borderRadius: r, boxShadow: dim ? `0 0 0 3000px rgba(30,42,58,${0.32 * draw})` : undefined }}>
      <svg width={w + pad * 2} height={h + pad * 2} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <rect x={2} y={2} width={w + pad * 2 - 4} height={h + pad * 2 - 4} rx={r} fill="none" stroke={color} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      </svg>
      {label ? (
        <div style={{ position: "absolute", right: -4, top: -30, background: color, color: "#fff", fontFamily: head, fontWeight: 900, fontSize: 15, padding: "3px 10px", borderRadius: 999, opacity: prog(t, at + 0.4, 0.3) }}>{label}</div>
      ) : null}
    </div>
  );
};

/** 指のタップ（丸と波紋） */
export const Tap: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => {
  const t = useT();
  const inP = prog(t, at - 0.35, 0.3);
  const press = 1 - 0.18 * Math.sin(Math.PI * prog(t, at, 0.25, Easing.linear));
  const fadeOut = 1 - prog(t, at + 0.6, 0.3);
  const rings = [0, 0.18];
  if (inP <= 0 || fadeOut <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: Math.min(inP, fadeOut) }}>
      {rings.map((d) => {
        const p = prog(t, at + d, 0.6, Easing.out(Easing.cubic));
        return <div key={d} style={{ position: "absolute", left: -40 * p, top: -40 * p, width: 80 * p, height: 80 * p, borderRadius: "50%", border: `3px solid ${C.orange}`, opacity: 1 - p }} />;
      })}
      <div style={{ position: "absolute", left: -16, top: -16, width: 32, height: 32, borderRadius: "50%", background: "rgba(226,122,63,0.55)", border: "3px solid #fff", boxShadow: "0 4px 12px rgba(30,42,58,0.3)", transform: `scale(${press})` }} />
    </div>
  );
};

/** 画面の一部をいったん隠し、at 秒にぽんと出す（スクショの同じ場所を切り抜いて拡大していく） */
export const Pop: React.FC<{ src: string; imgW: number; x: number; y: number; w: number; h: number; at: number; bg?: string; origin?: string }> = ({
  src,
  imgW,
  x,
  y,
  w,
  h,
  at,
  bg = C.paper,
  origin = "0% 100%",
}) => {
  const s = useSpring(at, true);
  return (
    <>
      <div style={{ position: "absolute", left: x - 2, top: y - 2, width: w + 4, height: h + 4, background: bg }} />
      <div style={{ position: "absolute", left: x, top: y, width: w, height: h, overflow: "hidden", transform: `scale(${0.4 + 0.6 * s})`, transformOrigin: origin, opacity: Math.min(1, s * 1.5) }}>
        <Img src={staticFile(src)} style={{ position: "absolute", left: -x, top: -y, width: imgW }} />
      </div>
    </>
  );
};

/** 欄の文字を 1 文字ずつ打つ（スクショの文字を下地の色で隠して、上から打つ） */
export const Type: React.FC<{ x: number; y: number; w: number; h: number; text: string; from: number; to: number; bg?: string; size?: number; color?: string; family?: string }> = ({
  x,
  y,
  w,
  h,
  text,
  from,
  to,
  bg = C.card,
  size = 15,
  color = C.ink,
  family,
}) => {
  const t = useT();
  const n = Math.floor(interpolate(t, [from, to], [0, text.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const caret = t < to + 0.6 && Math.floor(t * 2.5) % 2 === 0;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, background: bg, fontSize: size, lineHeight: 1.6, color, fontFamily: family, padding: "0 1px" }}>
      {text.slice(0, n)}
      <span style={{ display: "inline-block", width: 2, height: size * 1.15, background: caret ? C.orange : "transparent", verticalAlign: "-3px", marginLeft: 1 }} />
    </div>
  );
};

/** 判子（くるっと回って押される） */
export const Stamp: React.FC<{ text: string; at: number; color?: string; size?: number; rotate?: number }> = ({ text, at, color = C.orange, size = 56, rotate = -8 }) => {
  const s = useSpring(at, true);
  if (s <= 0.001) return null;
  return (
    <div
      style={{
        display: "inline-block",
        whiteSpace: "nowrap",
        border: `6px solid ${color}`,
        color,
        borderRadius: 16,
        padding: "6px 22px",
        fontFamily: head,
        fontWeight: 900,
        fontSize: size,
        letterSpacing: "0.06em",
        background: "rgba(255,253,248,0.92)",
        transform: `rotate(${rotate + (1 - s) * 30}deg) scale(${2.2 - 1.2 * s})`,
        opacity: Math.min(1, s * 2),
      }}
    >
      {text}
    </div>
  );
};

/** 動く波形。noise で乱れを足す、amp は 0〜1 */
export const Wave: React.FC<{ w: number; h: number; freq?: number; amp?: number; noise?: number; color?: string; speed?: number; decay?: boolean }> = ({
  w,
  h,
  freq = 6,
  amp = 1,
  noise = 0,
  color = C.teal,
  speed = 4,
  decay = false,
}) => {
  const t = useT();
  const pts: string[] = [];
  for (let i = 0; i <= 160; i++) {
    const u = i / 160;
    const env = decay ? Math.exp(-((t * 1.2) % 1.1) * 2.2) : 1;
    const n = noise ? noise * (Math.sin(u * 97 + t * 23) * 0.6 + Math.sin(u * 211 - t * 31) * 0.4) : 0;
    const y = h / 2 + (h / 2 - 6) * (amp * env * Math.sin(2 * Math.PI * (u * freq - t * speed)) * 0.85 + n);
    pts.push(`${(u * w).toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

/** 丸い札 */
export const Chip: React.FC<{ children: React.ReactNode; color?: string; solid?: boolean; at?: number; size?: number }> = ({ children, color = C.ink, solid = false, at = 0, size = 22 }) => {
  const s = useSpring(at);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 18px",
        borderRadius: 999,
        border: `3px solid ${color}`,
        background: solid ? color : C.card,
        color: solid ? "#fff" : color,
        fontFamily: head,
        fontWeight: 900,
        fontSize: size,
        opacity: s,
        transform: `translateY(${(1 - s) * 16}px) scale(${0.9 + 0.1 * s})`,
      }}
    >
      {children}
    </span>
  );
};

/** 上から順に出る行 */
export const Rows: React.FC<{ items: React.ReactNode[]; at: number; gap?: number; step?: number }> = ({ items, at, gap = 14, step = 0.45 }) => {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {items.map((it, i) => {
        const p = prog(t, at + i * step, 0.5);
        return (
          <div key={i} style={{ opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
            {it}
          </div>
        );
      })}
    </div>
  );
};

/** 0→value の数え上げ */
export const Count: React.FC<{ to: number; at: number; dur?: number; decimals?: number }> = ({ to, at, dur = 1, decimals = 0 }) => {
  const t = useT();
  const v = to * prog(t, at, dur, Easing.out(Easing.cubic));
  return <>{v.toFixed(decimals)}</>;
};

/** 「、」「。」のところで改行する（短すぎる切れ端は次とつなぐ）。見出し・字幕を、意味の切れ目で読めるように */
export function breakAtPunct(text: string, min = 5): React.ReactNode {
  const parts = text.match(/[^、。！？]+[、。！？]?/g) ?? [text];
  const lines: string[] = [];
  for (const p of parts) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.replace(/[、。！？]/g, "").length < min) lines[lines.length - 1] = last + p;
    else lines.push(p);
  }
  return lines.map((l, i) => (
    <span key={i} style={{ display: "block" }}>
      {l.trim()}
    </span>
  ));
}

/** 字幕用: 短ければ 1 行、長ければ真ん中にいちばん近い「、」「。」で 2 行に */
export function twoLines(text: string, max = 26): React.ReactNode {
  if (text.length <= max) return text;
  const mid = text.length / 2;
  // 「。」が真ん中の近く（全体の 3 割以内）にあれば、そちらを優先する
  const pick = (chars: string) => {
    let best = -1;
    for (let i = 0; i < text.length - 1; i++) {
      if (chars.includes(text[i]) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    }
    return best;
  };
  const period = pick("。");
  const best = period >= 0 && Math.abs(period - mid) <= text.length * 0.3 ? period : pick("、。");
  if (best < 0) return text;
  return (
    <>
      <span style={{ display: "block" }}>{text.slice(0, best + 1)}</span>
      <span style={{ display: "block" }}>{text.slice(best + 1)}</span>
    </>
  );
}
