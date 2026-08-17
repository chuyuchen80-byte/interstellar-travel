import * as THREE from 'three';
import { Controls } from './controls';
import { FlightController } from './flight';
import { BulletPool, Debris, Enemy, makeAsteroid, makeDrone, makePlayerShip } from './entities';
import { makeCloudSprite, makeStarfield, PixelPipeline, STYLES } from './fx';
import { addSaturnRings, createAsteroidBelt, createMoon, createPlanet, createSun, Planet, PlanetStyle } from './planet';
import { createTerrain, createVegetation, SurfaceTerrain, TerrainStyle } from './terrain';
import { CharacterController } from './character';
import { Sfx } from './sfx';

interface Crystal {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
}

interface SurfaceWorld {
  root: THREE.Group;
  terrain: SurfaceTerrain;
  water: THREE.Mesh;
  character: CharacterController;
  ship: THREE.Group;
  shipLocal: THREE.Vector3;
  crystals: Crystal[];
  collect: number;
  enterTime: number;
}

interface Orbital {
  pivot: THREE.Object3D;
  planet: Planet;
  speed: number;
  center: THREE.Vector3;
  name: string;
  terrainStyle: TerrainStyle;
  waterLevel: number;
  seed: number;
  moon?: { pivot: THREE.Object3D; moon: THREE.Group; speed: number; radius: number };
}

type GameState = 'menu' | 'space' | 'flyby' | 'descent' | 'landing' | 'surface' | 'over';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private pipeline: PixelPipeline;
  private controls: Controls;
  private flight: FlightController;
  private bullets: BulletPool;
  private enemyBullets: BulletPool;
  private debris: Debris;
  private sfx = new Sfx();

  private spaceScene = new THREE.Scene();
  private surfaceScene = new THREE.Scene();

  private player: THREE.Group;
  private enemies: Enemy[] = [];
  private wave = 1;
  private score = 0;
  private health = 100;

  // 太阳系
  private orbitals: Orbital[] = [];
  private target: Orbital | null = null; // 最近可登录的行星
  private sunPos = new THREE.Vector3(0, 0, 0);

  private state: GameState = 'menu';
  private pendingScene: THREE.Scene = this.spaceScene;
  private surface: SurfaceWorld | null = null;
  private flyby: { root: THREE.Group; target: Orbital; enterTime: number; maturity: number; fadeMats: any[] } | null = null;
  private descentTarget: Orbital | null = null; // 降落目标锁定，防止转场期间切换

  private styleIdx = 0;
  private billboard = false;
  private shake = 0;
  private fireCd = 0;
  private clock = new THREE.Clock();

  constructor(private root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.root.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 15000);
    this.camera.position.set(0, 4, 16);

    // ---- 太空场景：太阳系 ----
    this.spaceScene.background = new THREE.Color(0x050510);
    this.spaceScene.add(new THREE.HemisphereLight(0x9db8ff, 0x20242e, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(30, 40, 20);
    this.spaceScene.add(dir);
    this.spaceScene.add(makeStarfield());

    const sun = createSun(120);
    sun.position.copy(this.sunPos);
    this.spaceScene.add(sun);

    this.buildSolarSystem();

    this.player = makePlayerShip();
    this.spaceScene.add(this.player);

    // ---- 地表场景（光照常��，地形按降落点动态生成） ----
    this.surfaceScene.background = new THREE.Color(0x87b7e8);
    this.surfaceScene.fog = new THREE.Fog(0x87b7e8, 90, 460);
    const sunLight = new THREE.DirectionalLight(0xfff2cc, 1.3);
    sunLight.position.set(60, 140, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -220;
    sunLight.shadow.camera.right = 220;
    sunLight.shadow.camera.top = 220;
    sunLight.shadow.camera.bottom = -220;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.bias = -0.0005;
    this.surfaceScene.add(sunLight);
    this.surfaceScene.add(new THREE.HemisphereLight(0xbcd9ff, 0x3a4a3a, 0.9));

    // 太阳��与云
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(16, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    sunDisc.position.set(520, 380, -260);
    this.surfaceScene.add(sunDisc);
    for (let i = 0; i < 6; i++) {
      const cloud = makeCloudSprite(120 + Math.random() * 160, 0.7);
      cloud.position.set(
        (Math.random() * 2 - 1) * 480,
        150 + Math.random() * 80,
        (Math.random() * 2 - 1) * 480,
      );
      this.surfaceScene.add(cloud);
    }

    // ---- 共用设施 ----
    this.pipeline = new PixelPipeline(this.renderer, 1, 1);
    this.controls = new Controls(this.renderer.domElement, (locked) => this.onLock(locked));
    this.flight = new FlightController(this.player, this.camera, this.controls);
    this.bullets = new BulletPool(this.spaceScene, 60);
    this.enemyBullets = new BulletPool(this.spaceScene, 40);
    this.debris = new Debris(this.spaceScene);

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.getElementById('startBtn')!.addEventListener('click', () => this.controls.lock());

    this.resize();
    this.setStyle(0);
  }

  // ---------- 太阳系布局：新间�� + 小行星带 + 月球 + 所有行星可登录 ----------

  private buildSolarSystem() {
    interface Def {
      orbit: number;
      size: number;
      seed: number;
      style: PlanetStyle;
      terrainStyle: TerrainStyle;
      waterLevel: number;
      speed: number;
      angle: number;
      tilt: number;
      rings?: boolean;
      name: string;
      moon?: boolean;
    }
    const defs: Def[] = [
      { name: '水星', orbit: 900, size: 90, seed: 11, style: 'rock', terrainStyle: 'gray', waterLevel: 0, speed: 0.05, angle: 1.2, tilt: 50, moon: false },
      { name: '金星', orbit: 1500, size: 150, seed: 22, style: 'gas', terrainStyle: 'yellow', waterLevel: 0, speed: 0.035, angle: -0.8, tilt: -30, moon: false },
      { name: '地球', orbit: 2200, size: 380, seed: 1234, style: 'earth', terrainStyle: 'earth', waterLevel: 2, speed: 0.02, angle: -Math.PI / 2, tilt: 0, moon: true },
      { name: '火星', orbit: 3000, size: 230, seed: 44, style: 'rock', terrainStyle: 'red', waterLevel: 0, speed: 0.016, angle: 2.4, tilt: 70, moon: false },
      { name: '木星', orbit: 4600, size: 520, seed: 55, style: 'gas', terrainStyle: 'cloud', waterLevel: 0, speed: 0.01, angle: 0.6, tilt: -50, moon: false },
      { name: '土星', orbit: 5600, size: 420, seed: 66, style: 'gas', terrainStyle: 'cloud', waterLevel: 0, speed: 0.008, angle: 3.6, tilt: 40, rings: true, moon: false },
    ];
    for (const def of defs) {
      const planet = createPlanet(def.size, def.seed, def.style);
      if (def.rings) addSaturnRings(planet, def.size * 1.35, def.size * 2.45);
      const pivot = new THREE.Object3D();
      planet.group.position.set(
        def.orbit * Math.cos(def.angle),
        def.tilt,
        def.orbit * Math.sin(def.angle),
      );
      pivot.add(planet.group);
      this.spaceScene.add(pivot);

      // 月球
      let moonObj: Orbital['moon'];
      if (def.moon) {
        const moonPivot = new THREE.Object3D();
        const moon = createMoon(40, def.seed + 100);
        moon.position.set(55, 0, 0);
        moonPivot.add(moon);
        pivot.add(moonPivot);
        moonObj = { pivot: moonPivot, moon, speed: 0.4, radius: 40 };
      }

      const orbital: Orbital = {
        pivot,
        planet,
        speed: def.speed,
        center: new THREE.Vector3(),
        name: def.name,
        terrainStyle: def.terrainStyle,
        waterLevel: def.waterLevel,
        seed: def.seed,
        moon: moonObj,
      };
      this.orbitals.push(orbital);
    }

    // 小行星带（火星-木星之间 3400-3900）
    const belt = createAsteroidBelt(3400, 3900, 300, 999);
    this.spaceScene.add(belt);
  }

  private updateSolarSystem(dt: number) {
    for (const o of this.orbitals) {
      o.pivot.rotation.y += o.speed * dt;
      o.planet.update(dt);
      o.planet.group.getWorldPosition(o.center);
      if (o.moon) {
        o.moon.pivot.rotation.y += o.moon.speed * dt;
      }
    }
    // 最近可登录行星（非气态云海也可降，为了体验全部可登）
    let best: Orbital | null = null;
    let bestDist = Infinity;
    for (const o of this.orbitals) {
      const d = this.player.position.distanceTo(o.center);
      if (d < bestDist) {
        bestDist = d;
        best = o;
      }
    }
    this.target = best;
  }

  start() {
    const loop = () => {
      this.tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------- 状态流转 ----------

  private onLock(locked: boolean) {
    const menu = document.getElementById('menu')!;
    if (locked) {
      menu.classList.add('hidden');
      this.sfx.ensure();
      if (this.state === 'menu') this.beginRun();
    } else {
      menu.classList.remove('hidden'); // Esc ���停
      if (this.state === 'descent') this.state = 'space'; // 取消下降
    }
  }

  private onKey(e: KeyboardEvent) {
    if (e.code >= 'Digit1' && e.code <= 'Digit4') {
      this.setStyle(Number(e.code.slice(5)) - 1);
    }
    if (e.code === 'KeyR' && this.state === 'over') this.beginRun();
    if (e.code === 'KeyF') {
      if (this.state === 'flyby') {
        this.beginDescent(); // 低空巡航中随时可降落，不受提示可见性限制
      } else if (this.state === 'space' && !document.getElementById('landPrompt')!.classList.contains('hidden')) {
        this.beginDescent();
      } else if (this.state === 'surface' && this.surface) {
        const s = this.surface;
        if (s.character.pos.distanceTo(s.shipLocal) < 9) this.beginReturn();
      }
    }
  }

  // ---------- 低空巡航：不降落继续飞，脚下加载地表地形 ----------

  private enterFlyby(target: Orbital) {
    // 以目标行星表面切平面为本地坐标系（同降落，但地形跟随飞船平移）
    const dir = this.player.position.clone().sub(target.center).normalize();
    const surfacePoint = target.center.clone().addScaledVector(dir, target.planet.radius);
    const up = dir.clone();
    const fwd = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0));
    if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0);
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();

    const root = new THREE.Group();
    root.position.copy(surfacePoint);
    root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
    this.spaceScene.add(root);
    root.updateMatrixWorld(true);

    // 低空地形：起伏压低到 40%，避免频繁撞山；初始淡入
    const terrain = createTerrain(560, 140, target.seed, target.waterLevel, target.terrainStyle, 0.4);
    root.add(terrain.mesh, terrain.water);

    // 淡入材质
    const fadeMatures: THREE.MeshStandardMaterial[] = [];
    const collectMats = (o: THREE.Object3D) => {
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.material) {
          const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as any;
          mat.transparent = true;
          mat.opacity = 0;
          if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) fadeMatures.push(mat);
        }
      });
    };
    collectMats(root);

    this.flyby = { root, target, enterTime: 0, maturity: 0, fadeMats: fadeMatures };
  }

  private leaveFlyby() {
    if (this.flyby) {
      this.spaceScene.remove(this.flyby.root);
      this.flyby = null;
    }
  }

  private updateFlames() {
    const flames = this.player.userData.flames as THREE.Mesh[] | undefined;
    const boosting = this.controls.actions.boost;
    if (flames) {
      for (const f of flames) {
        const fm = f.material as THREE.MeshBasicMaterial;
        f.scale.set(1, 1, boosting ? 2.2 : 0.9);
        fm.opacity = boosting ? 1 : 0.8;
        fm.color.setHSL(0.08, 0.95, boosting ? 0.7 : 0.55);
      }
    }
  }

  private beginRun() {
    this.state = 'space';
    this.score = 0;
    this.health = 100;
    this.wave = 1;
    this.leaveFlyby();
    this.flight.reset();
    this.player.position.set(0, 0, -600); // 出生在太阳与地球之间
    this.camera.position.set(0, 4, 16);
    this.enemies.forEach((en) => this.spaceScene.remove(en.obj));
    this.enemies = [];
    this.bullets.clear();
    this.enemyBullets.clear();
    this.debris.clear();
    this.spawnWave();
    document.getElementById('over')!.classList.add('hidden');
  }

  // ---------- 降落 / 返回 ----------

  private beginDescent() {
    this.leaveFlyby();
    this.state = 'descent';
  }

  private beginReturn() {
    this.state = 'landing';
    this.pendingScene = this.surfaceScene;
    this.setFade(true);
    window.setTimeout(() => {
      this.leaveSurface();
      this.state = 'space';
      this.setFade(false);
    }, 600);
  }

  private setFade(on: boolean, msg?: string) {
    document.getElementById('fade')!.style.opacity = on ? '1' : '0';
    const el = document.getElementById('landMsg')!;
    if (msg) {
      el.textContent = msg;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  private enterSurface() {
    if (!this.target) return;
    // 以目标星球表面切平面为本地坐标系（本地 +Y = 星球径向）
    const dir = this.player.position.clone().sub(this.target.center).normalize();
    const surfacePoint = this.target.center.clone().addScaledVector(dir, this.target.planet.radius);

    const up = dir.clone();
    const fwd = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0));
    if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0);
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();

    const root = new THREE.Group();
    root.position.copy(surfacePoint);
    root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
    this.surfaceScene.add(root);
    root.updateMatrixWorld(true);

    // ��行星不同地形风格 + 天空色
    const terrain = createTerrain(520, 180, this.target.seed, this.target.waterLevel, this.target.terrainStyle);
    root.add(terrain.mesh, terrain.water);
    const vegetation = createVegetation(terrain, this.target.seed + Math.floor(Math.random() * 1000), 80);
    root.add(vegetation);

    const character = new CharacterController();
    character.pos.set(0, terrain.heightAt(0, 0) + 4, 0);
    root.add(character.group);

    // �����的��船
    const ship = makePlayerShip();
    const shipX = 8;
    ship.position.set(shipX, terrain.heightAt(shipX, 0) + 1.6, 0);
    ship.rotation.set(0.08, -0.7, 0.12);
    root.add(ship);

    // 可收集水��
    const crystals: Crystal[] = [];
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x7df9ff,
      emissive: 0x1b6d78,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    for (let i = 0; i < 12; i++) {
      const x = (Math.random() * 2 - 1) * 210;
      const z = (Math.random() * 2 - 1) * 210;
      const y = terrain.heightAt(x, z) + 1.4;
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), crystalMat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      mesh.castShadow = true;
      root.add(mesh);
      crystals.push({ mesh, pos: mesh.position.clone() });
    }

    this.surface = {
      root,
      terrain,
      water: terrain.water,
      character,
      ship,
      shipLocal: ship.position.clone(),
      crystals,
      collect: 0,
      enterTime: 0,
    };
    // 天空色按行星
    this.applySurfaceSky(this.target.terrainStyle);
    document.getElementById('collectWrap')!.classList.remove('hidden');
    document.getElementById('surfaceHelp')!.classList.remove('hidden');
    document.getElementById('landPrompt')!.classList.add('hidden');
    document.getElementById('collectVal')!.textContent = `0/${crystals.length}`;
  }

  private applySurfaceSky(style: TerrainStyle) {
    let bg, fog;
    switch (style) {
      case 'earth': bg = 0x87b7e8; fog = 0x87b7e8; break;
      case 'red': bg = 0xd46b3a; fog = 0xcd5a30; break;
      case 'gray': bg = 0x8a8a90; fog = 0x7a7a80; break;
      case 'yellow': bg = 0xe8c05a; fog = 0xdda840; break;
      case 'cloud': bg = 0xf0e8d8; fog = 0xe8e0d0; break;
      default: bg = 0x87b7e8; fog = 0x87b7e8;
    }
    this.surfaceScene.background = new THREE.Color(bg);
    this.surfaceScene.fog = new THREE.Fog(fog, 90, 460);
  }

  private leaveSurface() {
    if (this.surface) {
      this.surfaceScene.remove(this.surface.root);
      this.surface = null;
    }
    // ���复地球天空
    this.surfaceScene.background = new THREE.Color(0x87b7e8);
    this.surfaceScene.fog = new THREE.Fog(0x87b7e8, 90, 460);
    document.getElementById('collectWrap')!.classList.add('hidden');
    document.getElementById('surfaceHelp')!.classList.add('hidden');
    document.getElementById('shipPrompt')!.classList.add('hidden');
  }

  // ---------- ��次生成（��开所有行星） ----------

  private spawnWave() {
    const count = Math.min(6 + this.wave * 2, 22);
    for (let i = 0; i < count; i++) this.spawnEnemy(makeAsteroid(0.8 + Math.random() * 1.4));
    if (this.wave >= 2) {
      const drones = Math.min(2 + this.wave, 8);
      for (let i = 0; i < drones; i++) this.spawnEnemy(makeDrone());
    }
  }

  private spawnEnemy(en: Enemy) {
    const dir = new THREE.Vector3().randomDirection();
    dir.y *= 0.6;
    dir.normalize();
    const dist = 130 + Math.random() * 80;
    en.obj.position.copy(dir).multiplyScalar(dist).add(this.player.position);
    // 出生点不得落入任意行星内部
    for (const o of this.orbitals) {
      const d = en.obj.position.distanceTo(o.center);
      if (d < o.planet.radius + 60) {
        const ed = en.obj.position.clone().sub(o.center).normalize();
        en.obj.position.copy(o.center).addScaledVector(ed, o.planet.radius + 60 + Math.random() * 40);
      }
    }
    this.applyBillboard(en);
    this.spaceScene.add(en.obj);
    this.enemies.push(en);
  }

  private applyBillboard(en: Enemy) {
    for (const c of en.obj.children) {
      if ((c as THREE.Sprite).isSprite) c.visible = this.billboard;
    }
    en.obj.visible = !this.billboard;
  }

  // ---------- ���素风格 ----------

  private setStyle(i: number) {
    this.styleIdx = ((i % STYLES.length) + STYLES.length) % STYLES.length;
    const s = STYLES[this.styleIdx];
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    this.pipeline.setStyle(s, w, h);
    this.billboard = s.billboard;

    this.player.visible = !this.billboard;
    const pSprite = this.player.children.find((c) => (c as THREE.Sprite).isSprite) as THREE.Sprite | undefined;
    if (pSprite) pSprite.visible = this.billboard;
    for (const en of this.enemies) this.applyBillboard(en);
    for (const b of [...this.bullets.list, ...this.enemyBullets.list]) {
      b.mesh.visible = this.billboard ? false : b.active;
      b.sprite.visible = this.billboard && b.active;
    }
    document.getElementById('styleName')!.textContent = s.name;
  }

  // ---------- 主��环 ----------

  private tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    switch (this.state) {
      case 'space':
        if (this.controls.locked) {
          this.flight.update(dt);
          this.updateFiring(dt);
          this.updateEnemies(dt);
          this.updateCollisions();
          if (this.enemies.length === 0) {
            this.wave++;
            this.spawnWave();
          }
        }
        this.flight.updateCamera(dt);
        this.updateFlames();

        this.shake = Math.max(0, this.shake - dt * 5);
        this.camera.position.add(
          new THREE.Vector3(
            (Math.random() - 0.5) * this.shake,
            (Math.random() - 0.5) * this.shake,
            0,
          ),
        );
        this.bullets.update(dt, this.billboard);
        this.enemyBullets.update(dt, this.billboard);
        this.debris.update(dt);
        this.updateSolarSystem(dt);

        // 行星交互：8 以下强制降落（不穿模）；8~220 进入低空巡航
        if (this.target) {
          const distToSurface = this.player.position.distanceTo(this.target.center) - this.target.planet.radius;
          if (distToSurface < 8) {
            this.beginDescent();
          } else if (distToSurface < 220) {
            this.enterFlyby(this.target);
            this.state = 'flyby';
          }
        }

        this.updateLandPrompt();
        this.pipeline.render(this.spaceScene, this.camera);
        break;

      case 'flyby': {
        // 低空巡航：可自由飞行，脚下地形跟随
        if (this.controls.locked) {
          this.flight.update(dt);
          this.updateFiring(dt);
          this.updateEnemies(dt);
          this.updateCollisions();
        }
        this.flight.updateCamera(dt);
        this.updateFlames();
        this.shake = Math.max(0, this.shake - dt * 5);
        this.camera.position.add(
          new THREE.Vector3(
            (Math.random() - 0.5) * this.shake,
            (Math.random() - 0.5) * this.shake,
            0,
          ),
        );
        this.bullets.update(dt, this.billboard);
        this.enemyBullets.update(dt, this.billboard);
        this.debris.update(dt);
        this.updateSolarSystem(dt);

        if (this.flyby) {
          const f = this.flyby;
          f.enterTime += dt;
          // 地形块跟随飞船投影点
          const dir = this.player.position.clone().sub(f.target.center).normalize();
          f.root.position.copy(f.target.center).addScaledVector(dir, f.target.planet.radius);
          const distToSurface = this.player.position.distanceTo(f.target.center) - f.target.planet.radius;
          if (distToSurface < 10) {
            this.beginDescent(); // 太近强制降落
          } else if (distToSurface > 320) {
            this.leaveFlyby();
            this.state = 'space'; // 飞离星球，回到太空
          }
        } else {
          this.state = 'space';
        }

        this.updateLandPrompt();
        this.pipeline.render(this.spaceScene, this.camera);
        break;
      }

      case 'descent': {
        if (!this.target) { this.state = 'space'; break; }
        const dir = this.player.position.clone().sub(this.target.center).normalize();
        const distToSurface = this.player.position.distanceTo(this.target.center) - this.target.planet.radius;
        const target = this.target.center.clone().addScaledVector(dir, this.target.planet.radius + 4);
        const toTarget = target.clone().sub(this.player.position);
        const dist = toTarget.length();

        // 速度曲线：高空���� → 中空��速 → 近地��降
        let speed: number;
        if (distToSurface > 260) speed = Math.min(dist * 3, 110);
        else if (distToSurface > 60) speed = 55 + distToSurface * 0.35;
        else speed = Math.min(30, 8 + distToSurface * 0.7);
        this.player.position.addScaledVector(toTarget.normalize(), speed * dt);
        this.flight.vel.set(0, 0, 0);

        // ��态：高空 34° ����，近地拉平到 14°
        const dive = THREE.MathUtils.lerp(
          0.24,
          0.6,
          THREE.MathUtils.clamp((distToSurface - 60) / 300, 0, 1),
        );
        const inward = this.target.center.clone().sub(this.player.position).normalize();
        const qDown = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), inward);
        const qTilt = new THREE.Quaternion().setFromAxisAngle(dir, -dive);
        this.player.quaternion.slerp(qTilt.clone().multiply(qDown), Math.min(1, dt * 2.2));

        // 相机：高空��上方��视 → 近地背后��随
        const above = this.player.position.clone().addScaledVector(inward, -26).add(new THREE.Vector3(0, 14, 0));
        const behind = this.player.position.clone().addScaledVector(inward, -11).add(new THREE.Vector3(0, 6, 0));
        const k = THREE.MathUtils.clamp((distToSurface - 90) / 260, 0, 1);
        const camPos = above.clone().lerp(behind, 1 - k);
        this.camera.position.lerp(camPos, 1 - Math.pow(0.001, dt));

        this.shake = Math.max(this.shake, distToSurface < 40 ? 1 - distToSurface / 40 : 0);
        if (this.shake > 0) {
          this.camera.position.add(
            new THREE.Vector3(
              (Math.random() - 0.5) * this.shake * 0.8,
              (Math.random() - 0.5) * this.shake * 0.8,
              0,
            ),
          );
        }
        this.camera.lookAt(this.player.position.clone().addScaledVector(inward, -30));
        this.updateSolarSystem(dt);

        if (dist < 12) {
          this.state = 'landing';
          this.pendingScene = this.spaceScene;
          this.setFade(true, `着陆 ${this.target!.name} 中…`);
          window.setTimeout(() => {
            this.enterSurface();
            this.state = 'surface';
            this.setFade(false);
          }, 900);
        }
        this.pipeline.render(this.spaceScene, this.camera);
        break;
      }

      case 'surface': {
        const s = this.surface!;
        s.enterTime += dt;
        if (this.controls.locked) {
          s.character.update(dt, this.controls, s.terrain.heightAt, s.root, this.camera, s.enterTime);
          this.updateCollect(s);
        }
        // 水面呼吸波动
        if (s.water.visible) {
          (s.water.material as any).opacity = 0.72 + Math.sin(s.enterTime * 1.8) * 0.05;
        }
        this.updateShipReturnPrompt(s);
        this.pipeline.render(this.surfaceScene, this.camera);
        break;
      }

      case 'landing':
        this.pipeline.render(this.pendingScene, this.camera);
        break;

      case 'menu':
        this.flight.updateCamera(dt);
        this.updateSolarSystem(dt);
        this.pipeline.render(this.spaceScene, this.camera);
        break;

      case 'over':
        this.updateSolarSystem(dt);
        this.pipeline.render(this.spaceScene, this.camera);
        break;
    }

    this.updateHud();
  }

  // ---------- 太空战斗 ----------

  private updateFiring(dt: number) {
    this.fireCd -= dt;
    if (this.controls.actions.fire && this.fireCd <= 0) {
      this.fireCd = 0.13;
      const nose = new THREE.Vector3(0, 0, -4.4).applyQuaternion(this.player.quaternion).add(this.player.position);
      this.bullets.fire(nose, this.flight.forward, 130, false);
      this.sfx.shoot();
    }
  }

  private updateEnemies(dt: number) {
    const p = this.player.position;
    for (const en of this.enemies) {
      en.obj.position.addScaledVector(en.vel, dt);
      en.obj.rotation.x += en.spin.x * dt;
      en.obj.rotation.y += en.spin.y * dt;

      if (en.kind === 'drone') {
        const to = p.clone().sub(en.obj.position).normalize();
        en.vel.lerp(to.multiplyScalar(en.speed), Math.min(1, dt * 0.8));
        en.fireTimer -= dt;
        if (en.fireTimer <= 0) {
          en.fireTimer = 2 + Math.random() * 1.5;
          if (en.obj.position.distanceTo(p) < 160) {
            const dir = p.clone().sub(en.obj.position).normalize();
            this.enemyBullets.fire(en.obj.position.clone(), dir, 55, true);
            this.sfx.enemyShoot();
          }
        }
      } else if (en.kind === 'asteroid') {
        en.obj.rotation.z += en.spin.z * dt;
        if (en.obj.position.distanceTo(p) > 480) {
          en.obj.position
            .copy(new THREE.Vector3().randomDirection())
            .multiplyScalar(140 + Math.random() * 60)
            .add(p);
        }
      }
    }
  }

  private updateCollisions() {
    const p = this.player.position;
    const pr = 2.6;

    for (const b of this.bullets.list) {
      if (!b.active || b.enemy) continue;
      for (const en of this.enemies) {
        if (en.obj.position.distanceToSquared(b.mesh.position) < (en.radius + 0.5) ** 2) {
          b.active = false;
          b.mesh.visible = false;
          b.sprite.visible = false;
          en.hp -= 1;
          this.debris.spawn(en.obj.position, 10, en.kind === 'drone' ? 0xe8504a : 0x8f8575);
          if (en.hp <= 0) {
            this.score += en.kind === 'drone' ? 25 : 10;
            this.debris.spawn(en.obj.position, en.kind === 'drone' ? 18 : 12, 0xffa34d);
            this.sfx.boom();
            this.spaceScene.remove(en.obj);
            this.enemies.splice(this.enemies.indexOf(en), 1);
          } else {
            this.sfx.hit();
          }
          break;
        }
      }
    }

    for (const b of this.enemyBullets.list) {
      if (!b.active) continue;
      if (b.mesh.position.distanceToSquared(p) < (pr + 0.6) ** 2) {
        b.active = false;
        b.mesh.visible = false;
        b.sprite.visible = false;
        this.hitPlayer();
      }
    }

    for (const en of this.enemies) {
      if (en.obj.position.distanceToSquared(p) < (en.radius + pr) ** 2) {
        this.debris.spawn(en.obj.position, 10, en.kind === 'drone' ? 0xe8504a : 0x8f8575);
        this.hitPlayer();
      }
    }
  }

  private hitPlayer() {
    if (this.state !== 'space') return;
    this.health -= 15;
    this.shake = 1.2;
    this.sfx.playerHit();
    this.debris.spawn(this.player.position, 8, 0x3ecf6a);
    this.flight.vel.addScaledVector(this.flight.forward, 6);
    if (this.health <= 0) {
      this.health = 0;
      this.state = 'over';
      document.getElementById('finalScore')!.textContent = String(this.score);
      document.getElementById('over')!.classList.remove('hidden');
    }
  }

  // ---------- 地表交互 ----------

  private updateCollect(s: SurfaceWorld) {
    for (const cr of s.crystals) {
      if (cr.mesh.parent && s.character.pos.distanceTo(cr.pos) < 3) {
        s.root.remove(cr.mesh);
        s.collect++;
        this.sfx.hit();
        document.getElementById('collectVal')!.textContent = `${s.collect}/${s.crystals.length}`;
      }
    }
  }

  private updateShipReturnPrompt(s: SurfaceWorld) {
    const el = document.getElementById('shipPrompt')!;
    const near = s.character.pos.distanceTo(s.shipLocal) < 9;
    el.classList.toggle('hidden', !near);
  }

  private updateLandPrompt() {
    const el = document.getElementById('landPrompt')!;
    if (!this.target) { el.classList.add('hidden'); return; }
    const dist = this.player.position.distanceTo(this.target.center) - this.target.planet.radius;
    const show = dist < 260;
    el.classList.toggle('hidden', !show);
    if (show) el.textContent = `按 F 降落 ${this.target.name}`;
  }

  // ---------- HUD 与尺寸 ----------

  private updateHud() {
    document.getElementById('hpVal')!.textContent = String(Math.max(0, Math.round(this.health)));
    document.getElementById('hpFill')!.style.width = `${Math.max(0, this.health)}%`;
    document.getElementById('scoreVal')!.textContent = String(this.score);
    document.getElementById('waveVal')!.textContent = String(this.wave);
  }

  private resize() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.setStyle(this.styleIdx);
  }
}