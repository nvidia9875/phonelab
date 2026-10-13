import React from "react";
import { Composition } from "remotion";
import { Demo, TOTAL_FRAMES } from "./Demo";
import { FPS, H, W } from "./theme";

export const Root: React.FC = () => (
  <Composition id="PhoneLabDemo" component={Demo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} />
);
