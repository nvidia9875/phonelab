import { Button, Card, CardLabel, CardTitle, Foot, FootNote, PermitChip, Screen, Section } from "../components/ui";
import { rejection } from "../sample/data";

export function Rejected({ onApprove, onAsk }: { onApprove: () => void; onAsk: () => void }) {
  const r = rejection;
  return (
    <Screen badge="Policy：却下">
      <Section label="ネットで見つけて貼り付けたメモ（Agent はこれを命令として読みません）">
        <Card variant="line">
          <p className="memo">
            {r.memoBefore}
            <span className="mark">{r.memoQuoted}</span>
          </p>
        </Card>
      </Section>

      <Card variant="navy">
        <CardLabel icon="shield-x">Policy が止めました</CardLabel>
        <CardTitle>{r.title}</CardTitle>
        <div className="reasons">
          {r.reasons.map((t, i) => (
            <p key={i}>
              理由 {i + 1}　{t}
            </p>
          ))}
        </div>
      </Card>

      <Card panel>
        <CardLabel icon="target">代わりに Agent が選んだ実験</CardLabel>
        <CardTitle size="md">{r.alternative.title}</CardTitle>
        <PermitChip sensors={r.alternative.sensors} seconds={r.alternative.seconds} denied={r.alternative.denied} />
      </Card>

      <Foot>
        <Button onClick={onApprove}>代わりの実験を承認する</Button>
        <Button secondary onClick={onAsk}>先生に聞く</Button>
        <FootNote>この却下と理由は、トレースに残ります。</FootNote>
      </Foot>
    </Screen>
  );
}
