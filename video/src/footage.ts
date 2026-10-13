// 撮った実写・画面録画。public/footage/ に置いて、ここにファイル名を書くと、その場面がアニメーションから実写に替わる。
// null のままならアニメーション。startFrom は使い始める秒（動画の頭を飛ばすとき）
export type Clip = { file: string; startFrom?: number; muted?: boolean } | null;

export const FOOTAGE: Record<"pluck" | "pendulumSide" | "pendulumScreen" | "haltTeacher" | "haltPhone" | "trace", Clip> = {
  /** 0:00 つかみ: 箱にかけた輪ゴムを指ではじく手元（横向き、8 秒） */
  pluck: null,
  /** 2:06 家で: 袋に入れたスマホの振り子を横から（横向き、15 秒） */
  pendulumSide: null,
  /** 2:06 家で: その測定中のスマホの画面収録（3, 2, 1 → 結果） */
  pendulumScreen: null,
  /** 1:51 止めるのは人: 先生の PC で「全端末の測定を止める」を押す画面録画 */
  haltTeacher: null,
  /** 1:51 止めるのは人: 同じときの生徒のスマホの画面収録 */
  haltPhone: null,
  /** 2:42 記録: 本物の Cloud Trace の画面録画（6 秒） */
  trace: null,
};
