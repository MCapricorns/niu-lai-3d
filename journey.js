"use strict";

(function () {
  const page = document.getElementById("game");
  const canvas = document.getElementById("journey-canvas");
  const stages = window.NiuStages;
  const story = window.NiuStory;
  const simulation = window.NiuPlatformer;
  const pilot = window.NiuAutoPlay;
  const chapters = stages?.filter((level) => level.act === 1) ?? [];
  const panels = {
    title: document.getElementById("title-panel"),
    select: document.getElementById("select-panel"),
    paused: document.getElementById("pause-panel"),
    story: document.getElementById("story-panel"),
    stageClear: document.getElementById("clear-panel"),
  };
  const start = document.getElementById("start");
  const stageSelect = document.getElementById("stage-select");
  const stageList = document.getElementById("stage-list");
  const chapterTabs = document.getElementById("chapter-tabs");
  const demoStart = document.getElementById("ai-start");
  const aiControls = document.getElementById("ai-controls");
  const aiLabel = document.getElementById("ai-label");
  const takeControl = document.getElementById("take-control");
  const pause = document.getElementById("pause");
  const resume = document.getElementById("resume");
  const restart = document.getElementById("restart");
  const nextStage = document.getElementById("next-stage");
  const replay = document.getElementById("replay");
  const mute = document.getElementById("mute");
  const status = document.getElementById("status");
  const returnRelay = document.getElementById("return-relay");
  const storyKicker = document.getElementById("story-kicker");
  const storyTitle = document.getElementById("story-title");
  const storySpeaker = document.getElementById("story-speaker");
  const storyText = document.getElementById("story-text");
  const storyContinue = document.getElementById("story-continue");
  const clearTitle = document.getElementById("clear-title");
  const clearSummary = document.getElementById("clear-summary");
  const stageName = document.getElementById("stage-name");
  const stageTip = document.getElementById("stage-tip");
  const stageProgress = document.getElementById("stage-progress");
  const coinCount = document.getElementById("coin-count");
  const starCount = document.getElementById("star-count");
  const relayCount = document.getElementById("relay-count");
  const deathCount = document.getElementById("death-count");
  const movePad = document.getElementById("touch-move");
  const jumpPad = document.getElementById("touch-jump");
  const stick = movePad.firstElementChild;
  const progressKey = "niu-lai-3d-expedition-progress";
  const mutedKey = "niu-lai-3d-journey-muted";

  let renderer;
  let state;
  let mode = "title";
  let stageIndex = 0;
  let lastFrame = 0;
  let statusUntil = 0;
  let clearAt = 0;
  let advanceStory;
  let runKind = "human";
  let autopilot = null;
  let autoTime = 0;
  let jumpPressed = false;
  let restartPressed = false;
  let stickPointer = null;
  let jumpPointer = null;
  let touchX = 0;
  let touchZ = 0;
  let audio = null;
  let muted = false;
  const pressed = new Set();
  const jumpKeys = ["Space"];
  const directions = ["KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  const progress = { unlocked: 1, records: {}, introSeen: false };

  try {
    if (!stages?.length || !simulation || !story) throw new Error("Game scripts did not load.");
    const saved = JSON.parse(localStorage.getItem(progressKey));
    if (Number.isInteger(saved?.unlocked)) progress.unlocked = Math.max(1, Math.min(stages.length, saved.unlocked));
    if (saved?.records && typeof saved.records === "object") progress.records = saved.records;
    progress.introSeen = saved?.introSeen === true;
    muted = localStorage.getItem(mutedKey) === "true";
  } catch {
    // The game also runs with storage disabled.
  }

  function activateAudio() {
    if (muted) return;
    try {
      if (!audio) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (Context) audio = new Context();
      }
      if (audio?.state === "suspended") audio.resume().catch(() => {});
    } catch {
      // Gameplay does not depend on Web Audio availability.
    }
  }

  const cuedSounds = {
    jump: [[270, 455, 0.15, 0, "triangle", 0.11]],
    doubleJump: [
      [430, 730, 0.18, 0, "triangle", 0.095],
      [660, 900, 0.12, 0.035, "sine", 0.07],
    ],
    spring: [[165, 510, 0.25, 0, "triangle", 0.12]],
    land: [[110, 55, 0.075, 0, "sine", 0.07]],
    coin: [[988, 1180, 0.11, 0, "sine", 0.09]],
    star: [
      [659, 659, 0.16, 0, "triangle", 0.09],
      [1046, 1245, 0.23, 0.08, "sine", 0.08],
    ],
    checkpoint: [
      [440, 440, 0.2, 0, "sine", 0.1],
      [659, 659, 0.26, 0.08, "triangle", 0.08],
    ],
    relay: [
      [523, 523, 0.18, 0, "sine", 0.1],
      [784, 784, 0.23, 0.07, "triangle", 0.08],
      [1046, 1174, 0.25, 0.14, "sine", 0.07],
    ],
    goalLocked: [[150, 120, 0.14, 0, "sine", 0.08]],
    death: [[162, 47, 0.29, 0, "triangle", 0.13]],
    goal: [
      [523, 523, 0.2, 0, "triangle", 0.11],
      [659, 659, 0.22, 0.09, "triangle", 0.1],
      [784, 784, 0.34, 0.18, "triangle", 0.1],
    ],
  };

  function playSound(event) {
    if (muted || audio?.state !== "running") return;
    const name = event.star ? "star" : event.type;
    for (const [from, to, duration, offset, type, volume] of cuedSounds[name] ?? []) {
      const at = audio.currentTime + offset;
      const wave = audio.createOscillator();
      const gain = audio.createGain();
      wave.type = type;
      wave.frequency.setValueAtTime(from, at);
      wave.frequency.exponentialRampToValueAtTime(to, at + duration);
      gain.gain.setValueAtTime(0.001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      wave.connect(gain);
      gain.connect(audio.destination);
      wave.start(at);
      wave.stop(at + duration + 0.01);
    }
  }

  function updateMute() {
    mute.textContent = muted ? "声音关" : "声音开";
    mute.setAttribute("aria-pressed", String(muted));
  }

  function toggleMute() {
    muted = !muted;
    if (!muted) activateAudio();
    else if (audio?.state === "running") audio.suspend().catch(() => {});
    updateMute();
    try {
      localStorage.setItem(mutedKey, String(muted));
    } catch {
      // Ignore unavailable storage.
    }
  }

  function resetControls() {
    pressed.clear();
    jumpPressed = false;
    restartPressed = false;
    stickPointer = null;
    jumpPointer = null;
    touchX = 0;
    touchZ = 0;
    stick.style.removeProperty("--stick-x");
    stick.style.removeProperty("--stick-y");
  }

  function setMode(next, focus) {
    mode = next;
    page.dataset.mode = next;
    const isStory = next.startsWith("story") || next.startsWith("chapter");
    const outcome = next === "campaignClear" || next === "demoClear";
    const activePanel = isStory ? panels.story : outcome ? panels.stageClear : panels[next];
    for (const panel of Object.values(panels)) panel.hidden = panel !== activePanel;
    resetControls();
    restart.disabled = Boolean(autopilot);
    pause.disabled = next !== "playing";
    mute.disabled = next !== "playing" && next !== "title";
    focus?.focus({ preventScroll: true });
  }

  function setStatus(message, seconds = 1.8) {
    status.textContent = message;
    statusUntil = lastFrame + seconds * 1000;
  }

  function showValue(element, value) {
    const text = String(value);
    if (element.textContent !== text) element.textContent = text;
  }

  function updateHUD() {
    const { level, player } = state;
    showValue(coinCount, state.coinsCollected);
    showValue(starCount, state.starsCollected);
    showValue(relayCount, `${state.relaysActivated}/${state.relays.length}`);
    showValue(deathCount, state.deaths);
    returnRelay.hidden = Boolean(autopilot) || !state.insideGoal || state.finished || state.respawn > 0;
    takeControl.disabled = state.finished;
    const distance = level.goal.z - level.spawn.z;
    stageProgress.value = Math.round(100 * Math.max(0, Math.min(1, (player.z - level.spawn.z) / distance)));
  }

  function configurePilot(next) {
    autopilot = next;
    autoTime = 0;
    aiControls.hidden = !next;
    page.dataset.autoplay = String(Boolean(next));
    aiLabel.textContent = "AI 演示中";
  }

  function loadStage(index) {
    stageIndex = index;
    state = simulation.create(stages[index]);
    renderer.load(state.level);
    clearAt = 0;
    status.textContent = "";
    stageName.textContent = `${state.level.act}/${state.level.actCount} · ${state.level.name}`;
    stageTip.textContent = state.level.tip;
    updateHUD();
  }

  function tellStory(nextMode, kicker, title, dialogue, buttonLabel, onContinue) {
    const lines = Array.isArray(dialogue) ? dialogue : [dialogue];
    let index = 0;
    storyKicker.textContent = kicker;
    storyTitle.textContent = title;
    function showLine() {
      const last = index === lines.length - 1;
      storySpeaker.textContent = lines[index].speaker;
      storyText.textContent = lines[index].text;
      storyContinue.textContent = last ? buttonLabel : "继续";
      advanceStory = last
        ? onContinue
        : () => {
            index++;
            showLine();
          };
    }
    showLine();
    setMode(nextMode, storyContinue);
  }

  function playStage() {
    setMode("playing", canvas);
  }

  function showArrival() {
    const { level } = state;
    if (runKind !== "human" || progress.records[level.id]) {
      playStage();
      return;
    }
    const chapter = story.chapters[level.chapter];
    const chapterOpening = level.act === 1;
    const dialogue = chapterOpening ? chapter.arrival : story.interludes?.[level.id];
    if (!dialogue?.length) {
      playStage();
      return;
    }
    tellStory(
      "chapterIntro",
      `第 ${level.chapterIndex + 1} 章 · 第 ${level.act} 幕`,
      chapterOpening ? chapter.title : level.name,
      dialogue,
      "进入关卡",
      playStage,
    );
  }

  function beginStage(index) {
    activateAudio();
    loadStage(index);
    if (progress.introSeen || runKind !== "human") {
      showArrival();
      return;
    }
    tellStory("storyIntro", "序章", story.title, story.intro, "踏上旅途", () => {
      progress.introSeen = true;
      saveProgress();
      showArrival();
    });
  }

  function showTitle() {
    runKind = "human";
    configurePilot(null);
    const index = progress.unlocked - 1;
    loadStage(index);
    start.textContent = index > 0 ? "继续冒险" : "开始冒险";
    setMode("title", start);
  }

  function timeText(seconds) {
    const tenths = Math.round(seconds * 10);
    const minutes = Math.floor(tenths / 600);
    const remainder = ((tenths % 600) / 10).toFixed(1);
    return minutes ? `${minutes} 分 ${remainder} 秒` : `${remainder} 秒`;
  }

  function showChapterChoices(chapterIndex) {
    chapterTabs.replaceChildren();
    chapters.forEach((chapter, index) => {
      const button = document.createElement("button");
      const region = stages.find((level) => level.id === chapter.chapter);
      button.type = "button";
      button.textContent = region.name;
      button.setAttribute("aria-pressed", String(index === chapterIndex));
      button.addEventListener("click", () => {
        showChapterChoices(index);
        chapterTabs.children[index].focus({ preventScroll: true });
      });
      chapterTabs.append(button);
    });
    stageList.replaceChildren();
    stages.forEach((level, index) => {
      if (level.chapterIndex !== chapterIndex) return;
      const button = document.createElement("button");
      const label = document.createElement("span");
      const result = document.createElement("span");
      const record = progress.records[level.id];
      button.type = "button";
      button.className = "secondary stage-choice";
      button.disabled = index >= progress.unlocked;
      label.textContent = `${level.act}. ${level.name}`;
      result.className = "stage-record";
      if (button.disabled) result.textContent = "未解锁";
      else if (Number.isFinite(record?.time)) result.textContent = `✦ ${record.stars} · ${timeText(record.time)}`;
      button.append(label, result);
      button.addEventListener("click", () => beginStage(index));
      stageList.append(button);
    });
  }

  function chooseStage() {
    const chapterIndex = state.level.chapterIndex;
    showChapterChoices(chapterIndex);
    setMode("select", chapterTabs.children[chapterIndex]);
  }

  function showDemo(index) {
    runKind = "demo";
    activateAudio();
    loadStage(index);
    configurePilot(pilot.create(state.level));
    playStage();
  }

  function saveProgress() {
    try {
      localStorage.setItem(progressKey, JSON.stringify(progress));
    } catch {
      // The current session can still unlock and replay stages.
    }
  }

  function recordClear() {
    progress.unlocked = Math.min(stages.length, Math.max(progress.unlocked, stageIndex + 2));
    const id = state.level.id;
    const record = progress.records[id];
    progress.records[id] = {
      time: Math.min(state.elapsed, Number.isFinite(record?.time) ? record.time : Infinity),
      stars: Math.max(state.starsCollected, Number.isFinite(record?.stars) ? record.stars : 0),
    };
    saveProgress();
  }

  function showClear() {
    const lastStage = stageIndex === stages.length - 1;
    clearTitle.textContent =
      runKind === "demo"
        ? "AI 演示结束"
        : lastStage && runKind === "human"
          ? "五个世界全部通关！"
          : `${state.level.name} · 完成`;
    const stars = state.level.coins.filter((coin) => coin.star).length;
    const result = `${timeText(state.elapsed)} · ${state.coinsCollected} 枚金币 · ${state.starsCollected}/${stars} 颗星星 · ${state.deaths} 次失误`;
    clearSummary.textContent = runKind === "practice" ? `练习 · ${result}` : result;
    nextStage.hidden = lastStage || runKind !== "human";
    replay.textContent = runKind === "demo" ? "再看一遍" : "再玩本关";
    const resultMode =
      runKind === "demo" ? "demoClear" : lastStage && runKind === "human" ? "campaignClear" : "stageClear";
    setMode(resultMode, nextStage.hidden ? replay : nextStage);
  }

  function showRecovery() {
    clearAt = 0;
    const { level } = state;
    if (runKind === "demo") {
      if (stageIndex < stages.length - 1) showDemo(stageIndex + 1);
      else showClear();
      return;
    }
    if (runKind !== "human" || !level.chapterFinal) {
      showClear();
      return;
    }
    const chapter = story.chapters[level.chapter];
    const finalChapter = stageIndex === stages.length - 1;
    tellStory(
      "chapterClear",
      `星铃碎片 · ${level.chapterIndex + 1}/${chapters.length}`,
      `找回${chapter.shard}`,
      chapter.recovery,
      finalChapter ? "迎接黎明" : "查看成绩",
      finalChapter
        ? () => tellStory("storyEnding", "终章", "黎明回来了", story.ending, "查看成绩", showClear)
        : showClear,
    );
  }

  function isJumpHeld() {
    return jumpPointer !== null || jumpKeys.some((key) => pressed.has(key));
  }

  function currentInput() {
    const right = pressed.has("KeyD") || pressed.has("ArrowRight");
    const left = pressed.has("KeyA") || pressed.has("ArrowLeft");
    const forward = pressed.has("KeyW") || pressed.has("ArrowUp");
    const back = pressed.has("KeyS") || pressed.has("ArrowDown");
    return {
      x: Number(left) - Number(right) + touchX,
      z: Number(forward) - Number(back) + touchZ,
      jump: isJumpHeld(),
      jumpPressed,
      restartPressed,
    };
  }

  function tickSimulation(input, dt) {
    simulation.step(state, input, dt);
    renderer.effects(state.events);
    for (const event of state.events) {
      playSound(event);
      if (event.type === "checkpoint") setStatus("检查点已激活");
      if (event.type === "coin" && event.star) setStatus("找到一颗隐藏星星");
      if (event.type === "relay") {
        const total = state.relays.length;
        setStatus(state.relaysActivated === total ? "星门已开启" : `信标已点亮 · ${event.active}/${total}`);
      }
      if (event.type === "goalLocked") {
        setStatus(`星门尚未开启 · 还剩 ${state.relays.length - state.relaysActivated} 座信标`);
      }
      if (event.type === "respawn") setStatus(state.checkpoint ? "从检查点继续" : "从起点继续", 1);
      if (event.type === "goal") {
        if (runKind === "human") recordClear();
        if (autopilot) pilot.advance(autopilot, state, pilot.tick);
        clearAt = lastFrame + 900;
      }
    }
  }

  function advanceGame(dt) {
    if (!autopilot) {
      tickSimulation(currentInput(), dt);
      jumpPressed = false;
      restartPressed = false;
    } else {
      autoTime += dt;
      while (autoTime >= pilot.tick && !state.finished && autopilot.status === "running") {
        autoTime -= pilot.tick;
        const input = pilot.advance(autopilot, state, pilot.tick);
        if (autopilot.status === "failed") {
          aiLabel.textContent = "AI 已停下";
          setStatus(autopilot.message, 4);
          break;
        }
        tickSimulation(input, pilot.tick);
      }
    }
    updateHUD();
  }

  function frame(timestamp) {
    const dt = lastFrame ? Math.min(0.05, (timestamp - lastFrame) / 1000) : 1 / 60;
    lastFrame = timestamp;
    if (status.textContent && statusUntil <= timestamp) status.textContent = "";
    if (mode === "playing") {
      if (!state.finished) advanceGame(dt);
      if (clearAt && timestamp >= clearAt) showRecovery();
    }
    renderer.render(state, dt);
    requestAnimationFrame(frame);
  }

  function togglePause() {
    if (mode === "playing" && !state.finished) setMode("paused", resume);
    else if (mode === "paused") setMode("playing", canvas);
  }

  function updateStick(event) {
    const bounds = movePad.getBoundingClientRect();
    const radius = bounds.width * 0.35;
    const x = (event.clientX - bounds.left - bounds.width / 2) / radius;
    const y = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const distance = Math.hypot(x, y);
    const strength = Math.max(0, Math.min(1, (distance - 0.09) / 0.91));
    const scale = distance ? strength / distance : 0;
    touchX = -x * scale;
    touchZ = -y * scale;
    stick.style.setProperty("--stick-x", `${x * scale * radius}px`);
    stick.style.setProperty("--stick-y", `${y * scale * radius}px`);
  }

  try {
    renderer = window.NiuJourneyRenderer.create(canvas, window.NiuModels.buildCalf);
    showTitle();
  } catch (error) {
    const message = document.getElementById("loading-error");
    message.textContent = "游戏画面加载失败。请打开硬件加速，或换一个支持 WebGL 的浏览器重试。";
    message.hidden = false;
    start.disabled = stageSelect.disabled = demoStart.disabled = mute.disabled = true;
    console.error(error);
    return;
  }

  updateMute();
  demoStart.disabled = !pilot;
  start.addEventListener("click", () => beginStage(progress.unlocked - 1));
  demoStart.addEventListener("click", () => showDemo(0));
  takeControl.addEventListener("click", () => {
    runKind = "practice";
    configurePilot(null);
    setStatus("已接管 · 本幕为练习", 2.5);
    playStage();
  });
  storyContinue.addEventListener("click", () => {
    const next = advanceStory;
    advanceStory = undefined;
    next?.();
  });
  stageSelect.addEventListener("click", chooseStage);
  pause.addEventListener("click", togglePause);
  resume.addEventListener("click", togglePause);
  restart.addEventListener("click", () => {
    togglePause();
    restartPressed = true;
  });
  replay.addEventListener("click", () => (runKind === "demo" ? showDemo(0) : beginStage(stageIndex)));
  nextStage.addEventListener("click", () => beginStage(stageIndex + 1));
  mute.addEventListener("click", toggleMute);
  returnRelay.addEventListener("click", () => {
    restartPressed = true;
    canvas.focus({ preventScroll: true });
  });
  for (const button of document.querySelectorAll(".home")) button.addEventListener("click", showTitle);

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.code;
    if (key === "Escape" && mode === "select") showTitle();
    if ((key === "Escape" || key === "KeyP") && !event.repeat) togglePause();
    if (key === "KeyM" && !event.repeat) toggleMute();
    if (mode !== "playing" || autopilot) return;
    if (directions.includes(key) || jumpKeys.includes(key) || key === "KeyR") event.preventDefault();
    if (jumpKeys.includes(key) && !event.repeat && !isJumpHeld()) jumpPressed = true;
    if (key === "KeyR" && !event.repeat) restartPressed = true;
    pressed.add(key);
  });
  window.addEventListener("keyup", (event) => pressed.delete(event.code));
  window.addEventListener("blur", resetControls);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && mode === "playing") togglePause();
  });
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    if (mode === "playing") togglePause();
  });

  movePad.addEventListener("pointerdown", (event) => {
    if (stickPointer !== null) return;
    event.preventDefault();
    stickPointer = event.pointerId;
    movePad.setPointerCapture(stickPointer);
    updateStick(event);
  });
  movePad.addEventListener("pointermove", (event) => {
    if (event.pointerId === stickPointer) updateStick(event);
  });
  jumpPad.addEventListener("pointerdown", (event) => {
    if (jumpPointer !== null) return;
    event.preventDefault();
    if (!isJumpHeld()) jumpPressed = true;
    jumpPointer = event.pointerId;
    jumpPad.setPointerCapture(jumpPointer);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    movePad.addEventListener(name, (event) => {
      if (event.pointerId !== stickPointer) return;
      stickPointer = null;
      touchX = touchZ = 0;
      stick.style.removeProperty("--stick-x");
      stick.style.removeProperty("--stick-y");
    });
    jumpPad.addEventListener(name, (event) => {
      if (event.pointerId === jumpPointer) jumpPointer = null;
    });
  }

  if (new URLSearchParams(window.location.search).get("e2e") === "1") {
    window.NiuJourneyTest = Object.freeze({
      snapshot() {
        const { x, y, z, vx, vy, vz, grounded, facing } = state.player;
        return {
          mode,
          stageIndex,
          stageCount: stages.length,
          chapterIndex: state.level.chapterIndex,
          act: state.level.act,
          autoplay: Boolean(autopilot),
          aiStatus: autopilot?.status ?? null,
          player: { x, y, z, vx, vy, vz, grounded, facing },
          checkpoint: state.checkpoint && { ...state.checkpoint },
          deaths: state.deaths,
          coinsCollected: state.coinsCollected,
          starsCollected: state.starsCollected,
          relaysActivated: state.relaysActivated,
          relayTotal: state.relays.length,
          elapsed: state.elapsed,
          finished: state.finished,
          unlocked: progress.unlocked,
        };
      },
    });
  }

  requestAnimationFrame(frame);
})();
