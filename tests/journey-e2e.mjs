import assert from "node:assert/strict";
import { sleep } from "./browser-harness.mjs";

const keys = {
  forward: { key: "w", code: "KeyW", windowsVirtualKeyCode: 87 },
  backward: { key: "s", code: "KeyS", windowsVirtualKeyCode: 83 },
  right: { key: "d", code: "KeyD", windowsVirtualKeyCode: 68 },
  jump: { key: " ", code: "Space", windowsVirtualKeyCode: 32 },
};

const progressKey = "niu-lai-3d-expedition-progress";

async function runStoryEnding({ send, evaluate, waitFor, click, readDialogue, checkVista }, stageCount) {
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Emulation.clearDeviceMetricsOverride");
  await send("Page.enable");
  // The route test plays every authored stage. Shorten only the approach to each goal in this browser fixture.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      let platformer, state;
      Object.defineProperty(window, "NiuPlatformer", {
        get: () => platformer,
        set(engine) {
          platformer = { ...engine, create(level) {
            state = engine.create(level);
            return state;
          } };
        },
      });
      window.arriveAtJourneyGoal = (missFirstRelay = false) => {
        state.relays.forEach((relay, index) => { relay.active = !missFirstRelay || index > 0; });
        state.relaysActivated = state.relays.length - Number(missFirstRelay);
        if (missFirstRelay) {
          state.checkpointIndex = 0;
          state.checkpoint = state.level.checkpoints[0];
        }
        Object.assign(state.player, state.level.goal, { vx: 0, vy: 0, vz: 0 });
      };
    })();`,
  });

  await send("Page.reload");
  await waitFor("reload the title for the campaign tests", (state) => state.mode === "title");

  const progressBeforeAI = await evaluate(`localStorage.getItem(${JSON.stringify(progressKey)})`);
  await click("#ai-start");
  const autoFirst = await waitFor(
    "show the AI cross the first spikes with live telemetry",
    ({ mode, autoplay, aiStatus, stageIndex, player }) =>
      mode === "playing" && autoplay && aiStatus && stageIndex === 0 && player.z > 7.75,
    20_000,
  );
  assert.equal(autoFirst.deaths, 0, "the AI should jump safely over the first spikes");
  await evaluate("window.arriveAtJourneyGoal()");
  const autoSecond = await waitFor(
    "advance the AI to act two",
    ({ mode, autoplay, stageIndex, elapsed }) => mode === "playing" && autoplay && stageIndex === 1 && elapsed > 0.1,
  );
  assert.equal(autoSecond.unlocked, 1);

  await click("#take-control");
  const practice = await waitFor(
    "give the player control of the demo act",
    ({ mode, stageIndex, autoplay }) => mode === "playing" && stageIndex === 1 && !autoplay,
  );
  assert.ok(practice.elapsed >= autoSecond.elapsed, "taking over should continue the live act without a restart");
  await evaluate("window.arriveAtJourneyGoal()");
  const practiceFinished = await waitFor("finish the act after taking over", ({ finished }) => finished);
  assert.equal(practiceFinished.unlocked, 1);
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(progressKey)})`), progressBeforeAI);

  async function launchAct(index) {
    await send("Page.reload");
    await waitFor(
      `load the title for act ${index + 1}`,
      (state) => state.mode === "title" && state.stageIndex === index,
    );
    await click("#start");
    await waitFor(
      `show act ${index + 1} after choosing to play`,
      (state) => state.mode === "chapterIntro" && state.stageIndex === index,
    );
    await readDialogue("chapterIntro", "playing");
  }

  async function reachAct(index) {
    // Seed only the isolated browser profile to cover representative finale transitions.
    await evaluate(`(() => {
      const key = ${JSON.stringify(progressKey)};
      const data = JSON.parse(localStorage.getItem(key));
      data.unlocked = ${index + 1};
      localStorage.setItem(key, JSON.stringify(data));
    })()`);
    await launchAct(index);
  }

  async function finishAct(index, nextMode) {
    await evaluate("window.arriveAtJourneyGoal()");
    const chapterFinal = (index + 1) % 5 === 0;
    const recovered = await waitFor(
      `show the act ${index + 1} conclusion`,
      (state) => state.mode === (chapterFinal ? "chapterClear" : "stageClear"),
    );
    assert.equal(recovered.finished, true);
    assert.equal(recovered.unlocked, Math.min(stageCount, index + 2));
    if (chapterFinal) {
      assert.match(await evaluate("document.querySelector('#story-title').textContent"), /碎片/);
      const lines = await readDialogue("chapterClear", nextMode);
      assert.ok(lines.length >= 2, "the chapter finale should show the recovery dialogue");
    }
  }

  await launchAct(0);
  await evaluate("window.arriveAtJourneyGoal(true)");
  await waitFor("lock the gate when a relay was missed", () =>
    evaluate("!document.querySelector('#return-relay').hidden"),
  );
  assert.match(await evaluate("document.querySelector('#status').textContent"), /星门尚未开启/);
  await click("#return-relay");
  const returned = await waitFor("return to a point before the missed relay", ({ player }) => player.z < 1);
  assert.equal(returned.checkpoint, null);
  assert.equal(returned.relaysActivated, 1);

  await finishAct(0, "stageClear");
  await click("#next-stage");
  const next = await waitFor("show the following act", (state) => state.mode === "chapterIntro");
  assert.equal(next.stageIndex, 1);
  assert.equal(next.act, 2);

  await reachAct(4);
  await finishAct(4, "stageClear");
  await click("#next-stage");
  const nextChapter = await waitFor("open the next chapter", (state) => state.mode === "chapterIntro");
  assert.equal(nextChapter.stageIndex, 5);
  assert.equal(nextChapter.act, 1);

  await reachAct(stageCount - 1);
  await checkVista("core");
  await finishAct(stageCount - 1, "storyEnding");
  const ending = await readDialogue("storyEnding", "campaignClear");
  assert.ok(ending.length >= 2, "the epilogue should include several lines");
  assert.ok(
    ending.some(({ speaker }) => speaker.includes("妈妈")),
    "the epilogue should include Niulai's mother",
  );
  assert.equal(await evaluate("document.querySelector('#next-stage').hidden"), true);

  await send("Page.reload");
  const saved = await waitFor("finish reloading with saved progress", (state) => state.mode === "title");
  assert.equal(saved.stageIndex, stageCount - 1);
  assert.equal(saved.unlocked, stageCount);
  await click("#stage-select");
  await waitFor("open the saved chapter list", (state) => state.mode === "select");
  for (let chapter = 1; chapter <= 5; chapter++) {
    await click(`#chapter-tabs button:nth-child(${chapter})`);
    assert.equal(await evaluate("document.querySelectorAll('.stage-choice:not(:disabled)').length"), 5);
  }
  await click("#chapter-tabs button:first-child");
  await click(".stage-choice");
  await waitFor("replay a cleared act directly", (state) => state.mode === "playing" && state.stageIndex === 0);
  console.log("Journey E2E: AI isolation and takeover, act and chapter transitions, ending and saved progress OK");
}

export async function runJourney({ send, evaluate }) {
  async function waitFor(description, predicate, timeout = 12_000) {
    const deadline = performance.now() + timeout;
    let state;
    do {
      state = await evaluate("window.NiuJourneyTest?.snapshot()");
      if (state && (await predicate(state))) return state;
      await sleep(30);
    } while (performance.now() < deadline);
    throw new Error(`Journey did not ${description}. Last state: ${JSON.stringify(state)}`);
  }

  async function checkVista(theme) {
    await waitFor(
      `load the ${theme} background artwork`,
      async () => (await evaluate("document.querySelector('#journey-canvas').dataset.vista")) === theme,
    );
  }

  async function setKey(input, down) {
    await send("Input.dispatchKeyEvent", { type: down ? "rawKeyDown" : "keyUp", ...keys[input] });
  }

  async function hold(input, action) {
    await setKey(input, true);
    try {
      return await action();
    } finally {
      await setKey(input, false);
    }
  }

  async function center(selector) {
    const point = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const rect = el?.getBoundingClientRect();
      return rect?.width && rect.height ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
    })()`);
    assert.ok(point, `Expected a visible ${selector}`);
    return point;
  }

  async function click(selector) {
    const point = await center(selector);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  }

  async function touch(type, ...touchPoints) {
    await send("Input.dispatchTouchEvent", { type, touchPoints });
  }

  async function tap(selector) {
    await touch("touchStart", await center(selector));
    await touch("touchEnd");
  }

  async function readDialogue(mode, nextMode, activate = click) {
    const lines = [];
    for (let i = 0; i < 8; i++) {
      const line = await evaluate(`({
        text: document.querySelector('#story-text').textContent.trim(),
        speaker: document.querySelector('#story-speaker').textContent.trim(),
      })`);
      assert.ok(line.text, `${mode} should have dialogue text`);
      lines.push(line);
      await activate("#story-continue");
      const state = await waitFor(`advance ${mode} or move to ${nextMode}`, async (state) => {
        if (state.mode === nextMode) return true;
        return (
          state.mode === mode &&
          (await evaluate("document.querySelector('#story-text').textContent.trim()")) !== line.text
        );
      });
      if (state.mode === nextMode) return lines;
    }
    throw new Error(`Did not finish ${mode} within eight lines`);
  }

  const title = await waitFor("show the title", (state) => state.mode === "title");
  assert.equal(title.unlocked, 1);
  assert.equal(title.stageCount, 25);
  assert.equal(await evaluate("document.querySelector('#loading-error').hidden"), true);
  assert.ok(await evaluate("document.querySelector('#journey-canvas').width > 300"));
  await checkVista("meadow");

  await click("#stage-select");
  await waitFor("open the stage selector", (state) => state.mode === "select");
  assert.equal(await evaluate("document.querySelectorAll('#chapter-tabs button').length"), 5);
  const disabledActs = () =>
    evaluate("Array.from(document.querySelectorAll('.stage-choice'), button => button.disabled)");
  assert.deepEqual(await disabledActs(), [false, true, true, true, true]);
  await click("#chapter-tabs button:last-child");
  assert.deepEqual(await disabledActs(), [true, true, true, true, true]);
  await click("#select-panel .home");
  await waitFor("return to the title", (state) => state.mode === "title");

  await click("#start");
  await waitFor("show the opening story", (state) => state.mode === "storyIntro");
  const opening = await readDialogue("storyIntro", "chapterIntro");
  assert.ok(opening.length >= 3, "the prologue should have several dialogue beats");
  await readDialogue("chapterIntro", "playing");
  const start = await waitFor("start the first stage", (state) => state.mode === "playing" && state.player.grounded);
  assert.equal(start.stageIndex, 0);
  assert.equal(start.relaysActivated, 0);
  assert.ok(start.relayTotal > 0, "the first chapter should have a relay objective");
  assert.equal(await evaluate("document.querySelector('#relay-count').textContent"), `0/${start.relayTotal}`);
  assert.ok(
    await evaluate("document.querySelector('#stage-name').textContent.trim()"),
    "the stage name should be visible",
  );

  await click("#pause");
  const paused = await waitFor("pause gameplay", (state) => state.mode === "paused");
  await sleep(150);
  assert.equal(await evaluate("window.NiuJourneyTest.snapshot().elapsed"), paused.elapsed);
  await click("#resume");
  await waitFor("resume gameplay", (state) => state.mode === "playing");

  const hit = await hold("forward", () =>
    waitFor("collect coins and collide with the first spike row", (state) => state.deaths === 1),
  );
  assert.ok(hit.coinsCollected >= 3, "walking along the coin trail should collect coins before the spikes");
  assert.equal(await evaluate("Number(document.querySelector('#death-count').textContent)"), 1);
  const respawn = await waitFor(
    "respawn at the start",
    (state) => state.player.grounded && Math.abs(state.player.z - start.player.z) < 0.5,
  );
  assert.equal(respawn.coinsCollected, hit.coinsCollected, "a hit should preserve collected coins");

  await hold("jump", () => waitFor("start a standing jump", ({ player }) => player.y > 0.35));
  const shortHop = await waitFor("reach the top of a short hop", ({ player }) => !player.grounded && player.vy < 0);
  assert.ok(shortHop.player.y < 2, "releasing jump early should lower the jump height");
  await waitFor("land after a short hop", ({ player }) => player.grounded);

  await hold("forward", async () => {
    await waitFor("reach the first spike approach", ({ player }) => player.z > 4.2);
    await hold("jump", () =>
      waitFor("jump over the spike row", ({ player }) => player.z > 7.75 && !player.grounded && player.y > 0.8),
    );
  });
  await hold("backward", () => waitFor("brake before the next gap", ({ player }) => player.vz < 0.65));
  const landed = await waitFor("land after the spike row", ({ player }) => player.grounded && player.z > 7.7);
  assert.equal(landed.deaths, 1, "clearing the spikes should avoid a second hit");
  assert.equal(await evaluate("Number(document.querySelector('#coin-count').textContent)"), landed.coinsCollected);
  if (landed.relaysActivated === 0) {
    await hold("forward", () => waitFor("activate the first relay", (state) => state.relaysActivated === 1));
  }
  assert.equal(await evaluate("document.querySelector('#relay-count').textContent"), `1/${start.relayTotal}`);
  assert.match(await evaluate("document.querySelector('#status').textContent"), /信标已点亮/);

  await hold("right", () => waitFor("move sideways on the landing", ({ player }) => player.x < landed.player.x - 0.5));
  await click("#pause");
  const beforeRestart = await waitFor("open the pause menu after moving", (state) => state.mode === "paused");
  await click("#restart");
  const restarted = await waitFor(
    "return to the start when retrying before the first checkpoint",
    ({ mode, player }) => mode === "playing" && player.grounded && Math.abs(player.z - start.player.z) < 0.5,
  );
  assert.equal(restarted.relaysActivated, beforeRestart.relaysActivated);
  assert.equal(restarted.coinsCollected, beforeRestart.coinsCollected);

  await click("#pause");
  await waitFor("open the pause menu after restarting", (state) => state.mode === "paused");
  await click("#pause-panel .home");
  await waitFor("return to the title after playing", (state) => state.mode === "title");

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, configuration: "mobile" });
  assert.equal(await evaluate("matchMedia('(pointer: coarse)').matches"), true);
  assert.equal(await evaluate("document.querySelector('#touch-jump').getBoundingClientRect().width"), 0);
  await tap("#start");
  await waitFor("skip the acknowledged opening and show the chapter", (state) => state.mode === "chapterIntro");
  await readDialogue("chapterIntro", "playing", tap);
  await waitFor("start the game from a phone tap", (state) => state.mode === "playing" && state.player.grounded);
  await checkVista("meadow");
  const touchMove = await center("#touch-move");
  const touchJump = await center("#touch-jump");
  assert.ok(touchMove.x < touchJump.x, "touch movement and jump controls should be on opposite sides of the game");
  await touch("touchStart", { ...touchMove, id: 1 });
  try {
    const dragged = { x: touchMove.x, y: touchMove.y - 48, id: 1 };
    await touch("touchMove", dragged);
    await waitFor("move with a dragged joystick", ({ player }) => player.z > 1 && Math.abs(player.x) < 0.2);
    await touch("touchStart", dragged, { ...touchJump, id: 2 });
    await waitFor(
      "move and jump together on touch",
      ({ player }) => !player.grounded && player.y > 0.45 && player.vz > 2,
    );
  } finally {
    await touch("touchEnd");
  }

  console.log(`Journey E2E: opening and chapter story, ${title.stageCount} acts, relay, spikes, keyboard and touch OK`);
  await runStoryEnding({ send, evaluate, waitFor, click, readDialogue, checkVista }, title.stageCount);
}
