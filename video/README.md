# デモ動画（3 分）のサンプル

台本は [`docs/storyboard.md`](../docs/storyboard.md)。Remotion（React で動画を作る）で組んだサンプルで、画面のスクショ・図・字幕は入っている。**実写と、まだ撮っていない画面録画は「ここに実写（○秒）」の枠**になっているので、撮ったものに差し替える。

## 動かす

```bash
cd video
npm ci
npm run studio      # ブラウザで見ながら直す（http://localhost:3000）
npm run render      # out/phonelab-demo-sample.mp4（1920×1080、30fps）
```

Chrome のダウンロードが通らないときは、`--browser-executable` に手元の Chrome を渡す。

## 差し替える枠（撮るもの）

| 時刻（目安） | 枠 | 撮るもの |
|---|---|---|
| 0:00 | 実写 8 秒 | 机の上の輪ゴムと箱、横にスマホ。指で輪ゴムをはじく（音も入れる） |
| 0:36 | 実写 5 秒 | 「3, 2, 1」のあと、輪ゴムを弱く・強くはじく手元 |
| 1:07 | 実写 5 秒 | 隣の班が騒がしい（音楽を流して代用） |
| 1:07 | 画面録画 10 秒 | 保留「音が小さく、まわりの雑音と区別できない」→ ラボ先生の測り直しの提案 |
| 2:06 | 実写 15 秒 | 家。スマホを袋に入れて振り子（下にクッション）→ 結果の画面 |
| 2:42 | 画面録画 6 秒 | Cloud Trace：`phonelab.plan → invoke_agent → phonelab.policy → phonelab.self_correct` |

スクショの場面（予想・計画・結果・会話・却下・教員画面・停止）も、本物の画面録画があれば差し替えたほうがよい（スクショは手元で、マイクに合成の音を流して撮ったもの）。

## 差し替え方

1. 撮った動画を `public/` に置く（例 `public/pluck.mp4`）
2. `src/Demo.tsx` の該当する `<Slot ... />` を、次に置き換える

```tsx
import { OffthreadVideo, staticFile } from "remotion";

<OffthreadVideo src={staticFile("pluck.mp4")} style={{ position: "absolute", left: 80, top: 110, width: 1760, height: 740, objectFit: "cover", borderRadius: 26 }} />
```

- 長さはシーンの `sec` に合わせる。動画の途中から使うなら `startFrom`（フレーム）を付ける
- 音を消すなら `muted`、小さくするなら `volume={0.4}`
- 字幕（`Caption` / `Side`）はそのまま上に重なる
