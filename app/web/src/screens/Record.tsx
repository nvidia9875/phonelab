import { Button, Card, Foot, Icon, Screen, Signature, Timeline } from "../components/ui";
import type { Theme, Variant } from "../catalog/themes";
import type { StudyRecord } from "../store/records";

export interface RecordProps {
  theme: Theme;
  variant: Variant | null;
  record: StudyRecord;
  onVerify: () => void;
  onHome: () => void;
}

/** 画面 6: 署名付き実験記録。署名はサーバ実装後。いまは端末のハッシュだけ */
export function Record({ theme, variant, record, onVerify, onHome }: RecordProps) {
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
          <p style={{ fontSize: 12, color: "var(--muted)" }}>{statusText[record.status]}</p>
        </div>
      </Card>

      <Timeline items={record.events.map((e) => ({ t: e.t, k: e.k, tone: e.tone, body: e.body }))} />

      {record.signature ? (
        <Signature
          signer={record.signature.signer}
          hash={record.signature.hash}
          note={record.signature.server ? "保証するのは「許可の範囲で測定が行われ、検査を通った」こと。振ったのが誰かまでは保証しない" : "端末で計算したハッシュ。サーバの署名は実装後に付きます"}
        />
      ) : null}

      <Foot row>
        <Button sm onClick={onVerify}>端末で再検証</Button>
        <Button sm secondary onClick={onHome}>トップへ</Button>
      </Foot>
    </Screen>
  );
}
