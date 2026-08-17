import * as THREE from 'three';
import { BlockType, BLOCKS } from './block';

// 区块尺寸
const CHUNK_W = 16;
const CHUNK_H = 32;
const CHUNK_D = 16;

// 6个面的方向向量
const FACES: [number, number, number, number, number, number][] = [
  [0, 0, 1, 0, 0, 0],  // +Z
  [0, 0, -1, 0, 0, 1], // -Z
  [1, 0, 0, 0, 1, 0],  // +X
  [-1, 0, 0, 0, 1, 1], // -X
  [0, 1, 0, 1, 0, 0],  // +Y
  [0, -1, 0, 1, 0, 1], // -Y
];

// 每个面的顶点（单位立方体，中心在原点）
const VERTICES: number[][] = [
  // +Z (front)  v0,v1,v2,v3
  [-0.5, -0.5, 0.5,   0.5, -0.5, 0.5,   0.5, 0.5, 0.5,  -0.5, 0.5, 0.5],
  // -Z (back)
  [-0.5, -0.5, -0.5,  -0.5, 0.5, -0.5,  0.5, 0.5, -0.5,  0.5, -0.5, -0.5],
  // +X (right)
  [0.5, -0.5, -0.5,   0.5, 0.5, -0.5,  0.5, 0.5, 0.5,  0.5, -0.5, 0.5],
  // -X (left)
  [-0.5, -0.5, -0.5,  -0.5, -0.5, 0.5,  -0.5, 0.5, 0.5,  -0.5, 0.5, -0.5],
  // +Y (top)
  [-0.5, 0.5, -0.5,   -0.5, 0.5, 0.5,   0.5, 0.5, 0.5,  0.5, 0.5, -0.5],
  // -Y (bottom)
  [-0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5, 0.5,  -0.5, -0.5, 0.5],
];

const UVS: number[] = [
  0, 0,   1, 0,   1, 1,   0, 1,
];

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly data: Uint8Array;
  mesh: THREE.Mesh | null = null;
  dirty = true;

  // 世界坐标偏移（每个方块 = 1 单位）
  private readonly ox: number;
  private readonly oz: number;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.ox = cx * CHUNK_W;
    this.oz = cz * CHUNK_D;
    this.data = new Uint8Array(CHUNK_W * CHUNK_H * CHUNK_D);
  }

  /** 获取区块内方块（局部坐标，0~15） */
  getBlock(x: number, y: number, z: number): BlockType {
    if (x < 0 || x >= CHUNK_W || y < 0 || y >= CHUNK_H || z < 0 || z >= CHUNK_D) return BlockType.AIR;
    return this.data[x + y * CHUNK_W + z * CHUNK_W * CHUNK_H] as BlockType;
  }

  /** 设置区块内方块 */
  setBlock(x: number, y: number, z: number, type: BlockType) {
    if (x < 0 || x >= CHUNK_W || y < 0 || y >= CHUNK_H || z < 0 || z >= CHUNK_D) return;
    this.data[x + y * CHUNK_W + z * CHUNK_W * CHUNK_H] = type;
    this.dirty = true;
  }

  /** 获取世界坐标对应的局部坐标 */
  worldToLocal(wx: number, wy: number, wz: number): [number, number, number] {
    return [wx - this.ox, wy, wz - this.oz];
  }

  /** 判断世界坐标是否在本区块内 */
  contains(wx: number, wy: number, wz: number): boolean {
    return (
      wx >= this.ox && wx < this.ox + CHUNK_W &&
      wy >= 0 && wy < CHUNK_H &&
      wz >= this.oz && wz < this.oz + CHUNK_D
    );
  }

  /** 获取邻居区块的方块类型（用于面剔除） */
  private getNeighborBlock(
    bx: number, by: number, bz: number,
    dx: number, dy: number, dz: number,
    neighborChunks: Map<string, Chunk>,
  ): BlockType {
    const nx = bx + dx;
    const ny = by + dy;
    const nz = bz + dz;
    // 在区块内
    if (nx >= 0 && nx < CHUNK_W && ny >= 0 && ny < CHUNK_H && nz >= 0 && nz < CHUNK_D) {
      return this.getBlock(nx, ny, nz);
    }
    // 跨区块
    const worldX = this.ox + nx;
    const worldZ = this.oz + nz;
    if (ny < 0 || ny >= CHUNK_H) return BlockType.AIR;
    const ncx = Math.floor(worldX / CHUNK_W);
    const ncz = Math.floor(worldZ / CHUNK_D);
    const key = `${ncx},${ncz}`;
    const neighbor = neighborChunks.get(key);
    if (!neighbor) return BlockType.AIR;
    return neighbor.getBlock(worldX - ncx * CHUNK_W, ny, worldZ - ncz * CHUNK_D);
  }

  /** 重新生成网格（仅当 dirty 时） */
  rebuildMesh(neighborChunks: Map<string, Chunk>) {
    if (!this.dirty) return;
    this.dirty = false;

    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertCount = 0;

    for (let y = 0; y < CHUNK_H; y++) {
      for (let z = 0; z < CHUNK_D; z++) {
        for (let x = 0; x < CHUNK_W; x++) {
          const blockType = this.getBlock(x, y, z) as BlockType;
          if (blockType === BlockType.AIR) continue;

          const def = BLOCKS[blockType];
          if (!def || !def.solid) continue;

          // 检查6个面
          for (let fi = 0; fi < 6; fi++) {
            const [dx, dy, dz] = FACES[fi];
            const neighborType = this.getNeighborBlock(x, y, z, dx, dy, dz, neighborChunks);

            // 邻居是空气或透明方块 → 生成此面
            const neighborDef = BLOCKS[neighborType as BlockType];
            if (neighborDef && (neighborType === BlockType.AIR || neighborDef.transparent)) {
              // 选择颜色
              const isTop = fi === 4;    // +Y
              const isBottom = fi === 5; // -Y
              const color = isTop ? def.topColor : (isBottom ? def.bottomColor : def.sideColor);
              const r = ((color >> 16) & 0xff) / 255;
              const g = ((color >> 8) & 0xff) / 255;
              const b = (color & 0xff) / 255;

              const verts = VERTICES[fi];
              // 每面4个顶点，每个顶点3个坐标
              for (let vi = 0; vi < 12; vi += 3) {
                positions.push(
                  x + verts[vi] + 0.5,     // 转换到方块中心对齐
                  y + verts[vi + 1] + 0.5,
                  z + verts[vi + 2] + 0.5,
                );
                colors.push(r, g, b);
              }
              // UV
              for (let ui = 0; ui < 8; ui += 2) {
                uvs.push(UVS[ui], UVS[ui + 1]);
              }
              // 索引（两个三角形）
              indices.push(
                vertCount, vertCount + 1, vertCount + 2,
                vertCount, vertCount + 2, vertCount + 3,
              );
              vertCount += 4;
            }
          }
        }
      }
    }

    // 移除旧网格
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }

    if (vertCount === 0) {
      this.mesh = null;
      return;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      flatShading: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(this.ox, 0, this.oz);
    this.mesh.frustumCulled = true;
    this.mesh.name = `chunk_${this.cx}_${this.cz}`;
  }

  /** 销毁网格 */
  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
  }
}