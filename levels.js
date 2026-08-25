"use strict";

/**
 * Builds all level layouts. Keep tile placement and level-specific changes in
 * this file so gameplay, rendering, and input logic remain independent.
 *
 * Tile legend:
 * 0 empty, 1 ground, 2 solid, 3 brick, 4 coin box, 5 milk box,
 * 6 star box, 7 bell box, 8 used box, 9 one-way platform, 10 spike,
 * 11 lava, 12 spring, 13 pipe top, 14 pipe body, 15 flag, 16 crumble.
 */
window.createNiuLaiLevels = function createNiuLaiLevels(TAU) {
  /* ---------- 关卡数据 ---------- */
  function LV(w, name, theme) {
    this.w = w;
    this.h = 15;
    this.T = new Uint8Array(w * 15);
    this.name = name;
    this.theme = theme;
    this.ents = [];
    this.coins = [];
    this.startX = 3;
    this.flagX = -1;
    this.flagY = 8;
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
    this.fill(0, 0, 0, 14, 2);
    this.fill(this.w - 1, this.w - 1, 0, 14, 2);
  };
  LV.prototype.ground = function (x1, x2) {
    this.fill(x1, x2, 12, 14, 1);
  };
  LV.prototype.groundAll = function () {
    this.ground(0, this.w - 1);
  };
  LV.prototype.pit = function (x1, x2) {
    this.fill(x1, x2, 10, 14, 0);
  };
  LV.prototype.brick = function (x, y, n) {
    for (var i = 0; i < n; i++) this.set(x + i, y, 3);
  };
  LV.prototype.q = function (x, y, k) {
    this.set(x, y, k === 1 ? 5 : k === 2 ? 6 : k === 3 ? 7 : 4);
  };
  LV.prototype.plat = function (x, y, n) {
    for (var i = 0; i < n; i++) this.set(x + i, y, 9);
  };
  LV.prototype.solid = function (x, y1, y2) {
    this.fill(x, x, y1, y2, 2);
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
  LV.prototype.wolf = function (x) {
    this.ent({ k: "wolf", x: x, y: 12 });
  };
  LV.prototype.leopard = function (x) {
    this.ent({ k: "leopard", x: x, y: 12 });
  };
  LV.prototype.raven = function (x, y) {
    this.ent({ k: "raven", x: x, y: y });
  };
  LV.prototype.bird = function (x, y) {
    this.ent({ k: "bird", x: x, y: y });
  };
  LV.prototype.spring = function (x, y) {
    this.set(x, y === undefined ? 12 : y, 12);
  };
  LV.prototype.spike = function (x, n) {
    for (var i = 0; i < n; i++) this.set(x + i, 12, 10);
  };
  LV.prototype.lava = function (x, n) {
    for (var i = 0; i < n; i++) {
      this.set(x + i, 12, 11);
      this.set(x + i, 13, 11);
      this.set(x + i, 14, 11);
    }
  };
  LV.prototype.pipe = function (x, h) {
    var top = 12 - h;
    this.set(x, top, 13);
    for (var y = top + 1; y <= 12; y++) this.set(x, y, 14);
  };
  LV.prototype.flag = function (x) {
    this.flagX = x;
    this.flagY = 8;
    for (var y = 8; y <= 11; y++) this.set(x, y, 15);
    this.set(x, 12, 2);
  };
  LV.prototype.mplat = function (x1, y1, x2, y2) {
    this.ents.push({ k: "move", x: x1, y: y1, x2: x2, y2: y2 });
  };
  LV.prototype.cr = function (x, n) {
    for (var i = 0; i < n; i++) this.set(x + i, 11, 16);
  }; /* 碎板:踩上1秒塌 */
  LV.prototype.cannon = function (x) {
    this.ent({ k: "cannon", x: x, y: 11 });
  }; /* 火球炮台 */
  LV.prototype.bigc = function (x, y, n) {
    n = n || 1;
    for (var i = 0; i < n; i++) this.coins.push({ x: x + i, y: y, t: Math.random() * TAU, big: true });
  };

  var LEVELS = [];
  function defLevel(w, name, theme, fn) {
    var lv = new LV(w, name, theme);
    fn(lv);
    lv.walls();
    LEVELS.push(lv);
  }

  defLevel(112, "1-1 格莱美草原", 0, function (g) {
    g.ground(0, 111);
    g.startX = 3;
    g.coinRow(12, 10, 4);
    g.bigc(18, 9);
    g.q(20, 8, 1);
    g.brick(24, 8, 3);
    g.q(26, 8, 2);
    g.brick(28, 8, 3);
    g.wolf(36);
    g.pit(40, 43);
    g.coinArc(41, 10);
    g.wolf(48);
    g.wolf(52);
    g.pit(55, 58);
    g.plat(55, 10, 2);
    g.coinRow(56, 9, 2);
    g.spring(64);
    g.coinRow(63, 6, 4);
    g.q(70, 8, 1);
    g.brick(72, 8, 2);
    g.q(76, 8, 1);
    g.raven(82, 6);
    g.coinRow(84, 11, 5);
    g.wolf(90);
    g.leopard(95);
    g.pit(96, 99);
    g.mplat(96, 10, 101, 7);
    g.bird(104, 7);
    g.flag(105);
  });
  defLevel(118, "1-2 云雀千问", 0, function (g) {
    g.ground(0, 117);
    g.startX = 3;
    g.coinRow(10, 9, 5);
    g.plat(16, 9, 4);
    g.coinRow(17, 8, 3);
    g.bird(18, 6);
    g.q(26, 8, 3);
    g.brick(28, 8, 1);
    g.q(30, 8, 1);
    g.pipe(22, 2);
    g.pipe(26, 3);
    g.wolf(34);
    g.wolf(38);
    g.pit(42, 45);
    g.plat(42, 10, 4);
    g.spring(50);
    g.coinRow(50, 7, 3);
    g.raven(56, 7);
    g.brick(60, 8, 4);
    g.q(63, 8, 1);
    g.pit(66, 70);
    g.mplat(66, 10, 71, 7);
    g.wolf(76);
    g.leopard(80);
    g.coinRow(84, 11, 6);
    g.q(90, 8, 2);
    g.plat(92, 9, 3);
    g.coinRow(95, 7, 3);
    g.pit(98, 101);
    g.spring(105);
    g.coinRow(104, 6, 4);
    g.leopard(110);
    g.flag(112);
  });
  defLevel(122, "1-3 鸡屁踢山谷", 0, function (g) {
    g.ground(0, 121);
    g.startX = 3;
    g.coinRow(8, 10, 4);
    g.wolf(15);
    g.pit(18, 22);
    g.plat(18, 9, 2);
    g.coinArc(20, 8);
    g.q(26, 8, 1);
    g.q(28, 8, 2);
    g.brick(32, 8, 5);
    g.q(34, 8, 1);
    g.pit(40, 43);
    g.spring(46);
    g.coinRow(46, 5, 5);
    g.wolf(52);
    g.wolf(56);
    g.raven(60, 6);
    g.pit(64, 69);
    g.mplat(64, 10, 69, 7);
    g.coinRow(66, 8, 3);
    g.bird(72, 7);
    g.brick(76, 8, 4);
    g.q(79, 8, 3);
    g.coinRow(80, 11, 4);
    g.wolf(88);
    g.pit(91, 94);
    g.plat(91, 9, 4);
    g.q(98, 8, 1);
    g.q(100, 8, 1);
    g.leopard(104);
    g.wolf(109);
    g.pit(112, 115);
    g.spring(117);
    g.coinRow(116, 5, 3);
    g.flag(118);
  });
  defLevel(126, "1-4 草原图灵", 0, function (g) {
    g.ground(0, 125);
    g.startX = 3;
    g.coinRow(6, 9, 5);
    g.q(14, 8, 1);
    g.wolf(20);
    g.wolf(24);
    g.pit(28, 31);
    g.coinArc(29, 9);
    g.raven(34, 7);
    g.raven(38, 6);
    g.brick(42, 8, 6);
    g.q(44, 8, 1);
    g.q(46, 8, 3);
    g.pit(50, 54);
    g.mplat(50, 10, 55, 6);
    g.spring(60);
    g.coinRow(59, 5, 4);
    g.wolf(66);
    g.leopard(70);
    g.leopard(74);
    g.pit(78, 82);
    g.plat(78, 8, 2);
    g.coinRow(80, 7, 2);
    g.bird(86, 7);
    g.q(90, 8, 2);
    g.q(92, 8, 1);
    g.wolf(96);
    g.pit(100, 104);
    g.mplat(100, 10, 106, 10);
    g.spring(108);
    g.coinRow(108, 5, 4);
    g.leopard(114);
    g.wolf(118);
    g.flag(120);
  });
  defLevel(114, "2-1 逗包戈壁", 1, function (g) {
    g.ground(0, 113);
    g.startX = 3;
    g.wolf(12);
    g.coinRow(10, 10, 3);
    g.pit(18, 21);
    g.coinArc(19, 9);
    g.q(26, 8, 1);
    g.q(28, 8, 1);
    g.leopard(34);
    g.wolf(38);
    g.pit(42, 46);
    g.plat(42, 9, 3);
    g.raven(50, 6);
    g.spring(54);
    g.coinRow(54, 6, 4);
    g.pit(60, 63);
    g.spring(66);
    g.wolf(72);
    g.leopard(76);
    g.brick(80, 8, 5);
    g.q(82, 8, 3);
    g.pit(88, 92);
    g.mplat(88, 10, 93, 7);
    g.bird(96, 6);
    g.wolf(100);
    g.coinRow(104, 11, 4);
    g.flag(108);
  });
  defLevel(120, "2-2 奇米仙人谷", 1, function (g) {
    g.ground(0, 119);
    g.startX = 3;
    g.coinRow(8, 9, 4);
    g.wolf(14);
    g.pit(18, 22);
    g.plat(18, 9, 2);
    g.coinArc(20, 8);
    g.q(26, 8, 2);
    g.pipe(24, 2);
    g.pipe(30, 4);
    g.leopard(32);
    g.pit(36, 40);
    g.spring(42);
    g.q(46, 8, 1);
    g.coinRow(48, 11, 4);
    g.raven(54, 6);
    g.raven(58, 7);
    g.pit(62, 66);
    g.mplat(62, 10, 67, 7);
    g.brick(70, 8, 4);
    g.q(72, 8, 3);
    g.leopard(78);
    g.wolf(82);
    g.pit(86, 89);
    g.plat(86, 9, 4);
    g.spring(94);
    g.coinRow(93, 5, 3);
    g.bird(100, 6);
    g.pit(104, 108);
    g.mplat(105, 10, 108, 10);
    g.wolf(112);
    g.flag(114);
  });
  defLevel(126, "2-3 maxmini沙丘", 1, function (g) {
    g.ground(0, 125);
    g.startX = 3;
    g.wolf(10);
    g.leopard(14);
    g.leopard(18);
    g.pit(24, 27);
    g.spring(30);
    g.coinRow(29, 6, 4);
    g.q(36, 8, 1);
    g.q(38, 8, 1);
    g.q(40, 8, 2);
    g.pit(44, 49);
    g.mplat(45, 10, 49, 7);
    g.raven(54, 6);
    g.brick(58, 8, 5);
    g.q(60, 8, 3);
    g.coinRow(62, 11, 4);
    g.pit(68, 72);
    g.plat(69, 9, 3);
    g.wolf(76);
    g.leopard(80);
    g.spring(84);
    g.coinRow(84, 5, 4);
    g.pit(90, 94);
    g.mplat(90, 10, 95, 10);
    g.bird(98, 7);
    g.q(102, 8, 1);
    g.wolf(106);
    g.leopard(110);
    g.pit(114, 117);
    g.spring(119);
    g.coinRow(118, 5, 3);
    g.flag(121);
  });
  defLevel(130, "2-4 深思遗迹", 1, function (g) {
    g.ground(0, 129);
    g.startX = 3;
    g.coinRow(8, 9, 4);
    g.q(16, 8, 1);
    g.wolf(22);
    g.leopard(26);
    g.pit(30, 34);
    g.plat(30, 9, 2);
    g.raven(38, 7);
    g.spring(42);
    g.coinRow(42, 6, 4);
    g.pit(48, 52);
    g.mplat(48, 10, 53, 6);
    g.brick(56, 8, 6);
    g.q(58, 8, 1);
    g.q(60, 8, 3);
    g.leopard(68);
    g.wolf(72);
    g.pit(76, 80);
    g.plat(77, 8, 3);
    g.bird(84, 6);
    g.q(88, 8, 2);
    g.wolf(92);
    g.leopard(96);
    g.pit(100, 105);
    g.mplat(101, 10, 104, 10);
    g.spring(108);
    g.coinRow(108, 5, 4);
    g.wolf(114);
    g.leopard(118);
    g.pit(122, 125);
    g.coinArc(123, 9);
    g.flag(126);
  });
  defLevel(114, "3-1 月之阳面", 2, function (g) {
    g.ground(0, 113);
    g.startX = 3;
    g.coinRow(10, 9, 4);
    g.q(18, 8, 1);
    g.wolf(24);
    g.pit(28, 31);
    g.coinArc(29, 9);
    g.q(36, 8, 2);
    g.spring(40);
    g.coinRow(40, 6, 4);
    g.wolf(46);
    g.raven(50, 6);
    g.pit(54, 58);
    g.plat(54, 9, 3);
    g.brick(62, 8, 4);
    g.q(64, 8, 3);
    g.leopard(70);
    g.pit(74, 78);
    g.mplat(74, 10, 79, 7);
    g.bird(82, 6);
    g.wolf(86);
    g.wolf(90);
    g.coinRow(94, 11, 5);
    g.pit(98, 101);
    g.spring(104);
    g.coinRow(103, 5, 3);
    g.flag(108);
  });
  defLevel(122, "3-2 克老得冰谷", 2, function (g) {
    g.ground(0, 121);
    g.startX = 3;
    g.coinRow(8, 10, 4);
    g.wolf(16);
    g.pit(20, 24);
    g.plat(20, 9, 2);
    g.coinArc(22, 8);
    g.q(28, 8, 1);
    g.pipe(26, 2);
    g.pipe(33, 3);
    g.raven(38, 6);
    g.spring(40);
    g.coinRow(40, 5, 4);
    g.leopard(42);
    g.wolf(46);
    g.pit(50, 55);
    g.mplat(50, 10, 55, 7);
    g.brick(58, 8, 5);
    g.q(60, 8, 3);
    g.bird(66, 6);
    g.pit(70, 74);
    g.plat(70, 9, 3);
    g.wolf(78);
    g.leopard(82);
    g.q(86, 8, 2);
    g.coinRow(88, 11, 4);
    g.pit(94, 98);
    g.mplat(94, 10, 99, 10);
    g.spring(102);
    g.coinRow(102, 5, 4);
    g.raven(108, 7);
    g.flag(116);
  });
  defLevel(126, "3-3 羊驼雪峰", 2, function (g) {
    g.ground(0, 125);
    g.startX = 3;
    g.wolf(12);
    g.leopard(16);
    g.pit(20, 23);
    g.spring(26);
    g.q(30, 8, 1);
    g.coinRow(32, 11, 4);
    g.pit(36, 41);
    g.mplat(37, 10, 41, 6);
    g.raven(46, 6);
    g.brick(50, 8, 6);
    g.q(52, 8, 1);
    g.q(54, 8, 2);
    g.pit(60, 64);
    g.plat(60, 8, 2);
    g.wolf(68);
    g.leopard(72);
    g.bird(76, 7);
    g.spring(80);
    g.coinRow(80, 5, 4);
    g.pit(86, 91);
    g.mplat(86, 10, 91, 7);
    g.wolf(96);
    g.q(100, 8, 3);
    g.pit(104, 108);
    g.plat(104, 9, 3);
    g.raven(112, 6);
    g.coinRow(114, 11, 4);
    g.flag(120);
  });
  defLevel(130, "3-4 格罗可雪原", 2, function (g) {
    g.ground(0, 129);
    g.startX = 3;
    g.coinRow(8, 9, 4);
    g.q(16, 8, 1);
    g.wolf(22);
    g.leopard(26);
    g.pit(30, 35);
    g.mplat(30, 10, 35, 7);
    g.spring(38);
    g.coinRow(38, 5, 4);
    g.raven(44, 6);
    g.raven(48, 7);
    g.brick(52, 8, 6);
    g.q(54, 8, 2);
    g.q(56, 8, 3);
    g.leopard(64);
    g.wolf(68);
    g.pit(72, 76);
    g.plat(72, 8, 3);
    g.bird(80, 6);
    g.q(84, 8, 1);
    g.coinRow(86, 11, 5);
    g.pit(92, 97);
    g.mplat(92, 10, 97, 10);
    g.wolf(100);
    g.leopard(104);
    g.spring(108);
    g.coinRow(108, 5, 4);
    g.pit(114, 118);
    g.plat(114, 9, 3);
    g.raven(122, 6);
    g.flag(124);
  });
  defLevel(114, "4-1 柴特鸡屁踢", 3, function (g) {
    g.ground(0, 113);
    g.startX = 3;
    g.coinRow(10, 9, 4);
    g.lava(18, 3);
    g.coinArc(19, 9);
    g.q(26, 8, 1);
    g.wolf(30);
    g.lava(34, 4);
    g.plat(34, 10, 4);
    g.spring(42);
    g.coinRow(42, 5, 4);
    g.raven(48, 6);
    g.q(52, 8, 2);
    g.lava(56, 4);
    g.mplat(56, 10, 61, 7);
    g.wolf(64);
    g.leopard(68);
    g.lava(72, 3);
    g.brick(76, 8, 4);
    g.q(78, 8, 3);
    g.pit(82, 85);
    g.wolf(88);
    g.coinRow(90, 11, 4);
    g.lava(94, 5);
    g.mplat(95, 10, 98, 10);
    g.spring(102);
    g.coinRow(102, 5, 3);
    g.flag(108);
  });
  defLevel(120, "4-2 索拉裂谷", 3, function (g) {
    g.ground(0, 119);
    g.startX = 3;
    g.coinRow(8, 10, 3);
    g.wolf(14);
    g.lava(18, 3);
    g.coinArc(19, 9);
    g.q(26, 8, 1);
    g.pipe(24, 2);
    g.pipe(29, 4);
    g.raven(36, 6);
    g.lava(40, 5);
    g.mplat(40, 10, 45, 7);
    g.spring(42);
    g.q(46, 8, 2);
    g.wolf(52);
    g.leopard(56);
    g.lava(60, 4);
    g.plat(60, 9, 4);
    g.brick(68, 8, 5);
    g.q(70, 8, 3);
    g.lava(76, 4);
    g.spring(82);
    g.coinRow(81, 5, 4);
    g.wolf(88);
    g.leopard(92);
    g.lava(96, 5);
    g.mplat(96, 10, 101, 10);
    g.bird(104, 6);
    g.q(108, 8, 1);
    g.flag(114);
  });
  defLevel(126, "4-3 曼巴火焰之路", 3, function (g) {
    g.ground(0, 125);
    g.startX = 3;
    g.wolf(10);
    g.leopard(14);
    g.lava(18, 3);
    g.coinArc(19, 9);
    g.q(24, 8, 1);
    g.spring(28);
    g.coinRow(28, 5, 4);
    g.lava(34, 5);
    g.mplat(34, 10, 39, 6);
    g.raven(44, 6);
    g.brick(48, 8, 6);
    g.q(50, 8, 2);
    g.q(52, 8, 3);
    g.wolf(60);
    g.lava(64, 4);
    g.plat(64, 9, 4);
    g.spring(72);
    g.coinRow(72, 5, 4);
    g.leopard(78);
    g.lava(82, 6);
    g.mplat(82, 10, 87, 7);
    g.wolf(92);
    g.bird(96, 6);
    g.lava(100, 4);
    g.coinRow(101, 9, 3);
    g.q(106, 8, 1);
    g.leopard(110);
    g.flag(120);
  });
  defLevel(100, "4-4 GPT 老板朝圣", 3, function (g) {
    g.ground(0, 99);
    g.startX = 6;
    g.solid(4, 0, 14);
    g.solid(95, 0, 14);
    g.coinRow(14, 10, 3);
    g.q(20, 8, 1);
    g.lava(26, 4);
    g.mplat(26, 10, 31, 10);
    g.coinRow(36, 10, 3);
    g.brick(64, 8, 4);
    g.q(66, 8, 1);
    g.coinRow(78, 10, 3);
    g.flag(90);
  });
  /* ===== 第5世界:月面攻势(主题4 · 星空地球背景) ===== */
  defLevel(116, "5-1 问芯月面基地", 4, function (g) {
    g.groundAll();
    g.startX = 3;
    g.coinRow(10, 10, 4);
    g.q(18, 8, 1);
    g.wolf(26);
    g.pit(30, 34);
    g.plat(30, 10, 2);
    g.coinArc(31, 7);
    g.spring(38);
    g.coinRow(38, 5, 4);
    g.q(44, 8, 2);
    g.brick(46, 8, 2);
    g.q(48, 8, 1);
    g.raven(54, 6);
    g.pit(58, 63);
    g.mplat(58, 10, 63, 7);
    g.leopard(68);
    g.wolf(72);
    g.brick(76, 8, 4);
    g.q(78, 8, 3);
    g.pit(82, 86);
    g.plat(83, 9, 2);
    g.coinRow(85, 7, 2);
    g.spring(90);
    g.coinRow(90, 5, 3);
    g.bird(96, 6);
    g.wolf(100);
    g.flag(106);
  });
  defLevel(124, "5-2 万嗒环形山", 4, function (g) {
    g.groundAll();
    g.startX = 3;
    g.coinRow(8, 10, 4);
    g.pit(14, 20);
    g.mplat(14, 10, 18, 7);
    g.pit(24, 31);
    g.mplat(24, 9, 29, 6);
    g.coinRow(26, 5, 3);
    g.wolf(34);
    g.pit(38, 46);
    g.plat(39, 10, 2);
    g.plat(43, 8, 2);
    g.q(50, 8, 1);
    g.raven(54, 6);
    g.pit(58, 66);
    g.mplat(58, 10, 64, 7);
    g.spring(70);
    g.coinRow(70, 5, 4);
    g.leopard(76);
    g.wolf(80);
    g.pit(84, 90);
    g.mplat(84, 9, 89, 9);
    g.coinRow(88, 7, 2);
    g.brick(94, 8, 4);
    g.q(96, 8, 2);
    g.bird(102, 6);
    g.pit(106, 110);
    g.plat(107, 9, 2);
    g.flag(116);
  });
  defLevel(118, "5-3 质朴矩阵", 4, function (g) {
    g.groundAll();
    g.startX = 3;
    g.coinRow(8, 9, 4);
    g.q(16, 8, 3);
    g.brick(18, 8, 3);
    g.pipe(24, 2);
    g.pipe(28, 3);
    g.wolf(34);
    g.brick(38, 8, 6);
    g.q(40, 8, 1);
    g.q(42, 8, 2);
    g.pit(48, 52);
    g.plat(48, 9, 3);
    g.raven(56, 6);
    g.solid(60, 9, 11);
    g.solid(61, 9, 11);
    g.plat(60, 7, 2);
    g.coinRow(60, 6, 2);
    g.brick(66, 8, 5);
    g.q(68, 8, 3);
    g.leopard(76);
    g.wolf(80);
    g.pit(84, 88);
    g.spring(90);
    g.coinRow(90, 5, 4);
    g.bird(96, 6);
    g.pit(100, 105);
    g.mplat(100, 10, 105, 7);
    g.flag(110);
  });
  defLevel(110, "5-4 Anthropic 机房", 4, function (g) {
    g.ground(0, 109);
    g.startX = 6;
    g.solid(4, 0, 14);
    g.solid(95, 0, 14); /* Server-room arena: spawn safely inside both walls. */
    g.coinRow(10, 9, 4);
    g.q(18, 8, 2);
    g.brick(20, 8, 3);
    g.q(38, 8, 1);
    g.brick(40, 8, 2);
    g.q(42, 8, 3);
    g.spring(68);
    g.coinRow(68, 5, 4);
    g.brick(82, 8, 4);
    g.q(84, 8, 1);
    g.flagX = -1;
  });

  /* ---------- 关卡加长:专属挑战 + 两段安全变奏，兼顾长度与人工可达性 ---------- */
  function extendLevels() {
    for (var i = 0; i < LEVELS.length; i++) {
      var old = LEVELS[i];
      if (old.flagX < 0) continue; /* Keep the final Boss arena unchanged. */
      var cut = old.flagX - 6,
        w2 = old.w + 140;
      var lv = new LV(w2, old.name, old.theme);
      for (var x = 0; x < cut; x++)
        for (var y = 0; y < 15; y++) {
          var c = old.get(x, y);
          if (c) lv.set(x, y, c);
        }
      for (var e2 = 0; e2 < old.ents.length; e2++) {
        if (old.ents[e2].x < cut - 4) lv.ents.push(old.ents[e2]);
      }
      for (var c2 = 0; c2 < old.coins.length; c2++) {
        if (old.coins[c2].x < cut - 2) lv.coins.push(old.coins[c2]);
      }
      lv.startX = old.startX;
      lv.ground(cut, w2 - 1);
      featureSection(lv, cut, i % 15);
      safeSection(lv, cut + 44, i * 2);
      safeSection(lv, cut + 88, i * 2 + 1);
      lv.flag(w2 - 6);
      lv.walls();
      LEVELS[i] = lv;
    }
  }
  function featureSection(lv, x0, idx) {
    lv.coinRow(x0 + 3, 10, 3);
    switch (idx) {
      case 0 /* 1-1 弹簧高塔+金币拱门 */:
        lv.spring(x0 + 6);
        lv.coinRow(x0 + 5, 6, 4);
        lv.plat(x0 + 12, 8, 3);
        lv.coinRow(x0 + 12, 7, 3);
        lv.spring(x0 + 18);
        lv.coinArc(x0 + 24, 7);
        lv.plat(x0 + 22, 6, 3);
        lv.q(x0 + 27, 6, 1);
        lv.wolf(x0 + 34);
        lv.coinRow(x0 + 32, 11, 4);
        break;
      case 1 /* 1-2 云雀护送走廊 */:
        lv.plat(x0 + 5, 10, 3);
        lv.bird(x0 + 6, 7);
        lv.plat(x0 + 11, 8, 3);
        lv.bird(x0 + 12, 5);
        lv.coinRow(x0 + 11, 7, 3);
        lv.plat(x0 + 17, 9, 2);
        lv.coinArc(x0 + 17, 7);
        lv.plat(x0 + 23, 7, 3);
        lv.coinRow(x0 + 23, 6, 3);
        lv.bird(x0 + 24, 4);
        lv.leopard(x0 + 32);
        lv.coinRow(x0 + 30, 11, 5);
        break;
      case 2 /* 1-3 双层砖阵 */:
        lv.brick(x0 + 5, 8, 6);
        lv.q(x0 + 8, 8, 2);
        lv.brick(x0 + 14, 10, 4);
        lv.plat(x0 + 14, 7, 4);
        lv.coinRow(x0 + 14, 6, 4);
        lv.pit(x0 + 20, x0 + 24);
        lv.plat(x0 + 20, 9, 2);
        lv.coinArc(x0 + 21, 7);
        lv.brick(x0 + 28, 8, 5);
        lv.q(x0 + 30, 8, 1);
        lv.wolf(x0 + 36);
        lv.wolf(x0 + 39);
        break;
      case 3 /* 1-4 交叉移动平台 */:
        lv.pit(x0 + 4, x0 + 12);
        lv.mplat(x0 + 4, 10, x0 + 9, 6);
        lv.pit(x0 + 14, x0 + 22);
        lv.mplat(x0 + 14, 6, x0 + 19, 10);
        lv.coinRow(x0 + 8, 5, 3);
        lv.coinRow(x0 + 16, 10, 3);
        lv.pit(x0 + 24, x0 + 30);
        lv.plat(x0 + 25, 8, 2);
        lv.coinRow(x0 + 27, 7, 2);
        lv.leopard(x0 + 36);
        lv.q(x0 + 38, 8, 3);
        break;
      case 4 /* 2-1 尖刺窄桥 */:
        lv.spike(x0 + 5, 3);
        lv.plat(x0 + 5, 9, 3);
        lv.coinRow(x0 + 5, 8, 3);
        lv.spike(x0 + 12, 4);
        lv.plat(x0 + 12, 8, 2);
        lv.coinArc(x0 + 13, 6);
        lv.raven(x0 + 18, 6);
        lv.spike(x0 + 22, 3);
        lv.spring(x0 + 27);
        lv.coinRow(x0 + 26, 5, 4);
        lv.wolf(x0 + 34);
        lv.coinRow(x0 + 33, 11, 4);
        break;
      case 5 /* 2-2 管道峡谷 */:
        lv.pipe(x0 + 5, 2);
        lv.pipe(x0 + 9, 3);
        lv.coinRow(x0 + 6, 7, 2);
        lv.pipe(x0 + 14, 4);
        lv.coinArc(x0 + 15, 6);
        lv.pipe(x0 + 20, 2);
        lv.pipe(x0 + 24, 3);
        lv.coinRow(x0 + 21, 6, 2);
        lv.leopard(x0 + 30);
        lv.wolf(x0 + 34);
        break;
      case 6 /* 2-3 沙丘弹跳长廊 */:
        lv.spring(x0 + 4);
        lv.spring(x0 + 8);
        lv.spring(x0 + 12);
        lv.coinRow(x0 + 3, 5, 3);
        lv.coinRow(x0 + 7, 4, 3);
        lv.coinRow(x0 + 11, 5, 3);
        lv.q(x0 + 16, 8, 2);
        lv.raven(x0 + 19, 6);
        lv.spring(x0 + 24);
        lv.coinArc(x0 + 25, 6);
        lv.leopard(x0 + 32);
        lv.leopard(x0 + 36);
        break;
      case 7 /* 2-4 遗迹塌方 */:
        lv.brick(x0 + 4, 10, 2);
        lv.brick(x0 + 4, 9, 2);
        lv.q(x0 + 6, 8, 1);
        lv.solid(x0 + 10, 9, 11);
        lv.solid(x0 + 11, 9, 11);
        lv.plat(x0 + 10, 7, 2);
        lv.brick(x0 + 16, 8, 4);
        lv.coinRow(x0 + 16, 7, 4);
        lv.pit(x0 + 22, x0 + 26);
        lv.mplat(x0 + 22, 10, x0 + 26, 7);
        lv.wolf(x0 + 32);
        lv.q(x0 + 35, 8, 3);
        break;
      case 8 /* 3-1 冰湖独木跳 */:
        lv.pit(x0 + 4, x0 + 7);
        lv.plat(x0 + 5, 10, 1);
        lv.pit(x0 + 9, x0 + 13);
        lv.plat(x0 + 10, 9, 1);
        lv.plat(x0 + 12, 10, 1);
        lv.pit(x0 + 15, x0 + 20);
        lv.plat(x0 + 16, 9, 1);
        lv.plat(x0 + 18, 8, 1);
        lv.coinArc(x0 + 17, 6);
        lv.bird(x0 + 23, 6);
        lv.wolf(x0 + 30);
        lv.coinRow(x0 + 28, 11, 5);
        break;
      case 9 /* 3-2 冰雪双桥 */:
        lv.pit(x0 + 4, x0 + 10);
        lv.plat(x0 + 5, 10, 2);
        lv.plat(x0 + 8, 8, 2);
        lv.coinRow(x0 + 8, 7, 2);
        lv.pit(x0 + 13, x0 + 19);
        lv.mplat(x0 + 13, 9, x0 + 18, 9);
        lv.coinRow(x0 + 15, 7, 3);
        lv.q(x0 + 23, 8, 2);
        lv.raven(x0 + 26, 6);
        lv.leopard(x0 + 32);
        lv.wolf(x0 + 36);
        break;
      case 10 /* 3-3 雪峰之字攀登 */:
        lv.plat(x0 + 4, 10, 2);
        lv.plat(x0 + 8, 8, 2);
        lv.plat(x0 + 12, 6, 2);
        lv.coinRow(x0 + 8, 7, 2);
        lv.coinRow(x0 + 12, 5, 2);
        lv.plat(x0 + 17, 8, 2);
        lv.plat(x0 + 21, 10, 2);
        lv.spring(x0 + 26);
        lv.coinRow(x0 + 25, 5, 3);
        lv.q(x0 + 31, 8, 1);
        lv.wolf(x0 + 35);
        lv.leopard(x0 + 38);
        break;
      case 11 /* 3-4 暴风雪渡鸦群 */:
        lv.raven(x0 + 5, 6);
        lv.raven(x0 + 9, 7);
        lv.raven(x0 + 13, 5);
        lv.coinRow(x0 + 5, 10, 3);
        lv.coinRow(x0 + 10, 9, 3);
        lv.plat(x0 + 17, 8, 3);
        lv.coinRow(x0 + 17, 7, 3);
        lv.raven(x0 + 23, 6);
        lv.spring(x0 + 28);
        lv.q(x0 + 32, 8, 3);
        lv.leopard(x0 + 37);
        break;
      case 12 /* 4-1 熔岩弹簧跳 */:
        lv.lava(x0 + 4, 3);
        lv.spring(x0 + 3);
        lv.coinRow(x0 + 3, 5, 3);
        lv.lava(x0 + 9, 4);
        lv.plat(x0 + 10, 9, 2);
        lv.coinArc(x0 + 10, 7);
        lv.lava(x0 + 16, 3);
        lv.spring(x0 + 15);
        lv.coinRow(x0 + 15, 5, 3);
        lv.lava(x0 + 22, 4);
        lv.mplat(x0 + 22, 10, x0 + 26, 10);
        lv.wolf(x0 + 32);
        lv.coinRow(x0 + 30, 11, 4);
        break;
      case 13 /* 4-2 岩浆平台接力 */:
        lv.lava(x0 + 4, 6);
        lv.mplat(x0 + 4, 10, x0 + 8, 7);
        lv.lava(x0 + 11, 6);
        lv.mplat(x0 + 12, 8, x0 + 15, 10);
        lv.coinRow(x0 + 6, 6, 3);
        lv.coinRow(x0 + 13, 10, 3);
        lv.lava(x0 + 19, 6);
        lv.plat(x0 + 20, 9, 2);
        lv.plat(x0 + 23, 8, 2);
        lv.q(x0 + 28, 8, 2);
        lv.raven(x0 + 31, 6);
        lv.leopard(x0 + 36);
        break;
      default: /* 4-3 火焰尖刺混跑 */
        lv.lava(x0 + 4, 3);
        lv.spike(x0 + 9, 2);
        lv.plat(x0 + 9, 9, 2);
        lv.coinRow(x0 + 4, 10, 3);
        lv.lava(x0 + 14, 4);
        lv.spring(x0 + 13);
        lv.coinRow(x0 + 13, 5, 3);
        lv.raven(x0 + 20, 6);
        lv.lava(x0 + 23, 3);
        lv.plat(x0 + 23, 9, 3);
        lv.q(x0 + 29, 8, 1);
        lv.wolf(x0 + 33);
        lv.leopard(x0 + 37);
    }
  }
  function safeSection(lv, x0, variant) {
    lv.coinRow(x0 + 2, 10, 4);
    switch (variant % 5) {
      case 0 /* Short pit, spring arc, and a readable enemy finish. */:
        lv.brick(x0 + 7, 9, 3);
        lv.q(x0 + 8, 9, 1);
        lv.wolf(x0 + 14);
        lv.pit(x0 + 18, x0 + 21);
        lv.plat(x0 + 19, 10, 2);
        lv.coinArc(x0 + 19, 8);
        lv.spring(x0 + 26);
        lv.coinRow(x0 + 25, 6, 4);
        lv.leopard(x0 + 34);
        break;
      case 1 /* Crumble bridge: the lower floor keeps first-time players safe. */:
        lv.q(x0 + 6, 8, 2);
        lv.cr(x0 + 11, 5);
        lv.coinRow(x0 + 11, 9, 5);
        lv.spring(x0 + 20);
        lv.raven(x0 + 25, 6);
        lv.brick(x0 + 29, 8, 4);
        lv.q(x0 + 31, 8, 3);
        break;
      case 2 /* Pipes remain below the held-jump clearance. */:
        lv.pipe(x0 + 6, 2);
        lv.pipe(x0 + 11, 3);
        lv.coinRow(x0 + 7, 7, 3);
        lv.pit(x0 + 17, x0 + 20);
        lv.plat(x0 + 18, 10, 2);
        lv.coinArc(x0 + 18, 8);
        lv.spring(x0 + 25);
        lv.wolf(x0 + 31);
        lv.leopard(x0 + 35);
        break;
      case 3 /* Spikes are covered by visible platforms; no blind leap is required. */:
        lv.spike(x0 + 6, 2);
        lv.plat(x0 + 6, 9, 2);
        lv.coinRow(x0 + 6, 8, 2);
        lv.pit(x0 + 14, x0 + 18);
        lv.plat(x0 + 15, 9, 3);
        lv.coinRow(x0 + 15, 8, 3);
        lv.q(x0 + 24, 8, 1);
        lv.raven(x0 + 28, 6);
        lv.spring(x0 + 33);
        break;
      default: /* Stair climb, big-coin reward, then a four-tile pit. */
        lv.plat(x0 + 5, 10, 2);
        lv.plat(x0 + 9, 8, 2);
        lv.plat(x0 + 13, 6, 2);
        lv.coinRow(x0 + 9, 7, 2);
        lv.bigc(x0 + 14, 5);
        lv.pit(x0 + 19, x0 + 22);
        lv.plat(x0 + 20, 10, 2);
        lv.coinArc(x0 + 20, 8);
        lv.wolf(x0 + 28);
        lv.leopard(x0 + 34);
    }
  }
  function addSafetyRoutes() {
    for (var li = 0; li < LEVELS.length; li++) {
      var lv = LEVELS[li],
        x = 1;
      while (x < lv.w - 1) {
        var ground = lv.get(x, 12);
        if (ground !== 0 && ground !== 10 && ground !== 11) {
          x++;
          continue;
        }
        var start = x,
          kind = ground;
        while (x < lv.w - 1 && lv.get(x, 12) === kind) x++;
        var end = x - 1,
          len = end - start + 1;
        if (kind !== 10 && len < 3) continue;
        var allCrumble = true;
        for (var cx = start; cx <= end; cx++) {
          if (lv.get(cx, 11) !== 16) {
            allCrumble = false;
            break;
          }
        }
        if (allCrumble) continue;
        if (start > 1 && lv.get(start - 1, 12) === 1) lv.spring(start - 1);
        for (var px = start; px <= end; px++) {
          var bridged = false;
          for (var py = 10; py <= 11; py++) {
            var pc = lv.get(px, py);
            if (pc === 9 || pc === 16) {
              bridged = true;
              break;
            }
          }
          if (!bridged) lv.set(px, 10, 9);
        }
      }
      /* Tall pipes and walls get a visible spring-assisted approach. */
      for (var wx2 = 3; wx2 < lv.w - 2; wx2++) {
        if (solidLevelTile(lv.get(wx2, 11)) && solidLevelTile(lv.get(wx2, 10)) && lv.get(wx2 - 2, 12) === 1) {
          lv.spring(wx2 - 2);
        }
      }
    }
  }
  function solidLevelTile(c) {
    return c === 1 || c === 2 || c === 3 || c === 4 || c === 5 || c === 6 || c === 7 || c === 8 || c === 13 || c === 14;
  }
  extendLevels();
  addSafetyRoutes();
  return LEVELS;
};
