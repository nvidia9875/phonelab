import { Button, Card, CardLabel, CardTitle, Foot, FootNote, InfoRow, Pair, PermitChip, Screen, Section, Trail } from "../components/ui";
import { SENSOR_LABEL, type Theme, type Variant } from "../catalog/themes";
import type { PlanInfo } from "../store/records";

const SOURCE_NOTE: Record<PlanInfo["source"], string> = {
  agent: "ラボ先生（Gemini）が、あなたの予想を読んでカタログから選びました。答えは渡していません",
  policy: "Policy の判断で、この実験を代わりに出しています",
  catalog: "ラボ先生に聞ける回数の上限のため、カタログの順で選びました",
  stub: "いまはラボ先生につながらないので、端末の中の簡単な規則で選びました",
};

export interface PlanProps {
  theme: Theme;
  variant: Variant;
  predictionText: string;
  why: string;
  /** 誰が選んだか（古い記録には無い） */
  source?: PlanInfo["source"];
  /** 判断の跡と、検査に落ちた 1 回目を自分で直したか（古い記録には無い） */
  trail?: string[];
  selfCorrected?: boolean;
  traceId?: string | null;
  onApprove: () => void;
  onOther: () => void;
  onHome: () => void;
}

/** 画面 1: 計画と承認。許可チップは承認ボタンの真上 */
export function Plan({ theme, variant, predictionText, why, source, trail = [], selfCorrected = false, traceId = null, onApprove, onOther, onHome }: PlanProps) {
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
        <CardLabel icon="target">ラボ先生が考えた実験</CardLabel>
        <CardTitle>{variant.title}</CardTitle>
        <p className="card__hint">{why}</p>
        {source && <p className="card__hint">{SOURCE_NOTE[source]}</p>}
        <Trail steps={trail} selfCorrected={selfCorrected} traceId={traceId} />
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
        <FootNote>ラボ先生は実験を考える係。答えは、測って見つける。</FootNote>
      </Foot>
    </Screen>
  );
}
