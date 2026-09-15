import { Button, Card, CardBody, CardTitle, Check, Checks, Eyebrow, Foot, FootNote, Screen, Wave } from "../components/ui";
import type { CheckCode, LocalCheck } from "../measure/checks";

export interface HoldProps {
  checks: LocalCheck[];
  conditionLabel: string;
  retry: number;
  maxRetry: number;
  onRetry: () => void;
  onOther: () => void;
  onChat: () => void;
  onHome: () => void;
}

/** 保留のあとの提案（Planner ではなく検査コードごとのテンプレート。docs/verifier.md 4 章） */
const PROPOSAL: Record<CheckCode, string> = {
  gap: "画面を開いたまま、同じ条件でもう一度。通知や画面の切り替えで読み取りが途切れた可能性があります。",
  saturation: "振りが強すぎました。押さずにそっと放すか、振れ幅を小さくして、同じ条件でもう一度。",
  no_signal: "振り子が止まっていました。振ってから「測る」を押してください。",
  no_release: "振り子が動き出していませんでした。袋の底をものさしで高さに合わせ、「測る」を押してから押さずに放してください。",
  two_clocks_disagree: "二つの独立した測り方が合いませんでした。振り子なら袋の中で端末が回っていないか、音ならほかの音が入っていないかを確かめて、もう一度。",
  unstable: "前半と後半で値が変わりました。途中で触ったか、糸が絡んだかもしれません。もう一度。",
  weak_autocorr: "周期がはっきり出ませんでした。もう少し大きく、でも 30° 以内で振って、もう一度。",
  low_rate: "この端末のサンプリングが遅く、値を決められません。別の端末で試すか、別の実験へ。",
  out_of_range: "この実験の値として考えにくい値でした。糸の長さや高さなど、準備の手順を確かめて、もう一度。",
  low_voiced: "音のあるところが短すぎました。「測る」を押して少し待ってから、はっきり何回か鳴らしてください。",
  low_snr: "音が小さく、まわりの雑音と区別できませんでした。端末を音の近くに置いて、もう一度。",
  clipping: "音が大きすぎて割れました。端末を少し離して、同じ強さでもう一度。",
};

/** 画面 4: 保留。理由と再測定の提案。上限に達したら別の実験へ */
export function Hold({ checks, conditionLabel, retry, maxRetry, onRetry, onOther, onChat, onHome }: HoldProps) {
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
        <Eyebrow>ラボ先生の提案</Eyebrow>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>{canRetry ? PROPOSAL[first?.code ?? "gap"] : `この端末では${conditionLabel}が ${maxRetry} 回続けて保留になりました。この実験は保留のまま、別の実験へ進みます。`}</p>
      </Card>

      <Foot>
        {canRetry && <Button onClick={onRetry}>同じ条件で再測定する（{retry + 1} / {maxRetry} 回目）</Button>}
        <Button secondary onClick={onChat}>ラボ先生と、保留になった理由を考える</Button>
        <Button secondary onClick={onOther}>別の実験にする</Button>
        <FootNote>保留は失敗ではありません。データを信じない、という判断です。</FootNote>
      </Foot>
    </Screen>
  );
}
