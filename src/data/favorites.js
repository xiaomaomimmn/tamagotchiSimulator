// 收藏：每条收藏 = 一个具体的 (物种, 面部, 体色) 组合 + 当时的育成上下文。
// 同一物种的不同面色组合可以分别收藏。
//
// 存储 key 格式: `fav:<speciesId>|<faceId>|<colorHex>`
// 存储 value (snapshot)：
//   {
//     parentA: { biome, species, face, color },
//     parentB: { biome, species, face, color },
//     raiseBiome, foodMode, mamaCount,
//     connectionsByBiome: { land:[...], sky:[...], water:[...], forest:[...] },
//   }
// 目标 (species, face, color) 由 key 携带，snapshot 里不重复。

import { get, set, has, del, keys, subscribe } from '../storage.js';

const PREFIX = 'fav:';
const SEP = '|';
const keyOf = (speciesId, face, color) => `${PREFIX}${speciesId}${SEP}${face}${SEP}${color}`;
function parseKey(k) {
  if (!k.startsWith(PREFIX)) return null;
  const [speciesId, face, color] = k.slice(PREFIX.length).split(SEP);
  if (!speciesId || !face || !color) return null;
  return { speciesId, face, color };
}

export function isFavorite(speciesId, face, color) {
  return has(keyOf(speciesId, face, color));
}

export function getFavorite(speciesId, face, color) {
  return get(keyOf(speciesId, face, color)) || null;
}

export async function addFavorite(speciesId, face, color, snapshot) {
  await set(keyOf(speciesId, face, color), snapshot);
}

export async function removeFavorite(speciesId, face, color) {
  await del(keyOf(speciesId, face, color));
}

export async function toggleFavorite(speciesId, face, color, snapshotIfAdding) {
  if (isFavorite(speciesId, face, color)) {
    await removeFavorite(speciesId, face, color);
    return false;
  }
  await addFavorite(speciesId, face, color, snapshotIfAdding);
  return true;
}

/** 列出所有收藏 [{speciesId, face, color, snapshot}, ...]，按 speciesId+face+color 排序。 */
export function listFavorites() {
  return keys()
    .filter(k => k.startsWith(PREFIX))
    .map(k => {
      const parsed = parseKey(k);
      if (!parsed) return null;
      return { ...parsed, snapshot: get(k) };
    })
    .filter(e => e && e.snapshot != null)
    .sort((a, b) => {
      if (a.speciesId !== b.speciesId) return a.speciesId.localeCompare(b.speciesId);
      if (a.face !== b.face) return a.face.localeCompare(b.face);
      return a.color.localeCompare(b.color);
    });
}

export function countFavorites() {
  return listFavorites().length;
}

export function onFavoritesChange(fn) {
  return subscribe(k => { if (k.startsWith(PREFIX)) fn(); });
}
