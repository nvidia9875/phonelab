// 振り子（重さ）の流れを本物のアプリで録画する。センサーは MOTION で再現（袋の中で揺れたときの値）
import { writeFileSync } from "node:fs";
import { BASE, launch, MOTION, Recorder } from "./rec-lib.mjs";

const OUT = process.argv[2] ?? "/Users/shun/Desktop/phonelab/video/public/footage/pendulum-screen.mp4";
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ja-JP" });
await ctx.addInitScript(MOTION);
const page = await ctx.newPage();
const events = [];

await page.goto(`${BASE}/me`);
await page.getByLabel("学級コード").fill("DEMO-2026");
await page.getByLabel("出席番号").fill(String(30 + Math.floor(Math.random() * 9)));
await page.getByRole("button", { name: "保存してトップへ" }).click();
const memo = page.getByRole("button", { name: "メモした。トップへ" });
await memo.waitFor({ timeout: 5000 }).then(() => memo.click()).catch(() => {});
await page.goto(`${BASE}/`);
await page.waitForTimeout(800);

const rec = new Recorder(page, "/tmp/phonelab-rec/rec-pendulum");
await rec.start();
const mark = (name) => events.push({ name, t: +rec.now().toFixed(2) });
await page.waitForTimeout(1200);
await page.getByText("振り子とエネルギー").first().click();
mark("theme");
await page.waitForTimeout(1200);
await page.locator("textarea").first().pressSequentially("重いほうが、いちばん下で速くなると思う", { delay: 110 });
await page.waitForTimeout(500);
await page.getByRole("button", { name: "ラボ先生に実験を考えてもらう" }).click();
mark("ask1");
await page.waitForTimeout(6000);
if (!page.url().endsWith("/plan")) {
  mark("question-back");
  await page.waitForTimeout(2500);
  const ta = page.locator("textarea").first();
  await ta.click();
  await page.keyboard.press("End");
  await ta.pressSequentially("。重いと勢いがつきそうだから", { delay: 110 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "ラボ先生に実験を考えてもらう" }).click();
  mark("ask2");
  await page.waitForURL("**/plan", { timeout: 30000 });
}
mark("plan");
await page.waitForTimeout(3500);
await page.mouse.wheel(0, 500);
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "この実験でやってみる" }).click();
mark("go");

for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(800);
  const url = page.url();
  if (url.endsWith("/result")) break;
  if (url.includes("/setup/")) {
    await page.waitForTimeout(1800);
    await page.evaluate(() => { window.__swingAt = Infinity; });
    await page.getByRole("button", { name: "準備できた、測る" }).click();
    mark(`measure-${url.slice(-1)}`);
    const wall = rec.now() + 4.5;
    await page.evaluate(() => { window.__swingAt = performance.now() + 4500; });
    events.push({ name: `release-${url.slice(-1)}`, t: +wall.toFixed(2) });
    await page.getByText(/測定が終わりました/).first().waitFor({ timeout: 30000 });
    mark(`done-${url.slice(-1)}`);
    await page.waitForTimeout(2500);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(1500);
    const next = page.getByRole("button", { name: "次へ" });
    if (await next.count()) await next.click();
    else break;
  }
}
mark("result");
await page.waitForTimeout(2500);
await page.mouse.wheel(0, 500);
await page.waitForTimeout(2500);
await page.mouse.wheel(0, -500);
await page.waitForTimeout(1500);
const txt = await page.locator("main").innerText();
const r = await rec.stop(OUT);
writeFileSync(OUT.replace(/\.mp4$/, ".json"), JSON.stringify({ ...r, events, result: txt.slice(0, 600) }, null, 2));
console.log(JSON.stringify({ ...r, events }, null, 1));
console.log(txt.slice(0, 400));
await b.close();
