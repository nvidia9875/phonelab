## 1. 観点ごとの採点

**総合 62.3 / 100。前回57.4点から＋4.9点。現時点では入賞推薦しません。**

修正は確認できました。ただし、「サーバに保存する」と「サーバが強制する」、「保留と表示する」と「保留として扱う」、「評価結果を保存する」と「評価が妥当である」の間に、まだ差があります。

対象は `feat/agent-loop` の現状。ファイル変更・本番アクセス・Geminiの再実行はしていません。既存Pythonテストは書き込みを抑止して実行し、**135件すべて成功**。加えて、既存コードをメモリ内で呼ぶ局所確認を行いました。Webテスト全体は未実行です。実機未検証は主に **3-8**、動画・説明文・GitHub連携の未完成は **5** で扱い、欠品だけで重複減点していません。

**軸1：課題の新規性と解決策の有効性**

| 観点 | 前回→今回 | 根拠・改善の確認 | 5点に届かない理由 |
|---|---:|---|---|
| 1-1 課題の実在と規模 | **3→3** | 数字と出典はある。[docs/personas.md:77](/Users/shun/Desktop/phonelab/docs/personas.md:77) | 前回から未解消。小中合計の支援事業配置実績から「約9割の中学に助手がいない」への換算根拠が閉じていない。2012年度の66%と高校の学力指標を、現在の中学向け課題に接続する説明も弱い。[docs/idea-sheet.md:12](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:12) |
| 1-2 未解決であること | **3→3** | LMSと測定アプリとの差分は具体的。[docs/idea-sheet.md:17](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:17) | 最も近い比較対象は「測定アプリ＋予想ワークシート＋先生の巡視」。それに対する援助回数・完了時間・学習成果の比較がない。機能の組み合わせとしての差別化にとどまる。 |
| 1-3 課題の核心への有効性 | **3→3** | 不確かさ過大を「変わらない」と断定する問題は部分修正。`undecided`を返す。[app/web/src/agent/stub.ts:120](/Users/shun/Desktop/phonelab/app/web/src/agent/stub.ts:120) | **保留が状態管理まで届いていない。** 判定不能でも`status: "judged"`となり、教員画面では「次の予測」。介入対象の保留から外れる。「先生が一人」に効く核心が未完成。[app/web/src/flow/useFlow.ts:330](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:330)、[app/web/src/screens/dashboard.ts:17](/Users/shun/Desktop/phonelab/app/web/src/screens/dashboard.ts:17) |
| 1-4 実質的価値・導入しやすさ | **3→3** | 学校端末・班で順番に測る運用は具体的。[docs/personas.md:43](/Users/shun/Desktop/phonelab/docs/personas.md:43) | 実校への学級発行・配布・復元の導線が弱い。学級作成はデモ初期化が中心で、家庭での記録再開APIも見送り。新しい学校が自力で導入できる形ではない。[app/server/classroom.py:335](/Users/shun/Desktop/phonelab/app/server/classroom.py:335)、[flow.md:414](/Users/shun/Desktop/phonelab/flow.md:414) |
| 1-5 伝わり方 | **3→4** | KMS署名・提案承認の過大表現を修正し、未実装を明記。前回指摘は大きく改善。[docs/idea-sheet.md:43](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:43)、[docs/architecture-diagram.html:150](/Users/shun/Desktop/phonelab/docs/architecture-diagram.html:150) | 冒頭は強いが、説明の精度に穴が残る。READMEの「問い返しの2回目を含む」応答時間と、実際の計測方法が一致しない。最新修正が未デプロイなのに「本番で動く」の表にも混在。[README.md:75](/Users/shun/Desktop/phonelab/README.md:75)、[flow.md:326](/Users/shun/Desktop/phonelab/flow.md:326) |

**軸2：自律性・エージェントらしさ**

| 観点 | 前回→今回 | 根拠・改善の確認 | 5点に届かない理由 |
|---|---:|---|---|
| 2-1 状況判断・自律行動 | **3→4** | 結果・説明の変化を`basis`で検出し、NextStepを再取得する修正とテストがある。[app/web/src/flow/nextStep.ts:16](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:16)、[app/web/src/flow/nextStep.test.ts:102](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.test.ts:102) | **チャット側で書いた考えは再判断に反映されない。** `basis`は`rec.explain`だけを見て、チャットは別の`chat.thinking`を更新する。画面をまたいだ「ふり返ったので次へ」のループに穴がある。[app/web/src/flow/useFlow.ts:407](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:407) |
| 2-2 単純な自動化を超えるか | **4→4** | 自由文理解をLLM、測定判定を決定論にする分担は良い。規則との比較も追加。[docs/eval.md:21](/Users/shun/Desktop/phonelab/docs/eval.md:21) | **比較相手が実際の端末内規則より弱い。** 評価は常に先頭を選ぶ16/25だが、実装は変数を読んで選ぶ。同じ入力で既存`choosePlan`を呼ぶと **23/25**。Geminiの25/25は優位だが、主張する改善幅は過大。[app/scripts/eval_agent.py:290](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:290)、[app/web/src/agent/stub.ts:82](/Users/shun/Desktop/phonelab/app/web/src/agent/stub.ts:82) |
| 2-3 ツール・複数エージェント | **3→3** | ClassAgentの2ツール、回数・番号制限は実装済み。[app/server/agent/class_agent.py:52](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:52)、[app/server/agent/policy_plugin.py:219](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:219) | 5役は主に独立APIから呼ばれる。ClassAgentは事前生成された要約を読み、助言して終了。教師の介入後の変化を観察し、生徒側の支援へ戻す協調はない。[app/server/routes_insight.py:102](/Users/shun/Desktop/phonelab/app/server/routes_insight.py:102) |
| 2-4 人間の関与・上限・停止 | **2→3** | 承認に加え、停止と許可の部分更新、認証情報付きのサーバカウントを追加。前回の文書全体上書き問題は解消。[app/server/classroom.py:232](/Users/shun/Desktop/phonelab/app/server/classroom.py:232)、[app/tests/test_class_api.py:372](/Users/shun/Desktop/phonelab/app/tests/test_class_api.py:372) | **カウントは強制境界になっていない。** 学級・番号を付けても`secret`などを省けば自己申告に戻る。さらに「読む→モデル実行→加算」なので並行要求は同じ残枠を使え、タイムアウト時は加算されない。[app/server/guards.py:126](/Users/shun/Desktop/phonelab/app/server/guards.py:126)、[app/server/main.py:357](/Users/shun/Desktop/phonelab/app/server/main.py:357) |
| 2-5 可観測性 | **3→3** | 本文収集禁止を`setdefault`から強制上書きへ修正。判断の跡もある。[app/server/telemetry.py:21](/Users/shun/Desktop/phonelab/app/server/telemetry.py:21)、[app/web/src/screens/Plan.tsx:47](/Users/shun/Desktop/phonelab/app/web/src/screens/Plan.tsx:47) | 記録要約のtrace IDは依然Plannerだけ。特徴量・完全な検査結果・完全なハッシュも送らず、開発者が一連の判断を再構成できない。署名欄はハッシュ自体を省略保存。[app/web/src/agent/sync.ts:12](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:12)、[app/web/src/flow/useFlow.ts:394](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:394) |
| 2-6 セキュリティ | **2→2** | `question_back`検査、保留コードの列挙型、説明解禁時の実験照合は改善。[app/server/agent/policy_plugin.py:277](/Users/shun/Desktop/phonelab/app/server/agent/policy_plugin.py:277)、[app/server/main.py:114](/Users/shun/Desktop/phonelab/app/server/main.py:114) | **PIN総当たり対策が成立していない。** 正誤確認が上限確認より先なので、上限後も正しい候補だけ成功する。またClassAgentへ任意の`theme_id`・`stage`・イベント種類が届く。保留コードだけ閉じても間接注入経路は残る。[app/server/routes_class.py:205](/Users/shun/Desktop/phonelab/app/server/routes_class.py:205)、[app/server/agent/class_agent.py:117](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:117) |
| 2-7 信頼できる動作 | **3→3** | Plannerの409・429区別、自己修正、Gemini一時エラー再試行は改善。[app/web/src/flow/useFlow.ts:180](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:180)、[app/server/agent/models.py:12](/Users/shun/Desktop/phonelab/app/server/agent/models.py:12) | 全経路への適用は未完。Replannerは全例外を`null`にし、NextStepは429でも通常の縮退。さらに実モデルの学級見立てに人数誤りがあるが検査を通過している。[app/web/src/flow/useFlow.ts:224](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:224)、[app/web/src/flow/nextStep.ts:74](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:74)、[docs/eval/2026-10-02.json:2617](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:2617) |

**軸3：実装品質と拡張性**

| 観点 | 前回→今回 | 根拠・改善の確認 | 5点に届かない理由 |
|---|---:|---|---|
| 3-1 動くこと・非モック | **3→3** | X1〜X7のデプロイrevisionが記録され、試用手順・サンプルもある。[flow.md:323](/Users/shun/Desktop/phonelab/flow.md:323)、[README.md:15](/Users/shun/Desktop/phonelab/README.md:15) | 前回の「追加機能全体が未デプロイ」は解消。ただし**今回採点している修正版は未デプロイ**。審査員が触る版と修正済みコードが一致していない。[flow.md:326](/Users/shun/Desktop/phonelab/flow.md:326) |
| 3-2 コード品質 | **3→3** | 所有者付き記録、同期直前の所有者再確認と回帰テストを追加。以前の番号への混入問題は大きく改善。[app/web/src/agent/sync.ts:40](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:40)、[app/web/src/agent/sync.test.ts:81](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.test.ts:81) | **所有者分離は一覧・同期に限定。** `recordById`は全記録を返し、記録URLも所有者確認なし。共有端末で以前のURLを開くと他の番号の記録を表示できる。状態・認可の不変条件が入口ごとに散らばっている。[app/web/src/store/records.ts:314](/Users/shun/Desktop/phonelab/app/web/src/store/records.ts:314)、[app/web/src/App.tsx:238](/Users/shun/Desktop/phonelab/app/web/src/App.tsx:238) |
| 3-3 テストと評価 | **3→3** | Python135件成功。Armorを評価Runnerへ渡し、変数・方向・実験選択を分離し、注入応答も保存するようになった。[app/scripts/eval_agent.py:195](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:195)、[app/scripts/eval_agent.py:457](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:457) | 比較対象の不一致、2回目の待ち時間の計上漏れ、ClassAgentの事実誤り未採点が残る。漏えい判定も実装と同系統の語句検出で、独立した意味評価ではない。[app/scripts/eval_agent.py:59](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:59)、[app/scripts/eval_agent.py:142](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:142) |
| 3-4 Google Cloud活用 | **4→4** | ADK Plugin、Vertex AI、Firestore、Trace、Armorには用途がある。Firestore部分更新も適切。[app/server/agent/runner.py:164](/Users/shun/Desktop/phonelab/app/server/agent/runner.py:164)、[app/server/classroom.py:232](/Users/shun/Desktop/phonelab/app/server/classroom.py:232) | サービス数は十分。足りないのは認証・実行枠・記録の整合性をCloud側で保証すること。加算の原子性はあるが、実行許可との一体化はない。[app/server/classroom.py:301](/Users/shun/Desktop/phonelab/app/server/classroom.py:301) |
| 3-5 拡張性 | **3→4** | 前回欠けていたPython／TypeScript間のID・検査コード契約テストを追加。測定プロファイルの分離もある。[app/tests/test_contract.py:19](/Users/shun/Desktop/phonelab/app/tests/test_contract.py:19)、[app/web/src/measure/features.ts:55](/Users/shun/Desktop/phonelab/app/web/src/measure/features.ts:55) | 二重管理は残り、契約は主に文字列集合。実験の条件・変数・単位・対応関係まで同一性を保証せず、新テーマ追加時の変更箇所が複数言語にまたがる。 |
| 3-6 運用性 | **2→3** | 記録送信を認証済み生徒ごとに制限し、共有IPに40人分の枠を確保。31人×4送信のテストもある。[app/server/routes_class.py:35](/Users/shun/Desktop/phonelab/app/server/routes_class.py:35)、[app/tests/test_class_api.py:325](/Users/shun/Desktop/phonelab/app/tests/test_class_api.py:325) | これは逐次・メモリ上の確認であり、31人の通常授業の同時動作確認ではない。レート制限はインスタンス内、負荷試験は見送り。FirestoreとLLMを含む混雑時の証拠がない。[app/server/ratelimit.py:3](/Users/shun/Desktop/phonelab/app/server/ratelimit.py:3)、[flow.md:414](/Users/shun/Desktop/phonelab/flow.md:414) |
| 3-7 費用対効果 | **3→3** | 実測トークンに基づく約0.18円／実験、約18.94円／学級時を提示し、除外費用を明記。[docs/eval.md:86](/Users/shun/Desktop/phonelab/docs/eval.md:86) | 費用の説明は誠実になったが、Tutor・再計画・Armor・Firestore・Runを除く。授業総費用と上限費用は不明。評価JSONにも単価・為替の実行条件が残らず、費用再計算の再現性が弱い。[app/scripts/eval_agent.py:452](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:452) |
| 3-8 実機・現場での有効性 | **1→1** | 手順書はある。未実施も明記。[docs/device-check.md:29](/Users/shun/Desktop/phonelab/docs/device-check.md:29)、[flow.md:360](/Users/shun/Desktop/phonelab/flow.md:360) | 実機の誤差・正常時保留率・雑音時誤通過率の結果がない。倍音探索は最初の周波数推定に依存し、倍音の存在強度も判定していない。コードと合成波テストだけでは「信用できる測定器」を評価できない。[app/web/src/measure/pitch.ts:65](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:65) |

## 2. 軸ごとの点と総合

各軸は「観点平均×20」、総合は3軸の平均。丸め前の値で計算しています。

| 軸 | 観点点合計 | 前回 | 今回 | 変化 |
|---|---:|---:|---:|---:|
| 課題の新規性と解決策の有効性 | 16 / 25 | 60.0 | **64.0** | **＋4.0** |
| 自律性・エージェントらしさ | 22 / 35 | 57.1 | **62.9** | **＋5.7** |
| 実装品質と拡張性 | 24 / 40 | 55.0 | **60.0** | **＋5.0** |
| **総合** | | **57.4** | **62.3** | **＋4.9** |

加点は、**説明の正確化、NextStepの再判断、停止更新とサーバカウント、言語間契約テスト、共有IPでの記録送信改善**です。修正量ではなく、各観点で到達した水準を採点しました。同点の観点でも改善は認めています。

今回、特に重く見たのは次の4点です。

- **LLMの優位性は、現状の見せ方ほど大きくない。** 同じ25件で実際の端末内`choosePlan`を呼ぶと23件正解。Geminiとの差は9件ではなく2件でした。不正解は「消しゴムを足す」の質量解釈と英語の予想で、むしろここがLLMの価値を具体的に示せる場面です。「端末の縮退と同じ」とする比較表は修正が必要です。[app/web/src/agent/stub.ts:34](/Users/shun/Desktop/phonelab/app/web/src/agent/stub.ts:34)、[app/scripts/eval_agent.py:376](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:376)
- **「保留」と言いながら通常の結果として進む。** 判定不能を`judged`で保存し、NextStepには`consistent: null`を送ります。その指示は「食い違い・説明なし以外はnext」。保留表示、教師の介入対象、エージェントの次の行動が一致していません。[app/web/src/flow/useFlow.ts:330](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:330)、[app/server/agent/next_step.py:35](/Users/shun/Desktop/phonelab/app/server/agent/next_step.py:35)
- **学級の見立てが、評価データで既に数え違えている。** 入力は音の保留3人、エネルギーの保留1人。出力は「音の高さで4人が保留」。それでも`policy_fixed: false`で検査通過です。教師支援では、流暢さより人数と対象の正確さが先です。[app/scripts/eval_agent.py:256](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:256)、[docs/eval/2026-10-02.json:2617](/Users/shun/Desktop/phonelab/docs/eval/2026-10-02.json:2617)
- **PINの429は総当たりを止めていない。** メモリ内で上限2回にして確認すると、誤り3回→正しい候補の応答は`403, 403, 429, 200`。攻撃側が429を無視して候補を送り続けられる構造です。既存テストもこの挙動を成功条件にしています。[app/tests/test_class_api.py:272](/Users/shun/Desktop/phonelab/app/tests/test_class_api.py:272)

**入賞作と比べて足りないもの**

比較はリポジトリ内の受賞作整理に基づきます。各作品の外部実装・実証結果を再審査したものではありません。

| 比較対象 | PhoneLabに足りないもの |
|---|---|
| **Anatom-AI：学習を妨げる操作負担をAIが引き受ける** | PhoneLabにも自由文理解の価値はある。ただし音テーマは2実験なので、1つ終えると残りは1つ。次の実験選択を主役にするより、**曖昧な予想を正しく実験へ変える／保留から復帰させる**場面で、規則より助かることを示すべき。[context/06-past-winners.md:9](/Users/shun/Desktop/phonelab/context/06-past-winners.md:9)、[app/server/agent/catalog.py:78](/Users/shun/Desktop/phonelab/app/server/agent/catalog.py:78) |
| **BrickQuest：生成を物理検証へつなぐ** | PhoneLabは検査の実装がある一方、**検査が正しい測定を通し、誤った測定を止める証拠**がない。二本の値の一致を見せるだけでは、共通の誤りを除けない。[context/06-past-winners.md:12](/Users/shun/Desktop/phonelab/context/06-past-winners.md:12)、[app/web/src/measure/pitch.ts:109](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:109) |
| **フクシア：専門職の具体的な仕事を支援する** | 教師の画面はできた。しかし**巡視判断が何分短くなり、誰への支援を早められたか**がない。しかも現在の見立てに人数誤りがある。「先生に3行返す」から「先生が正しく動ける」への検証が必要。[context/06-past-winners.md:20](/Users/shun/Desktop/phonelab/context/06-past-winners.md:20)、[docs/eval.md:80](/Users/shun/Desktop/phonelab/docs/eval.md:80) |

## 3. 点が最も上がる改善10個

手間あたりの改善幅を目安に並べています。見込みは**観点点**で、修正と検証がそろった場合。関連項目は重なるため単純加算できません。

| 順位 | 観点 | 何をするか | 上がる見込み | 手間 | 10/13まで |
|---|---|---|---|---|---|
| 1 | 1-3、2-7 | **判定不能を全画面・保存・NextStepで統一する。** 教員の保留対象に入り、結論を前提とする次の行動へ進まないことを通しで確認。[app/web/src/flow/useFlow.ts:330](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:330) | 1-3 **3→4**。2-7改善の主要条件 | 中 | **必須、実機検証前** |
| 2 | 3-8 | **主役の音実験を3機種で測る。** 基準音・倍音の弱い音・隣の音を含め、誤差、正常時保留率、誤通過率を集計。調整に使わない条件でも確認。[docs/device-check.md:29](/Users/shun/Desktop/phonelab/docs/device-check.md:29) | **1→3〜4** | 中 | **最優先、10/5目標** |
| 3 | 3-2 | **記録の取得・表示・更新にも所有者確認を入れる。** 番号変更後に以前の記録URLを開く回帰確認を追加。[app/web/src/App.tsx:238](/Users/shun/Desktop/phonelab/app/web/src/App.tsx:238) | **3→4**の主要条件 | 小 | **必須** |
| 4 | 3-3、2-2 | **評価を正す。** 実際の`choosePlan`と比較し、問い返し2回分の遅延を記録。ClassAgentの人数・対象・優先順を採点し、誤りも失敗として掲載。[app/scripts/eval_agent.py:142](/Users/shun/Desktop/phonelab/app/scripts/eval_agent.py:142) | 3-3 **3→4**。2-2はまず4を裏付ける | 中 | **必須、説明文確定前** |
| 5 | 2-6 | **ClassAgentへ渡すメタデータを閉じる。** テーマ・実験・段階・イベント種類を検証し、未知文字列をそのまま渡さない。間接注入の実モデル評価を追加。[app/server/agent/class_agent.py:117](/Users/shun/Desktop/phonelab/app/server/agent/class_agent.py:117) | **2→3**の必要条件 | 小〜中 | **必須** |
| 6 | 2-4、2-6 | **認証と実行枠を強制する。** 学級付き要求は認証項目必須、枠は実行前に原子的に確保。PINは認証前の試行制限と認証済みセッションを分け、通常ポーリングを圧迫しない。[app/server/guards.py:126](/Users/shun/Desktop/phonelab/app/server/guards.py:126)、[app/server/routes_class.py:199](/Users/shun/Desktop/phonelab/app/server/routes_class.py:199) | 2-4 **3→4**、2-6 **2→3〜4** | 中〜大 | **必須** |
| 7 | 2-1、2-7 | **ふり返りと失敗処理を全経路で統一する。** `explain`と`chat.thinking`を再判断へ反映。全APIの409・429・403を通信断と区別し、古い応答で新しい判断を上書きしない。[app/web/src/flow/nextStep.ts:16](/Users/shun/Desktop/phonelab/app/web/src/flow/nextStep.ts:16)、[app/web/src/flow/useFlow.ts:224](/Users/shun/Desktop/phonelab/app/web/src/flow/useFlow.ts:224) | 2-7 **3→4**の主要条件 | 中 | **必須、撮影前** |
| 8 | 3-1、1-5 | **修正版をデプロイし、提出コミットとrevisionを対応付ける。** 正常・保留・却下・停止・再判断を確認し、README・図・台本・動画の主張をその版に統一。[flow.md:326](/Users/shun/Desktop/phonelab/flow.md:326) | 3-1 **3→4** | 小〜中 | **必須、撮影前と提出前** |
| 9 | 3-6、3-7 | **31人の通常授業イベント列を流す。** 記録送信だけでなく計画・問い返し・再計画・チャット・ポーリングを含め、429・同期欠落・待ち時間・総費用を測る。[app/tests/test_class_api.py:325](/Users/shun/Desktop/phonelab/app/tests/test_class_api.py:325) | 各 **3→4** | 中 | **やる。見送りを撤回したい** |
| 10 | 1-2、1-4 | **教員1人と数人で小規模比較を行う。** 測定教材だけの場合と、援助回数・所要時間・次の予想を比較。「先生が助かった具体的な場面」を記録。[docs/personas.md:25](/Users/shun/Desktop/phonelab/docs/personas.md:25) | 条件次第で各 **3→4** | 大 | **可能なら10/8まで** |

## 4. 審査員が最初の1分で抱きそうな疑問・突っ込み5つ

| 疑問・突っ込み | 現状の答えと所在 |
|---|---|
| **① 測定アプリとワークシートでは駄目なのか？** | 自由文からの実験選択・保留・教師支援という違いは説明されている。既存手段より学習や授業進行が改善した比較結果は**無い**。[docs/idea-sheet.md:17](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:17) |
| **② AIは本当に判断している？ 残り1つを出すだけでは？** | Plannerの言語理解には価値がある。一方、NextStepの行動分岐は明示された規則で、音テーマの残り候補は通常1つ。規則より優れた実験選択は25/25対23/25として説明すべき。[app/server/agent/next_step.py:35](/Users/shun/Desktop/phonelab/app/server/agent/next_step.py:35)、[app/web/src/agent/stub.ts:95](/Users/shun/Desktop/phonelab/app/web/src/agent/stub.ts:95) |
| **③ 二本が一致すれば正しい測定なのか？** | **保証できない。** 音の2本目は1本目の推定値に依存する。独立基準との誤差・別音源の誤採用率の実測は**無い**。[app/web/src/measure/pitch.ts:65](/Users/shun/Desktop/phonelab/app/web/src/measure/pitch.ts:65)、[docs/device-check.md:31](/Users/shun/Desktop/phonelab/docs/device-check.md:31) |
| **④ 先生の停止と回数制限は、抜け道なく効く？** | 正規の学級付き要求には停止確認があり、正常な認証付き要求は回数を保存する。しかし学級省略・認証項目省略・並行要求・通信断まで含む保証ではない。[app/server/guards.py:72](/Users/shun/Desktop/phonelab/app/server/guards.py:72)、[app/server/guards.py:126](/Users/shun/Desktop/phonelab/app/server/guards.py:126)、[app/web/src/App.tsx:74](/Users/shun/Desktop/phonelab/app/web/src/App.tsx:74) |
| **⑤ 31人で使えて、授業1回19円で済む？** | 共有IPで記録124回を送れるテストはある。31人の同時授業実績は**無い**。19円は指定回数のGemini分で、会話・再計画・他サービスは含まない。[app/tests/test_class_api.py:325](/Users/shun/Desktop/phonelab/app/tests/test_class_api.py:325)、[docs/eval.md:94](/Users/shun/Desktop/phonelab/docs/eval.md:94) |

## 5. 提出物の完成度のチェックで、欠けているもの

| 提出物 | 状態 | 残っているもの・根拠 |
|---|---|---|
| GitHubリポジトリ・App連携・デフォルトブランチ | **未完了** | リポジトリはあるがApp連携は未。`feat/agent-loop`から審査対象のデフォルトブランチへの反映も未。[flow.md:189](/Users/shun/Desktop/phonelab/flow.md:189)、[flow.md:323](/Users/shun/Desktop/phonelab/flow.md:323) |
| デプロイURL・テストアカウント・サンプル | **あり・提出版との一致が未確認** | URL、学級コード、PIN、サンプルはある。今回の修正版は未デプロイで、現状のREADMEをそのまま審査手順にはできない。[README.md:15](/Users/shun/Desktop/phonelab/README.md:15)、[flow.md:326](/Users/shun/Desktop/phonelab/flow.md:326) |
| 説明文 | **下書き** | 未実装範囲の表現は改善。数字の出典、規則比較、待ち時間の表現を直して最終化する必要がある。[docs/idea-sheet.md:4](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:4)、[docs/idea-sheet.md:75](/Users/shun/Desktop/phonelab/docs/idea-sheet.md:75) |
| アーキテクチャ図の画像 | **あり** | PNGとHTMLが存在し、停止中の見立て・自己修正の適用範囲を脚注で明示。ただし「先生に送る特徴量の要約」という説明に対し、同期payloadには構造化特徴量がない。送信内容の表現を合わせたい。[docs/architecture-diagram.html:64](/Users/shun/Desktop/phonelab/docs/architecture-diagram.html:64)、[app/web/src/agent/sync.ts:12](/Users/shun/Desktop/phonelab/app/web/src/agent/sync.ts:12) |
| 3分のデモ動画・YouTube URL | **無し** | 台本のみ。特に「ふり返り→再判断」「保留→教師の介入」「停止」を実機の通し操作で成立させてから撮影する必要がある。[docs/storyboard.md:18](/Users/shun/Desktop/phonelab/docs/storyboard.md:18)、[flow.md:377](/Users/shun/Desktop/phonelab/flow.md:377) |
| OSSライセンス・開発部分の構成説明 | **あり** | MIT、第三者ライセンス一覧、開発範囲の説明がある。[README.md:82](/Users/shun/Desktop/phonelab/README.md:82)、[README.md:181](/Users/shun/Desktop/phonelab/README.md:181) |
| 実機検証結果 | **無し** | 手順書だけ。3-8の得点を上げ、動画の主張を支えるために必要。[flow.md:360](/Users/shun/Desktop/phonelab/flow.md:360) |