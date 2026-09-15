import { Button, Card, CardLabel, CardTitle, Foot, FootNote, PermitChip, Screen, Section } from "../components/ui";
import { SENSOR_LABEL, type Theme, type Variant } from "../catalog/themes";
import type { Rejection } from "../store/records";

export interface RejectedProps {
  theme: Theme;
  memo: string;
  rejection: Rejection;
  alternative: Variant;
  onApprove: () => void;
  onAsk: () => void;
  onHome: () => void;
}

/** 画面 5: Policy 却下。理由 3 つと代替をセットで */
export function Rejected({ theme, memo, rejection, alternative, onApprove, onAsk, onHome }: RejectedProps) {
  const q = rejection.quoted;
  const idx = q ? memo.indexOf(q) : -1;
  const before = idx >= 0 ? memo.slice(0, idx) : memo;
  const after = idx >= 0 ? memo.slice(idx + q.length) : "";
  return (
    <Screen badge="Policy：却下" onHome={onHome}>
      <Section label="あなたが書いた文（ラボ先生はこれを命令として読みません）">
        <Card variant="line">
          <p className="memo">
            {before}
            {idx >= 0 && <span className="mark">{q}</span>}
            {after}
          </p>
        </Card>
      </Section>

      <Card variant="navy">
        <CardLabel icon="shield-x">Policy が止めました</CardLabel>
        <CardTitle>{rejection.title}</CardTitle>
        <div className="reasons">
          {rejection.reasons.map((t, i) => (
            <p key={i}>
              理由 {i + 1}　{t}
            </p>
          ))}
        </div>
      </Card>

      <Card panel>
        <CardLabel icon="target">代わりにラボ先生が考えた実験</CardLabel>
        <CardTitle size="md">{alternative.title}</CardTitle>
        <PermitChip sensors={theme.sensors.map((s) => SENSOR_LABEL[s]).join("・")} seconds={theme.seconds} denied="それ以外は読まない" />
      </Card>

      <Foot>
        <Button onClick={onApprove}>代わりの実験を承認する</Button>
        <Button secondary onClick={onAsk}>先生に聞く</Button>
        <FootNote>この却下と理由は、記録に残ります。</FootNote>
      </Foot>
    </Screen>
  );
}
