import { useState } from "react";
import { Icon } from "../components/ui";
import type { Sensor } from "../catalog/themes";
import { teacher } from "../sample/data";
import type { ClassState } from "../store/records";
import "./teacher.css";

export interface TeacherProps {
  classCode: string;
  /** サーバの学級。この端末が入場していなければ null（停止は端末内だけ） */
  cls: ClassState | null;
  halted: boolean;
  onHalt: (classCode: string | null, pin: string, halted: boolean) => Promise<void>;
  onPolicy: (classCode: string, pin: string, allowedSensors: Sensor[], teacherEnabled: string[]) => Promise<void>;
}

const TOGGLE_SENSORS: { sensor: Sensor; label: string }[] = [
  { sensor: "accelerometer", label: "加速度・ジャイロ" },
  { sensor: "microphone", label: "マイク（特徴量のみ）" },
  { sensor: "camera", label: "カメラ（端末内処理）" },
];
/** 家でやる実験として先生が有効化できるテーマ */
const HOME_THEMES: { id: string; label: string }[] = [{ id: "pendulum", label: "振り子の周期（家で・私物のスマホ）" }];

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "うまくいきませんでした";
}

/** 教員画面。学級の許可・有効化、全端末停止（PIN）、生徒ごとのトレース（いまはサンプル）。名前は出さない、番号だけ */
export function Teacher({ classCode, cls, halted, onHalt, onPolicy }: TeacherProps) {
  const t = teacher;
  const [code, setCode] = useState(classCode);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const allowed = new Set<Sensor>(cls?.allowedSensors ?? ["accelerometer", "gyroscope", "microphone"]);
  const enabled = new Set(cls?.teacherEnabled ?? []);
  const live = !!cls && cls.classCode === code.trim().toUpperCase();

  async function run(work: () => Promise<void>, done: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage(done);
    } catch (e: unknown) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const toggleSensor = (sensor: Sensor) => {
    const next = new Set(allowed);
    const pair: Sensor[] = sensor === "accelerometer" ? ["accelerometer", "gyroscope"] : [sensor];
    if (next.has(sensor)) pair.forEach((x) => next.delete(x));
    else pair.forEach((x) => next.add(x));
    void run(() => onPolicy(code, pin, [...next], [...enabled]), "学級の許可を更新しました");
  };
  const toggleHome = (id: string) => {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void run(() => onPolicy(code, pin, [...allowed], [...next]), next.has(id) ? "家でやる実験を有効化しました" : "家でやる実験を外しました");
  };
  return (
    <main className="teacher">
      <header className="teacher__head">
        <div className="teacher__crumb">
          <h1 className="teacher__brand">PhoneLab</h1>
          <p className="teacher__where">教員画面 ／ 学級 {code || "—"}{live ? "" : "（この端末は未入場。停止は端末内だけ）"}</p>
        </div>
        <div className="teacher__actions">
          <input className="input tinput" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="学級コード" aria-label="学級コード" />
          <input className="input tinput" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="教師 PIN" aria-label="教師 PIN" type="password" inputMode="numeric" />
          <button
            type="button"
            className={`tbtn ${halted ? "tbtn--outline" : "tbtn--halt"}`}
            disabled={busy}
            aria-pressed={halted}
            onClick={() => void run(() => onHalt(live ? code : null, pin, !halted), halted ? "停止を解除しました" : "全端末の測定を止めました")}
          >
            <Icon name="stop" /> {halted ? "停止を解除する" : "全端末の測定を止める"}
          </button>
        </div>
      </header>
      {message && <p className="tmessage" role="status">{message}</p>}

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
              {TOGGLE_SENSORS.map((p) => (
                <div className="perm" key={p.sensor}>
                  <p>{p.label}</p>
                  <button type="button" role="switch" aria-checked={allowed.has(p.sensor)} disabled={busy} className={`toggle${allowed.has(p.sensor) ? " toggle--on" : ""}`} aria-label={p.label} onClick={() => toggleSensor(p.sensor)}>
                    <span className="toggle__knob" />
                  </button>
                </div>
              ))}
              <div className="perm perm--never">
                <p>位置情報</p>
                <p className="perm__never">常に不可</p>
              </div>
            </div>
            <div className="perm-grid" style={{ marginTop: 10 }}>
              {HOME_THEMES.map((h) => (
                <div className="perm" key={h.id}>
                  <p>{h.label}</p>
                  <button type="button" role="switch" aria-checked={enabled.has(h.id)} disabled={busy} className={`toggle${enabled.has(h.id) ? " toggle--on" : ""}`} aria-label={h.label} onClick={() => toggleHome(h.id)}>
                    <span className="toggle__knob" />
                  </button>
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
