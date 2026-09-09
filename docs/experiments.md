# 実験カタログ（experiments）

> Planner（Gemini）が「予想を区別できる最小の実験」を選ぶときの唯一の候補集合。
> **Planner に渡すのはこのカタログだけ**で、「現実（答え）」は渡さない（→ `answer_key` は別ファイル、[policy.md](policy.md) の漏えい検知だけが読む）。
> 実装では `catalog/experiments.json` と `catalog/answers.json` に分けて置く。

## 1. 設計原則

| 原則 | 内容 |
|---|---|
| 予想を区別する | 実験は「予想 A と予想 B で測定結果が違う」ように定義する。区別できない実験は候補にしない |
| 一つだけ変える | `changes` は 1 変数、`holds` はそれ以外。生徒に「変えるもの / 一定にするもの」として見せる |
| 二本目の時計 | 各実験は独立した 2 系統の推定量（`clocks`）を持つ。1 系統しか無い実験は「保留が出やすい」と明記 |
| 手で測れない順 | 自由落下 0.45 s、音の高さ、うなり、を優先。振り子は入口 |
| 安全条件はカタログに書く | Policy はカタログの `safety` を検査するだけ。Planner の判断に安全を任せない |
| スマホは落とさない | `sensors` にカメラを使う実験でも、スマホは机の上に置く |

## 2. スキーマ

```jsonc
{
  "id": "pendulum_mass",                 // 一意。snake_case
  "family": "pendulum",                  // 同じ器具を使う実験のまとまり
  "title": "同じ長さの糸で、重さだけ2倍にする",
  "enabled_by": "default",               // "default" | "teacher"
  "variable": "mass",                    // 変えるもの（1 つ）
  "changes": "重さ（消しゴム 1 個から 2 個へ）",
  "holds": ["糸の長さ", "振れ幅"],
  "conditions": [                        // 測る条件。順に測る
    { "key": "A", "label": "重さ 1倍" },
    { "key": "B", "label": "重さ 2倍" }
  ],
  "distinguishes": {                     // この実験が区別できる予想の向き
    "variable": "mass",
    "directions": ["faster", "same", "slower"]
  },
  "sensors": ["accelerometer", "gyroscope"],   // 必要な最小集合。Policy が ⊆ を検査
  "seconds": 20,                          // 1 条件あたりの測定秒数。Policy が学級上限 ≤ を検査
  "materials": ["糸（1 m 以下）", "袋", "消しゴム 2 個"],
  "safety": {
    "max_height_m": 1.0,
    "phone_in_hand": false,               // スマホを落とす・投げる実験は存在しない
    "near_water": false,
    "near_traffic": false,
    "note": "糸は 1 m 以下、机の上で。スマホはケースに入れて袋に"
  },
  "measure": {                            // 端末内計算のプロファイル（→ verifier.md）
    "quantity": "period_s",
    "profile": "pendulum_period",
    "tolerance_s": 0.05
  },
  "clocks": ["accel_norm_x2", "gyro_signed_axis"],   // 二本目の時計（→ verifier.md 3 章）
  "procedure": [
    "糸の端にスマホを入れた袋を結び、机の端から垂らす",
    "消しゴム 1 個を袋に入れる",
    "小さく（20° 以内）振って、承認ボタンを押す",
    "20 秒待つ。終わったら消しゴムを 2 個にして同じ振れ幅でもう一度"
  ],
  "next_predictions": ["pendulum_length", "pendulum_amplitude"]   // 画面 3 の「次の予測」候補
}
```

`answers.json`（Planner には渡さない）:

```jsonc
{
  "pendulum_mass": {
    "expected_direction": "same",
    "reality": "加速度とジャイロが同じ周期を返す。重さを変えても周期は変わらない",
    "leak_phrases": ["周期は変わらない", "重さに関係ない", "重さは関係"]   // Planner 出力の漏えい検知に使う
  }
}
```

## 3. 既定の実験（10）

### 3.1 振り子（family: pendulum）— MVP

理論値 `T = 2π√(L/g)`。L = 0.50 m → T = 1.42 s。L = 1.00 m → 2.01 s。

| id | 変える | 一定 | センサー | 秒 | 区別できる予想 | 二本目の時計 |
|---|---|---|---|---|---|---|
| `pendulum_mass` | 重さ（1 個→2 個） | 長さ、振れ幅 | 加速度・ジャイロ | 20 × 2 | 重いほど速い / 変わらない / 遅い | 加速度ノルム×2 vs ジャイロ符号付き |
| `pendulum_length` | 長さ（50 cm→100 cm） | 重さ、振れ幅 | 加速度・ジャイロ | 20 × 2 | 長いほど速い / 変わらない / 遅い | 同上 |
| `pendulum_amplitude` | 振れ幅（10°→30°） | 長さ、重さ | 加速度・ジャイロ | 20 × 2 | 大きく振ると速い / 変わらない / 遅い | 同上 |

- `pendulum_amplitude` の注意: 30° でも周期の伸びは約 1.7%（1.42 s → 1.44 s）で **許容誤差 0.05 s の内側**。この実験の「測定が言っていること」は「この振れ幅の範囲では変わらなかった」。カタログの `note` に書き、Planner がその文を使う。60° 以上は飽和と糸の絡まりが増えるので `safety.max_amplitude_deg: 45`。
- 振り子でスマホが受ける信号（→ [verifier.md](verifier.md) 3 章）: 加速度の大きさ |a| は **周期 T/2** で脈動する（最下点通過ごとに最大）。ジャイロの振り軸まわりの角速度は **周期 T** の符号付き正弦波。だから「加速度は ×2、ジャイロはそのまま」で 2 系統が独立に T を出す。

### 3.2 自由落下（family: freefall）— スマホは落とさない

| id | 変える | 一定 | センサー | 秒 | 区別できる予想 | 二本目の時計 |
|---|---|---|---|---|---|---|
| `freefall_mass` | 落とす物（コイン / 消しゴム）を同時に | 高さ 1 m | カメラ・マイク | 10 | 重いほど速く落ちる / 同時 | 着地のコマ vs 着地音 |
| `freefall_height` | 高さ（50 cm / 100 cm） | 物 | カメラ・マイク | 10 × 2 | 2 倍の高さで 2 倍の時間 / √2 倍 / 変わらない | 同上 |

- 1 m の落下時間は 0.45 s。手のストップウォッチでは測れない（反応時間 0.2 s）。
- カメラは `requestVideoFrameCallback` のタイムスタンプで手放しコマと着地コマ、マイクは振幅の立ち上がりで着地音。映像も音も端末から出さない（→ policy.md 3 章、送るのは時刻差だけ）。
- 安全: `max_height_m: 1.2`、クッションの上に落とす、スマホは机に置く。

### 3.3 音（family: sound）

| id | 変える | 一定 | センサー | 秒 | 区別できる予想 | 二本目の時計 |
|---|---|---|---|---|---|---|
| `bottle_water` | 水の量（空 / 半分） | ボトル、吹き方 | マイク | 5 × 2 | 水が多いほど低い / 変わらない / 高い | 基本周波数 vs 第 2 倍音 ÷ 2 |
| `beat_two_tones` | 2 音の周波数差（スピーカーから 440 と 442 / 445 Hz） | 音量 | スピーカー・マイク | 5 × 2 | うなりは速くなる / 変わらない / 遅くなる | 包絡線の周期 vs スペクトルの差 |
| `echo_speed_of_sound` | 壁までの距離（2 m / 4 m） | 音源 | スピーカー・マイク | 5 × 2 | 遠いほど遅れる（比例） / 変わらない | 往復時間 vs 距離から逆算の一致 |

- `bottle_water` の「二本目の時計」は倍音構造。基本周波数 f0 と第 2 倍音 f2 で f2/2 ≒ f0 なら信頼、ずれたら保留（口笛や雑音を拾った）。
- 基本周波数は Web Audio の `AnalyserNode` 時間領域データを自己相関。許容誤差は 3%（半音の半分）。

### 3.4 運動（family: motion）

| id | 変える | 一定 | センサー | 秒 | 区別できる予想 | 二本目の時計 |
|---|---|---|---|---|---|---|
| `coin_slip_angle` | 面の材質（机 / 下敷き） | コイン | 加速度（傾き） | 10 × 2 | ざらざらほど早く滑る / 変わらない / 遅い | 傾き角（加速度） vs ジャイロ積分 |
| `jump_airtime` | ジャンプの高さ（軽く / 高く） | 着地の仕方 | 加速度（ポケットで） | 10 × 2 | 高いほど長い / 変わらない | 無重力区間の長さ vs 着地衝撃の間隔 |

- `jump_airtime` はスマホをポケットに入れる。手に持たない（`phone_in_hand: false` は「手に持って動かす」を禁じる）。ジャンプ自体の安全条件: 室内、靴、周囲 1 m。**学級許可で教師が切れる**（`teacher_can_disable: true`）。

## 4. 教師が有効化する拡張（3）

| id | 内容 | センサー | なぜ既定でないか |
|---|---|---|---|
| `elevator_accel` | エレベーターの加減速で見かけの重さ | 加速度 | 教室の外に出る。教師の引率が要る |
| `spin_decay` | 回転椅子の減衰 | ジャイロ | 転倒リスク。教師の目の前で |
| `camera_pulse` | カメラで脈拍（指をレンズに） | カメラ | 生体情報。端末内処理のみ、値も送らないが、学級判断に委ねる |

## 5. Planner に渡す形

Planner の入力は `experiments.json` から次のフィールドだけを抜いた **候補リスト**（学級許可とセンサー検出でフィルタ済み）:

```
id, title, variable, changes, holds, conditions, distinguishes, sensors, seconds, materials, safety.note, procedure, note
```

渡さないもの: `answers.json` 全部、`clocks`、`measure.tolerance_s`（判定は Verifier がやる。Planner が数値で答えを匂わせないため）。

Planner の出力は [policy.md](policy.md) 2 章の `plan` スキーマ。**Planner はカタログ外の実験を作れない**（`experiment_id` は候補リストの id に限る。外れたら Policy が却下し「カタログ外の要望は実験にしない。最も近い候補を」と再提案させる）。

## 6. 端末能力とカタログの絞り込み

| 端末 | 使えるセンサー | 残る実験 |
|---|---|---|
| iPhone / Android（加速度あり） | 全部 | 全部 |
| iPad | 全部 | 全部（大きいので振り子は袋が要る） |
| ChromeOS（GIGA の 6 割、加速度なし） | マイク・カメラ・スピーカー | `freefall_*`, `bottle_water`, `beat_two_tones`, `echo_speed_of_sound` |
| 学級許可でマイク不可 | 加速度・ジャイロ | `pendulum_*`, `coin_slip_angle`, `jump_airtime` |

端末側は起動時に `DeviceMotionEvent` の有無と `navigator.mediaDevices` を検出し、`capabilities` としてサーバへ送る。Planner の候補リストはこれと学級許可の積集合。

## 7. MVP の順番

1. `pendulum_mass`（デモ動画の主役。6 画面すべてこれで撮る）
2. `pendulum_length`（画面 3 の「次の予測」の飛び先）
3. `pendulum_amplitude`
4. `freefall_mass`（ChromeOS の逃げ道。時間があれば）
5. `bottle_water`（マイクの疎通確認を兼ねる。時間があれば）

残りはカタログに **定義だけ置き、`enabled_by: "later"`** にして Planner の候補から外す。README に「カタログは JSON で拡張できる」と書ける状態にしておく（審査軸③）。
