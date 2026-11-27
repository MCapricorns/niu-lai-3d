"use strict";

(function () {
  const TAU = Math.PI * 2;
  const RADIUS = 0.29;
  const BODY_HEIGHT = 1.13;
  const JOIN_MARGIN = 0.015;
  const STEP = 1 / 120;
  const tuning = Object.freeze({
    speed: 7.8,
    jumpSpeed: 15.2,
    doubleJumpSpeed: 12.2,
    springSpeed: 20.5,
    gravity: 34,
    fallGravity: 37,
    shortJumpSpeed: 6.5,
    coyoteTime: 0.11,
    jumpBuffer: 0.13,
    crumbleDelay: 0.7,
    respawnDelay: 0.43,
    platformHeight: 0.75,
    spikeHeight: 0.75,
  });

  function touchesRect(x, z, rect, radius, inset = 0) {
    const dx = Math.max(0, Math.abs(x - rect.x) - Math.max(0, rect.w / 2 - inset));
    const dz = Math.max(0, Math.abs(z - rect.z) - Math.max(0, rect.d / 2 - inset));
    return dx * dx + dz * dz < radius * radius;
  }

  function platformAt(state, x, y, z) {
    return (
      state.platforms.find(
        (platform) => platform.active && Math.abs(platform.y - y) <= JOIN_MARGIN && touchesRect(x, z, platform, RADIUS),
      ) ?? null
    );
  }

  function emit(state, type, point, details) {
    state.events.push({ type, x: point.x, y: point.y, z: point.z, ...details });
  }

  function positionPlatforms(state) {
    for (let i = 0; i < state.platforms.length; i++) {
      const base = state.level.platforms[i];
      const platform = state.platforms[i];
      if (!base.motion) continue;
      const motion = base.motion;
      const progress = (1 - Math.cos((state.worldTime * TAU) / motion.period + (motion.phase ?? 0))) / 2;
      platform.x = base.x + (motion.x ?? 0) * progress;
      platform.y = base.y + (motion.y ?? 0) * progress;
      platform.z = base.z + (motion.z ?? 0) * progress;
    }
  }

  function animateSpikes(state) {
    for (const spike of state.spikes) {
      if (!spike.pulse) continue;
      const { period, on, phase = 0 } = spike.pulse;
      const time = (((state.worldTime + phase) % period) + period) % period;
      const warning = Math.min(0.45, (period - on) * 0.65);
      const retract = Math.min(0.13, period - on - warning);
      spike.warning = 0;
      if (time < on) {
        spike.extension = 0.65 + 0.35 * Math.min(1, time / 0.085);
      } else if (time < on + retract) {
        spike.extension = 1 - (0.95 * (time - on)) / retract;
      } else if (time > period - warning) {
        spike.warning = (time + warning - period) / warning;
        spike.extension = 0.05 + 0.59 * spike.warning;
      } else {
        spike.extension = 0.05;
      }
    }
  }

  function resetPlayer(state, spawn) {
    const support = platformAt(state, spawn.x, spawn.y, spawn.z);
    Object.assign(state.player, {
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      vx: 0,
      vy: 0,
      vz: 0,
      windX: 0,
      windZ: 0,
      facing: spawn.facing ?? 0,
      grounded: Boolean(support),
      support,
      airJump: true,
      cuttable: false,
      coyote: support ? tuning.coyoteTime : 0,
      buffer: 0,
    });
  }

  function create(level) {
    const state = {
      level,
      player: {},
      platforms: level.platforms.map((platform) => ({
        ...platform,
        h: platform.h ?? tuning.platformHeight,
        active: true,
        crumbling: false,
        crumbleTime: 0,
      })),
      spikes: level.spikes.map((spike) => ({
        ...spike,
        h: spike.h ?? tuning.spikeHeight,
        extension: 1,
        warning: 0,
      })),
      coins: level.coins.map((coin) => ({ ...coin, collected: false })),
      relays: (level.relays ?? []).map((relay) => ({ ...relay, active: false })),
      winds: level.winds ?? [],
      coinsCollected: 0,
      starsCollected: 0,
      relaysActivated: 0,
      checkpoint: null,
      checkpointIndex: -1,
      elapsed: 0,
      worldTime: 0,
      deaths: 0,
      respawn: 0,
      finished: false,
      insideGoal: false,
      events: [],
    };
    positionPlatforms(state);
    animateSpikes(state);
    resetPlayer(state, level.spawn);
    return state;
  }

  function resetWorld(state) {
    for (const platform of state.platforms) {
      platform.active = true;
      platform.crumbling = false;
      platform.crumbleTime = 0;
    }
    state.worldTime = 0;
    state.insideGoal = false;
    positionPlatforms(state);
    animateSpikes(state);
    resetPlayer(state, state.checkpoint ?? state.level.spawn);
    emit(state, "respawn", state.player);
  }

  function die(state, cause) {
    state.deaths++;
    state.respawn = tuning.respawnDelay;
    state.player.grounded = false;
    state.player.support = null;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.vz = 0;
    emit(state, "death", state.player, { cause });
  }

  function moveHorizontal(state, axis, distance) {
    if (distance === 0) return;
    const player = state.player;
    const other = axis === "x" ? "z" : "x";
    const size = axis === "x" ? "w" : "d";
    const otherSize = axis === "x" ? "d" : "w";
    const sign = Math.sign(distance);
    let target = player[axis] + distance;
    for (const platform of state.platforms) {
      if (
        !platform.active ||
        player.y >= platform.y - JOIN_MARGIN ||
        player.y + BODY_HEIGHT <= platform.y - platform.h + JOIN_MARGIN
      ) {
        continue;
      }
      const across = Math.max(0, Math.abs(player[other] - platform[other]) - platform[otherSize] / 2);
      if (across >= RADIUS) continue;
      const reach = Math.sqrt(RADIUS * RADIUS - across * across);
      const edge = platform[axis] - sign * (platform[size] / 2 + reach);
      if (sign * (player[axis] - edge) <= JOIN_MARGIN && sign * (target - edge) > 0) {
        target = edge;
        if (axis === "x") player.vx = player.windX = 0;
        else player.vz = player.windZ = 0;
      }
    }
    player[axis] = target;
  }

  function moveVertical(state, dy) {
    const player = state.player;
    let target = player.y + dy;
    let support = null;
    for (const platform of state.platforms) {
      if (!platform.active || !touchesRect(player.x, player.z, platform, RADIUS)) continue;
      const top = platform.y;
      const bottom = top - platform.h - BODY_HEIGHT;
      if (dy <= 0 && player.y >= top - JOIN_MARGIN && target <= top) {
        target = top;
        support = platform;
      } else if (dy > 0 && player.y <= bottom + JOIN_MARGIN && target > bottom) {
        target = bottom;
        player.vy = 0;
        player.cuttable = false;
      }
    }
    player.y = target;
    return support;
  }

  function launch(state, speed, type) {
    const player = state.player;
    player.vy = speed;
    player.support = null;
    player.grounded = false;
    player.coyote = 0;
    player.buffer = 0;
    player.cuttable = type !== "spring";
    emit(state, type, player);
  }

  function steer(player, x, z, dt) {
    const moving = x !== 0 || z !== 0;
    const acceleration = player.grounded ? (moving ? 38 : 46) : moving ? 25 : 9;
    const dx = x * tuning.speed - (player.vx - player.windX);
    const dz = z * tuning.speed - (player.vz - player.windZ);
    const length = Math.hypot(dx, dz);
    const approach = length ? Math.min(1, (acceleration * dt) / length) : 0;
    player.vx += dx * approach;
    player.vz += dz * approach;
    if (moving) player.facing = Math.atan2(x, z);
  }

  function updateWind(state, dt) {
    const { player } = state;
    player.vx -= player.windX;
    player.vz -= player.windZ;
    if (player.grounded) {
      player.windX = 0;
      player.windZ = 0;
      return;
    }
    let windX = 0;
    let windY = 0;
    let windZ = 0;
    const center = player.y + BODY_HEIGHT / 2;
    for (const wind of state.winds) {
      if (
        center > wind.y &&
        center < wind.y + wind.h &&
        Math.abs(player.x - wind.x) < wind.w / 2 &&
        Math.abs(player.z - wind.z) < wind.d / 2
      ) {
        windX += wind.vx ?? 0;
        windY += wind.vy ?? 0;
        windZ += wind.vz ?? 0;
      }
    }
    const drag = Math.exp(-2.8 * dt);
    player.windX = player.windX * drag + windX * dt;
    player.windZ = player.windZ * drag + windZ * dt;
    player.vx += player.windX;
    player.vy += windY * dt;
    player.vz += player.windZ;
  }

  function updatePlatforms(state, dt) {
    const player = state.player;
    const support = player.support;
    const supportX = support?.x;
    const supportY = support?.y;
    const supportZ = support?.z;
    state.worldTime += dt;
    positionPlatforms(state);
    animateSpikes(state);

    for (const platform of state.platforms) {
      if (!platform.active || !platform.crumbling) continue;
      platform.crumbleTime += dt;
      if (platform.crumbleTime >= tuning.crumbleDelay) {
        platform.active = false;
        emit(state, "crumble", platform);
      }
    }

    if (support?.active && support.motion) {
      player.y += support.y - supportY;
      moveHorizontal(state, "x", support.x - supportX);
      moveHorizontal(state, "z", support.z - supportZ);
    }
  }

  function aboutToLand(state) {
    const player = state.player;
    if (player.vy >= 0) return false;
    const horizon = 0.085;
    const reach = player.y + player.vy * horizon - (tuning.fallGravity * horizon * horizon) / 2;
    return state.platforms.some(
      (platform) =>
        platform.active &&
        platform.y <= player.y &&
        platform.y >= reach &&
        touchesRect(player.x + player.vx * horizon, player.z + player.vz * horizon, platform, RADIUS),
    );
  }

  function updatePlayer(state, input, dt) {
    const player = state.player;
    const previousSupport = player.support;
    player.buffer = Math.max(0, player.buffer - dt);
    player.coyote = previousSupport?.active ? tuning.coyoteTime : Math.max(0, player.coyote - dt);
    if (input.jumpPressed) player.buffer = tuning.jumpBuffer;

    steer(player, input.x, input.z, dt);
    if (player.buffer > 0 && player.coyote > 0) {
      launch(state, tuning.jumpSpeed, "jump");
    } else if (input.jumpPressed && player.airJump && !aboutToLand(state)) {
      player.airJump = false;
      launch(state, tuning.doubleJumpSpeed, "doubleJump");
    }
    if (player.cuttable && !input.jump && !input.jumpPressed) {
      player.vy = Math.min(player.vy, tuning.shortJumpSpeed);
      player.cuttable = false;
    }

    if (state.winds.length) updateWind(state, dt);
    player.vy -= (player.vy > 0 ? tuning.gravity : tuning.fallGravity) * dt;
    moveHorizontal(state, "x", player.vx * dt);
    moveHorizontal(state, "z", player.vz * dt);
    const support = moveVertical(state, player.vy * dt);
    player.grounded = Boolean(support);
    player.support = support;
    if (!support) return;

    const landingSpeed = -player.vy;
    player.vy = 0;
    player.airJump = true;
    player.cuttable = false;
    if (support.crumble) support.crumbling = true;
    if (support.spring && previousSupport !== support) {
      launch(state, tuning.springSpeed, "spring");
    } else if (!previousSupport && landingSpeed > 1.7) {
      emit(state, "land", player, { speed: landingSpeed });
    }
  }

  function touchesMarker(player, marker, radius) {
    return Math.abs(player.y - marker.y) < 0.52 && Math.hypot(player.x - marker.x, player.z - marker.z) < radius;
  }

  function updateInteractions(state) {
    const { level, player } = state;
    if (player.y < (level.fallY ?? -9)) {
      die(state, "fall");
      return;
    }
    for (const spike of state.spikes) {
      if (spike.extension < 0.65) continue;
      const top = spike.y + spike.h * spike.extension * 0.86;
      if (
        player.y < top &&
        player.y + BODY_HEIGHT > spike.y + 0.05 &&
        touchesRect(player.x, player.z, spike, RADIUS * 0.72, 0.1)
      ) {
        die(state, "spike");
        return;
      }
    }
    for (const coin of state.coins) {
      const radius = coin.star ? 0.89 : 0.72;
      if (!coin.collected && Math.hypot(player.x - coin.x, player.y + 0.56 - coin.y, player.z - coin.z) < radius) {
        coin.collected = true;
        if (coin.star) state.starsCollected++;
        else state.coinsCollected++;
        emit(state, "coin", coin, { star: Boolean(coin.star) });
      }
    }
    for (let i = state.checkpointIndex + 1; i < level.checkpoints.length; i++) {
      const checkpoint = level.checkpoints[i];
      if (touchesMarker(player, checkpoint, 0.95)) {
        state.checkpoint = checkpoint;
        state.checkpointIndex = i;
        emit(state, "checkpoint", checkpoint, { index: i });
        break;
      }
    }
    for (let i = 0; i < state.relays.length; i++) {
      const relay = state.relays[i];
      if (!relay.active && player.grounded && touchesMarker(player, relay, 0.95)) {
        relay.active = true;
        state.relaysActivated++;
        emit(state, "relay", relay, { index: i, active: state.relaysActivated, total: state.relays.length });
      }
    }
    const insideGoal = touchesMarker(player, level.goal, 0.95);
    if (insideGoal && state.relaysActivated === state.relays.length) {
      state.finished = true;
      emit(state, "goal", level.goal);
    } else if (insideGoal && !state.insideGoal) {
      emit(state, "goalLocked", level.goal, { active: state.relaysActivated, total: state.relays.length });
    }
    state.insideGoal = insideGoal;
  }

  function step(state, input, dt) {
    state.events.length = 0;
    if (state.finished || !(dt > 0)) return;
    let remaining = Math.min(dt, 0.1);
    const x = input.x || 0;
    const z = input.z || 0;
    const length = Math.max(1, Math.hypot(x, z));
    const controls = { x: x / length, z: z / length, jump: input.jump, jumpPressed: input.jumpPressed };
    if (input.restartPressed && state.respawn === 0) {
      if (state.insideGoal) {
        // A player at a locked gate may have passed an earlier beacon before saving.
        const missed = state.relays.find((relay) => !relay.active);
        if (missed && state.checkpoint && state.checkpoint.z >= missed.z) {
          const checkpoints = state.level.checkpoints;
          while (state.checkpointIndex >= 0 && checkpoints[state.checkpointIndex].z >= missed.z) {
            state.checkpointIndex--;
          }
          state.checkpoint = checkpoints[state.checkpointIndex] ?? null;
        }
      }
      die(state, "restart");
    }

    while (remaining > 0.000001 && !state.finished) {
      const frame = Math.min(STEP, remaining);
      remaining -= frame;
      state.elapsed += frame;
      if (state.respawn > 0) {
        state.respawn = Math.max(0, state.respawn - frame);
        if (state.respawn === 0) resetWorld(state);
      } else {
        updatePlatforms(state, frame);
        updatePlayer(state, controls, frame);
        updateInteractions(state);
      }
      controls.jumpPressed = false;
    }
  }

  globalThis.NiuPlatformer = Object.freeze({ create, step, tuning });
})();
