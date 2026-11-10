/**
 * capture.mjs — 逐帧捕获场景动画（CDP）。
 * 一次启动浏览器，按固定步长推进 __hfStep，连续截帧。
 * 用法: node tools/capture.mjs <url> <outDir> <frames> [stepMs] [width] [height]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [url, outDir, framesArg, stepArg, wArg, hArg] = process.argv.slice(2);
const FRAMES = Number(framesArg || 60);
const STEP = Number(stepArg || 16.7);
const W = Number(wArg || 1600);
const H = Number(hArg || 900);
const PORT = 9333;
fs.mkdirSync(outDir, { recursive: true });

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ud = path.join(process.env.TEMP, "cap-profile-" + Date.now());
const edge = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${ud}`,
  `--window-size=${W},${H}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
      if (page && page.webSocketDebuggerUrl) return page;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("devtools 未就绪");
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const n = ++id;
  pending.set(n, res);
  ws.send(JSON.stringify({ id: n, method, params }));
});

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url });
await sleep(2500);

// 冻结场景并推进到稳定状态
await send("Runtime.evaluate", {
  expression: `(() => { const f = document.querySelector('iframe'); return !!(f && f.contentWindow.__hfStep); })()`,
  returnByValue: true,
});

const step = async (ms) => send("Runtime.evaluate", {
  expression: `(() => { const f = document.querySelector('iframe'); if (!f) return 'no-frame'; return f.contentWindow.__hfStep(${ms}); })()`,
  returnByValue: true,
});

const shot = async (file) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (!r.result || !r.result.data) throw new Error("截图失败");
  fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
};

// 预热 1.5 秒，让页面进入稳定动画段
for (let i = 0; i < 90; i++) await step(STEP);

const t0 = Date.now();
for (let i = 0; i < FRAMES; i++) {
  await step(STEP);
  await shot(path.join(outDir, `f${String(i).padStart(4, "0")}.png`));
  if (i % 20 === 0) console.log(`  ${i}/${FRAMES}`);
}
console.log(`完成 ${FRAMES} 帧，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s，输出 ${outDir}`);

ws.close();
edge.kill();
