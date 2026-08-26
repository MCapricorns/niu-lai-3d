"use strict";

/**
 * v2.0.0 跳刺重制 · 全关像素级布局(革命版)
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
    g.groundAll();
    g.coinRow(8, 10, 3);
    /* A 刺带:3 格贴地刺,先热身 */
    g.spikeBelt(13, 15);
    g.pipe(19, 2);
    /* B 炮压刺坑:炮台守在坑前 3 格——跳坑的时机就是躲炮的时机 */
    g.cannon(23);
    g.spikePit(26, 28);
    /* C 双丘:两段小跳 */
    g.mesa(32, 33, 11);
    g.mesa(36, 37, 10);
    /* D 孤炮刺带:炮在刺前 4 格,弹丸落地前你得先决定起跳点 */
    g.cannon(41);
    g.spikeBelt(45, 47);
    /* E 顶刺道:4 格顶刺。炮声再响也别跳 */
    g.ceil(51, 54);
    g.coin(53, 11);
    /* F 窄板刺海:1 块板横渡 5 格刺坑。从板上的像素正中间起跳 */
    g.spikePit(58, 62);
    g.plat(60, 11);
    /* G 双弹赏赐:两道弹簧把牛蹦上天,接住大金币与星箱 */
    g.spring(66);
    g.bigc(67, 5);
    g.spring(68);
    g.q(68, 6, 6);
    /* H 碎板刺桥:5 格刺坑上 5 块碎板。想慢慢走,问过塌陷没有? */
    g.spikePit(74, 78);
    g.cr(74, 5);
    /* I 狼原:一只狼独占 79..86,左缘是碎板桥(狼过不去),右缘沙丘为墙 */
    g.wolf(81);
    /* J 阶梯:两阶沙丘,别跳过头 */
    g.mesa(87, 88, 10);
    g.mesa(91, 92, 9);
    /* K 一板卡:1 块板横跨 5 格刺坑,中间的坑深不见底 */
    g.spikePit(95, 99);
    g.plat(97, 11);
    g.egg(97, 10); /* 蛋在板上方 1 格: 站板轻点跳就是你的 */
    /* L 收刺:3 格贴地刺,横杆之后就是开阔地 */
    g.spikeBelt(102, 104);
    /* 坪台 107..114 绝对干净,flag 114 */
    g.flag(114);
  });

  /* ================= 世界3 · 冰谷雪峰:冰湖上的像素即正义 ================= */

  defLevel(124, "3-1 月之阳面", 2, function (g) {
    g.startX = 3;
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
    g.groundAll();
    g.coinRow(8, 10, 3);
    /* A 岩浆首跳:3 格熔岩,踩一下就烫熟 */
    g.lava(13, 3);
    g.coinArc(13, 9);
    /* B 刺坑:3 格,轻车熟路 */
    g.spikePit(18, 20);
    /* C 跳岛:5 格熔岩中浮着一座 40px 小岛,岛—岸两跳取对角线 */
    g.lava(23, 7);
    g.mesa(25, 26, 11);
    g.coin(25, 10);
    /* D 刺麦风:两组 3 格刺带 + 中间 1 格喘息 */
    g.spikeBelt(32, 34);
    g.spikeBelt(38, 40);
    /* E 孤炮:守在刺带后 4 格,弹窗即跳窗 */
    g.cannon(44);
    /* F 弹簧星:一弹 10.8 格直撞星箱(按住跳上顶才能挂着箱底) */
    g.spring(48);
    g.q(48, 4, 6);
    g.coinRow(47, 5, 4);
    /* G 熔岩井·金蛋:两塔夹着 3 格岩浆井,蛋悬井口 4 格。
       只能蹬墙螺旋上升取蛋——落失即灰飞 */
    g.mesa(53, 53, 5);
    g.mesa(57, 57, 3);
    g.lava(54, 3);
    g.plat(51, 8, 1);
    g.egg(55, 8);
    /* H 熔岩碎板:3 格岩浆上架 3 块碎板,踩刚过半就塌。跑 */
    g.lava(61, 3);
    g.cr(61, 3, 11);
    /* I 无地兽区:火山不需要走地怪,炮与刺就是万兽之王 */
    /* J 双刺坑连跳:跳完一个紧接着另一个,中间只有 2 格 */
    g.spikePit(68, 70);
    g.spikePit(73, 75);
    /* K 过渡平地:落完连跳后 93..99 一片开阔,缓口气再入 Boss */
    /* 坪台 99..106 绝对干净,flag 106 */
    g.flag(106);
  });

  /* ================= 世界5 · 月面攻势:蹬墙刺井 ================= */

  defLevel(118, "5-1 问芯月面基地", 4, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    /* A 管炮演练:水管+炮,教新敌人 */
    g.pipe(13, 2);
    g.cannon(17);
    /* B 刺坑:老课 */
    g.spikePit(21, 23);
    /* C 丘陵:两段高地 */
    g.mesa(27, 28, 10);
    g.mesa(31, 32, 9);
    /* D 窄板刺:1 板横渡 5 格 */
    g.spikePit(35, 39);
    g.plat(37, 11);
    /* E 孤炮刺带:炮距刺 3 格 */
    g.cannon(42);
    g.spikeBelt(46, 48);
    /* F 月井·金蛋:两座月面塔夹井(地面 12 行活着),蛋悬 2 格。
       轻跳擦蛋即得,重跳撞井顶=井里见 */
    g.mesa(52, 52, 4);
    g.mesa(57, 57, 3);
    g.egg(54, 10);
    g.coin(55, 11);
    /* G 三步高台:弹簧升上 7 行走廊,星箱收尾 */
    g.spring(61);
    g.plat(60, 7, 3);
    g.coinRow(60, 6, 3);
    g.q(62, 6, 3);
    /* H 狼原:一只狼独占 63..70 巡逻区(左缘弹簧,右缘月井塔) */
    g.wolf(65);
    /* I 第二口月井:双塔夹缝,蹬墙练习井(纯练,井底安全) */
    g.mesa(71, 71, 5);
    g.mesa(76, 76, 4);
    g.coin(73, 11);
    g.coin(74, 11);
    /* J 界碑台:40px 台阶隔开狼群与后段 */
    g.mesa(80, 80, 11);
    g.cannon(83);
    g.spikeBelt(87, 89);
    /* K 禁跳鸦线:低飞 y8,压住最后一段加速区 */
    g.raven(93, 8);
    /* L 狼原Ⅱ:右缘 100 号台阶挡路,狼 92..99 不越界 */
    g.mesa(100, 100, 10);
    g.wolf(95);
    /* 坪台 105..112 绝对干净,flag 112 */
    g.flag(112);
  });

  /* ================= 世界6 · 星云霓虹:移动平台才是真刺客 ================= */

  defLevel(120, "6-1 吉米你双子谷", 5, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    /* A 刺渡板:6 格刺坑,一片移动浮板作摆渡。等它来接你 */
    g.spikePit(13, 18);
    g.mplat(14, 11, 17, 11);
    /* B 双子摆渡:第二波坑,移动平台斜着爬升 4 格 */
    g.spikePit(22, 27);
    g.mplat(23, 11, 26, 10);
    /* C 狼原:左缘刺坑、右缘 36 号界碑,狼 29..35 不外逃 */
    g.mesa(36, 36, 11);
    g.wolf(31);
    /* D 顶刺道:禁跳 4 格,风声与金币伴行 */
    g.ceil(38, 41);
    g.coin(39, 11);
    /* E 窄板刺:1 板渡 5 格 */
    g.spikePit(44, 48);
    g.plat(46, 11);
    /* F 双子大渡:10 格刺渊上两座移动平台接力,8 行高台接客 */
    g.spikePit(52, 62);
    g.mplat(53, 11, 58, 11);
    g.mplat(58, 9, 61, 9);
    /* G 弹簧奶:弹撞上悬奶箱 */
    g.spring(66);
    g.q(66, 8, 5);
    /* H 禁跳鸦:y8 低飞,架在弹簧之后的正平原(避开弹道) */
    g.raven(72, 8);
    /* I 双子井·金蛋:双塔夹井,蛋悬上空,轻跳即得 */
    g.mesa(77, 77, 5);
    g.mesa(82, 82, 3);
    g.egg(79, 10);
    g.coin(80, 11);
    /* J 刺带:3 格贴地刺 */
    g.spikeBelt(86, 88);
    /* K 高渡:7 格刺坑一路移动板爬升到 7 行 */
    g.spikePit(92, 98);
    g.mplat(93, 10, 97, 7);
    g.coinRow(94, 8, 3);
    /* L 狼原Ⅱ:k 台外侧右缘 104 号台挡路,狼不越坪台 */
    g.mesa(104, 104, 10);
    g.wolf(101);
    /* 坪台 107..114 绝对干净,flag 114 */
    g.flag(114);
  });

  /* ================= 世界7 · 抱抱脸乐园:这里的地板都是骗子 ================= */

  defLevel(116, "7-1 抱抱脸游乐园", 6, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 4);
    /* A 假地板:与地面一样平的碎板桥(12 行!),踩上 0.75s 消失,
       底下是空腔。第一课:乐园的地板信不得——用跳的 */
    g.pit(13, 17);
    g.cr(13, 5, 12);
    /* B 星砖架:门形砖架嵌星箱,给点甜头 */
    g.solid(21, 9, 11);
    g.solid(24, 9, 11);
    g.brick(21, 8, 4);
    g.q(22, 8, 6);
    /* C 刺带逆板:刺带上钉着一块 40px 卡板,踩板中段再起跳 */
    g.spikeBelt(28, 31);
    g.plat(29, 11, 1);
    /* D 半假桥:33..35 是碎板(平)、36..38 是真地面。
       长得一模一样——第 4 格起才是真的 */
    g.pit(33, 38);
    g.cr(33, 3, 12);
    /* E 禁跳鸦:y8 低飞压前原 */
    g.raven(41, 8);
    /* F 窄板刺:老课复习 */
    g.spikePit(48, 52);
    g.plat(50, 11);
    /* G 弹簧枪毙:一枚"好心"弹簧,头顶 3 格悬满尖刺。
       踩它=发射上天花板;正确的走法——加速跳过这格弹簧 */
    g.spring(56);
    g.ceil(55, 57);
    /* H 狼原:左缘弹簧围墙,右缘游园塔,狼 57..70 独守 */
    g.wolf(63);
    /* I 游园井·金蛋:双塔夹井,蛋悬 2 格,轻跳摘 */
    g.mesa(71, 71, 5);
    g.mesa(76, 76, 3);
    g.egg(73, 10);
    g.coin(74, 11);
    /* J 碎板刺坑:6 格刺,4 块板。踩板连跳或一口气冲过去 */
    g.spikePit(80, 85);
    g.cr(81, 4);
    /* K 顶刺道:3 格禁跳 */
    g.ceil(89, 91);
    g.coin(90, 11);
    /* L 狼原Ⅱ:右缘 98 号台阶,狼 92..97 不越界 */
    g.mesa(98, 98, 10);
    g.wolf(95);
    /* 坪台 103..110 绝对干净,flag 110 */
    g.flag(110);
  });

  /* ================= 世界8 · 炼丹星火山:毕业考 ================= */

  defLevel(124, "8-1 星火炼丹炉", 7, function (g) {
    g.startX = 3;
    g.groundAll();
    g.coinRow(8, 10, 3);
    /* A 熔岩首跃:3 格岩浆 */
    g.lava(13, 3);
    g.coinArc(13, 9);
    /* B 刺坑:3 格 */
    g.spikePit(18, 20);
    /* C 双窄板:6 格刺坑,两块板连跳 */
    g.spikePit(24, 29);
    g.plat(26, 11, 1);
    g.plat(28, 11, 1);
    /* D 弹簧火狱:弹簧上 3 格顶着尖刺——踩弹簧就是点火自焚。
       正解:Shift 满速冲跳(9.8 格)直接跳过弹簧与陷阱区 */
    g.spring(33);
    g.ceil(32, 34);
    g.coinRow(31, 10, 6);
    /* E 孤炮刺带:炮距刺 4 格 */
    g.cannon(38);
    g.spikeBelt(42, 44);
    /* F 蹬墙火井·金蛋:双塔夹 3 格岩浆,蛋悬井口。
       蹬塔螺旋上升摘蛋,落失=浴火凤凰 */
    g.mesa(51, 51, 4);
    g.mesa(56, 56, 3);
    g.lava(52, 3);
    g.egg(53, 9);
    /* G 禁跳鸦:y8 低飞,守在塔后平原 */
    g.raven(61, 8);
    /* H 碎板军沟:7 格刺,7 块板连排。犹豫就会被刺吃 */
    g.spikePit(67, 73);
    g.cr(67, 7);
    /* I 叠丘 */
    g.mesa(77, 78, 10);
    g.mesa(82, 83, 9);
    /* J 复窄板:6 格刺,两块板 */
    g.spikePit(86, 91);
    g.plat(88, 11, 1);
    g.plat(90, 11, 1);
    /* K 顶刺道:4 格禁跳 */
    g.ceil(95, 98);
    g.coin(96, 11);
    /* L 狼原:右缘 113 号台阶,狼 106..112 守关口 */
    g.mesa(113, 113, 10);
    g.wolf(109);
    /* G2 末炮:炮台远远望着缺口,不扰坪台 */
    g.cannon(99);
    g.spikeBelt(103, 105);
    /* 坪台 114..122 绝对干净,flag 119 */
    g.flag(119);
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
