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
};