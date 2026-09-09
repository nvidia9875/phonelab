# 第5回 Agentic AI Hackathon with Google Cloud — コンテキスト

公式ページ: https://zenn.dev/hackathons/google-cloud-japan-ai-hackathon-vol5
（情報取得日: 2026-08-20 / 公式ページ全文を基に整理）

## 一目でわかるサマリ

| 項目 | 内容 |
|---|---|
| テーマ | 「作れる」から「使える」。エージェントの、新しいステージへ。 |
| 期間 | 2026/08/20（エントリー開始） 〜 **2026/10/15 23:59（提出締切）** |
| 賞金総額 | 175万円（最優秀50万×1 / 優秀25万×3 / 特別5万×6 / 奨励4万相当×5） |
| 主催 / 協賛 | Zenn（クラスメソッド） / グーグル・クラウド・ジャパン |
| 参加資格 | 日本国内在住 18歳以上の個人またはチーム |
| 必須① | Google Cloud アプリ実行プロダクトを1つ以上（Cloud Run 等） |
| 必須② | Google Cloud AI 技術を1つ以上（Gemini / ADK 等） |
| 審査軸 | ①課題の新規性と解決策の有効性 ②自律性・エージェントらしさ ③実装品質と拡張性 |
| 提出物 | GitHub公開リポジトリURL / デプロイURL / 説明文 / アーキテクチャ図 / 3分デモ動画(YouTube) / (任意)Zenn記事 |
| 特典 | Google Cloud クーポン $300（**10/20 までに有効化**、数量限定） |
| ファイナリスト発表 | 2026/10/28 |
| 最終ピッチ・表彰式 | 2026/12/1 @ 渋谷ストリーム |

## ⚠️ 見落としやすい重要ポイント

1. **8/20 時点で一定進捗していたプロジェクトは提出不可**。ゼロから作る。
2. **ローカル動作だけでは失格**。Google Cloud へのデプロイが必須。
3. **デプロイ環境と GitHub は 12/1 まで動く状態で維持**（＝約3.5ヶ月分のコストを見込む）。
4. **提出後は一切修正不可**（記事・リポジトリ・動画すべて）。
5. **クーポンは 10/20 までにアクティベート、再発行なし**。クレジットカード登録必須。超過分は自己負担。
6. **認証が必要なアプリはテストアカウント＋サンプルデータが必須**。ソーシャルログイン/メール受信必須の実装は避ける。
7. 第5回の差別化は **可観測性・セキュリティ・エージェント管理（ガバナンス）**。ここを実装＆可視化しないと審査軸②で伸びない。
8. **審査は段階的**で「1次から全提出物を精査するとは限らない」。**説明文冒頭・アーキ図・デモ動画の掴み**が生命線。

## ドキュメント一覧

| ファイル | 内容 |
|---|---|
| [01-overview.md](01-overview.md) | 大会概要、テーマ、趣旨、ミニハッカソン3都市、Build with Gemini Tokyo |
| [02-schedule.md](02-schedule.md) | 公式スケジュール＋逆算した内部マイルストーン案 |
| [03-rules-requirements.md](03-rules-requirements.md) | 参加条件、必須/任意要件、提出物、GitHub規定、審査基準、禁止事項 |
| [04-prizes-judges.md](04-prizes-judges.md) | 賞金内訳、審査員プロフィール |
| [05-benefits-sponsors.md](05-benefits-sponsors.md) | Google Cloudクーポン、駅すぱあとAPI、YouCam API、Discord、公式スキル |
| [06-past-winners.md](06-past-winners.md) | 第1〜4回の受賞プロジェクトと傾向分析 |
| [07-faq.md](07-faq.md) | 公式FAQ全文 |
| [08-links.md](08-links.md) | 全リンク集 |
| [09-submission-checklist.md](09-submission-checklist.md) | フェーズ別の提出チェックリスト |
| [10-idea-analysis.md](10-idea-analysis.md) | **アイデア3案の調査と勝ち筋分析／推奨案** |

## 状況

- ✅ エントリー済み（**個人参加**）
- ✅ アイデア調査完了 → [10-idea-analysis.md](10-idea-analysis.md)
- ⏳ 公式 coding agent スキル（https://github.com/zenn-dev/hackathon-agent-skills）は **2026-08-20 時点で 404・未公開**。
      暫定として `.claude/skills/hackathon-check/` にローカル版を作成済み（公式公開後に差し替える）
- [ ] Google Cloud プロジェクト作成＋クーポン有効化（**10/20 まで、再発行なし**）
- [ ] アイデア確定 → W1 のデータ検証 Go/No-Go
