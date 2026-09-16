# docs — PhoneLab 設計ドキュメント（B0）

コードを書く前に固めた仕様。実装リポジトリではこれを `docs/` にコピーし、`catalog/*.json` と Policy / Verifier のテストの元にする。

| ファイル | 内容 | 実装で対応するもの |
|---|---|---|
| [idea-sheet.md](idea-sheet.md) | 公式テンプレのアイデアシート。ダッシュボードの説明文の下書き | README 冒頭、提出フォーム |
| [personas.md](personas.md) | ペルソナ（ゆい・佐藤先生・母）、使う場面（50 分のどこを引き受けるか、班で順番、家の続き）、ロイロ・Classroom・MetaMoJi との差別化表、事実の出典（9/16） | 教員画面、学級（Firestore）、記事の課題とユーザー |
| [ux-flow.md](ux-flow.md) | 画面の一覧と URL、テーマ／実験／条件の 3 層、状態遷移、レビューの記録、中学と高校の入口、ラボ先生、授業の 50 分 | `web/src/screens/*`, `web/src/flow/*` |
| [experiments.md](experiments.md) | 実験カタログ（既定 10 ＋ 拡張 3）、スキーマ、Planner に渡す形、端末能力での絞り込み | `catalog/experiments.json`, `catalog/answers.json` |
| [policy.md](policy.md) | Policy の検査ルール（停止・禁止動作・最小集合・注入・漏えい・上限・予想ゲート）、却下の出力、学級ポリシー、テスト | `policy.py` + テスト |
| [verifier.md](verifier.md) | 端末内計算（自己相関、二本目の時計）、サーバ側の検査ルール、判定、保留後の流れ、テスト | `pwa/measure/*.ts`, `verifier.py` + テスト |
| [record-schema.md](record-schema.md) | 実験記録のイベント、署名（JCS + Cloud KMS）、送信スキーマ、Cloud Trace のスパン、Firestore 構成 | `models.py`, `sign.py`, `trace.py` |
| [architecture.md](architecture.md) | ADK の構造（Runner / PolicyPlugin / StudentAgent / ClassAgent）、信頼境界、Model Armor のリージョン判断、停止の配送、署名の保証範囲、Cloud Run 構成、費用、確認した一次情報 | `agents/*.py`, `plugins/policy_plugin.py`, `main.py` |
| [curriculum-coverage.md](curriculum-coverage.md) | 学習指導要領と教科書の観察・実験（中学 82 件・高校 82 件）を端末で扱えるかで判定、端末のティア（T0〜T3）、中学と高校の入口の分け方、中学を先にするときの MVP | `catalog/*.json` の `school` / `grade` / `curriculum_ref` / `min_tier` |

読む順: idea-sheet → personas → curriculum-coverage → ux-flow → architecture → experiments → policy → verifier → record-schema。

全体の TODO と依存関係は [../flow.md](../flow.md)。
