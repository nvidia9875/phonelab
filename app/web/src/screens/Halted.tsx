import { Button, Card, CardBody, CardTitle, Eyebrow, Foot, FootNote, Screen } from "../components/ui";

/** 先生が全端末を止めたとき。センサーは読まない。解除は先生だけ */
export function Halted({ halted, onHome }: { halted: boolean; onHome: () => void }) {
  return (
    <Screen badge="停止">
      <Card variant="navy">
        <Eyebrow>先生の操作</Eyebrow>
        <CardTitle size="lg">{halted ? "先生が学級の測定を止めました" : "測定の停止は解除されました"}</CardTitle>
        <CardBody>{halted ? "センサーは読みません。先生が解除するまで待ってください。途中の測定は記録に「停止」として残ります。" : "トップに戻って続きから進めます。"}</CardBody>
      </Card>
      <Foot>
        <Button onClick={onHome} disabled={halted}>トップに戻る</Button>
        <FootNote>止めるのは人。この停止も記録に残ります。</FootNote>
      </Foot>
    </Screen>
  );
}
