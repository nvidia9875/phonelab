# 05. 特典（クーポン・スポンサー提供技術）

## 🎁 Google Cloud クーポン（300ドル分）

エントリーした人へ、**300ドル分の Google Cloud クーポン**がメールで送られる。**数に限りあり**。

### 有効化手順
1. Google Cloud Console にログオンする
2. http://cloud.google.com/redeem にアクセス
3. プロモーションコードの入力
4. コンソールより **[お支払い] - [請求アカウント]** をクリックし、プロモーションコードが有効になっているか確認

### 注意事項（原文）
- **注1**: クーポン金額以上利用で課金されるため、不要なリソースは削除すること。課金に関する問い合わせは受け付けていない。
- **注2**: クーポンコードを利用するには**有料アカウントへのアップグレードが必要**。有料アカウントでも適用したクレジット分は無料で利用できる。
- **注3**: **10月20日までに登録**すること。登録後 **2ヶ月間有効**。
- **注4**: 2026年以降、Google Cloud ハンズオンセミナー等でクーポンコードを申請しすでに適用されている場合は適用できないことがある。
- **注5**: クーポンは Google 配下のサービス（**Google Maps Platform** など）や Google Cloud 一部サービスで利用できない場合がある。日々課金状況を確認すること。主催者・スポンサーとも課金状況の問い合わせには応じられない。

### FAQ 補足
- クーポン利用の際、**クレジットカード情報の入力は必須**。
- 利用期限までにアクティベートしそびれた場合の**再発行は不可**。
- **Google Cloud の費用は自己負担**。学生向けの追加補助も無し（一律300ドルクーポンのみ）。

> 💡 コスト注意: デプロイ環境は**12月1日まで稼働させておく必要がある**ため、$300 を約3.5ヶ月（8月下旬〜12月）で使い切らない設計にする。Cloud Run（min-instances=0）+ Firestore など、アイドル時ゼロ課金の構成が安全。

---

## 🚉 駅すぱあと API MCPサーバー（株式会社ヴァル研究所）

- **特典**: ハッカソン期間中に利用できる**アクセスキーを提供**
- 生成AI（LLM）や AI エージェントから「駅すぱあと」の経路検索などの機能を直接呼び出せる **MCP サーバー**
- ⚠️ 本ハッカソンで提供されるアクセスキーでは **ダイヤ探索は利用不可**
- リンク:
  - サービス紹介（登録不要）: https://api-info.ekispert.com/mcp/
  - 技術ドキュメント: https://github.com/ValLaboratory/ekispert-api-mcp-server-docs
  - 活用事例（過去ハッカソンのユースケース）: https://zenn.dev/ekispert_api/articles/d80ee111d09344
  - 利用開始フォーム: https://forms.gle/btiprAuu2HFzdvwV8

## 💄 YouCam API（パーフェクト株式会社）

- **特典**: **クレジット 1000ユニット**を提供
- 画像・動画生成をはじめ、AI肌解析やバーチャル試着など **50種類以上の最先端AI機能を API として提供**する開発者向けサービス。マルチプラットフォーム対応で Web サイトやアプリへスムーズに組み込める。
- リンク:
  - ドキュメント（登録不要）: https://docs.perfectcorp.com/develop/introduction
  - API プレイグラウンド: https://yce.perfectcorp.com/api-console/ja/api-playground/ai-skin-analysis/
  - 活用事例（Zennfes Spring 2026 受賞作品）: https://zenn.dev/contests/zennfes-spring-2026-perfect?tab=result
  - 利用開始: https://d3anovxlgi5hpq.cloudfront.net/ja/ai-api?affiliate=Zenn_202608_affiliate

> ※ Support スポンサー提供技術の**利用有無は審査に影響しない**。ただしエージェントに「外部世界へ作用する実用的なツール」を持たせる素材としては有用。

---

## 💬 Discord

- 交流・チームビルディング用。アンチハラスメントポリシーを読んだ上で参加する。
- 参加リンク: https://discord.gg/cvA2Z3yny4
- アンチハラスメントポリシー: https://static.zenn.studio/permanent/shared/discord-terms.pdf

## 🛠 coding agent 向けスキル（公式配布）

Claude Code や Codex などの coding agent で使える参加者向けスキルが配布されている。インストールすると coding agent が本ハッカソンのアシスタントになる。

- ルール・スケジュール・提出方法に関する質問への回答
- 開発中のプロジェクトが**レギュレーション（必須プロダクトなど）を満たしているかのチェック**
- **提出前チェックリストの実行**
- プロジェクトのアイデア出し・壁打ち

インストール方法: https://github.com/zenn-dev/hackathon-agent-skills

> 💡 このリポジトリは**インストール推奨**。提出前チェックを自動化できる。
