"use strict";

globalThis.NiuHighlands = (() => {
  const { create } = globalThis.NiuExpedition;
  const atmospheres = {
    "sky-loom": { horizon: 0xcce8f2, zenith: 0x527fbc, light: 0xffeed3, fogNear: 30, fogFar: 88 },
    "sky-bell-archive": { horizon: 0xaca6cd, zenith: 0x3f4889, light: 0xe5ddff, fogNear: 22, fogFar: 71 },
    "sky-river-of-clouds": { horizon: 0xdaf3f3, zenith: 0x5c84c2, light: 0xe6fcff, fogNear: 29, fogFar: 84 },
    "sky-storm-eye": {
      horizon: 0x7374ad,
      zenith: 0x363976,
      light: 0xc5cbff,
      fogNear: 19,
      fogFar: 62,
      vistaStrength: 0.77,
    },
    "core-intake": { horizon: 0x417c8b, zenith: 0x263d64, light: 0xb5ffec, fogNear: 25, fogFar: 79 },
    "core-memory": { horizon: 0x746f9e, zenith: 0x382f65, light: 0xe8cdff, fogNear: 23, fogFar: 75 },
    "core-relay": { horizon: 0x76a7b4, zenith: 0x294f75, light: 0xc9fbff, fogNear: 34, fogFar: 94 },
    "core-turbine": { horizon: 0x856d85, zenith: 0x363c62, light: 0xffd6af, fogNear: 21, fogFar: 66 },
  };

  function sky(id, name, tip, build) {
    return create(
      { id, name, theme: "sky", chapter: "cloud-step", startY: 1.1, fallY: -10, tip, atmosphere: atmospheres[id] },
      build,
    );
  }

  function core(id, name, tip, build) {
    return create(
      { id, name, theme: "core", chapter: "compute-core", startY: 0.8, fallY: -9, tip, atmosphere: atmospheres[id] },
      build,
    );
  }

  return {
    "cloud-step": [
      sky("sky-loom", "云帆梯田", "借浅青色气流拉高跳弧。云田外侧还有一条寻星小道。", (track) => {
        // Wide terraces teach the shape of the active wind before the sloping jumps.
        track.steps({ count: 5, width: 6.2, depth: 4.6, gap: 1.6, shift: [-1.4, -1.2, 0.6, 1.8, 0.2], branch: -1 });
        track.safe({ length: 9, width: 8.4, relay: "引风台信标" });
        track.spring({ rise: 3.55, shift: -3.2, wind: true });
        track.steps({
          count: 5,
          width: 5.3,
          gap: 1.85,
          shift: [-1.4, 0.6, 2, 1.7, -0.2],
          rise: [0.2, 0.65, 0.1, -0.25, 0.4],
        });
        track.safe({ length: 10, width: 8.4, checkpoint: true, relay: "帆影信标" });
        track.spring({ rise: 3.8, shift: 3.5, wind: true });
        track.steps({
          count: 5,
          width: 4.9,
          depth: 4.2,
          gap: 1.95,
          shift: [-0.8, -1.85, -2.4, 0.7, 1.4],
          rise: [0.25, 0.45, 0, -0.7, -0.3],
          branch: 1,
        });
        track.safe({ length: 9, width: 7.5, checkpoint: true });
        track.ferry({ axis: "z", distance: 5.4, shift: -1.2, period: 5.6 });
        track.spring({ rise: 3.45, shift: 2.9, wind: true });
        track.steps({ count: 4, width: 5.5, depth: 4.1, gap: 1.7, shift: [1.2, -0.5, -2, -1] });
        track.safe({ length: 8, width: 8.2, relay: "云帆信标" });
        track.finish();
      }),
      sky("sky-bell-archive", "候风听台", "暗下去的刺阵可以走过。边缘的金铃会指向安全换道处。", (track) => {
        // Weave around static baffles first, then work through two different pulse rhythms.
        track.steps({ count: 4, width: 5.6, depth: 4.7, gap: 1.65, shift: [1.8, 1.7, -0.6, -1.4], branch: 1 });
        track.spikes({ rows: 4, width: 8, spacing: 3.8, mode: "weave" });
        track.safe({ length: 10, width: 9, relay: "旧风号信标", checkpoint: true });
        track.spikes({ rows: 3, width: 6.4, spacing: 4.4, pulse: true });
        track.steps({
          count: 5,
          width: 4.8,
          depth: 3.9,
          gap: 1.9,
          shift: [-1.6, -2, 0.6, 1.55, 1.15],
          rise: [0.4, 0.35, -0.3, 0.7, 0.3],
        });
        track.safe({ length: 9, width: 8.2, relay: "听声柱信标", checkpoint: true });
        track.ferry({ axis: "x", distance: 5.6, rise: 0.25, period: 5.6 });
        track.spikes({ rows: 4, width: 8, spacing: 4.1, pulse: true, mode: "weave" });
        track.steps({ count: 5, width: 5.2, depth: 4.6, gap: 1.55, shift: [0.35, -1.25, -1.8, 1.1, 1.6], branch: -1 });
        track.safe({ length: 12, width: 9, relay: "静云信标" });
        track.finish();
      }),
      sky("sky-river-of-clouds", "浮云渡口", "先看清渡台的两端。渡台靠岸时再跳，不用追着它跑。", (track) => {
        // The early ferry travels straight. Later boats carry the player across the valley.
        track.steps({ count: 4, width: 6, depth: 4.4, gap: 1.7, shift: [0.4, 1.8, 1.3, 0], branch: 1 });
        track.ferry({ axis: "z", distance: 6.2, period: 6.2, shift: 0.8 });
        track.safe({ length: 11, width: 8.5, relay: "近岸号灯", checkpoint: true });
        track.ferry({ axis: "x", distance: 6.5, period: 6.4, rise: 0.2 });
        track.steps({
          count: 5,
          width: 5,
          depth: 4.5,
          gap: 2.05,
          shift: [0, -1.4, -1.7, -1.8, 0.3],
          rise: [0.1, 0.25, 0.3, 0.35, -0.3],
          branch: -1,
        });
        track.spring({ rise: 3.45, shift: -2.6, wind: true });
        track.safe({ length: 10, width: 8.6, relay: "高桩码头信标", checkpoint: true });
        track.ferry({ axis: "y", distance: 2.8, rise: 0.15, period: 6.3 });
        track.steps({
          count: 4,
          width: 4.7,
          depth: 4.1,
          gap: 2.05,
          shift: [1.8, 1.8, -0.6, -0.55],
          rise: [0.35, 0.2, -0.2, 0.55],
        });
        track.ferry({ axis: "x", distance: -6.4, period: 5.8 });
        track.safe({ length: 9, width: 8.1, relay: "远岸号灯" });
        track.finish();
      }),
      sky("sky-storm-eye", "风眼桥", "碎云开始发亮就该起跳。每次升高后先确认下一个落点。", (track) => {
        track.steps({
          count: 5,
          width: 4.9,
          depth: 4,
          gap: 2.05,
          shift: [-1.5, 1.1, 1.75, 0, -1.25],
          rise: [0.35, 0.25, 0.4, -0.3, 0.35],
          branch: -1,
        });
        track.spring({ rise: 3.9, shift: -3.4, wind: true });
        track.safe({ length: 9, width: 8.1, relay: "目风标", checkpoint: true });
        track.steps({
          count: 5,
          width: 4.6,
          depth: 3.8,
          gap: 1.8,
          shift: [1.2, 1.2, -0.8, -1.4, 0.6],
          rise: [0.2, -0.1, -0.2, 0.2, 0.2],
          crumble: true,
        });
        track.spikes({ rows: 3, spacing: 4.1, pulse: true });
        track.safe({ length: 10, width: 8.2, relay: "回旋风信标", checkpoint: true });
        track.spring({ rise: 4.05, shift: 3.35, wind: true });
        track.steps({
          count: 6,
          width: 4.5,
          depth: 3.9,
          gap: 2.05,
          shift: [1.2, -1.4, -1.8, -1.4, 0.9, 1.15],
          rise: [0.45, 0.2, 0.2, -0.5, -0.8, 0.3],
          branch: 1,
        });
        track.ferry({ axis: "z", distance: 5.8, shift: -1.5, period: 6.5 });
        track.safe({ length: 10, width: 8.3, relay: "风眼桥信标", checkpoint: true });
        track.spring({ rise: 3.85, shift: 2.5, wind: true });
        track.steps({ count: 4, width: 5.1, depth: 4.6, gap: 1.85, shift: [-1.4, -0.6, 1.9, 0.35] });
        track.finish();
      }),
    ],
    "compute-core": [
      core("core-intake", "回潮冷却渠", "看清活塞轨道。让升降台把你带到排水台，再跳上出口。", (track) => {
        // A mostly low route, with regular recesses off the turbine's line.
        track.steps({ count: 5, width: 6, depth: 4.8, gap: 1.8, shift: [-0.9, -1.5, 0.3, 1.65, 0.7], branch: 1 });
        track.ferry({ axis: "z", distance: 5.7, shift: -0.75, period: 5.4 });
        track.safe({ length: 9, width: 8.7, relay: "第一进水口信标", checkpoint: true });
        track.ferry({ axis: "y", distance: 2.3, rise: 0.45, period: 5.7 });
        track.spikes({ rows: 4, width: 8.1, spacing: 4.2, mode: "weave" });
        track.steps({
          count: 4,
          width: 5.2,
          depth: 4.25,
          gap: 1.7,
          shift: [-1.9, -1.6, 0.7, 1.65],
          rise: [-0.6, -0.4, 0.2, 0.3],
        });
        track.safe({ length: 10, width: 8.2, relay: "泄压口信标", checkpoint: true });
        track.ferry({ axis: "x", distance: -5.8, period: 6.3 });
        track.steps({
          count: 5,
          width: 5.3,
          depth: 4.2,
          gap: 1.9,
          shift: [-0.5, 1.4, 1.5, -0.6, -1],
          rise: [-0.5, 0.1, 0.5, 0.45, 0.3],
          branch: -1,
        });
        track.spikes({ rows: 3, width: 6.5, spacing: 4.3, pulse: true });
        track.safe({ length: 8, width: 8.5, relay: "冷却渠闸门信标" });
        track.finish();
      }),
      core("core-memory", "折光记忆廊", "先避开第一排，再横穿到对面。两边的刺阵在不同时间伸出。", (track) => {
        // A mirrored course. The safe shoulders alternate, so route-finding matters.
        track.spikes({ rows: 3, width: 8.4, spacing: 4.1, mode: "weave" });
        track.steps({
          count: 5,
          width: 5.2,
          depth: 4.6,
          gap: 1.7,
          shift: [-1.85, -1.85, 0.8, 2, 0.9],
          rise: [0.1, 0.5, 0.35, 0.25, -0.2],
          branch: -1,
        });
        track.safe({ length: 10, width: 9, relay: "第一折镜信标", checkpoint: true });
        track.spikes({ rows: 5, width: 8.8, spacing: 4.4, mode: "weave", pulse: true });
        track.ferry({ axis: "x", distance: 5.9, period: 6.4 });
        track.steps({
          count: 5,
          width: 5.2,
          depth: 4.6,
          gap: 1.75,
          shift: [1.8, 1.85, -0.85, -2.1, -1.1],
          rise: [0.2, 0.4, 0.4, 0.15, -0.3],
          branch: 1,
        });
        track.safe({ length: 10, width: 9.1, relay: "留声格信标", checkpoint: true });
        track.spikes({ rows: 4, width: 5.8, spacing: 4.4, pulse: true });
        track.steps({
          count: 4,
          width: 5.1,
          depth: 4.6,
          gap: 1.85,
          shift: [0.35, -1.55, 1.7, -0.4],
          rise: [0.3, 0.15, 0, 0.25],
        });
        track.safe({ length: 11, width: 9, relay: "镜廊出口信标" });
        track.finish();
      }),
      core("core-relay", "星轨配电塔", "沿三道升降台攀上塔顶。离开台面前，先等它抬到对岸。", (track) => {
        // The course is mostly vertical. Each relay gives a flat rest with a view down the tower.
        track.steps({
          count: 5,
          width: 5.7,
          depth: 4.4,
          gap: 1.7,
          shift: [-1.35, -1.5, -0.8, 1.7, 1.4],
          rise: [0.5, 0.65, 0.45, 0.65, 0.55],
        });
        track.ferry({ axis: "y", distance: 2.9, rise: 0.25, period: 5.7 });
        track.safe({ length: 10, width: 9.5, relay: "塔基分路信标", checkpoint: true });
        track.steps({
          count: 5,
          width: 4.9,
          depth: 4.1,
          gap: 1.9,
          shift: [1.85, 1.35, -0.3, -1.8, -0.9],
          rise: [0.3, 0.65, 0.7, 0.15, 0.45],
          branch: 1,
        });
        track.ferry({ axis: "y", distance: 2.6, rise: 0.55, period: 6.1 });
        track.spikes({ rows: 3, width: 8.1, spacing: 4.1, mode: "weave", pulse: true });
        track.safe({ length: 9, width: 8.1, relay: "中层星轨信标", checkpoint: true });
        track.steps({
          count: 5,
          width: 4.5,
          depth: 4.2,
          gap: 2,
          shift: [1.45, 1.65, 1.2, -1.6, -1.5],
          rise: [0.7, 0.5, 0.6, 0.2, 0.6],
        });
        track.ferry({ axis: "y", distance: 3.1, period: 6.2, rise: 0.3 });
        track.spring({ rise: 3.55, shift: -3, wind: true });
        track.safe({ length: 11, width: 8.7, relay: "塔顶汇流信标", checkpoint: true });
        track.steps({
          count: 4,
          width: 5.4,
          depth: 4.6,
          gap: 1.95,
          shift: [-1.2, -1.15, 1.55, 1.5],
          rise: [0.4, -0.4, -0.6, -0.45],
          branch: -1,
        });
        track.finish();
      }),
      core("core-turbine", "风暴涡轮井", "移动台送你过涡轮，橙色桥会碎。连续起跳后再借风飞出井口。", (track) => {
        track.spikes({ rows: 4, width: 6.6, spacing: 4.3, pulse: true });
        track.steps({
          count: 5,
          width: 4.8,
          depth: 3.9,
          gap: 1.9,
          shift: [1.3, -1.1, -1.6, 0.4, 0.8],
          rise: [0.2, 0.45, 0.2, -0.3, 0.4],
          crumble: true,
          branch: -1,
        });
        track.safe({ length: 11, width: 8.9, relay: "外环逆转信标", checkpoint: true });
        track.ferry({ axis: "x", distance: -6.1, rise: 0.25, period: 6.2 });
        track.spikes({ rows: 4, width: 8.2, spacing: 4.2, pulse: true, mode: "weave" });
        track.spring({ rise: 3.8, shift: 3.4, wind: true });
        track.safe({ length: 10, width: 8.3, relay: "反吹风信标", checkpoint: true });
        track.steps({
          count: 5,
          width: 4.35,
          depth: 3.8,
          gap: 1.9,
          shift: [-1.2, -1.5, 1.1, 1.9, -0.7],
          rise: [0.35, 0.35, -0.2, 0.2, 0.35],
          crumble: true,
        });
        track.ferry({ axis: "z", distance: 5.8, period: 6.4, shift: 0.9 });
        track.spikes({ rows: 3, width: 6.1, spacing: 4.2, pulse: true });
        track.safe({ length: 10, width: 9.4, relay: "内环逆转信标", checkpoint: true });
        track.spring({ rise: 3.95, shift: -3.25, wind: true });
        track.steps({
          count: 4,
          width: 5.1,
          depth: 4.5,
          gap: 1.9,
          shift: [-1.4, 1.7, 1.35, -0.4],
          rise: [0.4, 0.3, 0.25, 0.45],
          branch: 1,
        });
        track.finish();
      }),
    ],
  };
})();
