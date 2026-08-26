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
const profile = await fs.promises.mkdtemp(path.join(os.tmpdir(), "niu-idle-"));
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
  try { const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) }); const list = await res.json(); target = list.find((t) => t.type === "page" && t.url.includes("index.html")); if (target) break; } catch {}
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
await sleep(400);
const expr = `(function(){
  var log=[];
  /* 场景A:完全无输入,像玩家进关后先发呆 */
  setTile && startLevel(0);
  GS.lives=5;
  for(var f=0;f<60*8;f++){
    update(1/60);
    if(f%20===0||GS.state!=="play")
      log.push("A f"+f+" st:"+GS.state+" x"+Math.round(PL.x)+" y"+Math.round(PL.y)+" dead:"+(!!PL.dead)+" inv:"+Math.round(PL.inv*10)/10+" t:"+Math.round(GS.time));
    if(GS.state!=="play") { log.push("A LEFT PLAY @"+f); break; }
  }
  /* 如果死了,看 __lastDie */
  if(window.__lastDie) log.push("A DIE:"+JSON.stringify(window.__lastDie));
  return log;
})()`;
console.log(JSON.stringify(await evaluate(expr), null, 1));
child.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
