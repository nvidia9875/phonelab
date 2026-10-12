import { Button, Card, CardBody, CardTitle, Eyebrow, Foot, FootNote, Screen } from "../components/ui";

/** 先生が全端末を止めたとき。センサーは読まない。解除は先生だけ。
 * 学級につながらず先生の停止が届くか分からないときも、ここで待つ（10/9） */
export function Halted({ halted, unreachable = false, onHome }: { halted: boolean; unreachable?: boolean; onHome: () => void }) {
  const title = halted ? "先生が学級の測定を止めました" : unreachable ? "学級につながっていません" : "測定の停止は解除されました";
  const body = halted
    ? "センサーは読みません。先生が解除するまで待ってください。途中だった測定は記録に入りません。"
    : unreachable
      ? "先生の「止める」が届くか確かめられないので、つながるまで測定はお休みです。Wi-Fi を確かめてね。つながったら「トップに戻る」から続けられます。"
      : "トップに戻って続きから進めます。";
  return (
    <Screen badge="停止">
      <Card variant="navy">
        <Eyebrow>{unreachable && !halted ? "通信" : "先生の操作"}</Eyebrow>
        <CardTitle size="lg">{title}</CardTitle>
        <CardBody>{body}</CardBody>
      </Card>
      <Foot>
        <Button onClick={onHome} disabled={halted}>トップに戻る</Button>
        <FootNote>止めるのは人。ラボ先生は止められません。</FootNote>
      </Foot>
    </Screen>
  );
}
