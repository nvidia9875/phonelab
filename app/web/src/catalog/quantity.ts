/** 測る量ごとの言葉と桁（判定文・選択肢・表示）。「正解」「間違い」は使わない */
export type Unit = "s" | "m/s" | "Hz";

export interface QuantityWords {
  /** 判定文の主語 */
  name: string;
  faster: string;
  slower: string;
  /** 予想の選択肢 */
  choiceFaster: string;
  choiceSlower: string;
  digits: number;
  /** 値が大きいほど「速い / 高い」か（周期は短いほど速い） */
  largerIsFaster: boolean;
}

export const QUANTITY: Record<Unit, QuantityWords> = {
  s: { name: "周期", faster: "短くなった", slower: "長くなった", choiceFaster: "速くなる", choiceSlower: "遅くなる", digits: 2, largerIsFaster: false },
  "m/s": { name: "いちばん下を通る速さ", faster: "速くなった", slower: "遅くなった", choiceFaster: "速くなる", choiceSlower: "遅くなる", digits: 2, largerIsFaster: true },
  Hz: { name: "音の高さ", faster: "高くなった", slower: "低くなった", choiceFaster: "高くなる", choiceSlower: "低くなる", digits: 0, largerIsFaster: true },
};

export function formatNumber(v: number, unit: Unit): string {
  return Number.isFinite(v) ? v.toFixed(QUANTITY[unit].digits) : "—";
}

export function formatQuantity(v: number, unit: Unit): string {
  return `${formatNumber(v, unit)} ${unit}`;
}
