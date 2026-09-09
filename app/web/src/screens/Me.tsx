import { useState } from "react";
import { Button, Card, Eyebrow, Foot, FootNote, Screen, Section } from "../components/ui";
import { SENSOR_LABEL } from "../catalog/themes";
import type { Student } from "../store/records";
import type { ClassPolicy, DeviceCaps } from "../store/status";
import "./catalog.css";

export interface MeProps {
  student: Student | null;
  caps: DeviceCaps;
  policy: ClassPolicy;
  recordCount: number;
  onSave: (s: Student) => void;
  onClear: () => void;
  onHome: () => void;
}

/** 生徒の情報。名前は持たない。学級コードと番号、端末のセンサー、学級の許可（読むだけ） */
export function Me({ student, caps, policy, recordCount, onSave, onClear, onHome }: MeProps) {
  const [classCode, setClassCode] = useState(student?.classCode ?? "");
  const [number, setNumber] = useState(student?.number ?? "");
  const ok = classCode.trim().length >= 3 && number.trim().length >= 1;
  return (
    <Screen badge="生徒の情報" tone="outline" onHome={onHome}>
      <Section label="学級コードと出席番号（名前は入れません）">
        <div className="form">
          <input className="input" placeholder="学級コード（例: DEMO-2026）" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} autoCapitalize="characters" />
          <input className="input" placeholder="出席番号（例: S-04）" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} />
        </div>
      </Section>

      <Card variant="line">
        <Eyebrow>この端末で使えるセンサー</Eyebrow>
        <div className="kv"><span className="kv__k">加速度・ジャイロ</span><span>{caps.motion ? "使える" : "ありません"}</span></div>
        <div className="kv"><span className="kv__k">マイク・カメラ</span><span>{caps.media ? "使える（端末内処理）" : "使えません"}</span></div>
        <div className="kv"><span className="kv__k">位置情報</span><span>常に使わない</span></div>
      </Card>

      <Card variant="line">
        <Eyebrow>学級の許可（先生が決めます）</Eyebrow>
        <div className="kv"><span className="kv__k">許可されたセンサー</span><span>{policy.allowedSensors.map((s) => SENSOR_LABEL[s]).join("・")}</span></div>
        <div className="kv"><span className="kv__k">測定の上限</span><span>30 秒</span></div>
        <div className="kv"><span className="kv__k">ヒントの上限</span><span>3 回 / 実験</span></div>
      </Card>

      <Card variant="line">
        <Eyebrow>この端末のデータ</Eyebrow>
        <div className="kv"><span className="kv__k">記録</span><span>{recordCount} 件</span></div>
        <div className="kv"><span className="kv__k">生データ</span><span>端末の中だけ。送っていません</span></div>
        <Button sm secondary onClick={onClear}>この端末の記録を消す</Button>
      </Card>

      <Foot>
        <Button disabled={!ok} onClick={() => onSave({ classCode: classCode.trim(), number: number.trim() })}>保存してトップへ</Button>
        <FootNote>学級コードと番号は、先生の画面で進み方を見るためだけに使います。</FootNote>
      </Foot>
    </Screen>
  );
}
