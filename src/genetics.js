import { SPECIES } from './data/species.js';

/**
 * 计算后代 (面部, 体色) 概率分布。
 *
 * 体色和面部都只在【父母两位的值】之间分配，不会出现父母没有的面部或颜色。
 *
 * @param {{face: string, color: string}} parentA
 * @param {{face: string, color: string}} parentB
 * @param {object} [options]
 * @param {'A'|'B'|null} [options.selfParent=null]  谁是本体（互为对方）
 *   - null：不偏向，A 50% / B 50%
 *   - 'A'：A 是本体 → A 25% / B 75%（本体特征 -50%、对方 +50%）
 *   - 'B'：B 是本体 → A 75% / B 25%
 * @returns {Array<{face: string, color: string, probability: number}>}
 */
export function breed(parentA, parentB, options = {}) {
  const { selfParent = null } = options;
  let aShare = 0.5, bShare = 0.5;
  if (selfParent === 'A') { aShare = 0.25; bShare = 0.75; }
  else if (selfParent === 'B') { aShare = 0.75; bShare = 0.25; }

  const faceDist = new Map();
  faceDist.set(parentA.face, (faceDist.get(parentA.face) || 0) + aShare);
  faceDist.set(parentB.face, (faceDist.get(parentB.face) || 0) + bShare);

  const colorDist = new Map();
  colorDist.set(parentA.color, (colorDist.get(parentA.color) || 0) + aShare);
  colorDist.set(parentB.color, (colorDist.get(parentB.color) || 0) + bShare);

  const out = [];
  for (const [face, pf] of faceDist) {
    for (const [color, pc] of colorDist) {
      out.push({ face, color, probability: pf * pc });
    }
  }
  out.sort((a, b) => b.probability - a.probability);
  return out;
}

export function possibleSpecies(biomeId) {
  return SPECIES.filter(s => s.biome === biomeId);
}

/**
 * 根据育成场自动判断哪一位父母是「本体」：
 *   - 只有一位父母在育成场生态 → 那位是本体（'A' 或 'B'）
 *   - 双方都在 / 双方都不在 → null（无明确本体，按 50/50 处理）
 */
export function autoSelfParent(biomeA, biomeB, raisingBiome) {
  const aMatch = biomeA === raisingBiome;
  const bMatch = biomeB === raisingBiome;
  if (aMatch && !bMatch) return 'A';
  if (bMatch && !aMatch) return 'B';
  return null;
}
