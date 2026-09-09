import { Button, Card, CardLabel, CardTitle, Foot, FootNote, InfoRow, Pair, PermitChip, Screen, Section } from "../components/ui";
import { SENSOR_LABEL, type Theme, type Variant } from "../catalog/themes";

export interface PlanProps {
  theme: Theme;
  variant: Variant;
  predictionText: string;
  why: string;
  onApprove: () => void;
  onOther: () => void;
  onHome: () => void;
}

/** 画面 1: 計画と承認。許可チップは承認ボタンの真上 */
export function Plan({ theme, variant, predictionText, why, onApprove, onOther, onHome }: PlanProps) {
  const sensors = theme.sensors.map((s) => SENSOR_LABEL[s]).join("・");
  const denied = ["microphone", "camera"].filter((s) => !theme.sensors.includes(s as never)).map((s) => SENSOR_LABEL[s as "microphone" | "camera"]);
  const deniedText = `${[...denied, "位置"].join("、")}は使わない`;
  return (
    <Screen badge="1 予想" onHome={onHome}>
      <Section label={theme.question}>
        <Card variant="orange">
          <p className="card__eyebrow">あなたの予想</p>
          <p className="card__text">{predictionText}</p>
        </Card>
      </Section>

      <Card panel>
        <CardLabel icon="target">AI が考えた実験</CardLabel>
        <CardTitle>{variant.title}</CardTitle>
        <p className="card__hint">{why}</p>
        <Pair items={[{ k: "変えるもの", v: variant.changes }, { k: "一定にするもの", v: variant.holds }]} />
        <PermitChip sensors={sensors} seconds={theme.seconds} denied={deniedText} />
        <InfoRow icon="box-check">
          <strong>手元にある？</strong>　{theme.materials}。なければ「別の実験を見る」
        </InfoRow>
        <InfoRow icon="warn">{theme.safety}</InfoRow>
      </Card>

      <Foot>
        <Button onClick={onApprove}>この実験を承認して測る</Button>
        <Button secondary onClick={onOther}>別の実験を見る</Button>
        <FootNote>AI は実験を考える係。答えは、測って見つける。</FootNote>
      </Foot>
    </Screen>
  );
}
