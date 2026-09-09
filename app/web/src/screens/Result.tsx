import { useState } from "react";
import { Button, Card, CardBody, CardLabel, CardTitle, Choices, Eyebrow, Field, Foot, FootNote, Grid2, Link, LinkRow, Screen, Section, Stat } from "../components/ui";
import type { Variant } from "../catalog/themes";
import type { Direction, Judgement } from "../store/records";

export interface ResultProps {
  variant: Variant;
  judgement: Judgement;
  explain: string;
  nextVariant: Variant | null;
  nextDirection: Direction | null;
  onExplain: (text: string) => void;
  onNext: (direction: Direction) => void;
  onGoNext: () => void;
  onFinish: () => void;
  onRecord: () => void;
  onHome: () => void;
}

/** 画面 3: 結果と次の予測。「正解」と言わない。「測定が言っていること」と言う */
export function Result({ variant, judgement, explain, nextVariant, nextDirection, onExplain, onNext, onGoNext, onFinish, onRecord, onHome }: ResultProps) {
  const [text, setText] = useState(explain);
  const j = judgement;
  const unit = variant.unit;
  const fmt = (v: number) => (unit === "s" ? v.toFixed(2) : String(Math.round(v)));
  return (
    <Screen badge="3 結果" tone="orange" onHome={onHome}>
      <Grid2>
        <Stat label={variant.conditions[0].label} value={fmt(j.a)} unit={unit} />
        <Stat label={variant.conditions[1].label} value={fmt(j.b)} unit={unit} />
      </Grid2>

      <Card variant="navy">
        <Eyebrow>測定が言っていること</Eyebrow>
        <CardTitle>{j.statement}</CardTitle>
        <CardBody>{j.detail}</CardBody>
      </Card>

      <Section label="なぜそうなったと思う？　自分の言葉で">
        <Field value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onExplain(text)} placeholder="たとえば：引っ張る力は強くなるけど、動かしにくさも…" />
      </Section>

      {nextVariant ? (
        <Card variant="orange" panel>
          <CardLabel icon="bulb" orange>
            次の予測
          </CardLabel>
          <p className="card__text" style={{ fontWeight: 700, lineHeight: 1.5 }}>
            では、{nextVariant.changes.split("（")[0]}を変えたら{unit === "s" ? "周期" : "音の高さ"}はどうなる？
          </p>
          <Choices
            options={
              unit === "s"
                ? [
                    { v: "faster", label: "速くなる" },
                    { v: "same", label: "変わらない" },
                    { v: "slower", label: "遅くなる" },
                  ]
                : [
                    { v: "faster", label: "高くなる" },
                    { v: "same", label: "変わらない" },
                    { v: "slower", label: "低くなる" },
                  ]
            }
            value={nextDirection}
            onChange={onNext}
          />
          <p className="card__hint">予測を選んでから、次の実験へ進めます</p>
        </Card>
      ) : (
        <Card variant="line">
          <Eyebrow>このテーマの実験は全部終わりました</Eyebrow>
          <p style={{ fontSize: 14 }}>トップで別のテーマを選べます。</p>
        </Card>
      )}

      <Foot>
        {nextVariant ? (
          <Button disabled={!nextDirection} onClick={() => { onExplain(text); onGoNext(); }}>次の実験へ</Button>
        ) : (
          <Button onClick={() => { onExplain(text); onFinish(); }}>トップへ</Button>
        )}
        <LinkRow>
          <Link icon="ribbon" onClick={() => { onExplain(text); onRecord(); }}>
            署名付きの実験記録
          </Link>
          <Link icon="list" onClick={() => { onExplain(text); onRecord(); }}>
            トレースを見る
          </Link>
        </LinkRow>
        <FootNote>この結果は記録に残ります。</FootNote>
      </Foot>
    </Screen>
  );
}
