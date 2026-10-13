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
import { End, Governance, Numbers, System, Trace } from "./scenes/system";
import { C, FADE, FPS } from "./theme";

type Scene = { sec: number; el: React.ReactNode; enter?: "fade" | "slide" | "wipe" | "up" };

const SCENES: Scene[] = [
  { sec: 9, el: <Opening /> },
  { sec: 8, el: <Problem />, enter: "wipe" },
  { sec: 10.5, el: <Predict />, enter: "slide" },
  { sec: 10.5, el: <Plan />, enter: "slide" },
  { sec: 11, el: <Permit />, enter: "slide" },
  { sec: 13, el: <Result />, enter: "slide" },
  { sec: 8, el: <Reflect />, enter: "fade" },
  { sec: 15, el: <Hold />, enter: "wipe" },
  { sec: 12.5, el: <Reject />, enter: "slide" },
  { sec: 18, el: <Teacher />, enter: "up" },
  { sec: 15, el: <Halt />, enter: "fade" },
  { sec: 15, el: <Home />, enter: "wipe" },
  { sec: 15, el: <Governance />, enter: "up" },
  { sec: 7, el: <System />, enter: "slide" },
  { sec: 6, el: <Trace />, enter: "slide" },
  { sec: 8, el: <Numbers />, enter: "wipe" },
  { sec: 5, el: <End />, enter: "fade" },
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
