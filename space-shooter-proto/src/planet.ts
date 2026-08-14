import * as THREE from 'three';
import { fbm2, fbm3 } from './noise';

export type PlanetStyle = 'earth' | 'rock' | 'gas';

export interface Planet {
  group: THREE.Group;
  radius: number;
  update: (dt: number) => void;
}

// ---------- 星球表面纹理（等距圆柱展开，3D 噪声采样，按风格分支） ----------

function makePlanetTexture(w: number, h: number, seed: number, style: PlanetStyle): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(w, h);
  const d = img.data;
  const p = new THREE.Vector3();
  const tmp = new THREE.Color();

  // 地球调色板
  const earthOceanD = new THREE.Color(0x0a2a5e);
  const earthOceanS = new THREE.Color(0x1a5fa8);
  const earthBeach = new THREE.Color(0xc2b280);
  const earthGrass = new THREE.Color(0x3e7a3a);
  const earthForest = new THREE.Color(0x2f5d28);
  const earthRock = new THREE.Color(0x6b6255);
  const earthSnow = new THREE.Color(0xe8eef2);
  // 岩石行星（火星/水星）
  const rockDark = new THREE.Color(0x6e2c26);
  const rockMid = new THREE.Color(0xa4533a);
  const rockLight = new THREE.Color(0xc97b4a);
  const rockPale = new THREE.Color(0xe0c9a3);
  // 气态巨行星（木星/金星）
  const gasA = new THREE.Color(0xc8a06a);
  const gasB = new THREE.Color(0xf0e0bc);
  const gasDark = new THREE.Color(0x8a6a4a);

  for (let y = 0; y < h; y++) {
    const lat = (0.5 - y / h) * Math.PI; // -PI/2..PI/2
    const sy = Math.sin(lat);
    const cy = Math.cos(lat);
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * Math.PI * 2;
      p.set(cy * Math.cos(lon), sy, cy * Math.sin(lon));

      if (style === 'earth') {
        let e = fbm3(p.x * 2.6, p.y * 2.6, p.z * 2.6, seed, 6);
        e = Math.pow(Math.max(0, e), 1.4);
        if (Math.abs(sy) > 0.78) tmp.copy(earthSnow);
        else if (e < 0.5) tmp.copy(earthOceanD).lerp(earthOceanS, e / 0.5);
        else if (e < 0.55) tmp.copy(earthBeach);
        else if (e < 0.62) tmp.copy(earthGrass).lerp(earthForest, (e - 0.55) / 0.07);
        else if (e < 0.7) tmp.copy(earthForest).lerp(earthRock, (e - 0.62) / 0.08);
        else if (e < 0.8) tmp.copy(earthRock);
        else tmp.copy(earthRock).lerp(earthSnow, Math.min(1, (e - 0.8) / 0.2));
      } else if (style === 'rock') {
        let e = fbm3(p.x * 3, p.y * 3, p.z * 3, seed, 5);
        e = Math.pow(Math.max(0, e), 1.3);
        if (e < 0.35) tmp.copy(rockDark).lerp(rockMid, e / 0.35);
        else if (e < 0.6) tmp.copy(rockMid).lerp(rockLight, (e - 0.35) / 0.25);
        else tmp.copy(rockLight).lerp(rockPale, (e - 0.6) / 0.4);
        if (Math.abs(sy) > 0.82) tmp.lerp(rockPale, 0.65); // 极冠
      } else {
        // gas：水平条带 + 扰动
        const n = fbm3(p.x * 2, p.y * 2, p.z * 2, seed, 4);
        const stripe = 0.5 + 0.5 * Math.sin((p.y + (n - 0.5) * 0.6) * 14);
        tmp.copy(gasA).lerp(gasB, THREE.MathUtils.clamp(stripe + (n - 0.5) * 0.5, 0, 1));
        const polar = Math.abs(sy);
        if (polar > 0.7) tmp.lerp(gasDark, (polar - 0.7) * 1.6);
      }

      const i = (y * w + x) * 4;
      d[i] = Math.floor(tmp.r * 255);
      d[i + 1] = Math.floor(tmp.g * 255);
      d[i + 2] = Math.floor(tmp.b * 255);
      d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; // 消除经度接缝
  return t;
}

function makeCloudTexture(w: number, h: number, seed: number): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(w, h);
  const d = img.data;
  const p = new THREE.Vector3();
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - y / h) * Math.PI;
    const sy = Math.sin(lat);
    const cy = Math.cos(lat);
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * Math.PI * 2;
      p.set(cy * Math.cos(lon), sy, cy * Math.sin(lon));
      const n = fbm3(p.x * 3.2, p.y * 3.2, p.z * 3.2, seed, 4);
      const i = (y * w + x) * 4;
      if (n > 0.58) {
        const a = Math.min(1, (n - 0.58) / 0.18);
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = Math.floor(a * 235);
      } else {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 0;
      }
    }
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---------- 大气辉光（菲涅尔叠加，颜色可配） ----------

function makeAtmosphere(r: number, inner: THREE.Color, outer: THREE.Color): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    depthWrite: false,
    uniforms: {
      uInner: { value: inner },
      uOuter: { value: outer },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uInner;
      uniform vec3 uOuter;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
        vec3 col = mix(uInner, uOuter, f);
        gl_FragColor = vec4(col, f * 0.85);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48), mat);
}

// ---------- 组装行星 ----------

export function createPlanet(radius: number, seed: number, style: PlanetStyle = 'earth'): Planet {
  const group = new THREE.Group();

  const surfaceMat = new THREE.MeshStandardMaterial({
    map: makePlanetTexture(1024, 512, seed, style),
    roughness: 1,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), surfaceMat));

  let clouds: THREE.Mesh | null = null;
  if (style === 'earth') {
    const cloudMat = new THREE.MeshLambertMaterial({
      map: makeCloudTexture(512, 256, seed + 99),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.02, 64, 48), cloudMat);
    group.add(clouds);
  }

  if (style === 'earth') group.add(makeAtmosphere(radius * 1.08, new THREE.Color(0x1a5f9e), new THREE.Color(0x7cc4ff)));
  else if (style === 'rock') group.add(makeAtmosphere(radius * 1.05, new THREE.Color(0x5a2a20), new THREE.Color(0xd8926a)));
  else group.add(makeAtmosphere(radius * 1.06, new THREE.Color(0x8a6a3a), new THREE.Color(0xf0d9a8)));

  return {
    group,
    radius,
    update: (dt: number) => {
      if (clouds) clouds.rotation.y += dt * 0.004;
    },
  };
}

// ---------- 土星环（多带 + 稀薄外环，更震撼） ----------

function makeRingTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 2;
  const c = cv.getContext('2d')!;
  const grad = c.createLinearGradient(0, 0, 256, 0);
  // 条带 + 间隙，模拟真实土星环
  const stops: [number, number][] = [
    [0.0, 0.0],
    [0.06, 0.55],
    [0.1, 0.15],
    [0.18, 0.85],
    [0.22, 0.2],
    [0.34, 0.95],
    [0.38, 0.3],
    [0.5, 0.75],
    [0.55, 0.1],
    [0.66, 0.6],
    [0.72, 0.9],
    [0.8, 0.35],
    [0.88, 0.7],
    [0.95, 0.2],
    [1.0, 0.0],
  ];
  for (const [t, a] of stops) grad.addColorStop(t, `rgba(224,206,166,${a})`);
  c.fillStyle = grad;
  c.fillRect(0, 0, 256, 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function addSaturnRings(planet: Planet, inner: number, outer: number): void {
  const makeRingMesh = (i: number, o: number, opacity: number) => {
    const geo = new THREE.RingGeometry(i, o, 128);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const r = v.length();
      uv.setXY(k, (r - i) / (o - i), 0);
    }
    const ring = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: makeRingTexture(),
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    return ring;
  };

  planet.group.add(makeRingMesh(inner, outer, 0.95));
  planet.group.add(makeRingMesh(outer * 1.02, outer * 1.45, 0.3)); // 稀薄外环
  planet.group.rotation.z = 0.42; // 行星轴倾斜
}

// ---------- 月球（绕行星公转的小卫星） ----------

export function createMoon(radius: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + (Math.random() - 0.5) * 0.25);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: makePlanetTexture(256, 128, seed, 'rock'),
    roughness: 1,
  });
  g.add(new THREE.Mesh(geo, mat));
  g.userData.radius = radius;
  return g;
}

// ---------- 小行星带（绕太阳公转的一圈岩石） ----------

export function createAsteroidBelt(inner: number, outer: number, count: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a857c, roughness: 1, flatShading: true });
  const rng = (i: number) => {
    let h = (i * 2654435761 + seed * 40503) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h >>> 0) / 4294967295;
  };
  for (let i = 0; i < count; i++) {
    const angle = rng(i * 2) * Math.PI * 2;
    const r = inner + rng(i * 2 + 1) * (outer - inner);
    const s = 0.6 + rng(i * 3) * 2.4;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat);
    rock.position.set(Math.cos(angle) * r, (rng(i * 5) - 0.5) * 30, Math.sin(angle) * r);
    rock.rotation.set(rng(i * 7) * 3, rng(i * 11) * 3, rng(i * 13) * 3);
    rock.scale.y = 0.5 + rng(i * 17) * 0.7;
    g.add(rock);
  }
  return g;
}

// ---------- 太阳（发光球 + 光晕精灵） ----------

function makeGlowSprite(r: number): THREE.Sprite {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d')!;
  const grad = c.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,214,130,0.95)');
  grad.addColorStop(0.35, 'rgba(255,190,90,0.5)');
  grad.addColorStop(1, 'rgba(255,170,70,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  sprite.scale.set(r * 4.2, r * 4.2, 1);
  return sprite;
}

export function createSun(radius: number): THREE.Group {
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd27a }),
    ),
  );
  g.add(makeGlowSprite(radius));
  return g;
}
