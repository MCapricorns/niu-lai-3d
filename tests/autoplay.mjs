import assert from "node:assert/strict";
import "../platformer.js";
import "../stages.js";
import "../expedition.js";
import "../highlands.js";
import "../campaign.js";
import "../autoplay.js";

const { NiuAutoPlay, NiuPlatformer, NiuStages } = globalThis;

for (const level of NiuStages) {
  const state = NiuPlatformer.create(level);
  const pilot = NiuAutoPlay.create(level);
  const { player } = state;

  for (let frame = 0; frame < 180 / NiuAutoPlay.tick && pilot.status === "running"; frame++) {
    const { x, y, z } = player;
    const input = NiuAutoPlay.advance(pilot, state);
    assert.ok(player.x === x && player.y === y && player.z === z, `${level.id}: AI moved the player directly`);
    if (pilot.status !== "running") break;
    assert.ok(Math.hypot(input.x, input.z) <= 1.000001, `${level.id}: AI used movement beyond input limits`);
    assert.ok(!input.restartPressed, `${level.id}: AI attempted a restart`);
    NiuPlatformer.step(state, input, NiuAutoPlay.tick);
  }

  const details = `${level.id}: ${pilot.message || "route incomplete"} at ${JSON.stringify(pilot.route[pilot.index])}`;
  assert.equal(pilot.status, "finished", details);
  assert.equal(state.finished, true, details);
  assert.equal(state.deaths, 0, details);
  assert.equal(state.relaysActivated, level.relays.length, details);
  console.log(`${level.name} · 自动通关 ${state.elapsed.toFixed(2)}s · ${state.relaysActivated} 座信标`);
}
