import * as THREE from 'three';
import { Controls } from './controls';

// 6DOF 飞行控制器（第三人称）：鼠标偏航/俯仰，Q/E 翻滚，WASD 平移，Space/C 升降，Shift 加速
export class FlightController {
  vel = new THREE.Vector3();
  sens = 0.0021;
  thrust = 90;
  boostMul = 3.2;
  drag = 0.955; // 每 60 帧衰减系数，>0.9 时惯性明显
  rollRate = 2.4;

  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(
    public group: THREE.Group,
    public camera: THREE.PerspectiveCamera,
    public ctrl: Controls,
  ) {}

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
  }

  update(dt: number) {
    const { dx, dy } = this.ctrl.consumeMouse();
    this.yaw -= dx * this.sens;
    this.pitch -= dy * this.sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    if (this.ctrl.isDown('KeyQ')) this.roll += this.rollRate * dt;
    if (this.ctrl.isDown('KeyE')) this.roll -= this.rollRate * dt;

    this.e.set(this.pitch, this.yaw, this.roll);
    this.q.setFromEuler(this.e);
    this.group.quaternion.copy(this.q);

    const boost = this.ctrl.actions.boost;
    const fwd = this.forward;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.group.quaternion);

    const input = new THREE.Vector3();
    if (this.ctrl.isDown('KeyW')) input.add(fwd);
    if (this.ctrl.isDown('KeyS')) input.sub(fwd);
    if (this.ctrl.isDown('KeyD')) input.add(right);
    if (this.ctrl.isDown('KeyA')) input.sub(right);
    if (this.ctrl.isDown('Space')) input.add(up);
    if (this.ctrl.isDown('KeyC')) input.sub(up);
    if (input.lengthSq() > 0) {
      input.normalize().multiplyScalar(this.thrust * (boost ? this.boostMul : 1));
    }

    this.vel.addScaledVector(input, dt);
    this.vel.multiplyScalar(Math.pow(this.drag, dt * 60));
    this.group.position.addScaledVector(this.vel, dt);
  }

  // 第三人称跟随相机：战机后上方，忽略翻滚，平滑跟随
  updateCamera(dt: number) {
    const fwd = this.forward;
    const desired = this.group.position
      .clone()
      .addScaledVector(fwd, -15)
      .add(new THREE.Vector3(0, 4.5, 0));
    const k = 1 - Math.pow(0.0001, dt);
    this.camera.position.lerp(desired, k);
    this.camera.lookAt(this.group.position.clone().addScaledVector(fwd, 8));
  }

  reset() {
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.vel.set(0, 0, 0);
    this.group.position.set(0, 0, 0);
    this.group.quaternion.identity();
  }
}
