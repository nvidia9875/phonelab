// 画面録画: CDP の screencast で JPEG を時刻つきで保存し、ffmpeg で 30fps の mp4 にする
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/** ブラウザ（無ければ Playwright の既定）。例: CHROME=/path/to/chrome-headless-shell */
export const SHELL = process.env.CHROME || undefined;
export const BASE = "http://localhost:5179";

export async function launch() {
  return chromium.launch({ executablePath: SHELL });
}

/** 振り子の動き（糸 0.8 m、15 cm 持ち上げて放す）。window.__swingAt（performance.now の ms）から揺れ始める */
export const MOTION = () => {
  const G = 9.81, L = 0.8, H = 0.15;
  const th0 = Math.acos(1 - H / L), wn = Math.sqrt(G / L);
  window.__swingAt = Infinity;
  if (window.DeviceMotionEvent) window.DeviceMotionEvent.requestPermission = async () => "granted";
  window.__motion = setInterval(() => {
    const s = (performance.now() - window.__swingAt) / 1000;
    const moving = s >= 0;
    const env = moving ? Math.exp(-0.03 * s) : 1;
    const th = moving ? th0 * Math.cos(wn * s) * env : th0;
    const dth = moving ? -th0 * wn * Math.sin(wn * s) * env : 0;
    const n = () => (Math.random() - 0.5) * 0.1;
    window.dispatchEvent(new DeviceMotionEvent("devicemotion", {
      accelerationIncludingGravity: { x: n(), y: n(), z: G * Math.cos(th) + L * dth * dth + n() },
      rotationRate: { alpha: n(), beta: (dth * 180) / Math.PI + n() * 10, gamma: n() },
      interval: 16,
    }));
  }, 16);
};

export class Recorder {
  constructor(page, dir) {
    this.page = page;
    this.dir = dir;
    this.frames = [];
  }
  async start() {
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", async (f) => {
      const i = this.frames.length;
      const file = `${this.dir}/${String(i).padStart(5, "0")}.jpg`;
      writeFileSync(file, Buffer.from(f.data, "base64"));
      this.frames.push({ file, ts: f.metadata.timestamp });
      await this.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    const vp = this.page.viewportSize();
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: vp.width * 2, maxHeight: vp.height * 2, everyNthFrame: 1 });
    this.t0 = Date.now() / 1000;
  }
  /** 録画の頭からの秒 */
  now() {
    return Date.now() / 1000 - this.t0;
  }
  async stop(out) {
    await this.cdp.send("Page.stopScreencast");
    await new Promise((r) => setTimeout(r, 300));
    const fr = this.frames;
    // 画面が変わらないと frame は来ない。最後の frame を終わりまで伸ばす
    const end = Date.now() / 1000;
    let list = "";
    // 頭: 録画開始〜最初の frame は最初の frame で埋める
    list += `file '${fr[0].file}'\nduration ${Math.max(0.001, fr[0].ts - this.t0).toFixed(4)}\n`;
    for (let i = 0; i < fr.length; i++) {
      const next = i + 1 < fr.length ? fr[i + 1].ts : end;
      list += `file '${fr[i].file}'\nduration ${Math.max(0.001, next - fr[i].ts).toFixed(4)}\n`;
    }
    list += `file '${fr[fr.length - 1].file}'\n`;
    writeFileSync(`${this.dir}/list.txt`, list);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${this.dir}/list.txt`, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "slow", out]);
    return { frames: fr.length, seconds: end - this.t0 };
  }
}
