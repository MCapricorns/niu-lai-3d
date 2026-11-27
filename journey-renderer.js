"use strict";

(function () {
  const themes = {
    meadow: {
      zenith: 0x4396e7,
      horizon: 0xd6f5ef,
      floor: 0x4ca9a1,
      ripple: 0x83d5c0,
      terrain: 0x80b942,
      side: 0x956649,
      rim: 0xbbdf68,
      deep: 0x684c42,
      accent: 0xffe066,
      distant: 0x8dcb9d,
      cloud: 0xfff8e8,
      light: 0xfff0ce,
    },
    canyon: {
      zenith: 0xce7270,
      horizon: 0xffe2a5,
      floor: 0xa85862,
      ripple: 0xeb9471,
      terrain: 0xfac783,
      side: 0xbe704c,
      rim: 0xffe0a4,
      deep: 0x90514c,
      accent: 0x71ebdf,
      distant: 0xc78373,
      cloud: 0xffe8bf,
      light: 0xffdbba,
    },
    lava: {
      zenith: 0x462d64,
      horizon: 0xf6a08a,
      floor: 0xc83639,
      ripple: 0xffaf39,
      terrain: 0x987289,
      side: 0x563c53,
      rim: 0xc4919f,
      deep: 0x322735,
      accent: 0xffb947,
      distant: 0x91576d,
      cloud: 0xf1a5a3,
      light: 0xffc0a2,
    },
    sky: {
      zenith: 0x455cc5,
      horizon: 0xe6ccfa,
      floor: 0x9b97d6,
      ripple: 0xc7c6f4,
      terrain: 0xc5bcf3,
      side: 0x776eab,
      rim: 0xf4f0ff,
      deep: 0x5d5589,
      accent: 0x86fff4,
      distant: 0xbba6df,
      cloud: 0xfff1fc,
      light: 0xf3e4ff,
    },
    core: {
      zenith: 0x252e60,
      horizon: 0x6298aa,
      floor: 0x20334c,
      ripple: 0x42a6b0,
      terrain: 0x607b9c,
      side: 0x344460,
      rim: 0x93b9d2,
      deep: 0x293348,
      accent: 0x77fff1,
      distant: 0x54859d,
      cloud: 0xabcddd,
      light: 0xa6f3ff,
    },
  };
  const TAU = Math.PI * 2;
  const PARTICLE_CAP = 320;
  // The vista and procedural floor share a projection, so their horizon stays continuous.
  const vistaShader = `
    uniform sampler2D vista;
    uniform float vistaStrength, vistaAspect, dusk;
    uniform vec2 vistaShift;
    vec4 horizonVista(vec3 ray) {
      float azimuth = atan(-ray.x, ray.z);
      float elevation = atan(ray.y, length(ray.xz));
      float lateral = clamp(1.06 / vistaAspect, 0.32, 0.69);
      vec2 uv = vec2(0.5 + azimuth * lateral, 0.98 + elevation * 1.12) + vistaShift;
      float window = smoothstep(0.001, 0.17, uv.y) * (1.0 - smoothstep(0.955, 1.005, uv.y));
      window *= smoothstep(0.03, 0.14, uv.x) * (1.0 - smoothstep(0.86, 0.97, uv.x));
      vec3 image = texture2D(vista, clamp(uv, 0.002, 0.998)).rgb;
      vec3 dawn = pow(max(image, vec3(0.001)), vec3(0.63, 0.79, 1.16)) * vec3(1.25, 1.04, 0.84);
      return vec4(mix(image, dawn, dusk), window * vistaStrength);
    }
  `;

  function hash(seed) {
    const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function create(canvas, buildCalf) {
    const T = globalThis.THREE;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.outputColorSpace = T.SRGBColorSpace;

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(48, 1, 0.1, 180);
    const sun = new T.DirectionalLight(0xfff1d6, 0.93);
    sun.position.set(-5, 10, -7);
    scene.add(sun, new T.HemisphereLight(0xe3f4ff, 0xaa7882, 0.91));
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const textureLoader = new T.TextureLoader();
    const vistaFallback = new T.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    vistaFallback.needsUpdate = true;
    const vistas = new Map();
    const vistaUniforms = {
      vista: { value: vistaFallback },
      vistaStrength: { value: 0 },
      vistaAspect: { value: 1.5 },
      vistaShift: { value: new T.Vector2() },
      dusk: { value: 0 },
    };
    const assets = {
      box: new T.BoxGeometry(1, 1, 1),
      orb: new T.IcosahedronGeometry(1, 1),
      rock: new T.IcosahedronGeometry(1),
      gem: new T.OctahedronGeometry(1),
      spike: new T.ConeGeometry(0.5, 1, 6),
      coin: new T.CylinderGeometry(0.26, 0.26, 0.075, 20),
      seal: new T.CylinderGeometry(0.135, 0.135, 0.089, 8),
      cylinder: new T.CylinderGeometry(1, 1, 1, 12),
      ring: new T.TorusGeometry(1, 0.036, 6, 40),
      bell: new T.LatheGeometry(
        [
          [0, -0.18],
          [0.27, -0.18],
          [0.28, -0.12],
          [0.21, -0.07],
          [0.16, 0.12],
          [0.11, 0.2],
          [0.055, 0.23],
          [0, 0.23],
        ].map(([x, y]) => new T.Vector2(x, y)),
        16,
      ),
    };
    const dummy = new T.Object3D();
    const particles = [];
    const rings = [];
    const color = new T.Color();
    const sparkMaterial = new T.MeshBasicMaterial({ color: 0xffffff });
    const sparkMesh = new T.InstancedMesh(assets.gem, sparkMaterial, PARTICLE_CAP);
    sparkMesh.frustumCulled = false;
    sparkMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    sparkMesh.count = 0;
    scene.add(sparkMesh);

    const model = buildCalf();
    const facingNode = new T.Group();
    const tumbleNode = new T.Group();
    const playerNode = new T.Group();
    model.rotation.y = -Math.PI / 2;
    model.position.y = -0.65;
    tumbleNode.position.y = 0.65;
    tumbleNode.add(model);
    facingNode.add(tumbleNode);
    playerNode.add(facingNode);
    scene.add(playerNode);

    const shadeGeo = new T.PlaneGeometry(2, 2);
    const shadeMat = new T.ShaderMaterial({
      uniforms: { strength: { value: 0.45 } },
      transparent: true,
      depthWrite: false,
      vertexShader:
        "varying vec2 spot; void main(){spot=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader:
        "varying vec2 spot; uniform float strength; void main(){float d=length(spot); float soft=1.0-smoothstep(0.24,0.98,d); float rim=smoothstep(0.47,0.59,d)*(1.0-smoothstep(0.59,0.70,d)); gl_FragColor=vec4(0.08,0.11,0.15,soft*strength+rim*0.08);}",
    });
    const shadow = new T.Mesh(shadeGeo, shadeMat);
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);

    let stage;
    let ground;
    let atmosphere;
    let platforms;
    let prizes;
    let beacons;
    let relays;
    let retractingSpikes;
    let winds;
    let exit;
    let currentTheme;
    let backdrop;
    let vistaRecord;
    let vistaName;
    let vistaStrength = 1;
    let vistaAnchor = 0;
    let materials;
    let stageGeometries;
    let sky;
    let clock = 0;
    let footfall = 0;
    let flip = 0;
    let squash = 0;
    let shake = 0;
    let boost = 0;
    let restored = false;
    let dawnTime = 0;
    let width = 0;
    let height = 0;
    let dpr = 0;
    let snapCamera = true;
    const follow = new T.Vector3();
    const target = new T.Vector3();
    const look = new T.Vector3();
    const dawnLight = new T.Color(0xffdfa7);
    const dawnHorizon = new T.Color(0xf8ba9b);
    const dawnSky = new T.Color(0x6b5d93);

    function getVista(theme) {
      if (vistas.has(theme)) return vistas.get(theme);
      const record = { ready: false, aspect: 1.5 };
      record.texture = textureLoader.load(
        `assets/world-${theme}.webp`,
        (texture) => {
          record.aspect = texture.image.width / texture.image.height;
          record.ready = true;
        },
        undefined,
        () => {},
      );
      record.texture.colorSpace = T.SRGBColorSpace;
      record.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      vistas.set(theme, record);
      return record;
    }

    function surface(colorValue, emissive = 0) {
      return new T.MeshLambertMaterial({ color: colorValue, emissive, emissiveIntensity: 0.38 });
    }

    function texturedSurface(colorValue, style) {
      const material = surface(colorValue);
      const pattern = {
        meadow: "float motif = a * 0.14 + b * 0.1 - 0.11;",
        canyon: "float motif = (sin(p.y * 6.4 + a * 4.0) * 0.5 + 0.5) * 0.10 + a * 0.11 - 0.10;",
        lava: "float motif = a * 0.17 + b * 0.09 - 0.12;",
        sky: "float motif = sin(p.y * 0.95 - p.x * 0.78 + a * 3.2) * 0.04 + a * 0.11 - 0.06;",
        core: "vec2 seamUv = abs(fract(p * 0.44) - 0.5); float seam = smoothstep(0.47, 0.50, max(seamUv.x, seamUv.y)); float motif = a * 0.05 - seam * 0.12 - 0.025;",
        side: "float motif = sin(groundSurface.y * 20.0 + a * 4.0) * 0.04 + a * 0.15 + b * 0.11 - 0.12;",
      }[style];
      material.customProgramCacheKey = () => "journey-" + style;
      material.onBeforeCompile = (shader) => {
        shader.vertexShader =
          "varying vec3 groundSurface;\n" +
          shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\ngroundSurface = (modelMatrix * vec4(transformed, 1.0)).xyz;",
          );
        shader.fragmentShader =
          `
          varying vec3 groundSurface;
          float groundHash(vec2 p) {
            return fract(sin(dot(p, vec2(121.7, 291.5))) * 43758.5453);
          }
          float groundNoise(vec2 p) {
            vec2 n = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(groundHash(n), groundHash(n + vec2(1.0, 0.0)), f.x),
              mix(groundHash(n + vec2(0.0, 1.0)), groundHash(n + 1.0), f.x), f.y);
          }
        ` +
          shader.fragmentShader.replace(
            "#include <color_fragment>",
            `#include <color_fragment>
          vec2 p = groundSurface.xz;
          float a = groundNoise(p * 0.74);
          float b = groundNoise(p * 3.8);
          ${pattern}
          diffuseColor.rgb *= 1.0 + motif;`,
          );
      };
      return material;
    }

    function scenerySurface() {
      const material = surface(0xffffff);
      material.transparent = true;
      material.depthWrite = false;
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <fog_fragment>",
          "#include <fog_fragment>\ngl_FragColor.a *= 1.0 - smoothstep(24.0, 43.0, length(vViewPosition));",
        );
      };
      return material;
    }

    function luminous(colorValue, options = {}) {
      return new T.MeshBasicMaterial({ color: colorValue, ...options });
    }

    function place(parent, geometry, material, x, y, z, sx = 1, sy = sx, sz = sx) {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      parent.add(mesh);
      return mesh;
    }

    function block(parent, material, x, y, z, w, h, d) {
      return place(parent, assets.box, material, x, y, z, w, h, d);
    }

    function ring(parent, material, x, y, z, radius, horizontal = false) {
      const mesh = place(parent, assets.ring, material, x, y, z, radius);
      if (horizontal) mesh.rotation.x = -Math.PI / 2;
      return mesh;
    }

    function makeSky(theme) {
      const geo = new T.SphereGeometry(130, 24, 16);
      const mat = new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        uniforms: {
          ...vistaUniforms,
          zenith: { value: new T.Color(theme.zenith) },
          horizon: { value: new T.Color(theme.horizon) },
          sun: { value: new T.Color(theme.light) },
        },
        vertexShader:
          "varying vec3 skyDirection; void main(){skyDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader: `
          varying vec3 skyDirection;
          uniform vec3 zenith, horizon, sun;
          ${vistaShader}
          void main() {
            vec3 ray = normalize(skyDirection);
            float top = smoothstep(-0.22, 0.66, ray.y);
            float light = max(0.0, dot(ray, normalize(vec3(-0.6, 0.18, 0.85))));
            vec3 sky = mix(horizon, zenith, top);
            sky = mix(sky, sun, 0.35 * pow(light, 10.0) + 0.55 * smoothstep(0.996, 0.9985, light));
            if (vistaStrength > 0.0) {
              vec4 art = horizonVista(ray);
              sky = mix(sky, art.rgb, art.a);
            }
            gl_FragColor = vec4(sky, 1.0);
            #include <encodings_fragment>
          }`,
      });
      materials.sky = mat;
      stageGeometries.add(geo);
      const dome = place(stage, geo, mat, 0, 0, 0);
      dome.renderOrder = -10;
      return dome;
    }

    function makeGround(theme, center, y, isCore, isLava) {
      const geo = new T.PlaneGeometry(280, 280);
      const mat = new T.ShaderMaterial({
        uniforms: {
          ...vistaUniforms,
          base: { value: new T.Color(theme.floor) },
          ripple: { value: new T.Color(theme.ripple) },
          horizon: { value: new T.Color(theme.horizon) },
          clock: { value: 0 },
          style: { value: isCore ? 2 : isLava ? 1 : 0 },
        },
        vertexShader:
          "varying vec3 groundPoint; void main(){groundPoint=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader: `
          varying vec3 groundPoint;
          uniform vec3 base, ripple, horizon;
          uniform float clock, style;
          ${vistaShader}
          void main() {
            vec2 p = groundPoint.xz;
            float wave = sin(0.57 * p.x + 0.12 * p.y + clock * 0.8)
                      + sin(0.33 * p.y - 0.21 * p.x + clock * 0.48);
            float detail = sin(1.55 * p.y + 0.37 * p.x + wave * 1.4);
            float crests = smoothstep(0.73, 1.0, detail) * smoothstep(-0.55, 1.65, wave);
            vec3 col = mix(base, ripple, 0.24 * (wave + 2.0) + 0.20 * crests);
            if (style == 1.0) {
              col = mix(base, ripple, smoothstep(-0.9, 1.45, wave) * (0.75 + 0.2 * detail));
            }
            if (style == 2.0) {
              vec2 grid = abs(fract(p * 0.34) - 0.5);
              float line = smoothstep(0.47, 0.50, max(grid.x, grid.y));
              col = mix(base, ripple, (line * 0.42 + 0.12) * (0.8 + wave * 0.1));
            }
            float mist = smoothstep(13.0, 93.0, distance(groundPoint, cameraPosition));
            col = mix(col, horizon, mist * 0.92);
            if (vistaStrength > 0.0) {
              vec3 delta = groundPoint - cameraPosition;
              vec4 art = horizonVista(normalize(delta));
              float reach = smoothstep(14.0, 36.0, length(delta));
              float sides = smoothstep(4.5, 15.0, abs(delta.x)) * smoothstep(12.0, 22.0, length(delta));
              col = mix(col, art.rgb, art.a * max(reach, sides * 0.93));
            }
            gl_FragColor = vec4(col, 1.0);
            #include <encodings_fragment>
          }`,
      });
      materials.ground = mat;
      stageGeometries.add(geo);
      const floor = place(stage, geo, mat, 0, y, center);
      floor.rotation.x = -Math.PI / 2;
      return floor;
    }

    function makeBackdrop(level) {
      const isCore = level.theme === "core" || level.theme === "server";
      const isLava = level.theme === "lava";
      const isSky = level.theme === "sky";
      const isMeadow = level.theme === "meadow" || level.theme === "grass";
      const length = level.goal.z - level.spawn.z;
      const fill = isLava ? (level.fallY ?? -7) + 0.95 : (level.fallY ?? -8) - 0.12;
      ground = makeGround(currentTheme, level.spawn.z + length / 2, fill, isCore, isLava);

      const forms = new T.Group();
      stage.add(forms);
      for (let i = 0; i < 20; i++) {
        const side = i % 2 ? -1 : 1;
        const x = side * (18 + hash(i + 10) * 21);
        const z = level.spawn.z - 10 + (i / 19) * (length + 34);
        const y = fill - 1 + hash(i + 3) * 5;
        const scale = 2 + hash(i + 17) * 4.2;
        if (isCore) {
          const tower = (scale - 0.8) * (1.1 + hash(i + 24));
          block(forms, materials.distant, x, y + tower / 2, z, scale * 0.45, tower, scale * 0.45);
          for (let j = 0; j < 3; j++) {
            block(
              forms,
              materials.distantGlow,
              x,
              y + tower - 0.48 - j * 0.48,
              z - scale * 0.23,
              scale * 0.28,
              0.11,
              0.04,
            );
          }
        } else {
          const shape = i % 3 === 0 && !isSky ? assets.spike : assets.orb;
          const mound = place(forms, shape, materials.distant, x, y, z, scale * 1.55, scale * 1.65, scale);
          mound.rotation.y = hash(i + 61) * TAU;
          if (isMeadow && i % 2 === 0) {
            place(forms, assets.orb, materials.distant, x - side * 4, y - 0.8, z + 1.8, scale * 1.1);
          }
        }
      }

      if (isCore) return forms;
      const cloudGeo = new T.SphereGeometry(1, 12, 8);
      stageGeometries.add(cloudGeo);
      const clouds = new T.InstancedMesh(cloudGeo, materials.cloud, 60);
      let index = 0;
      for (let i = 0; i < 12; i++) {
        const side = i % 2 ? -1 : 1;
        const x = side * (9 + hash(i + 175) * 37);
        const z = level.spawn.z + 9 + (i / 11) * (length + 32);
        const y = isSky ? 2 + hash(i + 73) * 13 : 10 + hash(i + 73) * 18;
        for (let j = 0; j < 5; j++) {
          const r = 1 + hash(i * 6 + j + 99) * 1.8;
          dummy.position.set(x + (j - 2) * 1.45, y + hash(i * 6 + j + 12), z + hash(i * 6 + j) * 2);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(r * 1.4, r * 0.48, r * 0.8);
          dummy.updateMatrix();
          clouds.setMatrixAt(index++, dummy.matrix);
        }
      }
      forms.add(clouds);
      return forms;
    }

    function makeScenery(level, theme) {
      const entries = new Map();
      function cast(geometry, x, y, z, sx, sy, sz, hue, yaw = 0, tilt = 0) {
        if (!entries.has(geometry)) entries.set(geometry, []);
        entries.get(geometry).push({ x, y, z, sx, sy, sz, hue, yaw, tilt });
      }
      const base = ground.position.y;
      const span = level.goal.z - level.spawn.z;
      const count = Math.max(7, Math.min(14, Math.ceil(span / 5.7)));
      for (let i = 0; i < count; i++) {
        const sign = i % 2 === 0 ? 1 : -1;
        const x = sign * (15 + hash(i + 31) * 17);
        const z = level.spawn.z + 10 + (i / count) * (span + 11);
        const size = 0.7 + hash(i + 58) * 1.8;
        const yaw = hash(i + 121) * TAU;
        if (theme === "meadow") {
          cast(assets.rock, x, base + 0.18, z, size * 2.3, size * 0.76, size * 1.3, 0x46786b, yaw);
          cast(assets.rock, x, base + size * 0.44, z, size * 2.01, size * 0.43, size * 1.23, 0x7faf64, yaw);
          for (let j = 0; j < 4; j++) {
            const px = x + (j - 1.5) * size * 0.62;
            const pz = z + (hash(i * 5 + j + 56) - 0.5) * size;
            const tree = size * (0.48 + hash(i * 4 + j + 71) * 0.68);
            cast(
              assets.cylinder,
              px,
              base + size * 0.74 + tree * 0.25,
              pz,
              tree * 0.055,
              tree * 0.66,
              tree * 0.055,
              0x665947,
            );
            cast(
              assets.spike,
              px,
              base + size * 0.76 + tree * 0.67,
              pz,
              tree * 0.86,
              tree * 0.94,
              tree * 0.86,
              0x337c63,
              yaw,
            );
            cast(
              assets.spike,
              px,
              base + size * 0.76 + tree * 1.15,
              pz,
              tree * 0.62,
              tree * 0.85,
              tree * 0.62,
              0x548952,
              yaw,
            );
          }
        } else if (theme === "canyon") {
          for (let j = 0; j < 4; j++) {
            const layer = size * (1.96 - j * 0.27);
            cast(
              assets.cylinder,
              x + j * 0.12,
              base + size * (j * 0.68 + 0.25),
              z,
              layer,
              size * 0.8,
              layer * 0.72,
              [0x9b665c, 0xc28a6b, 0xb17460, 0xd39b74][j],
              yaw,
            );
          }
        } else if (theme === "lava") {
          cast(assets.rock, x, base + size * 0.38, z, size * 2.2, size * 1.5, size * 1.6, 0x382a42, yaw, -0.18);
          cast(
            assets.rock,
            x - sign * size * 0.8,
            base + size * 0.53,
            z + size * 0.38,
            size * 1.17,
            size * 1.14,
            size * 0.85,
            0x55405b,
            yaw + 0.9,
            0.24,
          );
          cast(
            assets.rock,
            x - sign * size * 1.5,
            base + size * 0.2,
            z - size * 0.42,
            size * 0.71,
            size * 0.35,
            size * 0.66,
            0xbb503c,
            yaw,
          );
        } else if (theme === "sky") {
          const lift = base + 6.5 + hash(i + 65) * 4;
          cast(assets.rock, x, lift, z, size * 1.8, size * 0.72, size * 1.37, 0xa39eb7, yaw);
          cast(assets.rock, x, lift + size * 0.31, z, size * 1.61, size * 0.39, size * 1.15, 0xc1c4df, yaw);
          for (const shift of [-0.64, 0.6]) {
            cast(
              assets.cylinder,
              x + shift * size,
              lift + size * 1.22,
              z,
              size * 0.17,
              size * 1.5,
              size * 0.17,
              0xd6daf2,
              yaw,
            );
            cast(
              assets.box,
              x + shift * size,
              lift + size * 1.96,
              z,
              size * 0.55,
              size * 0.15,
              size * 0.55,
              0xa89bd0,
              yaw,
            );
          }
        } else {
          const tall = size * (1.7 + hash(i + 75) * 2.3);
          cast(assets.box, x, base + tall / 2, z, size * 1.3, tall, size * 1.08, 0x304d63, yaw);
          for (let j = 0; j < 3; j++) {
            const slit = size * 0.55;
            cast(
              assets.box,
              x - Math.sin(yaw) * slit,
              base + tall - 0.4 - j * size * 0.31,
              z - Math.cos(yaw) * slit,
              size * 0.8,
              0.055,
              0.035,
              0x5fbbaa,
              yaw,
            );
          }
        }
      }
      for (const [geometry, placements] of entries) {
        const batch = new T.InstancedMesh(geometry, materials.scenery, placements.length);
        placements.forEach(({ x, y, z, sx, sy, sz, hue, yaw, tilt }, i) => {
          dummy.position.set(x, y, z);
          dummy.scale.set(sx, sy, sz);
          dummy.rotation.set(0, yaw, tilt);
          dummy.updateMatrix();
          batch.setMatrixAt(i, dummy.matrix);
          batch.setColorAt(i, color.setHex(hue));
        });
        stage.add(batch);
      }
    }

    function makeAtmosphere(level, theme) {
      const amount = reducedMotion ? 48 : 138;
      const span = level.goal.z - level.spawn.z + 33;
      const positions = new Float32Array(amount * 3);
      for (let i = 0; i < amount; i++) {
        positions[i * 3] = (hash(i * 3 + 66) - 0.5) * 58;
        positions[i * 3 + 1] = ground.position.y + 1.5 + hash(i * 3 + 194) * (theme === "sky" ? 29 : 20);
        positions[i * 3 + 2] = level.spawn.z - 12 + hash(i * 3 + 283) * span;
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(positions, 3));
      stageGeometries.add(geo);
      const mat = new T.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          height: { value: 1 },
          tint: {
            value: new T.Color(
              { meadow: 0xffeac0, canyon: 0xffdbaa, lava: 0xff8c4b, sky: 0xe5eeff, core: 0x71eae5 }[theme],
            ),
          },
        },
        transparent: true,
        depthWrite: false,
        vertexShader: `
          uniform float time, height;
          varying float glow;
          void main() {
            float seed = position.x * 23.0 + position.z * 2.3;
            vec3 air = position + vec3(sin(time * 0.37 + seed), sin(time * 0.47 + seed) * 0.92, cos(time * 0.29 + seed) * 1.5);
            vec4 point = modelViewMatrix * vec4(air, 1.0);
            float distance = -point.z;
            glow = smoothstep(2.0, 8.0, distance) * (1.0 - smoothstep(36.0, 55.0, distance));
            glow *= 0.60 + 0.40 * sin(time * 0.84 + seed);
            gl_PointSize = clamp(height * (0.074 + 0.021 * sin(seed)) / max(0.1, distance), 1.1, 5.5);
            gl_Position = projectionMatrix * point;
          }`,
        fragmentShader: `
          uniform vec3 tint;
          varying float glow;
          void main() {
            float edge = length(gl_PointCoord - 0.5);
            float alpha = (1.0 - smoothstep(0.09, 0.50, edge)) * glow;
            gl_FragColor = vec4(tint, alpha * 0.66);
            #include <encodings_fragment>
          }`,
      });
      materials.atmosphere = mat;
      const points = new T.Points(geo, mat);
      points.frustumCulled = false;
      stage.add(points);
      return mat.uniforms;
    }

    function chamfered(w, d, height, cut) {
      const x = w / 2;
      const z = d / 2;
      cut = Math.min(cut, x * 0.3, z * 0.3);
      const shape = new T.Shape();
      shape.moveTo(-x + cut, -z);
      shape.lineTo(x - cut, -z);
      shape.lineTo(x, -z + cut);
      shape.lineTo(x, z - cut);
      shape.lineTo(x - cut, z);
      shape.lineTo(-x + cut, z);
      shape.lineTo(-x, z - cut);
      shape.lineTo(-x, -z + cut);
      shape.closePath();
      const geometry = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, -height, 0);
      stageGeometries.add(geometry);
      return geometry;
    }

    function makePlatform(p, i) {
      const platform = new T.Group();
      platform.position.set(p.x, p.y, p.z);
      stage.add(platform);
      const h = p.h ?? globalThis.NiuPlatformer?.tuning.platformHeight ?? 0.75;
      const moving = !!p.motion;
      const special = moving || p.spring || p.crumble;
      const capThickness = Math.min(0.16, h * 0.5);
      const bodyHeight = h - capThickness + 0.015;
      block(
        platform,
        p.crumble ? materials.crumbleSide : materials.side,
        0,
        -h + bodyHeight / 2,
        0,
        p.w - 0.02,
        bodyHeight,
        p.d - 0.02,
      );
      block(platform, materials.deep, 0, -h + 0.059, 0, p.w * 1.004, 0.12, p.d * 1.004);
      const surfaceMaterial = p.spring
        ? materials.spring
        : p.crumble
          ? materials.crumble
          : moving
            ? materials.moving
            : materials.surface;
      const cap = place(platform, chamfered(p.w + 0.035, p.d + 0.035, capThickness, 0.15), surfaceMaterial, 0, 0, 0);
      const rim = p.crumble ? materials.crumbleEdge : special ? materials.rail : materials.rim;
      block(platform, rim, 0, -0.075, -p.d / 2 - 0.025, Math.max(0.1, p.w - 0.27), 0.09, 0.04);
      block(platform, rim, p.w / 2 + 0.025, -0.075, 0, 0.04, 0.09, Math.max(0.1, p.d - 0.27));

      if (moving || p.spring) {
        ring(platform, materials.rail, 0, 0.013, 0, Math.min(p.w, p.d) * 0.3, true);
        const span = Math.min(p.w, p.d) * 0.15;
        for (let n = -1; n <= 1; n += 2) {
          if (p.spring) place(platform, assets.gem, materials.rail, n * span, 0.02, 0, 0.12, 0.015, 0.22);
          else block(platform, materials.rail, n * p.w * 0.34, 0.012, 0, 0.07, 0.022, p.d * 0.66);
        }
      } else if (p.crumble) {
        for (let j = 0; j < 3; j++) {
          const line = block(
            platform,
            materials.crumbleSide,
            (j - 1) * p.w * 0.23,
            0.012,
            (j - 1) * p.d * 0.19,
            p.w * 0.22,
            0.021,
            0.035,
          );
          line.rotation.y = (j % 2 ? -1 : 1) * 0.7;
        }
      } else if (p.w >= 3 && p.d >= 3) {
        for (let k = 0; k < 4; k++) {
          const seed = i * 7 + k;
          const x = (k % 2 ? 1 : -1) * (p.w / 2 - 0.31 - hash(seed + 82) * 0.25);
          const z = (hash(seed + 33) - 0.5) * (p.d - 0.58);
          const size = 0.045 + hash(seed) * 0.1;
          place(
            platform,
            assets.orb,
            k % 3 === 0 ? materials.accent : materials.rim,
            x,
            0.027,
            z,
            size,
            size * 0.45,
            size * 1.6,
          );
        }
      }
      if (moving) {
        const m = p.motion;
        const dx = m.x ?? 0;
        const dy = m.y ?? 0;
        const dz = m.z ?? 0;
        const railLength = Math.hypot(dx, dy, dz);
        const points = [];
        const railY = p.y - 0.21;
        const geometry = new T.BufferGeometry();
        const count = Math.max(7, Math.ceil(railLength * 5));
        for (let j = 0; j <= count; j++) {
          const t = j / count;
          points.push(new T.Vector3(p.x + dx * t, railY + dy * t, p.z + dz * t));
        }
        geometry.setFromPoints(points);
        stageGeometries.add(geometry);
        const guide = new T.Line(geometry, materials.guide);
        guide.computeLineDistances();
        stage.add(guide);
        for (const t of [0, 1]) {
          ring(stage, materials.guideRing, p.x + dx * t, railY + dy * t, p.z + dz * t, 0.45, true);
        }
      }
      return { platform, cap, surfaceMaterial };
    }

    function makeSpikeTeeth(positions, dynamic = false) {
      if (!positions.length) return null;
      const teeth = new T.InstancedMesh(assets.spike, materials.spike, positions.length);
      const tips = new T.InstancedMesh(assets.spike, materials.spikeTip, positions.length);
      if (dynamic) {
        teeth.instanceMatrix.setUsage(T.DynamicDrawUsage);
        tips.instanceMatrix.setUsage(T.DynamicDrawUsage);
      }
      stage.add(teeth, tips);
      return { teeth, tips, positions };
    }

    function moveSpikeTeeth(meshes, extension) {
      if (!meshes) return;
      const { teeth, tips, positions } = meshes;
      teeth.visible = extension > 0.015;
      tips.visible = teeth.visible;
      if (!teeth.visible) return;
      positions.forEach(([x, y, z, w, height, d], i) => {
        const h = height * extension;
        dummy.position.set(x, y + h / 2, z);
        dummy.rotation.set(0, Math.PI / 6, 0);
        dummy.scale.set(w, h, d);
        dummy.updateMatrix();
        teeth.setMatrixAt(i, dummy.matrix);
        dummy.position.y += h * 0.34;
        dummy.scale.set(w * 0.37, h * 0.34, d * 0.37);
        dummy.updateMatrix();
        tips.setMatrixAt(i, dummy.matrix);
      });
      teeth.instanceMatrix.needsUpdate = true;
      tips.instanceMatrix.needsUpdate = true;
    }

    function makeSpikes(spikes) {
      const staticPositions = [];
      const timed = [];
      spikes.forEach((spike, index) => {
        const positions = spike.pulse ? [] : staticPositions;
        const columns = Math.max(1, Math.round(spike.w * 1.6));
        const rows = Math.max(1, Math.round(spike.d * 1.6));
        const h = spike.h ?? globalThis.NiuPlatformer?.tuning.spikeHeight ?? 0.75;
        const w = spike.w / columns;
        const d = spike.d / rows;
        const plate = block(stage, materials.hazardPlate, spike.x, spike.y + 0.035, spike.z, spike.w, 0.07, spike.d);
        const line = block(
          stage,
          materials.hazardLine,
          spike.x,
          spike.y + 0.068,
          spike.z - spike.d / 2,
          spike.w,
          0.034,
          0.045,
        );
        for (let c = 0; c < columns; c++) {
          for (let r = 0; r < rows; r++) {
            positions.push([
              spike.x - spike.w / 2 + (c + 0.5) * w,
              spike.y,
              spike.z - spike.d / 2 + (r + 0.5) * d,
              w * 0.92,
              h,
              d * 0.92,
            ]);
            if (spike.pulse) {
              place(
                stage,
                assets.cylinder,
                materials.socket,
                positions.at(-1)[0],
                spike.y + 0.07,
                positions.at(-1)[2],
                w * 0.31,
                0.028,
                d * 0.31,
              );
            }
          }
        }
        if (spike.pulse) {
          timed.push({ index, plate, line, meshes: makeSpikeTeeth(positions, true), extension: 1 });
        }
      });
      moveSpikeTeeth(makeSpikeTeeth(staticPositions), 1);
      for (const timedSpike of timed) moveSpikeTeeth(timedSpike.meshes, 1);
      return timed;
    }

    function makePrize(coin) {
      const prize = new T.Group();
      prize.position.set(coin.x, coin.y, coin.z);
      if (coin.star) {
        place(prize, assets.gem, materials.gem, 0, 0, 0, 0.33, 0.46, 0.29);
        ring(prize, materials.gemOrbit, 0, 0, 0, 0.44, true).rotation.y = 0.38;
      } else {
        place(prize, assets.coin, materials.coin, 0, 0, 0).rotation.x = Math.PI / 2;
        place(prize, assets.seal, materials.coinCenter, 0, 0, 0).rotation.x = Math.PI / 2;
        ring(prize, materials.coinRim, 0, 0, 0.047, 0.215);
        ring(prize, materials.coinRim, 0, 0, -0.047, 0.215);
      }
      stage.add(prize);
      return prize;
    }

    function makeBeacon(checkpoint) {
      const group = new T.Group();
      group.position.set(checkpoint.x, checkpoint.y, checkpoint.z);
      place(group, assets.cylinder, materials.stone, 0, 0.06, 0, 0.72, 0.12, 0.72);
      const orbit = ring(group, materials.inactive, 0, 0.13, 0, 0.58, true);
      const gem = place(group, assets.gem, materials.inactive, 0, 0.83, 0, 0.29, 0.49, 0.29);
      const beam = place(group, assets.cylinder, materials.beaconBeam, 0, 1.36, 0, 0.35, 2.6, 0.35);
      const cap = ring(group, materials.inactive, 0, 0.7, 0, 0.45);
      cap.rotation.set(0.72, 0.1, 0.2);
      stage.add(group);
      return { gem, orbit, beam, cap };
    }

    function makeRelay(relay) {
      const group = new T.Group();
      group.position.set(relay.x, relay.y, relay.z);
      const footing = place(group, assets.cylinder, materials.stone, 0, 0.065, 0, 0.72, 0.13, 0.72);
      footing.rotation.y = Math.PI / 12;
      const base = ring(group, materials.relayDormant, 0, 0.14, 0, 0.57, true);
      const pedestal = place(group, assets.cylinder, materials.stone, 0, 0.38, 0, 0.27, 0.53, 0.27);
      pedestal.rotation.y = Math.PI / 12;
      const marker = new T.Group();
      marker.position.y = 1.03;
      group.add(marker);
      const bell = place(marker, assets.bell, materials.relayBronze, 0, 0, 0, 1.13);
      const handle = ring(marker, materials.relayDormant, 0, 0.31, 0, 0.102);
      const lip = ring(marker, materials.relayDormant, 0, -0.18, 0, 0.28, true);
      const clapper = place(marker, assets.orb, materials.relayDormant, 0, -0.22, 0, 0.094);
      const beam = place(group, assets.cylinder, materials.relayBeam, 0, 1.25, 0, 0.34, 2.5, 0.34);
      stage.add(group);
      return { marker, bell, handle, lip, clapper, base, beam };
    }

    function makeWind(volume, id) {
      const direction = new T.Vector3(volume.vx ?? 0, volume.vy ?? 0, volume.vz ?? 0);
      const speed = direction.length();
      if (speed > 0) direction.normalize();
      else direction.y = 1;
      const count = 24;
      const positions = new Float32Array(count * 6);
      const geo = new T.BufferGeometry();
      const attr = new T.BufferAttribute(positions, 3);
      attr.setUsage(T.DynamicDrawUsage);
      geo.setAttribute("position", attr);
      stageGeometries.add(geo);
      const streaks = new T.LineSegments(geo, materials.wind);
      streaks.frustumCulled = false;
      stage.add(streaks);
      const extent = new T.Vector3(volume.w, volume.h, volume.d);
      const center = new T.Vector3(volume.x, volume.y + volume.h / 2, volume.z);
      const seeds = Array.from({ length: count }, (_, i) => {
        const offset = i + id * count;
        return new T.Vector3(hash(offset + 109), hash(offset + 28), hash(offset + 203));
      });
      const ringDepth = volume.d * 0.32;
      ring(stage, materials.windFloor, volume.x, volume.y + 0.035, volume.z, ringDepth, true).scale.x = volume.w * 0.32;
      return { center, extent, direction, speed, seeds, attr };
    }

    function makeGoal(goal) {
      const group = new T.Group();
      group.position.set(goal.x, goal.y, goal.z);
      const finale = Boolean(goal.finale);
      place(group, assets.cylinder, materials.stone, 0, 0.04, 0, 1.25, 0.08, 1.08);
      ring(group, materials.rail, 0, 0.1, 0, 0.99, true).scale.z = 1.1;
      for (let side = -1; side <= 1; side += 2) {
        block(group, materials.stone, side * 1.13, 0.82, 0, 0.26, 1.48, 0.31);
        block(group, materials.goalEdge, side * 1.13, 0.77, -0.17, 0.07, 1.23, 0.027);
        place(group, assets.gem, materials.goalEdge, side * 1.13, 1.73, 0, 0.17, 0.31, 0.17);
      }
      const portal = ring(group, materials.goalEdge, 0, 1.22, 0, 1.12);
      const frame = ring(group, materials.goalFrame, 0, 1.22, 0.022, 1.21);
      frame.scale.z = 1.8;
      const rim = ring(group, materials.rail, 0, 1.22, -0.03, 1.02);
      const field = place(group, assets.cylinder, materials.goalField, 0, 1.22, 0.02, 1.02, 0.026, 1.02);
      field.rotation.x = Math.PI / 2;
      const crownY = finale ? 3.38 : 2.68;
      const crown = place(group, assets.bell, materials.relayGold, 0, crownY, 0, finale ? 2.55 : 1.3);
      if (finale) {
        const halo = ring(group, materials.goalEdge, 0, crownY - 0.12, 0.06, 1.41);
        halo.scale.y = 0.78;
        const lip = ring(crown, materials.goalEdge, 0, -0.18, 0, 0.28, true);
        lip.scale.z *= 0.65;
        place(crown, assets.orb, materials.goalEdge, 0, -0.238, 0, 0.11);
        for (const d of [-1, 1]) {
          place(group, assets.gem, materials.rail, d * 1.61, 2.24, 0.06, 0.16, 0.39, 0.12);
          place(group, assets.gem, materials.goalEdge, d * 1.31, 2.57, 0.04, 0.1, 0.2, 0.09);
        }
      }
      const locks = new T.Group();
      locks.position.set(0, 1.22, -0.12);
      group.add(locks);
      for (const y of [-0.31, 0.31]) {
        block(locks, materials.closedRim, 0, y, 0, 1.9, 0.12, 0.06);
      }
      place(locks, assets.gem, materials.closedRim, 0, 0, -0.06, 0.28, 0.36, 0.12);
      stage.add(group);
      return { portal, rim, field, crown, crownY, locks, finale };
    }

    function disposeMaterial(material) {
      material.map?.dispose();
      material.dispose();
    }

    function destroyStage() {
      if (!stage) return;
      scene.remove(stage);
      stage.traverse((child) => {
        if (child.isInstancedMesh) child.dispose();
      });
      stageGeometries.forEach((geometry) => geometry.dispose());
      Object.values(materials).forEach(disposeMaterial);
      stage = null;
    }

    function load(level) {
      destroyStage();
      const themeName = themes[level.theme] ? level.theme : level.theme === "server" ? "core" : "meadow";
      const mood = level.atmosphere ?? {};
      const palette = themes[themeName];
      const weatherSeed = Array.from(level.id ?? level.theme ?? "").reduce(
        (seed, letter) => seed * 1.28 + letter.charCodeAt(0),
        7,
      );
      const warmth = hash(weatherSeed);
      currentTheme = {
        ...palette,
        horizon:
          mood.horizon ??
          color
            .setHex(palette.horizon)
            .lerp(dawnHorizon, warmth * 0.072)
            .getHex(),
        zenith:
          mood.zenith ??
          color
            .setHex(palette.zenith)
            .lerp(dawnSky, warmth * 0.1)
            .getHex(),
        light:
          mood.light ??
          color
            .setHex(palette.light)
            .lerp(dawnLight, warmth * 0.12)
            .getHex(),
      };
      vistaRecord = getVista(themeName);
      vistaName = themeName;
      delete canvas.dataset.vista;
      vistaStrength = clamp(mood.vistaStrength ?? 1, 0, 1);
      vistaAnchor = level.spawn.z;
      vistaUniforms.vista.value = vistaRecord.ready ? vistaRecord.texture : vistaFallback;
      vistaUniforms.vistaStrength.value = vistaRecord.ready ? vistaStrength : 0;
      vistaUniforms.dusk.value = 0;
      const c = currentTheme;
      const fog = new T.Fog(c.horizon, mood.fogNear ?? 24, mood.fogFar ?? 77);
      scene.fog = fog;
      sun.color.setHex(c.light);
      stage = new T.Group();
      stageGeometries = new Set();
      materials = {
        surface: texturedSurface(c.terrain, themeName),
        side: texturedSurface(c.side, "side"),
        deep: surface(c.deep),
        rim: surface(c.rim),
        stone: surface(c.deep),
        accent: surface(c.accent),
        moving: surface(0x4cb8c5, 0x15596c),
        rail: luminous(0xa1ffed),
        guide: new T.LineDashedMaterial({
          color: 0xa1ffed,
          dashSize: 0.32,
          gapSize: 0.22,
          opacity: 0.72,
          transparent: true,
        }),
        guideRing: luminous(0xa1ffed, { transparent: true, opacity: 0.65 }),
        spring: surface(0x2ab3a2, 0x1a625d),
        crumble: surface(0xd7a275),
        crumbleSide: surface(0x8b5448),
        crumbleEdge: luminous(0xffc27c),
        crumbleWarn: surface(0xf9996c, 0xd53624),
        distant: surface(c.distant),
        distantGlow: luminous(c.accent, { opacity: 0.65, transparent: true }),
        scenery: scenerySurface(),
        cloud: luminous(c.cloud),
        spike: surface(0xf95069, 0x7e1839),
        spikeTip: surface(0xffd59b),
        hazardPlate: surface(0xa62d50),
        hazardLine: luminous(0xffaa67),
        hazardIdle: surface(0x4c4154),
        hazardWarning: surface(0xbc6f39, 0xea8d25),
        hazardWarningLine: luminous(0xffdf75),
        socket: surface(0x2b2537),
        gem: surface(0x80ffe7, 0x239e92),
        gemOrbit: luminous(0x9bfff8),
        coin: surface(0xffc843, 0x9e5300),
        coinCenter: surface(0xf5a02d, 0x713900),
        coinRim: luminous(0xffe99f),
        active: luminous(0x86ffcf),
        inactive: luminous(0xbab0ff),
        beaconBeam: luminous(0x77ffe2, { transparent: true, opacity: 0.19, depthWrite: false }),
        relayDormant: luminous(0xd2a064),
        relayActive: luminous(0xffdb69),
        relayBronze: surface(0xa4784d),
        relayGold: surface(0xffc249, 0x9f4a00),
        relayBeam: luminous(0xffbc4f, { transparent: true, opacity: 0.16, depthWrite: false }),
        wind: new T.LineBasicMaterial({ color: 0x9dfffa, opacity: 0.58, transparent: true, depthWrite: false }),
        windFloor: luminous(0x9dfffa, { opacity: 0.45, transparent: true, depthWrite: false }),
        goalFrame: surface(0xb38347, 0x503517),
        goalEdge: luminous(0xffe7a4),
        goalField: luminous(0xa8ffdf, { transparent: true, opacity: 0.11, depthWrite: false }),
        closedRim: luminous(0xf48a8e),
        closedField: luminous(0xd84373, { transparent: true, opacity: 0.18, depthWrite: false }),
      };
      sky = makeSky(c);
      backdrop = makeBackdrop(level);
      backdrop.visible = vistaUniforms.vistaStrength.value <= 0.42;
      makeScenery(level, themeName);
      atmosphere = makeAtmosphere(level, themeName);
      platforms = level.platforms.map(makePlatform);
      retractingSpikes = makeSpikes(level.spikes);
      prizes = level.coins.map(makePrize);
      beacons = level.checkpoints.map(makeBeacon);
      relays = (level.relays ?? []).map(makeRelay);
      winds = (level.winds ?? []).map(makeWind);
      exit = makeGoal(level.goal);
      scene.add(stage);
      particles.length = 0;
      clearRings();
      clock = 0;
      footfall = 0;
      flip = 0;
      squash = 0;
      shake = 0;
      boost = 0;
      restored = false;
      dawnTime = 0;
      snapCamera = true;
      facingNode.rotation.y = level.spawn.facing ?? 0;
    }

    function addBurst(event, count, colors, spread, lift, gravity, size, duration, yOffset = 0) {
      count = reducedMotion ? Math.ceil(count * 0.45) : count;
      for (let i = 0; i < count; i++) {
        if (particles.length === PARTICLE_CAP) particles.shift();
        const angle = Math.random() * TAU;
        const power = spread * (0.25 + Math.random() * 0.75);
        const life = duration * (0.55 + Math.random() * 0.45);
        particles.push({
          x: event.x + Math.sin(angle) * 0.12,
          y: event.y + yOffset,
          z: event.z + Math.cos(angle) * 0.12,
          vx: Math.sin(angle) * power,
          vy: lift * (0.4 + Math.random() * 0.8),
          vz: Math.cos(angle) * power,
          gravity,
          life,
          total: life,
          size: size * (0.6 + Math.random() * 0.8),
          spin: angle + i,
          color: colors[i % colors.length],
        });
      }
    }

    function removeRing(index) {
      const [pulse] = rings.splice(index, 1);
      scene.remove(pulse.mesh);
      pulse.mesh.material.dispose();
    }

    function clearRings() {
      while (rings.length) removeRing(rings.length - 1);
    }

    function addPulse(event, colorValue, duration, radius) {
      if (rings.length === 12) removeRing(0);
      const material = luminous(colorValue, { transparent: true, depthWrite: false });
      const mesh = ring(scene, material, event.x, event.y + 0.06, event.z, 0.18, true);
      rings.push({ mesh, time: 0, duration, radius });
    }

    function effects(events) {
      for (const event of events) {
        switch (event.type) {
          case "jump":
            addBurst(event, 8, [0xffffcd, currentTheme.rim], 1.55, 0.9, 4, 0.09, 0.35, 0.05);
            break;
          case "doubleJump":
            flip = 0.47;
            addBurst(event, 20, [0xa3fbff, 0xffe59c, 0xffffff], 3.7, 0.9, 4, 0.105, 0.53, 0.14);
            addPulse(event, 0x9cfcff, 0.35, 1.5);
            break;
          case "spring":
            boost = 0.34;
            addBurst(event, 26, [0x8affd7, 0x65c3ff, 0xe4fff6], 2.5, 5.5, 9, 0.095, 0.74, 0.03);
            addPulse(event, 0xa2ffdd, 0.48, 2.1);
            break;
          case "land":
            if (event.speed < 3) break;
            flip = 0;
            squash = 0.18;
            addBurst(
              event,
              clamp(Math.round(event.speed * 1.2), 5, 17),
              [currentTheme.rim, 0xffe6bd],
              2.3,
              1.35,
              5,
              0.11,
              0.39,
              0.03,
            );
            if (event.speed > 8) addPulse(event, 0xffe8ce, 0.27, 1.1);
            break;
          case "coin":
            addBurst(
              event,
              event.star ? 27 : 10,
              event.star ? [0x6af9ff, 0xbeffdd, 0xffffff] : [0xffd754, 0xffefaf],
              event.star ? 4.2 : 2.8,
              2.6,
              6,
              0.088,
              event.star ? 0.83 : 0.47,
            );
            if (event.star) addPulse(event, 0x99ffe5, 0.47, 1.45);
            break;
          case "checkpoint":
            addBurst(event, 27, [0x7effb2, 0x9cfff1, 0xffffff], 2.75, 3.1, 4, 0.105, 0.92, 0.25);
            addPulse(event, 0x94ffca, 0.7, 2.25);
            break;
          case "relay":
            addBurst(event, 43, [0xffd256, 0xff9b74, 0xffffdb], 4.3, 4.7, 5, 0.12, 1.15, 0.92);
            addPulse(event, 0xffd375, 0.68, 2.7);
            addPulse({ ...event, y: event.y + 0.7 }, 0xfff1b4, 0.56, 1.9);
            break;
          case "crumble":
            addBurst(event, 14, [0xe6a678, 0x875f5c, 0xffc28f], 2.5, 1.8, 8, 0.13, 0.63);
            break;
          case "death":
            if (event.cause !== "restart") {
              shake = 0.33;
              const hue = event.cause === "spike" ? 0xff6878 : 0xffb17d;
              addBurst(event, 22, [hue, 0xffbe7d, 0xfff7dd], 3.4, 2.2, 7, 0.12, 0.61, 0.32);
              addPulse(event, hue, 0.41, 1.5);
            }
            break;
          case "respawn":
            snapCamera = true;
            flip = 0;
            boost = 0;
            squash = 0;
            addPulse(event, 0x9cf8ed, 0.53, 1.7);
            break;
          case "goal":
            addBurst(
              event,
              exit.finale ? 125 : 78,
              [0xffd756, 0x8dffdd, 0xff8fa2, 0xb6b9ff, 0xfff9d9],
              6,
              7.8,
              8,
              0.13,
              1.6,
              0.5,
            );
            addPulse(event, 0xffe4a0, 0.86, exit.finale ? 5.7 : 3.9);
            if (exit.finale) {
              restored = true;
              addPulse({ ...event, y: event.y + 3.38 }, 0xffee9b, 0.95, 4.2);
            }
            break;
          case "goalLocked":
            addPulse(event, 0xfaa394, 0.56, 1.45);
            break;
        }
      }
    }

    function resize() {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, w < 650 ? 1.4 : 1.65);
      if (w === width && h === height && dpr === pixelRatio) return;
      width = w;
      height = h;
      dpr = pixelRatio;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = camera.aspect < 0.8 ? 56 : 51;
      camera.updateProjectionMatrix();
    }

    function drawPlayer(state, dt) {
      const p = state.player;
      playerNode.position.set(p.x, p.y, p.z);
      playerNode.visible = state.respawn <= 0;
      const speed = Math.hypot(p.vx, p.vz);
      const run = p.grounded ? Math.min(1, speed * 0.22) : 0;
      footfall += speed * dt * 2.55;
      const s = squash > 0 ? Math.sin((squash / 0.18) * Math.PI) : 0;
      const stretch = p.grounded ? 0 : clamp(p.vy * 0.016, -0.09, 0.16);
      const scale = 0.53;
      const bob = p.grounded ? Math.abs(Math.sin(footfall)) * run * 0.065 : 0;
      model.scale.set(scale * (1 + s * 0.16 - stretch * 0.42), scale * (1 - s * 0.22 + stretch), scale);
      model.position.y = bob - 0.65;
      const turn = p.facing - facingNode.rotation.y;
      facingNode.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-dt * 15));
      const pace = Math.sin(footfall);
      tumbleNode.rotation.x =
        flip > 0 && !reducedMotion
          ? TAU * (1 - flip / 0.47)
          : p.grounded
            ? run * 0.13
            : clamp(-p.vy * 0.025, -0.22, 0.18);
      tumbleNode.rotation.z = run * pace * 0.055;
      const { legs, arms, head, tail } = model.userData;
      const swing = p.grounded ? pace * run * 0.59 : 0.32;
      if (legs) {
        legs[0].rotation.x = -swing;
        legs[1].rotation.x = swing;
      }
      if (arms) {
        arms[0].rotation.x = p.grounded ? swing * 0.68 : -1 - boost;
        arms[1].rotation.x = p.grounded ? -swing * 0.68 : 1 + boost;
      }
      if (head) head.rotation.z = Math.sin(clock * 2.8) * 0.055;
      if (tail) tail.rotation.z = 0.73 + Math.sin(clock * 7) * (0.13 + run * 0.14);

      let shadowY = -Infinity;
      for (const platform of state.platforms) {
        if (!platform.active || platform.y > p.y + 0.06 || platform.y <= shadowY) continue;
        if (
          Math.abs(p.x - platform.x) <= platform.w / 2 - 0.04 &&
          Math.abs(p.z - platform.z) <= platform.d / 2 - 0.04
        ) {
          shadowY = platform.y;
        }
      }
      shadow.visible = playerNode.visible && Number.isFinite(shadowY) && p.y - shadowY < 5;
      if (shadow.visible) {
        const altitude = p.y - shadowY;
        const size = 0.58 + altitude * 0.057;
        shadow.scale.set(size, size * 0.78, 1);
        shadow.position.set(p.x, shadowY + 0.021, p.z);
        shadeMat.uniforms.strength.value = Math.max(0.08, 0.58 - altitude * 0.095);
      }
    }

    function drawTerrain(state) {
      state.platforms.forEach((p, i) => {
        const { platform, cap, surfaceMaterial } = platforms[i];
        platform.visible = p.active !== false;
        if (!platform.visible) return;
        const stress = p.crumbleTime ?? 0;
        const shakeAmount = reducedMotion ? 0 : Math.min(stress, 0.7) * 0.08;
        platform.position.set(p.x + Math.sin(stress * 62) * shakeAmount, p.y, p.z);
        platform.rotation.z = Math.sin(stress * 52) * shakeAmount * 0.45;
        const warning = stress > 0 && (reducedMotion || Math.floor(stress * 20) % 2 === 0);
        cap.material = warning ? materials.crumbleWarn : surfaceMaterial;
      });

      state.coins.forEach((c, i) => {
        const prize = prizes[i];
        prize.visible = !c.collected;
        if (!prize.visible) return;
        prize.position.y = c.y + Math.sin(clock * 3.9 + i * 0.43) * (c.star ? 0.13 : 0.07);
        prize.rotation.y = clock * (c.star ? 1.75 : 2.85) + i * 0.4;
      });

      state.level.checkpoints.forEach((checkpoint, i) => {
        const beacon = beacons[i];
        const active = !!state.checkpoint && state.checkpoint.x === checkpoint.x && state.checkpoint.z === checkpoint.z;
        const material = active ? materials.active : materials.inactive;
        beacon.gem.material = material;
        beacon.orbit.material = material;
        beacon.cap.material = material;
        beacon.beam.visible = active;
        beacon.gem.rotation.y = clock * (active ? 2.3 : 1.55);
        beacon.gem.position.y = 0.8 + Math.sin(clock * 4 + i) * 0.1;
        beacon.cap.rotation.z = clock * 0.75;
      });

      for (const timedSpike of retractingSpikes) {
        const live = state.spikes?.[timedSpike.index];
        if (!live) continue;
        if (timedSpike.extension !== live.extension) {
          timedSpike.extension = live.extension;
          moveSpikeTeeth(timedSpike.meshes, live.extension);
        }
        timedSpike.plate.material =
          live.extension >= 0.65
            ? materials.hazardPlate
            : live.warning > 0
              ? materials.hazardWarning
              : materials.hazardIdle;
        timedSpike.line.material = live.warning > 0 ? materials.hazardWarningLine : materials.hazardLine;
      }

      const activeRelays = state.relaysActivated ?? 0;
      for (let i = 0; i < relays.length; i++) {
        const { marker, bell, handle, lip, clapper, base, beam } = relays[i];
        const active = state.relays?.[i]?.active;
        const material = active ? materials.relayActive : materials.relayDormant;
        handle.material = material;
        lip.material = material;
        clapper.material = material;
        base.material = material;
        bell.material = active ? materials.relayGold : materials.relayBronze;
        beam.visible = Boolean(active);
        marker.rotation.z = Math.sin(clock * (active ? 4 : 2) + i) * (active ? 0.18 : 0.09);
        marker.position.y = 1.03 + Math.sin(clock * 3.5 + i) * 0.095;
      }
      const locked = activeRelays < relays.length;
      exit.locks.visible = locked;
      exit.portal.material = locked ? materials.closedRim : materials.goalEdge;
      exit.rim.material = locked ? materials.relayDormant : materials.rail;
      exit.field.material = locked ? materials.closedField : materials.goalField;
      exit.crown.material = locked ? materials.relayBronze : materials.relayGold;
      exit.rim.rotation.y = Math.sin(clock * 1.5) * 0.12;
      exit.crown.rotation.z = Math.sin(clock * 3.5) * (locked ? 0.04 : 0.19);
      exit.crown.position.y = exit.crownY + Math.sin(clock * 3.1) * 0.08;
      materials.goalField.opacity = 0.11 + Math.sin(clock * 2) * 0.035;
    }

    function drawWind() {
      for (const { center, extent, direction, speed, seeds, attr } of winds) {
        const flow = clock * (reducedMotion ? 0.75 : 2.5 + Math.sqrt(speed) * 1.15);
        const dx = (flow * direction.x) / extent.x;
        const dy = (flow * direction.y) / extent.y;
        const dz = (flow * direction.z) / extent.z;
        for (let i = 0; i < seeds.length; i++) {
          const seed = seeds[i];
          const x = center.x + (((((seed.x + dx) % 1) + 1) % 1) - 0.5) * extent.x;
          const y = center.y + (((((seed.y + dy) % 1) + 1) % 1) - 0.5) * extent.y;
          const z = center.z + (((((seed.z + dz) % 1) + 1) % 1) - 0.5) * extent.z;
          const length = 0.35 + seed.y * 0.43;
          attr.setXYZ(i * 2, x, y, z);
          attr.setXYZ(i * 2 + 1, x - direction.x * length, y - direction.y * length, z - direction.z * length);
        }
        attr.needsUpdate = true;
      }
    }

    function drawEffects(dt) {
      let visible = 0;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= p.gravity * dt;
        p.spin += dt * 7;
        const size = p.size * Math.min(1, (p.life / p.total) * 1.9);
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.spin, p.spin * 0.65, 0);
        dummy.scale.set(size, size * 1.35, size);
        dummy.updateMatrix();
        sparkMesh.setMatrixAt(visible, dummy.matrix);
        sparkMesh.setColorAt(visible, color.setHex(p.color));
        visible++;
      }
      sparkMesh.count = visible;
      if (visible > 0) {
        sparkMesh.instanceMatrix.needsUpdate = true;
        sparkMesh.instanceColor.needsUpdate = true;
      }

      for (let i = rings.length - 1; i >= 0; i--) {
        const pulse = rings[i];
        pulse.time += dt;
        const life = pulse.time / pulse.duration;
        if (life >= 1) {
          removeRing(i);
          continue;
        }
        pulse.mesh.scale.setScalar(0.18 + (1 - (1 - life) ** 2) * pulse.radius);
        pulse.mesh.material.opacity = (1 - life) ** 1.4 * 0.8;
      }
    }

    function drawCamera(p, dt) {
      const narrow = clamp((1 - camera.aspect) * 1.1, 0, 0.66);
      target.set(p.x + p.vx * 0.17, p.y, p.z + Math.max(0, p.vz) * 0.14);
      if (snapCamera) {
        follow.copy(target);
        snapCamera = false;
      } else {
        const damping = 1 - Math.exp(-dt * 7);
        follow.x += (target.x - follow.x) * damping;
        follow.y += (target.y - follow.y) * (1 - Math.exp(-dt * 4.2));
        follow.z += (target.z - follow.z) * damping;
      }
      const motion = reducedMotion ? 0 : shake * 0.26;
      const jitter = Math.sin(clock * 126) * motion;
      const groundY = ground.position.y + 3.4;
      look.set(follow.x, Math.max(groundY, follow.y) + 1.2, follow.z + 5.25);
      camera.position.set(
        follow.x + jitter,
        Math.max(groundY, follow.y) + 9.1 + narrow * 3.8 + jitter * 0.44,
        follow.z - 9.9 - narrow * 4.2,
      );
      camera.lookAt(look);
      sky.position.copy(camera.position);
      const offset = clamp((follow.z - vistaAnchor) * 0.0002, 0, 0.018);
      vistaUniforms.vistaShift.value.set(follow.x * 0.0022 + offset, clamp(follow.y * 0.0038, -0.025, 0.045));
    }

    function drawVista(dt) {
      if (!vistaRecord.ready) return;
      const uniform = vistaUniforms.vistaStrength;
      vistaUniforms.vista.value = vistaRecord.texture;
      vistaUniforms.vistaAspect.value = vistaRecord.aspect;
      uniform.value = Math.min(vistaStrength, uniform.value + dt * 2.9);
      backdrop.visible = uniform.value <= 0.42;
      if (canvas.dataset.vista !== vistaName) canvas.dataset.vista = vistaName;
    }

    function drawDawn(dt) {
      if (!restored) return;
      dawnTime = Math.min(dawnTime + dt / 0.82, 1);
      const blend = 1 - (1 - dawnTime) ** 2;
      vistaUniforms.dusk.value = blend;
      sky.material.uniforms.zenith.value.setHex(currentTheme.zenith).lerp(dawnSky, blend);
      sky.material.uniforms.horizon.value.setHex(currentTheme.horizon).lerp(dawnHorizon, blend * 0.84);
      sky.material.uniforms.sun.value.setHex(currentTheme.light).lerp(dawnLight, blend);
      ground.material.uniforms.horizon.value.copy(sky.material.uniforms.horizon.value);
      ground.material.uniforms.ripple.value.setHex(currentTheme.ripple).lerp(dawnLight, blend * 0.66);
      scene.fog.color.copy(sky.material.uniforms.horizon.value);
      sun.color.setHex(currentTheme.light).lerp(dawnLight, blend);
      exit.crown.rotation.z = Math.sin(dawnTime * 24) * (1 - dawnTime) * 0.42;
    }

    function render(state, dt = 0) {
      if (!stage) return;
      resize();
      clock += dt;
      flip = Math.max(0, flip - dt);
      squash = Math.max(0, squash - dt);
      shake = Math.max(0, shake - dt);
      boost = Math.max(0, boost - dt);
      ground.material.uniforms.clock.value = clock;
      atmosphere.time.value = clock * (reducedMotion ? 0.25 : 1);
      atmosphere.height.value = height * dpr;
      drawTerrain(state);
      drawDawn(dt);
      drawWind();
      drawPlayer(state, dt);
      drawEffects(dt);
      drawCamera(state.player, dt);
      drawVista(dt);
      renderer.render(scene, camera);
    }

    function dispose() {
      destroyStage();
      clearRings();
      for (const geometry of Object.values(assets)) geometry.dispose();
      sparkMesh.dispose();
      sparkMaterial.dispose();
      shadeGeo.dispose();
      shadeMat.dispose();
      vistaFallback.dispose();
      for (const { texture } of vistas.values()) texture.dispose();
      const geometry = new Set();
      const materials = new Set();
      model.traverse((child) => {
        if (!child.isMesh) return;
        geometry.add(child.geometry);
        materials.add(child.material);
      });
      geometry.forEach((item) => item.dispose());
      materials.forEach(disposeMaterial);
      renderer.dispose();
    }

    return { load, render, effects, dispose };
  }

  globalThis.NiuJourneyRenderer = { create };
})();
