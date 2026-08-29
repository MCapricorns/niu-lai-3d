import fs from "node:fs";
/* levels.js shares the runtime tile constant with mapengine.js. */
global.window = { ME: { TILE: 40 } };
const code = fs.readFileSync("levels.js", "utf8");
new Function("window", code)(window);
const LEVELS = window.createNiuLaiLevels(6.283185307);
console.log("levels:", LEVELS.length);
/* 每关体检:出生点安全、旗子存在、无超宽坑/岩浆、检查点机会数量 */
let issues = 0;
LEVELS.forEach((lv, li) => {
  const T = 40;
  const startX = lv.startX * T;
  /* 出生点脚下与头顶 */
  const floor = lv.get(lv.startX, 12);
  if (floor !== 1 && floor !== 2) {
    console.log(`[${li}] ${lv.name}: 出生点脚下 tile=${floor}`);
    issues++;
  }
  let maxPit = 0,
    run = 0,
    maxLava = 0,
    lrun = 0;
  for (let x = 0; x < lv.w; x++) {
    if (lv.get(x, 12) === 0) {
      run++;
      if (run > maxPit) maxPit = run;
    } else run = 0;
    if (lv.get(x, 12) === 11 || lv.get(x, 13) === 11) {
      lrun++;
      if (lrun > maxLava) maxLava = lrun;
    } else lrun = 0;
  }
  /* 检查点机会:统计"平地+头顶净空"的列数 */
  let cpCols = 0;
  for (let x = 0; x < lv.w; x++) {
    const f = lv.get(x, 12),
      h = lv.get(x, 11);
    if ((f === 1 || f === 2) && h === 0) cpCols++;
  }
  console.log(
    `[${String(li).padStart(2)}] ${lv.name.padEnd(10)} w=${lv.w} flagX=${String(lv.flagX).padStart(4)} maxPit=${maxPit} maxLava=${maxLava} cpCols=${cpCols}`,
  );
});
console.log(issues ? `ISSUES: ${issues}` : "no spawn issues");
