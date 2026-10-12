import { useState } from "react";
import { Button, Card, CardLabel, CardTitle, Foot, FootNote, InfoRow, Pair, PermitChip, Screen, Section, Trail } from "../components/ui";
import { SENSOR_LABEL, type Theme, type Variant } from "../catalog/themes";
import type { PlanInfo } from "../store/records";

const SOURCE_NOTE: Record<PlanInfo["source"], string> = {
  agent: "ラボ先生（AI）が、あなたの予想を読んで実験のリストから選びました。ラボ先生は答えを知りません",
  policy: "安全のきまりで、この実験を代わりに出しています",
  catalog: "ラボ先生に聞ける回数をこえたので、リストの順に出しています",
  stub: "いまはラボ先生につながらないので、端末の中のきまりで選びました",
  student: "あなたが自分で選んだ実験です",
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
  /** このテーマのほかの実験（自分で選び直せる） */
  alternatives: Variant[];
  onPick: (variantId: string) => void;
  onApprove: () => void;
  onOther: () => void;
  onHome: () => void;
}

/** 画面 1: 計画と承認。許可チップは承認ボタンの真上 */
export function Plan({ theme, variant, predictionText, why, source, trail = [], selfCorrected = false, traceId = null, alternatives, onPick, onApprove, onOther, onHome }: PlanProps) {
  const [showOthers, setShowOthers] = useState(false);
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
        {/* 条件をそろえる考え方は、問いかけだけでは身につきにくく、はっきり言うと身につく（Chen & Klahr 1999。10/12） */}
        <p className="card__hint">変えるのは 1 つだけ。ほかはそろえます。いくつも変えると、どれが効いたのか分からなくなるから。</p>
        <PermitChip sensors={sensors} seconds={theme.seconds} denied={deniedText} />
        <InfoRow icon="box-check">
          <strong>手元にある？</strong>　{theme.materials}。なければ「ほかの実験を見る」
        </InfoRow>
        <InfoRow icon="warn">{theme.safety}</InfoRow>
      </Card>

      {showOthers && (
        <Card variant="line">
          <CardLabel icon="list">このテーマのほかの実験</CardLabel>
          {alternatives.map((v) => (
            <button type="button" key={v.id} className="alt" onClick={() => { onPick(v.id); setShowOthers(false); }}>
              <span className="alt__title">{v.title}</span>
              <span className="alt__sub">変えるもの: {v.changes}</span>
            </button>
          ))}
        </Card>
      )}

      <Foot>
        <Button onClick={onApprove}>この実験でやってみる</Button>
        {alternatives.length > 0 ? (
          <Button secondary onClick={() => setShowOthers((x) => !x)}>{showOthers ? "ほかの実験を閉じる" : "ほかの実験を見る"}</Button>
        ) : (
          <Button secondary onClick={onOther}>トップに戻る</Button>
        )}
        <FootNote>押すと、{sensors}を {theme.seconds} 秒だけ読みます（あなたが決めます）。答えは、測って見つける。</FootNote>
      </Foot>
    </Screen>
  );
}
