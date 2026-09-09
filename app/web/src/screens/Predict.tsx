import { useState } from "react";
import { Button, Card, CardTitle, Eyebrow, Field, Foot, FootNote, InfoRow, Note, Screen, Section } from "../components/ui";
import { SENSOR_LABEL, type Theme } from "../catalog/themes";

export interface PredictProps {
  theme: Theme;
  initialText: string;
  questionBack: string | null;
  hintMessage: string | null;
  onSubmit: (text: string) => void;
  onHome: () => void;
}

/** 予想ゲート: 予想を書くまで実験もヒントもセンサーも出ない */
export function Predict({ theme, initialText, questionBack, hintMessage, onSubmit, onHome }: PredictProps) {
  const [text, setText] = useState(initialText);
  const canGo = text.trim().length > 0;
  return (
    <Screen badge="予想" tone="orange" onHome={onHome}>
      <Card panel>
        <Eyebrow>テーマ</Eyebrow>
        <CardTitle>{theme.title}</CardTitle>
        <p className="card__hint">{theme.tagline}</p>
        <InfoRow icon="box-check">
          <strong>要るもの</strong>　{theme.materials}
        </InfoRow>
        <InfoRow icon="timer">
          <strong>使うセンサー</strong>　{theme.sensors.map((s) => SENSOR_LABEL[s]).join("・")}を {theme.seconds} 秒ずつ。承認するまで読みません
        </InfoRow>
        <InfoRow icon="warn">{theme.safety}</InfoRow>
      </Card>

      <Section label={theme.question}>
        <Field
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="たとえば：重い方が引っ張られる力が強いから、速く振れると思う"
          rows={4}
          style={{ borderColor: "var(--orange)" }}
        />
        {questionBack && <Note icon="bulb">{questionBack}</Note>}
        {hintMessage && <Note icon="shield-x">{hintMessage}</Note>}
      </Section>

      <Foot>
        <Button disabled={!canGo} onClick={() => onSubmit(text)}>Agent に実験を選んでもらう</Button>
        <FootNote>予想を書くまで、実験もヒントもセンサーも出ません。理由も一緒に。</FootNote>
      </Foot>
    </Screen>
  );
}
