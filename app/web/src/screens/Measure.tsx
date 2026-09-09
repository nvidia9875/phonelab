import { Button, Card, Check, Checks, Counter, Eyebrow, Foot, FootNote, Grid2, Note, Screen, Stat, Wave } from "../components/ui";
import type { LocalCheck } from "../measure/pendulum";
import { measurement } from "../sample/data";

export type MeasureView = {
  elapsed: number;
  seconds: number;
  conditionLabel: string;
  tAccel: number | null;
  tGyro: number | null;
  checks: { ok: boolean; text: string }[];
  previousHold?: string;
  sentBytes: number | null;
  done: boolean;
};

/** サンプル値（見た目確認用） */
export function sampleMeasureView(): MeasureView {
  const m = measurement;
  return {
    elapsed: m.seconds,
    seconds: m.seconds,
    conditionLabel: m.conditionLabel,
    tAccel: m.tAccel,
    tGyro: m.tGyro,
    checks: [
      { ok: true, text: `欠測なし（${m.rateHz} Hz で連続）` },
      { ok: true, text: "飽和なし" },
      { ok: true, text: `二つのセンサーの周期が一致（差 ${Math.abs(m.tAccel - m.tGyro).toFixed(2)} s、許容 ${m.tolerance.toFixed(2)} s）` },
    ],
    previousHold: m.previousHold,
    sentBytes: m.sentBytes,
    done: true,
  };
}

/** 端末内検査の結果を画面の 3 行に要約する（詳細は保留画面で出す） */
export function checksToRows(checks: LocalCheck[]): { ok: boolean; text: string }[] {
  const pick = (code: LocalCheck["code"]) => checks.find((c) => c.code === code)!;
  const rate = pick("low_rate"), gap = pick("gap"), sat = pick("saturation"), two = pick("two_clocks_disagree");
  return [
    { ok: rate.ok && gap.ok, text: rate.ok && gap.ok ? rate.text : gap.ok ? rate.text : gap.text },
    { ok: sat.ok, text: sat.text },
    { ok: two.ok, text: two.text },
  ];
}

export function Measure({ view, onStop, onContinue }: { view: MeasureView; onStop: () => void; onContinue?: () => void }) {
  const fmt = (v: number | null) => (v !== null && Number.isFinite(v) ? v.toFixed(2) : "—");
  const sub = view.done ? `${view.conditionLabel}の測定が終わりました。検査の結果です` : `${view.conditionLabel}を測っています。画面はこのまま`;
  return (
    <Screen badge={view.done ? "2 検査" : "2 測定中"} tone="teal">
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
        <Eyebrow>機械の検査（Agent は見ていない）</Eyebrow>
        <Checks>
          {view.done ? (
            view.checks.map((c, i) => (
              <Check key={i} warn={!c.ok}>
                {c.text}
              </Check>
            ))
          ) : (
            <Check>測定が終わってから検査します</Check>
          )}
        </Checks>
      </Card>

      {view.previousHold && <Note>{view.previousHold}</Note>}

      <Foot>
        <FootNote>
          {view.sentBytes !== null
            ? `送信するのは特徴量だけ、約 ${view.sentBytes} バイト。波形は端末の中`
            : "波形は端末の中。送るのは周期などの数値だけ"}
        </FootNote>
        {view.done && onContinue ? <Button onClick={onContinue}>{view.checks.every((c) => c.ok) ? "結果を見る" : "検査の結果を見る"}</Button> : null}
        <Button secondary onClick={onStop}>{view.done ? "やり直す" : "測定をやめる"}</Button>
      </Foot>
    </Screen>
  );
}
