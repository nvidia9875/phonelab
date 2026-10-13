止めるべき

本番 a93a86d と HEAD（effe484）を実関数で比較し、**安全な文を新たに止める退行を2件再現しました。**

1. **安全な予想がWeb・サーバとも却下されます。**  
   「お湯は使いません。常温の水を増やすと音が高くなると思う」  
   「お湯は入れず、常温の水の量だけ増やすと音が高くなると思う」  
   両方とも本番は通過、HEADは「熱いもの・火」で却下。「使いません」「入れず」が否定の除外対象にありません。[サーバ](/Users/shun/Desktop/phonelab/app/server/agent/policy.py:28)・[Web](/Users/shun/Desktop/phonelab/app/web/src/agent/stub.ts:57)

2. **安全な注意文が4役すべてで置換されます。**  
   「端末を落としたり、ぶつけたりしないように袋をしっかり結ぼう」  
   本番では通過。HEADではPlanner・Replanner・NextStep・Tutorの全出口で危険扱い。後続節の「しないように」が、列挙した動作全体の否定として認識されません。[出口判定](/Users/shun/Desktop/phonelab/app/server/agent/policy.py:65)

3. **熱湯の勧めの見逃しも残ります（本番にも存在）。**  
   「熱湯を入れたボトルをこぼさないように振ってみよう」は、読点がないだけで全4出口を通過。同じ節の注意表現で免除されます。さらに「熱湯をこぼさないようにボトルに入れて振ってみよう」は**Web・サーバの入口も通過**。「こぼさない」の「さない」が熱湯の打ち消しとして扱われます。[否定判定](/Users/shun/Desktop/phonelab/app/server/agent/policy.py:28)・[同一節の免除](/Users/shun/Desktop/phonelab/app/server/agent/policy.py:63)

通常の7実験（高さ・重さ・糸の長さ・はじく強さ・震える長さ・張り・水量）の予想7例と4役の応答28例は、両版で全件通過。前回の3点の具体例も修正を確認しました。

pytestは198件成功。Webは実関数をメモリ上で比較し、Vitestは未実行。実LLM生成は未実施。ファイル変更なし。