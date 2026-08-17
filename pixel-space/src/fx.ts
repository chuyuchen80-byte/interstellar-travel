import * as THREE from 'three';

// ---------- 星空 ----------

export function makeStarfield(count = 350, size = 1.2): THREE.Points {
  const n = count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  const white = new THREE.Color(0xffffff);
  const paleBlue = new THREE.Color(0xd4dcff);
  for (let i = 0; i < n; i++) {
    // 远离太阳系（行星轨道之外），不会出现在飞船附近
    v.randomDirection().multiplyScalar(6500 + Math.random() * 8000);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
    const c = Math.random() < 0.8 ? white : paleBlue;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------- 四种像素风格预设 ----------

export interface StyleParams {
  pixelScale: number;
  palette: boolean;
  scan: boolean;
  crt: boolean;
  sat: number;
  billboard: boolean;
  name: string;
}

export const STYLES: StyleParams[] = [
  { name: '经典像素', pixelScale: 0.22, palette: false, scan: false, crt: false, sat: 1.0, billboard: false },
  { name: '体素', pixelScale: 0.16, palette: true, scan: false, crt: false, sat: 1.05, billboard: false },
  { name: '精灵纸片', pixelScale: 0.3, palette: false, scan: false, crt: false, sat: 1.15, billboard: true },
  { name: 'CRT 复古', pixelScale: 0.26, palette: false, scan: true, crt: true, sat: 0.85, billboard: false },
];

// ---------- 像素化后处理管线（低分辨率渲染 + 最近邻上采样 + 调色板/扫描线/CRT 效果） ----------

export class PixelPipeline {
  private rt: THREE.WebGLRenderTarget;
  private mat: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scale = 0.22;

  constructor(private renderer: THREE.WebGLRenderer, w: number, h: number) {
    this.rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        palette: { value: 0 },
        scan: { value: 0 },
        sat: { value: 1 },
        crt: { value: 0 },
        res: { value: new THREE.Vector2(w, h) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float palette; uniform float scan; uniform float sat; uniform float crt;
        uniform vec2 res;
        varying vec2 vUv;
        void main(){
          vec2 uv = vUv;
          vec3 col = texture2D(tDiffuse, uv).rgb;
          if (palette > 0.5) col = floor(col * 8.0 + 0.5) / 8.0;
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(l), col, sat);
          if (scan > 0.5) col *= 0.8 + 0.2 * sin(uv.y * res.y * 3.14159);
          if (crt > 0.5) { vec2 d = uv - 0.5; col *= 1.0 - dot(d, d) * 1.4; }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.scene.add(this.quad);
  }

  setStyle(s: StyleParams, w: number, h: number) {
    this.rt.setSize(Math.max(1, Math.floor(w * s.pixelScale)), Math.max(1, Math.floor(h * s.pixelScale)));
    this.scale = s.pixelScale;
    this.mat.uniforms.palette.value = s.palette ? 1 : 0;
    this.mat.uniforms.scan.value = s.scan ? 1 : 0;
    this.mat.uniforms.crt.value = s.crt ? 1 : 0;
    this.mat.uniforms.sat.value = s.sat;
    this.mat.uniforms.res.value.set(this.rt.width, this.rt.height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.cam);
  }

  dispose() {
    this.rt.dispose();
    this.mat.dispose();
  }
}

// ---------- 地表云朵精灵 ----------

export function makeCloudSprite(scale: number, opacity = 0.75): THREE.Sprite {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d')!;
  const grad = c.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
  sprite.scale.set(scale, scale * 0.5, 1);
  return sprite;
}
