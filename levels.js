"use strict";

/**
 * Builds all level layouts. Every level is hand-placed around the real jump
 * physics (hold-jump apex ≈4.7 tiles small / 6.4 big, spring ≈10.7, run-jump
 * length ≈8 tiles, wall-kick chain ≈3-4 tiles per kick in a 2-3 tile slot)
 * so obstacles are readable, demanding and never duplicated.
 *
 * Tile legend:
 * 0 empty, 1 ground, 2 solid, 3 brick, 4 coin box, 5 milk box,
 * 6 star box, 7 bell box, 8 used box, 9 one-way platform, 10 spike,
 * 11 lava, 12 spring, 13 pipe top, 14 pipe body, 15 flag, 16 crumble,
 * 17 gate (opens when the guarding GPT 老板 is defeated).
 *
 * v1.9 关卡设计规则:
 * - 每关末段 = 5+ 格宽敞"Boss 坪台"(无坑/无刺/无熔岩),守关老板必在此
 *   安全出生,绝不悬空/贴旗门/反复坠坑复活;
 * - 弹出道具盒只出现在连续砖排内部或平台正上方,禁止孤悬浮箱;
 * - 每关配 1-2 处新机制机关:砖井地窖(坐地重击开凿)、烟囱井/冰井(蹬墙攀爬)、
 *   碎板冲刺、岩浆井(下井捞蛋再蹬墙逃命);
 * - 每关藏 1 颗 g.egg(x,y) 金蛋(危险位置,捡齐 20 颗大满贯)。
 */
window.createNiuLaiLevels = function createNiuLaiLevels(TAU) {
  var T = window.ME.TILE; /* 瓦片语义与地图引擎共享见 mapengine.js */
  /* ---------- 关卡数据 ---------- */
  function LV(w, name, theme) {
    this.w = w;
    this.h = 15;
    this.T = new Uint8Array(w * 15);
    this.name = name;
    this.theme = theme;
    this.ents = [];
    this.coins = [];
    this.eggs = [];
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
  LV.prototype.bird = function (x, y) {
    this.ent({ k: "bird", x: x, y: y });
  };
  LV.prototype.spring = function (x, y) {
    this.set(x, y === undefined ? 12 : y, T.SPRING);
  };
  LV.prototype.spike = function (x, n) {
    this.spikeAt(x, 12, n);
  };
  LV.prototype.spikeAt = function (x, y, n) {
    for (var i = 0; i < n; i++) this.set(x + i, y, T.SPIKE);
  };
  LV.prototype.lava = function (x, n) {
    for (var i = 0; i < n; i++) {
      this.set(x + i, 12, T.LAVA);
      this.set(x + i, 13, T.LAVA);
      this.set(x + i, 14, T.LAVA);
    }
  };
  LV.prototype.pipe = function (x, h) {
    var top = 12 - h;
    this.set(x, top, T.PIPETOP);
    for (var y = top + 1; y <= 12; y++) this.set(x, y, T.PIPEBODY);
  };
  LV.prototype.cannon = function (x, y) {
    this.ent({ k: "cannon", x: x, y: y === undefined ? 11.25 : y });
  };
  /* 旗门:守关老板死亡前封住旗杆(5..11 行铁柱,轰不开跳不过) */
  LV.prototype.gate = function (x) {
    for (var y = 5; y <= 11; y++) this.set(x, y, T.GATE);
  };
  LV.prototype.flag = function (x) {
    this.flagX = x;
    this.flagY = 8;
    for (var y = 8; y <= 11; y++) this.set(x, y, T.FLAG);
    this.set(x, 12, T.SOLID);
    this.gate(x - 2); /* 旗门与旗杆绑定生成,保证守关 Boss 必打 */
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
  /* 金蛋:每关藏 1 颗在危险/刁钻位置,捡齐 20 颗大满贯 */
  LV.prototype.egg = function (x, y) {
    this.eggs.push({ x: x, y: y, t: Math.random() * TAU });
  };
  /* 卵藏地窖:地面开洞(10..13 行挖空,14 行铺底)再盖上砖盖,
     "坐地重击"砸穿盖板跳进地窖掏宝,2 层高轻松跳出 */
  LV.prototype.cellar = function (x1, x2, floorY) {
    this.fill(x1, x2, 10, 12, T.EMPTY);
    this.fill(x1, x2, floorY === undefined ? 13 : floorY, floorY === undefined ? 13 : floorY, T.GROUND);
    this.fill(x1, x2, 11, 11, T.BRICK);
  };

  var LEVELS = [];
  function defLevel(w, name, theme, fn) {
    var lv = new LV(w, name, theme);
    fn(lv);
    lv.walls();
    LEVELS.push(lv);
  }

  /* ================= 世界1 · 格莱美草原:把"真坑真跳"教会你 ================= */

  defLevel(118, "1-1 格莱美草原", 0, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.pit(17, 19); /* 第一个真的坑:3格助跑跳 */
    g.coinArc(17, 10);
    g.wolf(25);
    /* 弹币箱嵌进连续砖排,箱排落座在两根石柱上(门形砖架,不孤悬) */
    g.solid(28, 9, 11);
    g.solid(32, 9, 11);
    g.brick(28, 8, 5);
    g.q(29, 8, 1);
    g.pipe(39, 2);
    g.wolf(44);
    g.pit(47, 51); /* 5格:需要按住跳 */
    g.coinArc(48, 9);
    g.leopard(57);
    g.spring(64);
    /* —— 矿塔:2x4 砖塔坐地重击从顶往下凿,塔身藏着金币蛋 —— */
    g.fill(66, 67, 8, 11, 3);
    g.coin(66, 10);
    g.coin(67, 9);
    g.bigc(66, 7, 2);
    g.egg(66, 10); /* 矿塔中央:砸穿砖塔掏蛋 */
    g.pit(76, 80);
    g.plat(77, 9, 3);
    g.coinRow(77, 8, 3);
    g.bird(85, 7);
    g.raven(89, 6);
    g.pit(94, 97); /* 最后一跳直奔坪台 */
    g.coinRow(94, 9, 4);
    g.coinRow(104, 11, 3);
    g.wolf(106);
    g.flag(112); /* 旗门前留 100+ 格平坦 Boss 坪台 */
  });

  defLevel(122, "1-2 云雀千问", 0, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.pit(13, 18); /* 独木桥:两块单格浮板(薄木读感合理) */
    g.plat(14, 10, 1);
    g.plat(16, 10, 1);
    g.coin(14, 9);
    g.coin(16, 9);
    g.bird(15, 6);
    g.pipe(24, 2);
    g.pipe(28, 3);
    g.wolf(34);
    g.leopard(38);
    g.spring(43);
    g.plat(42, 6, 4); /* 高空金币线,星星箱在板尾正上方 */
    g.coinRow(42, 5, 4);
    g.q(45, 5, 6);
    /* —— 烟囱井:必过关卡,跳下深井摘金蛋,蹬墙三连爬上井口 —— */
    g.pit(49, 59); /* 打开 11 格深渊 */
    g.ground(53, 57); /* 井底铺地(12..14 行) */
    g.mesa(53, 53, 5); /* 西井壁:5..11 行 */
    g.mesa(57, 57, 3); /* 东井壁:3..11 行 */
    g.plat(50, 8, 2); /* 入井木阶(浮板读感) */
    g.plat(52, 6, 1);
    g.plat(59, 2, 1); /* 井口东跳板 */
    g.plat(60, 4, 2);
    g.coin(59, 1);
    g.coin(60, 1);
    g.egg(56, 8); /* 井心:下井摘蛋,蹬墙出井 */
    g.raven(63, 7);
    g.pit(69, 75);
    g.cr(70, 5); /* 碎板桥:冲过去,别停 */
    g.coinRow(70, 10, 2);
    g.wolf(80);
    g.leopard(84);
    g.wolf(88);
    g.pit(98, 101);
    g.coinArc(99, 9);
    g.raven(109, 7);
    g.coinRow(106, 11, 3);
    g.flag(114); /* 102..114 平坦 Boss 坪台 */
  });

  defLevel(124, "1-3 鸡屁踢山谷", 0, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    g.spike(12, 3); /* 尖刺走廊:走上面的薄台 */
    g.plat(12, 9, 3);
    g.coinRow(12, 8, 3);
    g.spike(18, 4);
    g.plat(18, 9, 4);
    g.wolf(26);
    g.pit(30, 33);
    g.spike(37, 3); /* 无台:直接跳过刺带 */
    g.solid(41, 9, 11);
    g.solid(45, 9, 11);
    g.brick(41, 8, 5);
    g.q(42, 8, 5); /* 奶箱嵌进门形砖架 */
    g.leopard(49);
    g.spike(55, 6); /* 谷内名场面:碎板桥横越尖刺 */
    g.cr(55, 6);
    g.coinRow(55, 9, 6);
    g.pit(65, 68);
    g.coinArc(66, 9);
    g.raven(71, 6);
    g.raven(75, 7);
    g.spring(79);
    g.plat(78, 5, 3); /* 高台和大金币形成弹簧流 */
    g.bigc(79, 4);
    /* —— 地窖:砖盖封住地面小洞,坐地重击开盖,2 层高跳出 —— */
    g.cellar(84, 87);
    g.coin(85, 12);
    g.coin(86, 13);
    g.egg(85, 13); /* 地窖深处*/
    g.wolf(92);
    g.leopard(96);
    g.pipe(100, 2);
    g.pit(106, 111);
    g.cr(107, 4);
    g.coinRow(110, 10, 2);
    g.wolf(104); /* 坑前守卫,不占坪台 */
    g.raven(117, 6);
    g.coinRow(114, 11, 3);
    g.flag(120); /* 112..118 平坦 Boss 坪台 */
  });

  defLevel(130, "1-4 草原图灵", 0, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.wolf(13);
    g.pit(17, 23); /* 7格:移动平台摆渡 */
    g.mplat(17, 10, 22, 10);
    g.pit(27, 37); /* 双斜坡接力 */
    g.mplat(27, 10, 32, 6);
    g.mplat(32, 6, 37, 10);
    g.coinRow(30, 5, 3);
    g.leopard(43);
    g.wolf(46);
    g.spike(50, 4);
    g.plat(50, 9, 4);
    g.solid(56, 9, 11);
    g.solid(58, 9, 11);
    g.brick(56, 8, 3);
    g.q(57, 8, 1); /* 弹币箱在门形砖架中 */
    g.raven(62, 6);
    g.raven(66, 8);
    g.mesa(70, 72, 9); /* 平顶丘跳跃 */
    g.pit(73, 76);
    g.mesa(77, 79, 9);
    g.coinRow(70, 8, 3);
    g.spring(84);
    g.coinRow(83, 4, 5); /* 春天般的金币雨 */
    /* —— 天梯井:高塔夹缝,蹬墙连跳登顶吃星 —— */
    g.pit(86, 90);
    g.ground(86, 90);
    g.mesa(88, 88, 4);
    g.mesa(92, 92, 2);
    g.plat(84, 7, 3); /* 入井阶 */
    g.plat(93, 3, 3); /* 出井降阶 */
    g.coinRow(93, 2, 3);
    g.q(94, 2, 6); /* 井口星星箱:连板架顶再顶撞 */
    g.egg(90, 8); /* 井底回头蛋:跳下 9 层井摘蛋,蹬墙出井 */
    g.pit(98, 103);
    g.cr(99, 4);
    g.bird(97, 6);
    g.wolf(107);
    g.coinRow(112, 11, 3);
    g.flag(121); /* 104..119 平坦 Boss 坪台 */
  });

  /* ================= 世界2 · 戈壁沙海:火球炮台登场 ================= */

  defLevel(122, "2-1 逗包戈壁", 1, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    g.cannon(15); /* 第一座炮台:跳过火球或踩爆它 */
    g.wolf(21);
    g.pit(25, 28);
    g.cannon(33);
    g.leopard(37);
    g.cannon(45);
    g.spike(49, 3); /* 双炮交叉火力夹刺带 */
    g.cannon(54);
    g.coinArc(50, 9);
    g.solid(58, 9, 11);
    g.solid(61, 9, 11);
    g.brick(58, 8, 4);
    g.q(59, 8, 1);
    g.pipe(63, 2);
    g.pipe(67, 4);
    g.pipe(71, 4);
    g.cannon(71, 7.25); /* 管顶炮台 */
    /* —— 峡谷井:双高塔夹缝,蹬墙两连上井口 —— */
    g.mesa(76, 77, 5);
    g.mesa(81, 82, 5);
    g.plat(74, 8, 2); /* 入井阶:先爬上西塔顶 */
    g.coin(78, 11);
    g.coin(79, 11);
    g.coin(80, 11);
    g.egg(79, 9); /* 峡谷井:下井摘蛋,蹬墙双跳到顶 */
    g.raven(88, 6);
    g.spring(90);
    g.coinRow(89, 5, 4);
    g.pit(95, 101);
    g.cr(96, 5);
    g.leopard(105);
    g.flag(115); /* 102..114 平坦 Boss 坪台 */
  });

  defLevel(126, "2-2 奇米仙人谷", 1, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 9, 4);
    g.pipe(13, 2);
    g.wolf(17);
    g.pipe(21, 3);
    g.leopard(26);
    g.pipe(30, 4);
    g.cannon(34);
    g.brick(40, 6, 9); /* 低顶砖洞(地板干净):小心撞头 */
    g.q(44, 6, 4);
    g.wolf(45);
    g.pit(52, 56);
    g.plat(53, 9, 3);
    g.raven(61, 6);
    g.raven(64, 8);
    g.spring(69);
    g.plat(68, 5, 4); /* 高台金币线 */
    g.coinRow(68, 4, 4);
    g.q(71, 4, 6);
    g.pit(75, 79);
    g.cr(76, 3);
    g.spike(84, 3);
    g.plat(84, 9, 3);
    g.wolf(90);
    g.leopard(93);
    g.cannon(99);
    /* —— 仙人井:蹬墙井,下井掏蛋 —— */
    g.mesa(104, 104, 4);
    g.mesa(108, 108, 3);
    g.plat(101, 7, 2); /* 入井阶 */
    g.plat(109, 5, 2); /* 出井阶 */
    g.egg(106, 9);
    g.pit(110, 114);
    g.cr(111, 4);
    g.coinArc(111, 10);
    g.wolf(117);
    g.coinRow(116, 11, 3);
    g.flag(122); /* 115..119 平坦 Boss 坪台 */
  });

  defLevel(128, "2-3 maxmini沙丘", 1, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    g.mesa(13, 15, 11); /* 沙丘阶梯 */
    g.mesa(20, 22, 10);
    g.pit(26, 29);
    g.mesa(30, 32, 10);
    g.coinRow(20, 9, 3);
    g.spike(38, 3);
    g.mesa(43, 45, 9);
    g.pit(46, 49); /* 从丘顶飞跃 */
    g.cannon(54);
    g.cannon(62); /* 平地双炮 */
    g.wolf(58);
    g.pit(67, 75);
    g.mplat(68, 10, 74, 10); /* 渡板(可绕行硬跳) */
    g.coinRow(69, 7, 4);
    /* —— 流沙井:7 格宽砖盖塌陷洞,跑过去或坐地砸穿捡蛋 —— */
    g.pit(78, 84);
    g.fill(78, 84, 14, 14, 1);
    g.cr(78, 7); /* 流沙砖盖 */
    g.coinRow(81, 13, 3);
    g.egg(80, 13); /* 流沙井底:掉下去拿蛋,2 层跳回地面 */
    g.leopard(89);
    g.leopard(93);
    g.spring(95);
    g.coinRow(94, 5, 5);
    g.bigc(97, 4);
    g.pit(100, 104);
    g.cr(101, 3);
    g.mesa(109, 111, 11);
    g.raven(117, 6);
    g.coinRow(113, 11, 3);
    g.flag(121); /* 112..118 平坦 Boss 坪台 */
  });

  defLevel(130, "2-4 深思遗迹", 1, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 9, 4);
    g.plat(12, 10, 2); /* 遗迹天梯 */
    g.plat(16, 8, 2);
    g.plat(20, 6, 2);
    g.coinRow(12, 9, 2);
    g.coinRow(16, 7, 2);
    g.q(20, 5, 2);
    g.solid(26, 8, 11); /* 高墙(4格):用墙前弹簧满速起跳翻越 */
    g.spring(23);
    g.plat(27, 6, 3);
    g.coinRow(27, 5, 3);
    g.raven(34, 6);
    g.raven(38, 7);
    g.raven(42, 5);
    g.pit(47, 53);
    g.mplat(48, 10, 52, 7);
    g.solid(57, 9, 11);
    g.solid(61, 9, 11);
    g.brick(57, 8, 5);
    g.q(59, 8, 1);
    g.leopard(64);
    g.wolf(67);
    g.pit(72, 76);
    g.spike(78, 3);
    g.plat(78, 9, 3);
    /* —— 神庙天井:必过关卡,下井摘星出井 —— */
    g.pit(84, 90);
    g.ground(85, 89);
    g.mesa(85, 85, 4);
    g.mesa(89, 89, 2);
    g.plat(82, 7, 2); /* 入井阶 */
    g.plat(90, 4, 3); /* 出井降阶 */
    g.coinRow(86, 7, 3);
    g.q(91, 3, 6);
    g.egg(87, 9); /* 天井底:采蛋蹬墙返天 */
    g.pit(95, 100);
    g.cr(96, 4);
    g.coinRow(96, 10, 3);
    g.wolf(105);
    g.leopard(109);
    g.pit(113, 116);
    g.coinArc(114, 9);
    g.coinRow(119, 11, 3);
    g.flag(123); /* 117..122 平坦 Boss 坪台 */
  });

  /* ================= 世界3 · 冰谷雪峰:精准落点 ================= */

  defLevel(122, "3-1 月之阳面", 2, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    /* 冰湖独木桩:高低错落的立柱 */
    g.pit(13, 60);
    g.mesa(15, 16, 10);
    g.mesa(20, 21, 11);
    g.mesa(24, 25, 9);
    g.mesa(29, 30, 11);
    g.mesa(33, 34, 10);
    /* 中段实体岛:检查点落点+喘息区 */
    g.ground(37, 41);
    g.coinRow(37, 11, 5);
    g.mesa(44, 45, 11);
    g.mesa(49, 50, 10);
    g.mesa(53, 54, 11);
    g.mesa(57, 58, 10);
    g.coin(20, 10);
    g.coin(29, 10);
    g.coin(38, 8);
    g.coin(47, 9);
    g.raven(23, 6);
    g.raven(35, 5);
    g.raven(45, 6);
    g.wolf(66);
    g.leopard(72);
    g.spring(70);
    g.coinArc(71, 6);
    /* —— 冰窖:雪原砖盖地窖,坐地重击开盖 —— */
    g.cellar(76, 81);
    g.coin(77, 12);
    g.coin(78, 12);
    g.coin(80, 12);
    g.egg(79, 13); /* 冰窖深处 */
    g.spike(87, 3);
    g.plat(87, 9, 3);
    g.solid(92, 9, 11);
    g.solid(94, 9, 11);
    g.brick(92, 8, 3);
    g.q(93, 8, 6); /* 星星箱嵌门形砖架 */
    /* —— 冰井:奖励井,蹬墙下井捞币,再跳上井口拿大金 —— */
    g.mesa(95, 95, 4);
    g.mesa(99, 99, 3);
    g.coin(96, 11);
    g.coin(97, 11);
    g.coin(98, 11);
    g.plat(100, 4, 2);
    g.bigc(100, 3);
    g.wolf(91);
    g.pit(103, 106);
    g.coinArc(104, 9);
    g.coinRow(108, 11, 3);
    g.flag(114); /* 107..114 平坦 Boss 坪台 */
  });

  defLevel(126, "3-2 克老得冰谷", 2, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    g.brick(18, 5, 30); /* 冰洞顶棚:压迫感但地面安全 */
    g.spike(29, 2);
    g.plat(29, 9, 2);
    g.wolf(33);
    g.spike(40, 3);
    g.plat(40, 9, 3);
    g.wolf(44);
    g.pit(53, 57);
    g.brick(60, 5, 8);
    g.spring(66);
    g.coinRow(65, 4, 5); /* 冲出洞口的大弹跳 */
    /* —— 冰塔渊:双冰柱夹缝,蹬墙三连出塔 —— */
    g.mesa(72, 72, 6);
    g.mesa(76, 76, 3);
    g.plat(70, 8, 2); /* 入塔阶 */
    g.plat(77, 5, 2); /* 出塔阶 */
    g.egg(74, 9); /* 冰塔之渊:下渊采蛋蹬墙出塔 */
    g.mesa(83, 85, 11); /* 雪脊 */
    g.pit(87, 90);
    g.mesa(91, 93, 10);
    g.pit(95, 98);
    g.raven(96, 6);
    g.raven(101, 7);
    g.cannon(104);
    g.pit(109, 112);
    g.plat(110, 9, 2);
    g.coinRow(118, 11, 3);
    g.flag(120); /* 113..117 平坦 Boss 坪台 */
  });

  defLevel(128, "3-3 羊驼雪峰", 2, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.wolf(13);
    /* 之字攀登:翻不过右侧高墙,必须上台地 */
    g.plat(18, 10, 2);
    g.plat(22, 8, 2);
    g.plat(26, 6, 2);
    g.coinRow(18, 9, 2);
    g.coinRow(22, 7, 2);
    g.raven(24, 4);
    g.spring(29); /* 墙前弹簧:满速踩上去直接飞上峰顶 */
    g.mesa(31, 34, 6); /* 峰顶台地 */
    g.q(34, 5, 3);
    g.bigc(33, 4);
    /* —— 雪井:峰顶正中凿出 2x5 深井,金蛋镇底,蹬墙双跳出井 —— */
    g.fill(32, 33, 7, 11, 0);
    g.coin(33, 10);
    g.egg(32, 9); /* 雪井底:冰蛋在手,蹬墙登天 */
    g.pit(35, 39); /* 从峰顶跃下 */
    g.plat(36, 8, 2);
    g.mesa(44, 46, 9); /* 第二阶 */
    g.spike(50, 3);
    g.plat(50, 9, 3);
    g.raven(56, 6);
    g.spring(61);
    g.plat(60, 5, 3);
    g.coinRow(60, 4, 3);
    g.pit(67, 73);
    g.cr(68, 5);
    g.leopard(79);
    g.wolf(82);
    g.wolf(85);
    g.mesa(90, 92, 11);
    g.mesa(95, 97, 10);
    g.pit(100, 104);
    g.mplat(100, 10, 104, 8);
    g.coinRow(101, 7, 3);
    g.raven(109, 6);
    g.coinRow(114, 11, 3);
    g.flag(120); /* 105..119 平坦 Boss 坪台 */
  });

  defLevel(132, "3-4 格罗可雪原", 2, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    /* 暴风雪大桥:三段碎板+安全岛,渡鸦全程骚扰 */
    g.pit(14, 46);
    g.cr(15, 5);
    g.mesa(21, 22, 11);
    g.cr(24, 5);
    g.mesa(30, 31, 11);
    /* 中段实体岛:检查点落点 */
    g.ground(34, 36);
    g.mesa(39, 40, 11);
    g.cr(42, 4);
    g.raven(19, 7);
    g.raven(28, 6);
    g.raven(37, 7);
    g.coinRow(15, 9, 4);
    g.coinRow(33, 9, 4);
    g.q(45, 8, 5);
    g.spike(52, 4);
    g.plat(52, 9, 4);
    g.solid(58, 9, 11);
    g.solid(62, 9, 11);
    g.brick(58, 8, 5);
    g.q(60, 8, 3); /* 铃铛箱嵌门形砖架 */
    g.wolf(60);
    g.leopard(66);
    g.pit(68, 79);
    g.mplat(69, 10, 74, 10);
    g.mplat(74, 10, 78, 8);
    g.coinRow(71, 7, 4);
    g.spring(85);
    g.coinRow(84, 4, 5);
    g.bigc(87, 3);
    /* —— 冰窖:砖盖地窖,坐地重击开盖 —— */
    g.cellar(90, 95);
    g.coin(92, 12);
    g.coin(93, 13);
    g.egg(93, 13); /* 冰窖深处 */
    g.wolf(99);
    g.wolf(102);
    g.leopard(105);
    g.pit(110, 116);
    g.plat(111, 10, 1);
    g.plat(114, 9, 1);
    g.coin(111, 9);
    g.coin(114, 8);
    g.raven(120, 6);
    g.coinRow(122, 11, 3);
    g.flag(126); /* 117..125 平坦 Boss 坪台 */
  });

  /* ================= 世界4 · 火山:岩浆之上无退路 ================= */

  defLevel(124, "4-1 柴特鸡屁踢", 3, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    g.lava(13, 3);
    g.coinArc(13, 9);
    g.lava(19, 3);
    g.lava(25, 4);
    g.coinRow(25, 9, 4);
    g.spring(33);
    g.lava(34, 5); /* 弹簧射过熔岩 */
    g.coinArc(35, 6);
    /* 跳岛链:熔岩中的高低立柱 */
    g.lava(42, 5);
    g.mesa(44, 45, 11);
    g.ground(47, 50);
    g.mesa(48, 49, 10);
    g.lava(51, 3);
    g.mesa(52, 53, 11);
    g.coin(48, 9);
    g.cannon(60);
    g.leopard(64);
    g.cannon(69);
    g.pit(74, 77);
    g.solid(79, 9, 11);
    g.solid(82, 9, 11);
    g.brick(79, 8, 4);
    g.q(80, 8, 1); /* 弹币箱嵌门形砖架 */
    g.lava(82, 8);
    g.cr(83, 6); /* 碎板冲刺越过岩浆 */
    g.coinRow(83, 9, 6);
    g.wolf(95);
    g.brick(97, 8, 3);
    g.q(98, 8, 5); /* 奶箱嵌砖排(柱下无孤悬) */
    g.solid(97, 9, 11);
    g.solid(99, 9, 11);
    /* —— 熔岩井:底下就是岩浆,下井捞蛋,蹬墙两连逃命 —— */
    g.mesa(102, 102, 5);
    g.mesa(106, 106, 4);
    g.lava(103, 3);
    g.plat(100, 8, 1); /* 入井小阶 */
    g.egg(104, 8); /* 熔岩井:踩蛋后火速蹬墙撤离 */
    g.pit(110, 112);
    g.coinArc(110, 9);
    g.coinRow(116, 11, 3);
    g.flag(120); /* 113..119 平坦 Boss 坪台 */
  });

  defLevel(128, "4-2 索拉裂谷", 3, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    g.lava(13, 5); /* 五格岩浆:满速按住跳 */
    g.coinArc(15, 8);
    g.wolf(23);
    g.lava(27, 5);
    g.mesa(34, 35, 11); /* 岩中孤岛 */
    g.lava(36, 5);
    g.cannon(45);
    g.lava(50, 6);
    g.plat(51, 9, 4); /* 高台过裂谷 */
    g.coinRow(51, 8, 4);
    g.raven(60, 6);
    g.raven(64, 7);
    g.spring(69);
    g.lava(70, 6); /* 又是弹簧渡岩浆 */
    g.coinArc(71, 5);
    g.leopard(80);
    g.wolf(83);
    g.lava(88, 5);
    g.mplat(88, 10, 92, 8);
    g.coinRow(89, 7, 3);
    g.cannon(97);
    /* —— 裂谷地窖:坐地重击砸开砖盖掏蛋 —— */
    g.cellar(94, 98);
    g.coin(95, 12);
    g.coin(97, 12);
    g.egg(96, 13); /* 裂谷地窖深处 */
    g.solid(102, 9, 11);
    g.solid(106, 9, 11);
    g.brick(102, 8, 5);
    g.q(104, 8, 3); /* 铃铛箱嵌砖架 */
    g.pit(108, 111);
    g.cr(109, 3);
    g.coinRow(112, 10, 3);
    g.wolf(119);
    g.coinRow(117, 11, 3);
    g.flag(123); /* 112..121 平坦 Boss 坪台 */
  });

  defLevel(130, "4-3 曼巴火焰之路", 3, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 9, 4);
    g.spike(13, 3);
    g.lava(19, 4);
    g.spike(26, 3); /* 刺-浆-刺三连 */
    g.plat(13, 9, 3);
    g.plat(26, 9, 3);
    g.brick(32, 8, 8); /* 火焰走廊顶 */
    g.q(35, 8, 4);
    g.q(38, 8, 6);
    g.wolf(36);
    g.leopard(43);
    g.leopard(46);
    g.cannon(52);
    g.lava(56, 5);
    g.cannon(64); /* 隔岸对轰 */
    g.spring(70);
    g.lava(71, 5); /* 最长一跳交给弹簧 */
    g.coinArc(72, 5);
    g.bigc(75, 4);
    /* —— 熔岩井二号:下井捞蛋蹬墙跑 —— */
    g.mesa(79, 79, 5);
    g.mesa(83, 83, 4);
    g.lava(80, 3);
    g.plat(77, 8, 2); /* 入井小阶 */
    g.egg(81, 8); /* 熔岩井二号:捞蛋就跑 */
    g.pit(88, 91);
    g.plat(89, 9, 2);
    g.raven(95, 6);
    g.raven(99, 7);
    g.lava(104, 9);
    g.cr(105, 7); /* 终局碎板冲刺 */
    g.coinRow(105, 9, 7);
    g.solid(113, 9, 11);
    g.solid(115, 9, 11);
    g.brick(113, 8, 3);
    g.q(114, 8, 1); /* 弹币箱嵌门形砖架 */
    g.wolf(119);
    g.coinRow(116, 11, 3);
    g.flag(123); /* 116..122 平坦 Boss 坪台 */
  });

  defLevel(112, "4-4 GPT 老板朝圣", 3, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(9, 10, 5);
    g.solid(15, 9, 11);
    g.solid(18, 9, 11);
    g.brick(15, 8, 4);
    g.q(15, 8, 1);
    g.pit(20, 23);
    g.coinArc(21, 9);
    g.wolf(28);
    g.spring(34);
    g.coinRow(33, 5, 5);
    g.bigc(36, 4);
    g.pit(40, 43);
    g.plat(41, 9, 2);
    g.solid(46, 9, 11);
    g.solid(50, 9, 11);
    g.brick(46, 8, 5);
    g.q(48, 8, 6); /* 星星箱嵌门形砖架 */
    g.leopard(55);
    /* —— 小圣井:圣坛下的井,蹬墙进洞掏宝 —— */
    g.mesa(60, 60, 4);
    g.mesa(64, 64, 3);
    g.plat(57, 7, 2); /* 入井阶 */
    g.egg(62, 8); /* 圣井底:采蛋蹬墙出井 */
    g.pit(66, 69);
    g.coinRow(66, 9, 4);
    g.cannon(74);
    g.wolf(78);
    g.q(82, 8, 3);
    g.pit(86, 89);
    g.cr(86, 4, 11);
    g.coinRow(92, 11, 5);
    g.raven(96, 7);
    g.flag(104); /* 90..103 平坦 Boss 坪台 */
  });

  /* ================= 世界5 · 月面攻势:终局试炼场 ================= */

  defLevel(122, "5-1 问芯月面基地", 4, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.pipe(13, 2);
    g.cannon(18);
    g.pit(23, 27);
    g.raven(25, 7);
    g.spring(32);
    g.plat(31, 6, 4); /* 基地高架栈道 */
    g.coinRow(31, 5, 3);
    g.q(34, 5, 6); /* 星星箱坐栈道板尾正上方 */
    g.wolf(40);
    g.leopard(44);
    g.pit(48, 52);
    g.plat(49, 9, 3);
    g.pipe(57, 4);
    g.cannon(57, 7.25); /* 坐在管顶,不嵌墙 */
    g.wolf(62);
    g.pit(66, 70);
    g.cr(67, 3);
    g.raven(74, 6);
    g.raven(78, 8);
    g.spring(83);
    g.coinRow(82, 5, 4);
    /* —— 月井:月面深井,蹬墙采蛋 —— */
    g.mesa(88, 88, 5);
    g.mesa(92, 92, 3);
    g.plat(86, 8, 2); /* 入井阶 */
    g.egg(90, 9); /* 月井底 */
    g.leopard(94);
    g.cannon(99);
    g.pit(104, 108);
    g.coinArc(105, 9);
    g.wolf(112);
    g.coinRow(113, 11, 3);
    g.flag(117); /* 109..116 平坦 Boss 坪台 */
  });

  defLevel(128, "5-2 万嗒环形山", 4, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    g.pit(13, 18);
    g.mesa(15, 16, 10); /* 山心的柱子 */
    g.coin(15, 9);
    g.pit(22, 27);
    g.plat(23, 9, 2);
    g.plat(26, 9, 2);
    g.solid(28, 9, 11);
    g.solid(32, 9, 11);
    g.brick(28, 8, 5);
    g.q(30, 8, 3); /* 铃铛箱嵌门形砖架 */
    g.wolf(34);
    g.pit(36, 44); /* 大环山:碎板双桥 */
    g.cr(37, 4);
    g.mesa(42, 43, 11);
    g.raven(40, 7);
    g.cannon(49);
    g.leopard(54);
    g.spring(59);
    g.coinRow(58, 5, 5);
    g.bigc(61, 4);
    g.pit(65, 70);
    g.mplat(66, 10, 69, 8);
    g.cannon(75);
    g.spike(80, 3);
    g.plat(80, 9, 3);
    g.wolf(87);
    g.wolf(90);
    g.pit(94, 100);
    g.cr(95, 5);
    g.raven(98, 6);
    /* —— 环形山矿窑:坐地重击开盖 —— */
    g.cellar(103, 107);
    g.coin(104, 12);
    g.coin(106, 12);
    g.egg(105, 13); /* 矿窑深处 */
    g.leopard(111);
    g.brick(114, 8, 3);
    g.q(116, 8, 2); /* 星星箱嵌砖排 */
    g.pit(116, 119);
    g.coinArc(117, 9);
    g.wolf(113);
    g.coinRow(120, 11, 3);
    g.flag(126); /* 120..125 平坦 Boss 坪台 */
  });

  defLevel(126, "5-3 质朴矩阵", 4, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 9, 4);
    /* 砖矩阵A:核心藏在正中 */
    g.brick(14, 8, 3);
    g.q(15, 8, 4);
    g.brick(19, 8, 3);
    g.brick(14, 5, 3);
    g.q(15, 5, 2);
    g.brick(19, 5, 3);
    g.wolf(25);
    g.spike(30, 2);
    g.plat(30, 9, 2);
    g.spike(34, 2);
    g.plat(34, 9, 2);
    g.raven(40, 6);
    g.raven(44, 8);
    /* 砖矩阵B:双层 */
    g.brick(50, 8, 2);
    g.q(52, 8, 1);
    g.brick(54, 8, 2);
    g.brick(50, 5, 6);
    g.q(53, 5, 7);
    g.leopard(60);
    g.pit(64, 69);
    g.plat(65, 9, 2);
    g.plat(68, 9, 1);
    g.cannon(74);
    g.cannon(80); /* 双炮守门 */
    g.wolf(77);
    g.pit(85, 90);
    g.cr(86, 4);
    /* —— 矩阵地窖:坐地重击砸开砖盖掏金蛋 —— */
    g.cellar(93, 98);
    g.coin(94, 12);
    g.coin(96, 12);
    g.coin(95, 13);
    g.egg(97, 13); /* 矩阵地窖深处 */
    g.spring(103);
    g.plat(102, 5, 4);
    g.coinRow(102, 4, 4);
    g.bigc(105, 3);
    g.spike(110, 3);
    g.plat(110, 9, 3);
    g.raven(115, 6);
    g.wolf(117);
    g.coinRow(119, 11, 3);
    g.flag(121); /* 112..120 平坦 Boss 坪台 */
  });

  /* ================= 世界6 · 星云霓虹:大模型第二梯队登场 ================= */

  defLevel(124, "6-1 吉米你双子谷", 5, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.pit(13, 18);
    g.mplat(14, 11, 17, 8);
    g.coinRow(14, 7, 3);
    g.wolf(23);
    g.mesa(27, 29, 9);
    g.pit(30, 33);
    g.mesa(34, 36, 8);
    g.coinRow(27, 8, 3);
    g.coin(34, 7);
    g.leopard(41);
    g.spike(45, 3);
    g.plat(45, 9, 3);
    g.coinRow(45, 8, 3);
    g.cannon(52);
    g.spring(58);
    g.plat(56, 5, 4);
    g.coinRow(56, 4, 4);
    g.q(59, 4, 2);
    /* 双子井:下井摘蛋,蹬墙出井(1-2 同款) */
    g.pit(65, 75);
    g.ground(69, 73);
    g.mesa(69, 69, 5);
    g.mesa(73, 73, 3);
    g.plat(66, 8, 2);
    g.plat(68, 6, 1);
    g.plat(75, 2, 1);
    g.plat(76, 4, 2);
    g.coin(75, 1);
    g.coin(76, 1);
    g.egg(72, 8);
    g.raven(79, 7);
    g.wolf(84);
    g.leopard(88);
    g.pit(93, 97);
    g.coinArc(94, 9);
    g.bird(101, 6);
    g.raven(105, 7);
    g.coinRow(112, 11, 3);
    g.flag(118); /* 106..118 平坦 Boss 坪台 */
  });

  defLevel(128, "6-2 密斯特拉风谷", 5, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    g.cannon(13);
    g.cannon(16);
    g.wolf(20);
    g.pit(25, 33);
    g.mplat(26, 10, 32, 10);
    g.coinRow(27, 7, 4);
    g.leopard(38);
    g.pit(42, 47);
    g.cr(43, 4);
    g.coinRow(43, 9, 4);
    g.raven(51, 6);
    g.raven(55, 8);
    g.spike(60, 4);
    g.plat(60, 9, 4);
    g.pipe(66, 4);
    g.cannon(66, 7.25);
    g.pipe(70, 2);
    g.spring(76);
    g.plat(74, 5, 4);
    g.coinRow(74, 4, 4);
    g.q(77, 4, 6);
    /* 风蚀井:下井摘蛋,蹬墙出井 */
    g.pit(80, 90);
    g.ground(84, 88);
    g.mesa(84, 84, 5);
    g.mesa(88, 88, 3);
    g.plat(81, 8, 2);
    g.plat(83, 6, 1);
    g.plat(90, 2, 1);
    g.plat(91, 4, 2);
    g.coin(90, 1);
    g.coin(91, 1);
    g.egg(87, 8);
    g.leopard(95);
    g.wolf(98);
    g.cannon(103);
    g.spike(104, 3);
    g.coinRow(112, 11, 3);
    g.flag(121); /* 107..121 平坦 Boss 坪台 */
  });

  defLevel(130, "6-3 弗拉克斯闪电站", 5, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.spike(13, 3);
    g.plat(13, 9, 3);
    g.coinRow(13, 8, 3);
    g.pit(18, 24);
    g.cr(19, 5);
    g.coinRow(19, 9, 5);
    g.wolf(29);
    g.leopard(33);
    g.mesa(37, 39, 9);
    g.pit(40, 43);
    g.mesa(44, 46, 8);
    g.coinRow(37, 8, 3);
    g.cannon(50);
    g.bigc(52, 9);
    g.cannon(54);
    g.raven(58, 6);
    g.raven(62, 8);
    g.spring(67);
    g.plat(65, 4, 4);
    g.coinRow(65, 3, 4);
    g.q(68, 3, 3);
    /* 闪电站地窖:坐地重击开盖 */
    g.cellar(73, 76);
    g.coin(74, 12);
    g.coin(75, 13);
    g.egg(74, 13);
    g.wolf(81);
    g.leopard(84);
    g.pit(89, 95);
    g.cr(90, 5);
    g.raven(92, 7);
    g.spike(100, 4);
    g.plat(100, 9, 4);
    g.pit(106, 109);
    g.coinArc(107, 9);
    g.solid(113, 9, 11);
    g.solid(117, 9, 11);
    g.brick(113, 8, 5);
    g.q(115, 8, 1);
    g.coinRow(121, 11, 3);
    g.flag(125); /* 118..130 平坦 Boss 坪台 */
  });

  defLevel(126, "6-4 苏诺回音谷", 5, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.spring(14);
    g.plat(12, 5, 4);
    g.coinRow(12, 4, 4);
    g.bigc(15, 3);
    g.wolf(21);
    g.leopard(25);
    g.pit(30, 36);
    g.mplat(31, 10, 35, 7);
    g.coinRow(32, 5, 3);
    g.mesa(40, 42, 9);
    g.pit(43, 46);
    g.mesa(47, 49, 10);
    g.coinRow(40, 8, 3);
    g.bird(52, 6);
    g.pipe(56, 3);
    g.pipe(60, 2);
    g.wolf(64);
    g.spike(68, 3);
    g.plat(68, 9, 3);
    g.spring(74);
    g.plat(72, 5, 4);
    g.coinRow(72, 4, 4);
    g.q(75, 4, 2);
    /* 回音井:下井摘蛋,蹬墙出井 */
    g.pit(76, 86);
    g.ground(80, 84);
    g.mesa(80, 80, 5);
    g.mesa(84, 84, 3);
    g.plat(77, 8, 2);
    g.plat(79, 6, 1);
    g.plat(86, 2, 1);
    g.plat(87, 4, 2);
    g.coin(86, 1);
    g.coin(87, 1);
    g.egg(83, 8);
    g.raven(89, 7);
    g.leopard(92);
    g.wolf(95);
    g.pit(100, 104);
    g.cr(101, 3);
    g.coinRow(101, 9, 3);
    g.cannon(107);
    g.coinRow(112, 11, 3);
    g.flag(118); /* 105..118 平坦 Boss 坪台 */
  });

  /* ================= 世界7 · 抱抱脸乐园:开源社区大乱斗 ================= */

  defLevel(122, "7-1 抱抱脸游乐园", 6, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.pipe(14, 2);
    g.pipe(18, 3);
    g.wolf(23);
    g.pipe(27, 4);
    g.leopard(31);
    g.brick(35, 6, 6);
    g.q(37, 6, 4);
    g.wolf(38);
    g.pit(44, 48);
    g.plat(45, 9, 3);
    g.coinRow(45, 8, 3);
    g.spring(53);
    g.plat(51, 5, 4);
    g.coinRow(51, 4, 4);
    g.q(54, 4, 6);
    g.raven(58, 6);
    g.raven(62, 8);
    /* 拥抱地窖:坐地重击开盖 */
    g.cellar(66, 69);
    g.coin(67, 12);
    g.coin(68, 13);
    g.egg(67, 13);
    g.wolf(74);
    g.leopard(78);
    g.pit(83, 89);
    g.mplat(84, 10, 88, 10);
    g.coinRow(85, 7, 4);
    g.spike(94, 3);
    g.plat(94, 9, 3);
    g.mesa(99, 101, 9);
    g.coinRow(99, 8, 3);
    g.pit(103, 105);
    g.coinArc(104, 9);
    g.coinRow(110, 11, 3);
    g.flag(116); /* 106..116 平坦 Boss 坪台 */
  });

  defLevel(126, "7-2 皮卡闪电原", 6, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.spike(13, 4);
    g.plat(13, 9, 4);
    g.coinRow(13, 8, 4);
    g.wolf(20);
    g.leopard(24);
    g.pit(29, 35);
    g.cr(30, 5);
    g.coinRow(30, 9, 5);
    g.raven(38, 6);
    g.raven(42, 7);
    g.spring(47);
    g.plat(45, 5, 4);
    g.coinRow(45, 4, 4);
    g.q(48, 4, 2);
    g.cannon(53);
    g.mesa(58, 60, 10);
    g.pit(61, 64);
    g.mesa(65, 67, 9);
    g.coinRow(58, 9, 3);
    g.coin(65, 8);
    /* 雷光井:下井摘蛋,蹬墙出井 */
    g.pit(78, 88);
    g.ground(82, 86);
    g.mesa(82, 82, 5);
    g.mesa(86, 86, 3);
    g.plat(79, 8, 2);
    g.plat(81, 6, 1);
    g.plat(88, 2, 1);
    g.plat(89, 4, 2);
    g.coin(88, 1);
    g.coin(89, 1);
    g.egg(85, 8);
    g.raven(92, 7);
    g.leopard(96);
    g.wolf(99);
    g.wolf(102);
    g.spike(108, 3);
    g.plat(108, 9, 3);
    g.coinRow(116, 11, 3);
    g.flag(121); /* 111..126 平坦 Boss 坪台 */
  });

  defLevel(124, "7-3 扣子流水线", 6, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.pit(13, 19);
    g.mplat(14, 10, 18, 10);
    g.coinRow(15, 7, 4);
    g.pit(22, 29);
    g.mplat(23, 10, 28, 7);
    g.coinRow(24, 5, 3);
    g.leopard(33);
    g.wolf(36);
    g.pit(40, 45);
    g.cr(41, 4);
    g.coinRow(41, 9, 4);
    g.cannon(50);
    g.cannon(53);
    g.spring(59);
    g.plat(57, 5, 4);
    g.coinRow(57, 4, 4);
    g.q(60, 4, 3);
    g.bird(65, 6);
    g.raven(70, 7);
    g.wolf(74);
    g.leopard(78);
    g.spike(82, 3);
    g.plat(82, 9, 3);
    /* 流水线井:下井摘蛋,蹬墙出井 */
    g.pit(88, 98);
    g.ground(92, 96);
    g.mesa(92, 92, 5);
    g.mesa(96, 96, 3);
    g.plat(89, 8, 2);
    g.plat(91, 6, 1);
    g.plat(98, 2, 1);
    g.plat(99, 4, 2);
    g.coin(98, 1);
    g.coin(99, 1);
    g.egg(95, 8);
    g.leopard(104);
    g.pit(108, 110);
    g.coinArc(109, 9);
    g.coinRow(116, 11, 3);
    g.flag(121); /* 111..124 平坦 Boss 坪台 */
  });

  defLevel(124, "7-4 卡索代码塔", 6, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    /* 代码阶梯:逐级蹬跳上塔 */
    g.plat(14, 10, 2);
    g.plat(18, 8, 2);
    g.plat(22, 6, 2);
    g.coinRow(14, 9, 2);
    g.coinRow(22, 5, 2);
    g.q(23, 5, 2);
    g.mesa(28, 31, 7);
    g.coin(29, 6);
    g.coin(30, 6);
    g.pit(32, 36);
    g.mplat(33, 6, 36, 9);
    g.coinRow(33, 5, 3);
    g.leopard(41);
    g.wolf(44);
    g.brick(48, 8, 6);
    g.q(50, 8, 4);
    g.q(53, 8, 6);
    g.spike(60, 3);
    g.plat(60, 9, 3);
    g.spring(66);
    g.plat(64, 5, 4);
    g.coinRow(64, 4, 4);
    /* 代码井:下井摘蛋,蹬墙出井 */
    g.pit(76, 86);
    g.ground(80, 84);
    g.mesa(80, 80, 5);
    g.mesa(84, 84, 3);
    g.plat(77, 8, 2);
    g.plat(79, 6, 1);
    g.plat(86, 2, 1);
    g.plat(87, 4, 2);
    g.coin(86, 1);
    g.coin(87, 1);
    g.egg(83, 8);
    g.raven(90, 7);
    g.leopard(93);
    g.wolf(96);
    g.mesa(101, 103, 9);
    g.coinRow(101, 8, 3);
    g.coinRow(110, 11, 3);
    g.flag(117); /* 104..117 平坦 Boss 坪台 */
  });

  /* ================= 世界8 · 炼丹星火山:算力军备竞赛 ================= */

  defLevel(126, "8-1 星火炼丹炉", 7, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    g.lava(13, 4);
    g.coinArc(13, 9);
    g.lava(19, 3);
    g.wolf(24);
    g.lava(28, 5);
    g.mesa(30, 31, 11);
    g.coin(30, 10);
    g.spring(37);
    g.lava(38, 5);
    g.coinArc(39, 6);
    g.leopard(45);
    g.cannon(50);
    g.cannon(54);
    g.lava(58, 6);
    g.plat(59, 9, 4);
    g.coinRow(59, 8, 4);
    g.raven(66, 6);
    g.mesa(70, 72, 9);
    g.pit(73, 76);
    g.mesa(77, 79, 10);
    g.coinRow(70, 8, 3);
    /* 炼丹地窖:坐地重击开盖 */
    g.cellar(84, 87);
    g.coin(85, 12);
    g.coin(86, 13);
    g.egg(85, 13);
    g.lava(92, 4);
    g.cr(92, 3, 11);
    g.wolf(100);
    g.leopard(103);
    g.lava(107, 4);
    g.coinArc(108, 9);
    g.coinRow(114, 11, 3);
    g.flag(120); /* 111..126 平坦 Boss 坪台 */
  });

  defLevel(124, "8-2 天工云阶", 7, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.plat(13, 10, 2);
    g.plat(17, 9, 2);
    g.plat(21, 8, 2);
    g.coinRow(13, 9, 2);
    g.coinRow(21, 7, 2);
    g.q(22, 7, 6);
    g.wolf(27);
    g.raven(30, 6);
    g.raven(34, 8);
    g.pit(38, 44);
    g.mplat(39, 10, 43, 8);
    g.coinRow(40, 6, 3);
    g.mesa(48, 50, 9);
    g.pit(51, 54);
    g.mesa(55, 57, 8);
    g.coin(48, 8);
    g.coin(55, 7);
    g.spring(62);
    g.plat(60, 5, 4);
    g.coinRow(60, 4, 4);
    g.q(63, 4, 3);
    g.leopard(68);
    g.cannon(72);
    g.spike(76, 3);
    g.plat(76, 9, 3);
    g.raven(83, 6);
    g.cannon(86);
    /* 天工井:下井摘蛋,蹬墙出井 */
    g.pit(90, 100);
    g.ground(94, 98);
    g.mesa(94, 94, 5);
    g.mesa(98, 98, 3);
    g.plat(91, 8, 2);
    g.plat(93, 6, 1);
    g.plat(100, 2, 1);
    g.plat(101, 4, 2);
    g.coin(100, 1);
    g.coin(101, 1);
    g.egg(97, 8);
    g.leopard(105);
    g.coinRow(114, 11, 3);
    g.flag(119); /* 105..119 平坦 Boss 坪台 */
  });

  defLevel(128, "8-3 秘塔书阵", 7, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 9, 4);
    /* 书阵A:双层砖阵,核心藏正中 */
    g.brick(15, 8, 3);
    g.q(16, 8, 4);
    g.brick(20, 8, 3);
    g.brick(15, 5, 3);
    g.q(16, 5, 2);
    g.brick(20, 5, 3);
    g.wolf(26);
    g.spike(31, 2);
    g.plat(31, 9, 2);
    g.spike(35, 2);
    g.plat(35, 9, 2);
    g.raven(41, 6);
    g.raven(45, 8);
    /* 书阵B:双层弹箱墙 */
    g.brick(51, 8, 2);
    g.q(53, 8, 1);
    g.brick(55, 8, 2);
    g.brick(51, 5, 6);
    g.q(54, 5, 7);
    g.leopard(61);
    g.pit(65, 70);
    g.plat(66, 9, 2);
    g.plat(69, 9, 1);
    g.coinArc(66, 8);
    g.cannon(75);
    g.wolf(78);
    g.cannon(81);
    g.pit(86, 91);
    g.cr(87, 4);
    g.coinRow(87, 10, 3);
    /* 书阵地窖:坐地重击开盖 */
    g.cellar(95, 99);
    g.coin(96, 12);
    g.coin(98, 12);
    g.coin(97, 13);
    g.egg(97, 13);
    g.spring(104);
    g.plat(102, 5, 4);
    g.coinRow(102, 4, 4);
    g.bigc(105, 3);
    g.spike(110, 3);
    g.plat(110, 9, 3);
    g.raven(114, 6);
    g.coinRow(118, 11, 3);
    g.flag(123); /* 113..128 平坦 Boss 坪台 */
  });

  defLevel(130, "8-4 恩伟达熔芯道", 7, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.lava(13, 5);
    g.coinArc(15, 8);
    g.wolf(23);
    g.lava(27, 5);
    g.mesa(33, 34, 11);
    g.lava(35, 4);
    g.coin(33, 10);
    g.cannon(41);
    g.cannon(45);
    g.lava(49, 6);
    g.plat(50, 9, 4);
    g.coinRow(50, 8, 4);
    g.raven(56, 6);
    g.raven(60, 7);
    g.spring(65);
    g.lava(66, 6);
    g.coinArc(67, 5);
    g.leopard(74);
    g.wolf(77);
    g.lava(81, 5);
    g.mplat(81, 10, 84, 8);
    g.coinRow(82, 7, 3);
    /* 熔芯井:底下岩浆,下井捞蛋蹬墙逃命(4-1 同款) */
    g.mesa(88, 88, 5);
    g.mesa(92, 92, 4);
    g.lava(89, 3);
    g.plat(86, 8, 1);
    g.egg(90, 8);
    g.coin(90, 10);
    g.leopard(97);
    g.cannon(101);
    g.lava(105, 9);
    g.cr(106, 7);
    g.coinRow(106, 9, 7);
    g.solid(116, 9, 11);
    g.solid(118, 9, 11);
    g.brick(116, 8, 3);
    g.q(117, 8, 1);
    g.wolf(122);
    g.coinRow(125, 11, 3);
    g.flag(127); /* 114..130 平坦 Boss 坪台 */
  });

  /* ================= 终章 · Anthropic 机房:紧凑竞技场决战 ================= */

  defLevel(34, "终章 Anthropic 机房", 4, function (g) {
    g.ground(0, 33);
    g.startX = 3;
    g.solid(0, 0, 14);
    g.solid(33, 0, 14); /* 机房竞技场:紧凑围墙 */
    g.plat(5, 9, 4);
    g.plat(24, 9, 4);
    g.plat(14, 5, 6);
    g.coinRow(14, 3, 6);
    g.q(17, 4, 5); /* 决战前的奶 */
    g.egg(14, 4); /* 热身蛋 */
    g.flagX = -1; /* 不设旗:打倒 Anthropic Dario 即通关 */
  });

  return LEVELS;
};
