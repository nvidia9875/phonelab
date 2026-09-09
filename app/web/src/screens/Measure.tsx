import { Button, Card, Check, Checks, Counter, Eyebrow, Foot, FootNote, Grid2, Note, Screen, Stat, Wave } from "../components/ui";
import type { LocalCheck } from "../measure/pendulum";

export interface MeasureView {
  phase: "measuring" | "done" | "denied";
  elapsed: number;
  seconds: number;
  conditionLabel: string;
  tAccel: number | null;
  tGyro: number | null;
  checks: { ok: boolean; text: string }[];
  previousHold?: string;
  sentBytes: number | null;
  allOk: boolean;
  deniedReason?: string;
}

/** 端末内検査の結果を画面の 3 行に要約する（詳細は保留画面で出す） */
export function checksToRows(checks: LocalCheck[]): { ok: boolean; text: string }[] {
  const pick = (code: LocalCheck["code"]) => checks.find((c) => c.code === code)!;
  const rate = pick("low_rate"), gap = pick("gap"), sat = pick("saturation"), two = pick("two_clocks_disagree");
  return [
    { ok: rate.ok && gap.ok, text: rate.ok && gap.ok ? `欠測なし（${rate.text.replace("サンプリング ", "")} で連続）` : gap.ok ? rate.text : gap.text },
    { ok: sat.ok, text: sat.text },
    { ok: two.ok, text: two.text },
  ];
}

export interface MeasureProps {
  view: MeasureView;
  onStop: () => void;
  onContinue: () => void;
  onDemo?: () => void;
}

/** 画面 2: 測定と検査。測定中はトップへのリンクを出さない */
export function Measure({ view, onStop, onContinue, onDemo }: MeasureProps) {
  const fmt = (v: number | null) => (v !== null && Number.isFinite(v) ? v.toFixed(2) : "—");
  const done = view.phase === "done";
  const sub =
    view.phase === "measuring"
      ? `${view.conditionLabel}を測っています。画面はこのまま`
      : view.phase === "done"
        ? `${view.conditionLabel}の測定が終わりました。検査の結果です`
        : view.deniedReason ?? "測れませんでした";
  return (
    <Screen badge={done ? "2 検査" : view.phase === "denied" ? "測れません" : "2 測定中"} tone={view.phase === "denied" ? "ink" : "teal"}>
      <Counter value={Math.floor(view.elapsed)} of={view.seconds} sub={sub} />

      <Grid2>
        <Stat label="加速度" value={fmt(view.tAccel)} md>
          <Wave />
        </Stat>
        <Stat label="ジャイロ（独立した2本目）" value={fmt(view.tGyro)} md>
          <Wave dashed />
        </Stat>
      </Grid2>

      <Card variant="line">
        <Eyebrow>機械の検査（AI は見ていない）</Eyebrow>
        <Checks>
          {done ? (
            view.checks.map((c, i) => (
              <Check key={i} warn={!c.ok}>
                {c.text}
              </Check>
            ))
          ) : view.phase === "denied" ? (
            <Check warn>{view.deniedReason}</Check>
          ) : (
            <Check>測定が終わってから検査します</Check>
          )}
        </Checks>
      </Card>

      {view.previousHold && <Note>{view.previousHold}</Note>}

      <Foot>
        <FootNote>{view.sentBytes !== null ? `送るのは特徴量だけ、約 ${view.sentBytes} バイト。波形は端末の中` : "波形は端末の中。送るのは周期などの数値だけ"}</FootNote>
        {done && <Button onClick={onContinue}>{view.allOk ? "次へ" : "検査の結果を見る"}</Button>}
        {view.phase === "denied" && onDemo && (
          <Button onClick={onDemo}>この端末では測れないので、サンプルの測定で進む（デモ）</Button>
        )}
        <Button secondary onClick={onStop}>{view.phase === "measuring" ? "測定をやめる" : "準備に戻る"}</Button>
      </Foot>
    </Screen>
  );
}
