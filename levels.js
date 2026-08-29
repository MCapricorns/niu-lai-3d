"use strict";

/**
 * v2.1.0 关卡个性重制 · 全关像素级布局
 *
 * 设计哲学(致敬 IWBTG 系列"试错—掌握"循环):
 * - 每段障碍只有一个意图:刺坑=跳不过就死,顶刺=禁跳低走,窄板=一个像素的落点,
 *   碎板=看起来安全的地板,弹簧=要么弹上天堂要么弹进地狱。
 * - 段与段之间留 1-2 格"呼吸平台",绝不无脑堆机关;
 * - 所有尺寸按真实物理标定(T=40px):
 *   小跳顶点≈4.7 格(190px) / 跑跳水平≈5.5 格(222px)
 *   冲跳水平≈9.8 格(393px,Shift) / 弹簧顶点≈10.8 格(432px,按住跳)
 *   蹬墙跳≈4.2 格(169px)/跳
 * - 敌人领土制:一关 1-3 只地面怪独占巡逻区,周身 3 格内无刺/坑/炮/熔岩;
 *   乌鸦只压"禁跳线"(y8 行),绝不飘在窄板/弹簧正上;
 * - 每关末尾 flagX-7..flagX 绝对干净(无刺/无怪/无炮),守关 GPT 老板五格坪台必稳。
 *
 * Tile legend:
 * 0 empty, 1 ground, 2 solid, 3 brick, 4 coin box, 5 milk box,
 * 6 star box, 7 bell box, 8 used box, 9 one-way platform, 10 spike,
 * 11 lava, 12 spring, 13 pipe top, 14 pipe body, 15 flag, 16 crumble,
 * 17 gate (opens when the guarding GPT 老板 is defeated).
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
    /*
     * 选关卡片和开场提示共用的“关卡名片”。这不是单纯换皮：
     * 每一关先定义一个核心动作，再围绕它排障碍，避免所有地图
     * 都退化成“刺坑 + 窄板 + 狼”的同一道题。
     */
    this.profile = {
      icon: "!",
      title: "未知试炼",
      challenge: "观察路线",
      tip: "先看清楚，再起跳。",
      motif: "spike",
      difficulty: 1,
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
  /* 刺田:任意行铺连续尖刺(默认 11 行贴地) */
  LV.prototype.spikeField = function (x1, x2, y) {
    this.spikeAt(x1, y === undefined ? 11 : y, x2 - x1 + 1);
  };
  /* 贴地刺带:11 行铺刺(下方 12 行仍是地面),踏进=踩刺,只能跳过 */
  LV.prototype.spikeBelt = function (x1, x2) {
    this.spikeField(x1, x2, 11);
  };
  /* 刺坑:挖 10..14 行,刺贴 11 行。掉进去撞刺,跳不过去就完蛋 */
  LV.prototype.spikePit = function (x1, x2) {
    this.pit(x1, x2);
    this.spikeAt(x1, 11, x2 - x1 + 1);
  };
  /* 顶刺屋檐:y 行连续尖刺(默认 10 行)。站地面走安全,起跳即死 */
  LV.prototype.ceil = function (x1, x2, y) {
    this.spikeAt(x1, y === undefined ? 10 : y, x2 - x1 + 1);
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
  /* 金蛋:每关藏 1 颗在危险/刁钻位置,捡齐大满贯 */
  LV.prototype.egg = function (x, y) {
    this.eggs.push({ x: x, y: y, t: Math.random() * TAU });
  };
  LV.prototype.cellar = function (x1, x2, floorY) {
    this.fill(x1, x2, 10, 12, T.EMPTY);
    this.fill(x1, x2, floorY === undefined ? 13 : floorY, floorY === undefined ? 13 : floorY, T.GROUND);
    this.fill(x1, x2, 11, 11, T.BRICK);
  };
  LV.prototype.setProfile = function (icon, title, challenge, tip, motif, difficulty) {
    this.profile = {
      icon: icon,
      title: title,
      challenge: challenge,
      tip: tip,
      motif: motif,
      difficulty: difficulty || 1,
    };
  };

  var LEVELS = [];
  function defLevel(w, name, theme, fn) {
    var lv = new LV(w, name, theme);
    fn(lv);
    lv.walls();
    LEVELS.push(lv);
  }

  /* ================= 世界1 · 格莱美草原:把"刺=死"烙进肌肉 ================= */

  defLevel(112, "1-1 格莱美草原", 0, function (g) {
    g.startX = 3;
    g.setProfile("▲", "刺缝入门", "短跳 · 窄板 · 假桥", "低跳比莽撞更可靠。", "spike", 1);
    g.groundAll();
    g.coinRow(8, 10, 3);
    /* A 刺缝:2 格贴地刺,第一课——跳过去 */
    g.spikeBelt(14, 15);
    /* B 刺坑:4 格洞 + 洞底刺。落下必死,只能跳(跑跳 5.5 格正好) */
    g.spikePit(19, 22);
    g.coinArc(19, 9);
    g.bigc(21, 6); /* 大金币悬在跳坑弧顶:头掠过它,别贪心多看坑底 */
    /* C 双丘:连吐两口气的起跳点,落点都是 2 格高台 */
    g.mesa(25, 26, 11);
    g.mesa(30, 31, 10);
    /* D 窄板刺海:刺池 34..39,只有两块 40px 宽浮板。
       精确到像素——板间的空档全是刺(站板=安全,掉板=死) */
    g.pit(34, 39);
    g.spikeField(34, 39, 11);
    g.plat(36, 11, 1);
    g.plat(38, 11, 1);
    g.egg(37, 10); /* 金蛋悬在板与刺之间,轻跳擦中,过不去就下坠 */
    /* E 顶刺禁跳道:天花板 4 格尖刺直凿 10 行。走,别跳 */
    g.ceil(43, 46);
    g.coin(44, 11);
    /* F 碎板假桥:看起来是桥,踩上 0.75s 就塌。跑过去别停 */
    g.pit(50, 53);
    g.cr(50, 4);
    /* G 弹簧奶:一弹冲天撞奶箱(按住跳飘满 10.8 格才够高) */
    g.spring(57);
    g.q(57, 8, 5);
    /* H 跃跳刺带:4 格贴地刺,标准跑跳够到的极限距离 */
    g.spikeBelt(63, 66);
    g.coinRow(63, 9, 4);
    /* I 狼原:一只狼独占 67..77 巡逻区,两侧都被地形阻死,不越界 */
    g.wolf(71);
    /* J 门形砖架:奶箱嵌砖架(箱下有柱,不孤悬) */
    g.solid(78, 9, 11);
    g.solid(82, 9, 11);
    g.brick(78, 8, 5);
    g.q(80, 8, 1);
    /* K 禁跳鸦:低飞 y8 线,平地走过去没事,跳起就撞鸦 */
    g.raven(88, 8);
    /* L 终刺坑:旗门前 3 格坑,别在 99% 处交学费 */
    g.spikePit(94, 96);
    /* 坪台 101..108 绝对干净,flag 108,守关老板五格坪台必稳 */
    g.flag(108);
  });

  /* ================= 世界2 · 戈壁沙海:炮火准时送达 ================= */

  defLevel(118, "2-1 逗包戈壁", 1, function (g) {
    g.startX = 3;
    g.setProfile("◉", "炮火节拍", "读炮口 · 穿火线 · 借掩体", "听到炮声别慌，等出膛再走。", "cannon", 2);
    g.groundAll();
    g.coinRow(7, 10, 4);
    /*
     * 这里只有“看炮口”的一道题：每段都有能停、能观察的掩体，
     * 然后再穿过下一条火线。避免把炮、刺、碎板混成不可读的噪音。
     */
    g.pipe(12, 2); /* 第一根矮管是起跑掩体 */
    g.cannon(16);
    g.spikePit(21, 23); /* 炮后跳沟，逼玩家在炮弹间隙起跳 */
    g.mesa(27, 28, 10);
    g.cannon(31);
    g.pipe(36, 3); /* 高管挡住第二门炮的平射线 */
    g.spikeBelt(40, 42);
    g.ceil(46, 50); /* 子弹来了也只能低走 */
    g.coinRow(46, 11, 4);
    g.cannon(53);
    g.mesa(58, 59, 10);
    g.spikePit(63, 66);
    g.plat(65, 11, 1); /* 唯一精确落点，用来换节奏 */
    g.cannon(71);
    g.pipe(76, 2);
    g.spikeBelt(81, 83);
    g.pipe(87, 3);
    g.egg(88, 8); /* 从掩体顶轻跳可拿，贪炮线就会吃亏 */
    g.cannon(92);
    g.spikePit(96, 99);
    g.mesa(102, 103, 10);
    /* 坪台 107..114 绝对干净,flag 114 */
    g.flag(114);
  });

  /* ================= 世界3 · 冰谷雪峰:冰湖上的像素即正义 ================= */

  defLevel(124, "3-1 月之阳面", 2, function (g) {
    g.startX = 3;
    g.setProfile("═", "冰湖棋盘", "单格落点 · 连跳节奏", "每块板都是下一跳的起点。", "plank", 3);
    g.groundAll();
    g.coinRow(8, 10, 3);
    /* A 冰湖窄板:59 格刺湖,18 块 40px 宽浮板,间距 3 格、高低交替 1 格。
       一跳一滴汗,一滑一条命。这就是 IWBTG 的灵魂画面 */
    g.pit(13, 71);
    g.spikeField(13, 71, 11);
    g.plat(15, 11, 1);
    g.plat(18, 10, 1);
    g.plat(21, 11, 1);
    g.plat(24, 10, 1);
    g.plat(27, 11, 1);
    g.plat(30, 10, 1);
    g.plat(33, 11, 1);
    g.plat(36, 10, 1);
    g.plat(39, 11, 1);
    g.plat(42, 10, 1);
    g.plat(45, 11, 1);
    g.plat(48, 10, 1);
    g.plat(51, 11, 1);
    g.plat(54, 10, 1);
    g.plat(57, 11, 1);
    g.plat(60, 10, 1);
    g.plat(63, 11, 1);
    g.plat(66, 10, 1);
    g.plat(69, 11, 1);
    /* 蛋在湖中央的板间:轻跳擦板间得手,失手=坠湖 */
    g.egg(42, 9);
    /* B 湖心岛:唯一能喘气的地方(y8 禁跳鸦守着,跳=撞鸦) */
    g.ground(73, 78);
    g.raven(76, 7);
    g.coinRow(74, 10, 3);
    /* C 二段刺坑:18 格刺池,4 块板 4 格间距爬高,步步惊心 */
    g.spikePit(82, 96);
    g.plat(85, 11, 1);
    g.plat(89, 10, 1);
    g.plat(93, 11, 1);
    g.plat(97, 10, 1);
    /* D 雪原休整:雪丘 */
    g.mesa(103, 105, 10);
    g.coinRow(103, 9, 3);
    /* E 末刺带:最后 3 格贴地刺,冲刺而过 */
    g.spikeBelt(111, 113);
    /* 坪台 114..122 平坦,flag 119 */
    g.flag(119);
  });

  /* ================= 世界4 · 火山:熔岩不怜悯任何人 ================= */

  defLevel(112, "4-1 柴特鸡屁踢", 3, function (g) {
    g.startX = 3;
    g.setProfile("♨", "熔岩竖井", "跳岛 · 蹬墙 · 高低路线", "看见岩浆，先找下一座岛。", "lava", 3);
    g.groundAll();
    g.coinRow(8, 10, 3);
    /*
     * 火山不再夹进普通刺坑：每一个死亡面都是会发光的熔岩，
     * 路线从低矮跳岛，逐步变成高低交错的岩柱。
     */
    g.lava(13, 4);
    g.mesa(14, 14, 10);
    g.coinArc(13, 9);
    g.lava(20, 7);
    g.mesa(22, 22, 9);
    g.mesa(25, 25, 10);
    g.coin(22, 8);
    /* 短碎桥是节奏转换，踩过后迅速离开热浪。 */
    g.lava(31, 4);
    g.cr(31, 4, 11);
    g.spring(39);
    g.plat(38, 7, 3);
    g.q(40, 6, 6);
    g.coinRow(38, 6, 3);
    /*
     * 竖井是金蛋支线：主路可从右侧跨过三格熔岩；
     * 想拿蛋则在两面岩壁之间连续蹬墙。
     */
    g.mesa(47, 47, 5);
    g.mesa(51, 51, 3);
    g.lava(48, 3);
    g.plat(45, 8, 1);
    g.egg(49, 8);
    g.lava(57, 8);
    g.mesa(59, 60, 10);
    g.mesa(63, 63, 9);
    g.coin(60, 9);
    /* 岩柱下降后再上升，要求看准落点高度而非背刺位。 */
    g.lava(68, 6);
    g.mesa(70, 70, 10);
    g.mesa(73, 73, 9);
    g.lava(79, 4);
    g.cr(79, 4, 11);
    g.lava(87, 5);
    g.mesa(89, 90, 10);
    g.mesa(93, 93, 9);
    /* K 过渡平地:落完跳岛后 99..106 一片开阔,缓口气再入 Boss */
    /* 坪台 99..106 绝对干净,flag 106 */
    g.flag(106);
  });

  /* ================= 世界5 · 月面攻势:蹬墙刺井 ================= */

  defLevel(118, "5-1 问芯月面基地", 4, function (g) {
    g.startX = 3;
    g.setProfile("↟", "失重塔楼", "抬头找路 · 垂直攀升", "高处不是终点，下一层才是。", "tower", 4);
    g.groundAll();
    g.coinRow(8, 10, 3);
    /*
     * 基地是一座可读的“向上—落下—再向上”塔楼。地面始终是
     * 练习回退线；正确路线在高台上，越敢抬头越容易发现下一层。
     */
    g.mesa(13, 15, 10);
    g.mesa(19, 21, 8);
    g.mesa(25, 27, 6);
    g.plat(30, 6, 3);
    g.q(31, 5, 1);
    g.coinRow(25, 5, 3);
    /* 第一座高塔顶端可以直接跳下，教学“高度不是死路”。 */
    g.mesa(37, 39, 9);
    g.mesa(43, 45, 6);
    g.plat(48, 6, 3);
    g.q(49, 5, 6);
    /* 双塔之间的金蛋是可选蹬墙线，主路线从塔顶继续向右。 */
    g.mesa(55, 55, 4);
    g.mesa(60, 60, 3);
    g.egg(57, 5);
    g.plat(52, 7, 2);
    g.coinRow(56, 8, 3);
    /* 第二组阶梯比第一组更快，弹簧只负责把玩家送上观景台。 */
    g.spring(66);
    g.plat(65, 7, 4);
    g.mesa(73, 75, 8);
    g.mesa(79, 81, 6);
    g.mesa(85, 87, 9);
    g.coinRow(79, 5, 3);
    /* 出塔后给出一段平地，准备面对守关老板。 */
    g.mesa(94, 95, 10);
    g.mesa(99, 100, 11);
    /* 坪台 105..112 绝对干净,flag 112 */
    g.flag(112);
  });

  /* ================= 世界6 · 星云霓虹:移动平台才是真刺客 ================= */

  defLevel(120, "6-1 吉米你双子谷", 5, function (g) {
    g.startX = 3;
    g.setProfile("↔", "双子摆渡", "等平台 · 看轨迹 · 两段接力", "平台会回来，贪快才会掉。", "move", 4);
    g.groundAll();
    g.coinRow(8, 10, 4);
    /*
     * 这里没有“顺手塞一排刺”的干扰项。四段沟壑只考一件事：
     * 读出平台的往返轨迹，决定上第一块还是等下一轮。
     */
    g.spikePit(13, 23);
    g.mplat(14, 11, 20, 11); /* 平渡 */
    g.spikePit(28, 39);
    g.mplat(29, 11, 35, 9); /* 上行 */
    g.mplat(35, 8, 38, 8); /* 第二块接力台 */
    g.coinRow(32, 7, 3);
    /* 站台：允许玩家先观察下一段，不会被追兵催促。 */
    g.mesa(43, 45, 10);
    g.spikePit(49, 61);
    g.mplat(50, 11, 56, 11);
    g.mplat(56, 10, 60, 8);
    g.egg(56, 7); /* 在两块摆渡板的交接线上 */
    g.spikePit(66, 77);
    g.mplat(67, 10, 72, 7);
    g.mplat(72, 7, 76, 10);
    g.q(74, 6, 5);
    g.coinRow(70, 6, 4);
    /* 最后一次摆渡在低处回程，故意和前面的上行节奏相反。 */
    g.spikePit(82, 93);
    g.mplat(83, 11, 90, 11);
    g.mesa(97, 98, 10);
    g.mesa(102, 103, 11);
    /* 坪台 107..114 绝对干净,flag 114 */
    g.flag(114);
  });

  /* ================= 世界7 · 抱抱脸乐园:这里的地板都是骗子 ================= */

  defLevel(116, "7-1 抱抱脸游乐园", 6, function (g) {
    g.startX = 3;
    g.setProfile("?", "骗子乐园", "假地板 · 倒计时 · 前冲", "它看起来像地面，不代表它是。", "crumble", 5);
    g.groundAll();
    g.coinRow(8, 10, 4);
    /*
     * 乐园的规则只有一条：落脚点会开始倒计时。地面、桥面与
     * 小舞台用同一种高度伪装，玩家需要通过节奏而不是背刺海。
     */
    g.pit(13, 19);
    g.cr(13, 7, 12); /* 一眼像平地，停下来就掉 */
    g.plat(16, 9, 2); /* 上层是给观察者的保险线 */
    g.q(22, 8, 6);
    g.solid(21, 9, 11);
    g.solid(24, 9, 11);
    g.brick(21, 8, 4);
    /* 左半桥会塌、右半桥是真地；跳早了反而错过安全台。 */
    g.pit(29, 37);
    g.cr(29, 4, 12);
    g.plat(33, 9, 3);
    g.cr(36, 2, 12);
    g.coinRow(31, 8, 4);
    /* 两段小桥之间特意留一块平地，让失败原因清晰。 */
    g.pit(43, 49);
    g.cr(43, 6, 12);
    g.mesa(52, 53, 10);
    g.pit(57, 66);
    g.cr(57, 4, 12);
    g.plat(61, 9, 3);
    g.cr(65, 2, 12);
    g.egg(62, 7); /* 蛋在上层临时舞台，拿完仍要及时离开。 */
    g.q(63, 8, 1);
    /* 最后一桥加长，但前方有明确的真地面作终点。 */
    g.pit(72, 80);
    g.cr(72, 8, 12);
    g.plat(75, 9, 2);
    g.pit(86, 92);
    g.cr(86, 6, 12);
    g.mesa(95, 96, 10);
    g.coinRow(87, 9, 4);
    /* 坪台 103..110 绝对干净,flag 110 */
    g.flag(110);
  });

  /* ================= 世界8 · 炼丹星火山:毕业考 ================= */

  defLevel(124, "8-1 星火炼丹炉", 7, function (g) {
    g.startX = 3;
    g.setProfile("≫", "炼丹冲刺", "速度线 · 节奏跳 · 终局路由", "别停，连续动作比单次跳得远。", "dash", 5);
    g.groundAll();
    g.coinRow(7, 10, 5);
    /*
     * 毕业关不是前七关机关的拼盘，而是一条连续速度线：
     * 低头穿刺檐、加速跨刺带、不断把落点接成下一次起跳。
     */
    g.ceil(13, 18);
    g.coinRow(14, 11, 3);
    g.spikeBelt(22, 24);
    g.ceil(28, 33);
    g.spikeBelt(37, 39);
    /* 这座临时桥要求带着上一跳的速度穿过。 */
    g.pit(44, 49);
    g.cr(44, 6, 11);
    g.spikeBelt(54, 56);
    g.ceil(60, 65);
    g.coinRow(61, 11, 3);
    /* 中段短沟可冲刺直过，旁边高台是取蛋支线。 */
    g.spikePit(69, 74);
    g.plat(71, 11, 1);
    g.mesa(77, 78, 10);
    g.egg(78, 8);
    g.spikeBelt(82, 84);
    g.cannon(88); /* 炮弹用来打乱冲刺节拍，不挤占落点 */
    g.ceil(93, 97);
    g.spikeBelt(101, 103);
    g.mesa(106, 107, 10);
    g.coinRow(106, 9, 2);
    /* 坪台 114..122 绝对干净,flag 119 */
    g.flag(119);
  });

  /* ================= 终章 · Anthropic 机房:紧凑竞技场决战 ================= */

  defLevel(34, "终章 Anthropic 机房", 4, function (g) {
    g.ground(0, 33);
    g.startX = 3;
    g.setProfile("✦", "机房决战", "预警闪避 · 自动开火 · 破盾", "红光出现时，先活下来。", "boss", 5);
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
