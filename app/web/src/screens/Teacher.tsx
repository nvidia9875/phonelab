import { Icon } from "../components/ui";
import { teacher } from "../sample/data";
import "./teacher.css";

/** 教員画面。学級の許可・上限、全端末停止、生徒ごとのトレース。名前は出さない、番号だけ */
export function Teacher({ halted, onHalt }: { halted: boolean; onHalt: () => void }) {
  const t = teacher;
  return (
    <main className="teacher">
      <header className="teacher__head">
        <div className="teacher__crumb">
          <h1 className="teacher__brand">PhoneLab</h1>
          <p className="teacher__where">教員画面 ／ {t.className} ／ {t.experiment}</p>
        </div>
        <div className="teacher__actions">
          <button type="button" className="tbtn tbtn--outline">
            <Icon name="list" /> トレース
          </button>
          <button type="button" className={`tbtn ${halted ? "tbtn--outline" : "tbtn--halt"}`} onClick={onHalt} aria-pressed={halted}>
            <Icon name="stop" /> {halted ? "停止を解除する" : "全端末の測定を止める"}
          </button>
        </div>
      </header>

      <div className="teacher__grid">
        <section className="tpanel">
          <div className="tpanel__head">
            <h2>生徒の進み方</h2>
            <p className="tpanel__hint">名前は出さない。番号だけ</p>
          </div>
          <div className="trow trow--head">
            <p>番号</p><p>いまの予想</p><p>状態</p><p>検査</p>
          </div>
          {t.students.map((s) => (
            <div className="trow" key={s.no}>
              <p className="trow__no">{s.no}</p>
              <p>{s.claim}</p>
              <span className={`tstate tstate--${s.tone}`}>{s.state}</span>
              <p className={`trow__check${s.checkStrong ? " trow__check--strong" : ""}`}>{s.check}</p>
            </div>
          ))}
          <div className="tstats">
            <p><strong>{t.stats.connected}</strong> 人が接続</p>
            <p><strong>{t.stats.held}</strong> 件 保留中</p>
            <p><strong>{t.stats.dangerous}</strong> 件 危険実験の提示</p>
            <p><strong>{t.stats.leaks}</strong> 件 答えの漏えい</p>
          </div>
        </section>

        <div className="teacher__side">
          <section className="tpanel">
            <h2>この学級の許可</h2>
            <div className="perm-grid">
              {t.permissions.map((p) => (
                <div className={`perm${p.on === null ? " perm--never" : ""}`} key={p.label}>
                  <p>{p.label}</p>
                  {p.on === null ? (
                    <p className="perm__never">常に不可</p>
                  ) : (
                    <button type="button" role="switch" aria-checked={p.on} className={`toggle${p.on ? " toggle--on" : ""}`} aria-label={p.label}>
                      <span className="toggle__knob" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="limits">
              <p>ヒントの上限</p>
              <span className="limit">{t.limits.hints}回 / 実験</span>
              <p style={{ marginLeft: 8 }}>測定の上限</p>
              <span className="limit">{t.limits.seconds}秒</span>
            </div>
          </section>

          <section className="tpanel tpanel--navy">
            <h2>{t.trace.student} のトレース</h2>
            <div className="ttrace">
              {t.trace.items.map((it, i) => (
                <div className="ttrace__row" key={i}>
                  <p className="ttrace__t">{it.t}</p>
                  <p className={it.strong ? "ttrace__strong" : undefined}>{it.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
