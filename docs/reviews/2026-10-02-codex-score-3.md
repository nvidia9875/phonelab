## 1. 観点ごとの採点

**総合 65.4 / 100。前回62.3点から＋3.1点。現時点では、まだ入賞推薦しません。**

保留の状態管理、PINの試行制限、記録URLの所有者確認、評価の比較対象は改善しました。一方、**実行回数の上限と学級の人数検査には、修正後も抜けがあります。** 実装の充実に対して、測定の正確さ・教師の負担軽減・学習上の効果を示す証拠が追いついていません。

対象は `feat/agent-loop` の現状。ファイル変更・本番アクセス・Gemini再実行はしていません。Pythonテストは書き込みを抑止して**144件成功**、TypeScriptの型検査も成功。追加でFakeLlmとメモリ保存による局所確認を実施しました。Webテスト全体は未実行です。動画等の欠品は主に **5**、実機未検証は **3-8** で扱っています。

**軸1：課題の新規性と解決策の有効性**

| 観点 | 前回→今回 | 根拠・前回指摘の解消状況 | 5点に届かない理由 |
|---|---:|---|---|
| 1-1 課題の実在と規模 | **3→3** | 出典はあるが、前回の問題は未解消。助手配置の出典は「小中計2,649校」、時間不足66%は平成24年度。[docs/personas.md:77](/Users/shun/Desktop/phonelab/docs/personas.md:77) | 「約9割の中学に助手がいない」への換算根拠が閉じていない。説明文の実験頻度55%と、台本の48.5%も対象・時点の説明が必要。この数字を冒頭に置くのは弱い。[docs/idea-sheet.md:12](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:12)、[docs/storyboard.md:13](/Users/shun/Desktop/phonelab/docs/storyboard.md:13) |
| 1-2 未解決であること | **3→3** | 測定アプリ、生成AI、LMSとの差は説明できている。[docs/idea-sheet.md:17](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:17) | 最も近い代替は「測定アプリ＋予想ワークシート＋教師の巡視」。それより援助回数・完了時間・考察の質が改善した比較はない。LMSにない機能を並べるだけでは、未解決性の証明として弱い。 |
| 1-3 課題の核心への有効性 | **3→4** | **保留の扱いは大きく解消。** `held`・`too_uncertain`として保存し、NextStepを呼ばず、チャットでも保留扱いにする。[app/web/src/flow/useFlow.ts:332](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:332)、[app/web/src/flow/nextStep.ts:44](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:44)、[app/web/src/agent/chat.ts:48](/Users/shun/Desktop/phonelab/app/web/src/agent/chat.ts:48) | 「先生が一人」に効く介入支援の精度がまだ弱い。教師画面では新しい保留理由が日本語化されず、`too_uncertain`がそのまま出る。学級の人数検査にも後述の穴がある。[app/web/src/screens/dashboard.ts:32](/Users/shun/Desktop/phonelab/app/web/src/screens/dashboard.ts:32) |
| 1-4 実質的価値・導入しやすさ | **3→3** | 学校端末を使い、記録は個人、測定は班で順番という運用は具体的。[docs/personas.md:43](/Users/shun/Desktop/phonelab/docs/personas.md:43) | 新しい学校への学級発行・配布・復元が弱い。実装上の学級作成はデモ初期化が中心で、家庭での記録再開APIも見送り。新任の教師が自力で導入できるところまで届いていない。[app/server/classroom.py:368](/Users/shun/Desktop/phonelab/app/server/classroom.py:368)、[flow.md:415](/Users/shun/Desktop/phonelab/flow.md:415) |
| 1-5 伝わり方 | **4→4** | 規則との比較は25/25対23/25へ訂正。待ち時間も2回目を加算する実装になった。[README.md:72](/Users/shun/Desktop/phonelab/README.md:72)、[app/scripts/eval_agent.py:150](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:150) | 「理由が無ければ実験を出さず問い返す」という説明に対して実測は10/13。保証する機能とモデルへの期待が混ざる。また修正版未デプロイなのに「本番で動く」の表に区別がない。[docs/idea-sheet.md:29](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:29)、[docs/eval.md:15](/Users/shun/Desktop/phonelab/docs/eval.md:15)、[README.md:133](/Users/shun/Desktop/phonelab/README.md:133)、[flow.md:327](/Users/shun/Desktop/phonelab/flow.md:327) |

**軸2：自律性・エージェントらしさ**

| 観点 | 前回→今回 | 根拠・前回指摘の解消状況 | 5点に届かない理由 |
|---|---:|---|---|
| 2-1 状況判断・自律行動 | **4→4** | **チャットで書いた考えを再判断に反映する修正は解消。** 結果画面とチャットの両方を見る。[app/web/src/flow/nextStep.ts:16](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:16)、[app/web/src/flow/nextStep.test.ts:123](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.test.ts:123) | NextStepが受け取るのは考察の内容ではなく、8文字以上書いたかという真偽値。考察の質や誤解の変化を読んで支援を変えてはいない。行動分岐も「不一致かつ未記入ならreflect」という明示規則が中心。[app/server/agent/next_step.py:35](/Users/shun/Desktop/phonelab/app/server/agent/next_step.py:35) |
| 2-2 単純な自動化を超えるか | **4→4** | **弱すぎる比較対象は解消。** 実際の`choosePlan`・`readClaim`を比較に使用し、LLMが勝つ具体例を示した。[app/web/scripts/rule-baseline.ts:19](/Users/shun/Desktop/phonelab/app/web/scripts/rule-baseline.ts:19)、[docs/eval.md:23](/Users/shun/Desktop/phonelab/docs/eval.md:23) | 言語理解へのLLM採用は説得力がある。ただし、25件中2件の改善から、ループ全体にLLMが必要とは言えない。特にNextStepの分岐・残り候補の選択が規則より優れる証拠はない。[docs/eval.md:29](/Users/shun/Desktop/phonelab/docs/eval.md:29)、[docs/eval.md:80](/Users/shun/Desktop/phonelab/docs/eval.md:80) |
| 2-3 ツール・複数エージェント | **3→3** | ClassAgentの読み取り専用2ツール、回数・番号制限は実装済み。[app/server/agent/class_agent.py:75](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:75)、[app/server/agent/policy_plugin.py:225](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:225) | ツールはAPIが事前に作った要約を返す。5役の分担はあるが、教師の介入結果を観察し、生徒支援を変える協調はない。「5エージェント」という数自体は加点材料にならない。[app/server/routes_insight.py:102](/Users/shun/Desktop/phonelab/app/server/routes_insight.py:102) |
| 2-4 人間の関与・上限・停止 | **3→3** | 承認・停止に加え、Firestoreトランザクションで最初の実行枠を確保するようになった。タイムアウト時も予約は残る。[app/server/classroom.py:325](/Users/shun/Desktop/phonelab/app/server/classroom.py:325)、[app/server/main.py:357](/Users/shun/Desktop/phonelab/app/server/main.py:357) | **修正は部分的。上限5に対して9回呼べた。** 自己修正の枠は事前確保せず事後加算。また学級コードがあっても番号を省くと自己申告へ戻る。[app/server/guards.py:119](/Users/shun/Desktop/phonelab/app/server/guards.py:119)、[app/server/guards.py:137](/Users/shun/Desktop/phonelab/app/server/guards.py:137)、[app/server/agent/runner.py:455](/Users/shun/Desktop/phonelab/app/server/agent/runner.py:455) |
| 2-5 可観測性 | **3→3** | 生徒画面の判断の跡、教師の記録、本文収集を切ったTraceはある。[app/web/src/screens/Plan.tsx:47](/Users/shun/Desktop/phonelab/app/web/src/screens/Plan.tsx:47)、[app/server/telemetry.py:21](/Users/shun/Desktop/phonelab/app/server/telemetry.py:21) | 前回指摘は残る。同期するtrace IDはPlannerだけで、構造化特徴量・全検査結果・完全なハッシュも送らない。端末ハッシュは保存時点で省略される。判断の表示はあるが、一連の判断を再構成する監査記録として不十分。[app/web/src/agent/sync.ts:12](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:12)、[app/web/src/flow/useFlow.ts:395](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:395) |
| 2-6 セキュリティ | **2→3** | **PINの検査順は解消。** 上限後は正しいPINも429、既存教師はセッションで継続。テーマ・段階・イベント種類の間接注入経路も絞った。[app/server/routes_class.py:229](/Users/shun/Desktop/phonelab/app/server/routes_class.py:229)、[app/tests/test_class_api.py:272](/Users/shun/Desktop/phonelab/app/tests/test_class_api.py:272)、[app/server/agent/class_agent.py:110](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:110) | PIN制限はインスタンス内。漏えい評価も実装の検出関数を再利用しており、同じ検出漏れを共有する。「0件」は意味上の漏えいゼロの証明ではない。[app/server/ratelimit.py:3](/Users/shun/Desktop/phonelab/app/server/ratelimit.py:3)、[app/scripts/eval_agent.py:60](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:60) |
| 2-7 信頼できる動作 | **3→3** | Replannerの409は端末停止へ、NextStepの429は記録に固定しないよう改善。[app/web/src/flow/useFlow.ts:224](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:224)、[app/web/src/flow/nextStep.ts:77](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:77) | **人数誤りへの対策が成立していない。** 数の集合への所属だけ検査し、テーマ・状態との対応を見ない。またNextStepは失敗・上限時、不一致で考察未記入でも通常の`next`へ縮退する。[app/server/agent/policy_plugin.py:351](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:351)、[app/server/routes_next.py:200](/Users/shun/Desktop/phonelab/app/server/routes_next.py:200) |

**軸3：実装品質と拡張性**

| 観点 | 前回→今回 | 根拠・前回指摘の解消状況 | 5点に届かない理由 |
|---|---:|---|---|
| 3-1 動くこと・非モック | **3→3** | URL、学級コード、PIN、サンプル、実モデル評価がある。前回修正分はデプロイ済みと記録されている。[README.md:15](/Users/shun/Desktop/phonelab/README.md:15)、[flow.md:326](/Users/shun/Desktop/phonelab/flow.md:326) | **今回の修正版は未デプロイ。** 審査員が触る版と採点対象コードの一致がまだない。本番アクセスは今回行っていない。[flow.md:327](/Users/shun/Desktop/phonelab/flow.md:327) |
| 3-2 コード品質 | **3→4** | **記録URLの所有者確認は解消。** 表示用の`myRecordById`を設け、画面で使用。共通ガード・入力型・回帰テストもある。今回Python144件と型検査を確認。[app/web/src/store/records.ts:317](/Users/shun/Desktop/phonelab/app/web/src/store/records.ts:317)、[app/web/src/App.tsx:238](/Users/shun/Desktop/phonelab/app/web/src/App.tsx:238) | Firestoreの記録更新は依然「読む→日時比較→書く」が非トランザクションで、並行更新の逆転を防ぎ切れない。同期失敗後の再送も次のストア更新に依存する。[app/server/classroom.py:273](/Users/shun/Desktop/phonelab/app/server/classroom.py:273)、[app/web/src/agent/sync.ts:51](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:51) |
| 3-3 テストと評価 | **3→3** | **比較対象・2回目の待ち時間・価格条件の保存は解消。** 実モデルの個別出力も残る。[app/scripts/eval_agent.py:95](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:95)、[app/scripts/eval_agent.py:158](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:158)、[docs/eval/2026-10-02.json:5](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:5) | 評価の妥当性はまだ不足。NextStepの8/8は行動ラベルの一致で、文の整合性を見ない。ClassAgentも事実精度を独立採点していない。実モデル評価はPlanner・NextStep・見立てに偏り、Tutor・Replannerの評価がない。[app/scripts/eval_agent.py:250](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:250)、[app/scripts/eval_agent.py:430](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:430)、[app/scripts/eval_agent.py:490](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:490) |
| 3-4 Google Cloud活用 | **4→4** | ADK、Vertex AI、Firestore、Trace、Armorの用途は明確。今回のFirestore予約トランザクションも適切な方向。[app/server/agent/runner.py:166](/Users/shun/Desktop/phonelab/app/server/agent/runner.py:166)、[app/server/classroom.py:334](/Users/shun/Desktop/phonelab/app/server/classroom.py:334) | サービス数は十分。5点に必要なのは、予約から自己修正までの一貫した実行制御と、複数インスタンスでの運用の証拠。Cloud製品の採用だけでは保証されない。 |
| 3-5 拡張性 | **4→4** | 測定プロファイルの分離、Python／TypeScript間のID・検査コード契約テストは維持されている。[app/web/src/measure/features.ts:55](/Users/shun/Desktop/phonelab/app/web/src/measure/features.ts:55)、[app/tests/test_contract.py:19](/Users/shun/Desktop/phonelab/app/tests/test_contract.py:19) | 契約は主に文字列集合。変数・単位・条件・閾値の一致までは検証しない。`too_uncertain`の教師向け文言漏れも、追加箇所が分散している例。[app/tests/test_contract.py:29](/Users/shun/Desktop/phonelab/app/tests/test_contract.py:29)、[app/web/src/screens/dashboard.ts:32](/Users/shun/Desktop/phonelab/app/web/src/screens/dashboard.ts:32) |
| 3-6 運用性 | **3→3** | DockerでWebとAPIをまとめ、envと維持期間を記載。教師セッションも授業中の継続性を改善。[app/Dockerfile:1](/Users/shun/Desktop/phonelab/app/Dockerfile:1)、[README.md:178](/Users/shun/Desktop/phonelab/README.md:178)、[app/server/teacher_session.py:1](/Users/shun/Desktop/phonelab/app/server/teacher_session.py:1) | 実Firestoreでの枠確保確認は、31人の授業負荷確認とは別物。負荷試験は見送りで、LLM・記録同期・教師ポーリングを同時に動かした成功率や遅延がない。[flow.md:327](/Users/shun/Desktop/phonelab/flow.md:327)、[flow.md:415](/Users/shun/Desktop/phonelab/flow.md:415) |
| 3-7 費用対効果 | **3→3** | 単価・為替をJSONへ保存し、再計算可能性は改善。約0.17円／実験、約19.11円／学級時という限定条件の概算がある。[docs/eval/2026-10-02.json:5](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:5)、[docs/eval.md:94](/Users/shun/Desktop/phonelab/docs/eval.md:94) | Tutor最大10往復、再計画、Armor、Firestore、Runを除く。授業総費用と上限費用は不明。「AIを使う方が安く・速く授業を支援できる」まで示せていない。[docs/eval.md:102](/Users/shun/Desktop/phonelab/docs/eval.md:102) |
| 3-8 実機・現場での有効性 | **1→1** | 手順書は具体的だが結果はまだない。[docs/device-check.md:29](/Users/shun/Desktop/phonelab/docs/device-check.md:29)、[flow.md:361](/Users/shun/Desktop/phonelab/flow.md:361) | 独立基準との誤差、正常時保留率、雑音時誤通過率が不明。音の2本目は1本目の推定値に依存し、倍音の強度条件もない。**「二本が一致した」と「正しく測れた」は別。** [app/web/src/measure/pitch.ts:65](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:65)、[app/web/src/measure/pitch.ts:138](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:138) |

## 2. 軸ごとの点と総合

ルーブリックどおり、各軸は「観点平均×20」、総合は3軸の平均。丸め前の値で計算しています。

| 軸 | 観点点合計 | 前回 | 今回 | 変化 |
|---|---:|---:|---:|---:|
| 課題の新規性と解決策の有効性 | 17 / 25 | 64.0 | **68.0** | **＋4.0** |
| 自律性・エージェントらしさ | 23 / 35 | 62.9 | **65.7** | **＋2.9** |
| 実装品質と拡張性 | 25 / 40 | 60.0 | **62.5** | **＋2.5** |
| **総合** | | **62.3** | **65.4** | **＋3.1** |

加点は、**保留の一貫した扱い、PINと間接注入経路の改善、記録表示の所有者分離**です。比較評価やチャット後の再判断も改善していますが、観点全体で次の水準に達していないものは据え置きました。前回点は[前回レビュー:48](/Users/shun/Desktop/phonelab/docs/reviews/2026-10-02-codex-score-2.md:48)に対応します。

**今回、加点を止めた具体的な問題**

1. **実行枠の予約は、自己修正を含む上限になっていない。**  
   同一生徒・同一記録へ5要求を並行し、FakeLlmに候補外出力を返させると、全要求200、実モデル呼び出し相当9回、サーバカウンタ9でした。最初の5枠は正しく予約されますが、4要求が追加予約なしで自己修正します。Firestoreの予約部分だけを並行確認しても、この経路は検証できません。今回はメモリ保存での再現で、本物のFirestoreを再実行したものではありません。[app/server/guards.py:110](/Users/shun/Desktop/phonelab/app/server/guards.py:110)、[app/server/agent/runner.py:455](/Users/shun/Desktop/phonelab/app/server/agent/runner.py:455)、[app/server/main.py:383](/Users/shun/Desktop/phonelab/app/server/main.py:383)

2. **「3人を4人と言う」問題は、同じ誤文をまだ通す。**  
   保存済み評価の許可人数は`[1,3,4,5,6]`。全体の保留が4人なので、誤文「音の高さで4人が保留」も許可されます。実際に`sanitize_insight`へ渡すと、文は残り、修正フラグは`false`でした。最新のGemini出力が正しいことと、検査が誤りを止めることは区別すべきです。[docs/eval/2026-10-02.json:2669](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:2669)、[app/server/agent/policy_plugin.py:351](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:351)

3. **「先にふり返り」が、支援の分岐として弱い。**  
   `reflect`を表示しても、次の予測と「次の実験へ」は使えます。これは助言としては成立しますが、「AIが状況に応じて学習の進め方を変える」という主張の証拠としては弱い。さらに保存済み評価には、`reflect`なのに問いかけは「次の変数を変えたら…測ってみよう」という応答があり、それでも8/8の成功に含まれます。この問いかけは現在のreflect表示では使われませんが、評価が応答全体の整合性を見ていない証拠です。[app/web/src/screens/Result.tsx:91](/Users/shun/Desktop/phonelab/app/web/src/screens/Result.tsx:91)、[app/web/src/screens/Result.tsx:149](/Users/shun/Desktop/phonelab/app/web/src/screens/Result.tsx:149)、[docs/eval/2026-10-02.json:2447](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:2447)

**入賞作と比べて足りないもの**

比較はリポジトリ内の受賞作整理に基づきます。各受賞作の外部実装や実証結果を今回確認したものではありません。

| 比較対象 | PhoneLabに足りないもの |
|---|---|
| **Anatom-AI：学習を妨げる操作負担をAIが引き受ける** | PhoneLabは「曖昧な予想を実験に変える」価値が見え始めた。ただし、生徒が実際に自力で進めた証拠がない。「5エージェント」より、**規則では取り違えた予想を理解し、教師を呼ばずに測定まで進めた一例**を通して見せたい。[context/06-past-winners.md:9](/Users/shun/Desktop/phonelab/context/06-past-winners.md:9)、[docs/eval.md:33](/Users/shun/Desktop/phonelab/docs/eval.md:33) |
| **BrickQuest：生成を物理検証につなぐ** | PhoneLabも検査を持つが、その検査自体の正しさが未実証。**正しい測定を通し、もっともらしい誤測定を止められる**ことが必要。これは測定器を名乗る作品の中心的な証拠。[context/06-past-winners.md:12](/Users/shun/Desktop/phonelab/context/06-past-winners.md:12)、[docs/device-check.md:31](/Users/shun/Desktop/phonelab/docs/device-check.md:31) |
| **フクシア：専門職の具体的な仕事を支援する** | 教師向け画面はできたが、**誰を先に助けるべきかを正しく判断でき、巡視や声かけをどれだけ減らしたか**がない。見立ての流暢さより、人数・対象・優先順位の正確さを先に固めるべき。[context/06-past-winners.md:20](/Users/shun/Desktop/phonelab/context/06-past-winners.md:20)、[app/server/agent/class_agent.py:68](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:68) |

## 3. 点が最も上がる改善10個

「見込み」は、その観点が次の水準に達した場合の**総合100点への寄与**です。保証ではなく、重複もあるため単純加算はできません。手間あたりの改善幅を優先しています。

| 順 | 観点 | 何をするか | 上がる見込み | 手間 | 10/13まで |
|---:|---|---|---|---|---|
| 1 | 1-1 | 課題統計を対象・年度・分母つきに整理。「中学9割」は根拠が閉じなければ削除し、中学校の一次資料で主張を組み直す。[docs/personas.md:77](/Users/shun/Desktop/phonelab/docs/personas.md:77) | 3→4、**＋1.33** | 小 | **やる** |
| 2 | 3-1 | 修正・検証済みの同一コミットをデプロイし、revisionと対応づける。保留・教師セッション・次の一手を本番で通す。[flow.md:327](/Users/shun/Desktop/phonelab/flow.md:327) | 3→4、**＋0.83** | 小 | **必須** |
| 3 | 2-4 | **自己修正を含む全モデル呼び出しの直前**に共有枠を確保。学級コード付き要求は番号省略も拒否。並行要求＋自己修正＋タイムアウトを組み合わせて検証。[app/server/guards.py:110](/Users/shun/Desktop/phonelab/app/server/guards.py:110) | 3→4、**＋0.95** | 中 | **やる** |
| 4 | 2-7 | 人数を自由文生成させず、`テーマ・状態・理由`の集計キーを選ばせて数値を機械で埋める。縮退時もreflect条件を維持し、文と行動を一致させる。[app/server/agent/policy_plugin.py:351](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:351)、[app/server/routes_next.py:200](/Users/shun/Desktop/phonelab/app/server/routes_next.py:200) | 3→4、**＋0.95** | 中 | **やる** |
| 5 | 2-5 | 記録IDに各段階のtrace ID、特徴量、検査結果、完全なハッシュを関連づける。本文をTraceへ入れず、教師から判断経路を追えるようにする。[app/web/src/agent/sync.ts:12](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:12) | 3→4、**＋0.95** | 中 | **やる** |
| 6 | 3-3 | 実装の正規表現から独立した評価を追加。Tutor・Replanner、人数の対応、保留、応答と行動の矛盾を採点し、複数回の結果を残す。[app/scripts/eval_agent.py:60](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:60) | 3→4、**＋0.83** | 中 | **やる** |
| 7 | 3-7 | 通常授業と上限到達授業の2ケースで総費用を計算。会話・再計画・Armor・Firestore・Runを含め、呼び出し回数の前提を明示。[docs/eval.md:102](/Users/shun/Desktop/phonelab/docs/eval.md:102) | 3→4、**＋0.83** | 中 | **やる** |
| 8 | 3-6 | 31人相当で計画・記録送信・教師ポーリングを同時実行。遅延、429、保存逆転、停止反映を確認し、再送と記録更新の競合を直す。[app/server/classroom.py:273](/Users/shun/Desktop/phonelab/app/server/classroom.py:273)、[flow.md:363](/Users/shun/Desktop/phonelab/flow.md:363) | 3→4、**＋0.83** | 中 | **縮小版でもやる** |
| 9 | 1-2・1-4 | 教師1人と数人の利用者で、既存手段との短い比較を行う。完了時間、教師への質問回数、導入で詰まった箇所を記録し、独立学級の配布手順を整える。[docs/personas.md:25](/Users/shun/Desktop/phonelab/docs/personas.md:25) | 各3→4で **＋1.33〜2.67** | 大 | **小規模に絞ってやる** |
| 10 | 3-8 | 3機種で独立基準との誤差・正常時保留率・雑音時誤通過率を測る。音は既知周波数や別音源条件を追加し、閾値調整後に別の測定で確認する。[docs/device-check.md:29](/Users/shun/Desktop/phonelab/docs/device-check.md:29) | 1→3〜4、**＋1.67〜2.50** | 大 | **必須・先に着手** |

実機は手間効率順では下ですが、動画と主張の成立を左右するため、実施日は先に固定すべきです。動画・説明文・GitHub連携は採点外でも提出に必要なので、この順位とは別に進める必要があります。[flow.md:405](/Users/shun/Desktop/phonelab/flow.md:405)

## 4. 審査員が最初の1分で抱きそうな疑問・突っ込み5つ

| 疑問・突っ込み | 答えと所在 |
|---|---|
| **① 測定アプリとワークシートで十分では？** | 自由文理解・保留・教師支援という違いはある。実際の端末規則に対し実験選択は25/25対23/25。ただし、既存手段より授業や学習が改善した比較結果は**無い**。[docs/idea-sheet.md:17](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:17)、[docs/eval.md:25](/Users/shun/Desktop/phonelab/docs/eval.md:25) |
| **② 「自律的に次を選ぶ」は、残りの実験を出すだけでは？** | Plannerの自由文理解とReplannerの修正提案には判断がある。一方NextStepは明示的な分岐規則が中心で、考察も内容ではなく記入有無だけ。5役の存在以上の価値はまだ弱い。[app/server/agent/next_step.py:35](/Users/shun/Desktop/phonelab/app/server/agent/next_step.py:35)、[app/web/src/flow/nextStep.ts:19](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:19) |
| **③ 二本が一致すれば、正しい測定なの？** | **保証できない。** 音の2本目は1本目から探索範囲を決める。独立基準との誤差や誤通過率の実機結果は**無い**。[app/web/src/measure/pitch.ts:65](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:65)、[docs/device-check.md:31](/Users/shun/Desktop/phonelab/docs/device-check.md:31) |
| **④ 回数制限と教師の見立ては信用できる？** | 初回予約とPIN対策は改善。ただし自己修正込みの上限超過を再現し、人数検査も誤った対象との組み合わせを通した。「制御がある」と「境界まで保証できる」の間に差がある。[app/server/guards.py:119](/Users/shun/Desktop/phonelab/app/server/guards.py:119)、[app/server/agent/policy_plugin.py:351](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:351) |
| **⑤ 31人の授業で使えて、本当に約19円？** | 約19円は特定のPlanner・NextStep・見立て回数に基づくGemini概算。会話等を含む授業総費用と31人同時利用の確認結果は**無い**。[docs/eval.md:102](/Users/shun/Desktop/phonelab/docs/eval.md:102)、[flow.md:415](/Users/shun/Desktop/phonelab/flow.md:415) |

## 5. 提出物の完成度のチェックで、欠けているもの

| 提出物 | 状態 | 残っていること・根拠 |
|---|---|---|
| GitHubリポジトリ・App連携・デフォルトブランチ | **未完了** | リポジトリはある。App連携と、`feat/agent-loop`から審査対象のデフォルトブランチへの反映が未完了。[flow.md:323](/Users/shun/Desktop/phonelab/flow.md:323)、[flow.md:405](/Users/shun/Desktop/phonelab/flow.md:405) |
| デプロイURL・テストアカウント・サンプル | **あり／最新修正版は未反映** | URL、学級コード、PIN、見本記録は揃っている。今回の修正版をデプロイし、提出コミットとの一致を確認する必要がある。[README.md:15](/Users/shun/Desktop/phonelab/README.md:15)、[flow.md:327](/Users/shun/Desktop/phonelab/flow.md:327) |
| 説明文 | **下書き** | 比較評価・待ち時間の訂正は済んだ。課題統計、「必ず問い返す」という表現、実装版と本番版の区別を直して最終化する必要がある。[docs/idea-sheet.md:4](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:4)、[docs/idea-sheet.md:29](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:29)、[flow.md:379](/Users/shun/Desktop/phonelab/flow.md:379) |
| アーキテクチャ図の画像 | **あり／表現調整が必要** | PNGも確認。未実装の脚注は適切。ただし「理由が無ければ問い返す」の保証表現や、Armor・自己修正の適用範囲は本文でも限定したい。READMEの「サーバが特徴量要約を受け取る」という記述も同期payloadと一致させる。[docs/architecture-diagram.html:50](/Users/shun/Desktop/phonelab/docs/architecture-diagram.html:50)、[docs/architecture-diagram.html:150](/Users/shun/Desktop/phonelab/docs/architecture-diagram.html:150)、[README.md:135](/Users/shun/Desktop/phonelab/README.md:135)、[app/web/src/agent/sync.ts:12](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:12) |
| 3分のデモ動画・YouTube URL | **無し** | 台本のみ。実測→保留→修正→再測定→考察→次の判断を通して撮り、教師画面へどう反映されるかを見せたい。冒頭の「中学9割」は根拠整理前に収録しない。[docs/storyboard.md:13](/Users/shun/Desktop/phonelab/docs/storyboard.md:13)、[flow.md:378](/Users/shun/Desktop/phonelab/flow.md:378) |
| OSSライセンス・開発部分の構成説明 | **あり** | MIT、第三者ライセンス一覧、今回の開発範囲を記載済み。[LICENSE:1](/Users/shun/Desktop/phonelab/LICENSE:1)、[THIRD_PARTY_LICENSES.md:3](/Users/shun/Desktop/phonelab/THIRD_PARTY_LICENSES.md:3)、[README.md:81](/Users/shun/Desktop/phonelab/README.md:81) |
| 実機検証結果 | **無し** | 手順書のみ。3-8の加点だけでなく、動画で「実際に測れている」と言うための根拠が必要。[docs/device-check.md:3](/Users/shun/Desktop/phonelab/docs/device-check.md:3)、[flow.md:361](/Users/shun/Desktop/phonelab/flow.md:361) |