"use strict";

/**
 * Builds all level layouts. Every level is hand-placed around the real jump
 * physics (hold-jump apex ≈4.7 tiles small / 6.4 big, spring ≈10.7, run-jump
 * length ≈8 tiles) so obstacles are readable, demanding and never duplicated.
 *
 * Tile legend:
 * 0 empty, 1 ground, 2 solid, 3 brick, 4 coin box, 5 milk box,
 * 6 star box, 7 bell box, 8 used box, 9 one-way platform, 10 spike,
 * 11 lava, 12 spring, 13 pipe top, 14 pipe body, 15 flag, 16 crumble,
 * 17 gate (opens when the guarding GPT 老板 is defeated).
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
  /* 实心高台:从 topRow 到 11 行的实心柱群(顶面即 topRow 行) */
  LV.prototype.mesa = function (x1, x2, topRow) {
    this.fill(x1, x2, topRow, 11, 2);
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
    this.set(x, y === undefined ? 12 : y, 12);
  };
  LV.prototype.spike = function (x, n) {
    this.spikeAt(x, 12, n);
  };
  LV.prototype.spikeAt = function (x, y, n) {
    for (var i = 0; i < n; i++) this.set(x + i, y, 10);
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
  LV.prototype.cannon = function (x, y) {
    this.ent({ k: "cannon", x: x, y: y === undefined ? 11.25 : y });
  };
  /* 旗门:守关老板死亡前封住旗杆(5..11 行铁柱,轰不开跳不过) */
  LV.prototype.gate = function (x) {
    for (var y = 5; y <= 11; y++) this.set(x, y, 17);
  };
  LV.prototype.flag = function (x) {
    this.flagX = x;
    this.flagY = 8;
    for (var y = 8; y <= 11; y++) this.set(x, y, 15);
    this.set(x, 12, 2);
    this.gate(x - 2); /* 旗门与旗杆绑定生成,保证守关 Boss 必打 */
  };
  LV.prototype.mplat = function (x1, y1, x2, y2) {
    this.ents.push({ k: "move", x: x1, y: y1, x2: x2, y2: y2 });
  };
  LV.prototype.cr = function (x, n, y) {
    var ry = y === undefined ? 11 : y;
    for (var i = 0; i < n; i++) this.set(x + i, ry, 16);
  }; /* 碎板:踩上0.75秒塌 */
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

  /* ================= 世界1 · 格莱美草原:把"真坑真跳"教会你 ================= */

  defLevel(118, "1-1 格莱美草原", 0, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(9, 10, 4);
    g.bigc(14, 9);
    g.pit(17, 19); /* 第一个真的坑:3格助跑跳 */
    g.coinArc(17, 10);
    g.wolf(25);
    g.q(29, 8, 1);
    g.brick(31, 8, 2);
    g.q(34, 8, 4);
    g.pipe(39, 2);
    g.wolf(44);
    g.pit(47, 51); /* 5格:需要按住跳 */
    g.coinArc(48, 9);
    g.leopard(57);
    g.spring(64);
    g.pit(66, 70); /* 弹簧正好把人射过坑 */
    g.coinArc(67, 8);
    g.q(71, 6, 3); /* 弹簧二段:空中够到铃铛 */
    g.pit(78, 83);
    g.cr(79, 4); /* 第一座碎板桥:冲过去,别停 */
    g.bird(88, 7);
    g.raven(93, 6); /* 低空巡游:看准再走 */
    g.pit(97, 100);
    g.coinRow(97, 9, 4);
    g.wolf(105);
    /* 守关区 */
    g.coinRow(104, 11, 3);
    g.flag(112);
  });

  defLevel(122, "1-2 云雀千问", 0, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    g.pit(13, 18); /* 独木桥:两块单格浮板 */
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
    g.plat(42, 6, 4); /* 高空金币线 */
    g.coinRow(42, 5, 4);
    g.q(45, 5, 6); /* 星星在高处 */
    g.pit(49, 54);
    g.raven(51, 8); /* 坑口正上方盘旋:算好起跳时机 */
    g.pit(58, 64);
    g.mplat(58, 10, 63, 7); /* 斜向渡板(也可硬跳) */
    g.coinRow(59, 8, 3);
    g.pit(69, 75);
    g.cr(70, 5);
    g.wolf(81);
    g.leopard(85);
    g.wolf(89);
    g.mesa(94, 95, 11);
    g.mesa(99, 100, 10); /* 双台阶 */
    g.pit(103, 106);
    g.plat(104, 9, 2);
    g.raven(109, 7);
    g.flag(114);
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
    g.brick(41, 8, 5);
    g.q(43, 8, 5);
    g.leopard(49);
    g.spike(55, 6); /* 岩谷名场面:碎板桥横越尖刺 */
    g.cr(55, 6);
    g.coinRow(55, 9, 6);
    g.pit(65, 68);
    g.coinArc(66, 9);
    g.raven(71, 6);
    g.raven(75, 7);
    g.spring(79);
    g.plat(78, 5, 3);
    g.bigc(79, 4);
    g.wolf(85);
    g.leopard(89);
    g.pipe(93, 3);
    g.spike(99, 4);
    g.plat(99, 9, 4);
    g.pit(105, 111);
    g.mplat(105, 10, 110, 6);
    g.coinRow(107, 8, 3);
    g.flag(117);
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
    g.q(56, 8, 2);
    g.brick(58, 8, 3);
    g.raven(62, 6);
    g.raven(66, 8);
    g.mesa(70, 72, 9); /* 平顶丘跳跃 */
    g.pit(73, 76);
    g.mesa(77, 79, 9);
    g.coinRow(70, 8, 3);
    g.spring(84);
    g.coinRow(83, 4, 5); /* 春天般的金币雨 */
    g.pit(89, 96);
    g.cr(90, 6);
    g.wolf(101);
    g.wolf(104);
    g.wolf(107);
    g.pit(111, 114);
    g.coinArc(112, 9);
    g.flag(122);
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
    g.q(59, 8, 1);
    g.pipe(63, 2);
    g.pipe(67, 4);
    g.pipe(71, 4);
    g.cannon(71, 7.25); /* 管顶炮台 */
    g.pit(76, 80);
    g.plat(77, 9, 3);
    g.raven(85, 6);
    g.spring(90);
    g.coinRow(89, 5, 4);
    g.pit(95, 101);
    g.cr(96, 5);
    g.leopard(105);
    g.cannon(109);
    g.flag(115);
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
    g.plat(68, 5, 4);
    g.coinRow(68, 4, 4);
    g.q(71, 4, 6);
    g.pit(75, 79);
    g.cr(76, 3);
    g.spike(84, 3);
    g.plat(84, 9, 3);
    g.wolf(90);
    g.leopard(93);
    g.cannon(99);
    g.pit(104, 108);
    g.coinArc(105, 9);
    g.mplat(104, 10, 108, 7);
    g.raven(113, 6);
    g.flag(119);
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
    g.leopard(80);
    g.leopard(84);
    g.spring(89);
    g.coinRow(88, 5, 5);
    g.bigc(91, 4);
    g.pit(94, 98);
    g.cr(95, 3);
    g.mesa(103, 105, 11);
    g.mesa(108, 110, 10);
    g.raven(114, 6);
    g.flag(121);
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
    g.brick(57, 8, 5);
    g.q(59, 8, 1);
    g.leopard(64);
    g.wolf(67);
    g.pit(72, 76);
    g.spike(78, 3);
    g.plat(78, 9, 3);
    g.pit(85, 97); /* 双段碎板长桥 */
    g.cr(86, 5);
    g.solid(92, 11, 11);
    g.cr(93, 4);
    g.coinRow(87, 9, 4);
    g.wolf(102);
    g.leopard(106);
    g.cannon(111);
    g.pit(116, 119);
    g.coinArc(117, 9);
    g.flag(123);
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
    g.leopard(70);
    g.spring(70);
    g.coinArc(71, 6);
    g.spike(82, 3);
    g.pit(88, 92);
    g.plat(89, 9, 3);
    g.q(96, 8, 6);
    g.wolf(101);
    g.pit(105, 108);
    g.coinArc(106, 9);
    g.flag(114);
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
    g.mesa(74, 76, 11); /* 雪脊 */
    g.pit(78, 81);
    g.mesa(82, 84, 10);
    g.pit(86, 89);
    g.raven(93, 6);
    g.raven(97, 7);
    g.cannon(103);
    g.pit(108, 111);
    g.plat(109, 9, 2);
    g.leopard(116);
    g.flag(119);
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
    g.q(32, 5, 3);
    g.bigc(33, 4);
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
    g.flag(120);
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
    g.wolf(60);
    g.leopard(63);
    g.pit(68, 79);
    g.mplat(69, 10, 74, 10);
    g.mplat(74, 10, 78, 8);
    g.coinRow(71, 7, 4);
    g.spring(85);
    g.coinRow(84, 4, 5);
    g.bigc(87, 3);
    g.wolf(94);
    g.wolf(97);
    g.leopard(100);
    g.pit(105, 111);
    g.plat(106, 10, 1);
    g.plat(109, 9, 1);
    g.coin(106, 9);
    g.coin(109, 8);
    g.raven(115, 6);
    g.flag(124);
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
    /* 岩浆海:中段安全岛让检查点能落地 */
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
    g.q(79, 8, 1);
    g.lava(82, 8);
    g.cr(83, 6); /* 碎板冲刺越过岩浆 */
    g.coinRow(83, 9, 6);
    g.wolf(95);
    g.q(99, 8, 5);
    g.pit(103, 106);
    g.coinArc(104, 9);
    g.leopard(110);
    g.flag(117);
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
    g.pit(102, 105);
    g.cr(102, 4, 11);
    g.q(107, 8, 2);
    g.spike(112, 3);
    g.plat(112, 9, 3);
    g.leopard(117); /* 旗门外巡逻,不嵌门柱 */
    g.flag(121);
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
    g.pit(82, 85);
    g.plat(83, 9, 2);
    g.raven(89, 6);
    g.raven(93, 7);
    g.lava(98, 9);
    g.cr(99, 7); /* 终局碎板冲刺 */
    g.coinRow(99, 9, 7);
    g.wolf(112);
    g.q(116, 8, 1);
    g.flag(123);
  });

  defLevel(112, "4-4 GPT 老板朝圣", 3, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(9, 10, 5);
    g.q(15, 8, 1);
    g.pit(20, 23);
    g.coinArc(21, 9);
    g.wolf(28);
    g.spring(34);
    g.coinRow(33, 5, 5);
    g.bigc(36, 4);
    g.pit(40, 43);
    g.plat(41, 9, 2);
    g.q(47, 8, 6);
    g.brick(49, 8, 3);
    g.leopard(55);
    g.pit(60, 63);
    g.coinRow(60, 9, 4);
    g.cannon(68);
    g.wolf(74);
    g.q(78, 8, 3);
    g.pit(82, 85);
    g.cr(82, 4, 11);
    g.coinRow(88, 11, 5);
    g.raven(92, 7);
    g.flag(104);
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
    g.coinRow(31, 5, 4);
    g.q(34, 4, 6);
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
    g.leopard(89);
    g.cannon(94);
    g.pit(99, 103);
    g.coinArc(100, 9);
    g.wolf(108);
    g.flag(115);
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
    g.wolf(32);
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
    g.leopard(106);
    g.q(110, 8, 2);
    g.pit(114, 117);
    g.coinArc(115, 9);
    g.flag(121);
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
    g.spring(95);
    g.plat(94, 5, 4);
    g.coinRow(94, 4, 4);
    g.bigc(97, 3);
    g.spike(102, 3);
    g.plat(102, 9, 3);
    g.raven(108, 6);
    g.flag(118);
  });

  defLevel(104, "5-4 Anthropic 机房", 4, function (g) {
    g.ground(0, 103);
    g.startX = 6;
    g.solid(4, 0, 14);
    g.solid(99, 0, 14); /* 机房竞技场:两侧服务器墙 */
    g.coinRow(10, 9, 4);
    g.q(16, 8, 5); /* 决战前的奶 */
    g.plat(30, 9, 3); /* 左服务机架:躲冲击波 */
    g.plat(46, 7, 3);
    g.plat(70, 9, 3);
    g.plat(84, 7, 3);
    g.coinRow(46, 6, 3);
    g.coinRow(84, 6, 3);
    g.q(60, 8, 2);
    g.flagX = -1; /* 不设旗:打倒 Anthropic Dario 即通关 */
  });

  return LEVELS;
};
