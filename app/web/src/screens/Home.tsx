import { Button, Card, Icon, Screen, Section } from "../components/ui";
import { SENSOR_LABEL, THEMES, type Theme } from "../catalog/themes";
import type { Student, StudyRecord } from "../store/records";
import { themeStatus, type ClassPolicy, type DeviceCaps, type ThemeStatus } from "../store/status";
import "./catalog.css";

export interface HomeProps {
  student: Student | null;
  records: StudyRecord[];
  caps: DeviceCaps;
  policy: ClassPolicy;
  halted: boolean;
  onOpenTheme: (theme: Theme) => void;
  onOpenRecord: (id: string) => void;
  onMe: () => void;
}

/** トップ: 学級と番号、進み方、テーマのカタログ（状態つき）、記録 */
export function Home({ student, records, caps, policy, halted, onOpenTheme, onOpenRecord, onMe }: HomeProps) {
  const statuses = THEMES.map((t) => ({ theme: t, status: themeStatus(t, records, caps, policy) }));
  const available = statuses.filter((s) => s.status.kind !== "unavailable").length;
  const done = records.filter((r) => r.status === "signed").length;
  const held = statuses.filter((s) => s.status.kind === "held").length;
  const signed = records.filter((r) => r.status === "signed" || r.status === "judged");

  return (
    <Screen
      right={
        <button type="button" className={`student-chip${student ? "" : " student-chip--empty"}`} onClick={onMe}>
          {student ? `${student.classCode} ${student.number}` : "学級と番号を入れる"}
        </button>
      }
    >
      <div className="hero">
        <h2 className="hero__title">スマホが実験器具。<br />AI は答えを言わない。</h2>
        <p className="hero__sub">テーマを選んで予想を書くと、Agent がその予想を試せる実験を選びます。決めるのは測定と、あなた。</p>
      </div>

      {!student && (
        <Card variant="orange">
          <p className="card__eyebrow">はじめる前に</p>
          <p className="card__text">学級コードと出席番号を入れてください。名前は要りません。</p>
          <Button sm onClick={onMe}>学級と番号を入れる</Button>
        </Card>
      )}

      {halted && (
        <div className="halt-band" role="status">
          <Icon name="stop" /> 先生が学級の測定を止めています。解除されるまでセンサーは読みません
        </div>
      )}

      <div className="progress" aria-label="今日の進み方">
        <div className="progress__item"><span className="progress__n">{done}</span><span className="progress__k">終わった実験</span></div>
        <div className="progress__item"><span className="progress__n">{held}</span><span className="progress__k">保留中</span></div>
        <div className="progress__item"><span className="progress__n">{available}</span><span className="progress__k">この端末で選べる</span></div>
        <div className="progress__item"><span className="progress__n">{THEMES.length}</span><span className="progress__k">全テーマ</span></div>
      </div>

      <Section label="テーマを選ぶ">
        <div className="themes">
          {statuses.map(({ theme, status }) => (
            <ThemeCard key={theme.id} theme={theme} status={status} disabled={!student} onOpen={() => onOpenTheme(theme)} />
          ))}
        </div>
      </Section>

      <Section label="記録">
        {signed.length === 0 ? (
          <p className="card__hint">まだ記録はありません。検査を通った測定だけが記録になります。</p>
        ) : (
          <div className="records">
            {signed.map((r) => {
              const th = THEMES.find((t) => t.id === r.themeId);
              const v = th?.variants.find((x) => x.id === r.variantId);
              return (
                <button type="button" className="record-row" key={r.id} onClick={() => onOpenRecord(r.id)}>
                  <span className="record-row__id">{r.id}</span>
                  <span>
                    <span className="record-row__t">{th?.title}　{v?.changes.split("（")[0]}</span>
                    <br />
                    <span className="record-row__s">{r.status === "signed" ? "署名済み" : "判定済み・次の予測待ち"}</span>
                  </span>
                  <Icon name="arrow" />
                </button>
              );
            })}
          </div>
        )}
      </Section>
    </Screen>
  );
}

function ThemeCard({ theme, status, disabled, onOpen }: { theme: Theme; status: ThemeStatus; disabled: boolean; onOpen: () => void }) {
  const off = status.kind === "unavailable";
  const cls = ["theme", off && "theme--off", status.kind === "done" && "theme--done"].filter(Boolean).join(" ");
  const badge = (() => {
    switch (status.kind) {
      case "new": return <span className="theme__status">はじめる</span>;
      case "open": return <span className="theme__status theme__status--open">{status.label}</span>;
      case "held": return <span className="theme__status theme__status--held">保留 再測定できます</span>;
      case "judged": return <span className="theme__status theme__status--judged">次の予測を書く</span>;
      case "done": return <span className="theme__status theme__status--done">✓ {status.count} / {status.total}</span>;
      case "unavailable": return <span className="theme__status theme__status--off">選べない</span>;
    }
  })();
  return (
    <button type="button" className={cls} disabled={off} onClick={onOpen} aria-disabled={off} title={disabled ? "先に学級と番号を入れてください" : undefined}>
      <span>
        <span className="theme__title">{theme.title}</span>
        <br />
        <span className="theme__tag">{theme.tagline}</span>
      </span>
      {badge}
      <span className="theme__meta">
        {theme.sensors.map((s) => (
          <span className="tag tag--teal" key={s}>{SENSOR_LABEL[s]}</span>
        ))}
        <span className="tag">{theme.seconds} 秒</span>
        <span className="tag">{theme.materials}</span>
      </span>
      {off && <span className="theme__reason">{status.reason}</span>}
      {status.kind === "done" && status.labels.length > 0 && <span className="theme__reason">終わった実験: {status.labels.join("、")}</span>}
    </button>
  );
}
