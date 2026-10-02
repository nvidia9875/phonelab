import { useState } from "react";
import { ClassError, fetchInsight, type InsightInfo } from "../agent/classroom";

export interface InsightPanelProps {
  classCode: string;
  pin: string;
  unlocked: boolean;
  /** 見に行く番号を押したら、その子の記録を右に出す */
  onSelect: (number: string) => void;
  /** テスト用。省略時はサーバから取る */
  load?: (classCode: string, pin: string) => Promise<InsightInfo>;
}

const SOURCE_NOTE: Record<InsightInfo["source"], string> = {
  agent: "ラボ先生（Gemini）が、読み取り専用のツールで学級の要約を読みました。予想の本文と名前は渡していません。操作はしません",
  rules: "ラボ先生につながらないので、決まりごとだけで数えました",
};

function errorText(e: unknown): string {
  if (e instanceof ClassError) return e.message;
  return e instanceof Error ? e.message : "うまくいきませんでした";
}

/**
 * 学級の見立て（X3）。先生が押したときだけラボ先生が学級を読み、3 行と「見に行く順」を返す。
 * 止める・許可を変えるなどの操作は、先生がこの画面のボタンで行う（見立ては提案しない）。
 */
export function InsightPanel({ classCode, pin, unlocked, onSelect, load = fetchInsight }: InsightPanelProps) {
  const [insight, setInsight] = useState<InsightInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setInsight(await load(classCode, pin));
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tpanel insight" aria-labelledby="insight-heading">
      <div className="tpanel__head">
        <h2 id="insight-heading">ラボ先生の見立て</h2>
        <button type="button" className="tbtn tbtn--outline tbtn--sm" disabled={!unlocked || busy} onClick={() => void ask()}>
          {busy ? "学級を読んでいます…" : insight ? "もう一度聞く" : "見立てを聞く"}
        </button>
      </div>
      {!insight && !error && <p className="tpanel__hint">押すと、ラボ先生が学級の様子を読んで、いま知っておくとよいことを 3 行で伝えます。</p>}
      {error && <p className="tpanel__hint" role="alert">{error}</p>}
      {insight && (
        <div className="insight__body" aria-live="polite">
          <ul className="insight__lines">
            {insight.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {insight.visit_first.length > 0 && (
            <div className="insight__visit">
              <p className="insight__label">見に行く順</p>
              {insight.visit_first.map((n, i) => (
                <button type="button" key={n} className="insight__chip" onClick={() => onSelect(n)}>
                  <span className="insight__rank">{i + 1}</span>
                  {n}
                </button>
              ))}
            </div>
          )}
          {insight.suggestion && (
            <p className="insight__suggestion">
              <span className="insight__label">先生が選べる手</span>
              {insight.suggestion}
            </p>
          )}
          <p className="tpanel__hint">{SOURCE_NOTE[insight.source]}{insight.cached ? "（30 秒以内の同じ見立て）" : ""}</p>
          <details className="insight__trail">
            <summary>判断の跡（ツール {insight.tool_calls} 回・断った {insight.tools_denied} 回）</summary>
            <ol>
              {insight.trail.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </section>
  );
}
