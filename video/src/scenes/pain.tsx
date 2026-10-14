// 冒頭の困りごと（時間と人手・AI が答えを言う）と、締めの「困りごとが解けた」
import React from "react";
import { Easing } from "remotion";
import { Count, prog, useSpring, useT } from "../anim";
import { Paper } from "../components";
import { body, C, head } from "../theme";

const RED = "#C94A3D";

/* ---------- 困りごと① 時間と人手 ---------- */
export const PainTime: React.FC = () => {
  const t = useT();
  const l1 = prog(t, 0.3, 0.6);
  const l2 = prog(t, 1.1, 0.6);
  const ring = prog(t, 1.4, 1.6, Easing.out(Easing.cubic));
  const R = 170;
  const circ = 2 * Math.PI * R;
  const tasks = ["器具の準備", "30 人の見回り", "片付け"];
  return (
    <Paper dark>
      <div style={{ position: "absolute", left: 110, top: 250, width: 960, fontFamily: head, fontWeight: 900, fontSize: 64, lineHeight: 1.45 }}>
        <div style={{ opacity: l1, transform: `translateY(${(1 - l1) * 30}px)` }}>観察・実験を週 1 回以上<br />できている中学校は、</div>
        <div style={{ opacity: l2, transform: `translateY(${(1 - l2) * 30}px)`, color: "#FFB48A" }}>半分に届かない。</div>
      </div>
      {/* 48.5% の円 */}
      <svg width={460} height={460} style={{ position: "absolute", left: 1260, top: 170 }}>
        <circle cx={230} cy={230} r={R} fill="none" stroke="#2C3B50" strokeWidth={46} />
        <circle cx={230} cy={230} r={R} fill="none" stroke={C.orange} strokeWidth={46} strokeLinecap="round" strokeDasharray={`${circ * 0.485 * ring} ${circ}`} transform="rotate(-90 230 230)" />
      </svg>
      <div style={{ position: "absolute", left: 1260, top: 330, width: 460, textAlign: "center", fontFamily: head, fontWeight: 900, fontSize: 96, color: "#fff" }}>
        <Count to={48.5} at={1.4} dur={1.6} decimals={1} />
        <span style={{ fontSize: 48 }}>%</span>
      </div>
      <div style={{ position: "absolute", left: 1200, top: 650, width: 580, textAlign: "center", fontSize: 24, color: "#C9D3DE", opacity: prog(t, 2.0, 0.5) }}>
        観察・実験を週 1 回以上している中学校
      </div>
      {/* 先生が一人で抱えること */}
      <div style={{ position: "absolute", left: 110, top: 690, display: "flex", gap: 18, alignItems: "center" }}>
        {tasks.map((x, i) => {
          const s = useSpring(3.0 + i * 0.35, true);
          return (
            <div key={x} style={{ padding: "14px 24px", borderRadius: 16, border: "3px solid #4A5A70", background: "#2C3B50", fontFamily: head, fontWeight: 900, fontSize: 30, opacity: Math.min(1, s), transform: `scale(${0.7 + 0.3 * s})` }}>
              {x}
            </div>
          );
        })}
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 34, color: "#FFB48A", marginLeft: 10, opacity: prog(t, 4.3, 0.5) }}>→ 全部、先生一人</div>
      </div>
      <div style={{ position: "absolute", right: 60, bottom: 40, fontSize: 18, color: "#8F9BAA", opacity: prog(t, 2.0, 0.5) }}>48.5% の出典: 令和 7 年度 全国学力・学習状況調査（学校質問、中学校）</div>
    </Paper>
  );
};

/* ---------- 困りごと③ AI が答えを言う ---------- */
export const PainAI: React.FC = () => {
  const t = useT();
  const q = useSpring(0.4);
  const a = useSpring(1.3);
  const typed = "答え：はじく強さを変えても、音の高さは変わりません。";
  const n = Math.round(typed.length * prog(t, 1.5, 1.4, Easing.linear));
  const strike = prog(t, 3.3, 0.5, Easing.inOut(Easing.cubic));
  const l1 = prog(t, 0.5, 0.6);
  const l2 = prog(t, 3.6, 0.6);
  return (
    <Paper>
      {/* チャットのまね */}
      <div style={{ position: "absolute", left: 110, top: 200, width: 760, borderRadius: 28, background: C.card, border: `4px solid ${C.ink}`, boxShadow: `0 6px 0 ${C.ink}`, padding: 36 }}>
        <div style={{ fontSize: 22, color: C.muted, fontFamily: head, fontWeight: 700 }}>ふつうの AI チャット</div>
        <div style={{ marginTop: 28, display: "flex", justifyContent: "flex-end", opacity: q, transform: `translateY(${(1 - q) * 20}px)` }}>
          <div style={{ maxWidth: 520, padding: "18px 24px", borderRadius: "22px 22px 6px 22px", background: C.orangeSoft, fontSize: 32, lineHeight: 1.5 }}>輪ゴムを強くはじいたら、音は高くなる？</div>
        </div>
        <div style={{ position: "relative", marginTop: 30, display: "flex", opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>
          <div style={{ position: "relative", maxWidth: 600, padding: "18px 24px", borderRadius: "22px 22px 22px 6px", background: C.sand, fontSize: 32, lineHeight: 1.5, minHeight: 100 }}>
            {/* 赤い線で消す（文字の行に合わせて取り消し線） */}
            <span style={{ textDecorationLine: "line-through", textDecorationThickness: 7, textDecorationColor: `rgba(201,74,61,${strike})` }}>{typed.slice(0, n)}</span>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 980, top: 300, width: 840, fontFamily: head, fontWeight: 900, fontSize: 60, lineHeight: 1.45 }}>
        <div style={{ opacity: l1, transform: `translateY(${(1 - l1) * 30}px)` }}>AI に聞けば、<br />答えはすぐ出る。</div>
        <div style={{ marginTop: 34, fontSize: 44, color: RED, opacity: l2, transform: `translateY(${(1 - l2) * 24}px)` }}>
          でも、答えを先に知ったら、<br />実験にならない。
        </div>
      </div>
    </Paper>
  );
};

/* ---------- 締め: 困りごとが解けた ---------- */
// 「だから PhoneLab」の 3 つのチップと同じ文言で閉じる
const RECAP: { pain: string; fix: string }[] = [
  { pain: "① 準備も見回りも先生一人", fix: "① 器具はスマホ" },
  { pain: "② 30 人を見て回れない", fix: "② 先生には 1 画面" },
  { pain: "③ AI が答えを言ってしまう", fix: "③ AI の「ラボ先生」は問い返すだけ" },
];

export const EndRecap: React.FC = () => {
  const t = useT();
  const title = useSpring(4.6);
  return (
    <Paper dark>
      <div style={{ position: "absolute", left: 160, top: 150, display: "flex", flexDirection: "column", gap: 30 }}>
        {RECAP.map((r, i) => {
          const at = 0.3 + i * 0.9;
          const p = prog(t, at, 0.5);
          const s = prog(t, at + 0.45, 0.4);
          const ok = useSpring(at + 0.55, true);
          return (
            <div key={r.pain} style={{ display: "flex", alignItems: "center", gap: 28, opacity: p, transform: `translateX(${(1 - p) * -40}px)` }}>
              <div style={{ position: "relative", width: 560, fontFamily: body, fontSize: 36, color: "#8F9BAA" }}>
                {r.pain}
                <div style={{ position: "absolute", left: 0, top: "52%", height: 4, width: `${s * 100}%`, background: "#8F9BAA" }} />
              </div>
              <div style={{ width: 56, height: 56, borderRadius: 28, background: C.teal, display: "grid", placeItems: "center", fontSize: 34, fontWeight: 900, transform: `scale(${ok})` }}>✓</div>
              <div style={{ fontFamily: head, fontWeight: 900, fontSize: 42, opacity: s }}>{r.fix}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 160, top: 610, fontFamily: head, fontWeight: 900, fontSize: 84, lineHeight: 1.3, opacity: title, transform: `translateY(${(1 - title) * 30}px)` }}>
        スマホが実験器具。<span style={{ color: "#FFB48A" }}>AI は答えを言わない。</span>
      </div>
      <div style={{ position: "absolute", left: 160, top: 760, fontSize: 34, color: "#C9D3DE", opacity: prog(t, 5.2, 0.6) }}>PhoneLab ― 第 5 回 Agentic AI Hackathon with Google Cloud</div>
    </Paper>
  );
};
