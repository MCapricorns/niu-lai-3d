"use strict";

/*
 * An expedition is composed from authored encounters. Each encounter places its
 * platforms and its guide route together, so the same route can drive the AI and
 * be exercised by the headless campaign checks.
 */
globalThis.NiuExpedition = (() => {
  const point = (x, y, z) => ({ x, y, z });
  const edge = (deck) => deck.z + deck.d / 2;
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  const cycle = (values, index) => (Array.isArray(values) ? (values[index % values.length] ?? 0) : (values ?? 0));

  function create({ id, name, theme, chapter, tip, fallY = -8, startY = 0, atmosphere }, build) {
    const level = {
      id,
      name,
      theme,
      chapter,
      tip,
      fallY,
      atmosphere,
      spawn: point(0, startY, 0),
      platforms: [],
      spikes: [],
      winds: [],
      coins: [],
      checkpoints: [],
      relays: [],
      autoRoute: [],
    };
    let deck = addDeck(0, startY, 3.65, 7.6, 10.5);

    function addDeck(x, y, z, w, d, options) {
      const platform = { x, y, z, w, d, ...options };
      level.platforms.push(platform);
      return platform;
    }

    function walk(x, z) {
      level.autoRoute.push(["walk", x, z]);
    }

    function takeoff(targetX) {
      const x = deck.x + clamp((targetX - deck.x) * 0.46, deck.w / 2 - 0.52);
      const z = edge(deck) - (deck.crumble ? 0.94 : 0.72);
      walk(x, z);
      return point(x, deck.y, z);
    }

    function trail(from, to, count, lift = 0) {
      for (let index = 0; index < count; index++) {
        const t = (index + 1) / (count + 1);
        level.coins.push(
          point(
            from.x + (to.x - from.x) * t,
            from.y + 0.82 + (to.y - from.y) * t + Math.sin(t * Math.PI) * lift,
            from.z + (to.z - from.z) * t,
          ),
        );
      }
    }

    function bridge({ width, depth, gap = 1.45, shift = 0, rise = 0, crumble = false }) {
      const x = deck.x + shift;
      const y = deck.y + rise;
      const near = edge(deck) + gap;
      const from = takeoff(x);
      const target = point(x, y, near + (crumble ? 1.1 : 0.88));
      deck = addDeck(x, y, near + depth / 2, width, depth, crumble ? { crumble: true } : undefined);
      level.autoRoute.push(["jump", x, target.z]);
      trail(from, target, gap > 1.9 ? 4 : 3, 0.65);
    }

    function star(side) {
      const x = deck.x + side * (deck.w / 2 + 2.56);
      const y = deck.y + 0.58;
      const z = deck.z + 0.22;
      addDeck(x, y, z, 2.9, 3.4);
      trail(point(deck.x + side * (deck.w / 2 - 0.7), deck.y, deck.z), point(x, y, z), 3, 0.52);
      level.coins.push({ ...point(x, y + 0.9, z), star: true });
    }

    function safe({ length = 8, width = 7.1, relay, checkpoint = false, shift = 0, rise = 0, gap = 1.45 } = {}) {
      bridge({ width, depth: length, gap, shift, rise });
      if (checkpoint) {
        const z = deck.z - (relay ? 1.28 : 0);
        level.checkpoints.push(point(deck.x, deck.y, z));
        walk(deck.x, z);
      }
      if (relay) {
        const z = deck.z + (checkpoint ? 1.2 : 0);
        level.relays.push({ ...point(deck.x, deck.y, z), name: relay });
        walk(deck.x, z);
      }
    }

    function steps({ count = 5, width = 4.6, depth = 4.2, gap = 1.65, shift, rise, crumble = false, branch } = {}) {
      for (let i = 0; i < count; i++) {
        bridge({
          width: cycle(width, i),
          depth: cycle(depth, i),
          gap: cycle(gap, i),
          shift: cycle(shift, i),
          rise: cycle(rise, i),
          crumble: crumble && i + 1 < count,
        });
      }
      if (branch) star(branch);
    }

    function promenade({ length, width = 7.4, turns, branch }) {
      const depth = length / (turns.length + 1);
      bridge({ width, depth });
      for (const shift of turns) {
        const seam = edge(deck);
        const crossing = point(deck.x + shift / 2, deck.y, seam - 0.65);
        walk(crossing.x, crossing.z);
        deck = addDeck(deck.x + shift, deck.y, seam + depth / 2, width, depth);
        walk(deck.x, deck.z);
        trail(crossing, deck, 4);
      }
      if (branch) star(branch);
    }

    function spikes({ rows = 2, width = 5.8, spacing = 4, pulse = false, mode = "cross" } = {}) {
      bridge({ width, depth: rows * spacing + 3.6 });
      const start = deck.z - deck.d / 2 + 3.5;
      let lane = deck.x;
      for (let i = 0; i < rows; i++) {
        const z = start + i * spacing;
        const direction = i % 2 === 0 ? -1 : 1;
        const weave = mode === "weave";
        const x = deck.x + (weave ? direction * width * 0.22 : 0);
        level.spikes.push({
          ...point(x, deck.y, z),
          w: width * (weave ? 0.53 : 0.96),
          d: 0.82,
          h: 0.76 + (i % 3) * 0.09,
          ...(pulse ? { pulse: { period: 3.25, on: 1.25, phase: i * 0.63 } } : {}),
        });
        const previousLane = lane;
        lane = weave ? deck.x - direction * width * 0.26 : deck.x;
        if (weave) walk(previousLane, z - 1.4);
        walk(lane, z - 1.4);
        if (pulse && !weave) level.autoRoute.push(["waitForSpike", x, z]);
        if (pulse || weave) walk(lane, z + 1.28);
        else level.autoRoute.push(["jump", lane, z + 1.55, 0.39]);
        trail(point(lane, deck.y, z - 1.35), point(lane, deck.y, z + 1.55), 3, pulse || weave ? 0 : 1.16);
      }
    }

    function ferry({ axis = "z", distance = axis === "y" ? 2.5 : 5.6, shift = 0, rise = 0.15, period = 4.8 } = {}) {
      const side = shift < 0 ? -1 : 1;
      const anchorX = deck.x + (axis === "x" ? side * 0.72 : shift * 0.42);
      const anchorY = deck.y + 0.05;
      const anchorZ = edge(deck) + 3.05;
      takeoff(anchorX);

      const motion =
        axis === "x"
          ? { x: side * distance, z: 0.55, period }
          : axis === "y"
            ? { y: distance, z: 2.6, period }
            : { x: shift * 0.48, z: distance, period };
      const moving = addDeck(anchorX, anchorY, anchorZ, 3.9, 3.55, { motion });
      const terminal = point(anchorX + (motion.x ?? 0), anchorY + (motion.y ?? 0), anchorZ + motion.z);
      const near = terminal.z + moving.d / 2 + 1.25;
      const x = terminal.x + (axis === "y" ? shift : 0);
      deck = addDeck(x, terminal.y + rise, near + 2.4, 5.85, 4.8);
      const end = point(x, deck.y, near + 1.13);
      const initial = moving[axis];
      const last = terminal[axis];
      const negative = last < initial;
      const approach = [axis, negative ? ">" : "<", initial + (negative ? -0.24 : 0.24)];
      const depart = [axis, negative ? "<" : ">", last + (negative ? 0.29 : -0.29)];
      level.autoRoute.push(["ferry", anchorX, anchorZ, end.x, end.z, approach, depart]);
      trail(point(terminal.x, terminal.y, terminal.z + 0.8), end, 4, 0.87);
    }

    function spring({ rise = 3.15, shift = -2.6, wind = false } = {}) {
      const padX = deck.x + shift * 0.15;
      const padY = deck.y;
      takeoff(padX);
      const pad = addDeck(padX, padY, edge(deck) + 3.12, 3.9, 3.7, { spring: true });
      const near = edge(pad) + 1.82;
      const x = padX + shift;
      deck = addDeck(x, padY + rise, near + 2.55, 6.2, 5.1);
      const target = point(x, deck.y, near + 1.12);
      level.autoRoute.push(["spring", padX, pad.z + 0.05, target.x, target.z]);
      trail(point(padX, padY + 1.45, pad.z + 0.5), target, 5, 1.58);
      if (wind) {
        level.winds.push({
          ...point((padX + x) / 2, padY + 0.25, pad.z + 2.25),
          w: 5.8,
          d: 4.8,
          h: 6.4,
          vx: Math.sign(shift) * 3.5,
          vy: 7.4,
          vz: 4.1,
        });
      }
    }

    function finish({ shift = 0, rise = 0.3, finale = false } = {}) {
      bridge({ width: 8.2, depth: 7.8, gap: 1.65, shift, rise });
      level.goal = { ...point(deck.x, deck.y, deck.z + 1.1), ...(finale ? { finale } : {}) };
      walk(level.goal.x, level.goal.z);
    }

    trail(point(0, startY, 0.5), point(0, startY, 6.4), 5);
    build({ safe, steps, promenade, spikes, ferry, spring, finish });
    return level;
  }

  const regions = { grassland: [], "red-canyon": [], "ember-river": [] };
  const atmospheres = {
    windmills: { horizon: 0xffe2c8, light: 0xffe3ba, fogNear: 29, fogFar: 88 },
    orchard: { horizon: 0xccf4e8, light: 0xfff6d2, fogNear: 25, fogFar: 76 },
    "broken-aqueduct": { horizon: 0xd1e9ef, light: 0xdceeff, fogNear: 19, fogFar: 69 },
    "lantern-hill": { horizon: 0xffe3be, light: 0xffdcaa, fogNear: 31, fogFar: 94 },
    "post-road": { horizon: 0xffd296, light: 0xffdeb7, fogNear: 25, fogFar: 81 },
    clockworks: { horizon: 0xe7b3a6, light: 0xffc5a7, fogNear: 21, fogFar: 71 },
    "echo-quarry": { horizon: 0xe8b5a7, light: 0xfcd3c6, fogNear: 17, fogFar: 63 },
    sundial: { horizon: 0xffda8d, light: 0xffd29a, fogNear: 28, fogFar: 91 },
    furnace: { horizon: 0xf29b75, light: 0xffc3a2, fogNear: 20, fogFar: 73 },
    "ferry-network": { horizon: 0xe6a6b9, light: 0xffd8cf, fogNear: 28, fogFar: 84 },
    glassworks: { horizon: 0xdf96af, light: 0xffcadd, fogNear: 22, fogFar: 71 },
    forge: { horizon: 0xfbaa83, light: 0xffd2a1, fogNear: 26, fogFar: 82 },
  };
  const add = (chapter, id, name, tip, build, options) => {
    const theme = { grassland: "meadow", "red-canyon": "canyon", "ember-river": "lava" }[chapter];
    const stage = create(
      { chapter, id: `${chapter}-${id}`, name, tip, theme, atmosphere: atmospheres[id], ...options },
      build,
    );
    regions[chapter].push(stage);
  };

  add("grassland", "windmills", "风车留声", "越过转风台，再沿铃声爬上风车坡。", (r) => {
    r.steps({
      count: 4,
      width: [5.4, 5],
      gap: [1.45, 1.8],
      shift: [-1.8, -1.8, 1.8, 1.8],
      rise: [0.25, 0.2, -0.1],
      branch: 1,
    });
    r.safe({ checkpoint: true, relay: "低坡风灯" });
    r.spikes({ rows: 3, width: 7.1, spacing: 4.35, mode: "weave" });
    r.steps({ count: 4, width: 5, depth: 4.55, shift: [2.8, 2.3, -1.5, -2.1], rise: [0.3, 0.55, -0.05], branch: -1 });
    r.ferry({ axis: "x", distance: 5.75, shift: -1, period: 5.3 });
    r.safe({ checkpoint: true, length: 9.2 });
    r.steps({ count: 5, gap: [1.9, 1.6], shift: [3.3, 2.4, -1.2, -2.9, -1.6], rise: [0.45, 0, 0.35, -0.25] });
    r.safe({ relay: "风车塔灯", length: 7.4 });
    r.finish({ shift: 2.3 });
  });

  add("grassland", "orchard", "乱风果园", "选宽台换道。顺着上扬的金铃跳过枝梢。", (r) => {
    r.steps({ count: 5, width: [6.2, 4.7, 5.4], depth: [4.1, 4.8], shift: [2.5, 2.1, -3.5, -3.4, 1.8], branch: -1 });
    r.spikes({ rows: 2, width: 6.4, spacing: 4.9 });
    r.safe({ checkpoint: true, relay: "果园入口灯", length: 9.2 });
    r.spring({ shift: 3.25, rise: 2.3, wind: true });
    r.steps({
      count: 5,
      width: 4.8,
      gap: [1.4, 2, 1.75],
      shift: [-3.65, -3.2, 2.55, 3.35, -1.7],
      rise: [0.35, -0.65, -0.3],
      branch: 1,
    });
    r.spikes({ rows: 3, width: 7.4, spacing: 4.1, mode: "weave" });
    r.safe({ checkpoint: true, length: 9.8 });
    r.promenade({ length: 24.7, width: 7.9, turns: [-3.75, -3.2, 4.5], branch: 1 });
    r.safe({ relay: "果园高枝灯", shift: 2.1 });
    r.finish({ shift: -1.8, rise: -0.2 });
  });

  add("grassland", "broken-aqueduct", "断渠旧路", "沟渠留下了断板。落脚后继续跳向下一块。", (r) => {
    r.steps({
      count: 5,
      width: 4.6,
      depth: 4.2,
      gap: [1.6, 2.1, 1.65],
      shift: [-2.6, 1.65, -1.3, 2.7, -0.5],
      rise: [0.02, 0.38, -0.2],
    });
    r.safe({ checkpoint: true, relay: "渠南引路灯", width: 8.3 });
    r.steps({
      count: 4,
      width: [4.3, 4.1, 5],
      depth: 3.65,
      gap: [1.55, 1.8],
      shift: [2.35, 1.7, -2.7, -1.8],
      crumble: true,
      branch: 1,
    });
    r.ferry({ distance: 6.35, shift: -1.7, period: 5.35 });
    r.spikes({ rows: 3, width: 6, spacing: 4.25 });
    r.safe({ checkpoint: true, length: 8.5 });
    r.steps({
      count: 5,
      width: [4.9, 4.7, 5.5],
      depth: [4.8, 4.2],
      gap: 1.75,
      shift: [-2.3, -2.3, 2.5, 2.8, -0.8],
      rise: [0.52, 0.45, -0.24],
    });
    r.safe({ relay: "渠北照路灯", length: 10.2 });
    r.finish({ shift: 1.6 });
  });

  add("grassland", "lantern-hill", "灯丘归航", "坡道绕过断崖。看到脚下开始闪动就准备换道。", (r) => {
    r.spikes({ rows: 3, width: 7.6, spacing: 4.55, mode: "weave" });
    r.steps({
      count: 5,
      width: [5.5, 4.65],
      shift: [3.1, 3.35, -2.55, -2.8, -1.3],
      rise: [0.42, 0.46, 0.3],
      branch: -1,
    });
    r.safe({ checkpoint: true, relay: "山脚路灯", width: 7.8 });
    r.ferry({ axis: "y", distance: 2.1, shift: 2.05, period: 5.3 });
    r.steps({
      count: 4,
      width: 4.45,
      depth: 3.85,
      shift: [-2.3, -2.45, 2.6, 2.25],
      rise: [0.28, 0.35, -0.32],
      crumble: true,
    });
    r.safe({ checkpoint: true, length: 8.2 });
    r.spikes({ rows: 4, width: 6.3, spacing: 4.45, pulse: true });
    r.spring({ rise: 2.55, shift: -3.1, wind: true });
    r.safe({ relay: "灯丘晨灯", length: 10.5 });
    r.finish({ shift: 2.6 });
  });

  add("red-canyon", "post-road", "邮铃驿道", "驿灯标出安全站。顺着赤壁转向穿过夹道。", (r) => {
    r.steps({
      count: 5,
      width: [4.8, 4.2],
      gap: [1.8, 2.05],
      shift: [-2.3, -3.3, -2.2, 3.35, 3.1],
      rise: [0.36, 0.52, -0.18],
      branch: 1,
    });
    r.safe({ checkpoint: true, relay: "低峡驿铃", length: 8.4 });
    r.spikes({ rows: 4, width: 7.2, spacing: 4.4, mode: "weave" });
    r.ferry({ axis: "x", distance: 6.4, shift: 1, period: 5.6 });
    r.steps({
      count: 5,
      width: 4.6,
      depth: [4.15, 4.65],
      shift: [-2.45, -3.5, 2.6, 2.3, -1.35],
      rise: [0.18, 0.65, 0.38, -0.35],
      branch: -1,
    });
    r.safe({ checkpoint: true, length: 8.8 });
    r.spikes({ rows: 3, width: 5.9, spacing: 4.2, pulse: true, mode: "weave" });
    r.safe({ relay: "高峡驿铃", length: 10, shift: -2.1 });
    r.finish({ shift: 3.1 });
  });

  add("red-canyon", "clockworks", "赤岩钟室", "刺板闪烁后就会升起。收拢时穿过石室。", (r) => {
    r.steps({ count: 4, width: 5.3, gap: [1.8, 2.1], shift: [2.3, 1.8, -3.65, -2.25], rise: [0.21, 0.35, -0.12] });
    r.spikes({ rows: 4, width: 6.6, spacing: 4.2, pulse: true });
    r.safe({ checkpoint: true, relay: "钟室西锁" });
    r.ferry({ axis: "y", distance: 2.2, shift: 1.5 });
    r.spikes({ rows: 4, width: 7.5, spacing: 4.4, mode: "weave", pulse: true });
    r.steps({
      count: 4,
      width: 4.25,
      depth: 3.95,
      shift: [3.25, 2.25, -3.4, -3.25],
      rise: [0.43, 0.21, -0.35],
      crumble: true,
      branch: -1,
    });
    r.safe({ checkpoint: true, length: 9 });
    r.spikes({ rows: 3, width: 5.5, spacing: 4.1, pulse: true });
    r.safe({ relay: "钟室东锁", width: 8.2 });
    r.finish({ shift: -2.55 });
  });

  add("red-canyon", "echo-quarry", "回声采石场", "看准升降台的高度。悬空碎板只撑得住一小会。", (r) => {
    r.steps({
      count: 5,
      width: [5.4, 4.25, 4.5],
      gap: [1.7, 2.15],
      shift: [3.1, 2.7, 1.8, -3.1, -2.2],
      rise: [0.38, 0.62, 0.15, -0.28],
      branch: -1,
    });
    r.safe({ checkpoint: true, relay: "采石口信标" });
    r.ferry({ axis: "y", distance: 2.3, shift: -1.4, period: 5.45 });
    r.steps({
      count: 5,
      width: [4.45, 4.3, 5],
      depth: [3.75, 3.95],
      gap: [1.5, 1.95],
      shift: [-2.75, -2.3, 2.4, 2.75, -2.4],
      rise: [0.24, -0.2],
      crumble: true,
    });
    r.safe({ checkpoint: true, length: 9.5 });
    r.ferry({ axis: "x", distance: 5.8, shift: -1, period: 5.05 });
    r.promenade({ length: 22.9, width: 6.65, turns: [3.9, 3.25, -3.8], branch: 1 });
    r.safe({ relay: "回声深井信标", length: 10 });
    r.finish({ shift: 2.4 });
  });

  add("red-canyon", "sundial", "日晷石门", "跟着石门两侧的光路前进。等升降台停稳再跳。", (r) => {
    r.spikes({ rows: 4, width: 7.1, spacing: 4.5, mode: "weave", pulse: true });
    r.steps({ count: 4, width: 4.8, gap: 1.75, shift: [-2.9, -2.8, 3.05, 2.4], rise: [0.53, 0.34, -0.12], branch: 1 });
    r.safe({ checkpoint: true, relay: "日晷晨影轴" });
    r.ferry({ axis: "x", distance: 5.85, shift: 1, period: 5.3 });
    r.spikes({ rows: 4, width: 5.9, spacing: 4.15, pulse: true });
    r.safe({ checkpoint: true, relay: "日晷正午轴", length: 9.8 });
    r.ferry({ axis: "y", distance: 2.45, shift: -2.25 });
    r.steps({
      count: 5,
      width: [4.35, 5.2],
      depth: [4.2, 4.7],
      gap: [1.55, 1.95],
      shift: [-3.15, -2.45, 2.9, 2.5, -1.6],
      rise: [0.26, 0.33, -0.22],
      branch: -1,
    });
    r.safe({ relay: "落日归零灯", length: 8.4 });
    r.finish({ shift: -1.9 });
  });

  add(
    "ember-river",
    "furnace",
    "余火炉径",
    "炉中没有落脚处。沿外圈踏台到下一块石脊。",
    (r) => {
      r.steps({
        count: 5,
        width: [5.5, 4.25],
        gap: [1.65, 1.95],
        shift: [2.25, -2.65, -2.65, 2.4, 2.85],
        rise: [0.36, -0.06, 0.26],
      });
      r.safe({ checkpoint: true, relay: "炉口余火灯", width: 8 });
      r.spikes({ rows: 3, width: 6, spacing: 4.55 });
      r.ferry({ distance: 6.7, shift: -1.6, period: 5.25 });
      r.steps({
        count: 5,
        width: 4.65,
        depth: [3.8, 4],
        gap: [1.7, 1.5],
        shift: [2.55, 1.8, -2.65, -2.45, 1.75],
        rise: [0.3, -0.14],
        crumble: true,
        branch: 1,
      });
      r.safe({ checkpoint: true, length: 9.2 });
      r.steps({ count: 4, width: [4.9, 5.4], depth: 4.8, shift: [-3, -2.6, 3.4, 2.15], rise: [0.4, 0.45, -0.36] });
      r.safe({ relay: "烟道余火灯", length: 8.7 });
      r.finish({ shift: -2.4 });
    },
    { startY: 0.8, fallY: -7 },
  );

  add(
    "ember-river",
    "ferry-network",
    "双岸渡网",
    "一艘渡台横走，另一艘沿河前进。看清方向再登台。",
    (r) => {
      r.steps({ count: 4, gap: [1.7, 2.1], shift: [-2.6, -2.5, 3.2, 2.4], rise: [0.22, -0.1], branch: -1 });
      r.ferry({ distance: 6.7, shift: 2.4, period: 5.3 });
      r.safe({ checkpoint: true, relay: "东岸渡灯" });
      r.spikes({ rows: 3, width: 6.8, spacing: 4.4, mode: "weave" });
      r.ferry({ axis: "x", distance: 7.3, shift: -1, period: 5.8 });
      r.promenade({ length: 23.35, width: 7.4, turns: [-3.2, 4.2, 1.4], branch: 1 });
      r.safe({ checkpoint: true, relay: "西岸渡灯", length: 8.4 });
      r.ferry({ axis: "x", distance: 6.9, shift: 1, period: 5.45 });
      r.steps({ count: 3, width: 4.65, depth: 3.85, shift: [-2.9, -2.8, 2.4], crumble: true });
      r.safe({ relay: "河心信号塔", length: 7.6 });
      r.finish({ shift: 2 });
    },
    { startY: 0.8, fallY: -7 },
  );

  add(
    "ember-river",
    "glassworks",
    "琉璃工场",
    "踩开薄琉璃，再在稳定石台上整好步子。",
    (r) => {
      r.steps({
        count: 5,
        width: [4.5, 4.05, 4.75],
        depth: [3.7, 3.95],
        gap: [1.52, 1.77],
        shift: [2.45, 2.6, -2.55, -2.9, -0.85],
        crumble: true,
      });
      r.safe({ checkpoint: true, relay: "冷却台信标", width: 8.4 });
      r.spikes({ rows: 3, width: 5.6, spacing: 4.35, pulse: true });
      r.steps({
        count: 5,
        width: [4.45, 4.25],
        depth: 3.85,
        gap: [1.6, 1.9],
        shift: [-3, -2.3, 2.6, 2.8, -2.05],
        rise: [0.34, 0.38, -0.2],
        crumble: true,
        branch: 1,
      });
      r.safe({ checkpoint: true, length: 9.5 });
      r.ferry({ axis: "y", distance: 2.25, shift: -1.8, period: 5.05 });
      r.spikes({ rows: 4, width: 7.2, spacing: 4.25, mode: "weave" });
      r.steps({ count: 3, width: 4.4, depth: 3.85, shift: [2.75, -2.45, 2.4], crumble: true });
      r.safe({ relay: "成形台信标", length: 9.2 });
      r.finish({ shift: -1.85 });
    },
    { startY: 0.8, fallY: -7 },
  );

  add(
    "ember-river",
    "forge",
    "地火铸铃台",
    "沿铸台升高。热风托起跳跃，冷台留给你起跑。",
    (r) => {
      r.spikes({ rows: 3, width: 6.7, spacing: 4.6, mode: "weave" });
      r.steps({ count: 4, width: [5, 4.45], shift: [-2.7, -2.6, 3.1, 2.3], rise: [0.34, 0.38, -0.24], branch: -1 });
      r.safe({ checkpoint: true, relay: "冷却泵信标" });
      r.spring({ rise: 2.85, shift: 3.05, wind: true });
      r.steps({
        count: 5,
        width: 4.3,
        depth: [3.75, 3.95],
        gap: [1.6, 1.84],
        shift: [-2.45, -2.75, 3, 2.55, -1.6],
        rise: [0.28, -0.3, 0.31],
        crumble: true,
      });
      r.safe({ checkpoint: true, relay: "熔炉风门", length: 9 });
      r.ferry({ axis: "x", distance: 5.85, shift: -1, period: 5.35 });
      r.spikes({ rows: 4, width: 6.1, spacing: 4.25, pulse: true });
      r.safe({ relay: "铸铃主台火灯", length: 10.5 });
      r.finish({ shift: 2.6, rise: 0.6 });
    },
    { startY: 0.8, fallY: -7 },
  );

  return { create, regions };
})();
