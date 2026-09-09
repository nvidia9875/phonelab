import { Button, Card, CardBody, CardTitle, Check, Checks, Eyebrow, Foot, FootNote, Screen, Wave } from "../components/ui";
import type { LocalCheck } from "../measure/pendulum";

export interface HoldProps {
  checks: LocalCheck[];
  conditionLabel: string;
  retry: number;
  maxRetry: number;
  onRetry: () => void;
  onOther: () => void;
  onHome: () => void;
}

const PROPOSAL: Record<string, string> = {
  gap: "画面を開いたまま、同じ条件でもう一度。今度は加速度とジャイロの両方が揃うはずです。二回目も欠けたら、この端末では加速度を使わず、ジャイロ 2 回の一致で判定に切り替えます。",
  saturation: "振れ幅を小さく（20° 以内）して、同じ条件でもう一度。",
  no_signal: "振り子が止まっていました。振ってから「測る」を押してください。",
  two_clocks_disagree: "二つのセンサーの周期が合いませんでした。袋の中でスマホが回っていないか確かめて、もう一度。",
  unstable: "前半と後半で周期が変わりました。途中で触ったか、糸が絡んだかもしれません。もう一度。",
  weak_autocorr: "周期がはっきり出ませんでした。もう少し大きく、でも 30° 以内で振って、もう一度。",
  low_rate: "この端末のサンプリングが遅く、周期を決められません。別の端末で試すか、別の実験へ。",
  out_of_range: "振り子の周期として考えにくい値でした。糸の長さを確かめて、もう一度。",
};

/** 画面 4: 保留。理由と再測定の提案。上限に達したら別の実験へ */
export function Hold({ checks, conditionLabel, retry, maxRetry, onRetry, onOther, onHome }: HoldProps) {
  const failed = checks.filter((c) => !c.ok);
  const passed = checks.filter((c) => c.ok);
  const first = failed[0];
  const canRetry = retry < maxRetry;
  const gapCheck = failed.find((c) => c.code === "gap");
  return (
    <Screen badge="検査：保留" onHome={onHome}>
      <Card variant="navy">
        <Eyebrow>機械の検査（{conditionLabel}）</Eyebrow>
        <CardTitle size="lg">このデータでは、結論を出しません</CardTitle>
        <CardBody>あなたの予想が正しいか間違いかは、まだ決まっていません。データの方が信用できないからです。</CardBody>
      </Card>

      <Card>
        <Eyebrow>見つかった問題</Eyebrow>
        <Checks>
          {failed.map((c) => (
            <Check key={c.code} warn top>
              <strong>{c.text}</strong>
            </Check>
          ))}
          {gapCheck && <Wave gapAt={150} />}
          {passed.slice(0, 3).map((c) => (
            <Check key={c.code}>{c.text}</Check>
          ))}
        </Checks>
      </Card>

      <Card variant="line">
        <Eyebrow>Agent の提案</Eyebrow>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>{canRetry ? PROPOSAL[first?.code ?? "gap"] : `この端末では${conditionLabel}が ${maxRetry} 回続けて保留になりました。この実験は保留のまま、別の実験へ進みます。`}</p>
      </Card>

      <Foot>
        {canRetry && <Button onClick={onRetry}>同じ条件で再測定する（{retry + 1} / {maxRetry} 回目）</Button>}
        <Button secondary onClick={onOther}>別の実験にする</Button>
        <FootNote>保留は失敗ではありません。データを信じない、という判断です。</FootNote>
      </Foot>
    </Screen>
  );
}
