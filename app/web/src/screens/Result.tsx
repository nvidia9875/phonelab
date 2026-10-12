import { useEffect, useState } from "react";
import { Button, Card, CardBody, CardLabel, CardTitle, Choices, Eyebrow, Field, Foot, FootNote, Grid2, Link, LinkRow, Screen, Section, Stat } from "../components/ui";
import { QUANTITY, formatNumber } from "../catalog/quantity";
import type { Variant } from "../catalog/themes";
import type { Cer, CondKey, Confidence, Direction, Judgement, NextSuggestion } from "../store/records";
import type { Evidence } from "../flow/evidence";

export interface ResultProps {
  variant: Variant;
  judgement: Judgement;
  explain: string;
  nextVariant: Variant | null;
  nextDirection: Direction | null;
  /** ラボ先生の次の一手（記録ごとに 1 回聞く。null の間は聞いている途中） */
  suggestion: NextSuggestion | null;
  /** 理由を書いた・測り直したなどで、次の一手を聞き直すとき */
  stale: boolean;
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
  /** 音の大きさと、判定に使った測定が通った検査（無ければ出さない） */
  evidence?: Evidence;
  /** 主張・証拠・理由（古い記録は null） */
  cer?: Cer | null;
  /** テーマの最初の実験は三つの欄を全部、慣れたら理由だけ（足場を外していく: McNeill ら 2006） */
  fullCer?: boolean;
  onCer?: (cer: Cer) => void;
  nextReason?: string;
  nextConfidence?: Confidence | null;
  onNextReason?: (reason: string, confidence: Confidence | undefined) => void;
  maxRetry: number;
  onRemeasure: (cond: CondKey, why?: string) => void;
  onHome: () => void;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** 画面 3: 結果と次の予測。「正解」と言わない。「測定が言っていること」と言う */
const NEXT_SOURCE: Record<NextSuggestion["source"], string> = {
  agent: "ラボ先生（AI）が、あなたの予想と測った結果を読んで選びました。次の結果は言っていません",
  catalog: "ラボ先生に聞ける回数の上限のため、カタログの順です",
  stub: "いまはラボ先生につながらないので、カタログの順です",
};

export function Result({ variant, judgement, explain, nextVariant, nextDirection, suggestion, stale, onLoadNext, onExplain, onNext, onGoNext, onFinish, onRecord, onChat, retries, maxRetry, repeats, sample = false, evidence, cer: savedCer = null, fullCer = false, onCer, nextReason = "", nextConfidence = null, onNextReason, onRemeasure, onHome }: ResultProps) {
  const [text, setText] = useState(explain);
  const [cer, setCer] = useState<Cer>(savedCer ?? { claim: "", evidence: "", reasoning: savedCer === null && explain ? explain : "" });
  const [reason, setReason] = useState(nextReason);
  const [why, setWhy] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(nextConfidence);
  // 主張・証拠・理由を記録へ（理由だけのときは今までどおり explain に）
  const commit = () => (onCer ? onCer(cer) : onExplain(text));
  const [loading, setLoading] = useState(stale);
  useEffect(() => {
    if (!stale) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void onLoadNext().finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
    // 読んだもの（理由・判定）が変わったときだけ聞き直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);
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

      {/* 予想が外れた瞬間は失敗ではなく発見として見せる（中学は興味と理解。10/2 の通し操作） */}
      <div className={j.consistent === false ? "discovery" : undefined}>
      <Card variant="navy">
        <Eyebrow>{j.undecided ? "保留 ― 測定が言っていること" : j.consistent === false ? "予想とちがった！ ここが発見" : j.consistent ? "予想どおり！ 測定が言っていること" : "測定が言っていること"}</Eyebrow>
        <CardTitle>{j.statement}</CardTitle>
        <CardBody>{j.detail}</CardBody>
        {j.consistent === false && !j.undecided && evidence && evidence.passedChecks.length > 0 && (
          <p className="card__hint" style={{ color: "inherit", opacity: 0.85 }}>
            この測定は、機械の検査（{evidence.passedChecks.join("・")}）を通っています。測り方のせいにする前に、なぜかを考えてみよう
          </p>
        )}
      </Card>
      </div>

      {evidence?.loudness && !j.undecided && (
        <Card variant="line">
          <Eyebrow>音の大きさも見てみよう</Eyebrow>
          <p className="card__text">
            {variant.conditions[0].label} {Math.round(evidence.loudness.A)} dB → {variant.conditions[1].label} {Math.round(evidence.loudness.B)} dB（
            {signed(Math.round(evidence.loudness.B - evidence.loudness.A))} dB）
          </p>
          <p className="card__hint">
            音には「大きさ」と「高さ」があります。{variant.variable === "strength" ? "強くはじいて変わったのはどちらかな？ " : ""}大きさは震えの幅、高さは 1 秒に震える回数で決まります（dB はマイクで測った相対的な大きさ）
          </p>
        </Card>
      )}

      {onCer ? (
        <CerFields
          cer={cer}
          full={fullCer}
          consistent={j.consistent}
          measured={`${variant.conditions[0].label} ${formatNumber(j.a, unit)} ${unit} → ${variant.conditions[1].label} ${formatNumber(j.b, unit)} ${unit}${evidence?.loudness ? `（大きさ ${signed(Math.round(evidence.loudness.B - evidence.loudness.A))} dB）` : ""}`}
          onChange={setCer}
          onCommit={(next) => onCer(next)}
        />
      ) : (
        <Section label={j.consistent ? "予想どおりだった理由も、自分の言葉で書いてみよう" : "なぜそうなったと思う？　自分の言葉で"}>
          <Field value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onExplain(text)} placeholder="たとえば：変えたのは〇〇だけなのに、△△が変わらなかったのは…" />
        </Section>
      )}

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

      {reflect && !j.undecided ? (
        <Card variant="line">
          <Eyebrow>次の予測は、理由を書いたら出てきます</Eyebrow>
          <p className="card__hint">上の「なぜそうなったと思う？」に自分の考えを書くか、ラボ先生と話してから。</p>
        </Card>
      ) : j.undecided ? (
        <Card variant="line">
          <Eyebrow>保留のあいだは、次の実験に進みません</Eyebrow>
          <p className="card__hint">差があるかどうかを決めるには、条件をそろえて測り直します。下の「測り直す」から。先生の画面にも保留として出ています。</p>
        </Card>
      ) : nextVariant ? (
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
          {nextDirection && onNextReason && (
            <>
              <Field
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => onNextReason(reason, confidence ?? undefined)}
                placeholder="そう思う理由をひとこと（たとえば：短いと速く震えそうだから）"
                rows={2}
              />
              <p className="card__hint">どのくらい自信がある？</p>
              <Choices
                options={[
                  { v: "sure" as const, label: "自信あり" },
                  { v: "half" as const, label: "半々" },
                  { v: "unsure" as const, label: "自信なし" },
                ]}
                value={confidence}
                onChange={(v) => {
                  setConfidence(v);
                  onNextReason(reason, v);
                }}
              />
            </>
          )}
          <p className="card__hint">予測を選んでから、次の実験へ進めます</p>
        </Card>
      ) : (
        <Card variant="line">
          <Eyebrow>このテーマの実験は全部終わりました</Eyebrow>
          <p style={{ fontSize: 14 }}>トップで別のテーマを選べます。</p>
        </Card>
      )}

      <details className="remeasure" open={j.undecided}>
        <summary className="remeasure__summary">うまく取れていなかった？ 測り直す</summary>
        <p className="card__hint">気になる条件をもう一度測れます。前の測定も記録に残り、判定は新しい測定でやり直します（1 条件 {maxRetry} 回まで）</p>
        {j.consistent === false && !j.undecided && (
          <Field value={why} onChange={(e) => setWhy(e.target.value)} rows={2} placeholder="測り直す前に: どこがうまくいかなかったと思う？（たとえば：強くはじいたつもりが弱かった）" />
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(["A", "B"] as CondKey[]).map((cond, i) => (
            <Button key={cond} sm secondary disabled={retries[cond] >= maxRetry} onClick={() => { commit(); onRemeasure(cond, why); }}>
              {variant.conditions[i].label}を測り直す{retries[cond] > 0 ? `（${retries[cond]} / ${maxRetry}）` : ""}
            </Button>
          ))}
        </div>
      </details>

      <Foot>
        {/* ふり返りが先なら、話すボタンを主に（主のボタンは 1 つだけ） */}
        {reflect ? (
          <>
            <Button onClick={() => { commit(); onChat(); }}>ラボ先生と、なぜそうなったか話す</Button>
            <Button secondary onClick={() => { onExplain(text); onFinish(); }}>トップへ</Button>
          </>
        ) : (
          <>
            {nextVariant && !j.undecided ? (
              <Button disabled={!nextDirection} onClick={() => { onExplain(text); onGoNext(); }}>次の実験へ</Button>
            ) : (
              <Button onClick={() => { onExplain(text); onFinish(); }}>トップへ</Button>
            )}
            <Button secondary onClick={() => { commit(); onChat(); }}>ラボ先生と、なぜそうなったか話す</Button>
          </>
        )}
        <LinkRow>
          <Link icon="ribbon" onClick={() => { onExplain(text); onRecord(); }}>
            実験の記録を見る
          </Link>
        </LinkRow>
        <FootNote>この結果は記録に残ります。</FootNote>
      </Foot>
    </Screen>
  );
}

/** 主張・証拠・理由。最初の実験は三つとも、慣れたら理由だけ（主張と証拠は開けば書ける） */
function CerFields({ cer, full, consistent, measured, onChange, onCommit }: { cer: Cer; full: boolean; consistent: boolean | null; measured: string; onChange: (c: Cer) => void; onCommit: (c: Cer) => void }) {
  const set = (k: keyof Cer) => (e: { target: { value: string } }) => onChange({ ...cer, [k]: e.target.value });
  const blur = () => onCommit(cer);
  const claimAndEvidence = (
    <>
      <Section label="主張: 測ってわかったことは？">
        <Field value={cer.claim} onChange={set("claim")} onBlur={blur} rows={2} placeholder="たとえば：はじく強さを変えても、音の高さは〇〇" />
      </Section>
      <Section label="証拠: どの数字からそう言える？">
        <Field value={cer.evidence} onChange={set("evidence")} onBlur={blur} rows={2} placeholder={`たとえば：${measured}`} />
        <Button sm secondary onClick={() => { const next = { ...cer, evidence: measured }; onChange(next); onCommit(next); }}>
          測った値を入れる
        </Button>
      </Section>
    </>
  );
  return (
    <>
      {full ? claimAndEvidence : null}
      <Section label={consistent ? "理由: 予想どおりだったのはなぜ？" : "理由: なぜそうなったと思う？"}>
        <Field value={cer.reasoning} onChange={set("reasoning")} onBlur={blur} placeholder="たとえば：変えたのは〇〇だけなのに、△△が変わらなかったのは…" />
      </Section>
      {!full && (
        <details className="remeasure">
          <summary className="remeasure__summary">主張と証拠も書く</summary>
          {claimAndEvidence}
        </details>
      )}
    </>
  );
}
