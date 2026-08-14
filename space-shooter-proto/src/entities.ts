import * as THREE from 'three';

// ---------- 类型 ----------

export type EnemyKind = 'asteroid' | 'drone';

export interface Enemy {
  obj: THREE.Group;
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  hp: number;
  radius: number;
  kind: EnemyKind;
  fireTimer: number;
  speed: number;
}

// ---------- 程序化像素贴图（Canvas 生成，无外部素材） ----------

function makePixelTexture(draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const size = 32;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, size, size);
  draw(c, size);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

function makeSprite(tex: THREE.Texture, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  s.scale.set(size, size, 1);
  return s;
}

export function makePlayerTexture(): THREE.Texture {
  return makePixelTexture((c) => {
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x, y, w, h);
    };
    px(14, 2, 4, 4, '#0a0a0a'); // 机头
    px(12, 6, 8, 6, '#2ecc71'); // 机身
    px(14, 8, 4, 3, '#a8ffd0'); // 座舱
    px(4, 12, 8, 3, '#1d8a4e'); // 左翼
    px(20, 12, 8, 3, '#1d8a4e'); // 右翼
    px(14, 14, 4, 6, '#2ecc71'); // 机尾
    px(12, 20, 8, 3, '#ffa34d'); // 引擎
    px(6, 18, 3, 4, '#ffa34d'); // 左尾焰
    px(23, 18, 3, 4, '#ffa34d'); // 右尾焰
  });
}

export function makeDroneTexture(): THREE.Texture {
  return makePixelTexture((c) => {
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x, y, w, h);
    };
    px(14, 8, 4, 4, '#ff6b5e'); // 核心
    px(4, 12, 10, 3, '#c0392b'); // 左翼
    px(18, 12, 10, 3, '#c0392b'); // 右翼
    px(14, 14, 4, 5, '#ff6b5e');
    px(12, 19, 3, 3, '#ffd479'); // 警示灯
    px(17, 19, 3, 3, '#ffd479');
  });
}

export function makeAsteroidTexture(): THREE.Texture {
  return makePixelTexture((c) => {
    c.fillStyle = '#8f8575';
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = x - 16;
        const dy = y - 16;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 10 + Math.random() * 5 && Math.random() < 0.75) {
          c.fillStyle = Math.random() < 0.3 ? '#6d6353' : '#8f8575';
          c.fillRect(x, y, 1, 1);
        }
      }
    }
  });
}

export function makeBulletTexture(): THREE.Texture {
  return makePixelTexture((c) => {
    c.fillStyle = '#ffe35c';
    c.fillRect(10, 10, 12, 12);
    c.fillStyle = '#fff6c9';
    c.fillRect(13, 13, 6, 6);
  });
}

// ---------- 玩家探索飞船 ----------

const HULL = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.45, metalness: 0.35 });
const HULL_DARK = new THREE.MeshStandardMaterial({ color: 0x8f98a3, roughness: 0.6, metalness: 0.5 });
const GLASS = new THREE.MeshStandardMaterial({
  color: 0x9fd8ff,
  roughness: 0.1,
  metalness: 0.6,
  emissive: 0x1a4a6a,
  emissiveIntensity: 0.5,
});
const ACCENT = new THREE.MeshStandardMaterial({ color: 0x3e7dd6, roughness: 0.4, metalness: 0.4 });
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa34d, transparent: true, opacity: 0.95 });

export function makePlayerShip(): THREE.Group {
  const g = new THREE.Group();

  // 圆润机身（胶囊）
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 2.8, 5, 14), HULL);
  hull.rotation.x = Math.PI / 2; // 沿 Z 轴
  hull.castShadow = true;
  g.add(hull);

  // 驾驶舱（前部玻璃罩）
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), GLASS);
  cockpit.position.set(0, 0.42, -2.0);
  cockpit.scale.set(1, 0.8, 1.4);
  g.add(cockpit);

  // 前部探照灯（探索船标志）
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  light.position.set(0, 0.15, -3.3);
  g.add(light);

  // 机身装饰环与舱门
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.07, 8, 24), ACCENT);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0, 0.4);
  g.add(ring);
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.08), HULL_DARK);
  hatch.position.set(0, 0, 0.4);
  g.add(hatch);

  // 后掠稳定翼（小圆角，非战斗机大翼）
  const finGeo = new THREE.CylinderGeometry(0.1, 0.28, 2.2, 8);
  const finL = new THREE.Mesh(finGeo, HULL_DARK);
  finL.rotation.z = -Math.PI / 2 - 0.35;
  finL.rotation.x = 0.25;
  finL.position.set(-1.15, 0, 0.8);
  finL.castShadow = true;
  g.add(finL);
  const finR = finL.clone();
  finR.rotation.z = Math.PI / 2 + 0.35;
  finR.rotation.x = -0.25;
  finR.position.set(1.15, 0, 0.8);
  g.add(finR);

  // 尾部引擎舱（双发）
  const nacelleGeo = new THREE.CylinderGeometry(0.42, 0.5, 1.6, 12);
  const engL = new THREE.Mesh(nacelleGeo, HULL_DARK);
  engL.rotation.x = Math.PI / 2;
  engL.position.set(-0.55, -0.15, 2.6);
  engL.castShadow = true;
  g.add(engL);
  const engR = engL.clone();
  engR.position.set(0.55, -0.15, 2.6);
  g.add(engR);

  // 引擎火焰（锥形，存引用供加速动画）
  const flameGeo = new THREE.ConeGeometry(0.34, 1.6, 10);
  const makeFlame = (x: number) => {
    const f = new THREE.Mesh(flameGeo, FLAME);
    f.rotation.x = -Math.PI / 2;
    f.position.set(x, -0.15, 3.3);
    g.add(f);
    return f;
  };
  const flames: THREE.Mesh[] = [makeFlame(-0.55), makeFlame(0.55)];

  const sprite = makeSprite(makePlayerTexture(), 9);
  sprite.visible = false;
  g.add(sprite);

  g.userData.radius = 2.6;
  g.userData.flames = flames;
  return g;
}

// ---------- 敌人 ----------

const ASTEROID_MAT = new THREE.MeshStandardMaterial({ color: 0x8f8575, flatShading: true, roughness: 1 });
const DRONE_MAT = new THREE.MeshStandardMaterial({
  color: 0xe8504a,
  flatShading: true,
  emissive: 0x300a08,
});

export function makeAsteroid(scale = 1): Enemy {
  const geo = new THREE.IcosahedronGeometry(2.0 * scale, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + (Math.random() - 0.5) * 0.55);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, ASTEROID_MAT));

  const sprite = makeSprite(makeAsteroidTexture(), 9 * scale);
  sprite.visible = false;
  g.add(sprite);

  return {
    obj: g,
    sprite,
    vel: new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 8),
    spin: new THREE.Vector3(Math.random() * 2, Math.random() * 2, Math.random() * 2),
    hp: 1,
    radius: 2.6 * scale,
    kind: 'asteroid',
    fireTimer: 0,
    speed: 0,
  };
}

export function makeDrone(): Enemy {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), DRONE_MAT);
  g.add(core);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.8), DRONE_MAT);
  wingL.position.x = -1.6;
  g.add(wingL);
  const wingR = wingL.clone();
  wingR.position.x = 1.6;
  g.add(wingR);

  const sprite = makeSprite(makeDroneTexture(), 5);
  sprite.visible = false;
  g.add(sprite);

  return {
    obj: g,
    sprite,
    vel: new THREE.Vector3(),
    spin: new THREE.Vector3(0.6, 1.4, 0.3),
    hp: 3,
    radius: 1.7,
    kind: 'drone',
    fireTimer: 1.5,
    speed: 10 + Math.random() * 6,
  };
}

// ---------- 子弹池 ----------

export interface Bullet {
  mesh: THREE.Mesh;
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  enemy: boolean;
  active: boolean;
}

export class BulletPool {
  list: Bullet[] = [];

  constructor(scene: THREE.Scene, n: number) {
    const geo = new THREE.BoxGeometry(0.4, 0.4, 1.4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe35c });
    const smat = new THREE.SpriteMaterial({ map: makeBulletTexture(), transparent: true });
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      const sprite = new THREE.Sprite(smat);
      sprite.scale.set(2.2, 2.2, 1);
      mesh.visible = false;
      sprite.visible = false;
      scene.add(mesh);
      scene.add(sprite);
      this.list.push({ mesh, sprite, vel: new THREE.Vector3(), life: 0, enemy: false, active: false });
    }
  }

  fire(pos: THREE.Vector3, dir: THREE.Vector3, speed: number, enemy: boolean): boolean {
    const b = this.list.find((x) => !x.active);
    if (!b) return false;
    b.active = true;
    b.enemy = enemy;
    b.life = 1.6;
    b.mesh.position.copy(pos);
    b.sprite.position.copy(pos);
    b.vel.copy(dir).normalize().multiplyScalar(speed);
    return true;
  }

  update(dt: number, billboard: boolean) {
    for (const b of this.list) {
      if (!b.active) continue;
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.sprite.position.copy(b.mesh.position);
      if (b.life <= 0) {
        b.active = false;
        b.mesh.visible = false;
        b.sprite.visible = false;
      } else {
        b.mesh.visible = !billboard;
        b.sprite.visible = billboard;
      }
    }
  }

  clear() {
    for (const b of this.list) {
      b.active = false;
      b.mesh.visible = false;
      b.sprite.visible = false;
    }
  }
}

// ---------- 爆炸碎片（体素风小方块，池化复用） ----------

export class Debris {
  private items: { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number }[] = [];
  private mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, n = 240) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffa34d, transparent: true });
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
  }

  spawn(pos: THREE.Vector3, count = 14, color = 0xffa34d) {
    this.mat.color.setHex(color);
    let spawned = 0;
    for (const it of this.items) {
      if (it.life > 0) continue;
      it.mesh.position.copy(pos);
      it.mesh.visible = true;
      it.vel.randomDirection().multiplyScalar(6 + Math.random() * 16);
      it.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      it.life = 0.7 + Math.random() * 0.5;
      if (++spawned >= count) break;
    }
  }

  update(dt: number) {
    let any = false;
    let maxLife = 0;
    for (const it of this.items) {
      if (it.life <= 0) continue;
      any = true;
      it.life -= dt;
      it.mesh.position.addScaledVector(it.vel, dt);
      it.vel.multiplyScalar(Math.pow(0.9, dt * 60));
      it.mesh.rotation.x += it.spin.x * dt;
      it.mesh.rotation.y += it.spin.y * dt;
      it.mesh.rotation.z += it.spin.z * dt;
      if (it.life <= 0) it.mesh.visible = false;
      else maxLife = Math.max(maxLife, it.life);
    }
    if (any) this.mat.opacity = THREE.MathUtils.clamp(maxLife / 0.8, 0, 1) * 0.95;
  }

  clear() {
    for (const it of this.items) {
      it.life = 0;
      it.mesh.visible = false;
    }
  }
}
