"use strict";

globalThis.NiuAutoPlay = (() => {
  const tick = 1 / 120;
  const idle = Object.freeze({ x: 0, z: 0, jump: false, jumpPressed: false });
  const compare = {
    "<": (a, b) => a < b,
    ">": (a, b) => a > b,
    "<=": (a, b) => a <= b,
    ">=": (a, b) => a >= b,
  };

  function create(level) {
    const route = level.autoRoute?.length ? level.autoRoute : (campaignRoutes[level.id] ?? []);
    return {
      route,
      index: 0,
      total: route.length,
      action: null,
      status: route.length ? "running" : "failed",
      message: route.length ? "" : "本关没有自动演示路线。",
    };
  }

  function steer(player, x, z, jump = false, jumpPressed = false) {
    const dx = (x - player.x) * 3.25 - player.vx * 0.24;
    const dz = (z - player.z) * 3.25 - player.vz * 0.24;
    const magnitude = Math.max(1, Math.hypot(dx, dz));
    return { x: dx / magnitude, z: dz / magnitude, jump, jumpPressed };
  }

  function fail(ai, message) {
    ai.status = "failed";
    ai.message = message;
    return idle;
  }

  function flight(ai, state, action, dt, options) {
    const { x, z, hold = 1.1, second, launch = true, platform } = options;
    const { player } = state;
    const { frames } = action;
    if (frames === 1 && launch && !state.events.some((event) => event.type === "jump")) {
      return fail(ai, "没有从起跳点跳起来。");
    }
    if (frames > 0 && player.grounded) {
      if (platform && player.support !== platform) return fail(ai, "没有落到移动平台上。");
      if (Math.hypot(x - player.x, z - player.z) >= 2) return fail(ai, "没有落到目标附近。");
      return null;
    }
    if (frames * dt > 1.72) return fail(ai, "没有及时找到落点。");
    const secondFrame = Math.round(second / dt);
    const restartJump = frames === secondFrame;
    const press = (frames === 0 && launch) || restartJump;
    const heldFrames = frames >= secondFrame ? frames - secondFrame : frames;
    const held = heldFrames * dt < hold && frames !== secondFrame - 1;
    return steer(player, x, z, held || press, press);
  }

  function condition(platform, [axis, operator, threshold]) {
    return compare[operator]?.(platform[axis], threshold) === true;
  }

  function ferry(ai, state, action, dt) {
    const [, anchorX, anchorZ, x, z, board, depart] = action.command;
    const { player } = state;
    if (!action.platform) {
      const index = state.level.platforms.findIndex(
        (platform) => platform.motion && platform.x === anchorX && platform.z === anchorZ,
      );
      if (index < 0) return fail(ai, "找不到要搭乘的移动平台。");
      action.base = state.level.platforms[index];
      action.platform = state.platforms[index];
    }

    const base = action.base;
    const moving = action.platform;
    if (action.phase === 0) {
      if (!condition(moving, board)) {
        if (action.frames * dt > base.motion.period + 0.2) return fail(ai, "移动平台没有到达上船位置。");
        return steer(player, player.x, player.z);
      }
      const motion = base.motion;
      const angle = ((state.worldTime + 0.84) * 2 * Math.PI) / motion.period + (motion.phase ?? 0);
      const offset = (1 - Math.cos(angle)) / 2;
      action.destination = {
        x: base.x + (motion.x ?? 0) * offset,
        z: base.z + (motion.z ?? 0) * offset,
        platform: moving,
      };
      action.phase = 1;
      action.frames = 0;
    }

    if (action.phase === 1) {
      const input = flight(ai, state, action, dt, action.destination);
      if (input) return input;
      action.phase = 2;
      action.frames = 0;
    }

    if (action.phase === 2) {
      if (player.support !== moving) return fail(ai, "离开了移动平台。");
      if (!condition(moving, depart)) {
        if (action.frames * dt > base.motion.period + 0.2) return fail(ai, "移动平台没有到达下船位置。");
        return steer(player, moving.x, moving.z);
      }
      action.phase = 3;
      action.frames = 0;
    }

    return flight(ai, state, action, dt, { x, z });
  }

  function spring(ai, state, action, dt) {
    const [, padX, padZ, x, z, second] = action.command;
    if (action.phase === 0) {
      if (!action.frames || !state.events.some((event) => event.type === "spring")) {
        if (action.frames * dt > 1.4) return fail(ai, "没有踩到弹簧台。");
        return steer(state.player, padX, padZ, true, !action.frames);
      }
      action.phase = 1;
      action.frames = 0;
    }
    return flight(ai, state, action, dt, { x, z, second, hold: 1.72, launch: false });
  }

  function commandInput(ai, state, action, dt) {
    const [type, x, z, hold, second] = action.command;
    const { player } = state;
    const elapsed = action.frames * dt;
    switch (type) {
      case "walk":
        if (action.frames && !player.grounded) return fail(ai, "走出了平台边缘。");
        if (action.frames && Math.hypot(x - player.x, z - player.z) < 0.13) return null;
        if (elapsed > 3.5) return fail(ai, "没有走到路标。");
        return steer(player, x, z);
      case "jump":
        return flight(ai, state, action, dt, { x, z, hold, second });
      case "spring":
        return spring(ai, state, action, dt);
      case "ferry":
        return ferry(ai, state, action, dt);
      case "waitForSpike": {
        const spike = state.spikes.find((candidate) => candidate.x === x && candidate.z === z);
        if (!spike?.pulse) return fail(ai, "找不到目标伸缩刺板。");
        const { period, phase = 0 } = spike.pulse;
        const phaseTime = (((state.worldTime + phase) % period) + period) % period;
        if (spike.extension <= 0.06 && spike.warning === 0 && period - phaseTime >= (hold ?? 0.55)) {
          return null;
        }
        if (elapsed > period + 0.1) return fail(ai, "没有等到刺板的安全窗口。");
        return steer(player, action.x, action.z);
      }
      case "wait":
        return elapsed >= x ? null : steer(player, action.x, action.z);
      default:
        return fail(ai, "演示路线包含无效指令。");
    }
  }

  function advance(ai, state, dt = tick) {
    if (state.finished) {
      ai.status = "finished";
      ai.index = ai.total;
      return idle;
    }
    if (ai.status !== "running") return idle;
    if (state.respawn > 0) return fail(ai, "演示碰到了障碍。可以接手继续冒险。");
    if (state.events.some((event) => event.type === "goalLocked")) {
      return fail(ai, "演示结束前还有信标没有点亮。");
    }

    while (ai.index < ai.total) {
      const { x, z } = state.player;
      ai.action ??= { command: ai.route[ai.index], x, z, frames: 0, phase: 0 };
      const input = commandInput(ai, state, ai.action, dt);
      if (input) {
        ai.action.frames++;
        return input;
      }
      ai.index++;
      ai.action = null;
    }
    return fail(ai, "演示路线没有到达终点。");
  }

  // Main routes guide input. Landings, switches, hazards and platform positions
  // still come from the same simulation used by keyboard and touch controls.
  const campaignRoutes = {
    grassland: [
      ["walk", 0, 5.45],
      ["jump", 0, 8.7],
      ["walk", 0, 9.2],
      ["walk", -1.4, 9.15],
      ["jump", -2.6, 13.2],
      ["walk", -1.9, 15],
      ["jump", -0.5, 18.6],
      ["walk", 0.6, 21.2],
      ["jump", 1.95, 24.4],
      ["walk", 1.2, 25.3],
      ["jump", 0.8, 29.65],
      ["walk", 0.8, 29.65],
      ["walk", 0, 32.45],
      ["jump", 0, 35, 0.42],
      ["walk", 0, 36.3],
      ["jump", 0, 39.25, 0.42],
      ["walk", 0, 39.25],
      ["walk", 0, 40.1],
      ["jump", 0, 43.4, 0.42],
      ["jump", -2.85, 46.3],
      ["walk", -2.75, 48.65],
      ["jump", 0, 52.8],
      ["walk", 0, 54.9],
    ],
    "red-canyon": [
      ["walk", -1.3, 5.9],
      ["jump", -3.7, 10.1],
      ["walk", -4, 11.75],
      ["jump", -6.45, 15.05],
      ["walk", -5.98, 16.25],
      ["jump", -2.6, 19],
      ["walk", -0.15, 21.15],
      ["jump", 2.8, 24.15],
      ["walk", 3.05, 24.45],
      ["walk", 3, 25.55],
      ["jump", 3, 30.4],
      ["walk", 3, 30.7],
      ["walk", 1.1, 33.2],
      ["jump", 1.1, 35.15, 0.26],
      ["walk", 1.1, 35.15],
      ["waitForSpike", 1.1, 36.6],
      ["walk", 1.1, 37.45],
      ["walk", 0.55, 38.45],
      ["walk", 0.55, 41.1],
      ["jump", -2.5, 45.1],
      ["walk", -3.85, 46.65],
      ["jump", -6.2, 49.8],
      ["walk", -5.95, 51.25],
      ["jump", -3.1, 54.5],
      ["walk", -3.1, 55],
      ["walk", -1.25, 56.65],
      ["jump", 1.7, 59.7],
      ["walk", 2.65, 62.05],
    ],
    "ember-river": [
      ["walk", 0.8, 6.75],
      ["jump", 2.5, 11.25],
      ["walk", 4.25, 13.2],
      ["ferry", 4.55, 16.7, 3.5, 24.85, ["z", "<", 17], ["z", ">", 21.2]],
      ["walk", 3.65, 24.2],
      ["walk", 2.65, 25.9],
      ["walk", 0.35, 27],
      ["jump", -1.7, 29.17, 0.4],
      ["walk", -1.95, 29.9],
      ["jump", -4.3, 31.55, 0.42],
      ["walk", -4.65, 32.2],
      ["jump", -3.4, 37.3],
      ["jump", -0.1, 41.4],
      ["jump", 3.4, 45.75],
      ["jump", 3.85, 49.5],
      ["walk", 3.5, 50.8],
      ["walk", 2.65, 52.55],
      ["walk", 1.45, 53.5],
      ["jump", -2.1, 56.9],
      ["walk", -3.38, 58.9],
      ["ferry", -4.35, 63.25, 5.12, 68.6, ["x", "<", -3.8], ["x", ">", 3.8]],
      ["walk", 5.15, 71.3],
    ],
    "cloud-step": [
      ["walk", 0.9, 5.2],
      ["jump", 2.45, 9.55],
      ["walk", 2.55, 11.1],
      ["spring", 2.7, 15, -0.5, 18.8],
      ["walk", -2.15, 21.15],
      ["walk", -2.15, 22.1],
      ["jump", -4.9, 25.7],
      ["walk", -5, 26.3],
      ["walk", -5.15, 28.15],
      ["jump", -5.6, 31.6, 0.48],
      ["walk", -5.15, 32.1],
      ["jump", -2.2, 37],
      ["walk", -1, 38.9],
      ["jump", 2.05, 42.9],
      ["walk", 2.85, 44.35],
      ["walk", 3.55, 45.9],
      ["spring", 4.25, 50.3, 1.15, 54],
      ["walk", -1.25, 57],
      ["jump", -4.35, 61.55],
      ["walk", -4.7, 63.6],
    ],
    "compute-core": [
      ["walk", -1.45, 6.95],
      ["jump", -4.1, 11.95],
      ["walk", -3.35, 13.7],
      ["jump", -0.7, 18.35],
      ["walk", 1.5, 20.3],
      ["jump", 1.6, 23.3, 0.42],
      ["walk", 1.6, 24.8],
      ["walk", -1.75, 25.7],
      ["walk", -1.75, 27.7],
      ["walk", 0.3, 28.3],
      ["ferry", 0.3, 31.55, -2.5, 38.4, ["z", "<", 32], ["z", ">", 34.2]],
      ["walk", -2.5, 39.9],
      ["walk", -3.6, 42],
      ["walk", -3.9, 42.6],
      ["jump", -6.25, 46.7],
      ["walk", -5.5, 48.45],
      ["jump", -2.4, 52.8],
      ["jump", 1.65, 57.28],
      ["jump", 4.9, 61.15],
      ["walk", 4.9, 62.95],
      ["spring", 4.15, 67.7, 1.1, 72.3],
      ["walk", 0.75, 73.6],
      ["walk", 0.8, 75.1],
      ["jump", 0.8, 76.9, 0.2],
      ["jump", 0.8, 79.9, 0.42],
      ["walk", 0.8, 80.6],
      ["jump", 0.8, 83.55, 0.42],
      ["jump", 0.5, 86.4, 0.4],
      ["walk", 1.8, 88.1],
      ["walk", 2.7, 89],
      ["jump", 6.3, 93.2],
      ["walk", 7, 95.15],
    ],
  };

  return Object.freeze({ create, advance, tick });
})();
