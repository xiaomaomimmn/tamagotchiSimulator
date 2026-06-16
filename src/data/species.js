// 68 个物种：每个生态 17 个
//   = 4 (主食 A) + 4 (主食 B) + 4 (主食 C) + 4 (杂食) + 1 (隐藏)
//
// 物种由【生态 + 喂食模式】决定，每个 (生态, 喂食模式) 槽位 4 个物种均等出现。
// 隐藏物种需「特殊条件」（具体规则用户后续可补），单独成组显示。

import { get, set, k } from '../storage.js';
import { BIOMES } from './biomes.js';

const DEFAULT_FACE_POS = { x: 0, y: -16 }; // 128 像素画布下面部默认稍上移 16 像素
const TIERS = [
  { mode: 'A',        prefix: '甲', count: 4 },
  { mode: 'B',        prefix: '乙', count: 4 },
  { mode: 'C',        prefix: '丙', count: 4 },
  { mode: 'omnivore', prefix: '杂', count: 4 },
  { mode: 'hidden',   prefix: '隐', count: 1 },
];

const BIOME_LABELS = {
  land:   '陆地',
  water:  '海洋',
  sky:    '天空',
  forest: '翠林',
};

function buildBiome(biome) {
  const biomeChar = BIOME_LABELS[biome];
  const out = [];
  for (const tier of TIERS) {
    for (let i = 0; i < tier.count; i++) {
      const idx = String(i + 1).padStart(2, '0');
      out.push({
        id: `sp_${biome[0]}_${tier.mode}${i + 1}`,
        name: tier.mode === 'hidden'
          ? `${biomeChar}·${tier.prefix}藏`
          : `${biomeChar}·${tier.prefix}${idx}`,
        biome,
        foodMode: tier.mode,
        foodIdx: i,
      });
    }
  }
  return out;
}

// 跟随 BIOMES 顺序枚举（陆/天/水/森），保持 SPECIES 与 BIOMES 显示顺序一致。
// 因为 faces.js 按 SPECIES 下标 1:1 映射面部名，所以这个顺序也决定 fc_01..fc_68 的名字。
export const SPECIES = BIOMES.flatMap(b => buildBiome(b.id));

export function speciesByBiome(biomeId) {
  return SPECIES.filter(s => s.biome === biomeId);
}

export function speciesById(id) {
  return SPECIES.find(s => s.id === id);
}

export function speciesByBiomeAndMode(biomeId, foodMode) {
  return SPECIES.filter(s => s.biome === biomeId && s.foodMode === foodMode);
}

export function hiddenSpeciesByBiome(biomeId) {
  return SPECIES.find(s => s.biome === biomeId && s.foodMode === 'hidden');
}

export function facePosOf(speciesId) {
  return get(k.facePos(speciesId)) || { ...DEFAULT_FACE_POS };
}

// 物种名：用户可自定义，存 IndexedDB 的 name:<id>。未自定义则用代码默认值。
export function nameOf(speciesId) {
  const custom = get(`name:${speciesId}`);
  if (custom && typeof custom === 'string' && custom.trim()) return custom;
  return speciesById(speciesId)?.name || speciesId;
}

export async function setName(speciesId, name) {
  const trimmed = (name || '').trim();
  if (trimmed) await set(`name:${speciesId}`, trimmed);
  else await set(`name:${speciesId}`, null);  // 空 = 还原默认
}

// 每个面部在 SPECIES 列表中的对应物种 id（按下标 1:1 对应）
export function speciesAtFaceIndex(faceIndex) {
  return SPECIES[faceIndex];
}
