"use strict";

(function () {
  const THREE = window.THREE;
  const TAU = Math.PI * 2;
  function hash(n) {
    n = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function clay(geo, amt) {
    if (!geo.attributes || !geo.attributes.position) return geo;
    var p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      var h = hash(x * 3.7 + y * 7.3 + z * 11.1);
      var h2 = hash(x * 5.1 + z * 9.7 + y * 2.3);
      var h3 = hash(y * 8.4 + x * 1.9 + z * 4.2);
      p.setXYZ(i, x + (h - 0.5) * amt, y + (h2 - 0.5) * amt, z + (h3 - 0.5) * amt);
    }
    geo.computeVertexNormals();
    return geo;
  }
  function box(w, h, d, color, amt) {
    var g = new THREE.BoxGeometry(w, h, d);
    if (amt) clay(g, amt);
    var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: color }));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function ball(r, color, wseg, hseg) {
    var g = new THREE.SphereGeometry(r, wseg || 10, hseg || 8);
    var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: color }));
    m.castShadow = true;
    return m;
  }
  function cyl(r1, r2, h, color, seg) {
    var g = new THREE.CylinderGeometry(r1, r2, h, seg || 10);
    var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: color }));
    m.castShadow = true;
    return m;
  }
  /* ==================== 建模:牛来(严格按 1.png) ====================
   芥末黄杂毛胖梨身 · 蓝色弯角 · 灰紫大口鼻厚唇
   下垂倦眼+浓眉 · 白手套 · 灰紫脚 · 人形直立站姿 */
  function buildCalf() {
    var g = new THREE.Group();
    var fur = 0xc9a24e,
      furD = 0xa8843a,
      furL = 0xd9bc72,
      snout = 0x9d92ab,
      snoutD = 0x837796,
      glove = 0xdedbd4,
      foot = 0x9d92ab,
      hornC = 0x3f74e0,
      hornD = 0x2a4fa8;
    /* —— 身体:梨形胖躯干(上窄下宽) —— */
    var body = ball(0.78, fur, 14, 12);
    body.scale.set(1.02, 1.16, 0.94);
    body.position.y = 1.02;
    clay(body.geometry, 0.06);
    g.add(body);
    var belly = ball(0.58, furL, 11, 9);
    belly.scale.set(0.88, 0.98, 0.8);
    belly.position.set(0.03, 0.88, 0.16);
    g.add(belly);
    /* 杂色毛斑 */
    for (var sp = 0; sp < 10; sp++) {
      var dot = ball(0.09, furD, 5, 4);
      var a = hash(sp * 3.7) * TAU,
        ty = 0.4 + hash(sp + 61) * 1.2;
      dot.position.set(Math.cos(a) * 0.52, ty, Math.sin(a) * 0.46);
      dot.scale.setScalar(0.6 + hash(sp + 9) * 0.8);
      g.add(dot);
    }
    /* —— 头:宽扁圆,略埋进肩膀(短颈毛绒感) —— */
    var head = new THREE.Group();
    head.position.set(0, 1.95, 0);
    var skull = ball(0.58, fur, 14, 12);
    skull.scale.set(1.14, 0.92, 1.0);
    clay(skull.geometry, 0.05);
    head.add(skull);
    var cheekL = ball(0.2, fur, 7, 5);
    cheekL.position.set(0.28, -0.14, 0.32);
    head.add(cheekL);
    var cheekR = cheekL.clone();
    cheekR.position.z = -0.32;
    head.add(cheekR);
    /* —— 灰紫大口鼻 + 前突厚唇(面无表情撅嘴) —— */
    var muzzle = ball(0.3, snout, 11, 9);
    muzzle.scale.set(0.78, 0.74, 1.5);
    muzzle.position.set(0.42, -0.16, 0);
    clay(muzzle.geometry, 0.04);
    head.add(muzzle);
    var lipU = ball(0.24, snoutD, 9, 7);
    lipU.scale.set(0.82, 0.42, 1.48);
    lipU.position.set(0.5, -0.26, 0);
    head.add(lipU);
    var lipL = ball(0.2, snoutD, 9, 7);
    lipL.scale.set(0.76, 0.36, 1.32);
    lipL.position.set(0.48, -0.42, 0);
    head.add(lipL);
    var n1 = ball(0.045, 0x5a5068, 6, 4);
    n1.position.set(0.64, -0.12, 0.12);
    head.add(n1);
    var n2 = n1.clone();
    n2.position.z = -0.12;
    head.add(n2);
    /* —— 下垂倦眼:厚上眼皮压眼 + 直视深色瞳 —— */
    function eye(side) {
      var eg = new THREE.Group();
      var w = ball(0.15, 0xf2ede6, 10, 8);
      eg.add(w);
      var pu = ball(0.062, 0x2a2018, 8, 6);
      pu.position.set(0.09, 0, side * 0.1);
      eg.add(pu);
      var gl = ball(0.02, 0xffffff, 5, 4);
      gl.position.set(0.12, 0.04, side * 0.12);
      eg.add(gl);
      var lid = ball(0.155, fur, 10, 8);
      lid.scale.set(1.02, 0.62, 1.04);
      lid.position.set(-0.01, 0.075, 0);
      eg.add(lid);
      return eg;
    }
    var e1 = eye(1);
    e1.position.set(0.34, 0.14, 0.26);
    head.add(e1);
    var e2 = eye(-1);
    e2.position.set(0.34, 0.14, -0.26);
    head.add(e2);
    /* 浓眉(微微皱) */
    var browL = box(0.26, 0.06, 0.06, 0x4a3a20, 0.01);
    browL.position.set(0.36, 0.32, 0.26);
    browL.rotation.z = -0.18;
    head.add(browL);
    var browR = browL.clone();
    browR.position.z = -0.26;
    browR.rotation.z = 0.18;
    head.add(browR);
    /* —— 蓝色弯角:向外再向上弯 —— */
    function horn(side) {
      var hg = new THREE.Group();
      var seg1 = cyl(0.11, 0.14, 0.3, hornC, 9);
      seg1.position.set(0.02, 0.14, 0);
      hg.add(seg1);
      var seg2 = cyl(0.08, 0.11, 0.3, hornC, 9);
      seg2.position.set(0.12, 0.38, 0);
      seg2.rotation.z = -0.5;
      hg.add(seg2);
      var seg3 = cyl(0.04, 0.08, 0.26, hornD, 8);
      seg3.position.set(0.28, 0.54, 0);
      seg3.rotation.z = -1.05;
      hg.add(seg3);
      hg.position.set(-0.06, 0.42, side * 0.4);
      hg.rotation.x = side * 0.1;
      return hg;
    }
    head.add(horn(1));
    head.add(horn(-1));
    /* —— 侧耳 —— */
    var ear1 = ball(0.16, fur, 8, 6);
    ear1.scale.set(0.4, 0.75, 1.4);
    ear1.position.set(-0.12, 0.22, 0.58);
    ear1.rotation.z = 0.2;
    head.add(ear1);
    var ear2 = ear1.clone();
    ear2.position.z = -0.58;
    ear2.rotation.z = -0.2;
    head.add(ear2);
    g.add(head);
    g.userData.head = head;
    /* —— 短腿 + 灰紫脚 —— */
    var legs = [];
    for (var li = 0; li < 2; li++) {
      var lg = new THREE.Group();
      var thigh = cyl(0.2, 0.22, 0.44, fur, 9);
      thigh.position.y = -0.2;
      lg.add(thigh);
      var footM = box(0.34, 0.2, 0.36, foot, 0.03);
      footM.position.y = -0.52;
      lg.add(footM);
      lg.position.set(li === 0 ? 0.24 : -0.2, 0.62, 0);
      g.add(lg);
      legs.push(lg);
    }
    g.userData.legs = legs;
    /* —— 胖胳膊 + 白手套 —— */
    var arms = [];
    for (var ai = 0; ai < 2; ai++) {
      var ag = new THREE.Group();
      var upper = cyl(0.15, 0.17, 0.42, fur, 8);
      upper.position.y = -0.18;
      ag.add(upper);
      var glv = ball(0.17, glove, 9, 7);
      glv.scale.set(1, 0.92, 1);
      glv.position.y = -0.5;
      ag.add(glv);
      ag.position.set(ai === 0 ? 0.5 : 0.02, 1.28, ai === 0 ? 0.38 : -0.38);
      ag.rotation.z = ai === 0 ? 0.24 : -0.24;
      g.add(ag);
      arms.push(ag);
    }
    g.userData.arms = arms;
    /* —— 小尾巴 —— */
    var tail = box(0.08, 0.34, 0.08, furD, 0.04);
    tail.position.set(-0.68, 1.0, 0);
    tail.rotation.z = 0.75;
    g.add(tail);
    g.userData.tail = tail;
    var tuftTail = ball(0.12, furD, 6, 5);
    tuftTail.position.set(-0.76, 0.82, 0);
    g.add(tuftTail);
    return g;
  }

  window.NiuModels = { buildCalf };
})();
