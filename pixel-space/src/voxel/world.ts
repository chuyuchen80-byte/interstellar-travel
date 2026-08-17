import * as THREE from 'three';
import { BlockType, BLOCKS } from './block';
import { fbm2 } from '../noise';
import { Chunk } from './chunk';

// 世界配置
const WORLD_WIDTH = 64;   // x 方向方块数（4个区块）
const WORLD_DEPTH = 64;   // z 方向方块数（4个区块）
const WORLD_HEIGHT = 24;  // y 方向方块数

const CHUNK_SIZE = 16;     // 每个区块边长（方块数）

/**
 * 体素世界：管理方块数据、区块网格生成、地形生成、交互与碰撞查询。
 */
export class VoxelWorld {
  /** 所有已加载区块 */
  private chunks = new Map<string, Chunk>();
  /** 区块的 Mesh 容器（用于射线检测和添加到场景） */
  readonly group = new THREE.Group();
  /** 地形生成种子 */
  readonly seed: number;
  /** 世界边界 */
  readonly width: number;
  readonly depth: number;
  readonly height: number;

  private meshes: THREE.Mesh[] = [];
  private neighborChunks = new Map<string, Chunk>();

  constructor(seed: number, width = WORLD_WIDTH, depth = WORLD_DEPTH, height = WORLD_HEIGHT) {
    this.seed = seed;
    this.width = width;
    this.depth = depth;
    this.height = height;
  }

  /** 世界坐标 → 区块坐标 */
  private chunkCoord(wx: number, wz: number): [number, number] {
    return [Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE)];
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /** 生成地形（所有区块） */
  generate() {
    const spanW = Math.ceil(this.width / CHUNK_SIZE);
    const spanD = Math.ceil(this.depth / CHUNK_SIZE);
    // 预生成高度图（缓存，避免重复计算噪声）
    const heightMap: number[][] = [];
    for (let x = 0; x < this.width; x++) {
      heightMap[x] = [];
      for (let z = 0; z < this.depth; z++) {
        heightMap[x][z] = this.computeHeight(x, z);
      }
    }

    // 生成区块数据
    for (let cx = 0; cx < spanW; cx++) {
      for (let cz = 0; cz < spanD; cz++) {
        const chunk = new Chunk(cx, cz);
        this.chunks.set(this.chunkKey(cx, cz), chunk);
        // 填充区块方块
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const wx = cx * CHUNK_SIZE + lx;
            const wz = cz * CHUNK_SIZE + lz;
            if (wx >= this.width || wz >= this.depth) continue;
            const h = heightMap[wx][wz];

            for (let y = 0; y < this.height; y++) {
              let type: BlockType = BlockType.AIR;
              if (y === 0) {
                type = BlockType.BEDROCK;
              } else if (y < h - 3) {
                type = BlockType.STONE;
              } else if (y < h) {
                type = BlockType.DIRT;
              } else if (y === h) {
                type = BlockType.GRASS;
              }
              chunk.setBlock(lx, y, lz, type);
            }
          }
        }
      }
    }

    // 构建所有区块网格
    this.rebuildAll();
  }

  /** 基于种子和坐标计算地形高度 */
  private computeHeight(x: number, z: number): number {
    // 使用与 terrain.ts 一致的噪声强度
    const continent = fbm2(x * 0.006, z * 0.006, this.seed, 4) * 20;
    const mountains = this.ridged(x * 0.018, z * 0.018, this.seed + 3) * 6;
    const detail = fbm2(x * 0.08, z * 0.08, this.seed + 9, 2) * 2;
    // 高度范围：最低 4（砂层区），最高 26
    let h = 6 + continent + mountains + detail;
    h = Math.max(4, Math.min(this.height - 2, Math.floor(h)));
    return h;
  }

  /** 简易山脊噪声 */
  private ridged(x: number, z: number, seed: number): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let oct = 0; oct < 4; oct++) {
      const n = fbm2(x * f, z * f, seed + oct * 101, 2);
      sum += (1 - Math.abs(n * 2 - 1)) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  /** 获取方块类型（世界坐标） */
  getBlock(wx: number, wy: number, wz: number): BlockType {
    if (wx < 0 || wx >= this.width || wz < 0 || wz >= this.depth || wy < 0 || wy >= this.height) {
      return BlockType.AIR;
    }
    const [cx, cz] = this.chunkCoord(wx, wz);
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return BlockType.AIR;
    return chunk.getBlock(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE);
  }

  /** 设置方块 */
  setBlock(wx: number, wy: number, wz: number, type: BlockType) {
    if (wx < 0 || wx >= this.width || wz < 0 || wz >= this.depth || wy < 0 || wy >= this.height) return;
    const [cx, cz] = this.chunkCoord(wx, wz);
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return;
    chunk.setBlock(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE, type);
    // 标记邻居区块也需重建（面剔除可能受影响）
    for (const [dcx, dcz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nc = this.chunks.get(this.chunkKey(cx + dcx, cz + dcz));
      if (nc) nc.dirty = true;
    }
    this.rebuildChunk(cx, cz);
  }

  /** 判断方块是否实体 */
  isSolid(wx: number, wy: number, wz: number): boolean {
    const t = this.getBlock(wx, wy, wz);
    if (t === BlockType.AIR) return false;
    return BLOCKS[t].solid;
  }

  /** 获取某列的最高实体方块高度（用于角色站立） */
  getHeightAt(wx: number, wz: number): number {
    for (let y = this.height - 1; y >= 0; y--) {
      if (this.isSolid(wx, y, wz)) return y + 1;
    }
    return 0;
  }

  /** 重建单个区块网格 */
  rebuildChunk(cx: number, cz: number) {
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return;
    // 收集邻居区块
    this.neighborChunks.clear();
    for (const [dcx, dcz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nc = this.chunks.get(this.chunkKey(cx + dcx, cz + dcz));
      if (nc) this.neighborChunks.set(this.chunkKey(cx + dcx, cz + dcz), nc);
    }
    chunk.rebuildMesh(this.neighborChunks);
    // 更新 group 中的 mesh
    if (chunk.mesh) {
      this.group.add(chunk.mesh);
    }
  }

  /** 重建所有区块网格 */
  rebuildAll() {
    this.group.clear();
    this.meshes = [];
    for (const [key, chunk] of this.chunks) {
      // 收集全部邻居
      this.neighborChunks.clear();
      for (const c of this.chunks.values()) {
        const dcx = c.cx - chunk.cx;
        const dcz = c.cz - chunk.cz;
        if (Math.abs(dcx) <= 1 && Math.abs(dcz) <= 1) {
          this.neighborChunks.set(this.chunkKey(c.cx, c.cz), c);
        }
      }
      chunk.rebuildMesh(this.neighborChunks);
      if (chunk.mesh) {
        this.group.add(chunk.mesh);
        this.meshes.push(chunk.mesh);
      }
    }
  }

  /** 获取所有区块 Mesh（用于射线检测） */
  getMeshes(): THREE.Mesh[] {
    return this.meshes;
  }

  /** 世界坐标是否在世界边界内 */
  inBounds(wx: number, wy: number, wz: number): boolean {
    return wx >= 0 && wx < this.width && wz >= 0 && wz < this.depth && wy >= 0 && wy < this.height;
  }

  /** 游戏结束清理 */
  dispose() {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();
    this.group.clear();
    this.meshes = [];
  }

  /** 世界尺寸（区块数量） */
  getChunkSpan(): [number, number, number] {
    return [
      Math.ceil(this.width / CHUNK_SIZE),
      Math.ceil(this.height / CHUNK_SIZE),
      Math.ceil(this.depth / CHUNK_SIZE),
    ];
  }
}