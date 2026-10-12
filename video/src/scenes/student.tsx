// 生徒の流れ: つかみ → 課題 → 予想 → 計画 → 許可と測定 → 結果
import React from "react";
import { Easing, interpolate, Sequence } from "remotion";
import { Chip, Count, Mark, Pop, prog, Rows, Stamp, Tap, Type, useSpring, useT, Wave } from "../anim";
import { Kicker, Logo, Paper } from "../components";
import { Phone } from "../devices";
import { body, C, head } from "../theme";

/** 撮ったものに差し替える場所の札（右上） */
export const SwapTag: React.FC<{ text: string; left?: boolean }> = ({ text, left }) => (
  <div style={{ position: "absolute", [left ? "left" : "right"]: 40, top: 96, padding: "8px 16px", borderRadius: 12, border: `3px dashed ${C.orange}`, background: "rgba(255,253,248,0.9)", color: "#B85C2A", fontFamily: head, fontWeight: 700, fontSize: 20 }}>
    ● 実写／画面録画に差し替え：{text}
  </div>
);

/** 右側の見出しと説明。説明は subAt 秒から */
export const SideText: React.FC<{ title: string; sub?: string; subAt?: number; x?: number; y?: number; w?: number; color?: string; size?: number }> = ({
  title,
  sub,
  subAt = 0.8,
  x = 1000,
  y = 300,
  w = 820,
  color = C.orange,
  size = 56,
}) => {
  const t = useT();
  const a = prog(t, 0.3, 0.6);
  const b = prog(t, subAt, 0.6);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w }}>
      <div style={{ width: 90 * a, height: 8, borderRadius: 4, background: color, marginBottom: 24 }} />
      <div style={{ fontFamily: head, fontWeight: 900, fontSize: size, lineHeight: 1.4, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>{title}</div>
      {sub ? <div style={{ fontSize: 34, lineHeight: 1.6, color: C.ink2, marginTop: 22, opacity: b, transform: `translateY(${(1 - b) * 20}px)` }}>{sub}</div> : null}
    </div>
  );
};

/* ---------- 0. つかみ ---------- */
const PLUCKS = [0.5, 2.2, 3.9, 5.6, 7.3];
function bandOffset(t: number): number {
  return PLUCKS.reduce((a, p) => (t < p ? a : a + 34 * Math.exp(-(t - p) * 2.6) * Math.sin(2 * Math.PI * 7 * (t - p))), 0);
}

export const Opening: React.FC = () => {
  const t = useT();
  const d = bandOffset(t);
  const w1 = useSpring(1.0);
  const w2 = useSpring(1.9);
  const tag = prog(t, 3.2, 0.6);
  return (
    <Paper>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {/* 箱 */}
        <rect x={310} y={430} width={520} height={260} rx={28} fill={C.card} stroke={C.ink} strokeWidth={10} />
        <ellipse cx={570} cy={560} rx={120} ry={46} fill={C.paper} stroke={C.ink} strokeWidth={10} />
        {/* 輪ゴム（はじくと震える） */}
        <path d={`M 250 520 Q 570 ${520 + d * 2.4} 890 520`} fill="none" stroke={C.orange} strokeWidth={14} strokeLinecap="round" />
        {/* 音の輪 */}
        {PLUCKS.map((p) => {
          const k = prog(t, p, 1.6, Easing.out(Easing.cubic));
          if (k <= 0 || k >= 1) return null;
          return [0, 1, 2].map((i) => (
            <path key={`${p}-${i}`} d={`M ${930 + i * 46 + k * 90} ${470 - i * 22} q ${30 + i * 10} ${50 + i * 22} 0 ${100 + i * 44}`} fill="none" stroke={C.teal} strokeWidth={9} strokeLinecap="round" opacity={(1 - k) * (1 - i * 0.25)} />
          ));
        })}
        {/* スマホ */}
        <g transform="translate(1120 360)">
          <rect width={150} height={290} rx={26} fill={C.ink} />
          <rect x={10} y={16} width={130} height={258} rx={16} fill={C.paper} />
          <g transform="translate(14 140)">
            <Wave w={122} h={60} amp={Math.min(1, Math.abs(d) / 20)} freq={4} color={C.teal} />
          </g>
        </g>
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 760, textAlign: "center", fontFamily: head, fontWeight: 900, fontSize: 84 }}>
        <span style={{ display: "inline-block", opacity: w1, transform: `translateY(${(1 - w1) * 40}px)` }}>スマホが実験器具。</span>
        <span style={{ display: "inline-block", color: C.orange, opacity: w2, transform: `translateY(${(1 - w2) * 40}px)` }}>AI は答えを言わない。</span>
      </div>
      <div style={{ opacity: tag }}>
        <SwapTag text="輪ゴムをはじく手元（8 秒）" />
      </div>
    </Paper>
  );
};

/* ---------- 1. 課題 ---------- */
export const Problem: React.FC = () => {
  const t = useT();
  const cols = 6;
  const rows = 5;
  const gx = 1060;
  const gy = 250;
  const step = 118;
  // 先生が歩く道（左上から蛇行）
  const path: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) path.push([r % 2 ? cols - 1 - c : c, r]);
  const walk = interpolate(t, [2.2, 7.6], [0, path.length - 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const i0 = Math.floor(walk);
  const f = walk - i0;
  const [ax, ay] = path[i0];
  const [bx, by] = path[Math.min(i0 + 1, path.length - 1)];
  const tx = gx + (ax + (bx - ax) * f) * step;
  const ty = gy + (ay + (by - ay) * f) * step;
  const visited = new Set(path.slice(0, i0 + 1).map(([c, r]) => `${c}-${r}`));
  const teacher = prog(t, 2.0, 0.4);
  const l1 = prog(t, 0.4, 0.7);
  const l2 = prog(t, 1.2, 0.7);
  return (
    <Paper dark>
      <div style={{ position: "absolute", left: 110, top: 330, width: 880, fontFamily: head, fontWeight: 900, fontSize: 60, lineHeight: 1.45 }}>
        <div style={{ opacity: l1, transform: `translateY(${(1 - l1) * 30}px)` }}>30 人がそれぞれの予想を確かめる実験を、</div>
        <div style={{ opacity: l2, transform: `translateY(${(1 - l2) * 30}px)`, color: "#FFB48A" }}>先生が一人で見て回るのは、簡単ではない。</div>
      </div>
      {Array.from({ length: rows * cols }).map((_, k) => {
        const c = k % cols;
        const r = Math.floor(k / cols);
        const p = prog(t, 0.2 + k * 0.035, 0.4);
        const done = visited.has(`${c}-${r}`) && teacher > 0;
        const q = Math.sin(t * 3 + k) * 4;
        return (
          <div key={k} style={{ position: "absolute", left: gx + c * step - 34, top: gy + r * step - 34, width: 68, height: 68, borderRadius: 34, background: done ? C.teal : "#2C3B50", border: `4px solid ${done ? "#7FD6D2" : "#4A5A70"}`, opacity: p, transform: `scale(${p}) translateY(${done ? 0 : q}px)`, display: "grid", placeItems: "center", color: "#fff", fontFamily: head, fontWeight: 900, fontSize: 30 }}>
            {done ? "✓" : "?"}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: tx - 30, top: ty - 30, width: 60, height: 60, borderRadius: 30, background: C.orange, border: "5px solid #fff", opacity: teacher, boxShadow: "0 0 0 10px rgba(226,122,63,0.25)" }} />
      <div style={{ position: "absolute", left: gx - 34, top: gy + rows * step - 10, fontSize: 26, color: "#C9D3DE", opacity: teacher }}>
        先生が見て回れたのは <span style={{ color: "#FFB48A", fontFamily: head, fontWeight: 900, fontSize: 34 }}>{Math.min(30, i0 + 1)}</span> / 30 人
      </div>
    </Paper>
  );
};

/* ---------- 2. 予想 ---------- */
export const Predict: React.FC = () => (
  <Paper>
    <Kicker text="① 予想と理由を書く" />
    <Phone src="02-question-back.png" imgH={1058} x={620} scroll={[[0, 1]]}>
      <Type x={34} y={812} w={334} h={28} text="強くはじくと高くなると思う" from={0.9} to={2.7} family={body} />
      <Tap x={200} y={963} at={3.3} />
      <Pop src="02-question-back.png" imgW={400} x={18} y={708} w={366} h={90} at={4.0} origin="18% 100%" />
      <Mark x={20} y={713} w={360} h={68} at={4.9} color={C.teal} label="ラボ先生" />
    </Phone>
    <SideText title="予想を書くまで、実験もセンサーも出てこない。" sub="理由が無ければ、ラボ先生（Gemini）が 1 回だけ聞き返す。" subAt={4.4} />
    <Logo />
  </Paper>
);

/* ---------- 3. 計画 ---------- */
const TRAIL = ["読んだ：予想（29 字）と、選べる実験 3 件", "AI に渡す前のチェック：問題なし", "選んだ：「同じ輪ゴムで、はじく強さだけ変える」", "AI の答えのチェック：問題なし"];

export const Plan: React.FC = () => (
  <Paper>
    <Kicker text="② ラボ先生が実験を選ぶ" color={C.teal} />
    <Phone src="03-plan.png" imgH={1163} x={600} scroll={[[0, 0.12], [6.2, 0.12], [7.6, 0.42]]}>
      <Mark x={30} y={286} w={340} h={62} at={1.0} until={3.6} color={C.teal} />
      <Mark x={30} y={455} w={340} h={142} at={3.8} until={7.4} color={C.teal} label="判断の跡" />
      <Mark x={36} y={603} w={328} h={90} at={7.8} color={C.orange} label="変えるのは 1 つ" />
    </Phone>
    <SideText title="予想を読んで、確かめられる実験をカタログから選ぶ。答えは知らない。" x={1000} y={150} size={50} color={C.teal} />
    <div style={{ position: "absolute", left: 1000, top: 520, width: 820 }}>
      <Rows
        at={4.0}
        step={0.55}
        items={TRAIL.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 16, background: C.card, border: `3px solid ${C.teal}`, borderRadius: 16, padding: "14px 18px", boxShadow: `0 4px 0 ${C.teal}` }}>
            <span style={{ width: 40, height: 40, borderRadius: 20, background: C.teal, color: "#fff", display: "grid", placeItems: "center", fontFamily: head, fontWeight: 900, fontSize: 22, flex: "none" }}>{i + 1}</span>
            <span style={{ fontSize: 27, lineHeight: 1.4 }}>{s}</span>
          </div>
        ))}
      />
    </div>
    <Logo />
  </Paper>
);

/* ---------- 4. 許可と測定 ---------- */
export const Permit: React.FC = () => {
  const t = useT();
  const nums = [
    { n: "3", at: 3.8 },
    { n: "2", at: 4.4 },
    { n: "1", at: 5.0 },
  ];
  const go = useSpring(5.6, true);
  const measuring = prog(t, 5.8, 0.4);
  const bar = prog(t, 5.9, 4.8, Easing.linear);
  const intro = 1 - prog(t, 3.5, 0.3);
  return (
    <Paper>
      <Kicker text="③ センサーを許可して測る" />
      <Phone src="03-plan.png" imgH={1163} x={480} scroll={[[0, 1]]}>
        <Mark x={36} y={743} w={328} h={64} at={0.8} color={C.teal} label="マイクを 5 秒だけ" />
        <Tap x={200} y={1008} at={2.8} />
      </Phone>
      <div style={{ opacity: intro }}>
        <SideText title="使うセンサーと秒数を見て、自分で許可する。" sub="押すまで、センサーは動かない。カメラと位置は使わない。" subAt={1.2} x={900} y={330} w={900} />
      </div>
      {nums.map(({ n, at }) => {
        const p = prog(t, at, 0.55, Easing.linear);
        if (p <= 0 || p >= 1) return null;
        return (
          <div key={n} style={{ position: "absolute", left: 1300, top: 270, width: 300, textAlign: "center", fontFamily: head, fontWeight: 900, fontSize: 300, color: C.orange, opacity: 1 - p, transform: `scale(${1.4 - 0.5 * p})` }}>
            {n}
          </div>
        );
      })}
      {t > 5.5 ? (
        <div style={{ position: "absolute", left: 900, top: 230, width: 900, textAlign: "center" }}>
          <div style={{ fontFamily: head, fontWeight: 900, fontSize: 88, color: C.orange, transform: `scale(${0.6 + 0.4 * go})`, opacity: go }}>はじいて！</div>
          <div style={{ marginTop: 40, opacity: measuring, display: "flex", justifyContent: "center" }}>
            <Wave w={760} h={200} freq={9} decay color={C.teal} speed={6} />
          </div>
          <div style={{ margin: "36px auto 0", width: 700, height: 18, borderRadius: 9, background: C.sand, opacity: measuring }}>
            <div style={{ width: `${bar * 100}%`, height: 18, borderRadius: 9, background: C.teal }} />
          </div>
          <div style={{ marginTop: 16, fontSize: 30, color: C.ink2, opacity: measuring }}>
            マイクを読むのは <b style={{ fontFamily: head }}>{Math.min(5, bar * 5).toFixed(1)}</b> / 5 秒。波形はスマホの外に出ない
          </div>
        </div>
      ) : null}
      <div style={{ opacity: prog(t, 5.8, 0.4) }}>
        <SwapTag text="「3, 2, 1」のあとはじく手元（5 秒）" />
      </div>
    </Paper>
  );
};

/* ---------- 5. 結果 ---------- */
const Bar: React.FC<{ label: string; value: React.ReactNode; h: number; color: string; at: number }> = ({ label, value, h, color, at }) => {
  const s = useSpring(at);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 170 }}>
      <div style={{ fontFamily: head, fontWeight: 900, fontSize: 40, opacity: s }}>{value}</div>
      <div style={{ width: 120, height: 240, display: "flex", alignItems: "flex-end" }}>
        <div style={{ width: 120, height: h * s, borderRadius: "14px 14px 4px 4px", background: color }} />
      </div>
      <div style={{ fontSize: 26, color: C.muted }}>{label}</div>
    </div>
  );
};

export const Result: React.FC = () => {
  const t = useT();
  const first = 1 - prog(t, 4.9, 0.3);
  const second = prog(t, 5.1, 0.4) * (1 - prog(t, 8.0, 0.3));
  return (
    <Paper>
      <Kicker text="④ 結果を予想と比べる" />
      <Phone src="05-result.png" imgH={1286} x={520} scroll={[[0, 0], [6.6, 0], [8.0, 0.5]]}>
        <Mark x={20} y={78} w={360} h={84} at={0.6} until={3.0} color={C.teal} />
        <Mark x={20} y={178} w={360} h={232} at={3.0} until={5.0} color={C.orange} />
        <Mark x={20} y={425} w={360} h={140} at={5.2} until={7.8} color={C.teal} />
        <Mark x={20} y={728} w={360} h={150} at={8.4} color={C.teal} label="先にふり返り" />
      </Phone>
      {first > 0 ? (
        <div style={{ position: "absolute", left: 980, top: 170, width: 820, opacity: first }}>
          <div style={{ fontFamily: head, fontWeight: 900, fontSize: 44 }}>音の高さ（1 秒に震える回数）</div>
          <div style={{ display: "flex", gap: 60, marginTop: 30, marginLeft: 40 }}>
            <Bar label="弱く" value={<><Count to={220} at={0.6} />Hz</>} h={220} color={C.teal} at={0.6} />
            <Bar label="強く" value={<><Count to={222} at={0.9} />Hz</>} h={222} color={C.teal} at={0.9} />
          </div>
          <div style={{ position: "absolute", left: 250, top: 120 }}>
            <Stamp text="変わらなかった" at={2.6} color={C.ink} size={58} />
          </div>
        </div>
      ) : null}
      {second > 0 ? (
        <div style={{ position: "absolute", left: 980, top: 170, width: 820, opacity: second }}>
          <div style={{ fontFamily: head, fontWeight: 900, fontSize: 44 }}>音の大きさ</div>
          <div style={{ display: "flex", gap: 60, marginTop: 30, marginLeft: 40 }}>
            <Bar label="弱く" value="-35 dB" h={80} color={C.orange} at={5.3} />
            <Bar label="強く" value="-23 dB" h={220} color={C.orange} at={5.6} />
          </div>
          <div style={{ position: "absolute", left: 420, top: 160 }}>
            <Stamp text="+12 dB" at={6.4} color={C.orange} size={64} rotate={6} />
          </div>
          <div style={{ marginTop: 26, fontSize: 32, color: C.ink2, opacity: prog(t, 6.8, 0.4) }}>変わったのは、高さではなく大きさ。</div>
        </div>
      ) : null}
      <Sequence from={Math.round(8.2 * 30)} layout="none">
        <SideText title="正解とは言わない。測定が言っていることを見せる。" sub="予想と食い違ったら、次へ進む前に、まずふり返り。" subAt={0.6} x={980} y={300} w={840} size={52} />
      </Sequence>
      <Logo />
    </Paper>
  );
};

