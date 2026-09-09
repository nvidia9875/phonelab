# 06. 過去の受賞プロジェクト

公式ページ掲載分。開発のイメージづくり用。

## 第4回

| プロジェクト | 賞 | 概要 | 主な技術 | 記事 |
|---|---|---|---|---|
| **Anatom-AI** | 最優秀賞 | 自然言語で操作する3D人体解剖図。「操作の煩雑さ」が学習の本質を妨げていた解剖学に着目。話しかけるだけで動く3D解剖ビューアーで、学ぶ人の認知的負荷を下げる医学学習エージェント | Google Gemini／3D医療ビューアー | https://zenn.dev/jcs300/articles/5511ded660f522 |
| **Bananacraft** | 優秀賞 | 言葉から街をつくる Minecraft 建築エージェント。ユーザーの説明をもとに AI が自律的に都市を設計し Minecraft 上に建築。2D画像と自然言語から構造的に破綻のない3D建築を生成 | Gemini 3 Pro／Nano Banana Pro／Mineflayer／Compute Engine | https://zenn.dev/nakaniship/articles/9f6eb4b7f8a44e |
| **KOTOWARI Link** | 優秀賞 | 現実に科学法則を重ねる AR 学習体験。日常の現象に隠れた科学法則に気づく機会の不足を解決。ARで現実世界と法則を重ね「世界の解像度を上げる」学びを届ける | Vertex AI（Agentic Vision／Gemini 3.0 Pro）／Unity・ARCore／Cloud Run | https://zenn.dev/sagara22/articles/81257d3d7f5f61 |
| **BrickQuest** | 優秀賞 | 手元のブロックから組立説明書を自動生成。説明書を失くした・バラバラになった LEGO を再び活かすため、AI が手元のパーツを認識し組み立て手順を自動生成 | Gemini 3 Pro／物理エンジン検証／Next.js・Three.js／Firestore | https://zenn.dev/parklab/articles/33f9058ea00231 |

一覧: https://zenn.dev/hackathons/google-cloud-japan-ai-hackathon-vol4?tab=projects#projects

## 第3回

| プロジェクト | 賞 | 概要 | 記事 |
|---|---|---|---|
| **フクシア** | 最優秀賞 | 社会福祉士の業務を支援するAIエージェント。会話ログから自動でアセスメントを生成し、利用者に適した支援制度を検索・提案。社会福祉士が支援の必要な人により多くの時間と心を注げる社会を目指す | https://zenn.dev/teritama/articles/aa54b4fbed1231 |

一覧: https://zenn.dev/hackathons/google-cloud-japan-ai-hackathon-vol3?tab=projects#projects

## 第2回

| プロジェクト | 賞 | 概要 | 主な技術 | 記事 |
|---|---|---|---|---|
| **FlatJam** | 最優秀賞 | 創造性を育む音楽教育ツール。コード進行などプロと未経験者の知識のギャップを生成AIが埋める作曲支援ツール。実際のアーティスト名や曲名を参照しながらAIに相談でき、音楽未経験者でも作曲の方向づけに迷わない | Flutter | https://zenn.dev/nayus/articles/82e226cac28e53 |

一覧: https://zenn.dev/hackathons/google-cloud-japan-ai-hackathon-vol2?tab=projects#projects

## 第1回

| プロジェクト | 賞 | 概要 | 記事 |
|---|---|---|---|
| **eCoino** | 最優秀賞 | 想定外のズレをすぐに取り戻す、対話型AIシステム | https://zenn.dev/nayus/articles/45d29a213c4213 |

一覧: https://zenn.dev/hackathons/2024-google-cloud-japan-ai-hackathon?tab=projects#projects

---

## 傾向分析（自分用メモ）

- **具体的で切実なドメインの課題**を選んでいる（解剖学の学習、社会福祉士の業務、音楽の作曲、LEGOの説明書）。「汎用アシスタント」系は勝っていない。
- **入出力のモダリティが特徴的**（3D、AR、Minecraft、物理エンジン、音楽）。テキストチャットだけで完結する作品は上位に見当たらない。
- **検証ループを持っている**（BrickQuest の物理エンジン検証、Bananacraft の構造的破綻のない生成）。＝ 生成しっぱなしではなく、**AI の出力を機械的に検証して直す**構造が評価されている。
- 第5回はさらに「可観測性・セキュリティ・エージェント管理」が審査軸に明記されたので、上記に加えて**運用の信頼性**を見せる必要がある。
