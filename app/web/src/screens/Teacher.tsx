import { useEffect, useState } from "react";
import { Icon } from "../components/ui";
import type { Sensor } from "../catalog/themes";
import { ClassError, fetchDashboard, traceUrl, type DashboardInfo, type InsightInfo, type StudentRow } from "../agent/classroom";
import { InsightPanel } from "./InsightPanel";
import type { ClassState } from "../store/records";
import { attentionOf, checkTextOf, claimTextOf, distributionOf, isOnline, measurementLinesOf, stateOf, tracesOfRow } from "./dashboard";
import "./teacher.css";

export interface TeacherProps {
  classCode: string;
  /** サーバの学級。この端末が入場していなければ null（停止は端末内だけ） */
  cls: ClassState | null;
  halted: boolean;
  onHalt: (classCode: string | null, pin: string, halted: boolean) => Promise<void>;
  onPolicy: (classCode: string, pin: string, allowedSensors: Sensor[], teacherEnabled: string[]) => Promise<void>;
  /** 番号の合言葉を消す（端末を替えた子）。次の入場で新しい合言葉が出る */
  onResetStudent: (classCode: string, pin: string, number: string) => Promise<void>;
  /** テスト用。省略時はサーバから取る */
  load?: (classCode: string, pin: string) => Promise<DashboardInfo>;
  loadInsight?: (classCode: string, pin: string) => Promise<InsightInfo>;
}

const TOGGLE_SENSORS: { sensor: Sensor; label: string }[] = [
  { sensor: "accelerometer", label: "加速度・ジャイロ" },
  { sensor: "microphone", label: "マイク（特徴量のみ）" },
  { sensor: "camera", label: "カメラ（端末内処理）" },
];
/** 家でやる実験として先生が有効化できるテーマ */
const HOME_THEMES: { id: string; label: string }[] = [{ id: "pendulum", label: "振り子の周期（家で・私物のスマホ）" }];
const POLL_MS = 5000;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "うまくいきませんでした";
}

/**
 * 教員画面（docs/personas.md §3）: 上に予想の向きの分布、下に保留・却下の子、右上に全端末停止。
 * 生徒の名前は無い。番号だけ。学級コードと教師 PIN で開く。
 */
export function Teacher({ classCode, cls, halted, onHalt, onPolicy, onResetStudent, load = fetchDashboard, loadInsight }: TeacherProps) {
  const [code, setCode] = useState(classCode);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dash, setDash] = useState<DashboardInfo | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // 許可はサーバの学級から（この端末の学級状態が無い教員 PC でも、既定値で上書きしない）
  const allowed = new Set<Sensor>((dash?.allowed_sensors as Sensor[] | undefined) ?? cls?.allowedSensors ?? ["accelerometer", "gyroscope", "microphone"]);
  const enabled = new Set(dash?.teacher_enabled ?? cls?.teacherEnabled ?? []);
  const live = !!cls && cls.classCode === code.trim().toUpperCase();
  const unlocked = pin.length > 0 && code.trim().length >= 3;
  // PIN が通って学級の様子が取れるまで、停止と許可は押せない見た目に（PIN 前に押すと止めたつもりになった。10/2 の通し操作）
  const ready = unlocked && !!dash;

  // PIN が入っている間、5 秒ごとに学級の様子を取る
  useEffect(() => {
    if (!unlocked) {
      setDash(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const d = await load(code, pin);
        if (alive) {
          setDash(d);
          setDashError(null);
        }
      } catch (e: unknown) {
        if (!alive) return;
        setDashError(errorText(e));
        if (e instanceof ClassError && e.status === 403) setDash(null);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [unlocked, code, pin, load]);

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

  const students = dash?.students ?? [];
  const dist = distributionOf(students);
  const attention = attentionOf(students);
  const online = students.filter((s) => isOnline(s)).length;
  const held = students.filter((s) => s.current?.status === "held").length;
  const rejected = students.filter((s) => !!s.current?.rejection_title).length;
  const signed = students.filter((s) => s.current?.status === "signed").length;
  const selectedRow = students.find((s) => s.number === selected) ?? attention[0] ?? null;
  const isHalted = dash ? dash.halted : halted;

  return (
    <main className="teacher">
      <header className="teacher__head">
        <div className="teacher__crumb">
          <h1 className="teacher__brand">PhoneLab</h1>
          <p className="teacher__where">教員画面 ／ 学級 {code || "—"}{live ? "" : "（この端末は未入場）"}</p>
        </div>
        <div className="teacher__actions">
          <input className="input tinput" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="学級コード" aria-label="学級コード" />
          <input className="input tinput" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="教師 PIN" aria-label="教師 PIN" type="password" inputMode="numeric" />
          <button
            type="button"
            className={`tbtn ${isHalted ? "tbtn--outline" : "tbtn--halt"}`}
            disabled={busy || !ready}
            title={ready ? undefined : "学級コードと教師 PIN を入れると押せます"}
            aria-pressed={isHalted}
            onClick={() => void run(() => onHalt(live || unlocked ? code : null, pin, !isHalted), isHalted ? "停止を解除しました" : "全端末の測定を止めました")}
          >
            <Icon name="stop" /> {isHalted ? "停止を解除する" : "全端末の測定を止める"}
          </button>
        </div>
      </header>
      {message && <p className="tmessage" role="status">{message}</p>}
      {!unlocked && <p className="tmessage">学級コードと教師 PIN を入れると、生徒の進み方が出て、停止や許可のボタンが押せるようになります（5 秒ごとに更新）。名前は出ません、番号だけです。</p>}
      {dash && <p className="tupdated">{new Date(dash.fetched_at).toLocaleTimeString("ja-JP")} 時点（5 秒ごとに更新）</p>}
      {dashError && <p className="tmessage" role="alert">{dashError}</p>}

      <div className="teacher__grid">
        <section className="tpanel">
          <div className="tpanel__head">
            <h2>予想の分布</h2>
            <p className="tpanel__hint">{dist ? `${dist.themeTitle}・${dist.total} 人` : "まだ予想がありません"}</p>
          </div>
          {dist && (
            <div className="dist" role="list" aria-label="予想の向きの分布">
              {dist.bars.map((b) => (
                <div className="dist__row" role="listitem" key={b.label}>
                  <p className="dist__label">{b.label}</p>
                  <div className="dist__track"><div className="dist__bar" style={{ width: `${dist.total ? Math.round((b.count / dist.total) * 100) : 0}%` }} /></div>
                  <p className="dist__n"><strong>{b.count}</strong> 人</p>
                </div>
              ))}
            </div>
          )}

          <div className="tpanel__head" style={{ marginTop: 18 }}>
            <h2>いま見に行く子</h2>
            <p className="tpanel__hint">保留 → 却下 → 予想で止まっている、の順</p>
          </div>
          {attention.length === 0 ? (
            <p className="tpanel__hint">いまはいません</p>
          ) : (
            attention.map((s) => <StudentLine key={s.number} s={s} onSelect={() => setSelected(s.number)} selected={selectedRow?.number === s.number} />)
          )}

          <div className="tpanel__head" style={{ marginTop: 18 }}>
            <h2>生徒の進み方</h2>
            <p className="tpanel__hint">名前は出さない。番号だけ</p>
          </div>
          <div className="trow trow--head">
            <p>番号</p><p>いまの予想</p><p>状態</p><p>検査</p>
          </div>
          {students.length === 0 && <p className="tpanel__hint" style={{ padding: "8px 0" }}>{unlocked ? "まだ誰も入場していません" : "—"}</p>}
          {students.map((s) => <StudentLine key={s.number} s={s} onSelect={() => setSelected(s.number)} selected={selectedRow?.number === s.number} />)}
          <div className="tstats">
            <p><strong>{online}</strong> 人が接続（10 分以内）</p>
            <p><strong>{held}</strong> 件 保留中</p>
            <p><strong>{rejected}</strong> 件 安全のため止めた</p>
            <p><strong>{signed}</strong> 件 記録済み</p>
          </div>
        </section>

        <div className="teacher__side">
          <InsightPanel classCode={code} pin={pin} unlocked={unlocked} onSelect={setSelected} load={loadInsight} />
          <section className="tpanel">
            <h2>この学級の許可</h2>
            <div className="perm-grid">
              {TOGGLE_SENSORS.map((p) => (
                <div className="perm" key={p.sensor}>
                  <p>{p.label}</p>
                  <button type="button" role="switch" aria-checked={allowed.has(p.sensor)} disabled={busy || !ready} className={`toggle${allowed.has(p.sensor) ? " toggle--on" : ""}`} aria-label={p.label} onClick={() => toggleSensor(p.sensor)}>
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
                  <button type="button" role="switch" aria-checked={enabled.has(h.id)} disabled={busy || !ready} className={`toggle${enabled.has(h.id) ? " toggle--on" : ""}`} aria-label={h.label} onClick={() => toggleHome(h.id)}>
                    <span className="toggle__knob" />
                  </button>
                </div>
              ))}
            </div>
            <div className="limits">
              <p>ラボ先生に聞ける回数</p>
              <span className="limit">5 回 / 実験</span>
              <p style={{ marginLeft: 8 }}>測定の上限</p>
              <span className="limit">30 秒</span>
            </div>
          </section>

          <section className="tpanel tpanel--navy">
            <h2>{selectedRow ? `${selectedRow.number} の記録` : "記録"}</h2>
            {selectedRow?.current ? (
              <div className="ttrace">
                {selectedRow.current.events.map((it, i) => (
                  <div className={`ttrace__row${it.k === "判断" ? " ttrace__row--agent" : ""}`} key={i}>
                    <p className="ttrace__t">{it.t}</p>
                    <p className={it.k === "却下" || it.k.includes("保留") ? "ttrace__strong" : undefined}>{it.k}: {it.body}</p>
                  </div>
                ))}
                {selectedRow.current.result && selectedRow.current.result.a !== undefined && (
                  <p className="ttrace__row ttrace__row--agent">
                    <span className="ttrace__t">値</span>
                    <span>
                      {selectedRow.current.result.a?.toPrecision(4)} → {selectedRow.current.result.b?.toPrecision(4)}（許容 {selectedRow.current.result.tolerance?.toPrecision(3)}）
                    </span>
                  </p>
                )}
                {measurementLinesOf(selectedRow.current).map((m) => (
                  <p className={`ttrace__row${m.pass ? "" : " ttrace__strong"}`} key={m.key}>
                    <span className="ttrace__t">{m.label}</span>
                    <span>{m.text}</span>
                  </p>
                ))}
                {tracesOfRow(selectedRow.current).map((t) => (
                  <p className="ttrace__row" style={{ opacity: 0.8 }} key={t.id}>
                    <span className="ttrace__t">{t.stage}</span>
                    <a className="ttrace__link" href={traceUrl(t.id)} target="_blank" rel="noreferrer">
                      trace {t.id.slice(0, 16)}… を Cloud Trace で開く（開発者向け）
                    </a>
                  </p>
                ))}
                {selectedRow.current.hash && (
                  <p className="ttrace__row ttrace__row--agent">
                    <span className="ttrace__t">hash</span>
                    <span style={{ wordBreak: "break-all", fontFamily: "var(--font-mono)" }}>{selectedRow.current.hash}</span>
                  </p>
                )}
                <button type="button" className="tbtn tbtn--outline tbtn--sm" disabled={busy} onClick={() => void run(() => onResetStudent(code, pin, selectedRow.number), `${selectedRow.number} の合言葉を消しました。次の入場で新しい合言葉が出ます`)}>
                  この番号の合言葉をリセット（端末を替えた子）
                </button>
              </div>
            ) : (
              <p className="tpanel__hint" style={{ color: "inherit", opacity: 0.8 }}>生徒の行を押すと、その子の記録の流れが出ます</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function StudentLine({ s, onSelect, selected }: { s: StudentRow; onSelect: () => void; selected: boolean }) {
  const st = stateOf(s.current);
  const ck = checkTextOf(s.current);
  return (
    <button type="button" className={`trow trow--btn${selected ? " trow--selected" : ""}`} onClick={onSelect}>
      <p className="trow__no">{s.number}</p>
      <p>{claimTextOf(s.current)}</p>
      <span className={`tstate tstate--${st.tone}`}>{st.text}</span>
      <p className={`trow__check${ck.strong ? " trow__check--strong" : ""}`}>{ck.text}</p>
    </button>
  );
}
