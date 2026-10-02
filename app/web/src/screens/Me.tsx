import { useState } from "react";
import { Button, Card, Eyebrow, Foot, FootNote, Screen, Section } from "../components/ui";
import { SENSOR_LABEL } from "../catalog/themes";
import type { Student } from "../store/records";
import { deviceTier, type ClassPolicy, type DeviceCaps } from "../store/status";
import "./catalog.css";

export interface MeProps {
  student: Student | null;
  caps: DeviceCaps;
  policy: ClassPolicy;
  recordCount: number;
  /** 学級コードで入場する。失敗したら error、初めての入場なら合言葉（secret）を返す。2 台目は合言葉を添える */
  onSave: (s: Student) => Promise<{ error: string } | { secret: string | null }>;
  onClear: () => void;
  onHome: () => void;
}

/** 生徒の情報。名前は持たない。学級コードと番号、端末のセンサー、学級の許可（読むだけ） */
export function Me({ student, caps, policy, recordCount, onSave, onClear, onHome }: MeProps) {
  const [classCode, setClassCode] = useState(student?.classCode ?? "");
  const [number, setNumber] = useState(student?.number ?? "");
  const [secret, setSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 初めての入場で出た合言葉。トップへ戻る前に、これだけの画面を見せる（家のスマホで要る。10/2 の通し操作）
  const [fresh, setFresh] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const ok = classCode.trim().length >= 3 && number.trim().length >= 1 && !pending;
  const needsSecret = !!error && error.includes("合言葉");
  async function save() {
    if (!ok) return;
    setPending(true);
    setError(null);
    try {
      const res = await onSave({ classCode: classCode.trim().toUpperCase(), number: number.trim().toUpperCase(), secret: secret.trim().toUpperCase() || undefined });
      if ("error" in res) setError(res.error);
      else if (res.secret) setFresh(res.secret);
      else onHome();
    } finally {
      setPending(false);
    }
  }
  if (fresh) {
    return (
      <Screen badge="合言葉" tone="orange" onHome={onHome}>
        <Card variant="orange" panel>
          <Eyebrow>あなたの合言葉</Eyebrow>
          <p className="secret-big" aria-label={`合言葉 ${fresh.split("").join(" ")}`}>{fresh}</p>
          <p className="card__text">家のスマホで、同じ番号（{number.trim().toUpperCase()}）を使うときに入れます。</p>
          <p className="card__hint">家の人に見せてメモしてもらうか、連絡帳に書いておこう。友だちには見せないでね。忘れたら先生に「番号のリセット」を頼めます。</p>
        </Card>
        <Foot>
          <Button onClick={onHome}>メモした。トップへ</Button>
          <FootNote>合言葉は、この端末の「生徒の情報」でもう一度見られます。</FootNote>
        </Foot>
      </Screen>
    );
  }
  return (
    <Screen badge="生徒の情報" tone="outline" onHome={onHome}>
      <Section label="学級コードと出席番号（名前は入れません）">
        <div className="form">
          <label className="field-label">
            <span>学級コード</span>
            <input className="input" placeholder="例: DEMO-2026" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} autoCapitalize="characters" />
          </label>
          <label className="field-label">
            <span>出席番号</span>
            <input className="input" placeholder="例: 7" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} inputMode="text" />
          </label>
        </div>
        {error && <p className="card__hint" role="alert" style={{ color: "var(--ink)", fontWeight: 700 }}>{error}</p>}
        {(needsSecret || secret) && (
          <label className="field-label" style={{ marginTop: 8 }}>
            <span>合言葉（学校の端末で最初に出た 6 文字）</span>
            <input className="input" placeholder="例: ABC234" value={secret} onChange={(e) => setSecret(e.target.value.toUpperCase())} autoCapitalize="characters" />
          </label>
        )}
        {needsSecret && <p className="card__hint">学校でやった記録は、先生の画面に届いています。この端末には、ここからの記録が残ります。</p>}
        {student?.secret && student.classCode === classCode.trim().toUpperCase() && student.number === number.trim().toUpperCase() && (
          <p className="card__hint" style={{ marginTop: 8 }}>
            この番号の合言葉: <strong style={{ letterSpacing: "0.12em" }}>{student.secret}</strong>　家のスマホで同じ番号を使うときに入れます。人に見せないでください
          </p>
        )}
      </Section>

      <details className="me-more">
      <summary className="me-more__summary">詳しく（センサー・学級の許可・この端末のデータ）</summary>
      <Card variant="line">
        <Eyebrow>この端末で使えるセンサー</Eyebrow>
        <div className="kv"><span className="kv__k">加速度・ジャイロ</span><span>{deviceTier(caps) === "T0" ? "ありません" : caps.motionEvents === "yes" ? "使える" : "測るときに確かめます"}</span></div>
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
        {confirmClear ? (
          <div className="clear-confirm" role="group" aria-label="記録を消すか確かめる">
            <p className="card__hint">この端末の記録を {recordCount} 件すべて消します。先生の画面に届いた分は残ります。</p>
            <div style={{ display: "flex", gap: 8 }}>
              <Button sm secondary onClick={() => setConfirmClear(false)}>やめる</Button>
              <Button sm onClick={() => { onClear(); setConfirmClear(false); }}>消す</Button>
            </div>
          </div>
        ) : (
          <button type="button" className="link-danger" onClick={() => setConfirmClear(true)}>この端末の記録を消す…</button>
        )}
      </Card>
      </details>

      <Foot>
        <Button disabled={!ok} onClick={() => void save()}>{pending ? "学級を確かめています…" : "保存してトップへ"}</Button>
        <FootNote>学級コードと番号は、先生の画面で進み方を見るためだけに使います。</FootNote>
      </Foot>
    </Screen>
  );
}
