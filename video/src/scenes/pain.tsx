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
  const tasks = ["器具の準備", "片付け", "授業の時間"];
  return (
    <Paper dark>
      <div style={{ position: "absolute", left: 110, top: 220, width: 960, fontFamily: head, fontWeight: 900, fontSize: 64, lineHeight: 1.45 }}>
        <div style={{ opacity: l1, transform: `translateY(${(1 - l1) * 30}px)` }}>理科の実験を、<br />週 1 回以上できている<br />中学校は、</div>
        <div style={{ opacity: l2, transform: `translateY(${(1 - l2) * 30}px)`, color: "#FFB48A" }}>半分未満。</div>
      </div>
      <IssueTag n="①" dark />
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
        観察・実験が週 1 回以上の中学校
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
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 34, color: "#FFB48A", marginLeft: 10, opacity: prog(t, 4.3, 0.5) }}>→ どれも足りない</div>
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
  const typed = "答え：強くはじいても、音の高さは同じです。";
  const n = Math.round(typed.length * prog(t, 1.5, 1.4, Easing.linear));
  const strike = prog(t, 3.3, 0.5, Easing.inOut(Easing.cubic));
  const l1 = prog(t, 0.5, 0.6);
  const l2 = prog(t, 3.6, 0.6);
  return (
    <Paper>
      <IssueTag n="③" />
      {/* チャットのまね */}
      <div style={{ position: "absolute", left: 110, top: 220, width: 760, borderRadius: 28, background: C.card, border: `4px solid ${C.ink}`, boxShadow: `0 6px 0 ${C.ink}`, padding: 36 }}>
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
          でも、自分で考える前に、<br />答えを知ってしまう。
        </div>
      </div>
    </Paper>
  );
};

/* ---------- 締め: 困りごとが解けた ---------- */
// 「だから PhoneLab」の 3 つのチップと同じ文言で閉じる
const RECAP: { pain: string; fix: string }[] = [
  { pain: "① 準備も時間も足りない", fix: "① スマホで実験" },
  { pain: "② 30 人を見切れない", fix: "② 30 人を先生の 1 画面で" },
  { pain: "③ AI が先に答える", fix: "③ AI「ラボ先生」は答えを言わず、質問で助ける" },
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
        スマホで実験。<span style={{ color: "#FFB48A" }}>AI は先に答えを言わない。</span>
      </div>
      <div style={{ position: "absolute", left: 160, top: 760, fontSize: 34, color: "#C9D3DE", opacity: prog(t, 5.2, 0.6) }}>PhoneLab ― 第 5 回 Agentic AI Hackathon with Google Cloud</div>
    </Paper>
  );
};

/** 課題の番号の札（左上） */
const IssueTag: React.FC<{ n: string; dark?: boolean }> = ({ n, dark }) => {
  const s = useSpring(0.1);
  return (
    <div style={{ position: "absolute", left: 110, top: 110, padding: "8px 20px", borderRadius: 999, background: dark ? "#FFB48A" : RED, color: dark ? C.ink : "#fff", fontFamily: head, fontWeight: 900, fontSize: 30, opacity: s, transform: `translateY(${(1 - s) * -16}px)` }}>
      課題 {n}
    </div>
  );
};

/* ---------- 冒頭: 現状の課題 ---------- */
export const IssueTitle: React.FC = () => {
  const t = useT();
  const a = useSpring(0.2);
  const b = useSpring(0.7);
  return (
    <Paper dark>
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, textAlign: "center" }}>
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 52, color: "#C9D3DE", opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>いまの理科の授業には、</div>
        <div style={{ marginTop: 20, fontFamily: head, fontWeight: 900, fontSize: 110, opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>
          こんな<span style={{ color: "#FFB48A" }}>課題</span>があります。
        </div>
        <div style={{ marginTop: 60, display: "flex", justifyContent: "center", gap: 40 }}>
          {["①", "②", "③"].map((n, i) => {
            const s = useSpring(1.5 + i * 0.25, true);
            return (
              <div key={n} style={{ width: 90, height: 90, borderRadius: 45, border: "4px solid #FFB48A", color: "#FFB48A", display: "grid", placeItems: "center", fontFamily: head, fontWeight: 900, fontSize: 48, opacity: Math.min(1, s), transform: `scale(${s})` }}>
                {n}
              </div>
            );
          })}
        </div>
      </div>
          </Paper>
  );
};

/* ---------- メインタイトル ---------- */
export const MainTitle: React.FC = () => {
  const t = useT();
  const a = useSpring(0.2);
  const b = useSpring(0.9);
  return (
    <Paper dark>
      <div style={{ position: "absolute", left: 0, right: 0, top: 290, textAlign: "center" }}>
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 170, letterSpacing: "0.02em", opacity: a, transform: `scale(${0.9 + 0.1 * a})` }}>
          Phone<span style={{ color: "#FFB48A" }}>Lab</span>
        </div>
        <div style={{ marginTop: 20, fontFamily: head, fontWeight: 900, fontSize: 60, opacity: b, transform: `translateY(${(1 - b) * 24}px)` }}>
          スマホで実験。<span style={{ color: "#FFB48A" }}>AI は先に答えを言わない。</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 460, top: 760, opacity: prog(t, 1.2, 0.6) }}>
        <svg width={1000} height={80}>
          <path d={Array.from({ length: 101 }, (_, i) => `${i ? "L" : "M"} ${i * 10} ${40 + Math.sin(i * 0.5 - t * 6) * 26 * Math.exp(-Math.abs(i - 50) / 40)}`).join(" ")} fill="none" stroke={C.orange} strokeWidth={6} strokeLinecap="round" />
        </svg>
      </div>
    </Paper>
  );
};

/* ---------- 家でやりたいとき ---------- */
const HOME_CASES = ["授業中に終わらなかった", "もう一度やりたい", "休んだ日の実験も"];
export const HomeWhy: React.FC = () => {
  const t = useT();
  const q = useSpring(1.6);
  return (
    <Paper>
      <div style={{ position: "absolute", left: 160, top: 200, display: "flex", flexDirection: "column", gap: 26 }}>
        {HOME_CASES.map((c, i) => {
          const s = useSpring(0.2 + i * 0.45, true);
          return (
            <div key={c} style={{ alignSelf: "flex-start", marginLeft: i * 60, padding: "22px 34px", borderRadius: "28px 28px 28px 8px", background: C.card, border: `3px solid ${C.orange}`, boxShadow: `0 5px 0 ${C.orange}`, fontFamily: head, fontWeight: 900, fontSize: 44, opacity: Math.min(1, s), transform: `scale(${0.85 + 0.15 * s})`, transformOrigin: "0% 100%" }}>
              {c}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 160, top: 690, fontFamily: head, fontWeight: 900, fontSize: 72, opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
        こんなとき、<span style={{ color: C.orange }}>家でも実験したい</span>ですよね？
      </div>
          </Paper>
  );
};
