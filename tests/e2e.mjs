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
    var out = {
      initial: { state: GS.state, three: THREE_OK, error: _errMsg, calf: !!mCalf, version: VER },
      dpr: { scale: DPR, canvasW: cv.width },
      levels: LEVELS.length,
      profile: (function () {
        var p = LEVELS[0].profile;
        return { title: p.title, challenge: p.challenge, tip: p.tip };
      })(),
      bugs: {},
    };
    /* —— 大地图可渲染 —— */
    _errMsg = "";
    loadLevel(0, true);
    GS.state = "pause";
    render();
    out.bugs.levelRender = { error: _errMsg, children: dynGroup.children.length, name: curLV.name };
    out.bugs.saveCount = savesEnt.length;
    out.bugs.saveMeshes = savesEnt.every(function (s) { return !!s.mesh; });
    /* —— 大金币与问号箱 —— */
    var big = coinsEnt.find(function (c) {
      return c.big;
    });
    out.bugs.bigCoinPreserved = !!big;
    var q = -1;
    for (var qi = 0; qi < tiles.length; qi++) {
      if (tiles[qi] >= 4 && tiles[qi] <= 7) {
        q = qi;
        break;
      }
    }
    if (q >= 0) {
      var qx = q % curLV.w,
        qy = Math.floor(q / curLV.w);
      bumpBlock(qx, qy);
      var wb = worldBlocks[qx + "," + qy];
      for (var n = 0; n < 20; n++) sync3D();
      if (wb && wb.g) out.bugs.bump = { delta: wb.g.position.y - tileCenter(qx, qy)[1] };
    }
    /* —— 碎板 —— */
    var crumbleResult = null;
    loadLevel(0, true);
    for (var cti = 0; cti < tiles.length && !crumbleResult; cti++) {
      if (tiles[cti] === 16) {
        var ctx = cti % curLV.w,
          cty = Math.floor(cti / curLV.w);
        PL.x = ctx * T + 6;
        PL.prevY = cty * T - PL.h - 8;
        PL.y = cty * T - PL.h + 1;
        PL.vy = 120;
        collideY(PL);
        var armed = !!crumbles[ctx + "," + cty] && PL.ground;
        updateCrumbles(0.8);
        crumbleResult = { armed: armed, collapsed: tileAt(ctx, cty) === 0 };
        break;
      }
    }
    out.bugs.crumble = crumbleResult;
    /* —— COMBO 里程碑(无生命版) —— */
    loadLevel(0, true);
    GS.score = 0;
    GS.sBonus = 0;
    PL.star = 0;
    GS.combo = 3;
    rewardComboMilestone(0, 0);
    GS.combo = 5;
    rewardComboMilestone(0, 0);
    GS.combo = 8;
    rewardComboMilestone(0, 0);
    out.bugs.comboRewards = { score: GS.score, star: PL.star };
    /* —— 踩刺必死(IWBTG 即死) —— */
    loadLevel(0, true);
    GS.state = "play";
    PL.inv = 0;
    PL.star = 0;
    PL.big = false;
    PL.h = 36;
    PL.dead = false;
    PL.x = 18 * T + 10;
    PL.y = 12 * T - PL.h;
    hazardCheck();
    out.bugs.spikeMortal = !!(PL.dead || GS.state === "dead");
    /* —— 刺坑没有虚拟地板 —— */
    loadLevel(0, true);
    GS.state = "play";
    PL.x = 25 * T;
    PL.y = 13 * T - PL.h;
    PL.vy = 80;
    PL.prevY = PL.y - 8;
    PL.ground = false;
    collideY(PL);
    out.bugs.noMagicFloor = !PL.ground;
    /* —— 存档点:触碰后死亡,从存档点复活,死亡计数+1 —— */
    loadLevel(0, true);
    GS.state = "play";
    var deathsBefore = GS.deaths;
    var savedAll = GS.deathsAll;
    var saveIdx = 2;
    PL.x = savesEnt[saveIdx].x - PL.w / 2;
    PL.y = savesEnt[saveIdx].y - 20;
    GS.checkpointX = 0;
    savesEnt.forEach(function (s) {
      s.taken = false;
    });
    updatePlayer(1 / 60);
    var saveTouched = savesEnt[saveIdx].taken && GS.checkpointX > 0;
    die();
    var guard = 0;
    while (GS.state !== "play" && guard++ < 400) update(1 / 60);
    out.bugs.saveRespawn = {
      touched: saveTouched,
      respawnAtSave: Math.abs(PL.x - GS.checkpointX) < 2,
      nearSave: Math.abs(PL.x - (savesEnt[saveIdx].x - T / 2 + 4)) < 2,
      deaths: GS.deaths - deathsBefore,
      deathsAll: GS.deathsAll - savedAll,
    };
    try {
      out.bugs.deathsPersisted = parseInt(localStorage.getItem("niu_deaths") || "0", 10) >= savedAll + 1;
    } catch (e) {}
    /* —— 碰撞回归 —— */
    loadLevel(0, true);
    setTile(10, 12, 10);
    PL.x = 10 * T;
    PL.prevY = 420;
    PL.y = 460;
    PL.vy = 800;
    collideY(PL);
    out.bugs.spikeSurface = { y: PL.y, expected: 12 * T - PL.h - 0.01, ground: PL.ground };
    loadLevel(0, true);
    setTile(10, 10, 9);
    ents = [
      {
        k: "move",
        x: 10 * T - 10,
        y: 370,
        w: 90,
        h: 20,
      },
    ];
    PL.x = 10 * T;
    PL.prevY = 314;
    PL.y = 364;
    PL.vy = 1000;
    collideY(PL);
    out.bugs.movingPlatformFirst = { y: PL.y, expected: 370 - PL.h - 0.01, onPlatform: PL._onPlat === ents[0] };
    /* —— 平台板悬在刺格正上方:站在板上绝不能被脚下方刺格判死 —— */
    loadLevel(0, true);
    GS.state = "play";
    setTile(10, 11, 10);
    ents = [
      {
        k: "move",
        x: 10 * T - 20,
        y: 11 * T,
        w: 90,
        h: 20,
      },
    ];
    PL.x = 10 * T;
    PL.prevY = 11 * T - PL.h - 8;
    PL.y = 11 * T - PL.h + 1;
    PL.vy = 300;
    PL.dead = false;
    PL.inv = 0;
    PL.star = 0;
    PL.pounding = false;
    collideY(PL);
    var onPlat = PL._onPlat === ents[0] && PL.ground;
    hazardCheck();
    out.bugs.platOverSpikes = { onPlat: onPlat, alive: !PL.dead && GS.state === "play" };
    function prepareVerticalSweep() {
      loadLevel(0, true);
      ents = [];
      for (var sweepY = 3; sweepY <= 12; sweepY++) setTile(10, sweepY, 0);
      PL.x = 10 * T;
      PL.vx = 0;
      PL.ground = false;
      PL.coyote = 0;
      PL.jbuf = 0;
      PL.springK = 0;
    }
    function sweepDown(order) {
      prepareVerticalSweep();
      for (var oi = 0; oi < order.length; oi++) setTile(10, 7 + oi, order[oi]);
      PL.prevY = 5 * T;
      PL.y = 10 * T;
      PL.vy = 1000;
      collideY(PL);
      return { y: PL.y, expected: 7 * T - PL.h - 0.01, vy: PL.vy, ground: PL.ground, hitB: PL.hitB };
    }
    out.bugs.verticalPriority = {
      solidFirst: sweepDown([2, 9, 12]),
      oneWayFirst: sweepDown([9, 12, 2]),
      springFirst: sweepDown([12, 2, 9]),
    };
    prepareVerticalSweep();
    setTile(10, 10, 9);
    setTile(10, 9, 12);
    setTile(10, 8, 2);
    setTile(10, 6, 2);
    PL.prevY = 11 * T;
    PL.y = 4 * T;
    PL.vy = -1200;
    collideY(PL);
    out.bugs.upwardSweep = {
      y: PL.y,
      expected: 9 * T + 0.01,
      vy: PL.vy,
      hitT: PL.hitT,
      ground: PL.ground,
      springK: PL.springK,
    };
    var springEntry = null;
    for (var wk in worldBlocks) {
      if (!springEntry && worldBlocks[wk].kind === "spring") springEntry = { key: wk, wb: worldBlocks[wk] };
    }
    function boundsResult(entry) {
      if (!entry) return null;
      var parts = entry.key.split(","),
        ty = +parts[1];
      var bb = new THREE.Box3().setFromObject(entry.wb.g);
      return { bottom: bb.min.y, expectedBottom: worldY((ty + 1) * T), top: bb.max.y, expectedTop: worldY(ty * T) };
    }
    out.bugs.springBounds = boundsResult(springEntry);
    /* —— 坐地重击/蹬墙跳 —— */
    loadLevel(0, true);
    var bt = -1;
    for (var bti = 0; bti < tiles.length; bti++) {
      if (tiles[bti] === 3) {
        bt = bti;
        break;
      }
    }
    if (bt >= 0) {
      var bx = bt % curLV.w,
        by = Math.floor(bt / curLV.w);
      PL.x = bx * T + 4;
      PL.prevY = by * T - PL.h - 8;
      PL.y = by * T - PL.h + 1;
      PL.vy = 950;
      PL.pounding = true;
      collideY(PL);
      out.bugs.poundBrick = { broken: tileAt(bx, by) === 0 };
    }
    loadLevel(0, true);
    setTile(15, 4, 2);
    setTile(15, 5, 2);
    setTile(15, 6, 2);
    setTile(15, 7, 2);
    setTile(15, 8, 2);
    PL.x = 15 * T - PL.w - 2;
    PL.y = 5 * T;
    PL.vy = -100;
    PL.vx = 0;
    PL.ground = false;
    PL.coyote = 0;
    PL.jbuf = 0;
    PL.hitR = true;
    PL.hitL = false;
    keys.right = true;
    keys.left = false;
    keys.jump = false;
    justPressed.jump = true;
    updatePlayer(1 / 60);
    out.bugs.wallKick = { vy: PL.vy, vx: PL.vx };
    keys.right = false;
    /* —— 二段跳:空中再按一次只多跳一截,落地补满 —— */
    loadLevel(0, true);
    GS.state = "play";
    PL.x = 6 * T;
    PL.y = 8 * T;
    PL.vx = 0;
    PL.vy = 200;
    PL.prevY = PL.y;
    PL.ground = false;
    PL.coyote = 0;
    PL.jbuf = 0;
    PL.airJump = true;
    PL.dead = false;
    PL.star = 0;
    keys.right = false;
    keys.left = false;
    keys.jump = false;
    justPressed.jump = true;
    updatePlayer(1 / 60);
    var vyAfterAir1 = PL.vy;
    var airJumpLeft = PL.airJump;
    justPressed.jump = true;
    PL.vy = 200;
    updatePlayer(1 / 60);
    var vyAfterAir2 = PL.vy;
    PL.ground = true;
    PL.vy = 0;
    updatePlayer(1 / 60);
    out.bugs.doubleJump = {
      first: vyAfterAir1 < -500,
      consumed: airJumpLeft === false,
      secondBlocked: vyAfterAir2 > -400,
      refilledOnGround: PL.airJump === true,
    };
    /* —— GPT 老板:奶弹可伤 —— */
    loadLevel(0, true);
    GS.state = "play";
    var mbE = null;
    for (var se = 0; se < ents.length; se++) if (ents[se].k === "miniboss") mbE = ents[se];
    if (mbE) {
      mbE.hurtT = 0;
      camX = mbE.x - 300;
      shots.push({ x: mbE.x + mbE.w / 2, y: mbE.y + mbE.h / 2, vx: 0, vy: 0, t: 0 });
      updateShots(0.016);
      out.bugs.miniHit = mbE.hp < mbE.maxhp;
    }
    /* —— Dario:入场触发 + 自动开火 + 护盾 —— */
    loadLevel(0, true);
    GS.state = "play";
    PL.x = (curLV.bossAt - 0.5) * T;
    PL.y = 12 * T - 36 - 0.01;
    PL.vx = 0;
    PL.vy = 0;
    var bossFrames = 0,
      bossOK = false,
      bossTrace = [];
    for (bossFrames = 0; bossFrames < 60 * 20; bossFrames++) {
      if (GS.state === "play") {
        keys.right = true;
      } else keys.right = false;
      update(1 / 60);
      if (bossFrames % 240 === 0) bossTrace.push(bossFrames + ":" + GS.state + " x" + Math.round(PL.x));
      if (GS.bossActive || GS.boss) {
        bossOK = true;
        break;
      }
    }
    keys.right = false;
    out.bugs.bossTrace = bossTrace;
    out.bugs.bossTriggered = bossOK;
    out.bugs.bossInArena = !!GS.boss && GS.boss.x > curLV.arena.x0 * T && GS.boss.x < curLV.arena.x1 * T;
    startBossIntro();
    GS.state = "play";
    var bb = GS.boss;
    camX = curLV.arena.x0 * T;
    bb.state = "idle";
    bb.hurt = 0;
    var shotsBefore = shots.length;
    var fired = false;
    for (var af = 0; af < 90 && !fired; af++) {
      update(1 / 60);
      if (shots.length > shotsBefore) fired = true; /* 平射弹被护盾弹开会消失,只断言窗口内出现过 */
    }
    out.bugs.autoFire = fired && bb.hp === bb.maxhp;
    bb.hurt = 0;
    bb.state = "idle";
    shots.push({ x: bb.x + bb.w / 2, y: bb.y + bb.h / 2, vx: 0, vy: 0, t: 0 });
    updateShots(0.016);
    var hpAfterDeflect = bb.hp;
    bb.state = "recover";
    bb.hurt = 0;
    shots.push({ x: bb.x + bb.w / 2, y: bb.y + bb.h / 2, vx: 0, vy: 0, t: 0 });
    updateShots(0.016);
    out.bugs.bossDeflectOK = hpAfterDeflect === bb.maxhp;
    out.bugs.bossVulnHit = bb.hp < bb.maxhp;
    /* —— 渲染视图 —— */
    shake = 0;
    GS.state = "pause";
    render();
    out.bugs.view = { calfScale: mCalf.scale.x, calfZ: mCalf.position.z };
    itms = [];
    spawnItem("milk", 10, 8);
    sync3D();
    out.bugs.milkScale = itms[0].mesh.scale.x;
    return out;
  })()`);
  /*
   * Landscape game, portrait phone: exercise canvas hit regions and the CSS
   * touch layout in Chromium's mobile viewport at DPR 2, which also proves
   * the HiDPI sharpness path end to end.
   */
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, configuration: "mobile" });
  await sleep(150);
  const portraitUi = await evaluate(`(function(){
    var td = document.getElementById("touch");
    touchUI = td;
    td.classList.add("touch-enabled");
    touchControlsVisible = false;
    GS.state = "title";
    syncTouchControls();
    render();
    var hiddenOnTitle = !td.classList.contains("is-active");
    var dpr2 = { scale: DPR, canvasW: cv.width };
    /* 标题页点画布任意处(非 GitHub 徽章)直接开始 */
    var rect = cv.getBoundingClientRect();
    cv.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: rect.left + rect.width * 0.5,
        clientY: rect.top + rect.height * 0.3,
        pointerType: "touch",
        bubbles: true,
      }),
    );
    var tapStarted = GS.state === "play";
    render();
    syncTouchControls();
    var shownInPlay = td.classList.contains("is-active");
    var ids = ["btnL", "btnR", "btnJ", "btnP"];
    var boxes = ids.map(function (id) {
      var b = document.getElementById(id).getBoundingClientRect();
      return { id: id, left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
    });
    var overlaps = [];
    for (var i = 0; i < boxes.length; i++)
      for (var j = i + 1; j < boxes.length; j++) {
        var a = boxes[i],
          b2 = boxes[j];
        if (a.left < b2.right && a.right > b2.left && a.top < b2.bottom && a.bottom > b2.top) overlaps.push(a.id + "+" + b2.id);
      }
    var canvasRect = cv.getBoundingClientRect();
    GS.state = "title";
    syncTouchControls();
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight, coarse: matchMedia("(pointer: coarse)").matches },
      hiddenOnTitle: hiddenOnTitle,
      tapStarted: tapStarted,
      shownInPlay: shownInPlay,
      dpr: dpr2,
      controls: {
        enabled: td.classList.contains("touch-enabled"),
        overlaps: overlaps,
        boxes: boxes,
      },
      canvas: { top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
    };
  })()`);
  await send("Emulation.clearDeviceMetricsOverride");
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const near = (actual, expected, tolerance = 0.01) => Math.abs(actual - expected) <= tolerance;
  check(result.initial.three && result.initial.calf && !result.initial.error, "game failed to initialize");
  check(result.levels === 1, `expected a single continuous stage, got ${result.levels}`);
  check(result.profile.title && result.profile.challenge && result.profile.tip, "stage profile metadata missing");
  check(
    result.bugs.levelRender && !result.bugs.levelRender.error && result.bugs.levelRender.children > 0,
    "stage failed to render",
  );
  check(result.bugs.saveCount >= 4 && result.bugs.saveMeshes, "save points missing or unrendered");
  check(result.bugs.bigCoinPreserved, "large coin metadata was lost");
  check(near(result.bugs.bump.delta, 0), "used item box moved away from its tile");
  check(result.bugs.crumble?.armed && result.bugs.crumble?.collapsed, "crumble platform regression");
  check(
    result.bugs.comboRewards.score === 4300 && result.bugs.comboRewards.star > 0,
    "combo milestone rewards regressed",
  );
  check(result.bugs.spikeMortal, "spikes no longer kill on touch");
  check(result.bugs.noMagicFloor, "a virtual floor appeared over the spike pit");
  check(
    result.bugs.saveRespawn.touched &&
      result.bugs.saveRespawn.respawnAtSave &&
      result.bugs.saveRespawn.nearSave &&
      result.bugs.saveRespawn.deaths === 1,
    "death did not respawn at the touched save point with a death counted",
  );
  check(result.bugs.deathsPersisted, "death counter did not persist");
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
    result.bugs.upwardSweep.hitT &&
      !result.bugs.upwardSweep.ground &&
      result.bugs.upwardSweep.vy === 0 &&
      result.bugs.upwardSweep.springK === 0 &&
      near(result.bugs.upwardSweep.y, result.bugs.upwardSweep.expected),
    "high-speed upward sweep missed the first solid contact",
  );
  const springBounds = result.bugs.springBounds;
  check(
    springBounds &&
      near(springBounds.bottom, springBounds.expectedBottom, 0.08) &&
      near(springBounds.top, springBounds.expectedTop, 0.08),
    "spring model is not grounded",
  );
  check(result.bugs.poundBrick?.broken, "ground pound failed to break a brick");
  check(
    result.bugs.wallKick && result.bugs.wallKick.vy < -500 && result.bugs.wallKick.vx < -150,
    "wall jump output regressed",
  );
  check(
    result.bugs.doubleJump &&
      result.bugs.doubleJump.first &&
      result.bugs.doubleJump.consumed &&
      result.bugs.doubleJump.secondBlocked &&
      result.bugs.doubleJump.refilledOnGround,
    "double jump regressed",
  );
  check(
    result.bugs.platOverSpikes && result.bugs.platOverSpikes.onPlat && result.bugs.platOverSpikes.alive,
    "standing on a platform over spikes killed the player",
  );
  check(result.bugs.miniHit, "milk shots did not hurt the mini boss");
  check(result.bugs.bossTriggered, "final Boss did not show up when reached");
  check(result.bugs.bossInArena, "final Boss spawned outside the arena");
  check(result.bugs.autoFire, "milk shots did not auto-fire during boss fight");
  check(result.bugs.bossDeflectOK, "boss shield did not deflect shots");
  check(result.bugs.bossVulnHit, "shots did not hurt the vulnerable boss");
  check(
    result.bugs.view && result.bugs.view.calfScale > 1.0 && result.bugs.view.calfScale < 3.5,
    "player model scale out of range",
  );
  check(near(result.bugs.milkScale, 3.2), "milk model scale regressed");
  check(portraitUi.viewport.h > portraitUi.viewport.w, "portrait viewport was not applied");
  check(
    portraitUi.dpr.scale === 2 && portraitUi.dpr.canvasW === 1920,
    "HiDPI canvas did not render at devicePixelRatio 2",
  );
  check(portraitUi.hiddenOnTitle, "touch controls were visible over the title");
  check(portraitUi.tapStarted, "tapping the title did not start the challenge");
  check(portraitUi.shownInPlay, "touch controls did not appear during play");
  check(portraitUi.controls.enabled, "touch controls were not initialized for portrait UI");
  check(
    portraitUi.controls.boxes.every((box) => box.width >= 50 && box.height >= 50),
    "portrait touch target became too small",
  );
  check(
    portraitUi.controls.overlaps.length === 0,
    `portrait touch controls overlap: ${portraitUi.controls.overlaps.join(", ")}`,
  );
  console.log(
    `Edge E2E: stage "${result.profile.title}" saves=${result.bugs.saveCount} respawn=${JSON.stringify(result.bugs.saveRespawn)} boss=${result.bugs.bossTriggered ? "OK" : "MISSING"}`,
  );
  console.log("VIEW:", JSON.stringify(result.bugs.view), "BOSSTRACE:", JSON.stringify(result.bugs.bossTrace));
  console.log("PORTRAIT:", JSON.stringify(portraitUi));
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
