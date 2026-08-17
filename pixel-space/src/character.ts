import * as THREE from 'three';
import { Controls } from './controls';

// 第三人称地表角色控制器：重力 / 地形碰撞 / 跳跃 / 鼠标视角 / 行走动画
// 模型：胶囊宇航员（躯干/头盔面罩/背包/胶囊四肢，关节枢轴摆动）
export class CharacterController {
  group = new THREE.Group();
  pos = new THREE.Vector3(0, 5, 0);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0.35;
  onGround = false;

  private legL: THREE.Group;
  private legR: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private body: THREE.Group;
  private walk = 0;
  private moving = false;

  constructor() {
    const suit = new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.55 });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x3ecf6a,
      roughness: 0.5,
      emissive: 0x0f3d20,
      emissiveIntensity: 0.6,
    });
    const visor = new THREE.MeshStandardMaterial({
      color: 0x9fd8ff,
      roughness: 0.1,
      metalness: 0.6,
      emissive: 0x1a4a6a,
      emissiveIntensity: 0.4,
    });
    const pack = new THREE.MeshStandardMaterial({ color: 0x9aa5ad, roughness: 0.7, metalness: 0.5 });

    // ---- 躯干组 ----
    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.62, 4, 12), suit);
    torso.position.y = 1.45;
    torso.castShadow = true;
    this.body.add(torso);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, 0.52), accent);
    belt.position.y = 1.3;
    belt.castShadow = true;
    this.body.add(belt);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.06), accent);
    chest.position.set(0, 1.78, -0.36);
    this.body.add(chest);

    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.36), pack);
    backpack.position.set(0, 1.62, 0.4);
    backpack.castShadow = true;
    this.body.add(backpack);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), suit);
    head.position.y = 2.26;
    head.castShadow = true;
    this.body.add(head);

    const visorMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.235, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      visor,
    );
    visorMesh.position.set(0, 2.26, -0.15);
    visorMesh.rotation.x = -0.2;
    this.body.add(visorMesh);

    this.group.add(this.body);

    // ---- 腿（枢轴在髋部） ----
    const legGeo = new THREE.CapsuleGeometry(0.15, 0.52, 4, 8);
    this.legL = new THREE.Group();
    this.legL.position.set(-0.25, 0.98, 0);
    const legLM = new THREE.Mesh(legGeo, suit);
    legLM.position.y = -0.5;
    legLM.castShadow = true;
    this.legL.add(legLM);
    this.group.add(this.legL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.25, 0.98, 0);
    const legRM = new THREE.Mesh(legGeo.clone(), suit);
    legRM.position.y = -0.5;
    legRM.castShadow = true;
    this.legR.add(legRM);
    this.group.add(this.legR);

    // ---- 臂（枢轴在肩部） ----
    const armGeo = new THREE.CapsuleGeometry(0.11, 0.44, 4, 8);
    this.armL = new THREE.Group();
    this.armL.position.set(-0.6, 1.86, 0);
    const armLM = new THREE.Mesh(armGeo, accent);
    armLM.position.y = -0.42;
    armLM.castShadow = true;
    this.armL.add(armLM);
    this.group.add(this.armL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.6, 1.86, 0);
    const armRM = new THREE.Mesh(armGeo.clone(), accent);
    armRM.position.y = -0.42;
    armRM.castShadow = true;
    this.armR.add(armRM);
    this.group.add(this.armR);

    this.group.rotation.y = this.yaw;
  }

  update(
    dt: number,
    ctrl: Controls,
    heightAt: (x: number, z: number) => number,
    root: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    enterTime: number,
  ) {
    // 鼠标视角 — 只控制相机，不直接旋转角色
    const { dx, dy } = ctrl.consumeMouse();
    this.yaw -= dx * 0.0024;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0024, 0.15, 1.35);

    // ---- 移动方向：WASD 相对于相机水平朝向（yaw） ----
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = new THREE.Vector3();
    if (ctrl.isDown('KeyW')) want.add(fwd);
    if (ctrl.isDown('KeyS')) want.sub(fwd);
    if (ctrl.isDown('KeyD')) want.add(right);
    if (ctrl.isDown('KeyA')) want.sub(right);
    const hasInput = want.lengthSq() > 0;
    want.normalize().multiplyScalar(13);

    this.vel.x = THREE.MathUtils.lerp(this.vel.x, want.x, Math.min(1, dt * 10));
    this.vel.z = THREE.MathUtils.lerp(this.vel.z, want.z, Math.min(1, dt * 10));
    this.vel.y -= 32 * dt;

    this.pos.addScaledVector(this.vel, dt);

    // 地形碰撞
    const gy = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    if (ctrl.isDown('Space') && this.onGround) {
      this.vel.y = 13;
      this.onGround = false;
    }

    this.group.position.copy(this.pos);

    // ---- 角色朝向：平滑旋转到移动方向（Minecraft 风格） ----
    if (hasInput) {
      const moveYaw = Math.atan2(want.x, want.z);
      let diff = moveYaw - this.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.group.rotation.y += diff * Math.min(1, dt * 10);
    }

    // 行走动画（关节枢轴摆动）
    this.moving = hasInput && this.onGround;
    if (this.moving) this.walk += dt * 9;
    else this.walk = 0;
    const s = Math.sin(this.walk);
    this.legL.rotation.x = s * 0.55;
    this.legR.rotation.x = -s * 0.55;
    this.armL.rotation.x = -s * 0.45;
    this.armR.rotation.x = s * 0.45;
    this.body.position.y = this.moving ? Math.abs(Math.cos(this.walk)) * 0.07 : 0;

    // ---- 第三人称相机：球面坐标 + 地形碰撞 ----
    const camDist = 8;
    const camPitch = THREE.MathUtils.clamp(this.pitch, 0.15, 1.35);
    const localCam = new THREE.Vector3(
      this.pos.x + Math.sin(this.yaw) * Math.cos(camPitch) * camDist,
      this.pos.y + Math.sin(camPitch) * camDist + 2.5,
      this.pos.z + Math.cos(this.yaw) * Math.cos(camPitch) * camDist,
    );

    // 相机不能低于地形
    const camGround = heightAt(localCam.x, localCam.z) + 2;
    if (localCam.y < camGround) localCam.y = camGround;

    const localLook = new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z);

    const worldCam = localCam.applyMatrix4(root.matrixWorld);
    const worldLook = localLook.applyMatrix4(root.matrixWorld);

    // 平滑跟随（有缓冲感）
    camera.position.lerp(worldCam, 1 - Math.pow(0.005, dt));
    camera.lookAt(worldLook);

    // 着陆入场动画：从高空机位缓缓降到角色背后
    if (enterTime < 2.6) {
      const t = THREE.MathUtils.smoothstep(enterTime, 0.2, 2.6);
      const highCam = new THREE.Vector3(0, 34, 16).applyMatrix4(root.matrixWorld);
      camera.position.lerpVectors(highCam, worldCam, t);
      camera.lookAt(worldLook);
    }
  }
}
