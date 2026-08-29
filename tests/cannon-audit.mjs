import fs from "node:fs";
/* levels.js shares the runtime tile constant with mapengine.js. */
global.window = { ME: { TILE: 40 } };
new Function("window", fs.readFileSync("levels.js", "utf8"))(window);
const LEVELS = window.createNiuLaiLevels(6.283185307);
const T = 40;
const solidLike = new Set([1, 2, 5, 7, 9, 12, 13, 14, 16, 17]);
let bad = 0;
LEVELS.forEach((lv, li) => {
  lv.ents.forEach((e) => {
    if (e.k !== "cannon") return;
    const px = e.x * T + T / 2 - 13;
    const py = e.y * T;
    const w = 36,
      h = 30;
    /* 脚下支撑:脚底行或其下一行是否有实体 */
    const footRow = Math.floor((py + h - 1) / T);
    let support = false;
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = Math.floor((px + 4 + dx * 26) / T);
        if (solidLike.has(lv.get(tx, footRow + dy))) support = true;
      }
    }
    /* 身体嵌墙检查 */
    let embedded = [];
    for (let ty = Math.floor((py + 2) / T); ty <= Math.floor((py + h - 2) / T); ty++) {
      for (let tx = Math.floor((px + 2) / T); tx <= Math.floor((px + w - 2) / T); tx++) {
        if (solidLike.has(lv.get(tx, ty))) embedded.push(tx + "," + ty);
      }
    }
    const flag = !support || embedded.length ? " <<< BAD" : "";
    if (flag) bad++;
    console.log(
      `[${String(li).padStart(2)}] ${lv.name} cannon@(${e.x},${e.y}) support=${support ? "Y" : "N"} embed=[${embedded}]${flag}`,
    );
  });
});
console.log(bad ? `\nBAD: ${bad}` : "\nall cannons OK");
