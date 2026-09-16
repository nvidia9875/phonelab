import { Button, Card, Check, Checks, Counter, Eyebrow, Foot, FootNote, Grid2, Note, Screen, Stat, Wave } from "../components/ui";
import { formatNumber, type Unit } from "../catalog/quantity";
import type { CheckCode, LocalCheck } from "../measure/checks";
import "./measure.css";

export interface MeasureView {
  phase: "requesting" | "countdown" | "measuring" | "done" | "denied";
  elapsed: number;
  seconds: number;
  conditionLabel: string;
  /** 二本の時計（測定中は値なし） */
  clocks: { label: string; value: number | null }[];
  unit: Unit;
  checks: { ok: boolean; text: string }[];
  previousHold?: string;
  sentBytes: number | null;
  allOk: boolean;
  deniedReason?: string;
  /** 許可の確認を待っているときに出す一文 */
  waitingFor?: string;
  /** カウントダウンの残り（3, 2, 1） */
  countdown?: number;
  /** 0 の合図と、測定中に大きく出す一言（「はじいて！」など） */
  cue?: string;
}

type Row = { ok: boolean; text: string };

/** 画面に出す 3 行: 途切れ・音の量 / 飽和・動き出し / 二本の時計と値の妥当さ。全コードをどれかに入れる（抜けると緑に見えて次で保留になる） */
const ROW_GROUPS: CheckCode[][] = [
  ["low_rate", "gap", "low_voiced", "low_snr"],
  ["saturation", "clipping", "no_signal", "no_release"],
  ["two_clocks_disagree", "unstable", "weak_autocorr", "out_of_range"],
];

/** 端末内検査の結果を画面の 3 行に要約する（詳細は保留画面で出す） */
export function checksToRows(checks: LocalCheck[]): Row[] {
  return ROW_GROUPS.flatMap((codes) => {
    const group = checks.filter((c) => codes.includes(c.code));
    if (group.length === 0) return [];
    const bad = group.find((c) => !c.ok);
    return [{ ok: !bad, text: bad ? bad.text : group.map((c) => c.text).join("、") }];
  });
}

export interface MeasureProps {
  view: MeasureView;
  onStop: () => void;
  onContinue: () => void;
  onDemo?: () => void;
  /** 検査を通っても「うまく取れなかった」ときの測り直し。上限に達していたら渡さない */
  onRemeasure?: () => void;
}

const BADGE: Record<MeasureView["phase"], string> = {
  requesting: "許可の確認",
  countdown: "準備",
  measuring: "2 測定中",
  done: "2 検査",
  denied: "測れません",
};

/** 画面 2: 測定と検査。測定中はトップへのリンクを出さない */
export function Measure({ view, onStop, onContinue, onDemo, onRemeasure }: MeasureProps) {
  const done = view.phase === "done";
  const waiting = view.phase === "requesting";
  const counting = view.phase === "countdown";
  const sub =
    view.phase === "measuring"
      ? `${view.conditionLabel}を測っています。画面はこのまま`
      : done
        ? `${view.conditionLabel}の測定が終わりました。検査の結果です`
        : waiting
          ? view.waitingFor ?? "許可を待っています"
          : view.deniedReason ?? "測れませんでした";
  return (
    <Screen badge={BADGE[view.phase]} tone={view.phase === "denied" || waiting ? "ink" : counting ? "orange" : "teal"}>
      {counting ? (
        <div className="countdown" aria-live="assertive">
          <p className="countdown__ready">準備はいい？</p>
          <p key={view.countdown} className="countdown__n">{view.countdown}</p>
          <p className="countdown__cue">0 になったら「{view.cue}」</p>
          <p className="countdown__label">{view.conditionLabel}</p>
        </div>
      ) : (
        <>
          <Counter value={Math.floor(view.elapsed)} of={view.seconds} sub={sub} />
          {view.phase === "measuring" && view.cue && (
            <p key={view.cue} className="go-cue" aria-live="assertive">
              {view.cue}
            </p>
          )}
          <Grid2>
            {view.clocks.map((c, i) => (
              <Stat key={c.label} label={c.label} value={c.value !== null ? formatNumber(c.value, view.unit) : "—"} unit={view.unit} md>
                <Wave dashed={i === 1} />
              </Stat>
            ))}
          </Grid2>
        </>
      )}

      <Card variant="line">
        <Eyebrow>機械の検査（ラボ先生は見ていない）</Eyebrow>
        <Checks>
          {done ? (
            view.checks.map((c, i) => (
              <Check key={i} warn={!c.ok}>
                {c.text}
              </Check>
            ))
          ) : view.phase === "denied" ? (
            <>
              <Check warn>{view.deniedReason}</Check>
              {!onDemo && <Check>センサーの無い端末で流れを試すなら、設定の「テストモード」でサンプルの測定を使えます</Check>}
            </>
          ) : waiting || counting ? (
            <Check>合図のあとで測り始めます。それまでセンサーは読みません</Check>
          ) : (
            <Check>測定が終わってから検査します</Check>
          )}
        </Checks>
      </Card>

      {view.previousHold && <Note>{view.previousHold}</Note>}

      <Foot>
        <FootNote>{view.sentBytes !== null ? `送るのは特徴量だけ、約 ${view.sentBytes} バイト。波形は端末の中` : "波形は端末の中。送るのは速さや高さなどの数値だけ"}</FootNote>
        {done && <Button onClick={onContinue}>{view.allOk ? "次へ" : "検査の結果を見る"}</Button>}
        {done && onRemeasure && <Button secondary onClick={onRemeasure}>うまく取れなかった。もう一度測る</Button>}
        {(view.phase === "denied" || waiting) && onDemo && (
          <Button secondary={waiting} onClick={onDemo}>{waiting ? "許可を出せない端末なら、サンプルの測定で進む（デモ）" : "この端末では測れないので、サンプルの測定で進む（デモ）"}</Button>
        )}
        <Button secondary onClick={onStop}>{view.phase === "measuring" || counting ? "測定をやめる" : "準備に戻る"}</Button>
      </Foot>
    </Screen>
  );
}
