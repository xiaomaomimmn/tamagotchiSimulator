// 麻麻圈：基因里的可数特征，决定主食大类下出哪一个具体物种。
//
//   0 个麻麻圈 → 物种 01
//   1 个麻麻圈 → 物种 02
//   2-5 个麻麻圈 → 物种 03
//   6 个麻麻圈 → 物种 04
//
// 存储 key: `mamaring:count` = 0..6 或 null（未指定 = 4 物种全展示）

import { get, set } from '../storage.js';

const KEY = 'mamaring:count';
export const MAMA_MIN = 0;
export const MAMA_MAX = 6;

export function getMamaCount() {
  const v = get(KEY);
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < MAMA_MIN || n > MAMA_MAX) return null;
  return n;
}

export async function setMamaCount(count) {
  if (count == null || count === '') {
    await set(KEY, null);
    return;
  }
  const n = Number(count);
  if (!Number.isInteger(n) || n < MAMA_MIN || n > MAMA_MAX) return;
  await set(KEY, n);
}

/** count → 主食大类内 4 个物种的下标（0..3）。null = 未指定。 */
export function speciesIndexForCount(count) {
  if (count == null) return null;
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count >= 2 && count <= 5) return 2;
  if (count === 6) return 3;
  return null;
}
