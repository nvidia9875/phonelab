import { useState } from "react";
import { Card, CardBody, CardLabel, CardTitle, Choices, Eyebrow, Field, Grid2, Link, LinkRow, Screen, Section, Stat } from "../components/ui";
import { result, type Direction } from "../sample/data";

export function Result({ onRecord, onTrace }: { onRecord: () => void; onTrace: () => void }) {
  const r = result;
  const [next, setNext] = useState<Direction | null>(null);
  return (
    <Screen badge="3 結果" tone="orange">
      <Grid2>
        <Stat label={r.a.label} value={r.a.value.toFixed(2)} />
        <Stat label={r.b.label} value={r.b.value.toFixed(2)} />
      </Grid2>

      <Card variant="navy">
        <Eyebrow>測定が言っていること</Eyebrow>
        <CardTitle>{r.statement}</CardTitle>
        <CardBody>{r.detail}</CardBody>
      </Card>

      <Section label="なぜそうなったと思う？　自分の言葉で">
        <Field placeholder={r.explainPlaceholder} />
      </Section>

      <Card variant="orange" panel>
        <CardLabel icon="bulb" orange>
          次の予測
        </CardLabel>
        <p className="card__text" style={{ fontWeight: 700, lineHeight: 1.5 }}>
          {r.nextQuestion}
        </p>
        <Choices
          options={[
            { v: "faster", label: "速くなる" },
            { v: "same", label: "変わらない" },
            { v: "slower", label: "遅くなる" },
          ]}
          value={next}
          onChange={setNext}
        />
        <p className="card__hint">予測を書いてから、次の実験へ進めます</p>
      </Card>

      <LinkRow>
        <Link icon="ribbon" onClick={onRecord}>
          署名付きの実験記録
        </Link>
        <Link icon="list" onClick={onTrace}>
          トレースを見る
        </Link>
      </LinkRow>
    </Screen>
  );
}
