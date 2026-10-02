## 1. 観点ごとの採点

**総合 57.4 / 100。現時点では入賞推薦しません。** エージェントと統制の実装は進んでいますが、「測定から正しく判断する」「本人の記録を扱う」「停止と上限が効く」という中核の約束に穴があります。

対象は `feat/agent-loop` の現状です。ファイル変更、本番アクセス、テスト実行はしていません。テスト件数・実モデルの数値は保存済み資料として評価しました。実機未検証は主に **3-8**、動画・説明文・GitHub App 連携の未完成は **5** で扱い、欠品だけを理由に各軸で重複減点していません。

**軸1：課題の新規性と解決策の有効性**

| 観点 | 点 | 根拠 | 5点に届かない理由 |
|---|---:|---|---|
| 1-1 課題の実在と規模 | **3** | 課題の数字と出典がある。[docs/personas.md:77](/Users/shun/Desktop/phonelab/docs/personas.md:77)、[docs/idea-sheet.md:12](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:12) | 66%は2012年度の調査。「中学の9割に助手がいない」の出典欄は小中合計の支援事業実績で、中学校全体への換算根拠が文書中で閉じていない。高校の通過率を中学向け課題の根拠に使う点も弱い。 |
| 1-2 未解決であること | **3** | LMSとの比較表とphyphoxとの差分を説明。[docs/personas.md:58](/Users/shun/Desktop/phonelab/docs/personas.md:58)、[docs/idea-sheet.md:17](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:17) | ロイロ・Classroomは測定器ではないため、比較に勝つのは容易。最も近い「測定アプリ＋予想を書かせる教材＋先生の巡視」に対し、何がどれだけ改善するかがない。 |
| 1-3 課題の核心への有効性 | **3** | 授業の時間割と先生の介入場面は具体的。[docs/personas.md:43](/Users/shun/Desktop/phonelab/docs/personas.md:43) | **不確かさが大きいほど「変わらなかった」になりやすい**。`max(tolerance, unc)`以内を同一と判定し、差を識別できない状態と同等性を区別していない。「証拠で思い込みを壊す」製品の核心を損なう。[app/web/src/agent/stub.ts:108](/Users/shun/Desktop/phonelab/app/web/src/agent/stub.ts:108) |
| 1-4 実質的価値・導入しやすさ | **3** | GIGA端末、学校と家庭、班で順番に測る運用を考慮。[docs/personas.md:54](/Users/shun/Desktop/phonelab/docs/personas.md:54) | デモ学級から実校への導入手順が薄い。学級作成はデモ初期化が中心で、家庭での記録復元・既存ツールへの共有も切っている。「明日の授業で導入」の完成形には届かない。[app/server/classroom.py:276](/Users/shun/Desktop/phonelab/app/server/classroom.py:276)、[flow.md:412](/Users/shun/Desktop/phonelab/flow.md:412) |
| 1-5 伝わり方 | **3** | README冒頭と台本の導入は明快。[README.md:1](/Users/shun/Desktop/phonelab/README.md:1)、[docs/storyboard.md:12](/Users/shun/Desktop/phonelab/docs/storyboard.md:12) | 下書きでは未実装のKMS署名・提案承認反映を実現済みのように説明。「LLMはPlannerだけ」も現状と違う。短く伝わっても、伝わる内容が正確でなければ高得点にはしない。[docs/idea-sheet.md:33](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:33)、[docs/idea-sheet.md:43](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:43) |

**軸2：自律性・エージェントらしさ**

| 観点 | 点 | 根拠 | 5点に届かない理由 |
|---|---:|---|---|
| 2-1 状況判断・自律行動 | **3** | ReplannerとNextStepが保留・結果を読む。[app/server/main.py:498](/Users/shun/Desktop/phonelab/app/server/main.py:498)、[app/server/agent/next_step.py:62](/Users/shun/Desktop/phonelab/app/server/agent/next_step.py:62) | 次の一手を一度保存すると再判断しない。説明を書いた後も、測り直して結果が変わった後も古い提案が残る。「結果を観察して更新する」ループが不完全。[app/web/src/flow/nextStep.ts:30](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:30)、[app/web/src/flow/useFlow.ts:269](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:269) |
| 2-2 単純な自動化を超えるか | **4** | 言語理解と測定判定を分離。Plannerのツール有無も比較して既定オフにしている。[app/server/agent/planner.py:39](/Users/shun/Desktop/phonelab/app/server/agent/planner.py:39)、[docs/eval.md:8](/Users/shun/Desktop/phonelab/docs/eval.md:8) | 設計判断は強い。ただし比較は「LLMへの候補の渡し方」であり、既存の規則ベース選択に対するLLMの改善幅ではない。 |
| 2-3 ツール・複数エージェント | **3** | ClassAgentが2ツールを使い、実モデルでも3回使用。[app/server/agent/class_agent.py:52](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:52)、[docs/eval/2026-10-02.json:1819](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:1819) | 5つの役割はあるが、主に別APIから呼ばれる処理。ClassAgentも事前生成された要約を読み、助言して終了する。先生の介入後に改善を観察する協調ループまではない。[app/server/routes_insight.py:101](/Users/shun/Desktop/phonelab/app/server/routes_insight.py:101) |
| 2-4 人間の関与・上限・停止 | **2** | 承認チップ、停止、モデル・ツール上限は実装。[app/web/src/screens/Plan.tsx:49](/Users/shun/Desktop/phonelab/app/web/src/screens/Plan.tsx:49)、[app/server/agent/policy_plugin.py:117](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:117) | 回数はリクエストの自己申告。学級コード省略時は停止判定を通過する。さらに停止・許可変更が文書全体の読み書きなので、並行更新で停止を戻し得る。[app/server/main.py:198](/Users/shun/Desktop/phonelab/app/server/main.py:198)、[app/server/guards.py:70](/Users/shun/Desktop/phonelab/app/server/guards.py:70)、[app/server/routes_class.py:275](/Users/shun/Desktop/phonelab/app/server/routes_class.py:275)、[app/server/classroom.py:206](/Users/shun/Desktop/phonelab/app/server/classroom.py:206) |
| 2-5 可観測性 | **3** | 生徒の判断の跡、教員のイベント表示、自己修正スパンがある。[app/web/src/screens/Plan.tsx:47](/Users/shun/Desktop/phonelab/app/web/src/screens/Plan.tsx:47)、[app/server/agent/runner.py:476](/Users/shun/Desktop/phonelab/app/server/agent/runner.py:476) | 「1実験＝1トレース」を裏付ける関連付けが弱く、送信するtrace IDは計画のものだけ。要約に構造化特徴量・検査一覧・完全なハッシュもない。本文収集禁止も`setdefault`で、設定済みのtrueを強制解除しない。[app/web/src/agent/sync.ts:12](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:12)、[app/server/telemetry.py:21](/Users/shun/Desktop/phonelab/app/server/telemetry.py:21) |
| 2-6 セキュリティ | **2** | 多層検査、番号の合言葉、注入20件の評価はある。[docs/eval.md:19](/Users/shun/Desktop/phonelab/docs/eval.md:19)、[app/server/routes_class.py:355](/Users/shun/Desktop/phonelab/app/server/routes_class.py:355) | Plannerの`question_back`は出口検査外。ClassAgentにも、任意文字列の`hold_codes`を未知コードならそのまま渡す経路がある。予想本文を除くだけでは間接注入を閉じられていない。[app/server/agent/policy_plugin.py:241](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:241)、[app/server/routes_class.py:108](/Users/shun/Desktop/phonelab/app/server/routes_class.py:108)、[app/server/agent/class_agent.py:103](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:103) |
| 2-7 信頼できる動作 | **3** | 自己修正、上限時の代替、タイムアウトにテストがある。[app/tests/test_plan_api.py:202](/Users/shun/Desktop/phonelab/app/tests/test_plan_api.py:202)、[app/tests/test_plan_api.py:225](/Users/shun/Desktop/phonelab/app/tests/test_plan_api.py:225) | クライアントが409・429も通信障害と同じcatchでローカル計画へ落とす。学級ポーリング失敗時も前の状態を保持するため、縮退が停止・上限の意味を弱める。[app/web/src/flow/useFlow.ts:149](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:149)、[app/web/src/App.tsx:70](/Users/shun/Desktop/phonelab/app/web/src/App.tsx:70) |

**軸3：実装品質と拡張性**

| 観点 | 点 | 根拠 | 5点に届かない理由 |
|---|---:|---|---|
| 3-1 動くこと・非モック | **3** | 実API・実モデル評価・試用手順がある。[README.md:11](/Users/shun/Desktop/phonelab/README.md:11)、[docs/eval.md:3](/Users/shun/Desktop/phonelab/docs/eval.md:3) | **追加機能は未デプロイ**と記録されている一方、READMEは「本番で動く」に分類。現ブランチの実装と審査員が触れる版の一致が証明されていない。[flow.md:323](/Users/shun/Desktop/phonelab/flow.md:323)、[README.md:132](/Users/shun/Desktop/phonelab/README.md:132) |
| 3-2 コード品質 | **3** | Storeの抽象化、型、API別の分割、固定ロックでのビルドは良い。[app/server/classroom.py:109](/Users/shun/Desktop/phonelab/app/server/classroom.py:109)、[app/Dockerfile:15](/Users/shun/Desktop/phonelab/app/Dockerfile:15) | **番号変更時に端末の記録を分離しない**。同期は現在の番号で全記録を送るため、再読み込みなどで以前の人の記録が新しい番号に混ざり得る。合言葉追加だけでは前回F4を解消していない。[app/web/src/store/records.ts:209](/Users/shun/Desktop/phonelab/app/web/src/store/records.ts:209)、[app/web/src/agent/sync.ts:35](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:35) |
| 3-3 テストと評価 | **3** | 実モデルの個票、自己修正・ツール制限のテストがある。[docs/eval/2026-10-02.json:5](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:5)、[app/tests/test_insight_api.py:105](/Users/shun/Desktop/phonelab/app/tests/test_insight_api.py:105) | Plannerの速度測定用RunnerにはArmorを渡していない。漏えい検出は本体と同系統の正規表現。変数正答率は`plan`を返した既知変数だけが分母で、方向・実験選択全体の正答率ではない。[app/scripts/eval_agent.py:54](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:54)、[app/scripts/eval_agent.py:80](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:80)、[app/scripts/eval_agent.py:240](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:240) |
| 3-4 Google Cloud活用 | **4** | ADK Plugin、Vertex AI、Firestore、Trace、Armorに役割がある。[app/server/agent/runner.py:160](/Users/shun/Desktop/phonelab/app/server/agent/runner.py:160)、[app/server/agent/model_armor.py:37](/Users/shun/Desktop/phonelab/app/server/agent/model_armor.py:37) | サービスを並べただけではない。ただし認証・回数・停止・記録の整合性がクラウド側で一貫して管理されておらず、構成の良さが運用上の保証になり切っていない。 |
| 3-5 拡張性 | **3** | カタログと測定プロファイルの分離がある。[app/server/agent/catalog.py:12](/Users/shun/Desktop/phonelab/app/server/agent/catalog.py:12)、[app/web/src/measure/features.ts:55](/Users/shun/Desktop/phonelab/app/web/src/measure/features.ts:55) | PythonとTypeScriptの二重管理。READMEの「IDをテストで突き合わせ」と異なり、該当Pythonテストはサーバ内の答え一覧との比較。言語間の契約テストがない。[README.md:128](/Users/shun/Desktop/phonelab/README.md:128)、[app/tests/test_catalog.py:9](/Users/shun/Desktop/phonelab/app/tests/test_catalog.py:9) |
| 3-6 運用性 | **2** | env、予算、審査期間の維持計画がある。[README.md:170](/Users/shun/Desktop/phonelab/README.md:170)、[flow.md:386](/Users/shun/Desktop/phonelab/flow.md:386) | **記録APIは依然120回／10分／IP**。同一インスタンスなら31人が各4回送るだけで124回。学級内の通常操作で教員向け同期が制限され得る。負荷試験も切っている。[app/server/routes_class.py:35](/Users/shun/Desktop/phonelab/app/server/routes_class.py:35)、[app/server/routes_class.py:351](/Users/shun/Desktop/phonelab/app/server/routes_class.py:351)、[flow.md:412](/Users/shun/Desktop/phonelab/flow.md:412) |
| 3-7 費用対効果 | **3** | トークン実測から実験・学級単位の試算がある。[docs/eval.md:76](/Users/shun/Desktop/phonelab/docs/eval.md:76) | 約15円は実質Geminiの指定呼び出し分。Tutor・再計画、Firestoreの頻繁な読み書き、Armor、Run等を含む授業総費用ではない。単価の出典・価格設定の再現情報も不足。[app/scripts/eval_agent.py:277](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:277)、[app/scripts/eval_agent.py:348](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:348) |
| 3-8 実機・現場での有効性 | **1** | 手順書と暫定閾値はある。[docs/device-check.md:1](/Users/shun/Desktop/phonelab/docs/device-check.md:1)、[app/web/src/catalog/themes.ts:79](/Users/shun/Desktop/phonelab/app/web/src/catalog/themes.ts:79) | 実機での誤差・誤通過率・保留率・完了率の結果がない。音の2本目も1本目の推定値に依存し、倍音の存在強度を検査していない。手順書と合成波テストは実証の代わりにならない。[app/web/src/measure/pitch.ts:65](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:65)、[app/web/src/measure/pitch.test.ts:17](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.test.ts:17) |

## 2. 軸ごとの点と総合

ルーブリックどおり、各軸を「観点平均×20」、総合を3軸の平均で計算しています。

| 軸 | 観点点の合計 | 100点換算 |
|---|---:|---:|
| 課題の新規性と解決策の有効性 | 15 / 25 | **60.0** |
| 自律性・エージェントらしさ | 20 / 35 | **57.1** |
| 実装品質と拡張性 | 22 / 40 | **55.0** |
| **総合** | | **57.4 / 100** |

前回からの改善は認めます。公開ディレクトリ外の配信防止、正しいPINの制限除外、測定開始待ちのキャンセル、異なる変数の予想を支持しない修正はコードにあります。前回の欠陥をそのまま残存扱いにはしていません。[app/server/main.py:760](/Users/shun/Desktop/phonelab/app/server/main.py:760)、[app/tests/test_class_api.py:272](/Users/shun/Desktop/phonelab/app/tests/test_class_api.py:272)、[app/web/src/measure/useMeasurement.ts:129](/Users/shun/Desktop/phonelab/app/web/src/measure/useMeasurement.ts:129)、[app/web/src/agent/stub.ts:117](/Users/shun/Desktop/phonelab/app/web/src/agent/stub.ts:117)

ただし、対応表の「完了」は問題全体の解決を意味していません。F4は端末内の所有者分離、F5は不確かさと同等性の区別、I1は記録APIとサーバ側カウントが残っています。[flow.md:295](/Users/shun/Desktop/phonelab/flow.md:295)

**入賞作との具体的な差**は次の3点です。比較対象の内容はリポジトリ内の受賞作整理に基づき、各作品の外部実装を再審査したものではありません。

- **Anatom-AIの「AIが本質的な操作負担を減らす」に相当する証拠が弱い。** PhoneLabの音テーマは2実験なので、1つ終えれば残りは1つです。「次の実験をAIが選んだ」だけでは規則との差が見えません。曖昧な予想の解釈、保留からの復帰、介入順の判断で、固定手順より良い結果を示す必要があります。[context/06-past-winners.md:9](/Users/shun/Desktop/phonelab/context/06-past-winners.md:9)、[app/server/agent/catalog.py:71](/Users/shun/Desktop/phonelab/app/server/agent/catalog.py:71)
- **BrickQuestの物理検証に対して、PhoneLabは検査を信用できる根拠が足りない。** 検査コードが存在するだけでなく、誤った測定を実際に止められる必要があります。現在は倍音検査の依存性と、「不確かだから同じ」という判定が残っています。[context/06-past-winners.md:12](/Users/shun/Desktop/phonelab/context/06-past-winners.md:12)、[app/web/src/measure/pitch.ts:66](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:66)、[app/web/src/agent/stub.ts:112](/Users/shun/Desktop/phonelab/app/web/src/agent/stub.ts:112)
- **フクシアのような具体的業務支援に対し、先生の負担軽減が願望の段階。** 「先生に引き受けてほしいこと」は書けていますが、巡視判断時間・介入回数・準備時間をどれだけ減らせたかは示せていません。[context/06-past-winners.md:20](/Users/shun/Desktop/phonelab/context/06-past-winners.md:20)、[docs/personas.md:25](/Users/shun/Desktop/phonelab/docs/personas.md:25)

また、**「漏えい0/10」を強い安全性の証明とは評価しません**。現在言えるのは、その10入力の最終出力が評価用正規表現に一致しなかったことです。注入評価の個票には出力本文自体も保存されず、意味上の漏えいを第三者が再判定できません。[app/scripts/eval_agent.py:164](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:164)

## 3. 点が最も上がる改善10個

手間あたりの改善幅を目安に並べています。見込み点は**観点点**で、関連する修正がそろった場合の目安です。重複するため単純加算はできません。動画・連携などの提出必須事項は、この順位とは別に必須です。

| 順位 | 観点 | 何をするか | 上がる見込み | 手間 | 10/13まで |
|---|---|---|---|---|---|
| 1 | 1-5 | 説明文・README・図・台本を現状に統一。「KMS署名」「承認反映」「本番で動く」「2秒以内」「全処理が1トレース」の過大な表現を直す。根拠：[docs/idea-sheet.md:27](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:27)、[README.md:40](/Users/shun/Desktop/phonelab/README.md:40) | **3→4** | 小 | **必須。10/3まで** |
| 2 | 3-8 | 3機種で主役の音実験を測り、誤差・正常時保留率・雑音時誤通過率を表にする。基準音と倍音の弱い音も加える。閾値調整に使った条件とは別条件で再確認。根拠：[docs/device-check.md:29](/Users/shun/Desktop/phonelab/docs/device-check.md:29) | **1→3～4** | 中 | **必須。10/5まで** |
| 3 | 3-6 | 記録送信を認証済み生徒単位で制限し、共有IPには学級分の余裕を持たせる。31人分の通常イベント列で429と同期欠落を確認する。根拠：[app/server/routes_class.py:343](/Users/shun/Desktop/phonelab/app/server/routes_class.py:343) | **2→3** | 小〜中 | **必須** |
| 4 | 1-3、2-7 | 「差を検出できない」と「変わらない」を分け、不確かさ過大なら保留する。予想と実験の操作方向の対応も確認する。根拠：[app/web/src/agent/stub.ts:108](/Users/shun/Desktop/phonelab/app/web/src/agent/stub.ts:108) | **各3→4** | 中 | **必須。撮影前** |
| 5 | 2-1 | 説明追加・測り直しでNextStepを更新する。`reflect`からふり返りを経て次の計画へ進む一連の経路を検証する。現状の台本どおりには再判断されない。[app/web/src/flow/nextStep.ts:32](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:32)、[docs/storyboard.md:18](/Users/shun/Desktop/phonelab/docs/storyboard.md:18) | **3→4** | 中 | **必須** |
| 6 | 3-3、2-2 | 評価にArmorを含め、全出力・失敗・自己修正結果を保存。理由なし5/13を改善し、変数・方向・実験選択・行動選択を別々に採点。規則ベースとの比較を加える。[docs/eval.md:13](/Users/shun/Desktop/phonelab/docs/eval.md:13)、[app/scripts/eval_agent.py:80](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:80) | **3-3：3→4**。有意な差が出れば**2-2：4→5** | 中 | **必須** |
| 7 | 2-6、3-2 | 記録を学級・生徒に結び付け、番号変更時は保存領域と同期を切り替える。送信待ち処理が旧利用者の記録を新番号で送らないようにする。[app/web/src/store/records.ts:209](/Users/shun/Desktop/phonelab/app/web/src/store/records.ts:209)、[app/web/src/agent/sync.ts:41](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:41) | **3-2：3→4**、2-6改善の前提 | 中 | **必須** |
| 8 | 2-4、2-6 | 生徒認証から学級を確定し、回数をサーバ管理。説明解禁を対象実験と照合。`hold_codes`等を列挙型にし、`question_back`も検査。停止は原子的更新、409・429は縮退と区別する。[app/server/main.py:683](/Users/shun/Desktop/phonelab/app/server/main.py:683)、[app/server/agent/class_agent.py:103](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:103) | **各2→3～4** | 大 | **必須。全部無理でも認証・停止を優先** |
| 9 | 2-5 | 全APIを記録IDで関連付け、特徴量・検査結果・版・完全なハッシュを保存。未実装の「再検証」ボタンを外す。本文を含まない実Traceを添付する。[app/web/src/agent/sync.ts:12](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:12)、[app/web/src/App.tsx:242](/Users/shun/Desktop/phonelab/app/web/src/App.tsx:242) | **3→4** | 中 | **やる。KMS追加は後回し** |
| 10 | 1-2、1-4 | 教員1人と数人の利用者で、通常の測定教材との小規模比較を行う。完了時間・援助回数・次の予想の質を記録し、先生が実際に助かった場面を示す。[docs/personas.md:25](/Users/shun/Desktop/phonelab/docs/personas.md:25) | 条件次第で**各3→4** | 大 | **可能なら10/8まで。上位修正を圧迫しない範囲** |

## 4. 最初の1分で抱く疑問・突っ込み5つ

| 疑問・突っ込み | 現状の答えと所在 |
|---|---|
| **① 測定アプリとワークシートでは駄目なのか？** | 自由文からの実験選択・保留後の提案という説明はある。ただし既存手段より学習や授業進行が改善した比較結果は**無い**。[docs/idea-sheet.md:17](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:17) |
| **② AIが次を選ぶと言うが、残り1つを出しているだけでは？** | 音・エネルギーではその疑問が当たる。意味のある判断は「ふり返りに戻す」「保留からどう回復するか」。しかし前者の再判断は未完成で、実評価にも食い違い・説明なしで`next`に進む例がある。[app/server/agent/catalog.py:54](/Users/shun/Desktop/phonelab/app/server/agent/catalog.py:54)、[docs/eval/2026-10-02.json:1749](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:1749) |
| **③ 二本が一致すれば、その測定は信用できるのか？** | **保証できない。** 音の倍音探索は最初の推定値に依存する。独立な基準との誤差、別音源を誤採用する率の実測は**無い**。[app/web/src/measure/pitch.ts:65](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:65)、[docs/device-check.md:36](/Users/shun/Desktop/phonelab/docs/device-check.md:36) |
| **④ 本当に止まるか。測る前に答えを聞けないか？** | 正規の学級付き操作には停止検査がある。しかし学級コード省略時の停止・説明ゲート、既に進行中の呼び出し、通信断を含む保証にはならない。画面のポーリング周期も「2秒以内の停止保証」とは異なる。[app/server/guards.py:70](/Users/shun/Desktop/phonelab/app/server/guards.py:70)、[app/server/main.py:683](/Users/shun/Desktop/phonelab/app/server/main.py:683)、[app/web/src/App.tsx:62](/Users/shun/Desktop/phonelab/app/web/src/App.tsx:62) |
| **⑤ 31人で授業が成立し、15円で済むのか？** | 31人の運用実績は**無い**。15円は指定回数のGemini試算。記録APIには共有IPで衝突する上限も残る。[flow.md:360](/Users/shun/Desktop/phonelab/flow.md:360)、[docs/eval.md:84](/Users/shun/Desktop/phonelab/docs/eval.md:84)、[app/server/routes_class.py:35](/Users/shun/Desktop/phonelab/app/server/routes_class.py:35) |

## 5. 提出物の完成度チェックと欠けているもの

| 提出物 | 状態 | 残っていること・根拠 |
|---|---|---|
| GitHubリポジトリ・App連携・デフォルトブランチ | **未完了** | リポジトリはあるがApp連携は未。評価対象の`feat/agent-loop`を審査対象のデフォルトブランチに反映する工程も必要。[flow.md:189](/Users/shun/Desktop/phonelab/flow.md:189)、[flow.md:131](/Users/shun/Desktop/phonelab/flow.md:131) |
| デプロイURL・テストアカウント・サンプル | **一部完了** | URLと認証手順はある。追加機能とサンプルは未デプロイの記録。必要env・IAMを反映し、提出版と一致させる。[README.md:15](/Users/shun/Desktop/phonelab/README.md:15)、[flow.md:323](/Users/shun/Desktop/phonelab/flow.md:323) |
| 説明文 | **下書きのみ** | 未実装の署名・提案承認などを除いて最終化。数字の出典と対象集団を整理する。[flow.md:376](/Users/shun/Desktop/phonelab/flow.md:376)、[docs/idea-sheet.md:43](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:43) |
| アーキテクチャ図の画像 | **あり・修正必要** | PNGは存在し、未実装の脚注もある。ただし「停止中は全エージェントを走らせない」と読める図に対し、ClassAgentは意図的に停止中も動く。自己修正の適用範囲も明示したい。[docs/architecture-diagram.html:101](/Users/shun/Desktop/phonelab/docs/architecture-diagram.html:101)、[app/server/agent/runner.py:362](/Users/shun/Desktop/phonelab/app/server/agent/runner.py:362) |
| 3分のデモ動画・YouTube URL | **無し** | 台本のみ。撮影前に「ふり返り後の再判断」「2秒で全員の測定とAIが停止」の表現を実装に合わせる。[flow.md:375](/Users/shun/Desktop/phonelab/flow.md:375)、[docs/storyboard.md:18](/Users/shun/Desktop/phonelab/docs/storyboard.md:18)、[docs/storyboard.md:22](/Users/shun/Desktop/phonelab/docs/storyboard.md:22) |
| OSSライセンス・開発部分の構成説明 | **あり** | MIT、第三者ライセンス一覧、開発範囲の説明がある。[README.md:80](/Users/shun/Desktop/phonelab/README.md:80)、[README.md:172](/Users/shun/Desktop/phonelab/README.md:172) |
| 実機検証結果 | **無し** | 手順書はあるが結果未提出。得点は3-8で扱った。動画の主役が実際に成立するかを確定する前提作業。[flow.md:358](/Users/shun/Desktop/phonelab/flow.md:358) |

**10/13までの優先順位は、測定判定と統制の穴を直し、実機で一授業の流れを成立させ、それを提出版・説明文・動画で一致させることです。** 現在のスコープ削減方針どおり、KMS署名、実験追加、ClassAgentの操作機能は後回しでよいです。[flow.md:412](/Users/shun/Desktop/phonelab/flow.md:412)