import { Button, Card, Foot, Icon, Screen, Signature, Timeline } from "../components/ui";
import type { Theme, Variant } from "../catalog/themes";
import type { StudyRecord } from "../store/records";

export interface RecordProps {
  theme: Theme;
  variant: Variant | null;
  record: StudyRecord;
  onHome: () => void;
}

/** 画面 6: 実験記録。いまは端末のハッシュだけ（Cloud KMS の署名と端末での再検証は設計だけ。10/2 採点で、動かないボタンを外した） */
export function Record({ theme, variant, record, onHome }: RecordProps) {
  const title = `${theme.title}${variant ? `と${variant.changes.split("（")[0]}` : ""}`;
  const statusText: Record<StudyRecord["status"], string> = {
    open: "進行中",
    held: "保留のまま",
    judged: "判定済み。署名はサーバ実装後",
    signed: record.signature?.server ? "検査を通った測定だけに、サーバが署名しています" : "検査を通った測定に端末がハッシュを付けました。サーバの署名は実装後",
    stopped: "途中で停止",
  };
  return (
    <Screen badge="実験記録" tone="outline" tight onHome={onHome}>
      <Card row>
        <Icon name="ribbon" size={28} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <p style={{ fontSize: 14, fontWeight: 700 }}>
            {title}　記録 {record.id}
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            {record.measurements.some((m) => m.demo) ? "テストモードのサンプル値。" : ""}
            {statusText[record.status]}
          </p>
        </div>
      </Card>

      {/* 家の人が読むのは、予想 → 許可 → 測定 → 結果 の流れ。ラボ先生の判断の跡とハッシュは「詳しく」に（10/2 の通し操作） */}
      <Timeline items={record.events.filter((e) => e.k !== "判断").map((e) => ({ t: e.t, k: e.k, tone: e.tone, body: e.body }))} />
      <p className="card__hint">ラボ先生（AI）は実験を選ぶ係で、答えは言っていません。結果は、この端末で測った値から機械が決めました。</p>

      {(record.signature || record.events.some((e) => e.k === "判断")) && (
        <details className="record-more">
          <summary className="record-more__summary">詳しく（ラボ先生の判断の跡・記録のハッシュ）</summary>
          <Timeline items={record.events.filter((e) => e.k === "判断").map((e) => ({ t: e.t, k: e.k, tone: e.tone, body: e.body }))} />
          {record.signature ? (
            <Signature
              signer={record.signature.signer}
              hash={record.signature.hash}
              note={record.signature.server ? "保証するのは「許可の範囲で測定が行われ、検査を通った」こと。振ったのが誰かまでは保証しない" : "端末で計算したハッシュ。あとから書き換えると合わなくなります"}
            />
          ) : null}
        </details>
      )}

      <Foot row>
        <Button sm secondary onClick={onHome}>トップへ</Button>
      </Foot>
    </Screen>
  );
}
