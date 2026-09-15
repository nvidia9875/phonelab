import { Button, Card, Icon, Screen, Section } from "../components/ui";
import { SENSOR_LABEL, THEMES, themesFor, type School, type Theme } from "../catalog/themes";
import type { Student, StudyRecord } from "../store/records";
import { themeStatus, type ClassPolicy, type DeviceCaps, type ThemeStatus } from "../store/status";
import { ThemeArt } from "../components/ThemeArt";
import { Progress } from "../components/Progress";
import "./catalog.css";

export interface HomeProps {
  student: Student | null;
  records: StudyRecord[];
  caps: DeviceCaps;
  policy: ClassPolicy;
  halted: boolean;
  school: School;
  onOpenTheme: (theme: Theme) => void;
  onOpenRecord: (id: string) => void;
  onMe: () => void;
  onSettings: () => void;
  testMode: boolean;
}

/** 入口の言葉。中学は興味と理解、高校は点数につながる練習（docs/curriculum-coverage.md §5） */
const HERO: Record<School, { title: [string, string]; sub: string; section: string }> = {
  jhs: {
    title: ["ふしぎを、", "手元の端末でたしかめよう。"],
    sub: "テーマを選んで「こうなると思う」を書くと、AI がそれを試せる実験をいっしょに考えます。答えは測って、自分で見つける。",
    section: "ふしぎから選ぶ",
  },
  hs: {
    title: ["自分で測ったグラフで、", "実験問題に強くなる。"],
    sub: "予想を書くと、AI が確かめる実験を考えます。測った値から関係を読む練習は、共通テストの実験・グラフの問題につながります。",
    section: "科目と単元から選ぶ",
  },
};

/** トップ: 学級と番号、進み方、テーマのカタログ（状態つき）、記録 */
export function Home({ student, records, caps, policy, halted, school, onOpenTheme, onOpenRecord, onMe, onSettings, testMode }: HomeProps) {
  const statuses = themesFor(school).map((t) => ({ theme: t, status: themeStatus(t, records, caps, policy, testMode) }));
  const done = records.filter((r) => r.status === "signed").length;
  const signed = records.filter((r) => r.status === "signed" || r.status === "judged");
  const hero = HERO[school];

  return (
    <Screen
      right={
        <span className="head-right">
          <button type="button" className={`student-chip${student ? "" : " student-chip--empty"}`} onClick={onMe}>
            {student ? `${student.classCode} ${student.number}` : "学級と番号を入れる"}
          </button>
          <button type="button" className="gear" onClick={onSettings} aria-label="設定">
            <Icon name="gear" size={16} />
          </button>
        </span>
      }
    >
      <div className="hero">
        <h2 className="hero__title">{hero.title[0]}<br />{hero.title[1]}</h2>
        <p className="hero__sub">{hero.sub}</p>
      </div>

      {!student && (
        <Card variant="orange">
          <p className="card__eyebrow">はじめる前に</p>
          <p className="card__text">学級コードと出席番号を入れてください。名前は要りません。</p>
          <Button sm onClick={onMe}>学級と番号を入れる</Button>
        </Card>
      )}

      {testMode && (
        <div className="test-band" role="status">
          <Icon name="warn" size={14} /> テストモード: 全テーマを選べます。測定はサンプル値で進めます
        </div>
      )}

      {halted && (
        <div className="halt-band" role="status">
          <Icon name="stop" /> 先生が学級の測定を止めています。解除されるまでセンサーは読みません
        </div>
      )}

      <Progress cells={statuses} signedCount={done} onOpenTheme={onOpenTheme} />

      <Section label={hero.section}>
        <div className="themes">
          {statuses.map(({ theme, status }, i) => (
            <ThemeCard key={theme.id} no={i + 1} theme={theme} status={status} disabled={!student} onOpen={() => onOpenTheme(theme)} />
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

/** no は進み方の区画と同じ番号（教科書の流れの順） */
function ThemeCard({ no, theme, status, disabled, onOpen }: { no: number; theme: Theme; status: ThemeStatus; disabled: boolean; onOpen: () => void }) {
  const off = status.kind === "unavailable";
  const cls = ["theme", off && "theme--off", status.kind === "done" && "theme--done", status.kind === "held" && "theme--held", (status.kind === "open" || status.kind === "judged") && "theme--open"]
    .filter(Boolean)
    .join(" ");
  const badge = (() => {
    switch (status.kind) {
      case "new": return <span className="theme__status">はじめる</span>;
      case "open": return <span className="theme__status theme__status--open">{status.label}</span>;
      case "held": return <span className="theme__status theme__status--held">保留中</span>;
      case "judged": return <span className="theme__status theme__status--judged">次の予測</span>;
      case "done": return <span className="theme__status theme__status--done">✓ {status.count} / {status.total}</span>;
      case "unavailable": return <span className="theme__status theme__status--off">{theme.enabledBy === "teacher" ? "先生が有効化" : theme.enabledBy === "later" ? "準備中" : "この端末では不可"}</span>;
    }
  })();
  return (
    <button type="button" className={cls} disabled={off} onClick={onOpen} aria-disabled={off} title={disabled ? "先に学級と番号を入れてください" : off ? status.reason : undefined}>
      <span className="theme__art">
        <ThemeArt id={theme.id} muted={off} />
      </span>
      <span className="theme__body">
        <span className="theme__title">
          <span className="theme__no">{no}</span>
          {theme.title}
        </span>
        <span className="theme__tag">{theme.course}　{theme.tagline}</span>
      </span>
      <span className="theme__foot">
        {badge}
        <span className="theme__meta">
          {theme.sensors.filter((x) => x !== "speaker").map((x) => (
            <span className="tag tag--teal" key={x}>{SENSOR_LABEL[x]}</span>
          ))}
          <span className="tag">{theme.seconds} 秒</span>
        </span>
      </span>
      {off && status.reason !== "準備中" && <span className="theme__reason">{status.reason}</span>}
      {status.kind === "done" && status.labels.length > 0 && <span className="theme__reason">終わった: {status.labels.join("、")}</span>}
    </button>
  );
}
