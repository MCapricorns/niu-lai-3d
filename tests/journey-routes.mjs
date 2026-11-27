import assert from "node:assert/strict";
import "../stages.js";
import "../platformer.js";

const { NiuStages, NiuPlatformer } = globalThis;
const DT = 1 / 120;

function testRoute(stage, expected, route) {
  const state = NiuPlatformer.create(stage);
  const player = state.player;
  const events = new Map();
  let frameEvents = [];

  function location() {
    return `${stage.name} @ (${player.x.toFixed(2)}, ${player.y.toFixed(2)}, ${player.z.toFixed(2)})`;
  }

  function distance(x, z) {
    return Math.hypot(x - player.x, z - player.z);
  }

  function drive(x, z, jump = false, jumpPressed = false) {
    // Steer toward an authored waypoint and ease off with enough room to brake.
    // Movement still goes through normal physics, collision and trigger rules.
    const steerX = (x - player.x) * 3.25 - player.vx * 0.24;
    const steerZ = (z - player.z) * 3.25 - player.vz * 0.24;
    const length = Math.max(1, Math.hypot(steerX, steerZ));
    NiuPlatformer.step(state, { x: steerX / length, z: steerZ / length, jump, jumpPressed }, DT);

    frameEvents = state.events.map(({ type }) => type);
    for (const { type, cause } of state.events) {
      assert.notEqual(type, "death", `${location()}: ${cause}`);
      events.set(type, (events.get(type) ?? 0) + 1);
    }
  }

  function walk(x, z) {
    for (let frame = 0; frame < 264; frame++) {
      drive(x, z);
      assert.ok(player.grounded, `${location()}: walked off heading to (${x}, ${z})`);
      if (state.finished || distance(x, z) < 0.13) return;
    }
    assert.fail(`${location()}: could not walk to (${x}, ${z})`);
  }

  function jump(x, z, hold = 1.1, landingPlatform) {
    drive(x, z, true, true);
    assert.ok(frameEvents.includes("jump"), `${location()}: ground jump did not launch`);
    for (let frame = 1; frame < 192; frame++) {
      drive(x, z, frame * DT < hold);
      if (state.finished) return;
      if (player.grounded) {
        if (landingPlatform) assert.equal(player.support, landingPlatform, `${location()}: missed the ferry`);
        assert.ok(distance(x, z) < 2, `${location()}: missed jump waypoint (${x}, ${z})`);
        return;
      }
    }
    assert.fail(`${location()}: could not land at (${x}, ${z})`);
  }

  function spring(padX, padZ, x, z) {
    for (let frame = 0; frame < 134; frame++) {
      drive(padX, padZ, true, frame === 0);
      if (frameEvents.includes("spring")) {
        for (let flight = 0; flight < 192; flight++) {
          drive(x, z, true);
          if (player.grounded) {
            assert.ok(distance(x, z) < 2, `${location()}: missed spring landing (${x}, ${z})`);
            return;
          }
        }
        assert.fail(`${location()}: could not land after a spring launch`);
      }
    }
    assert.fail(`${location()}: could not launch from spring (${padX}, ${padZ})`);
  }

  function ferry(anchorX, anchorZ, x, z, readyToBoard, readyToLeave) {
    const index = stage.platforms.findIndex(
      (platform) => platform.motion && platform.x === anchorX && platform.z === anchorZ,
    );
    assert.ok(index >= 0, `${location()}: missing moving platform (${anchorX}, ${anchorZ})`);
    const base = stage.platforms[index];
    const moving = state.platforms[index];
    for (let frame = 0; frame < 960 && !readyToBoard(moving); frame++) drive(player.x, player.z);
    assert.ok(readyToBoard(moving), `${location()}: moving platform did not arrive`);

    // Aim at the ship's position near the end of a full-height jump.
    const motion = base.motion;
    const direction = ((state.worldTime + 0.84) * Math.PI * 2) / motion.period + (motion.phase ?? 0);
    const offset = (1 - Math.cos(direction)) / 2;
    jump(base.x + (motion.x ?? 0) * offset, base.z + (motion.z ?? 0) * offset, 1.1, moving);
    for (let frame = 0; frame < 960 && !readyToLeave(moving); frame++) drive(moving.x, moving.z);
    assert.ok(readyToLeave(moving), `${location()}: moving platform did not approach the destination`);
    assert.equal(player.support, moving, `${location()}: the moving platform lost its rider`);
    jump(x, z);
  }

  function waitForSpike(x, z) {
    const spike = state.spikes.find((candidate) => candidate.x === x && candidate.z === z);
    assert.ok(spike?.pulse, `${location()}: missing retractable spike row (${x}, ${z})`);
    const waitX = player.x;
    const waitZ = player.z;
    for (let frame = 0; frame <= Math.ceil(spike.pulse.period / DT); frame++) {
      if (spike.extension <= 0.06 && spike.warning === 0) return;
      drive(waitX, waitZ);
    }
    assert.fail(`${location()}: spike row never retracted`);
  }

  route({ walk, jump, spring, ferry, waitForSpike });

  assert.ok(state.finished, `${location()}: goal was not reached`);
  assert.equal(state.deaths, 0, stage.name);
  assert.equal(events.get("checkpoint"), stage.checkpoints.length, `${stage.name}: checkpoint was skipped`);
  assert.equal(events.get("relay"), stage.relays.length, `${stage.name}: relay was skipped`);
  assert.ok(state.coinsCollected > 0, `${stage.name}: the route never collected a bell`);
  for (const [type, minimum] of Object.entries(expected)) {
    assert.ok((events.get(type) ?? 0) >= minimum, `${stage.name}: expected at least ${minimum} ${type} events`);
  }
  console.log(
    `${stage.name} · ${state.elapsed.toFixed(2)}s · ${state.relaysActivated} 座信标 · ${stage.checkpoints.length} 个检查点 · 0 次失误`,
  );
}

const [meadow, canyon, lava, clouds, core] = NiuStages;

testRoute(meadow, { jump: 10 }, ({ walk, jump }) => {
  // First spike row and the low cliff fork.
  walk(0, 5.45);
  jump(0, 8.7);
  walk(0, 9.2);
  walk(-1.4, 9.15);
  jump(-2.6, 13.2);
  walk(-1.9, 15);
  jump(-0.5, 18.6);
  walk(0.6, 21.2);
  jump(1.95, 24.4);
  walk(1.2, 25.3);
  jump(0.8, 29.65);
  walk(0.8, 29.65);

  // Hop each spike strip, then take the wide final landing.
  walk(0, 32.45);
  jump(0, 35, 0.42);
  walk(0, 36.3);
  jump(0, 39.25, 0.42);
  walk(0, 39.25);
  walk(0, 40.1);
  jump(0, 43.4, 0.42);
  jump(-2.85, 46.3);
  walk(-2.75, 48.65);
  jump(0, 52.8);
  walk(0, 54.9);
});

testRoute(canyon, { jump: 10 }, ({ walk, jump, waitForSpike }) => {
  // Rise around the canyon walls to the checkpoint.
  walk(-1.3, 5.9);
  jump(-3.7, 10.1);
  walk(-4, 11.75);
  jump(-6.45, 15.05);
  walk(-5.98, 16.25);
  jump(-2.6, 19);
  walk(-0.15, 21.15);
  jump(2.8, 24.15);
  walk(3.05, 24.45);
  walk(3, 25.55);
  jump(3, 30.4);
  walk(3, 30.7);

  // Walk the retracted first row and change lanes for the second one.
  walk(1.1, 33.2);
  jump(1.1, 35.15, 0.26);
  walk(1.1, 35.15);
  waitForSpike(1.1, 36.6);
  walk(1.1, 37.45);
  walk(0.55, 38.45);
  walk(0.55, 41.1);
  jump(-2.5, 45.1);
  walk(-3.85, 46.65);
  jump(-6.2, 49.8);
  walk(-5.95, 51.25);
  jump(-3.1, 54.5);
  walk(-3.1, 55);
  walk(-1.25, 56.65);
  jump(1.7, 59.7);
  walk(2.65, 62.05);
});

testRoute(lava, { crumble: 3 }, ({ walk, jump, ferry }) => {
  // Ride the longitudinal ferry.
  walk(0.8, 6.75);
  jump(2.5, 11.25);
  walk(4.25, 13.2);
  ferry(
    4.55,
    16.7,
    3.5,
    24.85,
    (ship) => ship.z < 17,
    (ship) => ship.z > 21.2,
  );
  walk(3.65, 24.2);
  walk(2.65, 25.9);

  // Clear the spike row and all three crumbling ledges.
  walk(0.35, 27);
  jump(-1.7, 29.17, 0.4);
  walk(-1.95, 29.9);
  jump(-4.3, 31.55, 0.42);
  walk(-4.65, 32.2);
  jump(-3.4, 37.3);
  jump(-0.1, 41.4);
  jump(3.4, 45.75);
  jump(3.85, 49.5);
  walk(3.5, 50.8);
  walk(2.65, 52.55);

  // The last ferry carries the rider sideways.
  walk(1.45, 53.5);
  jump(-2.1, 56.9);
  walk(-3.38, 58.9);
  ferry(
    -4.35,
    63.25,
    5.12,
    68.6,
    (ship) => ship.x < -3.8,
    (ship) => ship.x > 3.8,
  );
  walk(5.15, 71.3);
});

testRoute(clouds, { spring: 2 }, ({ walk, jump, spring }) => {
  walk(0.9, 5.2);
  jump(2.45, 9.55);
  walk(2.55, 11.1);
  spring(2.7, 15, -0.5, 18.8);
  walk(-2.15, 21.15);
  walk(-2.15, 22.1);
  jump(-4.9, 25.7);
  walk(-5, 26.3);

  walk(-5.15, 28.15);
  jump(-5.6, 31.6, 0.48);
  walk(-5.15, 32.1);
  jump(-2.2, 37);
  walk(-1, 38.9);
  jump(2.05, 42.9);
  walk(2.85, 44.35);
  walk(3.55, 45.9);
  spring(4.25, 50.3, 1.15, 54);
  walk(-1.25, 57);
  jump(-4.35, 61.55);
  walk(-4.7, 63.6);
});

testRoute(core, { crumble: 2, spring: 1 }, ({ walk, jump, spring, ferry }) => {
  // Weave through the spike rows to the sloping lift.
  walk(-1.45, 6.95);
  jump(-4.1, 11.95);
  walk(-3.35, 13.7);
  jump(-0.7, 18.35);
  walk(1.5, 20.3);
  jump(1.6, 23.3, 0.42);
  walk(1.6, 24.8);
  walk(-1.75, 25.7);
  walk(-1.75, 27.7);
  walk(0.3, 28.3);
  ferry(
    0.3,
    31.55,
    -2.5,
    38.4,
    (ship) => ship.z < 32,
    (ship) => ship.z > 34.2,
  );
  walk(-2.5, 39.9);
  walk(-3.6, 42);

  // Cross the crumbling upper tier and spring up to the final spike bridge.
  walk(-3.9, 42.6);
  jump(-6.25, 46.7);
  walk(-5.5, 48.45);
  jump(-2.4, 52.8);
  jump(1.65, 57.28);
  jump(4.9, 61.15);
  walk(4.9, 62.95);
  spring(4.15, 67.7, 1.1, 72.3);
  walk(0.75, 73.6);
  walk(0.8, 75.1);
  jump(0.8, 76.9, 0.2);
  jump(0.8, 79.9, 0.42);
  walk(0.8, 80.6);
  jump(0.8, 83.55, 0.42);
  jump(0.5, 86.4, 0.4);
  walk(1.8, 88.1);
  walk(2.7, 89);
  jump(6.3, 93.2);
  walk(7, 95.15);
});
