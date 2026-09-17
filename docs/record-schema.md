# 実験記録スキーマと署名・Trace

> 許可 → 計画 → 承認 → 測定 → 検査 → 判定 → 次の予測 を **一本の記録** にし、検査を通った測定だけにサーバが署名する。
> 画面 6「署名付き実験記録」、教員画面の「トレース」、Cloud Trace のスパン設計。

## 1. 記録（record）

Firestore: `classes/{class_code}/students/{student_no}/records/{record_id}`。`record_id` は学級内で一意の 4 桁（画面例: `0412`）。

```jsonc
{
  "record_id": "0412",
  "class_code": "DEMO-2026",
  "student_no": "S-04",                     // 名前は持たない。番号だけ
  "experiment_id": "pendulum_mass",
  "title": "振り子の周期と重さ",
  "status": "signed",                       // "open" | "held" | "judged" | "signed" | "stopped"
  "device": { "class": "ios_safari", "capabilities": ["accelerometer","gyroscope","microphone"] },
  "events": [ /* 2 章 */ ],
  "result": {                               // judged 以降
    "values": { "A": { "T_s": 1.42, "unc_s": 0.01 }, "B": { "T_s": 1.43, "unc_s": 0.01 } },
    "delta_s": 0.01, "tolerance_s": 0.05,
    "observed": "same", "claim": "faster", "consistent": false,
    "statement": "重さを2倍にしても、周期は変わらなかった"
  },
  "signature": { /* 3 章 */ },
  "counters": { "hints": 0, "planner_calls": 2, "remeasure": { "A": 1, "B": 0 }, "answer_leaks": 0 },
  "created_at": "2026-09-20T10:02:00+09:00",
  "updated_at": "2026-09-20T10:10:00+09:00"
}
```

## 2. イベント（events）— 画面 6 の行がそのまま

すべてサーバが付ける時刻（`t`）と種別（`type`）を持つ。端末の時計は信用しない（測定内部の相対時刻だけ端末）。

| type | 誰が | payload | 画面 6 の表示例 |
|---|---|---|---|
| `predict` | 生徒 | `{ text, interpreted_claim }` | 10:02 予想 重いほど速く振れる（証拠を見る前に記入） |
| `plan` | Planner | `{ experiment_id, changes, holds, sensors, seconds, why_this, model, prompt_hash }` | 10:03 計画 同じ長さ、重さ 2 倍。Agent 提案、本人承認 |
| `policy` | Policy | `{ decision, reasons[], adjusted{}, armor{} }` | （却下のときだけ表示: 10:12 却下 forbidden_action drop_phone） |
| `permit` | Policy | `{ sensors, seconds, repeats, denied: ["geolocation","microphone","camera"] }` | 10:03 許可 加速度・ジャイロ、20 秒 × 2 回。位置・マイク・カメラなし |
| `approve` | 生徒 | `{ permit_ref }` | （permit と同じ行にまとめる） |
| `measure` | 端末 | `{ condition, features{}, raw_hash }` | 10:05 測定 1 … |
| `verify` | Verifier | `{ condition, result: "pass"|"hold", codes[], adopted{} }` | 10:05 測定 1 欠測 0.5 s のため保留。再測定 |
| `judge` | Verifier | `{ observed, claim, consistent, delta_s, tolerance_s, statement }` | 10:08 判定 予想は成り立たず。差 0.01 s は許容 0.05 s の内側 |
| `explain` | 生徒 | `{ text }` | （なぜそうなったと思う？ の記入） |
| `next_predict` | 生徒 | `{ experiment_id, direction }` | 10:10 次の予測 糸 2 倍で「遅くなる」と記入。次の実験へ |
| `stop` | 生徒 / 教師 | `{ by: "student"|"teacher" }` | 10:06 停止 先生が全端末を止めた |
| `sign` | サーバ | 3 章 | 署名ブロック |

`measure.features` は端末が送る特徴量（→ verifier.md 1 章）。**波形・音声・映像のフィールドは存在しない**。サーバ側のスキーマ検証（pydantic）で未知フィールドは拒否する（`extra = "forbid"`）ので、端末のバグで生データが混ざっても保存されない。

## 3. 署名（sign）

「許可の範囲で測定が行われ、検査を通った」ことをサーバが保証する。**振ったのが誰かまでは保証しない**（画面 6 の注記どおり）。**特徴量が端末で正直に計算されたことも保証しない**。端末は生データを IndexedDB に残し、画面 6 の「端末で再検証」で特徴量と `raw_hash` を再計算して一致を示せる（→ architecture.md 4.4）。README の「信頼境界」節にこの 2 行を書く。

### 3.1 署名対象

```
payload = canonical_json({
  record_id, class_code, student_no, experiment_id,
  events: [ permit, measure(all), verify(all), judge ],   // predict/explain の自由記述は含めない（個人の文章を署名に縛らない）
  result
})
digest = sha256(payload)
```

canonical_json は RFC 8785（JCS）。Python は `rfc8785` パッケージ、検証は端末側（JS）でも同じ結果になることをテストする。

### 3.2 鍵

| 方式 | 使うとき |
|---|---|
| **Cloud KMS 非対称鍵（EC P-256, `EC_SIGN_P256_SHA256`）** | 本命。公開鍵を `/.well-known/phonelab-verifier.pem` で配る。誰でも検証できる |
| HMAC-SHA256（Secret Manager の鍵） | KMS の疎通に失敗したときの退避。検証はサーバ経由 |

署名者名は `PhoneLab Verifier`。画面 6 には `hash 3f9a…c21e`（digest 先頭・末尾）と QR。

### 3.3 QR の中身

`https://<deploy>/v/0412?h=3f9a…`（record_id と digest 先頭 8 桁）。開くと検証ページが署名を再計算して「一致 / 不一致」を出す。PDF 書き出しは同じページを印刷（時間があれば）。

### 3.4 署名される条件

- `status == "judged"`（Verifier を通り、判定まで終わった）
- 途中で `stop` が入った記録は署名しない（`status: stopped` のまま残す）
- 保留のまま終わった記録は署名しない（`status: held`）

## 4. 端末 → サーバの送信スキーマ（測定）

```jsonc
POST /api/records/{record_id}/measure
{
  "condition": "B",
  "permit_ref": "evt_000004",
  "features": {
    "profile": "pendulum_period",
    "n_samples": 1198, "duration_s": 20.0, "rate_hz": 59.9,
    "interval_median_ms": 16.7, "max_gap_ms": 18, "gaps": [], "gap_total_ms": 0,
    "T_accel_s": 1.43, "T_gyro_s": 1.43,
    "T_accel_first_half_s": 1.43, "T_accel_second_half_s": 1.42,
    "T_gyro_first_half_s": 1.43, "T_gyro_second_half_s": 1.43,
    "accel_norm_peak_ms2": 12.1, "accel_norm_std_ms2": 1.4,
    "gyro_peak_dps": 95, "gyro_std_dps": 40,
    "saturation_runs": 0, "autocorr_peak": { "accel": 0.81, "gyro": 0.93 }
  },
  "raw_hash": "sha256:…",
  "client_started_at_ms": 0, "client_ended_at_ms": 20003
}
```

画面 2 の「送信したのは数値 5 つとフラグ 3 つ、約 100 バイト」は、生徒向けには要約（周期 2 つ、半分ずつ 4 つ…を「数値」とまとめ、欠測・飽和・一致を「フラグ」）。実際のバイト数を画面に出す（嘘にならないように、送信直前に `JSON.stringify(body).length` を表示）。

`features` の形は `profile` ごとに違う（`pendulum_speed` / `pitch` / `pendulum_period` / `freefall_time`。定義は [verifier.md](verifier.md) 1 章）。上の例は高校の振り子の周期。

## 5. Cloud Trace のスパン設計

ADK の組み込みトレース（自動スパン名は `invoke_agent`、`call_llm`、`execute_tool`、`generate_content`）をそのまま使い、その上に自前のスパンを足す。**1 実験記録 = 1 トレース**。`record_id` を trace 属性に付けて教員画面から引く。本文（予想文・Planner の出力文）はスパンに入れない（`ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS=false`。→ architecture.md 4.5）。

```
trace: phonelab.record  {record_id, class_code, student_no, experiment_id}
├─ span: phonelab.predict        {claim.variable, claim.direction, text_len, prompt_hash}
├─ span: phonelab.model_armor    {match_found: bool, filters[], location: us-central1, latency_ms}   ← on_user_message_callback
├─ span: invoke_agent (planner)  ← ADK 自動
│   ├─ span: call_llm            ← ADK 自動 {model, tokens_in, tokens_out}
│   ├─ span: phonelab.leak_check {answer_leak: bool, stripped_fields[]}                             ← after_model_callback
│   └─ span: phonelab.policy     {decision, reasons[], adjusted{}}                                  ← after_model_callback
├─ span: phonelab.permit_approve {sensors[], seconds, approved_by: student, wait_ms}
├─ span: phonelab.measure.A      {rate_hz, gap_total_ms, saturation_runs}   ← 端末の相対時刻から復元
├─ span: phonelab.verify.A       {result, codes[]}
├─ span: phonelab.measure.A.retry …
├─ span: phonelab.measure.B / verify.B
├─ span: phonelab.judge          {observed, consistent, delta_s}
├─ span: phonelab.halt           {by, halt_latency_ms}                        ← 停止が入ったときだけ
└─ span: phonelab.sign           {kms_key_version, digest_prefix}
```

ClassAgent は学級単位で別トレース `phonelab.class_brief {class_code, trigger}`。中に ADK 自動の `invoke_agent (class_observer)` → `call_llm` → `execute_tool (get_class_snapshot | get_student_trace | propose_action)` が並び、`before_tool_callback` の却下は `phonelab.tool_policy {tool, allowed: false, reason}` として残る。

教員画面の「S-29 のトレース」は、Firestore の `events` を時刻順に **日本語テンプレート** で並べたもの（本文はここにある）。Cloud Trace の UI へのリンクも置き、審査員が Google Cloud 側で同じ構造を見られるようにする。

Cloud Logging には span と同じ属性を構造化ログで出す（`jsonPayload.record_id`）。ログベースの指標で教員画面の 4 つの数字を出す:

| 数字 | 定義 |
|---|---|
| 人が接続 | 直近 10 分に `predict` か `measure` を送った student_no の数 |
| 保留中 | `status == held` の記録数 |
| 危険実験の提示 | `plan` の experiment が `safety` 違反だった件数（設計上 0。0 であることを示す） |
| 答えの漏えい | `leak_check.answer_leak == true` の件数 |

## 6. Firestore の構成

```
classes/{class_code}                    ← policy.md 5 章の学級ポリシー（halted を含む）
classes/{class_code}/students/{no}      ← { last_seen_at, current }  current = 記録の要約（9/17 実装。routes_class.RecordSummary。生データ無し）
classes/{class_code}/students/{no}/records/{record_id}
classes/{class_code}/proposals/{id}     ← ClassAgent の提案（policy.md 5.1）。教師が承認して初めて classes/{code} に反映
classes/{class_code}/briefs/{id}        ← ClassAgent の要約文と trigger、trace_id
catalog/experiments                     ← experiments.json をそのまま（Planner 用）
catalog/answers                         ← サーバのみ読める（Cloud Run のサービスアカウントだけ）
```

- 認証: 学級コード＋番号。PWA も教員画面も Cloud Run の API 経由でだけ Firestore に触る。クライアント SDK は使わず、Firestore ルールは「全部拒否」。停止フラグはポーリングで届ける（→ architecture.md 4.3）
- 端末側: 生データは IndexedDB に直近 10 実験ぶん（`{record_id, condition, raw: Float32Array[], raw_hash}`）。サーバには行かない。「端末で再検証」がこれを読む
- 教員画面: 学級コード＋教師 PIN（学級作成時に発行、Secret ではなく Firestore にハッシュで）。審査員には両方を「動作確認の方法」に書く
- サンプルデータ: `DEMO-2026` に S-01〜S-06、`held` / `stopped` / `signed` / Policy 却下ありを各 1 件以上（→ flow.md E1）

## 7. 個人情報

持たないもの: 氏名、メール、位置情報、生データ、端末識別子。持つもの: 学級コード、番号、予想の自由記述、特徴量。自由記述は署名対象から外し、教員画面では番号と一緒に表示（生徒間には見せない）。
