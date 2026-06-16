import { get, set } from '../storage.js';

// 显示顺序：陆地 → 天空 → 海洋 → 翠林
export const BIOMES = [
  {
    id: 'land', name: '陆地', emoji: '🌱',
    foodCategories: [
      { key: 'A', name: '谷物' },
      { key: 'B', name: '蔬菜' },
      { key: 'C', name: '肉类' },
    ],
  },
  {
    id: 'sky', name: '天空', emoji: '☁️',
    foodCategories: [
      { key: 'A', name: '云果' },
      { key: 'B', name: '星尘' },
      { key: 'C', name: '风籽' },
    ],
  },
  {
    id: 'water', name: '海洋', emoji: '🌊',
    foodCategories: [
      { key: 'A', name: '海藻' },
      { key: 'B', name: '浮游' },
      { key: 'C', name: '鱼类' },
    ],
  },
  {
    id: 'forest', name: '翠林', emoji: '🎋',
    foodCategories: [
      { key: 'A', name: '菌类' },
      { key: 'B', name: '树叶' },
      { key: 'C', name: '浆果' },
    ],
  },
];

export const FOOD_MODES = [
  { key: 'A',        labelTpl: '主食 A：{a}' },
  { key: 'B',        labelTpl: '主食 B：{b}' },
  { key: 'C',        labelTpl: '主食 C：{c}' },
  { key: 'omnivore', labelTpl: '杂食（均衡喂食）' },
];

export const DEVICES = {
  pink_land:   { name: 'Pink Land',   start: 'land',   unlocks: ['water', 'sky'],   locked: [] },
  blue_water:  { name: 'Blue Water',  start: 'water',  unlocks: ['sky', 'land'],    locked: [] },
  purple_sky:  { name: 'Purple Sky',  start: 'sky',    unlocks: ['land', 'water'],  locked: [] },
  jade_forest: { name: 'Jade Forest', start: 'forest', unlocks: ['land', 'water'],  locked: ['sky'] },
};

export function biomeById(id) {
  return BIOMES.find(b => b.id === id);
}

// 单个食物类的显示名（可自定义，存 food:<biomeId>:<key>）
export function foodNameOf(biomeId, key) {
  const custom = get(`food:${biomeId}:${key}`);
  if (custom && typeof custom === 'string' && custom.trim()) return custom;
  const biome = biomeById(biomeId);
  const cat = biome?.foodCategories?.find(c => c.key === key);
  return cat?.name || key;
}

export async function setFoodName(biomeId, key, name) {
  const trimmed = (name || '').trim();
  await set(`food:${biomeId}:${key}`, trimmed || null);
}

export function foodModeLabel(biome, modeKey) {
  const mode = FOOD_MODES.find(m => m.key === modeKey);
  if (!mode) return modeKey;
  if (modeKey === 'omnivore') return mode.labelTpl;
  return mode.labelTpl
    .replace('{a}', foodNameOf(biome.id, 'A'))
    .replace('{b}', foodNameOf(biome.id, 'B'))
    .replace('{c}', foodNameOf(biome.id, 'C'));
}

export function isBiomeAllowed(deviceId, biomeId) {
  const dev = DEVICES[deviceId];
  if (!dev) return true;
  if (dev.locked.includes(biomeId)) return false;
  return dev.start === biomeId || dev.unlocks.includes(biomeId);
}
