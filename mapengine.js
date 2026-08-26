"use strict";
/* ============ 牛来大冒险 3D · 地图引擎 mapengine.js ============
   版权所有 (c) 2026 MCapricorns — MIT License
   --------------------------------------------------------------
   旧版问题:每个方块一个独立盒子+十字线贴图=廉价像素积木感,
   内部面全部绘制、单色一面平、拆砖要改实例矩阵。

   新版做法(体素合并网格):
   1) 地面/实心 → 只生成暴露面的单一 BufferGeometry:
      · 顶面/正面/侧面/底面按亮度系数烘焙进顶点色(定向光照感)
      · 角部 AO:被邻块夹住的角更暗,体块立体感立现
      · 每块 hash 微差色,打破一整面同色的塑料感
      · 草地方块带"草沿"(顶侧条带),去掉旧十字线贴图
   2) 砖/问号箱/弹簧/水管/碎板/旗门 = worldBlocks 动态网格(normal object)
   3) 尖刺/岩浆 = InstancedMesh(几何不变)
   4) ME.TILE 常量表:levels.js 共享同一套瓦片语义

   入口:
   - ME.build(cfg) → { terrain, lavaMat }:一次性产出全关地形
     cfg = { tiles, w, theme, dynGroup, worldBlocks, qLabelSprites, makeTextSprite }
   - ME.ghostBox(color) → Mesh:顶撞弹跳的瞬态方块
   - ME.disposeMesh(m):释放网格资源
============================================================ */
window.ME = (function () {
  var TS = 3.2; /* 瓦片世界尺寸 = 40 * 0.08 */
  var ZD = 2.6; /* 方块深度(z) */
  var HZ = ZD / 2;
  var YS = 48; /* H*S = 600*0.08=48 */

  var TILE = {
    EMPTY: 0,
    GROUND: 1,
    SOLID: 2,
    BRICK: 3,
    QCOIN: 4,
    QMILK: 5,
    QSTAR: 6,
    QBELL: 7,
    USED: 8,
    PLAT: 9,
    SPIKE: 10,
    LAVA: 11,
    SPRING: 12,
    PIPETOP: 13,
    PIPEBODY: 14,
    FLAG: 15,
    CRUMBLE: 16,
    GATE: 17,
  };
  var FULLBOX = {};
  [TILE.GROUND, TILE.SOLID, TILE.BRICK, TILE.QCOIN, TILE.QMILK, TILE.QSTAR, TILE.QBELL, TILE.USED, TILE.GATE].forEach(
    function (v) {
      FULLBOX[v] = 1;
    },
  );

  function hashJ(n) {
    n = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function hex3(hex) {
    var c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
  }
  function mul3(rgb, m) {
    return [rgb[0] * m, rgb[1] * m, rgb[2] * m];
  }
  function clayJ(geo, amt) {
    var p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      p.setXYZ(
        i,
        x + (hashJ(x * 3.7 + y * 7.3 + z * 11.1) - 0.5) * amt,
        y + (hashJ(x * 5.1 + z * 9.7 + y * 2.3) - 0.5) * amt,
        z + (hashJ(y * 8.4 + x * 1.9 + z * 4.2) - 0.5) * amt,
      );
    }
    geo.computeVertexNormals();
    return geo;
  }
  function mbox(w, h, d, color, amt) {
    var g = new THREE.BoxGeometry(w, h, d);
    if (amt) clayJ(g, amt);
    var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: color }));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function mball(r, color, ws, hs) {
    var m = new THREE.Mesh(
      new THREE.SphereGeometry(r, ws || 10, hs || 8),
      new THREE.MeshLambertMaterial({ color: color }),
    );
    m.castShadow = true;
    return m;
  }
  function mcyl(r1, r2, h, color, seg) {
    var m = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r2, h, seg || 10),
      new THREE.MeshLambertMaterial({ color: color }),
    );
    m.castShadow = true;
    return m;
  }

  /* ==================== 地形合并网格 ==================== */
  function buildTerrain(cfg) {
    var w = cfg.w,
      h = cfg.h,
      tiles = cfg.tiles,
      theme = cfg.theme;
    var pos = [],
      col = [];
    var dirt = hex3(theme.dirt),
      grass = hex3(theme.grass),
      solid = hex3(theme.solid),
      solidTop = mul3(solid, 1.16);
    var colorsByTile = {};

    function fullAt(x, y) {
      if (x < 0 || x >= w || y < 0 || y >= h) return 0;
      return FULLBOX[tiles[y * w + x]] ? 1 : 0;
    }
    /* 角部 AO:两侧都实心=夹死角最暗;按暴露格数渐变 */
    function cb(s1, s2, d) {
      if (s1 && s2) return 0.34;
      var s = (s1 ? 1 : 0) + (s2 ? 1 : 0) + (d ? 1 : 0);
      return 0.62 + 0.38 * ((3 - s) / 3);
    }
    function pushV(x, y, z, cc) {
      pos.push(x, y, z);
      col.push(cc[0], cc[1], cc[2]);
    }
    function quad(c0, c1, c2, c3) {
      pushV(c0[0], c0[1], c0[2], c0[3]);
      pushV(c1[0], c1[1], c1[2], c1[3]);
      pushV(c2[0], c2[1], c2[2], c2[3]);
      pushV(c0[0], c0[1], c0[2], c0[3]);
      pushV(c2[0], c2[1], c2[2], c2[3]);
      pushV(c3[0], c3[1], c3[2], c3[3]);
    }
    var zF = HZ,
      zB = -HZ; /* 前=面向相机 */

    for (var ty = 0; ty < h; ty++) {
      for (var tx = 0; tx < w; tx++) {
        var c = tiles[ty * w + tx];
        if (c !== TILE.GROUND && c !== TILE.SOLID) continue;
        var isGrass = c === TILE.GROUND;
        if (!colorsByTile[c]) {
          colorsByTile[c] = {
            top: isGrass ? grass : solidTop,
            body: isGrass ? dirt : solid,
            bodyB: isGrass ? mul3(dirt, 0.5) : mul3(solid, 0.5),
            front: isGrass ? mul3(dirt, 0.98) : mul3(solid, 0.98),
            back: isGrass ? mul3(dirt, 0.72) : mul3(solid, 0.72),
            lip: grass,
          };
        }
        var Tcol = colorsByTile[c];
        var jit = 0.93 + hashJ(tx * 12.9898 + ty * 78.233) * 0.14;
        var x0 = tx * TS,
          x1 = x0 + TS;
        var yT = YS - ty * TS,
          yB = yT - TS;
        var aboveFull = fullAt(tx, ty - 1);
        var belowFull = fullAt(tx, ty + 1);
        var leftFull = fullAt(tx - 1, ty);
        var rightFull = fullAt(tx + 1, ty);
        var grassLip = isGrass && !aboveFull;

        /* 顶面 */
        if (!aboveFull) {
          var aL = cb(fullAt(tx - 1, ty - 1), fullAt(tx, ty - 1), fullAt(tx - 1, ty));
          var aR = cb(fullAt(tx + 1, ty - 1), fullAt(tx, ty - 1), fullAt(tx + 1, ty));
          var tC = mul3(mul3(Tcol.top, jit), 1.02);
          quad(
            [x0, yT, zF, mul3(tC, aL)],
            [x1, yT, zF, mul3(tC, aR)],
            [x1, yT, zB, mul3(tC, aR)],
            [x0, yT, zB, mul3(tC, aL)],
          );
        }
        /* 底面 */
        if (!belowFull) {
          var bL = cb(fullAt(tx - 1, ty + 1), fullAt(tx, ty + 1), fullAt(tx - 1, ty + 1));
          var bR = cb(fullAt(tx + 1, ty + 1), fullAt(tx, ty + 1), fullAt(tx + 1, ty + 1));
          var bC = mul3(mul3(Tcol.bodyB, jit), 1);
          quad(
            [x0, yB, zB, mul3(bC, bL)],
            [x1, yB, zB, mul3(bC, bR)],
            [x1, yB, zF, mul3(bC, bR)],
            [x0, yB, zF, mul3(bC, bL)],
          );
        }
        /* 左右侧(被邻块完全盖住的无需画) */
        if (!leftFull) {
          sideQuad(x0, yT, yB, Tcol, jit, grassLip, "L");
        }
        if (!rightFull) {
          sideQuad(x1, yT, yB, Tcol, jit, grassLip, "R");
        }
        /* 前后:相邻块同深度共面不互叠,始终绘制 */
        zQuad(x0, x1, yT, yB, Tcol, jit, tx, ty, zF, false, grassLip);
        zQuad(x1, x0, yT, yB, Tcol, jit, tx, ty, zB, true, grassLip);
      }
    }

    /* 侧脸:左右各一片;草沿只沿顶,其余为土/岩身 */
    function sideQuad(fx, yTv, yBv, Tcol, jit, lip, which) {
      var body = mul3(mul3(Tcol.body, 0.8), jit);
      var lipC = mul3(mul3(Tcol.lip, jit), 1.04);
      var aTL = 0.86,
        aBL = 0.7;
      if (lip) {
        var lipH = 0.52;
        if (which === "L")
          quad(
            [fx, yTv, zF, mul3(lipC, aTL)],
            [fx, yTv - lipH, zF, mul3(lipC, aTL * 0.94)],
            [fx, yTv - lipH, zB, mul3(lipC, aBL * 0.94)],
            [fx, yTv, zB, mul3(lipC, aBL)],
          );
        else
          quad(
            [fx, yTv, zB, mul3(lipC, aBL)],
            [fx, yTv - lipH, zB, mul3(lipC, aBL * 0.94)],
            [fx, yTv - lipH, zF, mul3(lipC, aTL * 0.94)],
            [fx, yTv, zF, mul3(lipC, aTL)],
          );
        if (which === "L")
          quad(
            [fx, yTv - lipH, zF, mul3(body, aTL * 0.84)],
            [fx, yBv, zF, mul3(body, aBL * 0.72)],
            [fx, yBv, zB, mul3(body, aBL * 0.72)],
            [fx, yTv - lipH, zB, mul3(body, aTL * 0.84)],
          );
        else
          quad(
            [fx, yTv - lipH, zB, mul3(body, aBL * 0.72)],
            [fx, yBv, zB, mul3(body, aBL * 0.72)],
            [fx, yBv, zF, mul3(body, aTL * 0.84)],
            [fx, yTv - lipH, zF, mul3(body, aTL * 0.84)],
          );
      } else {
        if (which === "L")
          quad(
            [fx, yTv, zF, mul3(body, aTL)],
            [fx, yBv, zF, mul3(body, aBL)],
            [fx, yBv, zB, mul3(body, aBL)],
            [fx, yTv, zB, mul3(body, aTL)],
          );
        else
          quad(
            [fx, yTv, zB, mul3(body, aBL)],
            [fx, yBv, zB, mul3(body, aBL)],
            [fx, yBv, zF, mul3(body, aTL)],
            [fx, yTv, zF, mul3(body, aTL)],
          );
      }
    }

    /* 正背面(草顶时上段草沿+下段身,平滑过渡) */
    function zQuad(x0v, x1v, yTv, yBv, Tcol, jit, tx2, ty2, zz, flip, lip) {
      var zTL = cb(fullAt(tx2, ty2 - 1), fullAt(tx2 - 1, ty2), fullAt(tx2 - 1, ty2 - 1));
      var zTR = cb(fullAt(tx2, ty2 - 1), fullAt(tx2 + 1, ty2), fullAt(tx2 + 1, ty2 - 1));
      var zBL = cb(fullAt(tx2, ty2 + 1), fullAt(tx2 - 1, ty2), fullAt(tx2 - 1, ty2 + 1));
      var zBR = cb(fullAt(tx2, ty2 + 1), fullAt(tx2 + 1, ty2), fullAt(tx2 + 1, ty2 + 1));
      var topA = flip ? zTR : zTL,
        botA = flip ? zBR : zBL;
      var topB = flip ? zTL : zTR,
        botB = flip ? zBL : zBR;
      var xa = flip ? x1v : x0v,
        xb = flip ? x0v : x1v;
      if (lip) {
        var lipC = mul3(mul3(Tcol.lip, jit), 1.02);
        var fC = mul3(mul3(Tcol.front, jit), 1);
        var yLip = yTv - 0.52;
        quad(
          [xa, yTv, zz, mul3(lipC, topA)],
          [xa, yLip, zz, mul3(lipC, topA * 0.92)],
          [xb, yLip, zz, mul3(lipC, topB * 0.92)],
          [xb, yTv, zz, mul3(lipC, topB)],
        );
        quad(
          [xa, yLip, zz, mul3(fC, botA)],
          [xa, yBv, zz, mul3(fC, botA * 0.84)],
          [xb, yBv, zz, mul3(fC, botB * 0.84)],
          [xb, yLip, zz, mul3(fC, botB)],
        );
        return;
      }
      var cc = mul3(mul3(flip ? Tcol.back : Tcol.front, jit), 1);
      quad(
        [xa, yTv, zz, mul3(cc, topA)],
        [xa, yBv, zz, mul3(cc, botA)],
        [xb, yBv, zz, mul3(cc, botB)],
        [xb, yTv, zz, mul3(cc, topB)],
      );
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.computeVertexNormals();
    var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* ==================== 动态块建档 ==================== */
  function buildDynamic(tx, ty, c, cfg) {
    var theme = cfg.theme;
    var dyn = cfg.dynGroup,
      wb = cfg.worldBlocks,
      qLabels = cfg.qLabelSprites;
    var key = tx + "," + ty;
    var px = (tx + 0.5) * TS,
      py = YS - (ty + 0.5) * TS;
    if (c === TILE.BRICK) {
      var br = mbox(TS * 0.95, TS * 0.95, ZD * 0.95, theme.brick, 0.05);
      var jc = new THREE.Color(theme.brick).multiplyScalar(0.9 + hashJ(tx * 3.7 + ty * 9.1) * 0.2);
      br.material.color.copy(jc);
      br.position.set(px, py, 0);
      dyn.add(br);
      wb[key] = { kind: "brick", g: br };
    } else if (c >= TILE.QCOIN && c <= TILE.QBELL) {
      var q = mbox(TS, TS, ZD, theme.q, 0.03);
      q.position.set(px, py, 0);
      dyn.add(q);
      var lbl = cfg.makeTextSprite(
        c === TILE.QCOIN ? "?" : c === TILE.QMILK ? "奶" : c === TILE.QSTAR ? "★" : "铃",
        1.3,
        "#fff",
      );
      lbl.position.set(px, py - 0.3, 1.45);
      lbl.userData.bx = tx;
      lbl.userData.by = ty;
      dyn.add(lbl);
      qLabels.push(lbl);
      wb[key] = { kind: "q", g: q, lbl: lbl, baseY: py };
    } else if (c === TILE.USED) {
      var ud = mbox(TS, TS, ZD, 0x9a7a50, 0.03);
      ud.position.set(px, py, 0);
      dyn.add(ud);
      wb[key] = { kind: "used", g: ud };
    } else if (c === TILE.PLAT) {
      var pl = mbox(TS, 0.96, ZD, theme.plat, 0.04);
      pl.position.set(px, py + 1.12, 0);
      dyn.add(pl);
    } else if (c === TILE.SPRING) {
      var sp = new THREE.Group();
      var base2 = mbox(1.9, 0.9, 1.9, 0xc4412f, 0.02);
      base2.position.y = -0.35;
      sp.add(base2);
      var top2 = mbox(2.2, 0.7, 2.2, 0x5ec04f, 0.02);
      top2.position.y = 0.35;
      sp.add(top2);
      var pad = mbox(1.3, 0.5, 1.3, 0xd8d8d8, 0);
      pad.position.y = 0.85;
      sp.add(pad);
      sp.scale.y = 1.68;
      sp.position.set(px, py - 0.25, 0);
      dyn.add(sp);
      wb[key] = { kind: "spring", g: sp, baseScaleY: 1.68 };
    } else if (c === TILE.PIPETOP) {
      var pg = new THREE.Group();
      var neck = mcyl(1.15, 1.15, 2.7, 0x4aa03f, 14);
      neck.position.y = -1.65;
      pg.add(neck);
      var rim = mcyl(1.3, 1.3, 0.5, 0x4aa03f, 14);
      rim.position.y = -0.35;
      pg.add(rim);
      var rimTop = mcyl(1.45, 1.45, 0.42, 0x59c14d, 14);
      rimTop.position.y = 0.05;
      pg.add(rimTop);
      pg.position.set(px, py + 1.34, 0);
      dyn.add(pg);
      wb[key] = { kind: "pipe", g: pg };
    } else if (c === TILE.PIPEBODY) {
      var pg2 = new THREE.Group();
      var bodyT = mcyl(1.15, 1.15, 3.2, 0x4aa03f, 14);
      bodyT.position.y = 0;
      pg2.add(bodyT);
      var sheen = mcyl(1.16, 1.16, 0.3, 0x6ed15e, 14);
      sheen.position.set(0, 0.8, 0);
      pg2.add(sheen);
      pg2.position.set(px, py, 0);
      dyn.add(pg2);
    } else if (c === TILE.CRUMBLE) {
      var cg = new THREE.Group();
      var plank = mbox(3.05, 0.44, 2.45, theme.plat, 0.03);
      cg.add(plank);
      var crack1 = mbox(0.09, 0.06, 2.5, 0x4a3528, 0);
      crack1.position.set(-0.65, 0.25, 0);
      crack1.rotation.z = 0.38;
      cg.add(crack1);
      var crack2 = crack1.clone();
      crack2.position.x = 0.7;
      crack2.rotation.z = -0.34;
      cg.add(crack2);
      cg.position.set(px, py + 1.38, 0);
      dyn.add(cg);
      wb[key] = { kind: "crumble", g: cg, baseX: px };
    } else if (c === TILE.GATE) {
      var gt = mbox(TS, TS, ZD, 0x454b5e, 0.04);
      gt.position.set(px, py, 0);
      dyn.add(gt);
      wb[key] = { kind: "gate", g: gt };
    }
  }

  /* ==================== 主入口 ==================== */
  function build(cfg) {
    var w = cfg.w,
      tiles = cfg.tiles,
      theme = cfg.theme,
      dyn = cfg.dynGroup,
      wb = cfg.worldBlocks;
    var i,
      spikeCount = 0,
      lavaCount = 0;
    for (i = 0; i < tiles.length; i++) {
      if (tiles[i] === TILE.SPIKE) spikeCount++;
      else if (tiles[i] === TILE.LAVA) lavaCount++;
    }
    var terrain = buildTerrain(cfg);
    dyn.add(terrain);
    var spGeo = new THREE.ConeGeometry(1.2, 3.2, 4);
    var instSpike = new THREE.InstancedMesh(
      spGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      Math.max(1, spikeCount),
    );
    instSpike.castShadow = true;
    var lavaMat = new THREE.MeshLambertMaterial({ color: theme.lava, emissive: theme.lava, emissiveIntensity: 1.1 });
    var instLava = new THREE.InstancedMesh(new THREE.BoxGeometry(TS, TS * 0.94, ZD), lavaMat, Math.max(1, lavaCount));
    var m4 = new THREE.Matrix4(),
      q4 = new THREE.Quaternion();
    var si = 0,
      li = 0;
    for (var ty = 0; ty < cfg.h; ty++) {
      for (var tx = 0; tx < w; tx++) {
        var c = tiles[ty * w + tx];
        var px = (tx + 0.5) * TS,
          py = YS - (ty + 0.5) * TS;
        if (c === TILE.SPIKE) {
          m4.compose(new THREE.Vector3(px, py, 0), q4, new THREE.Vector3(1, 1, 1));
          instSpike.setMatrixAt(si, m4);
          instSpike.setColorAt(si, new THREE.Color(theme.spike));
          si++;
        } else if (c === TILE.LAVA) {
          m4.compose(new THREE.Vector3(px, py - TS * 0.08, 0), q4, new THREE.Vector3(1, 1, 1));
          instLava.setMatrixAt(li, m4);
          li++;
        } else buildDynamic(tx, ty, c, cfg);
      }
    }
    instSpike.count = si;
    instLava.count = li;
    instSpike.instanceMatrix.needsUpdate = true;
    instLava.instanceMatrix.needsUpdate = true;
    if (instSpike.instanceColor) instSpike.instanceColor.needsUpdate = true;
    dyn.add(instSpike);
    dyn.add(instLava);
    return { terrain: terrain, lavaMat: lavaMat };
  }

  function ghostBox(color) {
    var m = mbox(TS, TS, ZD, color, 0.02);
    return m;
  }
  function disposeMesh(m) {
    if (!m) return;
    if (m.geometry && m.geometry.dispose) m.geometry.dispose();
    if (m.material && m.material.dispose) m.material.dispose();
  }

  return {
    TILE: TILE,
    build: build,
    ghostBox: ghostBox,
    disposeMesh: disposeMesh,
  };
})();
