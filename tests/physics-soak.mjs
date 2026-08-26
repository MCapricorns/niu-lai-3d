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
const profile = await fs.promises.mkdtemp(path.join(os.tmpdir(), "niu-soak-"));
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
  if (out.result?.exceptionDetails) console.log("EXC:", JSON.stringify(out.result.exceptionDetails.exception?.description || "").slice(0, 400));
  return out.result?.result?.value;
}
for (let i = 0; i < 80; i++) {
  if ((await evaluate("document.readyState==='complete'&&typeof GS!=='undefined'")) === true) break;
  await sleep(200);
}
await sleep(300);

/* 每关:玩家站小老板左侧触发AI,跑25秒;统计嵌墙/小老板坠坑消失 */
const expr = `(function(){
  var out=[];
  var HARD=[1,2,5,7,13,14,17];
  for(var li=0;li<20;li++){
    startLevel(li);
    GS.lives=99;
    var mb=null;
    for(var i=0;i<ents.length;i++) if(ents[i].k==="miniboss") mb=ents[i];
    if(mb){ PL.x=mb.x-220; PL.y=11*T-36-0.01; PL.vx=0; PL.vy=0; }
    var embeds=0, mbGone=false, style=mb?mb.style:"-", firesN=0;
    var firstEmb=null, goneAt=-1, gonePos=null;
    for(var f=0;f<1500&&!mbGone;f++){
      update(1/60);
      for(var j=0;j<ents.length;j++){
        var e=ents[j];
        if(e.gone||e.dead||e.k==="move") continue;
        var x0=Math.floor((e.x+3)/T), x1=Math.floor((e.x+e.w-3)/T);
        var y0=Math.floor((e.y+3)/T), y1=Math.floor((e.y+e.h-3)/T);
        outer:
        for(var tx=x0;tx<=x1;tx++) for(var ty=y0;ty<=y1;ty++){
          if(HARD.indexOf(tileAt(tx,ty))>=0){
            embeds++;
            if(!firstEmb) firstEmb={k:e.k,x:Math.round(e.x/T),y:Math.round(e.y/T),tx:tx,ty:ty,f:f};
            break outer;
          }
        }
      }
      firesN=fires.length;
      if(mb&&mb.gone){ mbGone=true; goneAt=f; gonePos={x:Math.round(mb.x/T),y:Math.round(mb.y/T)}; }
    }
    out.push({li:li,style:style,embeds:embeds,mbGone:mbGone,fires:firesN,firstEmb:firstEmb,goneAt:goneAt,gonePos:gonePos});
  }
  return out;
})()`;
const rows = await evaluate(expr);
let fails = 0;
(rows || []).forEach((r) => {
  const bad = r.embeds > 0 || r.mbGone;
  if (bad) fails++;
  console.log(
    `[${String(r.li).padStart(2)}] ${String(r.style).padEnd(8)} embeds=${r.embeds} mbGone=${r.mbGone}` +
      (r.mbGone ? ` goneAt=${r.goneAt} pos=${JSON.stringify(r.gonePos)}` : "") +
      (r.firstEmb ? ` firstEmb=${JSON.stringify(r.firstEmb)}` : "") +
      (bad ? "  <<< FAIL" : ""),
  );
});
console.log(fails ? `\nFAILS: ${fails}` : "\nPHYSICS SOAK: ALL CLEAN");
child.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fails ? 1 : 0);
