// ふり返り・保留・却下・先生の画面・停止・家で
import React from "react";
import { Easing, OffthreadVideo, Sequence, staticFile } from "remotion";
import { FOOTAGE } from "../footage";
import { Chip, Mark, Pop, prog, Stamp, Tap, Type, useSpring, useT, Wave } from "../anim";
import { Caption, Kicker, Logo, Paper } from "../components";
import { Browser, FootageLabel, Phone } from "../devices";
import { body, C, head } from "../theme";
import { SideText, SwapTag } from "./student";

const RED = "#C94A3D";
const sec = (s: number) => Math.round(s * 30);

/* ---------- 6. ふり返り ---------- */
export const Reflect: React.FC = () => {
  const t = useT();
  const typing = t > 1.9 && t < 3.0;
  return (
    <Paper>
      <Kicker text="ふり返り" color={C.teal} />
      <Phone src="06-chat.png" imgH={879} x={620} scroll={[[0, 0]]}>
        <Pop src="06-chat.png" imgW={400} x={68} y={260} w={314} h={92} at={0.8} origin="100% 100%" />
        <Pop src="06-chat.png" imgW={400} x={18} y={360} w={314} h={162} at={3.0} origin="0% 0%" />
        {typing ? (
          <div style={{ position: "absolute", left: 22, top: 366, width: 86, height: 44, borderRadius: 14, border: `2px solid ${C.ink}`, background: C.card, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: 5, background: C.muted, transform: `translateY(${Math.sin(t * 10 - i) * 4}px)` }} />
            ))}
          </div>
        ) : null}
        <Mark x={20} y={362} w={310} h={158} at={4.4} color={C.teal} label="答えは言わない" />
      </Phone>
      <SideText title="ふり返りでも、ラボ先生は答えを言わずに問い返す。" sub="説明が聞けるのは、自分の考えを書いたあと。" subAt={4.6} />
      <Logo />
    </Paper>
  );
};

/* ---------- 7. 保留 ---------- */
export const Hold: React.FC = () => {
  const t = useT();
  const noisy = prog(t, 1.0, 2.6, Easing.inOut(Easing.cubic));
  const bad = t > 3.4;
  const fail = prog(t, 3.6, 0.4);
  const proposal = useSpring(6.4);
  return (
    <Paper>
      <Kicker text="保留" color={C.ink} />
      <div style={{ position: "absolute", left: 100, top: 130, width: 900, height: 640, background: C.card, border: `3px solid ${bad ? RED : C.ink}`, borderRadius: 26, boxShadow: `0 6px 0 ${bad ? RED : C.ink}`, padding: "32px 40px" }}>
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 36 }}>「強く」を測っています</div>
        <div style={{ marginTop: 30 }}>
          <Wave w={820} h={240} freq={9} amp={1 - 0.75 * noisy} noise={0.85 * noisy} color={bad ? RED : C.teal} speed={6} />
        </div>
        <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 14, fontSize: 30 }}>
          <div style={{ color: C.ink2 }}>✓ 音割れなし</div>
          <div style={{ color: bad ? RED : C.ink2, fontWeight: 700, opacity: 0.4 + 0.6 * fail }}>
            {bad ? "✕ 音が小さく、まわりの雑音と区別できない" : "… 雑音との差を調べています"}
          </div>
        </div>
        <div style={{ position: "absolute", right: 40, top: 70 }}>
          <Stamp text="保留" at={4.3} color={RED} size={110} rotate={-10} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 1060, top: 230, width: 760, opacity: proposal, transform: `translateX(${(1 - proposal) * 120}px)` }}>
        <div style={{ background: C.ink, color: "#fff", borderRadius: 24, padding: "30px 34px", boxShadow: `0 6px 0 ${C.teal}` }}>
          <div style={{ fontFamily: head, fontWeight: 900, fontSize: 30, color: "#7FD6D2" }}>ラボ先生の次の一手：同じ実験で直す</div>
          <div style={{ position: "relative", height: 150, marginTop: 14 }}>
            <Type x={0} y={0} w={690} h={150} text="スマホを箱に 10 cm まで近づけ、合図のあと 1 秒待ってからはじこう。" from={6.9} to={9.8} bg={C.ink} size={34} color="#fff" family={body} />
          </div>
        </div>
        <div style={{ marginTop: 34, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Chip at={10.2} color={C.ink}>結論は出さない</Chip>
          <Chip at={10.6} color={C.teal}>理由を読んで提案</Chip>
        </div>
      </div>
      <Caption text="怪しいデータでは、結論を出さない（保留）。" sub="雑音が大きい・二つの計算が食い違うときは、測り直し方か別の実験をラボ先生が提案する" />
      <div style={{ position: "absolute", left: 0, top: 0, opacity: prog(t, 0.5, 0.5) }}>
        <SwapTag text="騒がしい隣の班 5 秒 ＋ 保留の画面 10 秒" />
      </div>
    </Paper>
  );
};

/* ---------- 8. 却下 ---------- */
export const Reject: React.FC = () => {
  const t = useT();
  const move = prog(t, 0.6, 1.2, Easing.in(Easing.cubic));
  const bounce = prog(t, 1.8, 0.6, Easing.out(Easing.back(2)));
  const hit = t > 1.8;
  const cardX = 100 + move * 360 - bounce * 120;
  const shake = hit && t < 2.3 ? Math.sin(t * 80) * 8 : 0;
  const glow = hit ? 1 - prog(t, 1.8, 1.2) : 0;
  const alt = useSpring(3.6);
  return (
    <Paper>
      <Kicker text="却下" color={C.ink} />
      {/* 生徒の文 */}
      <div style={{ position: "absolute", left: cardX + shake, top: 250, width: 440, padding: "22px 24px", background: C.card, border: `3px solid ${hit ? RED : C.orange}`, borderRadius: 20, fontSize: 28, lineHeight: 1.5, boxShadow: `0 5px 0 ${hit ? RED : C.orange}` }}>
        <div style={{ fontSize: 20, color: C.muted, marginBottom: 6 }}>生徒の文</div>
        ペットボトルを窓から落として、落ちる音の高さを測りたい
        {hit ? <div style={{ position: "absolute", right: -22, top: -22, width: 54, height: 54, borderRadius: 27, background: RED, color: "#fff", display: "grid", placeItems: "center", fontFamily: head, fontWeight: 900, fontSize: 34 }}>✕</div> : null}
      </div>
      {/* 盾 */}
      <svg width={220} height={260} style={{ position: "absolute", left: 610, top: 200, overflow: "visible" }}>
        <circle cx={110} cy={120} r={110 + glow * 40} fill={`rgba(201,74,61,${0.18 * glow})`} />
        <path d="M110 10 L200 45 L200 120 C200 185 160 225 110 250 C60 225 20 185 20 120 L20 45 Z" fill={C.ink} />
        <path d="M70 125 L100 155 L155 95" fill="none" stroke="#7FD6D2" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ position: "absolute", left: 590, top: 480, width: 260, textAlign: "center", fontFamily: head, fontWeight: 900, fontSize: 26 }}>決定論の Policy</div>
      {/* AI は呼ばない */}
      <div style={{ position: "absolute", left: 900, top: 250, width: 230, height: 180, borderRadius: 24, background: C.sand, border: `3px dashed ${C.muted}`, display: "grid", placeItems: "center", textAlign: "center", opacity: 0.5 + 0.5 * prog(t, 2.0, 0.4) }}>
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 30, color: C.muted }}>Gemini</div>
        <div style={{ fontSize: 22, color: RED, fontWeight: 700, marginTop: -30 }}>呼ばない</div>
      </div>
      <div style={{ position: "absolute", left: 300, top: 540 }}>
        <Stamp text="却下" at={2.2} color={RED} size={90} />
      </div>
      <div style={{ position: "absolute", left: 100, top: 700, width: 1020, opacity: alt, transform: `translateY(${(1 - alt) * 40}px)`, display: "flex", alignItems: "center", gap: 18, background: C.card, border: `3px solid ${C.teal}`, borderRadius: 20, padding: "20px 26px", boxShadow: `0 5px 0 ${C.teal}` }}>
        <span style={{ fontFamily: head, fontWeight: 900, fontSize: 26, color: "#13807C", flex: "none" }}>代わりの実験</span>
        <span style={{ fontSize: 30 }}>同じボトルで、水の量だけ変える</span>
      </div>
      <Phone src="08-rejected.png" imgH={860} x={1500} enter={3.0}>
        <Mark x={20} y={195} w={360} h={220} at={4.6} until={7.0} color={RED} label="理由 3 つ" />
        <Mark x={20} y={433} w={360} h={160} at={7.2} color={C.teal} />
      </Phone>
      <Caption text="危ない実験と、メモに紛れた命令は、AI を呼ぶ前に機械が止める。" sub="止めた理由と代わりの実験を出し、記録に残す" />
    </Paper>
  );
};

/* ---------- 9. 先生の画面 ---------- */
const Wipe: React.FC<{ x: number; y: number; w: number; h: number; at: number; dur?: number; bg?: string }> = ({ x, y, w, h, at, dur = 0.7, bg = C.card }) => {
  const t = useT();
  const p = prog(t, at, dur, Easing.inOut(Easing.cubic));
  return <div style={{ position: "absolute", left: x + w * p, top: y, width: w * (1 - p), height: h, background: bg }} />;
};

export const Teacher: React.FC = () => (
  <Paper>
    <Kicker text="先生の画面" />
    <Browser
      src="07-teacher.png"
      imgW={1280}
      x={150}
      w={1620}
      h={760}
      camera={[
        [0, 1, 640, 282],
        [4.4, 1, 640, 282],
        [5.8, 2.05, 1000, 300],
        [11.6, 2.05, 1000, 300],
        [13.0, 2.0, 380, 225],
        [18, 2.0, 380, 225],
      ]}
    >
      <Wipe x={772} y={183} w={470} h={28} at={6.2} />
      <Wipe x={772} y={210} w={470} h={52} at={7.0} />
      <Wipe x={772} y={260} w={470} h={30} at={7.8} />
      <Wipe x={770} y={290} w={470} h={40} at={8.6} dur={0.5} />
      <Tap x={1180} y={158} at={5.6} />
      <Mark x={842} y={292} w={360} h={38} at={9.4} until={11.4} color={C.orange} label="見に行く順" />
      <Wipe x={175} y={186} w={470} h={20} at={13.4} dur={0.9} />
      <Wipe x={175} y={215} w={470} h={20} at={13.7} dur={0.9} />
      <Mark x={40} y={140} w={680} h={160} at={14.6} color={C.teal} label="予想の分布" />
    </Browser>
    <Caption text="先生にはラボ先生の見立て。学級の要約を読み、3 行と見に行く順で伝える。" sub="ラボ先生は提案するだけ。止める・許可を変えるのは先生のボタン" />
  </Paper>
);

/* ---------- 10. 止めるのは人 ---------- */
export const Halt: React.FC = () => {
  const t = useT();
  const sent = t > 2.3;
  // 録画のときは本物の時間（押してから 2 秒で止まる）
  const timer = FOOTAGE.haltPhone ? Math.min(2.0, Math.max(0, t - 2.0)) : Math.min(1.5, Math.max(0, t - 2.4) * 0.9);
  return (
    <Paper>
      <Kicker text="止めるのは人" color={C.ink} />
      <Browser
        src="07-teacher.png"
        imgW={1280}
        x={80}
        w={1000}
        h={720}
        camera={FOOTAGE.haltTeacher ? [[0, 1.25, 640, 300], [1.0, 2.3, 1010, 150], [15, 2.3, 1010, 150]] : [[0, 2.5, 1000, 165]]}
        video={FOOTAGE.haltTeacher}
      >
        <Tap x={1147} y={50} at={2.0} />
        {sent && !FOOTAGE.haltTeacher ? <div style={{ position: "absolute", left: 1047, top: 28, width: 201, height: 44, borderRadius: 10, background: RED, color: "#fff", display: "grid", placeItems: "center", fontFamily: head, fontWeight: 900, fontSize: 15, opacity: prog(t, 2.3, 0.2) }}>測定を止めています</div> : null}
      </Browser>
      {/* 届く合図 */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <path id="sig" d="M 1085 330 C 1150 200, 1200 200, 1262 300" fill="none" stroke={C.line} strokeWidth={4} strokeDasharray="8 10" />
        {[0, 0.25, 0.5, 0.75].map((d) => {
          const p = (t - 2.4 - d) / 1.2;
          if (p < 0 || p > 1 || t > 4.6) return null;
          const x = (1 - p) ** 3 * 1085 + 3 * (1 - p) ** 2 * p * 1150 + 3 * (1 - p) * p ** 2 * 1200 + p ** 3 * 1262;
          const y = (1 - p) ** 3 * 330 + 3 * (1 - p) ** 2 * p * 200 + 3 * (1 - p) * p ** 2 * 200 + p ** 3 * 300;
          return <circle key={d} cx={x} cy={y} r={12} fill={RED} opacity={1 - p * 0.3} />;
        })}
      </svg>
      <div style={{ position: "absolute", left: 1090, top: 120, width: 170, fontSize: 22, lineHeight: 1.4, color: C.muted, opacity: prog(t, 2.4, 0.3) }}>2 秒ごとの確認で届く</div>
      <Phone src="04-checks.png" imgH={860} x={1490} y={80} swapTo={FOOTAGE.haltPhone ? undefined : { src: "09-halted.png", imgH: 860, at: 4.0 }} video={FOOTAGE.haltPhone} />
      <div style={{ position: "absolute", left: 80, top: 850, opacity: prog(t, 2.4, 0.3) }}>
        <Chip color={RED} solid>
          止まるまで {timer.toFixed(1)} 秒
        </Chip>
      </div>
      <div style={{ position: "absolute", left: 380, top: 850 }}>
        <Chip at={5.4} color={C.ink}>サーバも AI を動かさない（409）</Chip>
      </div>
      <Caption text="止めるのも解除するのも、先生だけ。" sub="測定中のスマホは 2 秒ごとに確かめて止まる。ラボ先生には止める手段が無い" />
    </Paper>
  );
};

/* ---------- 11. 家で ---------- */
export const Home: React.FC = () => (FOOTAGE.pendulumSide || FOOTAGE.pendulumScreen ? <HomeLive /> : <HomeAnim />);

/** 実写の家で: 左に振り子を横から、右にそのときのスマホの画面 */
const HomeLive: React.FC = () => {
  const side = FOOTAGE.pendulumSide;
  return (
    <Paper>
      <Kicker text="家で" />
      {side ? (
        <div style={{ position: "absolute", left: 60, top: 140, width: 1200, height: 675, borderRadius: 26, overflow: "hidden", border: `4px solid ${C.ink}`, boxShadow: `0 6px 0 ${C.ink}` }}>
          <OffthreadVideo src={staticFile(`footage/${side.file}`)} startFrom={Math.round((side.startFrom ?? 0) * 30)} muted={side.muted ?? true} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {side.label ? <FootageLabel text={side.label} /> : null}
        </div>
      ) : null}
      <Phone src="p05-result.png" imgH={1286} x={side ? 1530 : 960} y={90} video={FOOTAGE.pendulumScreen} />
      <Caption text="先生が許可した実験は、家で自分のスマホから。" sub="記録は学校と同じ列に並ぶ" />
    </Paper>
  );
};

const HomeAnim: React.FC = () => {
  const t = useT();
  const L = 380;
  const th0 = 0.5;
  const w = 3.5;
  const th = th0 * Math.cos(w * t) * Math.exp(-0.05 * t);
  const om = Math.abs(th0 * w * Math.sin(w * t) * Math.exp(-0.05 * t));
  const px = 560;
  const py = 170;
  const bx = px + L * Math.sin(th);
  const by = py + L * Math.cos(th);
  const v = (om * 0.8).toFixed(1);
  const vmax = Math.min(1.7, Math.max(0, t - 0.5) * 2).toFixed(1);
  return (
    <Paper>
      <Kicker text="家で" />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <rect x={px - 160} y={py - 14} width={320} height={14} rx={7} fill={C.ink} />
        <path d={`M ${px + L * Math.sin(-th0)} ${py + L * Math.cos(-th0)} A ${L} ${L} 0 0 0 ${px + L * Math.sin(th0)} ${py + L * Math.cos(th0)}`} fill="none" stroke={C.orange} strokeWidth={4} strokeDasharray="10 12" opacity={0.6} />
        <line x1={px} y1={py} x2={bx} y2={by} stroke={C.ink} strokeWidth={5} />
        <g transform={`translate(${bx} ${by}) rotate(${(-th * 180) / Math.PI})`}>
          <rect x={-60} y={-6} width={120} height={96} rx={18} fill={C.card} stroke={C.ink} strokeWidth={6} />
          <rect x={-40} y={10} width={34} height={62} rx={8} fill={C.ink} />
          <rect x={6} y={40} width={34} height={28} rx={6} fill={C.orange} />
        </g>
      </svg>
      <div style={{ position: "absolute", left: 1000, top: 220, width: 800 }}>
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 30, color: C.muted }}>いまの速さ</div>
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 110, color: C.teal, lineHeight: 1.1 }}>
          {v}
          <span style={{ fontSize: 44 }}> m/s</span>
        </div>
        <div style={{ marginTop: 20, fontFamily: head, fontWeight: 900, fontSize: 30, color: C.muted }}>最大の速さ</div>
        <div style={{ fontFamily: head, fontWeight: 900, fontSize: 70, color: C.ink }}>{vmax} m/s</div>
      </div>
      <Sequence from={sec(4)} layout="none">
        <SideText title="先生が許可した実験は、家で自分のスマホから。" sub="記録は学校と同じ列に並ぶ。" subAt={0.8} x={1000} y={620} w={820} size={46} />
      </Sequence>
      <SwapTag text="家の振り子 15 秒" />
    </Paper>
  );
};
