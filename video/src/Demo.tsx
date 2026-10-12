// PhoneLab デモ動画（3 分）のサンプル。台本は docs/storyboard.md。
// 「ここに実写／画面録画」の枠は、撮ったものに差し替える（Slot を <OffthreadVideo> に置き換える）
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { BigLines, Browser, Caption, Diagram, Kicker, Logo, Paper, Phone, Side, Slot, Stat } from "./components";
import { C, FADE, FPS } from "./theme";

type Scene = { sec: number; el: React.ReactNode };
const s = (sec: number) => Math.round(sec * FPS);

const SCENES: Scene[] = [
  {
    sec: 9,
    el: (
      <Paper>
        <Slot kind="実写" seconds={8} what="机の上の輪ゴムと箱、横にスマホ。指で輪ゴムをはじく（音も入れる）" h={560} />
        <div style={{ position: "absolute", left: 80, right: 80, top: 720, textAlign: "center" }}>
          <BigLinesInline />
        </div>
      </Paper>
    ),
  },
  {
    sec: 8,
    el: (
      <Paper dark>
        <BigLines dark size={64} lines={["30 人がそれぞれの予想を確かめる実験を、", "先生が一人で見て回るのは、簡単ではない。"]} />
      </Paper>
    ),
  },
  {
    sec: 10.5,
    el: (
      <Paper>
        <Kicker text="① 予想と理由を書く" />
        <Phone src="02-question-back.png" imgH={1058} x={700} scroll={[0.35, 1]} />
        <Side title="予想を書くまで、実験もセンサーも出てこない。" sub="理由が無ければ、ラボ先生（Gemini）が 1 回だけ聞き返す" />
        <Logo />
      </Paper>
    ),
  },
  {
    sec: 10.5,
    el: (
      <Paper>
        <Kicker text="② ラボ先生が実験を選ぶ" color={C.teal} />
        <Phone src="03-plan.png" imgH={1163} x={700} scroll={[0.1, 0.55]} />
        <Side title="予想を読んで、確かめられる実験をカタログから選ぶ。答えは知らない。" sub="何を読み、何を選び、何を検査したか（判断の跡）が見える" color={C.teal} />
        <Logo />
      </Paper>
    ),
  },
  {
    sec: 11,
    el: (
      <Paper>
        <Kicker text="③ センサーを許可" />
        <Phone src="03-plan.png" imgH={1163} x={600} scroll={[1, 1]} />
        <Slot kind="実写" seconds={5} what="「3, 2, 1」のあと、輪ゴムを弱く・強くはじく手元" x={930} y={110} w={910} h={440} />
        <Side title="マイクを 5 秒だけ。カメラと位置は使わない。" sub="自分で「この実験でやってみる」を押すまで、センサーは動かない" x={930} y={600} w={910} />
        <Logo />
      </Paper>
    ),
  },
  {
    sec: 13,
    el: (
      <Paper>
        <Kicker text="④ 結果を予想と比べる" />
        <Phone src="05-result.png" imgH={1286} x={700} scroll={[0, 0.45]} />
        <Side title="正解とは言わない。「測定が言っていること」を見せる。" sub="予想と食い違ったら、次へ進む前に、まずふり返り" />
        <Logo />
      </Paper>
    ),
  },
  {
    sec: 8,
    el: (
      <Paper>
        <Kicker text="ふり返り" color={C.teal} />
        <Phone src="06-chat.png" imgH={879} x={700} scroll={[0.1, 0.1]} />
        <Side title="ふり返りでも、ラボ先生は答えを言わずに問い返す。" />
        <Logo />
      </Paper>
    ),
  },
  {
    sec: 15,
    el: (
      <Paper>
        <Kicker text="保留" color={C.ink} />
        <Slot kind="実写" seconds={5} what="隣の班が騒がしい（音楽を流して代用）" x={80} y={130} w={820} h={640} />
        <Slot kind="画面録画" seconds={10} what="保留「音が小さく、まわりの雑音と区別できない」→ ラボ先生の測り直しの提案" x={1020} y={130} w={820} h={640} />
        <Caption text="怪しいデータでは結論を出さない（保留）。" sub="理由を読んで、ラボ先生が測り直し方か別の実験を提案する" />
        <Logo />
      </Paper>
    ),
  },
  {
    sec: 12.5,
    el: (
      <Paper>
        <Kicker text="却下" color={C.ink} />
        <Phone src="08-rejected.png" imgH={860} x={700} />
        <Side title="危ない実験と、メモに紛れた命令は、AI を呼ぶ前に機械が止める。" sub="止めた理由と代わりの実験を出し、記録に残す" />
        <Logo />
      </Paper>
    ),
  },
  {
    sec: 18,
    el: (
      <Paper>
        <Kicker text="先生の画面" />
        <Browser src="07-teacher.png" imgW={1280} imgH={1307} x={190} w={1540} h={740} zoom={[1, 1.55]} origin="100% 8%" />
        <Caption text="先生にはラボ先生の見立て。学級の要約を読み、3 行と見に行く順で伝える。" sub="ラボ先生は提案するだけ。設定は変えない" />
      </Paper>
    ),
  },
  {
    sec: 15,
    el: (
      <Paper>
        <Kicker text="止めるのは人" color={C.ink} />
        <Browser src="07-teacher.png" imgW={1280} imgH={1307} x={80} w={1060} h={740} zoom={[1.6, 1.6]} origin="100% 0%" />
        <Sequence from={s(2.5)} premountFor={s(1)}>
          <Phone src="09-halted.png" imgH={860} x={1500} />
        </Sequence>
        <Caption text="「全端末の測定を止める」で、測定中のスマホは 2 秒ごとに確かめて止まる。" sub="サーバもエージェントを動かさない（409）。止めるのも解除するのも先生だけ" />
      </Paper>
    ),
  },
  {
    sec: 15,
    el: (
      <Paper>
        <Kicker text="家で" />
        <Slot kind="実写" seconds={15} what="家。スマホを袋に入れて振り子（下にクッション）→ 結果の画面" />
        <Caption text="先生が許可した実験は、家で自分のスマホから。" sub="記録は学校と同じ列に並ぶ" />
        <Logo />
      </Paper>
    ),
  },
  {
    sec: 15,
    el: (
      <Paper>
        <Diagram src="11-governance.png" from={[1.0, 0, 30]} to={[1.35, -300, -250]} />
        <Caption text="5 つのエージェントを、ADK の統制層が囲む。" sub="入口で止め、Model Armor で確かめ、出口で落ちたら理由を返して作り直す" />
      </Paper>
    ),
  },
  {
    sec: 7,
    el: (
      <Paper>
        <Diagram src="12-system.png" from={[1.0, 0, 20]} to={[1.12, -110, -60]} />
        <Caption text="測るのはスマホ。エージェントは Cloud Run の 1 つのサービス。" sub="Vertex AI（Gemini）・Model Armor・Firestore・Cloud Trace・Secret Manager" />
      </Paper>
    ),
  },
  {
    sec: 6,
    el: (
      <Paper>
        <Kicker text="記録" color={C.teal} />
        <Slot kind="画面録画" seconds={6} what="Cloud Trace：phonelab.plan → invoke_agent → phonelab.policy → phonelab.self_correct" />
        <Caption text="判断の跡は Cloud Trace にも同じ段で残る。生徒の文は残さない。" />
      </Paper>
    ),
  },
  {
    sec: 8,
    el: (
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
    ),
  },
  {
    sec: 5,
    el: (
      <Paper dark>
        <BigLines dark lines={["スマホが実験器具。", "AI は答えを言わない。"]} size={92} />
        <div style={{ position: "absolute", left: 160, bottom: 110, fontSize: 36, color: "#C9D3DE", fontFamily: "inherit" }}>PhoneLab ― 第 5 回 Agentic AI Hackathon with Google Cloud</div>
      </Paper>
    ),
  },
];

function BigLinesInline() {
  return (
    <div style={{ fontWeight: 900, fontSize: 64, lineHeight: 1.3 }}>
      スマホが実験器具。<span style={{ color: C.orange }}>AI は答えを言わない。</span>
    </div>
  );
}

export const TOTAL_FRAMES = SCENES.reduce((a, x) => a + s(x.sec), 0) - FADE * (SCENES.length - 1);

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <TransitionSeries>
      {SCENES.flatMap((x, i) => {
        const seq = (
          <TransitionSeries.Sequence key={`s${i}`} durationInFrames={s(x.sec)} premountFor={FPS}>
            {x.el}
          </TransitionSeries.Sequence>
        );
        return i === 0 ? [seq] : [<TransitionSeries.Transition key={`t${i}`} presentation={fade()} timing={linearTiming({ durationInFrames: FADE })} />, seq];
      })}
    </TransitionSeries>
  </AbsoluteFill>
);
