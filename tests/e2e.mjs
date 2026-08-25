import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const edgeCandidates = [
  process.env.EDGE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/microsoft-edge",
  "/usr/bin/microsoft-edge-stable",
].filter(Boolean);
const edge = edgeCandidates.find((candidate) => fs.existsSync(candidate));
if (!edge) throw new Error("Microsoft Edge not found. Set EDGE_PATH to its executable.");

async function freePort() {
  const probe = http.createServer();
  await new Promise((resolve) => {
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => {
    probe.close(resolve);
  });
  return port;
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};
const CDP_OPEN_TIMEOUT_MS = 10_000;
const CDP_REQUEST_TIMEOUT_MS = 120_000;
const PROCESS_EXIT_TIMEOUT_MS = 5_000;

function childExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildExit(child, timeoutMs) {
  if (childExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(false);
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (!child || child.pid === undefined || childExited(child)) return;
  const gracefulExit = waitForChildExit(child, PROCESS_EXIT_TIMEOUT_MS);
  try {
    child.kill();
  } catch {}
  if (await gracefulExit) return;

  const forcedExit = waitForChildExit(child, PROCESS_EXIT_TIMEOUT_MS);
  child.kill("SIGKILL");
  if (!(await forcedExit)) throw new Error(`Edge process ${child.pid} did not exit after SIGKILL`);
}

async function createHarness() {
  let profile;
  let server;
  let child;
  let ws;
  let edgeFailure;
  let seq = 0;
  let closing = false;
  let cleanupPromise;
  const pending = new Map();

  function rejectPending(error) {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  }

  async function close() {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      closing = true;
      rejectPending(new Error("CDP harness is closing"));
      const errors = [];
      const attempt = async (operation) => {
        try {
          await operation();
        } catch (error) {
          errors.push(error);
        }
      };

      await attempt(async () => {
        if (ws?.readyState === 1) ws.close();
      });
      await attempt(async () => stopChild(child));
      await attempt(
        () =>
          new Promise((resolve, reject) => {
            if (!server?.listening) {
              resolve();
              return;
            }
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections?.();
          }),
      );
      await attempt(async () => {
        if (profile) {
          await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
      });

      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, "E2E harness cleanup failed");
    })();
    return cleanupPromise;
  }

  try {
    const webPort = await freePort();
    const debugPort = await freePort();
    profile = await fs.promises.mkdtemp(path.join(os.tmpdir(), "niu-edge-"));
    server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = urlPath === "/" ? "index.html" : urlPath.slice(1);
      const file = path.resolve(root, rel);
      if ((!file.startsWith(root + path.sep) && file !== root) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.removeListener("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(webPort, "127.0.0.1");
    });

    child = spawn(
      edge,
      [
        "--headless=new",
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        `http://127.0.0.1:${webPort}/index.html`,
      ],
      { stdio: "ignore" },
    );
    child.once("error", (error) => {
      if (!closing && !edgeFailure) edgeFailure = new Error(`Edge failed to start: ${error.message}`);
      rejectPending(edgeFailure || error);
    });
    child.once("exit", (code, signal) => {
      const error = new Error(`Edge exited unexpectedly (code=${code}, signal=${signal})`);
      if (!closing && !edgeFailure) edgeFailure = error;
      rejectPending(edgeFailure || error);
    });

    let target;
    for (let i = 0; i < 80; i++) {
      if (edgeFailure) throw edgeFailure;
      try {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, {
          signal: AbortSignal.timeout(1_000),
        });
        const list = await response.json();
        target = list.find((item) => item.type === "page" && item.url.includes("index.html"));
        if (target) break;
      } catch {
        if (edgeFailure) throw edgeFailure;
      }
      await sleep(100);
    }
    if (!target) throw edgeFailure || new Error("Edge DevTools target not found");

    ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.addEventListener("close", (event) => {
      rejectPending(new Error(`CDP WebSocket closed (code=${event.code}, reason=${event.reason || "none"})`));
    });
    ws.addEventListener("error", () => {
      rejectPending(new Error("CDP WebSocket connection failed"));
    });
    await new Promise((resolve, reject) => {
      const finish = (callback, value) => {
        clearTimeout(timer);
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        ws.removeEventListener("close", onClose);
        callback(value);
      };
      const onOpen = () => finish(resolve);
      const onError = () => finish(reject, new Error("CDP WebSocket failed to open"));
      const onClose = (event) => finish(reject, new Error(`CDP WebSocket closed before open (code=${event.code})`));
      const timer = setTimeout(
        () => finish(reject, new Error(`CDP WebSocket open timed out after ${CDP_OPEN_TIMEOUT_MS}ms`)),
        CDP_OPEN_TIMEOUT_MS,
      );
      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
      ws.addEventListener("close", onClose);
    });

    ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        rejectPending(new Error(`Invalid CDP response: ${error.message}`));
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) {
        request.reject(new Error(`CDP ${request.method} failed: ${JSON.stringify(message.error)}`));
      } else {
        request.resolve(message.result);
      }
    });

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        if (ws.readyState !== 1) {
          reject(new Error(`Cannot send CDP ${method}: WebSocket is not open`));
          return;
        }
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP ${method} timed out after ${CDP_REQUEST_TIMEOUT_MS}ms`));
        }, CDP_REQUEST_TIMEOUT_MS);
        pending.set(id, { method, resolve, reject, timer });
        try {
          ws.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      });
    }

    return { send, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "E2E harness setup and cleanup failed");
    }
    throw error;
  }
}

const { send, close } = await createHarness();
async function evaluate(expression) {
  const out = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (out.exceptionDetails)
    throw new Error(out.exceptionDetails.text + " " + JSON.stringify(out.exceptionDetails.exception?.description));
  return out.result.value;
}
let testFailure;
try {
  await send("Runtime.enable");
  for (let i = 0; i < 80; i++) {
    const ready = await evaluate(
      "document.readyState==='complete' && typeof GS!=='undefined' && typeof mCalf!=='undefined'",
    );
    if (ready) break;
    await sleep(100);
  }
  await sleep(500);
  const result = await evaluate(`(function(){
    var out={initial:{state:GS.state,three:THREE_OK,error:_errMsg,calf:!!mCalf,version:VER},levels:[],bugs:{}};
    for(var i=0;i<LEVELS.length;i++){
      _errMsg="";
      try{ loadLevel(i,true); GS.state="pause"; render(); out.levels.push({i:i,name:curLV.name,theme:curLV.theme,error:_errMsg,calf:!!mCalf,children:dynGroup.children.length}); }
      catch(e){ out.levels.push({i:i,name:LEVELS[i].name,thrown:String(e),error:_errMsg}); }
    }
    loadLevel(0,true); GS.state="pause";
    var big=coinsEnt.find(function(c){return c.big;});
    out.bugs.bigCoinPreserved=!!big;
    var q=-1; for(var qi=0;qi<tiles.length;qi++){if(tiles[qi]>=4&&tiles[qi]<=7){q=qi;break;}}
    if(q>=0){
      var qx=q%curLV.w,qy=Math.floor(q/curLV.w); bumpBlock(qx,qy);
      var wb=worldBlocks[qx+","+qy], mat=new THREE.Matrix4(), pos=new THREE.Vector3(), quat=new THREE.Quaternion(), sc=new THREE.Vector3();
      for(var n=0;n<20;n++) sync3D();
      if(wb&&wb.idx!==undefined){instBox.getMatrixAt(wb.idx,mat);mat.decompose(pos,quat,sc);out.bugs.bump={actualY:pos.y,expectedY:tileCenter(qx,qy)[1],delta:pos.y-tileCenter(qx,qy)[1]};}
    }
    out.bugs.lengths=LEVELS.map(function(lv){return lv.w;});
    var maxLavaRun=0;
    for(var li2=0;li2<LEVELS.length;li2++){
      var run=0;
      for(var lx2=0;lx2<LEVELS[li2].w;lx2++){
        if(LEVELS[li2].get(lx2,12)===11){run++;if(run>maxLavaRun)maxLavaRun=run;}else run=0;
      }
    }
    out.bugs.maxLavaRun=maxLavaRun;
    var crumbleResult=null;
    for(var cli=0;cli<LEVELS.length&&!crumbleResult;cli++){
      loadLevel(cli,true);
      for(var cti=0;cti<tiles.length;cti++) if(tiles[cti]===16){
        var ctx=cti%curLV.w,cty=Math.floor(cti/curLV.w);
        PL.x=ctx*T+6;PL.prevY=cty*T-PL.h-8;PL.y=cty*T-PL.h+1;PL.vy=120;
        collideY(PL);
        var armed=!!crumbles[ctx+","+cty]&&PL.ground;
        updateCrumbles(0.8);
        crumbleResult={level:cli,armed:armed,collapsed:tileAt(ctx,cty)===0};
        break;
      }
    }
    out.bugs.crumble=crumbleResult;
    loadLevel(0,true); GS.score=0;GS.sBonus=0;GS.time=300;GS.lives=5;PL.star=0;
    GS.combo=3;rewardComboMilestone(0,0);
    GS.combo=5;rewardComboMilestone(0,0);
    GS.combo=8;rewardComboMilestone(0,0);
    out.bugs.comboRewards={time:GS.time,score:GS.score,bonus:GS.sBonus,lives:GS.lives,star:PL.star};
    loadLevel(13,true); out.bugs.level42Lava=Array.from(tiles).filter(function(c){return c===11;}).length;
    out.bugs.level44Flag=LEVELS[15].flagX;
    loadLevel(0,true); setAutoMode(false); setAutoMode(true); GS.state="play"; PL.vx=100;PL.ground=true;_errMsg="";render();out.bugs.autoRenderError=_errMsg;
    out.bugs.autoIntroStarted=GS.hollerT>0&&!!GS.holler;
    for(var aiStep=0;aiStep<240;aiStep++) update(1/60);
    out.bugs.autoIntroEnded=GS.hollerT===0&&GS.holler===null;
    for(var aiWait=0;aiWait<900;aiWait++) update(1/60);
    out.bugs.autoIntroStayedOff=GS.hollerT===0&&GS.holler===null;
    shake=0; GS.state="pause"; render(); out.bugs.view={cameraZ:camera.position.z,fov:camera.fov,calfScale:mCalf.scale.x,calfZ:mCalf.position.z};
    setAutoMode(false);loadLevel(0,true);PL.face=-1;sync3D();out.bugs.leftFacing={rotation:mCalf.rotation.y,passed:Math.abs(Math.abs(mCalf.rotation.y)-Math.PI)<1e-6};
    itms=[];spawnItem("milk",10,8);sync3D();out.bugs.milkScale=itms[0].mesh.scale.x;
    setAutoMode(true);loadLevel(0,true);setTile(10,11,2);PL.x=10*T-PL.w-2;PL.y=11*T;PL.vx=400;PL.x+=20;collideX(PL);out.bugs.autoWall={x:PL.x,max:10*T-PL.w,blocked:PL.hitR&&PL.x<=10*T-PL.w};
    loadLevel(0,true);PL.safeX=8*T;PL.safeY=9*T;GS.time=0;keys.left=true;keys.jump=true;justPressed.jump=true;AIB.stuckT=0.7;AIB.lastX=123;AIB.cool=0.3;AIB.jH=0.4;AIB.mode="backoff";AIB.modeT=0.8;AIB.fails=3;die();out.bugs.autoRecovery={x:PL.x,y:PL.y,time:GS.time,atSafePoint:PL.x===PL.safeX&&PL.y===PL.safeY,keysCleared:!keys.left&&!keys.right&&!keys.run&&!keys.jump&&Object.keys(justPressed).length===0,aiReset:AIB.stuckT===0&&AIB.lastX===0&&AIB.cool===0&&AIB.jH===0&&AIB.mode==="run"&&AIB.modeT===0&&AIB.fails===0};
    loadLevel(0,true);setTile(10,12,10);PL.x=10*T;PL.prevY=420;PL.y=460;PL.vy=800;collideY(PL);out.bugs.spikeSurface={y:PL.y,expected:12*T-PL.h-0.01,ground:PL.ground};
    loadLevel(0,true);setTile(10,10,9);ents=[{k:"move",x:10*T-10,y:370,w:90,h:20}];PL.x=10*T;PL.prevY=314;PL.y=364;PL.vy=1000;collideY(PL);out.bugs.movingPlatformFirst={y:PL.y,expected:370-PL.h-0.01,onPlatform:PL._onPlat===ents[0]};
    function prepareVerticalSweep(){loadLevel(0,true);ents=[];for(var sweepY=3;sweepY<=12;sweepY++)setTile(10,sweepY,0);PL.x=10*T;PL.vx=0;PL.ground=false;PL.coyote=0;PL.jbuf=0;PL.springK=0;}
    function sweepDown(order){prepareVerticalSweep();for(var oi=0;oi<order.length;oi++)setTile(10,7+oi,order[oi]);PL.prevY=5*T;PL.y=10*T;PL.vy=1000;collideY(PL);return {y:PL.y,expected:7*T-PL.h-0.01,vy:PL.vy,ground:PL.ground,hitB:PL.hitB};}
    out.bugs.verticalPriority={solidFirst:sweepDown([2,9,12]),oneWayFirst:sweepDown([9,12,2]),springFirst:sweepDown([12,2,9])};
    var springLaunchBefore=PL.vy;aiControlOld(1/60);updatePlayer(1/60);out.bugs.springLaunch={before:springLaunchBefore,after:PL.vy,airborne:!PL.ground};
    prepareVerticalSweep();setTile(10,10,9);setTile(10,9,12);setTile(10,8,2);setTile(10,6,2);PL.prevY=11*T;PL.y=4*T;PL.vy=-1200;collideY(PL);out.bugs.upwardSweep={y:PL.y,expected:9*T+0.01,vy:PL.vy,hitT:PL.hitT,ground:PL.ground,springK:PL.springK};
    loadLevel(0,true);var springEntry=null;for(var wk in worldBlocks){if(!springEntry&&worldBlocks[wk].kind==="spring")springEntry={key:wk,wb:worldBlocks[wk]};}function boundsResult(entry){if(!entry)return null;var parts=entry.key.split(","),ty=+parts[1],bb=new THREE.Box3().setFromObject(entry.wb.g);return {bottom:bb.min.y,expectedBottom:worldY((ty+1)*T),top:bb.max.y,expectedTop:worldY(ty*T)};}out.bugs.springBounds=boundsResult(springEntry);loadLevel(1,true);var pipeEntry=null;for(var pk in worldBlocks){if(!pipeEntry&&worldBlocks[pk].kind==="pipe")pipeEntry={key:pk,wb:worldBlocks[pk]};}out.bugs.pipeBounds=boundsResult(pipeEntry);
    GS.state="play"; var goal=curLV.flagX*T+T/2; PL.x=goal-PL.w/2;PL.y=11*T;PL.vx=0;PL.vy=0;PL.ground=true;updatePlayer(1/60);out.bugs.goalState=GS.state;
    out.routes=[];
    var routeCool=0,routeHold=0,routeKeyState={};
    function routeKey(code,down){
      var gameDown=code==="ArrowRight"?keys.right:code==="ArrowLeft"?keys.left:code==="ShiftLeft"?keys.run:keys.jump;
      if(routeKeyState[code]===down&&(!down||gameDown))return;
      routeKeyState[code]=down;
      window.dispatchEvent(new KeyboardEvent(down?"keydown":"keyup",{code:code,bubbles:true,cancelable:true}));
    }
    function manualRouteControl(dt){
      routeCool-=dt;
      var p=PL,px=p.x+p.w/2,right=true,left=false;
      if(GS.boss&&!GS.boss.dead){
        var bx=GS.boss.x+GS.boss.w/2;
        right=bx>px+8;left=bx<px-8;
        if(px>92*T){right=false;left=true;}
        if(px<31*T){left=false;right=true;}
      }
      if(p.ground&&routeCool<=0){routeCool=0.16;routeHold=0.6;}
      if(routeHold>0)routeHold-=dt;
      routeKey("ArrowRight",right);routeKey("ArrowLeft",left);routeKey("ShiftLeft",true);routeKey("Space",routeHold>0);
    }
    function routeSeed(n){var s=n>>>0;Math.random=function(){s=(s+0x6D2B79F5)|0;var t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
    for(var routeLevel=0;routeLevel<LEVELS.length;routeLevel++){
      routeSeed(0x170000+routeLevel);setAutoMode(false); startLevel(routeLevel); resetAIControl(); routeCool=0;routeHold=0;routeKeyState={};
      var maxX=PL.x,deaths=0,prevState=GS.state,frames=0,passed=false,bossSeen=false;
      for(frames=0;frames<60*240;frames++){
        if(GS.state==="play"){ manualRouteControl(1/60); if(GS.boss)bossSeen=true; }
        update(1/60);
        if(PL.x>maxX)maxX=PL.x;
        if(GS.state==="dead"&&prevState!=="dead")deaths++;
        prevState=GS.state;
        if(routeLevel<19&&GS.state==="clear"){passed=true;break;}
        if(routeLevel===19&&(GS.state==="winseq"||GS.state==="win")){passed=true;break;}
        if(GS.state==="gameover")break;
      }
      routeKey("ArrowRight",false);routeKey("ArrowLeft",false);routeKey("ShiftLeft",false);routeKey("Space",false);
      var local=[];
      if(!passed){
        var center=Math.floor(PL.x/T);
        for(var mapX=Math.max(0,center-8);mapX<=Math.min(curLV.w-1,center+14);mapX++){
          var cells=[];for(var mapY=5;mapY<=12;mapY++){var cell=tileAt(mapX,mapY);if(cell)cells.push(mapY+":"+cell);}
          local.push(mapX+"["+cells.join(",")+"]");
        }
      }
      out.routes.push({level:routeLevel,name:LEVELS[routeLevel].name,passed:passed,state:GS.state,frames:frames,currentTile:Math.round(PL.x/T*10)/10,maxTile:Math.round(maxX/T*10)/10,deaths:deaths,bossSeen:bossSeen,aiMode:AIB.mode,local:local,error:_errMsg});
    }
    out.autoRoutes=[];
    for(var autoLevel=0;autoLevel<LEVELS.length;autoLevel++){
      routeSeed(0x171000+autoLevel);setAutoMode(false);setAutoMode(true);startLevel(autoLevel);GS.time=999;
      var autoFrames=0,autoPassed=false,autoMax=PL.x;
      for(autoFrames=0;autoFrames<60*240;autoFrames++){
        update(1/60);if(PL.x>autoMax)autoMax=PL.x;
        if(autoLevel<19&&GS.state==="clear"){autoPassed=true;break;}
        if(autoLevel===19&&(GS.state==="winseq"||GS.state==="win")){autoPassed=true;break;}
      }
      out.autoRoutes.push({level:autoLevel,name:LEVELS[autoLevel].name,passed:autoPassed,state:GS.state,currentTile:Math.round(PL.x/T*10)/10,maxTile:Math.round(autoMax/T*10)/10,y:Math.round(PL.y),ground:PL.ground,mode:AIB.mode,stuck:AIB.stuckT,error:_errMsg});
    }
    return out;
  })()`);
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const near = (actual, expected, tolerance = 0.01) => Math.abs(actual - expected) <= tolerance;
  check(result.initial.three && result.initial.calf && !result.initial.error, "game failed to initialize");
  check(result.levels.length === 20, `expected 20 levels, got ${result.levels.length}`);
  for (const level of result.levels) check(!level.error && !level.thrown, `level ${level.i + 1} failed to render`);
  check(result.bugs.bigCoinPreserved, "large coin metadata was lost");
  check(near(result.bugs.bump.delta, 0), "used item box moved away from its tile");
  check(result.bugs.crumble?.armed && result.bugs.crumble?.collapsed, "crumble platform regression");
  check(
    result.bugs.autoIntroStarted && result.bugs.autoIntroEnded && result.bugs.autoIntroStayedOff,
    "auto intro repeated",
  );
  check(
    result.bugs.view.calfScale > 4.2 && result.bugs.view.calfZ >= 6,
    "automatic-mode player is not enlarged or front-most",
  );
  check(result.bugs.leftFacing.passed, "left-facing model rotation failed");
  check(near(result.bugs.milkScale, 3.2), "milk model scale regressed");
  check(result.bugs.autoWall.blocked, "automatic mode crossed a solid wall");
  check(
    result.bugs.autoRecovery.atSafePoint &&
      result.bugs.autoRecovery.time === 300 &&
      result.bugs.autoRecovery.keysCleared &&
      result.bugs.autoRecovery.aiReset,
    "automatic recovery leaked input or AI state",
  );
  check(
    result.bugs.spikeSurface.ground && near(result.bugs.spikeSurface.y, result.bugs.spikeSurface.expected),
    "spike collision surface regressed",
  );
  check(
    result.bugs.movingPlatformFirst.onPlatform &&
      near(result.bugs.movingPlatformFirst.y, result.bugs.movingPlatformFirst.expected),
    "moving-platform sweep priority regressed",
  );
  for (const [name, collision] of [
    ["solid", result.bugs.verticalPriority.solidFirst],
    ["one-way", result.bugs.verticalPriority.oneWayFirst],
  ]) {
    check(
      collision.hitB && collision.ground && collision.vy === 0 && near(collision.y, collision.expected),
      `${name} was not the first downward sweep contact`,
    );
  }
  const springContact = result.bugs.verticalPriority.springFirst;
  check(
    springContact.hitB &&
      !springContact.ground &&
      springContact.vy === -1040 &&
      near(springContact.y, springContact.expected),
    "spring was not the first downward sweep contact",
  );
  check(
    result.bugs.springLaunch.before === -1040 &&
      result.bugs.springLaunch.after < -900 &&
      result.bugs.springLaunch.airborne,
    "automatic hop overrode spring launch velocity",
  );
  check(
    result.bugs.upwardSweep.hitT &&
      !result.bugs.upwardSweep.ground &&
      result.bugs.upwardSweep.vy === 0 &&
      result.bugs.upwardSweep.springK === 0 &&
      near(result.bugs.upwardSweep.y, result.bugs.upwardSweep.expected),
    "high-speed upward sweep missed the first solid contact",
  );
  for (const [name, bounds] of [
    ["spring", result.bugs.springBounds],
    ["pipe", result.bugs.pipeBounds],
  ]) {
    check(
      bounds && near(bounds.bottom, bounds.expectedBottom, 0.08) && near(bounds.top, bounds.expectedTop, 0.08),
      `${name} model is not grounded`,
    );
  }
  check(result.bugs.goalState === "clear", "visible flag did not clear the level");
  for (const route of result.routes) check(route.passed, `manual keyboard route failed: ${route.name}`);
  for (const route of result.autoRoutes) check(route.passed, `automatic route failed: ${route.name}`);
  check(result.routes[19]?.bossSeen, "final Boss was not reached by the manual route");
  console.log(
    `Edge E2E: levels ${result.levels.length}/20, manual ${result.routes.filter((route) => route.passed).length}/20, auto ${result.autoRoutes.filter((route) => route.passed).length}/20`,
  );
  if (failures.length) throw new Error(`E2E failures:\n- ${failures.join("\n- ")}`);
} catch (error) {
  testFailure = error;
}
let cleanupFailure;
try {
  await close();
} catch (error) {
  cleanupFailure = error;
}
if (testFailure && cleanupFailure) {
  throw new AggregateError([testFailure, cleanupFailure], "E2E run and cleanup failed");
}
if (testFailure) throw testFailure;
if (cleanupFailure) throw cleanupFailure;
