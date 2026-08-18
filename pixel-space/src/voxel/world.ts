import * as THREE from 'three';
import { BlockType, BLOCKS } from './block';
import { fbm2 } from '../noise';
import { Chunk } from './chunk';

// 区块尺寸（Minecraft 风格）
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;  // Y: 0-255

// 活跃区块半径（玩家周围保持生成的区块数）
const ACTIVE_RADIUS = 4;  // 4个区块 = 64格
const CHUNKS_PER_FRAME = 2; // 每帧处理的区块数

// 生物群系类型
enum BiomeType {
  OCEAN = 0,
  BEACH = 1,
  PLAINS = 2,
  FOREST = 3,
  TAIGA = 4,
  MOUNTAINS = 5,
  DESERT = 6,
  SWAMP = 7,
}

// 生物群系定义
interface BiomeDef {
  id: BiomeType;
  name: string;
  surfaceBlock: BlockType;
  subSurfaceBlock: BlockType;
  treeType: BlockType | null;  // 原木类型
  leafType: BlockType | null;  // 树叶类型
  treeDensity: number;         // 树木密度 (0-1)
  waterLevel: number;          // 水面高度
  minHeight: number;
  maxHeight: number;
}

const BIOMES: Record<BiomeType, BiomeDef> = {
  [BiomeType.OCEAN]: {
    id: BiomeType.OCEAN,
    name: '海洋',
    surfaceBlock: BlockType.SAND,
    subSurfaceBlock: BlockType.SAND,
    treeType: null,
    leafType: null,
    treeDensity: 0,
    waterLevel: 63,
    minHeight: 0,
    maxHeight: 62,
  },
  [BiomeType.BEACH]: {
    id: BiomeType.BEACH,
    name: '海滩',
    surfaceBlock: BlockType.SAND,
    subSurfaceBlock: BlockType.SAND,
    treeType: null,
    leafType: null,
    treeDensity: 0,
    waterLevel: 63,
    minHeight: 62,
    maxHeight: 65,
  },
  [BiomeType.PLAINS]: {
    id: BiomeType.PLAINS,
    name: '平原',
    surfaceBlock: BlockType.GRASS,
    subSurfaceBlock: BlockType.DIRT,
    treeType: BlockType.OAK_LOG,
    leafType: BlockType.OAK_LEAVES,
    treeDensity: 0.02,
    waterLevel: 63,
    minHeight: 63,
    maxHeight: 85,
  },
  [BiomeType.FOREST]: {
    id: BiomeType.FOREST,
    name: '森林',
    surfaceBlock: BlockType.GRASS,
    subSurfaceBlock: BlockType.DIRT,
    treeType: BlockType.OAK_LOG,
    leafType: BlockType.OAK_LEAVES,
    treeDensity: 0.12,
    waterLevel: 63,
    minHeight: 63,
    maxHeight: 90,
  },
  [BiomeType.TAIGA]: {
    id: BiomeType.TAIGA,
    name: '针叶林',
    surfaceBlock: BlockType.GRASS,
    subSurfaceBlock: BlockType.DIRT,
    treeType: BlockType.SPRUCE_LOG,
    leafType: BlockType.SPRUCE_LEAVES,
    treeDensity: 0.15,
    waterLevel: 63,
    minHeight: 63,
    maxHeight: 100,
  },
  [BiomeType.MOUNTAINS]: {
    id: BiomeType.MOUNTAINS,
    name: '山脉',
    surfaceBlock: BlockType.STONE,
    subSurfaceBlock: BlockType.STONE,
    treeType: BlockType.SPRUCE_LOG,
    leafType: BlockType.SPRUCE_LEAVES,
    treeDensity: 0.03,
    waterLevel: 63,
    minHeight: 90,
    maxHeight: 200,
  },
  [BiomeType.DESERT]: {
    id: BiomeType.DESERT,
    name: '沙漠',
    surfaceBlock: BlockType.SAND,
    subSurfaceBlock: BlockType.SANDSTONE,
    treeType: null,
    leafType: null,
    treeDensity: 0,
    waterLevel: 63,
    minHeight: 63,
    maxHeight: 85,
  },
  [BiomeType.SWAMP]: {
    id: BiomeType.SWAMP,
    name: '沼泽',
    surfaceBlock: BlockType.DIRT,
    subSurfaceBlock: BlockType.DIRT,
    treeType: BlockType.OAK_LOG,
    leafType: BlockType.OAK_LEAVES,
    treeDensity: 0.08,
    waterLevel: 64,
    minHeight: 62,
    maxHeight: 75,
  },
};

/**
 * 区块管理器：无限流式生成、持久化区块、生物群系、树木生成
 */
export class ChunkManager {
  /** 所有已生成的区块（永久保存，Minecraft 风格） */
  private chunks = new Map<string, Chunk>();
  /** 区块的 Mesh 容器 */
  readonly group = new THREE.Group();
  /** 世界种子 */
  readonly seed: number;
  /** 玩家当前所在区块坐标 */
  private playerChunkX = 0;
  private playerChunkZ = 0;
  /** 待生成区块队列（按距离玩家排序） */
  private generationQueue: Array<{ cx: number; cz: number; priority: number }> = [];
  /** 待构建网格的区块键队列 */
  private pendingMeshKeys: string[] = [];
  /** 是否正在异步构建网格 */
  private isBuildingMeshes = false;
  /** 生成进度（0-1） */
  generateProgress = 0;
  /** 是否已完成初始区块生成 */
  private initialGenerationDone = false;
  /** 异步构建回调 */
  private buildResolve: (() => void) | null = null;
  /** 已生成区块的生物群系缓存 */
  private biomeCache = new Map<string, BiomeType>();

  constructor(seed: number) {
    this.seed = seed;
  }

  /** 检查初始区块生成是否完成 */
  get ready(): boolean {
    return this.initialGenerationDone && this.pendingMeshKeys.length === 0 && !this.isBuildingMeshes;
  }

  /** 世界坐标 → 区块坐标 */
  private chunkCoord(wx: number, wz: number): [number, number] {
    return [Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE)];
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /**
   * 更新玩家位置，触发区块生成/加载
   * @param wx 世界 X 坐标
   * @param wz 世界 Z 坐标
   */
  updatePlayerPosition(wx: number, wz: number) {
    const [cx, cz] = this.chunkCoord(wx, wz);
    if (cx === this.playerChunkX && cz === this.playerChunkZ) return;
    this.playerChunkX = cx;
    this.playerChunkZ = cz;
    this.queueSurroundingChunks();
  }

  /** 将玩家周围 ACTIVE_RADIUS 范围内的区块加入生成队列 */
  private queueSurroundingChunks() {
    const newChunks: Array<{ cx: number; cz: number; priority: number }> = [];

    for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
      for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++) {
        const cx = this.playerChunkX + dx;
        const cz = this.playerChunkZ + dz;
        const key = this.chunkKey(cx, cz);

        // 已存在则跳过
        if (this.chunks.has(key)) continue;

        // 计算优先级（距离玩家越近优先级越高）
        const distSq = dx * dx + dz * dz;
        newChunks.push({ cx, cz, priority: distSq });
      }
    }

    // 按优先级排序（近的先生成）
    newChunks.sort((a, b) => a.priority - b.priority);
    this.generationQueue.push(...newChunks);
  }

  /** 生成单个区块的方块数据 */
  private generateChunk(cx: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cz);
    const key = this.chunkKey(cx, cz);

    // 确定区块中心的生物群系
    const biome = this.getBiomeAtChunk(cx, cz);
    const biomeDef = BIOMES[biome];

    // 预计算高度图
    const heightMap = this.computeHeightMap(cx, cz, biome);

    // 填充区块方块
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const h = heightMap[lx][lz];

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let type: BlockType = BlockType.AIR;

          if (y === 0) {
            type = BlockType.BEDROCK;
          } else if (y < h - 4) {
            type = BlockType.STONE;
          } else if (y < h - 1) {
            type = biomeDef.subSurfaceBlock;
          } else if (y === h - 1) {
            // 水面处理
            if (h - 1 <= biomeDef.waterLevel && biome !== BiomeType.OCEAN && biome !== BiomeType.BEACH) {
              type = BlockType.WATER;
            } else {
              type = biomeDef.surfaceBlock;
            }
          } else if (y <= biomeDef.waterLevel && (biome === BiomeType.OCEAN || biome === BiomeType.BEACH || biome === BiomeType.SWAMP)) {
            type = BlockType.WATER;
          }

          chunk.setBlock(lx, y, lz, type);
        }
      }
    }

    // 生成树木（在区块数据生成后，网格构建前）
    this.generateTrees(chunk, cx, cz, biome, heightMap);

    this.chunks.set(key, chunk);
    return chunk;
  }

  /** 计算区块的高度图 */
  private computeHeightMap(cx: number, cz: number, biome: BiomeType): number[][] {
    const heightMap: number[][] = [];
    const biomeDef = BIOMES[biome];

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      heightMap[lx] = [];
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;

        // 基础大陆噪声
        const continent = fbm2(wx * 0.001, wz * 0.001, this.seed, 4) * 80;
        // 山脉噪声
        const mountains = this.ridged(wx * 0.003, wz * 0.003, this.seed + 3) * 40;
        // 细节噪声
        const detail = fbm2(wx * 0.02, wz * 0.02, this.seed + 9, 2) * 4;

        let h = 64 + continent + mountains + detail;

        // 根据生物群系限制高度
        h = Math.max(biomeDef.minHeight, Math.min(biomeDef.maxHeight, Math.floor(h)));

        // 海洋强制在水面以下
        if (biome === BiomeType.OCEAN) {
          h = Math.min(h, biomeDef.waterLevel - 1);
        }
        // 海滩在水面附近
        if (biome === BiomeType.BEACH) {
          h = Math.max(biomeDef.waterLevel - 2, Math.min(biomeDef.waterLevel + 3, h));
        }

        heightMap[lx][lz] = h;
      }
    }
    return heightMap;
  }

  /** 获取区块坐标对应的生物群系 */
  private getBiomeAtChunk(cx: number, cz: number): BiomeType {
    const key = this.chunkKey(cx, cz);
    const cached = this.biomeCache.get(key);
    if (cached !== undefined) return cached;

    // 使用区块中心坐标采样温度和湿度
    const wx = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
    const wz = cz * CHUNK_SIZE + CHUNK_SIZE / 2;

    // 温度噪声 (0-1)
    const temp = (fbm2(wx * 0.0005, wz * 0.0005, this.seed + 100, 3) + 1) * 0.5;
    // 湿度噪声 (0-1)
    const moisture = (fbm2(wx * 0.0005, wz * 0.0005, this.seed + 200, 3) + 1) * 0.5;
    // 大陆性噪声 (决定是否为海洋)
    const continental = fbm2(wx * 0.001, wz * 0.001, this.seed + 300, 3);

    let biome: BiomeType;

    // 海洋判定（大陆性噪声低）
    if (continental < -0.3) {
      biome = BiomeType.OCEAN;
    }
    // 海滩（海边过渡带）
    else if (continental < -0.15) {
      biome = BiomeType.BEACH;
    }
    // 陆地生物群系（基于温度和湿度）
    else if (temp < 0.3) {
      biome = moisture > 0.5 ? BiomeType.TAIGA : BiomeType.TAIGA;
    }
    else if (temp < 0.5) {
      if (moisture > 0.7) biome = BiomeType.SWAMP;
      else if (moisture > 0.4) biome = BiomeType.FOREST;
      else biome = BiomeType.PLAINS;
    }
    else if (temp < 0.7) {
      if (moisture > 0.7) biome = BiomeType.SWAMP;
      else if (moisture > 0.4) biome = BiomeType.FOREST;
      else biome = BiomeType.PLAINS;
    }
    else {
      if (moisture > 0.5) biome = BiomeType.SWAMP;
      else biome = BiomeType.DESERT;
    }

    // 高山覆盖（基于高度噪声）
    const heightNoise = fbm2(wx * 0.001, wz * 0.001, this.seed + 400, 3);
    if (heightNoise > 0.6 && biome !== BiomeType.OCEAN && biome !== BiomeType.BEACH) {
      biome = BiomeType.MOUNTAINS;
    }

    this.biomeCache.set(key, biome);
    return biome;
  }

  /** 在区块中生成树木 */
  private generateTrees(chunk: Chunk, cx: number, cz: number, biome: BiomeType, heightMap: number[][]) {
    const biomeDef = BIOMES[biome];
    if (!biomeDef.treeType || biomeDef.treeDensity === 0) return;

    const logType = biomeDef.treeType;
    const leafType = biomeDef.leafType!;

    // 使用确定性随机决定树木位置
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const h = heightMap[lx][lz];

        // 树木只能生长在表面方块上
        const surfaceBlock = chunk.getBlock(lx, h, lz);
        if (surfaceBlock !== biomeDef.surfaceBlock && surfaceBlock !== biomeDef.subSurfaceBlock) continue;

        // 不在水中生成
        if (h <= biomeDef.waterLevel) continue;

        // 确定性随机：基于世界坐标的哈希
        const hash = this.hash2(wx, wz);
        if (hash > biomeDef.treeDensity) continue;

        // 树木高度变化
        const heightHash = this.hash2(wx + 1000, wz + 1000);
        const treeHeight = 5 + Math.floor(heightHash * 4); // 5-8 高度

        // 生成树干
        for (let y = 1; y <= treeHeight; y++) {
          if (h + y >= CHUNK_HEIGHT) break;
          chunk.setBlock(lx, h + y, lz, logType);
        }

        // 生成树叶（根据树种类型）
        this.generateLeaves(chunk, lx, lz, h + treeHeight, leafType, biomeDef);
      }
    }
  }

  /** 生成树叶 */
  private generateLeaves(chunk: Chunk, lx: number, lz: number, topY: number, leafType: BlockType, biomeDef: BiomeDef) {
    // 简单的球形树叶生成
    const leafRadius = biomeDef.id === BiomeType.TAIGA ? 2 : 3; // 云杉较细

    for (let dy = -leafRadius; dy <= leafRadius; dy++) {
      const y = topY + dy;
      if (y < 0 || y >= CHUNK_HEIGHT) continue;

      const radius = leafRadius - Math.abs(dy) * 0.5;
      const rInt = Math.ceil(radius);

      for (let dx = -rInt; dx <= rInt; dx++) {
        for (let dz = -rInt; dz <= rInt; dz++) {
          const distSq = dx * dx + dz * dz;
          if (distSq > radius * radius + 0.5) continue;

          const nx = lx + dx;
          const nz = lz + dz;

          // 跨区块处理：如果超出当前区块边界，标记邻居区块需要更新
          if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
            // 跨区块树叶 - 在后续处理中会由邻居区块生成
            // 这里只在当前区块内生成
            continue;
          }

          // 只在空气中放置树叶
          if (chunk.getBlock(nx, y, nz) === BlockType.AIR) {
            chunk.setBlock(nx, y, nz, leafType);
          }
        }
      }
    }
  }

  /** 简单的 2D 哈希函数 */
  private hash2(x: number, z: number): number {
    let n = (x * 123457 + z * 789233 + this.seed * 456789) & 0x7fffffff;
    n = (n ^ (n >> 13)) * 0x5bd1e995;
    n = (n ^ (n >> 15)) * 0x5bd1e995;
    n = n ^ (n >> 15);
    return (n & 0x7fffffff) / 0x7fffffff;
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

  /** 开始初始区块生成（游戏启动时调用） */
  async initializeAt(wx: number, wz: number): Promise<void> {
    this.updatePlayerPosition(wx, wz);
    await this.generateInitialChunks();
    await this.buildMeshesAsync();
  }

  /** 生成初始区块（玩家周围 ACTIVE_RADIUS 范围） */
  private async generateInitialChunks(): Promise<void> {
    // 先生成所有区块数据
    while (this.generationQueue.length > 0) {
      const item = this.generationQueue.shift()!;
      this.generateChunk(item.cx, item.cz);
    }
    this.initialGenerationDone = true;
  }

  /** 异步构建所有待处理区块的网格 */
  buildMeshesAsync(): Promise<void> {
    // 收集所有需要构建网格的区块
    this.pendingMeshKeys = [];
    for (const [key, chunk] of this.chunks) {
      if (chunk.dirty || !chunk.mesh) {
        this.pendingMeshKeys.push(key);
      }
    }

    if (this.pendingMeshKeys.length === 0) return Promise.resolve();
    if (this.isBuildingMeshes) return Promise.resolve();

    this.isBuildingMeshes = true;
    this.generateProgress = 0;

    return new Promise<void>((resolve) => {
      this.buildResolve = resolve;
      this.processNextMeshes();
    });
  }

  /** 处理下一批区块网格构建 */
  private processNextMeshes() {
    const totalChunks = this.pendingMeshKeys.length + this.countBuiltMeshes();

    for (let i = 0; i < CHUNKS_PER_FRAME && this.pendingMeshKeys.length > 0; i++) {
      const key = this.pendingMeshKeys.shift()!;
      const [cx, cz] = key.split(',').map(Number);
      this.buildChunkMesh(cx, cz);
    }

    // 更新进度
    const built = this.countBuiltMeshes();
    this.generateProgress = totalChunks > 0 ? built / totalChunks : 1;

    if (this.pendingMeshKeys.length > 0) {
      setTimeout(() => this.processNextMeshes(), 0);
    } else {
      this.isBuildingMeshes = false;
      this.generateProgress = 1;
      if (this.buildResolve) {
        this.buildResolve();
        this.buildResolve = null;
      }
    }
  }

  private countBuiltMeshes(): number {
    let count = 0;
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh) count++;
    }
    return count;
  }

  /** 构建单个区块网格并添加到组 */
  private buildChunkMesh(cx: number, cz: number) {
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return;

    // 收集邻居区块（用于面剔除）
    const neighbors = new Map<string, Chunk>();
    for (const [dcx, dcz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nc = this.chunks.get(this.chunkKey(cx + dcx, cz + dcz));
      if (nc) neighbors.set(this.chunkKey(cx + dcx, cz + dcz), nc);
    }

    chunk.rebuildMesh(neighbors);
    // 添加实体方块网格
    if (chunk.mesh) {
      this.group.add(chunk.mesh);
    }
    // 添加水网格
    if (chunk.waterMesh) {
      this.group.add(chunk.waterMesh);
    }
  }

  /** 获取方块类型（世界坐标） */
  getBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockType.AIR;
    const [cx, cz] = this.chunkCoord(wx, wz);
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return BlockType.AIR;
    return chunk.getBlock(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE);
  }

  /** 设置方块 */
  setBlock(wx: number, wy: number, wz: number, type: BlockType) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
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
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (this.isSolid(wx, y, wz)) return y + 1;
    }
    return 0;
  }

  /** 判断坐标是否在水中 */
  isWater(wx: number, wy: number, wz: number): boolean {
    const t = this.getBlock(wx, wy, wz);
    return t === BlockType.WATER;
  }

  /** 重建单个区块网格 */
  rebuildChunk(cx: number, cz: number) {
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return;
    // 收集邻居区块
    const neighbors = new Map<string, Chunk>();
    for (const [dcx, dcz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nc = this.chunks.get(this.chunkKey(cx + dcx, cz + dcz));
      if (nc) neighbors.set(this.chunkKey(cx + dcx, cz + dcz), nc);
    }
    chunk.rebuildMesh(neighbors);
    // 更新 group 中的 mesh
    if (chunk.mesh) {
      this.group.add(chunk.mesh);
    }
    if (chunk.waterMesh) {
      this.group.add(chunk.waterMesh);
    }
  }

  /** 获取所有区块 Mesh（用于射线检测） */
  getMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh) meshes.push(chunk.mesh);
      if (chunk.waterMesh) meshes.push(chunk.waterMesh);
    }
    return meshes;
  }

  /** 获取指定坐标的生物群系 */
  getBiomeAt(wx: number, wz: number): BiomeType {
    const [cx, cz] = this.chunkCoord(wx, wz);
    return this.getBiomeAtChunk(cx, cz);
  }

  /** 游戏结束清理 */
  dispose() {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();
    this.biomeCache.clear();
    this.generationQueue = [];
    this.pendingMeshKeys = [];
    this.group.clear();
  }

  /** 获取已加载区块数量 */
  getLoadedChunkCount(): number {
    return this.chunks.size;
  }
}