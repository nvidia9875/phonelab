# デモ動画（3 分）のサンプル

台本は [`docs/storyboard.md`](../docs/storyboard.md)。Remotion（React で動画を作る）で組んだサンプル。画面のスクショの上に、文字を打つ・問い返しがぽんと出る・枠で囲む・タップの波紋・3, 2, 1 と波形・数字の数え上げ・判子・統制の流れを文が通っていく、などの動きを重ねている。**実写と、まだ撮っていない画面録画の場面には、右上に「実写／画面録画に差し替え」の札**がある（いまは代わりのアニメーション）。

## 動かす

```bash
cd video
npm ci
npm run studio      # ブラウザで見ながら直す（http://localhost:3000）
npm run render      # out/phonelab-demo-sample.mp4（1920×1080、30fps）
```

Chrome のダウンロードが通らないときは、`--browser-executable` に手元の Chrome を渡す。

## 差し替える場面（撮るもの）

| 時刻（目安） | 場面（`src/scenes/`） | 撮るもの |
|---|---|---|
| 0:00 | つかみ `Opening` | 机の上の輪ゴムと箱、横にスマホ。指で輪ゴムをはじく（音も入れる）8 秒 |
| 0:36 | 許可と測定 `Permit` の後半 | 「3, 2, 1」のあと、輪ゴムを弱く・強くはじく手元 5 秒 |
| 1:07 | 保留 `Hold` | 隣の班が騒がしい 5 秒（音楽で代用可）＋ 保留の画面録画 10 秒 |
| 2:06 | 家で `Home` | 家。スマホを袋に入れて振り子（下にクッション）15 秒 |
| 2:42 | 記録 `Trace` | 実際の Cloud Trace の画面録画 6 秒 |

スクショの場面（予想・計画・結果・ふり返り・却下・教員画面・停止）も、本物の画面録画があれば差し替えたほうがよい（スクショは手元で、マイクに合成の音を流して撮ったもの）。

## 差し替え方

1. 撮った動画を `public/` に置く（例 `public/pluck.mp4`）
2. 該当する場面（`src/scenes/*.tsx`）の中身を、動画に置き換える（字幕の `Caption` は残す）

```tsx
import { OffthreadVideo, staticFile } from "remotion";

<OffthreadVideo src={staticFile("pluck.mp4")} style={{ position: "absolute", inset: 0, width: 1920, height: 1080, objectFit: "cover" }} />
```

- 長さは `src/Demo.tsx` のシーンの `sec` に合わせる。動画の途中から使うなら `startFrom`（フレーム）を付ける
- 音を消すなら `muted`、小さくするなら `volume={0.4}`
- 字幕（`Caption`）は動画の上に重なる。右上の `SwapTag` は消す
