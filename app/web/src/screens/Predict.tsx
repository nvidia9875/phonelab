import { useEffect, useRef, useState } from "react";
import { Button, Card, CardTitle, Eyebrow, Field, Foot, FootNote, InfoRow, Note, Screen, Section } from "../components/ui";
import type { Theme } from "../catalog/themes";
import { ThemeArt } from "../components/ThemeArt";
import "./catalog.css";

export interface PredictProps {
  theme: Theme;
  initialText: string;
  questionBack: string | null;
  hintMessage: string | null;
  onSubmit: (text: string) => Promise<void> | void;
  onHome: () => void;
}

/** 予想ゲート: 予想を書くまで実験もヒントもセンサーも出ない */
export function Predict({ theme, initialText, questionBack, hintMessage, onSubmit, onHome }: PredictProps) {
  const [text, setText] = useState(initialText);
  const [pending, setPending] = useState(false);
  const canGo = text.trim().length > 0 && !pending;
  async function submit() {
    if (!canGo) return;
    setPending(true);
    try {
      await onSubmit(text);
    } finally {
      setPending(false);
    }
  }
  const noteRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // ラボ先生の問い返しが来たら、キーボードを閉じて見える位置へ（スマホではキーボードの下に隠れる）
  useEffect(() => {
    if (questionBack || hintMessage) {
      fieldRef.current?.blur();
      noteRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [questionBack, hintMessage]);
  return (
    <Screen badge="予想" tone="orange" onHome={onHome}>
      <Card panel>
        <Eyebrow>テーマ</Eyebrow>
        <CardTitle>{theme.title}</CardTitle>
        <p className="card__hint">{theme.tagline}</p>
        <div className="predict-art" aria-hidden>
          <ThemeArt id={theme.id} />
        </div>
        <p className="section__label">まず、つくって見てみよう</p>
        {theme.build.map((b, i) => (
          <div className="step" key={i}>
            <span className="step__n">{i + 1}</span>
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>{b}</p>
          </div>
        ))}
        <InfoRow icon="box-check">
          <strong>要るもの</strong>　{theme.materials}
        </InfoRow>
        <InfoRow icon="warn">{theme.safety}</InfoRow>
      </Card>

      <Section label={theme.question}>
        <Field
          ref={fieldRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={theme.example}
          rows={4}
          style={{ borderColor: "var(--orange)" }}
        />
        <div ref={noteRef} style={{ display: "contents" }}>
          {questionBack && <Note icon="bulb"><strong>ラボ先生からの問い返し</strong>　{questionBack}</Note>}
          {hintMessage && <Note icon="shield-x">{hintMessage}</Note>}
        </div>
      </Section>

      <Foot>
        <Button disabled={!canGo} onClick={() => void submit()}>{pending ? "ラボ先生が考えています…" : "ラボ先生に実験を考えてもらう"}</Button>
        <FootNote>{pending ? "予想を読んで、カタログから実験を選んでいます。答えは渡していません。" : "まず「こう思う」を書こう。そこからラボ先生がいっしょに実験を考えます。センサーはまだ読みません。"}</FootNote>
      </Foot>
    </Screen>
  );
}
