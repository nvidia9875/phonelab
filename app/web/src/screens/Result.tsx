import { useEffect, useState } from "react";
import { Button, Card, CardBody, CardLabel, CardTitle, Choices, Eyebrow, Field, Foot, FootNote, Grid2, Link, LinkRow, Screen, Section, Stat } from "../components/ui";
import { QUANTITY, formatNumber } from "../catalog/quantity";
import type { Variant } from "../catalog/themes";
import type { CondKey, Direction, Judgement, NextSuggestion } from "../store/records";

export interface ResultProps {
  variant: Variant;
  judgement: Judgement;
  explain: string;
  nextVariant: Variant | null;
  nextDirection: Direction | null;
  /** ラボ先生の次の一手（記録ごとに 1 回聞く。null の間は聞いている途中） */
  suggestion: NextSuggestion | null;
  onLoadNext: () => Promise<NextSuggestion | null>;
  onExplain: (text: string) => void;
  onNext: (direction: Direction) => void;
  onGoNext: () => void;
  onFinish: () => void;
  onRecord: () => void;
  onChat: () => void;
  retries: Record<CondKey, number>;
  repeats: number;
  /** テストモードのサンプル値で進めた記録 */
  sample?: boolean;
  maxRetry: number;
  onRemeasure: (cond: CondKey) => void;
  onHome: () => void;
}

/** 画面 3: 結果と次の予測。「正解」と言わない。「測定が言っていること」と言う */
const NEXT_SOURCE: Record<NextSuggestion["source"], string> = {
  agent: "ラボ先生（Gemini）が、あなたの予想と測った結果を読んで選びました。次の結果は言っていません",
  catalog: "ラボ先生に聞ける回数の上限のため、カタログの順です",
  stub: "いまはラボ先生につながらないので、カタログの順です",
};

export function Result({ variant, judgement, explain, nextVariant, nextDirection, suggestion, onLoadNext, onExplain, onNext, onGoNext, onFinish, onRecord, onChat, retries, maxRetry, repeats, sample = false, onRemeasure, onHome }: ResultProps) {
  const [text, setText] = useState(explain);
  const [loading, setLoading] = useState(!suggestion);
  useEffect(() => {
    if (suggestion) {
      setLoading(false);
      return;
    }
    let alive = true;
    void onLoadNext().finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
    // 記録ごとに 1 回（key={r.id} で画面ごと作り直す）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const reflect = suggestion?.action === "reflect";
  const question = suggestion?.action === "next" && suggestion.variantId === nextVariant?.id ? suggestion.question : null;
  const j = judgement;
  const unit = variant.unit;
  const nextQ = QUANTITY[nextVariant?.unit ?? unit];
  return (
    <Screen badge="3 結果" tone="orange" onHome={onHome}>
      <Grid2>
        <Stat label={variant.conditions[0].label} value={formatNumber(j.a, unit)} unit={unit} />
        <Stat label={variant.conditions[1].label} value={formatNumber(j.b, unit)} unit={unit} />
      </Grid2>

      {repeats > 1 && <p className="card__hint">それぞれ {repeats} 回測った平均です</p>}
      {sample && <p className="card__hint">テストモードのサンプル値です。実際の測定ではありません</p>}

      <Card variant="navy">
        <Eyebrow>測定が言っていること</Eyebrow>
        <CardTitle>{j.statement}</CardTitle>
        <CardBody>{j.detail}</CardBody>
      </Card>

      <Section label="なぜそうなったと思う？　自分の言葉で">
        <Field value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onExplain(text)} placeholder="たとえば：変えたのは〇〇だけなのに、△△が変わらなかったのは…" />
      </Section>

      {loading && (
        <Card variant="line">
          <Eyebrow>ラボ先生の次の一手</Eyebrow>
          <p className="card__hint" role="status">ラボ先生が、あなたの予想と測った結果を読んで、次に確かめることを考えています…</p>
        </Card>
      )}

      {reflect && suggestion && (
        <Card variant="navy">
          <Eyebrow>ラボ先生の次の一手 ― 先にふり返り</Eyebrow>
          <CardBody>{suggestion.why}</CardBody>
          <p className="card__hint" style={{ color: "inherit", opacity: 0.8 }}>{NEXT_SOURCE[suggestion.source]}</p>
        </Card>
      )}

      {nextVariant ? (
        <Card variant="orange" panel>
          <CardLabel icon="bulb" orange>
            {question ? "次の予測 ― ラボ先生が選んだ次の一手" : "次の予測"}
          </CardLabel>
          <p className="card__text" style={{ fontWeight: 700, lineHeight: 1.5 }}>
            {question ?? `では、${nextVariant.changes.split("（")[0]}を変えたら${nextQ.name}はどうなる？`}
          </p>
          {question && suggestion && (
            <>
              <p className="card__hint">{suggestion.why}</p>
              <p className="card__hint">{NEXT_SOURCE[suggestion.source]}</p>
            </>
          )}
          <Choices
            options={[
              { v: "faster", label: nextQ.choiceFaster },
              { v: "same", label: "変わらない" },
              { v: "slower", label: nextQ.choiceSlower },
            ]}
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

      <Card variant="line">
        <Eyebrow>うまく取れていなかった？</Eyebrow>
        <p className="card__hint">気になる条件をもう一度測れます。前の測定も記録に残り、判定は新しい測定でやり直します（1 条件 {maxRetry} 回まで）</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(["A", "B"] as CondKey[]).map((cond, i) => (
            <Button key={cond} sm secondary disabled={retries[cond] >= maxRetry} onClick={() => { onExplain(text); onRemeasure(cond); }}>
              {variant.conditions[i].label}を測り直す{retries[cond] > 0 ? `（${retries[cond]} / ${maxRetry}）` : ""}
            </Button>
          ))}
        </div>
      </Card>

      <Foot>
        {nextVariant ? (
          <Button disabled={!nextDirection} onClick={() => { onExplain(text); onGoNext(); }}>次の実験へ</Button>
        ) : (
          <Button onClick={() => { onExplain(text); onFinish(); }}>トップへ</Button>
        )}
        <Button secondary={!reflect} onClick={() => { onExplain(text); onChat(); }}>ラボ先生と、なぜそうなったか話す</Button>
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
