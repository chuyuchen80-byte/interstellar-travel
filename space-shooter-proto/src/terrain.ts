import * as THREE from 'three';
import { fbm2, valueNoise2 } from './noise';

export type TerrainStyle = 'earth' | 'red' | 'gray' | 'yellow' | 'cloud';

export interface SurfaceTerrain {
  mesh: THREE.Mesh;
  water: THREE.Mesh;
  waterLevel: number;
  size: number;
  heightAt: (x: number, z: number) => number;
}

// 山脊噪声：让山脉更锋利
function ridged2(x: number, z: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2(x * f, z * f, seed + i * 101);
    const r = 1 - Math.abs(n * 2 - 1);
    sum += r * r * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

// 程序化地形：多层噪声（大陆 + 山脉 + 细节）+ 按风格着色（地球/火星红/水星灰/金星黄/气态云海）+ 水面
export function createTerrain(
  size: number,
  segments: number,
  seed: number,
  waterLevel: number,
  style: TerrainStyle = 'earth',
  amplitude = 1,
): SurfaceTerrain {
  const isCloud = style === 'cloud';
  const amp = (isCloud ? 18 : style === 'earth' ? 46 : 56) * amplitude;
  const mount = (isCloud ? 0 : style === 'gray' ? 40 : style === 'earth' ? 18 : 26) * amplitude;

  const heightAt = (x: number, z: number): number => {
    const continent = fbm2(x * 0.0035, z * 0.0035, seed, 5) * amp;
    const mountains = ridged2(x * 0.011, z * 0.011, seed + 3, 4) * mount;
    const detail = fbm2(x * 0.045, z * 0.045, seed + 9, 3) * 2.2 * amplitude;
    return Math.max(continent + mountains + detail, waterLevel);
  };

  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  // ---- 按风格渐变着色 ----
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  const snow = new THREE.Color(0xeef2f6);
  const rock = new THREE.Color(0x7d746a);

  const P =
    style === 'cloud'
      ? [0xd8d0c6, 0xf0ece4, 0xc8b090, 0xa08050]
      : style === 'red'
        ? [0x5a2216, 0x8a3b2f, 0xb55a3a, 0xd8946a]
        : style === 'gray'
          ? [0x4a4a50, 0x6e6e76, 0x92929c, 0xc2c2cc]
          : style === 'yellow'
            ? [0x6e5a20, 0xa89040, 0xc9b06a, 0xe6d49a]
            : [0xcbb280, 0x57a04a, 0x2f6b33, 0x7d746a];
  const c1 = new THREE.Color(P[0]);
  const c2 = new THREE.Color(P[1]);
  const c3 = new THREE.Color(P[2]);
  const c4 = new THREE.Color(P[3]);

  const smooth01 = (a: number, b: number, t: number) =>
    THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const slope = 1 - nor.getY(i);
    const n = fbm2(x * 0.05, z * 0.05, seed + 21, 3); // 边界扰动
    const hh = h + (n - 0.5) * (isCloud ? 1.5 : 3);

    const b1 = (isCloud ? 4 : 6) * amplitude;
    const b2 = (isCloud ? 12 : 17) * amplitude;
    const b3 = (isCloud ? 22 : 32) * amplitude;
    const b4 = (isCloud ? 32 : 50) * amplitude;

    if (hh < b1) {
      c.copy(c1);
    } else if (hh < b2) {
      tmp.copy(c1).lerp(c2, smooth01(b1, b2, hh));
      c.copy(tmp);
    } else if (hh < b3) {
      tmp.copy(c2).lerp(c3, smooth01(b2, b3, hh));
      c.copy(tmp);
    } else if (hh < b4) {
      tmp.copy(c3).lerp(c4, smooth01(b3, b4, hh));
      c.copy(tmp);
    } else {
      tmp.copy(c4);
      if (style === 'earth') tmp.lerp(snow, smooth01(b4, b4 + 10, hh));
      else if (style === 'red') tmp.lerp(new THREE.Color(0xe0c9a3), 0.4); // 火星极冠
      c.copy(tmp);
    }
    // 陡坡混入岩石（云海除外）
    if (!isCloud && slope > 0.6) c.lerp(rock, smooth01(0.6, 0.95, slope));
    // 地球低海拔向沙过渡
    if (style === 'earth' && hh < 6) c.lerp(c1, smooth01(6, 3.2, hh));

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  mesh.receiveShadow = true;

  const waterGeo = new THREE.PlaneGeometry(size, size, 8, 8);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshStandardMaterial({
      color: 0x2f8fd0,
      transparent: true,
      opacity: 0.72,
      roughness: 0.15,
      metalness: 0.15,
    }),
  );
  water.position.y = waterLevel;
  water.receiveShadow = true;
  water.visible = waterLevel > 0; // 无水的行星不显示水面

  return { mesh, water, waterLevel, size, heightAt };
}

// ---------- 程序化植被（树 + 岩石），只种在非水域的合适高度 ----------

export function createVegetation(terrain: SurfaceTerrain, seed: number, count = 80): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b33, roughness: 1 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 1, flatShading: true });

  const rng = (i: number) => {
    // 确定性伪随机
    let h = (i * 2654435761 + seed * 40503) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h >>> 0) / 4294967295;
  };

  let trees = 0;
  let rocks = 0;
  const half = terrain.size * 0.46;
  for (let i = 0; i < count * 3 && trees < count * 0.7 && rocks < count * 0.3; i++) {
    const x = (rng(i * 2) * 2 - 1) * half;
    const z = (rng(i * 2 + 1) * 2 - 1) * half;
    const h = terrain.heightAt(x, z);
    if (h < terrain.waterLevel + 0.8 || h > 22) continue;

    const roll = rng(i * 3 + 7);
    if (roll < 0.7 && trees < count * 0.7) {
      // 树：树干 + 双层树冠
      const s = 0.9 + rng(i * 5 + 1) * 1.1;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.18 * s, 1.3 * s, 6), trunkMat);
      trunk.position.y = 0.65 * s;
      trunk.castShadow = true;
      tree.add(trunk);
      const leaf1 = new THREE.Mesh(new THREE.ConeGeometry(0.85 * s, 1.9 * s, 7), leafMat);
      leaf1.position.y = 1.9 * s;
      leaf1.castShadow = true;
      tree.add(leaf1);
      const leaf2 = new THREE.Mesh(new THREE.ConeGeometry(0.6 * s, 1.2 * s, 7), leafMat);
      leaf2.position.y = 2.7 * s;
      leaf2.castShadow = true;
      tree.add(leaf2);
      tree.position.set(x, h, z);
      tree.rotation.y = rng(i * 7 + 3) * Math.PI * 2;
      tree.rotation.z = (rng(i * 7 + 4) - 0.5) * 0.12;
      g.add(tree);
      trees++;
    } else if (rocks < count * 0.3) {
      // 岩石
      const rs = 0.5 + rng(i * 11 + 5) * 1.1;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(rs, 0), rockMat);
      rock.position.set(x, h + rs * 0.25, z);
      rock.rotation.set(rng(i * 13) * 3, rng(i * 13 + 1) * 3, rng(i * 13 + 2) * 3);
      rock.scale.y = 0.55 + rng(i * 17) * 0.4;
      rock.castShadow = true;
      g.add(rock);
      rocks++;
    }
  }
  return g;
}
