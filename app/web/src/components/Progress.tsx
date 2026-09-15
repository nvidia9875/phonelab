import type { Theme } from "../catalog/themes";
import type { ThemeStatus } from "../store/status";
import "./progress.css";

export type Cell = { theme: Theme; status: ThemeStatus };

type Kind = "done" | "active" | "held" | "new" | "off";
const KIND_LABEL: Record<Kind, string> = { done: "完了", active: "進行中", held: "保留", new: "未着手", off: "選べない" };

function kindOf(s: ThemeStatus): Kind {
  switch (s.kind) {
    case "done": return "done";
    case "open": case "judged": return "active";
    case "held": return "held";
    case "new": return "new";
    case "unavailable": return "off";
  }
}

/**
 * 今日の進み方。テーマ 1 つ = 1 区画の進みバー（色＋濃さ＋ラベルで区別、色だけに頼らない）と、
 * 終わった実験の数のヒーロー数字。区画をタップするとそのテーマへ。
 */
export function Progress({ cells, signedCount, onOpenTheme }: { cells: Cell[]; signedCount: number; onOpenTheme: (t: Theme) => void }) {
  const kinds = cells.map((c) => kindOf(c.status));
  const count = (k: Kind) => kinds.filter((x) => x === k).length;
  const available = cells.length - count("off");
  const doneThemes = count("done");
  const pct = available ? Math.round((doneThemes / available) * 100) : 0;
  const legend: Kind[] = (["done", "active", "held", "new", "off"] as Kind[]).filter((k) => count(k) > 0);

  return (
    <section className="prog" aria-label="今日の進み方">
      <div className="prog__head">
        <div className="prog__hero">
          <span className="prog__n">{signedCount}</span>
          <span className="prog__k">終わった実験</span>
        </div>
        <div className="prog__sub">
          <span className="prog__pct">{pct}%</span>
          <span className="prog__k">テーマ {doneThemes} / {available} 完了（全 {cells.length}）</span>
        </div>
      </div>

      <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
        <defs>
          <pattern id="prog-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line)" strokeWidth="2" />
          </pattern>
        </defs>
      </svg>

      <ol className="prog__track" aria-label="テーマごとの状態">
        {cells.map(({ theme, status }, i) => {
          const k = kinds[i];
          const no = i + 1;
          const label = `${no}. ${theme.title}: ${KIND_LABEL[k]}${status.kind === "done" ? ` ${status.count}/${status.total}` : ""}`;
          return (
            <li key={theme.id} className={`prog__cell prog__cell--${k}`}>
              <button type="button" className="prog__btn" title={label} aria-label={label} disabled={k === "off"} onClick={() => onOpenTheme(theme)}>
                {k === "off" ? <svg className="prog__hatch" aria-hidden><rect width="100%" height="100%" fill="url(#prog-hatch)" /></svg> : null}
                <span className="prog__num" aria-hidden>{no}</span>
                {k === "done" && <span className="prog__mark">✓</span>}
                {k === "active" && <span className="prog__mark">…</span>}
                {k === "held" && <span className="prog__mark">!</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <ul className="prog__legend">
        {legend.map((k) => (
          <li key={k} className="prog__li">
            <span className={`prog__dot prog__dot--${k}`} aria-hidden />
            <span>{KIND_LABEL[k]}</span>
            <strong>{count(k)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
