# Verifier 仕様（機械の検査。Agent は見ていない）

> 端末が送ってきた **特徴量だけ** を、決定論で検査して「通す / 保留」を決め、通ったものだけ判定へ回す。
> LLM はここに関与しない。画面 2 の「機械の検査（Agent は見ていない）」、画面 4「保留」がこれ。

## 1. 端末内の計算（送る前に済ませる）

生データ（加速度・角速度の時系列、音声、映像）は端末に留める。端末が計算して送るのは次の **特徴量** だけ（→ record-schema.md 4 章）。

### 1.1 サンプリングの記録

`devicemotion` イベントごとに `performance.now()` を記録する。

| 特徴量 | 定義 |
|---|---|
| `n_samples` | 取得したサンプル数 |
| `duration_s` | 最初と最後の時刻差 |
| `rate_hz` | `(n_samples − 1) / duration_s` |
| `interval_median_ms` | 隣接時刻差の中央値 |
| `max_gap_ms` | 隣接時刻差の最大 |
| `gaps` | 隣接時刻差が `3 × interval_median_ms` を超えた箇所の `[開始秒, 長さ ms]` のリスト（最大 10 件） |
| `gap_total_ms` | gaps の長さの合計 |

### 1.2 振り子の周期（profile: `pendulum_period`）

物理: 糸の先で振れる端末では、

- **加速度の大きさ** `|a| = √(ax²+ay²+az²)` は最下点通過ごとに最大になるので **周期 T/2** で脈動する（向きに依存しない）
- **角速度** は振り軸まわりの成分が **周期 T** の符号付き正弦波。端末の向きは袋の中で不明だが固定なので、**分散が最大の軸**を振り軸とみなす

だから 2 系統は方法が違う独立した時計になる。

| clock | 入力 | 手順 | 出力 |
|---|---|---|---|
| `accel_norm_x2` | `accelerationIncludingGravity` の 3 軸 | ノルム → 平均を引く → 自己相関 → 最初のピークのラグ τ → **T = 2τ** | `T_accel_s` |
| `gyro_signed_axis` | `rotationRate` の 3 軸 | 分散最大の軸を選ぶ → 平均を引く → 自己相関 → 最初のピークのラグ τ → **T = τ** | `T_gyro_s` |

自己相関の詳細:

1. 先頭 1 秒を捨てる（承認タップの揺れ）
2. 線形トレンドを除去
3. 正規化自己相関 `r(k)` を `k = 0.2 s 〜 4 s` の範囲で計算（振り子の T は糸 ≤ 1 m で 2.0 s 以下。0.2 s 未満は手ぶれ）
4. `r(k)` の最初の極大（`r > 0.3`）を探す
5. 極大の両隣で放物線補間して τ を小数点以下 ms まで
6. 60 Hz なら格子は 16.7 ms、補間後は数 ms。許容誤差 0.05 s に足りる

`T_accel_s` の 2 倍で T を出すので、加速度側の分解能は 2 倍粗い。これは「二本目の時計」の一致条件（0.05 s）に織り込み済み。

### 1.2b 振り子の最下点の速さ（profile: `pendulum_speed`、中 3 力学的エネルギー）

物理: 糸の長さ L（カタログの `measure.length_m`）の振り子を、高さ h から押さずに放す。最下点の速さは v = √(2gh)。端末には次の 2 つが独立に現れる。

- **ジャイロ**: 振り軸まわりの角速度は最下点で最大 ω_max になる → **v = ω_max × L**
- **加速度**: 最下点では |a| = g + v²/L（重力に向心加速度が足される） → **v = √((|a|_max − g) × L)**

| clock | 入力 | 手順 | 出力 |
|---|---|---|---|
| `gyro_omega_x_length` | `rotationRate` の 3 軸 | 分散最大の軸を選ぶ → 先頭 1 秒を捨てる → 角速度の大きさが初めて 30 °/s を超えた時刻を放した時刻とする → そこから 3 周期ぶん（T = 2π√(L/g) で見積もる）の角速度の大きさの最大 → rad/s に直して × L | `v_gyro_ms` |
| `accel_centripetal` | `accelerationIncludingGravity` の 3 軸 | 同じ区間のノルムの最大 → g = 9.81 を引く → × L → 平方根 | `v_accel_ms` |

- 3 周期のあいだの減衰は小さいので、区間の最大を最下点の値とみなす
- 端末は袋の中にあり質点ではないので v は近似。判定は同じ L で測った条件 A と B の比較なので、向きの判定には効かない
- 理論値（L = 0.80 m）: h = 10 cm → v = 1.40 m/s（ω = 100 °/s、|a| = 12.3 m/s²）、h = 20 cm → 1.98 m/s（142 °/s、14.7 m/s²）

特徴量: 1.1 のサンプリング一式、`release_at_s`、`length_m`、`omega_peak_dps`、`accel_norm_peak_ms2`、`v_gyro_ms`、`v_accel_ms`、`gyro_axis`、`saturation_runs`。

### 1.3 安定性と振幅

| 特徴量 | 定義 | 用途 |
|---|---|---|
| `T_accel_first_half_s`, `T_accel_second_half_s` | 前半 / 後半で別々に推定 | 減衰・途中で触った |
| `T_gyro_first_half_s`, `T_gyro_second_half_s` | 同上 | 同上 |
| `accel_norm_peak_ms2` | ノルムの最大 | 飽和・振りすぎ |
| `accel_norm_std_ms2` | ノルムの標準偏差 | 振れていない |
| `gyro_peak_dps` | 選んだ軸の最大角速度 | 飽和・振りすぎ |
| `gyro_std_dps` | 同 標準偏差 | 振れていない |
| `saturation_runs` | ノルムまたは角速度が同一値で 5 サンプル以上続いた回数 | 飽和（クリップ） |
| `autocorr_peak` | 採用した極大の `r` 値（両 clock） | 信号の質 |

### 1.4 音の基本周波数（profile: `pitch`、中 1 音の高さ）

マイクは `echoCancellation` / `noiseSuppression` / `autoGainControl` を切って開く（Safari は後の 2 つを切れる保証がない → curriculum-coverage.md 2.2）。`AnalyserNode`（`fftSize` 4096）を 100 ms ごとに読み、1 回分を 1 フレームとする。**承認のあと最初の 0.5 秒は音を出さない**（雑音の大きさを測る）。

| clock | 手順 | 出力 |
|---|---|---|
| `f0_autocorr` | 音のあるフレーム（RMS が雑音より 10 dB 以上大きい）ごとに、時間領域データを自己相関 → 80〜2000 Hz の範囲の最初のピーク → f0。フレームの中央値 | `f0_hz` |
| `harmonic_2_half` | 同じフレームの FFT（`getFloatFrequencyData`）で f0 の 1.8〜2.2 倍の範囲のピーク → ÷2。フレームの中央値 | `f0_from_h2_hz` |

特徴量: `f0_hz`, `f0_from_h2_hz`, `rms_db`（音の大きさ。判定には使わず、画面 3 に大きさの変化を添える）, `noise_db`, `snr_db`, `clipping_ratio`, `voiced_frames`, `duration_s`。時間領域データは端末から出さない。

### 1.5 自由落下（profile: `freefall_time`）

| clock | 手順 | 出力 |
|---|---|---|
| `camera_frames` | `requestVideoFrameCallback` で各フレームの `mediaTime`。手放し（差分画像が閾値超）と着地（動きが止まる）のフレーム時刻差 | `t_fall_video_s` |
| `mic_impact` | 着地音の立ち上がり時刻 − 手放し時刻（手放しはビデオ側） | `t_fall_audio_s` |

特徴量: `t_fall_video_s`, `t_fall_audio_s`, `fps_eff`, `frame_drops`, `impact_snr_db`。映像・音声は端末から出ない。

### 1.6 ハッシュ（生データのコミット）

生データは送らないが、`sha256(Float32Array の連結バイト列)` を `raw_hash` として送る。生データは IndexedDB に直近 10 実験ぶん残し、画面 6 の「端末で再検証」が同じ関数で特徴量を再計算して、記録の値と `raw_hash` に一致するかを端末上で示す。**サーバは生データを一切見ない。** 署名は「特徴量が正直に計算された」ことまでは保証しない（→ architecture.md 4.4）。

## 2. サーバ側の検査ルール

入力: 特徴量 JSON、実験の `measure.profile` と `tolerance_s`、学級の `max_seconds`。出力: `pass` か `hold`（保留）と理由。

### 2.1 共通

| コード | 条件 | 保留の理由文（画面 4） |
|---|---|---|
| `too_short` | `duration_s < 0.8 × plan.seconds` | 測定が途中で止まりました |
| `too_long` | `duration_s > plan.seconds + 2` | 許可より長く読み取っていました（端末側のバグとして扱い、記録に残す） |
| `low_rate` | `rate_hz < 30` | この端末のサンプリングが遅く、周期を決められません |
| `gap` | いずれかの gap が **≥ 250 ms**、または `gap_total_ms ≥ 500` | 0.5 秒の欠測。画面を切り替えたか、通知が出た可能性 |
| `no_signal` | `accel_norm_std_ms2 < 0.3` かつ `gyro_std_dps < 5` | センサー未使用（振れていない） |
| `saturation` | `saturation_runs ≥ 1` または `accel_norm_peak_ms2 > 39`（4 g）または `gyro_peak_dps > 1500` | 飽和。振りが強すぎる |
| `weak_autocorr` | いずれかの clock の `autocorr_peak < 0.3` | 周期がはっきりしません |

### 2.2 振り子（`pendulum_period`）

| コード | 条件 | 理由文 |
|---|---|---|
| `out_of_range` | T が 0.3〜3.0 s の外 | 振り子の周期として考えにくい値です |
| `two_clocks_disagree` | `|T_accel_s − T_gyro_s| > tolerance_s`（0.05） | 二つのセンサーの周期が一致しません（差 x.xx s、許容 0.05 s） |
| `unstable` | `|T_first_half − T_second_half| > tolerance_s`（どちらかの clock） | 前半と後半で周期が変わりました。途中で触ったか、減衰が大きい |

通過したときの採用値: `T_s = (T_accel_s + T_gyro_s) / 2`、`T_unc_s = max(|T_accel_s − T_gyro_s|, 0.01)`。

### 2.2b 振り子の速さ（`pendulum_speed`）

| コード | 条件 | 理由文 |
|---|---|---|
| `no_release` | 角速度の大きさが一度も 30 °/s を超えない | 振り子が動き出していません |
| `out_of_range` | v が 0.2〜4.0 m/s の外 | 振り子の速さとして考えにくい値です |
| `two_clocks_disagree` | `abs(v_gyro_ms − v_accel_ms) > tolerance`（0.15 m/s。B7 の実機計測で決め直す） | 二つのセンサーの速さが一致しません |

通過したときの採用値: `v_ms = (v_gyro_ms + v_accel_ms) / 2`、`v_unc_ms = max(abs(v_gyro_ms − v_accel_ms), 0.02)`。共通の `low_rate` / `gap` / `saturation` はそのまま使う。

`repeats` が 2 以上の実験（振り子は 3）は、**検査を通った直近 `repeats` 回の平均**を条件の採用値にする。不確かさは「二本の時計の差の平均」と「回どうしのばらつき（最大 − 最小）÷ 2」の大きいほうを使う。測り直したときは、古い回を混ぜない（新しいほうから `repeats` 回だけ取る）。

### 2.3 音（`pitch`）

| コード | 条件 |
|---|---|
| `two_clocks_disagree` | `|f0_hz − f0_from_h2_hz| / f0_hz > 0.03` |
| `low_snr` | `snr_db < 10` |
| `clipping` | `clipping_ratio > 0.01` |
| `out_of_range` | f0 が 80〜2000 Hz の外 |
| `low_voiced` | `voiced_frames < 5`（音が短すぎて高さを決められない） |

### 2.4 自由落下（`freefall_time`）

| コード | 条件 |
|---|---|
| `two_clocks_disagree` | `|t_fall_video_s − t_fall_audio_s| > 0.05` |
| `low_fps` | `fps_eff < 24` |
| `frame_drops` | `frame_drops > 2` |
| `out_of_range` | t が 0.2〜0.8 s の外（高さ 0.2〜1.2 m） |

## 3. 判定（judge）— Verifier を通った条件が揃ったら

入力: 条件 A と B の採用値と不確かさ、`interpreted_claim.direction`、`tolerance_s`。

```
Δ = value_B − value_A
u = max(tolerance, unc_A + unc_B)            # 音は相対値: tolerance = 0.03 × value_A

sign = −1 if quantity == "period_s" else +1  # 周期は短いほど速い。速さ m/s と振動数 Hz は大きいほど速い / 高い
if |Δ| ≤ u:           observed = "same"
elif sign × Δ > 0:    observed = "faster"      # 音では「高くなった」と表示
else:                 observed = "slower"
```

| 予想 vs 観測 | 画面 3 の文（言葉のルール: 「正解」「間違い」と言わない） |
|---|---|
| 一致 | 「あなたの予想『重いほど速い』は、この測定では成り立った。差 0.31 s は許容誤差 0.05 s の外側」 |
| 不一致 | 「あなたの予想『重いほど速い』は、この測定では成り立たなかった。差 0.01 s は許容誤差 0.05 s の内側」 |
| 予想が `unknown` | 判定しない。「測定が言っていること」だけ出し、予想の言い直しを求める |

判定文は **テンプレートで生成**（LLM を使わない）。Planner が関わるのは判定後の「なぜそうなったと思う？」の問い返しと「次の予測」の候補提示だけ。

## 4. 保留のあとの流れ

| 状況 | 提案（画面 4 の「Agent の提案」は Planner ではなく Verifier のテンプレート） |
|---|---|
| `gap` | 「画面を開いたまま、同じ条件でもう一度 20 秒」 |
| `saturation` | 「振れ幅を小さく（20° 以内）して、同じ条件でもう一度」 |
| `no_signal` | 「振り子が止まっていました。振ってから承認を」 |
| `no_release` | 「袋の底をものさしで高さに合わせて、押さずに放してから測る」 |
| `low_snr` / `low_voiced` | 「端末に近づけて、はっきり鳴らしてから、もう一度 5 秒」 |
| `two_clocks_disagree` 2 回目 | 「この端末では加速度を使わず、ジャイロ 2 回の一致で判定に切り替えます」（clock を `gyro_signed_axis` × 2 回に変更。記録に残す） |
| `remeasure_per_condition` 上限 | 「この端末ではこの実験は保留のまま。別の実験へ」 |

「保留は失敗ではありません。データを信じない、という判断です。」を常に画面の最下部に出す。

## 5. 機種差の扱い

スパイク B7 で 3 機種の `rate_hz`、軸の向き、`accelerationIncludingGravity` の単位（iOS Safari と Android Chrome で m/s² だが符号が逆の実装がある）を記録する。

- 単位・符号の差はノルムと分散最大軸の採用で吸収する（設計上、向きに依存しない）
- レートの差は `low_rate` と `gap` の閾値で吸収する
- **機種差は隠さず、保留の理由として見せる**。教員画面の「検査」列に理由コードが出る

## 6. テスト（先に書く）

| 入力 | 期待 |
|---|---|
| 合成正弦波（T = 1.42 s、60 Hz、20 s） | `T_accel_s` ≈ 1.42（ノルムは 0.71 s の脈動 → ×2）、`T_gyro_s` ≈ 1.42、`pass` |
| 同上で 8 秒目に 500 ms の欠落 | `hold: gap` |
| 振幅 6 g のクリップ | `hold: saturation` |
| 加速度 1.42 s、ジャイロ 1.50 s | `hold: two_clocks_disagree` |
| A = 1.42 ± 0.01、B = 1.43 ± 0.01、claim faster | observed `same`、不一致文 |
| A = 1.42、B = 2.01（長さ 2 倍）、claim slower | observed `slower`、一致文 |
| 前半 1.42、後半 1.55 | `hold: unstable` |
| 合成の振り子（L = 0.80 m、h = 10 cm、60 Hz、10 秒） | `v_gyro_ms` ≈ `v_accel_ms` ≈ 1.40、`pass` |
| 同上で角速度が 30 °/s を超えない | `hold: no_release` |
| 速さ A = 1.40、B = 1.98、claim faster | observed `faster`、一致文 |
| 合成音（f0 = 220 Hz ＋ 第 2 倍音、SNR 30 dB） | `f0_hz` ≈ `f0_from_h2_hz` ≈ 220、`pass` |
| 音 A = 220 Hz、B = 224 Hz（1.8%）、claim faster | observed `same`（相対 3% の内側） |
