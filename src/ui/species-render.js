// 把 (物种, 面部, 体色) 合成为单张 PNG。
//
// 流程：
//   1. 取出物种身体网格（body:<id>），画到 N×N 临时 canvas
//   2. 取出物种染色蒙版（mask:<id>），蒙版中不透明的像素用体色覆盖对应身体位置
//   3. 取出面部网格（face:<id>），按 facePosition 偏移叠加
//   4. 返回 N×N PNG data URL；调用方用 <img> + CSS image-rendering: pixelated 显示
//
// 旧 32×32 数据通过 normalizeGrid 自动升采样到当前 SIZE。

import { get, k } from '../storage.js';
import { facePosOf } from '../data/species.js';
import { PIXEL_SIZE, normalizeGrid } from './pixel-canvas.js';

const N = PIXEL_SIZE;

const FALLBACK_BODY = makeFallbackBody();
const FALLBACK_FACE = makeFallbackFace();

function loadGrid(key, fallback) {
  const raw = get(key);
  if (!raw) return fallback;
  return normalizeGrid(raw);
}

export function renderSpeciesPng(speciesId, faceId, colorHex) {
  const body = loadGrid(k.body(speciesId), FALLBACK_BODY);
  const mask = get(k.mask(speciesId)) ? normalizeGrid(get(k.mask(speciesId))) : null;
  const face = faceId ? loadGrid(k.face(faceId), FALLBACK_FACE) : FALLBACK_FACE;
  const pos = facePosOf(speciesId);

  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d');

  // body layer
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = body[y]?.[x];
      if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
    }
  }
  // mask → recolor body where mask is opaque
  if (mask && colorHex) {
    ctx.fillStyle = colorHex;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (mask[y]?.[x] && body[y]?.[x]) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  // face layer, offset
  const dx = pos.x | 0, dy = pos.y | 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = face[y]?.[x];
      if (!c) continue;
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
      ctx.fillStyle = c;
      ctx.fillRect(tx, ty, 1, 1);
    }
  }

  return cv.toDataURL('image/png');
}

export function renderFacePng(faceId) {
  const face = faceId ? loadGrid(k.face(faceId), FALLBACK_FACE) : FALLBACK_FACE;
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = face[y]?.[x];
      if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
    }
  }
  return cv.toDataURL('image/png');
}

// ---------- fallbacks（用 SIZE-relative 坐标，自适应任意 SIZE） ----------

function makeFallbackBody() {
  const g = blank();
  const left   = Math.floor(N * 0.16);
  const right  = N - left;
  const top    = Math.floor(N * 0.20);
  const bottom = N - Math.floor(N * 0.10);
  const cornerR = Math.max(2, Math.floor(N * 0.08));
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const inCorner =
        (x < left + cornerR || x >= right - cornerR) &&
        (y < top + cornerR || y >= bottom - cornerR);
      if (!inCorner) g[y][x] = '#dcd0c8';
    }
  }
  return g;
}

function makeFallbackFace() {
  const g = blank();
  const eyeY  = Math.floor(N * 0.42);
  const eyeXl = Math.floor(N * 0.36);
  const eyeXr = Math.floor(N * 0.58);
  const dotS  = Math.max(2, Math.floor(N / 16));
  for (const cx of [eyeXl, eyeXr]) {
    for (let dy = 0; dy < dotS; dy++) {
      for (let dx = 0; dx < dotS; dx++) {
        const y = eyeY + dy, x = cx + dx;
        if (y < N && x < N) g[y][x] = '#222';
      }
    }
  }
  return g;
}

function blank() {
  return Array.from({ length: N }, () => Array(N).fill(null));
}
