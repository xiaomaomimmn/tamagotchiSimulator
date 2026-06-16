// 联机记录：每个生态记录已和哪些其他生态的设备联机过。
// 解锁规则：本生态隐藏物种 = 与 ≥ 2 个不同其他生态联机过。
//
// 存储 key: `conn:<biomeId>` = 已联机的其他生态 id 数组（去重）。

import { get, set } from '../storage.js';

const KEY = id => `conn:${id}`;

export function getConnections(biomeId) {
  const arr = get(KEY(biomeId)) || [];
  return new Set(arr);
}

export async function toggleConnection(biomeId, otherBiomeId) {
  if (biomeId === otherBiomeId) return;
  const current = new Set(get(KEY(biomeId)) || []);
  if (current.has(otherBiomeId)) current.delete(otherBiomeId);
  else current.add(otherBiomeId);
  await set(KEY(biomeId), Array.from(current));
}

/** 直接覆盖某生态的联机列表（用于收藏 restore）。 */
export async function setConnections(biomeId, otherBiomeIds) {
  const clean = Array.from(new Set(otherBiomeIds || [])).filter(id => id !== biomeId);
  await set(KEY(biomeId), clean);
}

export function hiddenUnlocked(biomeId) {
  return getConnections(biomeId).size >= 2;
}
