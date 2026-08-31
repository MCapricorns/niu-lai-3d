"use strict";

/**
 * v3.0.0 "I Wanna Be The Ox" · 单一连续跳刺大地图
 *
 * 直接照抄 IWBTG 系列的流程骨架:
 * - 一张长图从头走到尾,没有选关,没有小关分段;
 * - 每个大段之间放一枚发光存档点(save),碰到即存,死亡从存档点满血复活;
 * - 即死陷阱密度拉满:贴地刺/刺坑/顶刺禁跳道/碎板假桥/炮火走廊/
 *   岩浆跳岛/移动平台摆渡/40px 窄板刺海,一段只考一件事;
 * - 段与段之间留 2-6 格绝对干净的"呼吸平台",失败原因永远可读;
 * - 终点是 GPT 老板守关 + Anthropic Dario 机房决战,打倒即通关。
 *
 * 物理标定(T=40px):小跳顶点≈4.7格 / 二段跳≈4.3格 / 跑跳水平≈5.5格 /
 * 冲跳(Shift)≈9.8格 / 弹簧(按住跳)≈10.8格 / 蹬墙跳≈4.2格。
 *
 * Tile legend:
 * 0 empty, 1 ground, 2 solid, 3 brick, 4 coin box, 5 milk box,
 * 6 star box, 7 bell box, 8 used box, 9 one-way platform, 10 spike,
 * 11 lava, 12 spring, 13 pipe top, 14 pipe body, 15 flag, 16 crumble,
 * 17 gate.
 */
window.createNiuLaiLevels = function createNiuLaiLevels(TAU) {
  var T = window.ME.TILE; /* 瓦片语义与地图引擎共享见 mapengine.js */
  function LV(w, name, theme) {
    this.w = w;
    this.h = 15;
    this.T = new Uint8Array(w * 15);
    this.name = name;
    this.theme = theme;
    this.ents = [];
    this.coins = [];
    this.saves = [];
    this.startX = 3;
    this.flagX = -1; /* 无旗:打倒 Dario 即通关 */
    this.bossAt = -1; /* 玩家越过 bossAt*T 触发 Dario 登场 */
    this.arena = null; /* Dario 竞技场左右墙(瓦片列) */
    this.profile = {
      icon: "☠",
      title: "跳刺试炼",
      challenge: "观察路线",
      tip: "先看清楚，再起跳。",
    };
  }
  LV.prototype.set = function (x, y, c) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.T[y * this.w + x] = c;
  };
  LV.prototype.get = function (x, y) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return 0;
    return this.T[y * this.w + x];
  };
  LV.prototype.fill = function (x1, x2, y1, y2, c) {
    for (var x = x1; x <= x2; x++) for (var y = y1; y <= y2; y++) this.set(x, y, c);
  };
  LV.prototype.walls = function () {
    this.fill(0, 0, 0, 14, T.SOLID);
    this.fill(this.w - 1, this.w - 1, 0, 14, T.SOLID);
  };
  LV.prototype.ground = function (x1, x2) {
    this.fill(x1, x2, 12, 14, T.GROUND);
  };
  LV.prototype.groundAll = function () {
    this.ground(0, this.w - 1);
  };
  LV.prototype.pit = function (x1, x2) {
    this.fill(x1, x2, 10, 14, T.EMPTY);
  };
  /* 实心高台:从 topRow 到 11 行的实心柱群(顶面即 topRow 行) */
  LV.prototype.mesa = function (x1, x2, topRow) {
    this.fill(x1, x2, topRow, 11, T.SOLID);
  };
  LV.prototype.brick = function (x, y, n) {
    for (var i = 0; i < n; i++) this.set(x + i, y, T.BRICK);
  };
  LV.prototype.q = function (x, y, k) {
    this.set(x, y, k === 1 ? T.QMILK : k === 2 ? T.QSTAR : k === 3 ? T.QBELL : T.QCOIN);
  };
  LV.prototype.plat = function (x, y, n) {
    for (var i = 0; i < n; i++) this.set(x + i, y, T.PLAT);
  };
  LV.prototype.solid = function (x, y1, y2) {
    this.fill(x, x, y1, y2, T.SOLID);
  };
  LV.prototype.coin = function (x, y) {
    this.coins.push({ x: x, y: y, t: Math.random() * TAU });
  };
  LV.prototype.coinRow = function (x, y, n) {
    for (var i = 0; i < n; i++) this.coin(x + i, y);
  };
  LV.prototype.coinArc = function (x, y) {
    this.coin(x, y);
    this.coin(x + 1, y - 1);
    this.coin(x + 2, y);
  };
  LV.prototype.ent = function (o) {
    o.k = o.k || "wolf";
    this.ents.push(o);
  };
  LV.prototype.wolf = function (x, y) {
    this.ent({ k: "wolf", x: x, y: y === undefined ? 11 : y });
  };
  LV.prototype.leopard = function (x, y) {
    this.ent({ k: "leopard", x: x, y: y === undefined ? 11 : y });
  };
  LV.prototype.raven = function (x, y) {
    this.ent({ k: "raven", x: x, y: y });
  };
  LV.prototype.miniboss = function (x) {
    this.ent({ k: "miniboss", x: x });
  };
  LV.prototype.spring = function (x, y) {
    this.set(x, y === undefined ? 12 : y, T.SPRING);
  };
  /* 贴地刺带:11 行铺刺(下方 12 行仍是地面),踏进=踩刺,只能跳过 */
  LV.prototype.spikeBelt = function (x1, x2) {
    for (var x = x1; x <= x2; x++) this.set(x, 11, T.SPIKE);
  };
  /* 刺坑:挖 10..14 行,刺贴 11 行。掉进去撞刺,跳不过去就完蛋 */
  LV.prototype.spikePit = function (x1, x2) {
    this.pit(x1, x2);
    for (var x = x1; x <= x2; x++) this.set(x, 11, T.SPIKE);
  };
  /* 顶刺屋檐:y 行连续尖刺(默认 10 行)。站地面走安全,起跳即死 */
  LV.prototype.ceil = function (x1, x2, y) {
    y = y === undefined ? 10 : y;
    for (var x = x1; x <= x2; x++) this.set(x, y, T.SPIKE);
  };
  LV.prototype.lava = function (x, n) {
    for (var i = 0; i < n; i++) {
      this.set(x + i, 12, T.LAVA);
      this.set(x + i, 13, T.LAVA);
      this.set(x + i, 14, T.LAVA);
    }
  };
  LV.prototype.cannon = function (x, y) {
    this.ent({ k: "cannon", x: x, y: y === undefined ? 11.25 : y });
  };
  LV.prototype.mplat = function (x1, y1, x2, y2) {
    this.ents.push({ k: "move", x: x1, y: y1, x2: x2, y2: y2 });
  };
  LV.prototype.cr = function (x, n, y) {
    var ry = y === undefined ? 11 : y;
    for (var i = 0; i < n; i++) this.set(x + i, ry, T.CRUMBLE);
  }; /* 碎板:踩上0.75秒塌 */
  LV.prototype.bigc = function (x, y, n) {
    n = n || 1;
    for (var i = 0; i < n; i++) this.coins.push({ x: x + i, y: y, t: Math.random() * TAU, big: true });
  };
  /* IWBTG 存档点:碰到即存,死亡从这里满状态重来 */
  LV.prototype.save = function (x) {
    this.saves.push({ x: x, y: 11 });
  };
  LV.prototype.setProfile = function (icon, title, challenge, tip) {
    this.profile = { icon: icon, title: title, challenge: challenge, tip: tip };
  };

  var LEVELS = [];
  function defLevel(w, name, theme, fn) {
    var lv = new LV(w, name, theme);
    fn(lv);
    lv.walls();
    LEVELS.push(lv);
  }

  /* ==================== I Wanna Be The Ox · 一张图走到底 ==================== */

  defLevel(264, "I Wanna Be The Ox", 5, function (g) {
    g.startX = 3;
    g.setProfile("☠", "跳刺试炼", "一段一考 · 存档重生 · 死亡计数", "会死很多次。每次都比上一次走得更远。");

    /* —— 0..15 起点平原:呼吸区,把操作热开 —— */
    g.groundAll();
    g.coinRow(8, 10, 3);
    /* 门形砖架:开场教顶砖/坐地重击,金币盒架在门梁正中 */
    g.solid(9, 9, 11);
    g.solid(13, 9, 11);
    g.brick(9, 8, 5);
    g.q(11, 8, 4);

    /* —— 16..43 S1 刺缝入门:刺=死,烙进肌肉 —— */
    g.spikeBelt(18, 19); /* 第一课:2 格贴地刺,跳过去 */
    g.wolf(21); /* 狼的领土 20..23,两侧被刺/坑锁死 */
    g.spikePit(24, 27); /* 4 格刺坑,跑跳 5.5 格正好 */
    g.coinArc(24, 9);
    g.bigc(26, 7);
    g.mesa(31, 32, 11); /* 双丘换气 */
    g.ceil(35, 38); /* 顶刺禁跳道:走,别跳 */
    g.coinRow(35, 11, 4);
    g.spikeBelt(41, 43);

    /* —— 44..50 存档点 1(呼吸平台,绝对干净) —— */
    g.save(47);
    g.coinRow(45, 10, 2);

    /* —— 51..72 S2 碎板假桥:看起来是桥,踩上就倒计时 —— */
    g.pit(53, 60);
    g.cr(53, 8, 12); /* 8 格碎板:跑过去别停 */
    g.coinRow(54, 10, 6);
    g.ground(61, 64);
    g.pit(65, 72);
    g.cr(65, 4, 12); /* 半桥—真空档—半桥:空档 69 要跳 */
    g.cr(70, 3, 12);
    g.coinArc(67, 10);

    /* —— 73..102 S3 炮火走廊:读炮口,等出膛再走 —— */
    g.cannon(82);
    g.mesa(86, 87, 10); /* 掩体 */
    g.spikePit(90, 93); /* 炮后跳沟:在弹丸间隙起跳 */
    g.cannon(96);
    g.ceil(99, 102); /* 子弹来了也只能低走 */
    g.coinRow(99, 11, 4);

    /* —— 103..108 存档点 2 —— */
    g.save(106);

    /* —— 109..130 S4 岩浆跳岛:看见岩浆,先找下一座岛 —— */
    g.lava(111, 3);
    g.mesa(112, 112, 10);
    g.coinArc(111, 9);
    g.lava(117, 4);
    g.mesa(118, 118, 9);
    g.mesa(121, 121, 10);
    g.coin(118, 7);
    g.spring(126); /* 支线:一弹冲天拿奶箱 */
    g.plat(125, 7, 3);
    g.q(126, 6, 5);
    g.lava(129, 2); /* 主路:2 格熔岩缝,小跳就过 */

    /* —— 131..138 存档点 3 —— */
    g.save(135);

    /* —— 139..162 S5 双子摆渡:读平台轨迹,等它回来 —— */
    g.spikePit(140, 151);
    g.mplat(141, 10, 149, 10); /* 平渡(高刺尖一格,站板即明显安全) */
    g.coinRow(144, 9, 3);
    g.ground(152, 153);
    g.spikePit(154, 163);
    g.mplat(155, 10, 159, 8); /* 上行摆渡 */
    g.coin(157, 8);

    /* —— 163..196 S6 窄板刺海:像素级的落点 —— */
    g.save(166); /* 存档点 4(湖岸边) */
    g.spikePit(169, 184);
    g.plat(171, 10, 1);
    g.plat(174, 9, 1);
    g.plat(177, 10, 1);
    g.plat(180, 9, 1); /* 4 块 40px 窄板,3 格间距高低交替,整体高刺尖一格 */
    g.bigc(176, 7);
    g.leopard(189); /* 豹的领土 185..194,东边台阶锁死 */
    g.mesa(195, 196, 11);

    /* —— 197..216 S7 GPT 老板守关:奶弹自动开火 —— */
    g.save(200); /* 存档点 5(老板门前) */
    g.mesa(203, 204, 10);
    g.miniboss(209);
    g.mesa(215, 216, 10);

    /* —— 217..229 最终喘息:存个档,别浪 —— */
    g.save(220); /* 存档点 6(Dario 门前) */
    g.spikeBelt(224, 225);
    g.raven(227, 8); /* 禁跳鸦:低走进场 */

    /* —— 230..263 S8 机房决战:Anthropic Dario —— */
    /* 左墙带 3 格高门洞(9..11 行):进得去,老板出不来 */
    g.solid(230, 0, 8);
    g.solid(230, 12, 14);
    g.ground(231, 262);
    g.plat(235, 9, 4);
    g.plat(254, 9, 4);
    g.plat(244, 5, 6);
    g.coinRow(244, 3, 6);
    g.q(247, 4, 5); /* 决战前的奶 */
    g.arena = { x0: 230, x1: 263 };
    g.bossAt = 236;
  });

  return LEVELS;
};
