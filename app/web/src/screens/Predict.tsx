import { Button, Card, CardLabel, CardTitle, Foot, FootNote, InfoRow, Pair, PermitChip, Screen, Section } from "../components/ui";
import { plan, prediction } from "../sample/data";

export function Predict({ onApprove, onOther }: { onApprove: () => void; onOther: () => void }) {
  return (
    <Screen badge="1 予想">
      <Section label="振り子を見て、どう思う？">
        <Card variant="orange">
          <p className="card__eyebrow">あなたの予想</p>
          <p className="card__text">{prediction.text}</p>
        </Card>
      </Section>

      <Card panel>
        <CardLabel icon="target">Agent が選んだ実験</CardLabel>
        <CardTitle>{plan.title}</CardTitle>
        <Pair items={[{ k: "変えるもの", v: plan.changes }, { k: "一定にするもの", v: plan.holds }]} />
        <PermitChip sensors={plan.sensors} seconds={plan.seconds} denied={plan.denied} />
        <InfoRow icon="box-check">
          <strong>手元にある？</strong>　{plan.materials}。なければ「別の実験を見る」
        </InfoRow>
        <InfoRow icon="warn">{plan.safety}</InfoRow>
      </Card>

      <Foot>
        <Button onClick={onApprove}>この実験を承認して測る</Button>
        <Button secondary onClick={onOther}>別の実験を見る</Button>
        <FootNote>Agent は答えを言いません。決めるのは測定と、あなた。</FootNote>
      </Foot>
    </Screen>
  );
}
