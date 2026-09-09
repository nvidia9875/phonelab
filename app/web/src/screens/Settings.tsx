import { Button, Card, Eyebrow, Foot, FootNote, Screen } from "../components/ui";
import type { Settings as SettingsValue } from "../store/records";
import "./catalog.css";

export interface SettingsProps {
  settings: SettingsValue;
  onChange: (patch: Partial<SettingsValue>) => void;
  onMe: () => void;
  onTeacher: () => void;
  onHome: () => void;
}

/** 設定。テストモードは審査員・開発用で、記録には demo の印が残る */
export function Settings({ settings, onChange, onMe, onTeacher, onHome }: SettingsProps) {
  return (
    <Screen badge="設定" tone="outline" onHome={onHome}>
      <Card>
        <Eyebrow>テスト</Eyebrow>
        <label className="switch-row">
          <span>
            <span className="switch-row__t">テストモード</span>
            <span className="switch-row__d">全部のテーマを選べるようにします。準備中のテーマは仮の実験で流れだけ通り、センサーが無い端末でもサンプルの測定で進めます。記録には「サンプル」と残ります</span>
          </span>
          <button type="button" role="switch" aria-checked={settings.testMode} className={`toggle${settings.testMode ? " toggle--on" : ""}`} onClick={() => onChange({ testMode: !settings.testMode })} aria-label="テストモード">
            <span className="toggle__knob" />
          </button>
        </label>
      </Card>

      <Card variant="line">
        <Eyebrow>ほかの画面</Eyebrow>
        <Button sm secondary onClick={onMe}>生徒の情報（学級コード・番号・記録の消去）</Button>
        <Button sm secondary onClick={onTeacher}>教員画面を開く</Button>
      </Card>

      <Foot>
        <Button onClick={onHome}>トップへ</Button>
        <FootNote>テストモードは端末ごとの設定です。学級の許可や先生の停止より優先はしません。</FootNote>
      </Foot>
    </Screen>
  );
}
