"use strict";

/**
 * v3.1.0 "I Wanna Be The Ox" · 单一连续跳刺大地图
 *
 * 直接照抄 IWBTG 系列的流程骨架:
 * - 一张 345 格长图从头走到尾,没有选关,没有小关分段;
 * - 七枚发光存档点(save)把全程切成十一大考段,碰到即存,死亡从存档点满状态重来;
 * - 即死陷阱密度拉满,一段只考一件事:
 *   刺缝入门 → 碎板假桥 → 炮火走廊(平射弹) → 岩浆跳岛 → 弹簧陷阱(满弹上天堂) →
 *   熔岩塔阶+蹬墙井 → 双子摆渡 → 碎板炮火复合 → 窄板刺海 → 豹之领土 →
 *   GPT 老板守关 → 机房决战;
 * - 段与段之间留 2-6 格绝对干净的"呼吸平台",失败原因永远可读;
 * - 终点是 Anthropic Dario 机房决战,打倒即通关。
 *
 * 物理标定(T=40px):小跳顶点≈4.7格 / 二段跳≈4.3格 / 跑跳水平≈5.5格 /
 * 冲跳(Shift)≈9.8格 / 弹簧(点弹≈4.1格,满弹≈10.8格) / 蹬墙跳≈4.2格。
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

  defLevel(345, "I Wanna Be The Ox", 5, function (g) {
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

    /* —— 51..74 S2 碎板假桥:看起来是桥,踩上就倒计时 —— */
    g.pit(53, 60);
    g.cr(53, 8, 12); /* 8 格碎板:跑过去别停 */
    g.coinRow(54, 10, 6);
    g.ground(61, 64);
    g.pit(65, 72);
    g.cr(65, 4, 12); /* 半桥—真空档—半桥:空档 69 要跳 */
    g.cr(70, 3, 12);
    g.coinArc(67, 10);

    /* —— 75..108 S3 炮火走廊:读炮口,平射弹可跳越 —— */
    g.cannon(82);
    g.mesa(86, 87, 10); /* 掩体:弹幕打不进来,看清节奏再走 */
    g.spikePit(90, 93); /* 炮后跳沟:在弹丸间隙起跳 */
    g.cannon(97);
    g.spikeBelt(101, 103); /* 跳带时正好越过贴地平射弹 */
    g.coinRow(101, 9, 3);
    g.ceil(106, 109, 10); /* 顶刺低走(离炮远,弹幕够不到) */
    g.coinRow(106, 11, 4);

    /* —— 109..115 存档点 2 —— */
    g.save(112);

    /* —— 115..136 S4 岩浆跳岛:看见岩浆,先找下一座岛 —— */
    g.lava(117, 3);
    g.mesa(118, 118, 10);
    g.coinArc(117, 9);
    g.lava(123, 4);
    g.mesa(124, 124, 9);
    g.mesa(127, 127, 10);
    g.coin(124, 7);
    g.spring(132); /* 支线:满弹冲天撞奶箱 */
    g.plat(131, 7, 3);
    g.q(132, 6, 5);
    g.lava(135, 2); /* 主路:2 格熔岩缝,小跳就过 */

    /* —— 137..158 S5 弹簧陷阱:点弹上天堂,满弹见上帝 —— */
    g.spring(141);
    g.ceil(139, 143, 2); /* 头顶高刺:按住弹簧=飞进刺里,点弹才安全 */
    g.plat(144, 8, 2); /* 点弹右漂落台 */
    g.coinRow(144, 6, 2);
    g.solid(148, 10, 11); /* 星星柱 */
    g.q(148, 8, 6);
    g.spikeBelt(151, 153);
    g.coinArc(148, 8);

    /* —— 159..161 呼吸 —— */
    g.coinRow(159, 10, 3);

    /* —— 162 存档点 3 —— */
    g.save(162);

    /* —— 163..193 S6 熔岩塔阶+蹬墙井:爬上去,别下来 —— */
    g.lava(168, 3);
    g.mesa(166, 167, 10); /* 台阶1 */
    g.coinArc(167, 9);
    g.lava(173, 3);
    g.mesa(171, 172, 8); /* 台阶2 */
    g.coin(172, 7);
    g.lava(178, 6);
    g.mesa(176, 177, 6); /* 台阶3 */
    g.plat(181, 5, 2); /* 顶部窄板 */
    g.plat(185, 4, 2);
    g.q(185, 2, 7); /* 顶板上的金铃铛 */
    g.mesa(189, 189, 2); /* 蹬墙井左壁(左面可单墙连蹬) */
    g.mesa(192, 192, 2); /* 井右壁:2 格井筒,井底是干净地面,掉下去再爬 */
    g.cr(194, 4, 8); /* 下撤碎板 */
    g.coinRow(194, 6, 4);

    /* —— 194..199 下撤+呼吸;存档点 4 —— */
    g.save(198);

    /* —— 200..223 S7 双子摆渡:读平台轨迹,等它回来 —— */
    g.spikePit(202, 213);
    g.mplat(203, 10, 211, 10); /* 平渡(高刺尖一格) */
    g.coinRow(206, 8, 3);
    g.ground(214, 215);
    g.spikePit(216, 225);
    g.mplat(217, 10, 221, 8); /* 上行摆渡 */
    g.coin(219, 7);

    /* —— 224..247 S8 碎板炮火复合:塌桥上躲平射弹 —— */
    g.cannon(227);
    g.pit(229, 236);
    g.cr(229, 8, 12); /* 8 格碎板桥,炮弹横扫 */
    g.coinRow(230, 10, 4);
    g.ground(237, 246);
    g.cannon(238);
    g.mesa(241, 242, 10); /* 掩体 */
    g.spikeBelt(244, 245);

    /* —— 248..251 呼吸;存档点 5 —— */
    g.save(249);

    /* —— 252..275 S9 窄板刺海:像素级的落点 —— */
    g.spikePit(252, 267);
    g.plat(254, 10, 1);
    g.plat(257, 9, 1);
    g.plat(260, 10, 1);
    g.plat(263, 9, 1); /* 4 块 40px 窄板,3 格间距高低交替 */
    g.bigc(259, 7);
    g.leopard(272); /* 豹的领土 268..277,东边台阶锁死 */
    g.coinRow(270, 10, 3);
    g.mesa(278, 279, 11);

    /* —— 276..288 呼吸;存档点 6 —— */
    g.save(285);

    /* —— 289..308 S10 GPT 老板守关:奶弹自动开火 —— */
    g.mesa(292, 293, 10);
    g.miniboss(298);
    g.mesa(304, 305, 10);

    /* —— 309..320 最终喘息:存个档,别浪 —— */
    g.save(311);
    g.spikeBelt(315, 316);

    /* —— 321..344 S11 机房决战:Anthropic Dario —— */
    /* 左墙带 3 格高门洞(9..11 行):进得去,老板出不来 */
    g.solid(321, 0, 8);
    g.solid(321, 12, 14);
    g.ground(322, 343);
    g.plat(326, 9, 4);
    g.plat(336, 9, 4);
    g.plat(330, 5, 6);
    g.coinRow(330, 3, 6);
    g.q(332, 4, 5); /* 决战前的奶 */
    g.arena = { x0: 321, x1: 344 };
    g.bossAt = 327;
  });

  return LEVELS;
};
