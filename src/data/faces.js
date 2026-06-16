// 68 个可遗传面部特征。
// 「面部」只包含眼睛 / 表情元素 —— 嘴属于身体部分，请在身体编辑器里画。
// 名字**自动跟随**对应位置的物种名（fc_NN 对应 SPECIES[NN-1]）。
// 艺术存在 IndexedDB（face:fc_NN / face:fc_NN:png）。

import { speciesAtFaceIndex, nameOf } from './species.js';

export const FACES = Array.from({ length: 68 }, (_, i) => ({
  id: `fc_${String(i + 1).padStart(2, '0')}`,
}));

export function faceById(id) {
  return FACES.find(f => f.id === id);
}

export function faceIndexOf(faceId) {
  const m = faceId.match(/^fc_(\d+)$/);
  return m ? parseInt(m[1], 10) - 1 : -1;
}

export function faceNameOf(faceId) {
  const idx = faceIndexOf(faceId);
  const sp = speciesAtFaceIndex(idx);
  return sp ? nameOf(sp.id) : faceId;
}
