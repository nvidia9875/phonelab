import React from "react";
import { Composition, Still } from "remotion";
import { Demo, TOTAL_FRAMES } from "./Demo";
import { PendulumCG, PendulumRoom } from "./cg/Pendulum";
import { PluckCG, PluckRoom } from "./cg/Pluck";
import { FPS, H, W } from "./theme";

export const Root: React.FC = () => (
  <>
    <Composition id="PhoneLabDemo" component={Demo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} />
    {/* 実写の代わりの CG。書き出して public/footage/ に置き、src/footage.ts から使う。部屋は先に public/cg/ へ 1 枚書き出す */}
    <Still id="CGPendulumRoom" component={PendulumRoom} width={W} height={H} />
    <Still id="CGPluckRoom" component={PluckRoom} width={W} height={H} />
    <Composition id="CGPluck" component={PluckCG} durationInFrames={9 * FPS} fps={FPS} width={W} height={H} />
    <Composition id="CGPendulum" component={PendulumCG} durationInFrames={15 * FPS} fps={FPS} width={W} height={H} />
  </>
);
