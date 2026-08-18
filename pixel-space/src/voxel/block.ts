// 方块类型定义
export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  BEDROCK = 4,
  SAND = 5,
  WOOD = 6,
  LEAVES = 7,
  // New blocks for biomes, water, trees
  WATER = 8,
  SNOW = 9,
  ICE = 10,
  SANDSTONE = 11,
  // Log variants
  OAK_LOG = 12,
  BIRCH_LOG = 13,
  SPRUCE_LOG = 14,
  JUNGLE_LOG = 15,
  // Leaf variants
  OAK_LEAVES = 16,
  BIRCH_LEAVES = 17,
  SPRUCE_LEAVES = 18,
  JUNGLE_LEAVES = 19,
  // Vegetation
  GRASS_TALL = 20,
  FERN = 21,
  FLOWER = 22,
  // Underwater
  KELP = 23,
  SEAGRASS = 24,
}

export interface BlockDef {
  id: BlockType;
  name: string;
  /** 顶面颜色 */
  topColor: number;
  /** 侧面颜色 */
  sideColor: number;
  /** 底面颜色 */
  bottomColor: number;
  /** 是否透明（不剔除相邻面） */
  transparent: boolean;
  /** 是否实体（阻挡角色） */
  solid: boolean;
}

export const BLOCKS: Record<BlockType, BlockDef> = {
  [BlockType.AIR]: {
    id: BlockType.AIR, name: '空气',
    topColor: 0, sideColor: 0, bottomColor: 0,
    transparent: true, solid: false,
  },
  [BlockType.GRASS]: {
    id: BlockType.GRASS, name: '草方块',
    topColor: 0x7c9c5e, sideColor: 0x8b7355, bottomColor: 0x8b7355,
    transparent: false, solid: true,
  },
  [BlockType.DIRT]: {
    id: BlockType.DIRT, name: '泥土',
    topColor: 0x8b7355, sideColor: 0x8b7355, bottomColor: 0x8b7355,
    transparent: false, solid: true,
  },
  [BlockType.STONE]: {
    id: BlockType.STONE, name: '石头',
    topColor: 0x808080, sideColor: 0x808080, bottomColor: 0x808080,
    transparent: false, solid: true,
  },
  [BlockType.BEDROCK]: {
    id: BlockType.BEDROCK, name: '基岩',
    topColor: 0x404040, sideColor: 0x404040, bottomColor: 0x404040,
    transparent: false, solid: true,
  },
  [BlockType.SAND]: {
    id: BlockType.SAND, name: '沙子',
    topColor: 0xe8d68c, sideColor: 0xe8d68c, bottomColor: 0xe8d68c,
    transparent: false, solid: true,
  },
  [BlockType.WOOD]: {
    id: BlockType.WOOD, name: '木头',
    topColor: 0xc4a56a, sideColor: 0xc4a56a, bottomColor: 0xc4a56a,
    transparent: false, solid: true,
  },
  [BlockType.LEAVES]: {
    id: BlockType.LEAVES, name: '树叶',
    topColor: 0x4a7c3f, sideColor: 0x4a7c3f, bottomColor: 0x4a7c3f,
    transparent: true, solid: true,
  },
  [BlockType.WATER]: {
    id: BlockType.WATER, name: '水',
    topColor: 0x3a8fd6, sideColor: 0x3a8fd6, bottomColor: 0x2a6fb6,
    transparent: true, solid: false,
  },
  [BlockType.SNOW]: {
    id: BlockType.SNOW, name: '雪',
    topColor: 0xffffff, sideColor: 0xffffff, bottomColor: 0xffffff,
    transparent: false, solid: true,
  },
  [BlockType.ICE]: {
    id: BlockType.ICE, name: '冰',
    topColor: 0x8fdfff, sideColor: 0x8fdfff, bottomColor: 0x8fdfff,
    transparent: true, solid: true,
  },
  [BlockType.SANDSTONE]: {
    id: BlockType.SANDSTONE, name: '砂岩',
    topColor: 0xd4c19a, sideColor: 0xd4c19a, bottomColor: 0xd4c19a,
    transparent: false, solid: true,
  },
  [BlockType.OAK_LOG]: {
    id: BlockType.OAK_LOG, name: '橡木原木',
    topColor: 0x8b6b42, sideColor: 0x8b6b42, bottomColor: 0x8b6b42,
    transparent: false, solid: true,
  },
  [BlockType.BIRCH_LOG]: {
    id: BlockType.BIRCH_LOG, name: '桦木原木',
    topColor: 0xffffff, sideColor: 0xffffff, bottomColor: 0xffffff,
    transparent: false, solid: true,
  },
  [BlockType.SPRUCE_LOG]: {
    id: BlockType.SPRUCE_LOG, name: '云杉原木',
    topColor: 0x3d2b1f, sideColor: 0x3d2b1f, bottomColor: 0x3d2b1f,
    transparent: false, solid: true,
  },
  [BlockType.JUNGLE_LOG]: {
    id: BlockType.JUNGLE_LOG, name: '丛林原木',
    topColor: 0x6b4a2b, sideColor: 0x6b4a2b, bottomColor: 0x6b4a2b,
    transparent: false, solid: true,
  },
  [BlockType.OAK_LEAVES]: {
    id: BlockType.OAK_LEAVES, name: '橡树叶',
    topColor: 0x4a7c3f, sideColor: 0x4a7c3f, bottomColor: 0x4a7c3f,
    transparent: true, solid: true,
  },
  [BlockType.BIRCH_LEAVES]: {
    id: BlockType.BIRCH_LEAVES, name: '桦树叶',
    topColor: 0x6ab85e, sideColor: 0x6ab85e, bottomColor: 0x6ab85e,
    transparent: true, solid: true,
  },
  [BlockType.SPRUCE_LEAVES]: {
    id: BlockType.SPRUCE_LEAVES, name: '云杉叶',
    topColor: 0x2d5c2a, sideColor: 0x2d5c2a, bottomColor: 0x2d5c2a,
    transparent: true, solid: true,
  },
  [BlockType.JUNGLE_LEAVES]: {
    id: BlockType.JUNGLE_LEAVES, name: '丛林叶',
    topColor: 0x3a6e2f, sideColor: 0x3a6e2f, bottomColor: 0x3a6e2f,
    transparent: true, solid: true,
  },
  [BlockType.GRASS_TALL]: {
    id: BlockType.GRASS_TALL, name: '高草',
    topColor: 0x7c9c5e, sideColor: 0x7c9c5e, bottomColor: 0x7c9c5e,
    transparent: true, solid: false,
  },
  [BlockType.FERN]: {
    id: BlockType.FERN, name: '蕨类',
    topColor: 0x4a7c3f, sideColor: 0x4a7c3f, bottomColor: 0x4a7c3f,
    transparent: true, solid: false,
  },
  [BlockType.FLOWER]: {
    id: BlockType.FLOWER, name: '花',
    topColor: 0xff6b6b, sideColor: 0xff6b6b, bottomColor: 0xff6b6b,
    transparent: true, solid: false,
  },
  [BlockType.KELP]: {
    id: BlockType.KELP, name: '海带',
    topColor: 0x2d5c1a, sideColor: 0x2d5c1a, bottomColor: 0x2d5c1a,
    transparent: true, solid: false,
  },
  [BlockType.SEAGRASS]: {
    id: BlockType.SEAGRASS, name: '海草',
    topColor: 0x3a7c2e, sideColor: 0x3a7c2e, bottomColor: 0x3a7c2e,
    transparent: true, solid: false,
  },
};