// 仕組み: 統制の流れ → 構成 → 記録 → 数字 → 締め
import React from "react";
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, staticFile } from "remotion";
import { FOOTAGE } from "../footage";
import { Chip, prog, useSpring, useT, Wave } from "../anim";
import { BigLines, Caption, Kicker, Paper, Stat } from "../components";
import { C, head } from "../theme";
import { SwapTag } from "./student";

const RED = "#C94A3D";

/* ---------- 12. 統制の流れ ---------- */
type Node = { x: number; title: string; sub: string; kind: "student" | "gate" | "ai" | "out" };
const NODES: Node[] = [
  { x: 70, title: "生徒の文", sub: "予想・会話・考え", kind: "student" },
  { x: 330, title: "① Policy", sub: "危ない実験・命令", kind: "gate" },
  { x: 590, title: "② before_run", sub: "先生が止めたら動かさない", kind: "gate" },
  { x: 850, title: "③ before_model", sub: "Model Armor・回数の枠", kind: "gate" },
  { x: 1110, title: "Gemini", sub: "5 つのエージェント", kind: "ai" },
  { x: 1370, title: "④ after_model", sub: "先出し・危ない勧め・条件", kind: "gate" },
  { x: 1630, title: "画面", sub: "判断の跡つき", kind: "out" },
];
const NW = 220;
const NY = 330;
const center = (i: number) => NODES[i].x + NW / 2;

const Token: React.FC<{ label: string; color: string; x: number; y?: number; o: number }> = ({ label, color, x, y = NY - 70, o }) => (
  <div style={{ position: "absolute", left: x - 110, top: y, width: 220, textAlign: "center", opacity: o }}>
    <span style={{ display: "inline-block", padding: "8px 16px", borderRadius: 999, background: color, color: "#fff", fontFamily: head, fontWeight: 900, fontSize: 22, boxShadow: "0 6px 14px rgba(30,42,58,0.25)" }}>{label}</span>
  </div>
);

export const Governance: React.FC = () => {
  const t = useT();
  // A: 通る、B: ① で止まる、C: ④ で落ちて作り直し
  const ax = interpolate(t, [2.6, 6.2], [center(0), center(6)], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const ao = prog(t, 2.4, 0.3) * (1 - prog(t, 6.4, 0.3));
  const bx = interpolate(t, [6.8, 7.8], [center(0), center(1) - 60], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const bDrop = prog(t, 8.0, 0.6, Easing.in(Easing.quad));
  const bo = prog(t, 6.6, 0.3) * (1 - prog(t, 9.8, 0.3));
  const cx = interpolate(t, [10.0, 10.8], [center(4), center(5) - 60], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cBack = prog(t, 11.0, 0.9, Easing.inOut(Easing.cubic));
  const co = prog(t, 9.9, 0.3) * (1 - prog(t, 11.8, 0.2));
  const dx = interpolate(t, [12.0, 13.6], [center(4), center(6)], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const dO = prog(t, 11.9, 0.3);
  const flash = (i: number) => {
    const passA = Math.abs(ax - center(i)) < 40 && ao > 0.5;
    const passD = Math.abs(dx - center(i)) < 40 && dO > 0.5 && t > 12;
    return passA || passD;
  };
  return (
    <Paper>
      <Kicker text="統制の流れ（ADK の PolicyPlugin）" color={C.teal} />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {NODES.slice(0, -1).map((n, i) => {
          const p = prog(t, 0.4 + i * 0.25, 0.4);
          const x1 = n.x + NW;
          const x2 = NODES[i + 1].x;
          return <line key={i} x1={x1} y1={NY + 85} x2={x1 + (x2 - x1) * p} y2={NY + 85} stroke={C.ink} strokeWidth={5} />;
        })}
        {/* 作り直しの弧 */}
        <path d={`M ${center(5)} ${NY - 6} C ${center(5)} ${NY - 120}, ${center(4)} ${NY - 120}, ${center(4)} ${NY - 6}`} fill="none" stroke={C.orange} strokeWidth={4} strokeDasharray="10 10" opacity={prog(t, 10.8, 0.4) * (1 - prog(t, 13, 0.5))} />
      </svg>
      {NODES.map((n, i) => {
        const s = useNodeSpring(0.2 + i * 0.25);
        const color = n.kind === "student" ? C.orange : n.kind === "ai" ? C.teal : C.ink;
        const lit = flash(i) && n.kind === "gate";
        return (
          <div key={n.title} style={{ position: "absolute", left: n.x, top: NY, width: NW, height: 170, borderRadius: 20, background: n.kind === "ai" ? "#E8F6F5" : C.card, border: `4px solid ${lit ? C.teal : color}`, boxShadow: `0 6px 0 ${lit ? C.teal : color}${lit ? ", 0 0 0 10px rgba(31,163,159,0.25)" : ""}`, padding: "18px 16px", opacity: s, transform: `translateY(${(1 - s) * 50}px)` }}>
            <div style={{ fontFamily: head, fontWeight: 900, fontSize: 26, color: n.kind === "gate" ? C.ink : color }}>{n.title}</div>
            <div style={{ fontSize: 20, color: C.ink2, marginTop: 10, lineHeight: 1.5 }}>{n.sub}</div>
            {lit ? <div style={{ position: "absolute", right: -14, top: -14, width: 40, height: 40, borderRadius: 20, background: C.teal, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900 }}>✓</div> : null}
          </div>
        );
      })}
      <Token label="予想と理由" color={C.teal} x={ax} o={ao} />
      <Token label="スマホを落として測りたい" color={RED} x={bx} y={NY - 70 + bDrop * 330} o={bo} />
      {t > 7.8 && t < 10 ? (
        <div style={{ position: "absolute", left: center(1) - 160, top: NY + 220, width: 320, textAlign: "center" }}>
          <Chip at={8.0} color={RED} solid>却下（AI は呼ばない）</Chip>
        </div>
      ) : null}
      <Token label="結果の先出し" color={C.orange} x={cx + (center(4) - cx) * cBack} y={NY - 70 - Math.sin(Math.PI * cBack) * 90} o={co} />
      {t > 10.8 && t < 13 ? (
        <div style={{ position: "absolute", left: center(4) - 40, top: NY - 190, width: 420, textAlign: "center" }}>
          <Chip at={10.9} color={C.orange}>理由を返して作り直し</Chip>
        </div>
      ) : null}
      <Token label="問い返し" color={C.teal} x={dx} o={dO} />
      <div style={{ position: "absolute", left: 70, top: 640, display: "flex", gap: 20 }}>
        <Chip at={2.8} color={C.teal}>通る</Chip>
        <Chip at={7.0} color={RED}>入口で止める</Chip>
        <Chip at={10.2} color={C.orange}>出口で落として作り直す</Chip>
      </div>
      <Caption text="5 つのエージェントを、ADK の統制層が囲む。" sub="入口で止め、Model Armor で確かめ、出口で落ちたら理由を返して 1 回だけ作り直す" />
    </Paper>
  );
};

function useNodeSpring(at: number): number {
  return useSpring(at);
}

/* ---------- 13. 構成 ---------- */
const SERVICES = [
  { name: "Vertex AI（Gemini）", color: C.teal },
  { name: "Model Armor", color: RED },
  { name: "Firestore", color: C.orange },
  { name: "Cloud Trace", color: "#3B6FB6" },
  { name: "Secret Manager", color: C.ink },
];

export const System: React.FC = () => {
  const t = useT();
  const a = useSpring(0.1);
  const b = useSpring(0.5);
  const draw1 = prog(t, 1.2, 0.6);
  const packet = (off: number, x1: number, x2: number) => {
    const p = ((t - 2 + off) % 1.4) / 1.4;
    return t < 2 ? -1 : x1 + (x2 - x1) * p;
  };
  return (
    <Paper>
      <Kicker text="構成" />
      <div style={{ position: "absolute", left: 80, top: 250, width: 360, height: 430, borderRadius: 28, background: C.card, border: `4px solid ${C.orange}`, boxShadow: `0 6px 0 ${C.orange}`, padding: 28, opacity: a, transform: `translateX(${(1 - a) * -80}px)` }}>
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 34 }}>スマホ</div>
        <div style={{ fontSize: 24, color: C.ink2, marginTop: 12, lineHeight: 1.6 }}>センサーを読む<br />計算と検査<br />判定と記録</div>
        <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
          <Wave w={280} h={80} freq={5} color={C.orange} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 600, top: 200, width: 620, height: 530, borderRadius: 28, background: "rgba(255,253,248,0.7)", border: `4px dashed ${C.ink}`, padding: 28, opacity: b, transform: `translateY(${(1 - b) * 60}px)` }}>
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 34 }}>Cloud Run</div>
        <div style={{ fontSize: 22, color: C.muted }}>FastAPI ＋ Google ADK</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
          {["Planner", "Replanner", "NextStep", "ClassAgent", "Tutor"].map((n, i) => (
            <Chip key={n} at={0.7 + i * 0.15} color={C.teal} size={22}>{n}</Chip>
          ))}
        </div>
        <div style={{ marginTop: 26, borderRadius: 16, background: C.ink, color: "#fff", padding: "18px 20px", fontFamily: head, fontWeight: 900, fontSize: 26, opacity: prog(t, 1.4, 0.4) }}>
          PolicyPlugin（統制層）
          <div style={{ fontFamily: "inherit", fontWeight: 400, fontSize: 20, color: "#C9D3DE", marginTop: 6 }}>before_run・before_model・before_tool・after_model</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 1380, top: 190, width: 460, display: "flex", flexDirection: "column", gap: 16 }}>
        {SERVICES.map((s, i) => {
          const p = prog(t, 0.6 + i * 0.15, 0.4);
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 16, background: C.card, border: `3px solid ${C.ink}`, borderRadius: 18, padding: "14px 18px", opacity: p, transform: `translateX(${(1 - p) * 80}px)` }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: s.color, flex: "none" }} />
              <span style={{ fontFamily: head, fontWeight: 900, fontSize: 28 }}>{s.name}</span>
            </div>
          );
        })}
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <line x1={444} y1={465} x2={444 + 152 * draw1} y2={465} stroke={C.ink} strokeWidth={5} />
        <line x1={1224} y1={465} x2={1224 + 152 * draw1} y2={465} stroke={C.ink} strokeWidth={5} />
        {[0, 0.7].map((o) => {
          const x = packet(o, 444, 596);
          return x > 0 ? <circle key={`a${o}`} cx={x} cy={465} r={11} fill={C.orange} /> : null;
        })}
        {[0.35, 1.05].map((o) => {
          const x = packet(o, 1224, 1376);
          return x > 0 ? <circle key={`b${o}`} cx={x} cy={465} r={11} fill={C.teal} /> : null;
        })}
      </svg>
      <div style={{ position: "absolute", left: 444, top: 360, width: 152, textAlign: "center", fontSize: 18, lineHeight: 1.4, color: C.muted, opacity: prog(t, 2, 0.4) }}>文と数値の<br />要約だけ<br />（約 285 B）</div>
      <Caption text="測るのはスマホ。エージェントは Cloud Run の 1 つのサービス。" sub="音声や加速度の生データは、スマホから出さない" />
    </Paper>
  );
};

/* ---------- 14. 記録 ---------- */
const SPANS = [
  { name: "phonelab.plan", at: 0, len: 1.0, color: C.ink },
  { name: "invoke_agent", at: 0.05, len: 0.9, color: C.teal },
  { name: "phonelab.model_armor", at: 0.08, len: 0.18, color: RED },
  { name: "call_llm", at: 0.3, len: 0.35, color: C.teal },
  { name: "phonelab.policy", at: 0.66, len: 0.08, color: C.orange },
  { name: "phonelab.self_correct", at: 0.75, len: 0.2, color: C.orange },
];

export const Trace: React.FC = () => (FOOTAGE.trace ? <TraceLive /> : <TraceAnim />);

const TraceLive: React.FC = () => {
  const clip = FOOTAGE.trace!;
  return (
    <Paper>
      <Kicker text="記録（Cloud Trace）" color={C.teal} />
      <div style={{ position: "absolute", left: 160, top: 110, width: 1600, height: 760, borderRadius: 22, overflow: "hidden", border: `3px solid ${C.ink}`, background: C.card }}>
        <OffthreadVideo src={staticFile(`footage/${clip.file}`)} startFrom={Math.round((clip.startFrom ?? 0) * 30)} muted style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <Caption text="判断の跡は Cloud Trace にも同じ段で残る。生徒の文は残さない。" />
    </Paper>
  );
};

const TraceAnim: React.FC = () => {
  const t = useT();
  return (
    <Paper>
      <Kicker text="記録（Cloud Trace のイメージ）" color={C.teal} />
      <div style={{ position: "absolute", left: 160, top: 180, width: 1600, background: C.card, border: `3px solid ${C.ink}`, borderRadius: 22, padding: "30px 36px" }}>
        {SPANS.map((s, i) => {
          const p = prog(t, 0.3 + i * 0.35, 0.6);
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", height: 74, borderTop: i ? `2px solid ${C.sand}` : undefined }}>
              <div style={{ width: 420, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 26, color: C.ink, paddingLeft: i ? 18 * Math.min(i, 2) : 0 }}>{s.name}</div>
              <div style={{ position: "relative", flex: 1, height: 30 }}>
                <div style={{ position: "absolute", left: `${s.at * 100}%`, width: `${s.len * 100 * p}%`, height: 30, borderRadius: 8, background: s.color }} />
              </div>
            </div>
          );
        })}
      </div>
      <Caption text="判断の跡は Cloud Trace にも同じ段で残る。生徒の文は残さない。" />
      <SwapTag text="実際の Cloud Trace の画面 6 秒" />
    </Paper>
  );
};

/* ---------- 15. 数字 ---------- */
export const Numbers: React.FC = () => (
  <Paper>
    <Kicker text="数字で" />
    <AbsoluteFill style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 36, paddingBottom: 140 }}>
      <Stat value={30} suffix=" / 30" label="予想を読む" note="変数・向き・実験の選択（本物の Gemini）" delay={4} color={C.teal} />
      <Stat value={0} suffix=" 件" label="結果の先出し" note="別のモデルの判定、延べ 84 回" delay={12} color={C.ink} />
      <Stat value={0} suffix=" 件" label="測定の誤った通過" note="別の音を混ぜた 6,240 通り（直す前 493）" delay={20} color={C.orange} />
      <Stat value={30} prefix="約 " suffix=" 円" label="授業 1 回の Gemini" note="31 人 × 3 実験の試算" delay={28} color={C.teal} />
    </AbsoluteFill>
    <Caption text="評価はリポジトリに保存。数字はそこから引いている。" />
  </Paper>
);

/* ---------- 16. 締め ---------- */
export const End: React.FC = () => {
  const t = useT();
  return (
    <Paper dark>
      <BigLines dark lines={["スマホが実験器具。", "AI は答えを言わない。"]} size={92} />
      <div style={{ position: "absolute", left: 160, bottom: 200, opacity: prog(t, 1.2, 0.6) }}>
        <Wave w={1000} h={70} freq={5} amp={0.8} color={C.orange} speed={2} />
      </div>
      <div style={{ position: "absolute", left: 160, bottom: 110, fontSize: 36, color: "#C9D3DE", opacity: prog(t, 1.0, 0.6) }}>PhoneLab ― 第 5 回 Agentic AI Hackathon with Google Cloud</div>
    </Paper>
  );
};
