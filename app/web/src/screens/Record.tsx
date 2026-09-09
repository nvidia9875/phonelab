import { Button, Card, Foot, Icon, Screen, Signature, Timeline } from "../components/ui";
import { record } from "../sample/data";

export function Record({ onExport, onSend }: { onExport: () => void; onSend: () => void }) {
  const r = record;
  return (
    <Screen badge="実験記録" tone="outline" tight>
      <Card row>
        <Icon name="ribbon" size={28} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <p style={{ fontSize: 14, fontWeight: 700 }}>
            {r.title}　記録 {r.id}
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>検査を通った測定だけに、サーバが署名しています</p>
        </div>
      </Card>

      <Timeline items={r.events} />

      <Signature signer={r.signer} hash={r.hash} note="保証するのは「許可の範囲で測定が行われ、検査を通った」こと。振ったのが誰かまでは保証しない" />

      <Foot row>
        <Button sm onClick={onExport}>PDF で書き出す</Button>
        <Button sm secondary onClick={onSend}>先生に送る</Button>
      </Foot>
    </Screen>
  );
}
