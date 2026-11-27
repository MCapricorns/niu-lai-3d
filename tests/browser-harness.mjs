import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserCandidates = [
  process.env.BROWSER_PATH,
  process.env.EDGE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/microsoft-edge",
  "/usr/bin/microsoft-edge-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean);
const browser = browserCandidates.find((candidate) => fs.existsSync(candidate));
if (!browser) throw new Error("No Chromium-based browser found. Set BROWSER_PATH to its executable.");

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

export const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
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
  if (!(await forcedExit)) throw new Error(`Browser process ${child.pid} did not exit after SIGKILL`);
}

async function createHarness(entry) {
  let profile;
  let server;
  let child;
  let ws;
  let browserFailure;
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
    const pageUrl = `http://127.0.0.1:${webPort}${entry}`;
    profile = await fs.promises.mkdtemp(path.join(os.tmpdir(), "niu-browser-"));
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
      browser,
      [
        "--headless=new",
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--window-size=1000,760",
        pageUrl,
      ],
      { stdio: "ignore" },
    );
    child.once("error", (error) => {
      if (!closing && !browserFailure) browserFailure = new Error(`Browser failed to start: ${error.message}`);
      rejectPending(browserFailure || error);
    });
    child.once("exit", (code, signal) => {
      const error = new Error(`Browser exited unexpectedly (code=${code}, signal=${signal})`);
      if (!closing && !browserFailure) browserFailure = error;
      rejectPending(browserFailure || error);
    });

    let target;
    for (let i = 0; i < 80; i++) {
      if (browserFailure) throw browserFailure;
      try {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, {
          signal: AbortSignal.timeout(1_000),
        });
        const list = await response.json();
        target = list.find((item) => item.type === "page" && item.url === pageUrl);
        if (target) break;
      } catch {
        if (browserFailure) throw browserFailure;
      }
      await sleep(100);
    }
    if (!target) throw browserFailure || new Error("Browser DevTools target not found");

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

    async function evaluate(expression) {
      const out = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (out.exceptionDetails) {
        throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text);
      }
      return out.result.value;
    }

    return { send, evaluate, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "E2E harness setup and cleanup failed");
    }
    throw error;
  }
}

export async function withBrowser(entry, run) {
  const { send, evaluate, close } = await createHarness(entry);
  let result;
  let failure;
  try {
    await send("Runtime.enable");
    result = await run({ send, evaluate });
  } catch (error) {
    failure = error;
  }
  try {
    await close();
  } catch (error) {
    if (failure) throw new AggregateError([failure, error], "E2E run and cleanup failed");
    throw error;
  }
  if (failure) throw failure;
  return result;
}
