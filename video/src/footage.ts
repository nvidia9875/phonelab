// 撮った実写・画面録画。public/footage/ に置いて、ここにファイル名を書くと、その場面がアニメーションから実写に替わる。
// null のままならアニメーション。startFrom は使い始める秒（動画の頭を飛ばすとき）。label は映像の隅に出す注記（いまは使っていない）
export type Clip = { file: string; startFrom?: number; muted?: boolean; label?: string } | null;

export const FOOTAGE: Record<"pluck" | "pendulumSide" | "pendulumScreen" | "haltTeacher" | "haltPhone" | "trace", Clip> = {
  /** 0:00 つかみ: 箱にかけた輪ゴムを指ではじく手元（CG、音つき 9 秒） */
  pluck: { file: "cg-pluck.mp4", muted: false },
  /** 2:06 家で: 袋に入れたスマホの振り子を横から（CG。揺れは右の画面録画のセンサーと同じ式、同じ時刻に放す） */
  pendulumSide: { file: "cg-pendulum-side.mp4", startFrom: 3 },
  /** 2:06 家で: その測定中のスマホの画面（本物のアプリの画面録画。センサーの値は振り子の式で再現） */
  pendulumScreen: { file: "pendulum-screen-measure.mp4", startFrom: 3 },
  /** 1:51 止めるのは人: 先生の PC で「全端末の測定を止める」を押す画面録画（本物のアプリ、6.71 秒で押す） */
  haltTeacher: { file: "halt-teacher.mp4", startFrom: 4.71 },
  /** 1:51 止めるのは人: 同じときの生徒のスマホの画面録画（8.72 秒で止まる） */
  haltPhone: { file: "halt-phone.mp4", startFrom: 4.71 },
  /** 2:42 記録: 本物の Cloud Trace の画面録画（6 秒） */
  trace: null,
};
