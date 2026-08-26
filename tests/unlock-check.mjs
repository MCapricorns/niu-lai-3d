import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((c) => fs.existsSync(c));
async function freePort() { const p = http.createServer(); await new Promise((r) => p.listen(0, "127.0.0.1", r)); const port = p.address().port; await new Promise((r) => p.close(r)); return port; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const webPort = await freePort();
const debugPort = await freePort();
const profile = await fs.promises.mkdtemp(path.join(os.tmpdir(), "niu-unlock-"));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const server = http.createServer((req, res) => {
  const rel0 = (req.url || "/").split("?")[0];
  const rel = rel0 === "/" ? "index.html" : decodeURIComponent(rel0.slice(1));
  const file = path.resolve(root, rel);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(webPort, "127.0.0.1", r));
const child = spawn(edge, ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--use-angle=swiftshader", `http://127.0.0.1:${webPort}/index.html`], { stdio: "ignore" });
let target;
for (let i = 0; i < 100; i++) {
  try { const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) }); const list = await res.json(); target = list.find((t) => t.type === "page"); if (target) break; } catch {}
  await sleep(100);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res2, rej) => { ws.addEventListener("open", res2); ws.addEventListener("error", rej); });
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
function send(method, params = {}) { return new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) {
  const out = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (out.result?.exceptionDetails) console.log("EXC:", JSON.stringify(out.result.exceptionDetails.exception?.description || "").slice(0, 300));
  return out.result?.result?.value;
}
for (let i = 0; i < 80; i++) {
  if ((await evaluate("document.readyState==='complete'&&typeof GS!=='undefined'")) === true) break;
  await sleep(200);
}
const r1 = await evaluate(`({
  ver: localStorage.getItem("niu_ver"),
  best: localStorage.getItem("niu_best"),
  u0: isUnlocked(0), u1: isUnlocked(1), u5: isUnlocked(5),
  c0: isCleared(0), c19: isCleared(19)
})`);
console.log("fresh boot:", JSON.stringify(r1));
/* 预填老版本分数 → 刷新 → 应被迁移清除 */
await evaluate(`localStorage.clear(); localStorage.setItem("niu_best","99999"); localStorage.setItem("niu_best_lv3","8888"); localStorage.setItem("niu_best_lv5","777");`);
await send("Page.reload");
await sleep(1200);
for (let i = 0; i < 40; i++) {
  if ((await evaluate("typeof GS!=='undefined'")) === true) break;
  await sleep(200);
}
await sleep(400);
const r2 = await evaluate(`({
  ver: localStorage.getItem("niu_ver"),
  best: localStorage.getItem("niu_best"),
  lv3: localStorage.getItem("niu_best_lv3"),
  clear: localStorage.getItem("niu_clear"),
  u0: isUnlocked(0), u1: isUnlocked(1), u5: isUnlocked(5)
})`);
console.log("after old-save reload:", JSON.stringify(r2));
/* 模拟通关:标记第1-4关 → 第5关应解锁,第6关仍锁 */
await evaluate(`(function(){ var s="11110"+new Array(15).join("0"); localStorage.setItem("niu_clear",s); })()`);
const r3 = await evaluate(`({
  u4: isUnlocked(4), u5: isUnlocked(5),
  c4: isCleared(4)
})`);
console.log("after clear 0-3:", JSON.stringify(r3));
child.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
