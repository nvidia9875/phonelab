// PhoneLab デモ動画（3 分）のサンプル。台本は docs/storyboard.md。
// 「実写／画面録画に差し替え」の札がある場面は、撮ったものに置き換える（video/README.md）
import React from "react";
import { AbsoluteFill } from "remotion";
import { linearTiming, springTiming, TransitionPresentation, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { Halt, Hold, Home, Reflect, Reject, Teacher } from "./scenes/guard";
import { Opening, Permit, Plan, Predict, Problem, Result } from "./scenes/student";
import { Governance, Numbers, System, Trace } from "./scenes/system";
import { EndRecap, PainAI, PainTime } from "./scenes/pain";
import { C, FADE, FPS } from "./theme";

type Scene = { sec: number; el: React.ReactNode; enter?: "fade" | "slide" | "wipe" | "up" };

const SCENES: Scene[] = [
  // 先生の困りごと 3 つ → だから PhoneLab
  { sec: 7, el: <PainTime /> },
  { sec: 8, el: <Problem />, enter: "fade" },
  { sec: 7, el: <PainAI />, enter: "wipe" },
  { sec: 9, el: <Opening />, enter: "fade" },
  // 生徒の 1 回
  { sec: 10.5, el: <Predict />, enter: "slide" },
  { sec: 10.5, el: <Plan />, enter: "slide" },
  { sec: 11, el: <Permit />, enter: "slide" },
  { sec: 12, el: <Result />, enter: "slide" },
  { sec: 7, el: <Reflect />, enter: "fade" },
  // 怪しい・危ないとき
  { sec: 12, el: <Hold />, enter: "wipe" },
  { sec: 12, el: <Reject />, enter: "slide" },
  // 先生
  { sec: 14, el: <Teacher />, enter: "up" },
  { sec: 13, el: <Halt />, enter: "fade" },
  { sec: 12, el: <Home />, enter: "wipe" },
  // 仕組みと数字
  { sec: 14, el: <Governance />, enter: "up" },
  { sec: 7, el: <System />, enter: "slide" },
  { sec: 6, el: <Trace />, enter: "slide" },
  { sec: 7, el: <Numbers />, enter: "wipe" },
  { sec: 8, el: <EndRecap />, enter: "fade" },
];

const s = (sec: number) => Math.round(sec * FPS);

type P = TransitionPresentation<Record<string, unknown>>;
function presentation(kind: Scene["enter"]): P {
  switch (kind) {
    case "slide":
      return slide({ direction: "from-right" }) as P;
    case "up":
      return slide({ direction: "from-bottom" }) as P;
    case "wipe":
      return wipe({ direction: "from-left" }) as P;
    default:
      return fade() as P;
  }
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
        if (i === 0) return [seq];
        const timing = x.enter === "fade" ? linearTiming({ durationInFrames: FADE }) : springTiming({ config: { damping: 200 }, durationInFrames: FADE });
        return [<TransitionSeries.Transition key={`t${i}`} presentation={presentation(x.enter)} timing={timing} />, seq];
      })}
    </TransitionSeries>
  </AbsoluteFill>
);
