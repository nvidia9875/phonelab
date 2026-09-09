import { Button, Card, CardBody, CardTitle, Check, Checks, Eyebrow, Foot, FootNote, Screen, Wave } from "../components/ui";
import { hold } from "../sample/data";

export function Hold({ onRetry, onOther }: { onRetry: () => void; onOther: () => void }) {
  const h = hold;
  return (
    <Screen badge="検査：保留">
      <Card variant="navy">
        <Eyebrow>機械の検査</Eyebrow>
        <CardTitle size="lg">このデータでは、結論を出しません</CardTitle>
        <CardBody>あなたの予想が正しいか間違いかは、まだ決まっていません。データの方が信用できないからです。</CardBody>
      </Card>

      <Card>
        <Eyebrow>見つかった問題</Eyebrow>
        <Checks>
          <Check warn top>
            <strong>{h.problemTitle}</strong>　{h.problemBody}
          </Check>
          <Wave gapAt={h.gapAtPx} />
          {h.passed.map((p) => (
            <Check key={p}>{p}</Check>
          ))}
        </Checks>
      </Card>

      <Card variant="line">
        <Eyebrow>Agent の提案</Eyebrow>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>{h.proposal}</p>
      </Card>

      <Foot>
        <Button onClick={onRetry}>同じ条件で再測定する</Button>
        <Button secondary onClick={onOther}>別の実験にする</Button>
        <FootNote>保留は失敗ではありません。データを信じない、という判断です。</FootNote>
      </Foot>
    </Screen>
  );
}
