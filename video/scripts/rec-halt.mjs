// 先生の PC で「全端末の測定を止める」を押し、測定中の生徒のスマホが止まるところを同時に録画する。最後に必ず解除する
import { writeFileSync } from "node:fs";
import { BASE, launch, MOTION, Recorder } from "./rec-lib.mjs";

const DIR = "/Users/shun/Desktop/phonelab/video/public/footage";
const SP = "/tmp/phonelab-rec";
const b = await launch();

// 生徒: 入場して、振り子の測定のカウントダウンまで進める
const sctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ja-JP" });
await sctx.addInitScript(MOTION);
const sp = await sctx.newPage();
await sp.goto(`${BASE}/me`);
await sp.getByLabel("学級コード").fill("DEMO-2026");
await sp.getByLabel("出席番号").fill("12");
await sp.getByRole("button", { name: "保存してトップへ" }).click();
const memo = sp.getByRole("button", { name: "メモした。トップへ" });
await memo.waitFor({ timeout: 5000 }).then(() => memo.click()).catch(() => {});
await sp.goto(`${BASE}/`);
await sp.getByText("振り子とエネルギー").first().click();
await sp.locator("textarea").first().fill("重いほうが、いちばん下で速くなると思う。重いと勢いがつきそうだから");
await sp.getByRole("button", { name: "ラボ先生に実験を考えてもらう" }).click();
await sp.waitForURL("**/plan", { timeout: 40000 });
await sp.getByRole("button", { name: "この実験でやってみる" }).click();
await sp.waitForURL("**/setup/**", { timeout: 10000 });
await sp.waitForTimeout(1000);

// 先生: 学級コードと PIN で開く
const tctx = await b.newContext({ viewport: { width: 1280, height: 864 }, deviceScaleFactor: 1, locale: "ja-JP" });
const tp = await tctx.newPage();
await tp.goto(`${BASE}/teacher`);
await tp.getByLabel("学級コード").fill("DEMO-2026");
await tp.getByLabel("教師 PIN").fill("1234");
const halt = tp.getByRole("button", { name: /全端末の測定を止める/ });
await halt.waitFor();
await tp.waitForFunction(() => !document.querySelector(".tbtn--halt")?.hasAttribute("disabled"), null, { timeout: 15000 });
await tp.waitForTimeout(6000);

const tr = new Recorder(tp, `${SP}/rec-halt-teacher`);
const sr = new Recorder(sp, `${SP}/rec-halt-phone`);
await Promise.all([tr.start(), sr.start()]);
const events = [];
const mark = (name) => events.push({ name, t: +tr.now().toFixed(2) });

// 生徒は測り始める（振り子は 3, 2, 1 のあと揺れる）
await sp.getByRole("button", { name: "準備できた、測る" }).click();
await sp.evaluate(() => { window.__swingAt = performance.now() + 4500; });
mark("student-start");
await tp.waitForTimeout(6500);
// 先生のカーソル（録画には映らないので、位置と時刻を残して動画側で描く）
const box = await halt.boundingBox();
events.push({ name: "button", x: box.x + box.width / 2, y: box.y + box.height / 2, w: box.width, h: box.height });
await tp.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
mark("click");
await halt.click();
await sp.waitForURL("**/halted", { timeout: 15000 }).catch(() => {});
mark("student-halted");
await tp.waitForTimeout(5000);
const tres = await tr.stop(`${DIR}/halt-teacher.mp4`);
const sres = await sr.stop(`${DIR}/halt-phone.mp4`);

// 必ず解除
await tp.getByRole("button", { name: /停止を解除する/ }).click();
await tp.waitForTimeout(1500);
const st = await (await fetch(`${BASE}/api/class/DEMO-2026`)).json();
writeFileSync(`${DIR}/halt.json`, JSON.stringify({ tres, sres, events, haltedAfterRelease: st.halted }, null, 2));
console.log(JSON.stringify({ tres, sres, events, haltedAfterRelease: st.halted }, null, 1));
console.log((await sp.locator("main").innerText()).slice(0, 300));
await b.close();
