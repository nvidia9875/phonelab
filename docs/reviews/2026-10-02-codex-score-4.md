## 1. 観点ごとの採点

**総合 69.4 / 100。前回65.4点から＋4.0点。改善は確認できましたが、現時点では入賞推薦には届きません。**

前回の「上限5回なのに9回呼べる」問題は解消を確認しました。一方、**学級の人数誤り、通信失敗時のふり返り省略、実験条件を変えてしまう再計画の助言**が残っています。実装の厚みに対して、「正しく測れて、生徒と教師の役に立った」という証拠が不足しています。

対象は `feat/agent-loop` の現状。ファイル変更・本番アクセス・実モデルの再実行はしていません。Pythonテストは**148件成功**、TypeScriptの型検査も成功。追加でFakeLlm・メモリ保存による並行要求と、人数検査関数を局所確認しました。Webテスト全体は未実行です。動画等の未完成は主に **5**、実機未検証は **3-8** で扱います。

**軸1：課題の新規性と解決策の有効性**

| 観点 | 前回→今回 | 根拠・前回指摘の解消状況 | 5点に届かない理由 |
|---|---:|---|---|
| 1-1 課題の実在と規模 | **3→4** | **対象・分母・年度の混同は改善。** 助手配置を小中学校2,649／29,563校、実験頻度を中学校48.5%に統一。古い時間不足調査も参考値と明記。[docs/idea-sheet.md:12](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:12)、[docs/personas.md:77](/Users/shun/Desktop/phonelab/docs/personas.md:77) | 配置事業の数字から、教師が実際に一人で担う負担への説明には推論が残る。対象校・教師への調査で、準備、器具不足、巡視のどれが最大の障害かを裏づけていない。 |
| 1-2 未解決であること | **3→3** | 測定アプリ、生成AI、LMSとの機能差は明確。[docs/idea-sheet.md:17](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:17) | 前回と同じ。「測定アプリ＋予想ワークシート＋教師の巡視」と比べた効果がない。既存製品に同じ機能がないことと、既存運用では解けないことは別。 |
| 1-3 課題の核心への有効性 | **4→4** | 保留の一貫した扱いに加え、教師画面の`too_uncertain`等の表示漏れを解消。20分の利用場面も具体的。[app/web/src/screens/dashboard.ts:33](/Users/shun/Desktop/phonelab/app/web/src/screens/dashboard.ts:33)、[docs/idea-sheet.md:10](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:10) | 再計画が「弱く測る条件で強くはじく」よう助言している。測定を通すために比較条件を崩すと、予想を証拠で検討するという核心を損なう。[docs/eval/2026-10-02.json:2695](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:2695) |
| 1-4 実質的価値・導入しやすさ | **3→3** | GIGA端末、班で順番に測定、個人別記録の運用は具体的。[docs/personas.md:43](/Users/shun/Desktop/phonelab/docs/personas.md:43) | 新しい教師への独立学級の発行・配布・復元手順が弱い。学級初期化はデモ中心で、別端末から記録を復元するAPIも見送り。[app/server/classroom.py:379](/Users/shun/Desktop/phonelab/app/server/classroom.py:379)、[flow.md:416](/Users/shun/Desktop/phonelab/flow.md:416) |
| 1-5 伝わり方 | **4→4** | 冒頭の課題統計と台本は改善。説明の骨格は理解しやすい。[docs/storyboard.md:12](/Users/shun/Desktop/phonelab/docs/storyboard.md:12) | **最新の数字が説明に反映されていない。** READMEは問い返し10/13・中央値1.7秒、最新JSONは11/13・2.15秒。「理由がなければ実験を出さない」も保証できていない。[README.md:73](/Users/shun/Desktop/phonelab/README.md:73)、[docs/eval/2026-10-02.json:15](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:15)、[docs/idea-sheet.md:28](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:28) |

**軸2：自律性・エージェントらしさ**

| 観点 | 前回→今回 | 根拠・前回指摘の解消状況 | 5点に届かない理由 |
|---|---:|---|---|
| 2-1 状況判断・自律行動 | **4→4** | 予想、保留、判定後の再判断まで実装。サーバ側の上限到達時も、不一致・考察なしなら`reflect`へ修正。[app/server/routes_next.py:206](/Users/shun/Desktop/phonelab/app/server/routes_next.py:206) | 考察を読んでいるのではなく、8文字以上書いたかを見ている。`reflect`でも次の実験へ進めるため、学習状況に応じた支援はまだ浅い。[app/web/src/flow/nextStep.ts:19](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:19)、[app/web/src/screens/Result.tsx:149](/Users/shun/Desktop/phonelab/app/web/src/screens/Result.tsx:149) |
| 2-2 単純な自動化を超えるか | **4→4** | 実際の端末規則と比較し、自由文の実験選択25/25対23/25を示している。[docs/eval.md:23](/Users/shun/Desktop/phonelab/docs/eval.md:23) | LLMが必要な自由文理解は示せた。一方NextStepの行動は明示規則で決まり、主要テーマは2実験なので残り候補が1つになる。ここをLLMに任せる追加価値は未証明。[app/server/agent/next_step.py:35](/Users/shun/Desktop/phonelab/app/server/agent/next_step.py:35)、[app/web/src/catalog/themes.ts:110](/Users/shun/Desktop/phonelab/app/web/src/catalog/themes.ts:110) |
| 2-3 ツール・複数エージェント | **3→3** | 読み取り専用ツール、番号・回数制限、役割分担は実装済み。[app/server/agent/class_agent.py:74](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:74)、[app/server/agent/policy_plugin.py:225](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:225) | ツールが読むのはAPIが先に作った要約。教師の介入結果を観察して生徒支援へ返す協調はない。5役あること自体には加点しない。[app/server/routes_insight.py:102](/Users/shun/Desktop/phonelab/app/server/routes_insight.py:102) |
| 2-4 人間の関与・上限・停止 | **3→4** | **主要指摘は解消。** 自己修正前にも共有枠を予約し、番号省略を403に。追加の5並行要求ではモデル呼び出し・カウンタとも5で停止。[app/server/guards.py:125](/Users/shun/Desktop/phonelab/app/server/guards.py:125)、[app/server/guards.py:163](/Users/shun/Desktop/phonelab/app/server/guards.py:163)、[app/server/agent/runner.py:487](/Users/shun/Desktop/phonelab/app/server/agent/runner.py:487) | 今回の並行確認はメモリ保存。実Firestoreで自己修正・競合・タイムアウトを組み合わせた証跡はない。追加回帰テストも逐次要求である。[app/tests/test_class_api.py:471](/Users/shun/Desktop/phonelab/app/tests/test_class_api.py:471) |
| 2-5 可観測性 | **3→3** | **部分解消。** 再計画・次の一手のtrace ID、採用値、完全なハッシュを同期し、教師画面に表示。[app/web/src/agent/sync.ts:24](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:24)、[app/web/src/screens/Teacher.tsx:236](/Users/shun/Desktop/phonelab/app/web/src/screens/Teacher.tsx:236) | 「全トレース」ではない。Tutorの`trace_id`は記録に追加されず、配列も直近6件のみ。全検査結果・特徴量の構造化同期もないため、保留に至る判断を再構成しきれない。[app/web/src/flow/useFlow.ts:417](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:417)、[app/web/src/store/records.ts:313](/Users/shun/Desktop/phonelab/app/web/src/store/records.ts:313) |
| 2-6 セキュリティ | **3→3** | PIN対策・入力制限を維持し、別モデルによる漏えい評価を追加。1件の漏えいを隠さず記録した点は評価。[docs/eval.md:134](/Users/shun/Desktop/phonelab/docs/eval.md:134) | 独立判定した注入出力は、モデルに届いた10件中3件だけ。判定不能も`leak=False`になる。PIN制限もインスタンス単位で、次の水準には未到達。[app/scripts/eval_more.py:157](/Users/shun/Desktop/phonelab/app/scripts/eval_more.py:157)、[app/scripts/eval_more.py:79](/Users/shun/Desktop/phonelab/app/scripts/eval_more.py:79)、[README.md:148](/Users/shun/Desktop/phonelab/README.md:148) |
| 2-7 信頼できる動作 | **3→3** | 人数をキーで埋める方式と、サーバ側の`reflect`縮退は改善。[app/server/agent/policy_plugin.py:352](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:352)、[app/server/routes_next.py:206](/Users/shun/Desktop/phonelab/app/server/routes_next.py:206) | **両方とも未完。** 別テーマ・全体のキーを誤った文に埋め込める。通信失敗・502・504時の端末側縮退は、不一致でも`next`になる。[app/server/agent/policy_plugin.py:365](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:365)、[app/web/src/flow/nextStep.ts:28](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:28) |

**軸3：実装品質と拡張性**

| 観点 | 前回→今回 | 根拠・前回指摘の解消状況 | 5点に届かない理由 |
|---|---:|---|---|
| 3-1 動くこと | **3→4** | 修正版revisionへのデプロイ記録と、本番への31人相当のAPI試験結果が追加。試用情報・サンプルもある。[flow.md:328](/Users/shun/Desktop/phonelab/flow.md:328)、[docs/load-test.md:3](/Users/shun/Desktop/phonelab/docs/load-test.md:3)、[README.md:15](/Users/shun/Desktop/phonelab/README.md:15) | 負荷試験はHTTPステータス中心で、計画の内容や画面の完走を検証していない。提出コミットと評価・デプロイ版の対応も十分固定されていない。[app/scripts/load_test.py:46](/Users/shun/Desktop/phonelab/app/scripts/load_test.py:46)、[docs/eval/2026-10-02.json:1](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:1) |
| 3-2 コード品質 | **4→4** | **前回の保存競合・再送待ちは改善。** Firestore更新をトランザクション化し、失敗後の自動再送も追加。今回148テストと型検査が成功。[app/server/classroom.py:273](/Users/shun/Desktop/phonelab/app/server/classroom.py:273)、[app/web/src/agent/sync.ts:56](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:56) | サーバとWebに重複した縮退規則があり、今回も修正が片側だけに入った。責務分割は良いが、共通仕様を保つ契約が弱い。[app/server/routes_next.py:206](/Users/shun/Desktop/phonelab/app/server/routes_next.py:206)、[app/web/src/flow/nextStep.ts:28](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:28) |
| 3-3 テストと評価 | **3→3** | **評価対象不足は改善。** Tutor・Replanner・独立漏えい判定を追加し、個別出力を保存。[docs/eval.md:104](/Users/shun/Desktop/phonelab/docs/eval.md:104) | Replannerの6/6は行動ラベルの一致。条件を壊す助言も成功扱い。独立判定もNextStepの`question or why`で片方しか見ず、応答全体の妥当性を測れていない。[app/scripts/eval_more.py:281](/Users/shun/Desktop/phonelab/app/scripts/eval_more.py:281)、[app/scripts/eval_more.py:170](/Users/shun/Desktop/phonelab/app/scripts/eval_more.py:170) |
| 3-4 Google Cloud活用 | **4→4** | ADK統制、Firestoreトランザクション、Trace、Vertex AIの役割は明確。実負荷の証拠も増えた。[app/server/agent/runner.py:166](/Users/shun/Desktop/phonelab/app/server/agent/runner.py:166)、[app/server/classroom.py:336](/Users/shun/Desktop/phonelab/app/server/classroom.py:336) | 複数インスタンスでの制限・キャッシュの整合性は未解決。サービス採用の幅より、分散時にも同じ制御が成立する証拠が必要。[README.md:148](/Users/shun/Desktop/phonelab/README.md:148)、[app/server/routes_insight.py:62](/Users/shun/Desktop/phonelab/app/server/routes_insight.py:62) |
| 3-5 拡張性 | **4→4** | 測定プロファイルを分離。教師向け検査文言も`Record<CheckCode, string>`にし、追加漏れを型で防ぐよう改善。[app/web/src/measure/features.ts:55](/Users/shun/Desktop/phonelab/app/web/src/measure/features.ts:55)、[app/web/src/screens/dashboard.ts:33](/Users/shun/Desktop/phonelab/app/web/src/screens/dashboard.ts:33) | Python／TypeScript間の契約は主にID集合。実験条件・単位・閾値・縮退動作の一致までは保証しない。[app/tests/test_contract.py:19](/Users/shun/Desktop/phonelab/app/tests/test_contract.py:19) |
| 3-6 運用性 | **3→4** | **負荷試験がない指摘は解消。** 31人相当の計画・記録送信・教師更新・停止確認が本番APIで成功。[docs/load-test.md:5](/Users/shun/Desktop/phonelab/docs/load-test.md:5) | 約37秒の試験で、授業時間の継続負荷ではない。NextStep・Tutor・見立ての同時負荷や、保存後の内容確認もない。「全端末停止」はブラウザのセンサー停止ではなくHTTPクライアントの状態検知。[app/scripts/load_test.py:85](/Users/shun/Desktop/phonelab/app/scripts/load_test.py:85) |
| 3-7 費用対効果 | **3→3** | **部分解消。** 会話・再計画を含む通常授業約31.51円と、重い利用約83.69円を追加。[docs/eval.md:149](/Users/shun/Desktop/phonelab/docs/eval.md:149) | Cloud Runの金額は未計算で、参照先の負荷試験にも費用がない。「上限」はPlanner5回・NextStep3回に対し式では各2倍なので、厳密な上限ではない。[app/scripts/eval_more.py:256](/Users/shun/Desktop/phonelab/app/scripts/eval_more.py:256)、[app/server/agent/policy_plugin.py:39](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:39) |
| 3-8 実機・現場での有効性 | **1→1** | 手順書はあるが、実機結果は未提出。[docs/device-check.md:29](/Users/shun/Desktop/phonelab/docs/device-check.md:29)、[flow.md:362](/Users/shun/Desktop/phonelab/flow.md:362) | 独立基準との誤差、正常時保留率、雑音時誤通過率がない。音の2本目は1本目から探索範囲を決め、倍音の強度条件もない。二系統の一致だけでは正確さを示せない。[app/web/src/measure/pitch.ts:65](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:65)、[app/web/src/measure/pitch.ts:138](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:138) |

## 2. 軸ごとの点と総合

各軸は「観点平均×20」、総合は3軸の平均。丸め前の値で計算しています。

| 軸 | 観点点合計 | 前回 | 今回 | 変化 |
|---|---:|---:|---:|---:|
| 課題の新規性と解決策の有効性 | 18 / 25 | 68.0 | **72.0** | ＋4.0 |
| 自律性・エージェントらしさ | 24 / 35 | 65.7 | **68.6** | ＋2.9 |
| 実装品質と拡張性 | 27 / 40 | 62.5 | **67.5** | ＋5.0 |
| **総合** | | **65.4** | **69.4** | **＋4.0** |

加点は、**課題統計の整理、自己修正込みの回数制御、修正版のデプロイ証跡、本番での負荷試験**です。前回点は[前回レビュー:48](/Users/shun/Desktop/phonelab/docs/reviews/2026-10-02-codex-score-3.md:48)に対応します。

**今回、加点を止めた具体的な問題**

1. **人数キー方式でも、前回と同じ誤文を生成できる。**  
   `音の高さ・保留=3、全体・保留=4`として、`音の高さで〔全体・保留〕が保留`を実際に検査すると、**「音の高さで 4 人が保留」、修正フラグfalse**になりました。`四人`も通り、`suggestion`の人数は検査対象外です。数値を埋めるだけでは、数値と対象の対応は保証できません。モデルには集計キーだけを選ばせ、テーマ・状態を含む文全体をサーバで作る必要があります。[app/server/agent/policy_plugin.py:352](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:352)、[app/server/agent/policy_plugin.py:389](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:389)

2. **「縮退でもふり返り」はサーバ側だけ。**  
   サーバが502・504を返すとWebの`catch`に入り、残りの実験があれば`next`を保存します。429も同じ縮退を表示します。修正済みのサーバ側分岐を通らない経路なので、前回指摘は部分解消です。[app/server/routes_next.py:194](/Users/shun/Desktop/phonelab/app/server/routes_next.py:194)、[app/web/src/flow/nextStep.ts:28](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:28)、[app/web/src/flow/nextStep.ts:77](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:77)

3. **追加評価が、実験として不適切な助言を成功扱いしている。**  
   保存されたReplanner出力には、弱くはじくA条件への「強くはじき直そう」、高さ10cmのA条件への「高さを少し低くして」があります。助言どおり測ると、記録上の条件と実際の条件がずれます。また、低サンプリングへの対処として、同じ測定プロファイルを使う重さ実験を「影響を受けにくい」と説明しています。**retry／switchが合うことと、次の行動が有効であることは別です。** [docs/eval/2026-10-02.json:2695](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:2695)、[docs/eval/2026-10-02.json:2755](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:2755)、[docs/eval/2026-10-02.json:2795](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:2795)、[app/web/src/catalog/themes.ts:109](/Users/shun/Desktop/phonelab/app/web/src/catalog/themes.ts:109)

4. **負荷試験の停止時間の説明が、測っているものより強い。**  
   時間の起点は教師の停止APIが返った**後**です。終点も実ブラウザのセンサー停止ではなく、Pythonクライアントが`halted`を読んだ時点。「先生が押してから全端末停止まで1.48秒」とするには不足があります。API負荷試験としての価値は認めます。[app/scripts/load_test.py:142](/Users/shun/Desktop/phonelab/app/scripts/load_test.py:142)、[app/scripts/load_test.py:117](/Users/shun/Desktop/phonelab/app/scripts/load_test.py:117)、[docs/load-test.md:14](/Users/shun/Desktop/phonelab/docs/load-test.md:14)

**入賞作と比べて足りないもの**

以下はリポジトリ内の受賞作整理との比較です。受賞作の外部実装や実証結果を今回確認したものではありません。

| 比較対象 | PhoneLabに足りないもの |
|---|---|
| **Anatom-AI：学習を妨げる操作負担を引き受ける** | PhoneLabも自由文理解の価値は見せられる。しかし、**生徒が教師を呼ばずに実験を完了できた**証拠がない。エージェント数より、「規則では誤解した予想を理解し、自力で確かめられた」一本の実演が必要。[context/06-past-winners.md:9](/Users/shun/Desktop/phonelab/context/06-past-winners.md:9)、[docs/eval.md:33](/Users/shun/Desktop/phonelab/docs/eval.md:33) |
| **BrickQuest：生成結果を物理的な検証につなぐ** | PhoneLabには検査があるが、**検査そのものの有効性が未実証**。加えて再計画が実験条件を壊しうる。「検査して直す」という構造だけでなく、直した結果が正しくなる証拠が必要。[context/06-past-winners.md:12](/Users/shun/Desktop/phonelab/context/06-past-winners.md:12)、[docs/eval/2026-10-02.json:2755](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:2755) |
| **フクシア：専門職の具体的な仕事を支援する** | 教師画面はできたが、**正しい子を優先でき、教師の確認時間を減らせる**ことが示されていない。人数・原因・介入先の正確さを、教師の判断と比較してほしい。[context/06-past-winners.md:20](/Users/shun/Desktop/phonelab/context/06-past-winners.md:20)、[app/server/agent/class_agent.py:77](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:77) |

## 3. 点が最も上がる改善10個

見込みは**総合100点への寄与**です。同じ観点の改善は重複するため単純加算できません。手間あたりの上がり幅を優先しています。

| 順 | 観点 | 何をするか | 上がる見込み | 手間 | 10/13まで |
|---:|---|---|---|---|---|
| 1 | 3-7 | 通常授業・高負荷ケース・厳密な上限を区別。Cloud Runを金額化し、Planner5回・NextStep3回等に計算を合わせる。[app/scripts/eval_more.py:256](/Users/shun/Desktop/phonelab/app/scripts/eval_more.py:256) | 3→4、**＋0.83** | 小 | **やる** |
| 2 | 2-7 | Webの通信失敗・429・502・504でも、不一致・考察なしなら`reflect`。正常応答と縮退で同じ判断表を使う。[app/web/src/flow/nextStep.ts:28](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:28) | 他の信頼性修正と合わせ **＋0〜0.95** | 小 | **必須** |
| 3 | 3-3・2-6 | 独立評価で注入10件すべて、NextStepの問いと理由の両方を採点。判定不能を成功から除外し、修正後の複数回結果を残す。[app/scripts/eval_more.py:152](/Users/shun/Desktop/phonelab/app/scripts/eval_more.py:152) | まず3-3を3→4、**＋0.83** | 中 | **やる** |
| 4 | 2-7 | 見立ての人数文を構造化。モデルは集計キーを選び、対象・状態・人数をサーバが一体で描画。自由文にも人数を混ぜない。[app/server/agent/policy_plugin.py:376](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:376) | 2・6と合わせ **＋0〜0.95** | 中 | **必須** |
| 5 | 2-5 | Tutorを含め、段階名とtrace IDを対応づけて保存。測定の特徴量・全検査結果・採用した測定を関連づける。「全トレース」と直近6件の矛盾も解消。[app/web/src/agent/sync.ts:13](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:13) | 3→4、**＋0.95** | 中 | **やる** |
| 6 | 2-7・3-3 | Replannerへ条件の具体値・統制変数・測定方式を渡す。条件を変える助言は同条件retryにせず、変更を記録して再計画。助言の実験上の妥当性も採点。[app/server/agent/planner.py:202](/Users/shun/Desktop/phonelab/app/server/agent/planner.py:202) | 2・3・4と重複、**＋0〜1.79** | 中 | **必須** |
| 7 | 1-5 | 最新評価からREADME・説明文・図・字幕の数字を統一。「必ず問い返す」を実測に合わせ、実機の一連の体験を3分動画にする。[README.md:68](/Users/shun/Desktop/phonelab/README.md:68)、[docs/storyboard.md:26](/Users/shun/Desktop/phonelab/docs/storyboard.md:26) | 4→5、**＋1.33** | 中 | **提出に必須** |
| 8 | 1-4 | デモ以外の学級発行・番号配布・合言葉紛失・端末交換まで、教師が実行できる導入手順を作って試す。[app/server/classroom.py:379](/Users/shun/Desktop/phonelab/app/server/classroom.py:379) | 3→4、**＋1.33** | 中 | **小さくやる** |
| 9 | 3-8 | 3機種で独立基準との誤差、正常時保留率、雑音時誤通過率を測る。調整用と確認用の測定を分ける。[docs/device-check.md:31](/Users/shun/Desktop/phonelab/docs/device-check.md:31) | 1→3〜4、**＋1.67〜2.50** | 大 | **必須・先に着手** |
| 10 | 1-2・1-4 | 教師1人・利用者数人で既存手段と比較。完了時間、教師への質問回数、誤った結論、導入時の詰まりを記録。[docs/personas.md:43](/Users/shun/Desktop/phonelab/docs/personas.md:43) | 各3→4で **＋1.33〜2.67** | 大 | **短時間に絞ってやる** |

実機検証は効率順では9番ですが、**測定器としての主張と動画の成立条件なので日程上は最優先**です。これ以上エージェントを増やすより、現在の一周を正しく成立させる方が得点につながります。

## 4. 審査員が最初の1分で抱きそうな疑問・突っ込み5つ

| 疑問・突っ込み | 答えと所在 |
|---|---|
| **① 測定アプリとワークシートで十分では？** | 自由文の実験選択は実際の規則より2件改善。ただし授業の完了率・教師負担・考察の質の比較結果は**無い**。[docs/eval.md:23](/Users/shun/Desktop/phonelab/docs/eval.md:23)、[docs/personas.md:58](/Users/shun/Desktop/phonelab/docs/personas.md:58) |
| **② 「自律的な次の一手」は、残りの実験を出すだけでは？** | 不一致と考察の有無で分岐し、保留時には再計画する。ただし考察は文字数判定、NextStepの行動規則も固定。規則より支援が適切だった比較は**無い**。[app/server/agent/next_step.py:35](/Users/shun/Desktop/phonelab/app/server/agent/next_step.py:35)、[app/web/src/flow/nextStep.ts:19](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:19) |
| **③ 二本が一致したら、正しく測れたと言える？** | **言い切れない。** 音の倍音探索は最初の推定値に依存する。独立基準との誤差・誤通過率の実機結果は**無い**。[app/web/src/measure/pitch.ts:65](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:65)、[docs/device-check.md:31](/Users/shun/Desktop/phonelab/docs/device-check.md:31) |
| **④ 回数制限と教師への見立ては信用できる？** | 回数制限は今回の5並行要求でも上限5を確認。人数は改善したが、誤った集計キーと文章の組み合わせが通るため、見立ての事実保証は不十分。[app/server/guards.py:125](/Users/shun/Desktop/phonelab/app/server/guards.py:125)、[app/server/agent/policy_plugin.py:352](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:352) |
| **⑤ 31人の授業が、本当に止まらず安く動く？** | 約37秒のAPI負荷試験は成功。50分の全機能併用・実端末の停止完了の確認は**無い**。通常授業のGemini概算は約31.51円まで拡充したが、Cloud Run込みの総額は未算出。[docs/load-test.md:3](/Users/shun/Desktop/phonelab/docs/load-test.md:3)、[docs/eval.md:149](/Users/shun/Desktop/phonelab/docs/eval.md:149) |

## 5. 提出物の完成度のチェックで、欠けているもの

| 提出物 | 状態 | 残っていること・根拠 |
|---|---|---|
| GitHubリポジトリ・App連携・デフォルトブランチ | **未完了** | App連携と審査対象ブランチへの反映・凍結。現在は`feat/agent-loop`。[flow.md:323](/Users/shun/Desktop/phonelab/flow.md:323)、[flow.md:406](/Users/shun/Desktop/phonelab/flow.md:406) |
| デプロイURL・テストアカウント・サンプル | **あり／修正版デプロイの記録あり** | 前回の未反映指摘は解消。提出コミット、revision、評価結果の対応を最後に固定する。本番の現状は今回未アクセス。[README.md:15](/Users/shun/Desktop/phonelab/README.md:15)、[flow.md:328](/Users/shun/Desktop/phonelab/flow.md:328) |
| 説明文 | **下書き** | 課題統計は改善。問い返しの保証表現、古い評価値、停止時間の測定範囲を直して最終化。[docs/idea-sheet.md:4](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:4)、[docs/idea-sheet.md:28](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:28) |
| アーキテクチャ図の画像 | **あり／更新が必要** | 元HTMLの中央値1.7秒が古い。人数埋め込み・枠予約など今回の主要な改善も伝わるよう更新し、PNGを再生成する。[docs/architecture-diagram.html:99](/Users/shun/Desktop/phonelab/docs/architecture-diagram.html:99)、[docs/architecture-diagram.html:126](/Users/shun/Desktop/phonelab/docs/architecture-diagram.html:126) |
| 3分のデモ動画・YouTube URL | **無し** | 台本のみ。実測、保留、条件を守った修正、再測定、ふり返り、教師画面まで通して撮る。[flow.md:379](/Users/shun/Desktop/phonelab/flow.md:379)、[docs/storyboard.md:31](/Users/shun/Desktop/phonelab/docs/storyboard.md:31) |
| OSSライセンス・開発部分の構成説明 | **あり** | MIT・第三者ライセンス・開発範囲の説明はある。テスト件数等の古い記載は更新する。[README.md:84](/Users/shun/Desktop/phonelab/README.md:84)、[README.md:184](/Users/shun/Desktop/phonelab/README.md:184) |
| 実機検証結果〔3-8の根拠〕 | **無し** | 手順書を結果に変える必要がある。負荷試験と実モデル評価では、測定精度の不足は埋まらない。[docs/device-check.md:3](/Users/shun/Desktop/phonelab/docs/device-check.md:3)、[flow.md:362](/Users/shun/Desktop/phonelab/flow.md:362) |