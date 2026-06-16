// 面部位置编辑器：模态弹窗，身体作为底图，面部图叠加可拖动。
// 输出：facepos:<speciesId> = { x, y } 像素偏移（相对身体 0,0 坐标）。
// 每个物种独立保存自己的偏移，互不影响。

import { speciesById, facePosOf, nameOf } from '../data/species.js';
import { get, set, k, has } from '../storage.js';
import { PIXEL_SIZE } from './pixel-canvas.js';
import { renderFacePng } from './species-render.js';

const N = PIXEL_SIZE;
const SCALE = 4; // 与 pixel-canvas 的 CELL 对齐，N×SCALE = 512px 显示

let modalEl = null;
let openId = 0; // 每次打开自增，async 回调用来判断是否 stale

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';
  modalEl.hidden = true;
  modalEl.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 data-role="title">调整面部位置</h2>
        <button class="modal-close" data-role="close" type="button">×</button>
      </div>
      <div class="modal-body">
        <div class="facepos-stage" data-role="stage" style="width:${N*SCALE}px;height:${N*SCALE}px">
          <canvas class="facepos-body" data-role="body" width="${N*SCALE}" height="${N*SCALE}"></canvas>
          <img class="facepos-face" data-role="face" alt="">
        </div>
        <p class="hint">在身体上拖动面部到目标位置。<strong>每个物种各自保存</strong>。</p>
        <p>当前偏移：<span data-role="coords">x=0, y=0</span> · <span data-role="status"></span></p>
      </div>
      <div class="modal-footer">
        <button data-role="reset" type="button">复位（0, 0）</button>
        <div class="modal-footer-right">
          <button data-role="cancel" type="button">取消</button>
          <button data-role="save" type="button" class="primary">保存</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  modalEl.addEventListener('click', e => { if (e.target === modalEl) close(); });
  modalEl.querySelector('[data-role="close"]').addEventListener('click', close);
  return modalEl;
}

function close() {
  if (!modalEl) return;
  modalEl.hidden = true;
  openId++; // 任何尚未触发的 async 回调都会被识别为 stale
}

export function openFacePositionEditor({ speciesId, faceId, onSaved }) {
  const m = ensureModal();
  m.hidden = false;
  const myOpenId = ++openId;
  const species = speciesById(speciesId);
  m.querySelector('[data-role="title"]').textContent = `调整面部位置：${nameOf(speciesId)}`;

  const $body = m.querySelector('[data-role="body"]');
  const $face = m.querySelector('[data-role="face"]');
  const $coords = m.querySelector('[data-role="coords"]');
  const $status = m.querySelector('[data-role="status"]');
  const ctx = $body.getContext('2d');

  // body underlay
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, $body.width, $body.height);
  const bodyUrl = get(k.bodyPng(speciesId));
  if (bodyUrl) {
    const img = new Image();
    img.onload = () => {
      if (myOpenId !== openId) return; // 已经切到别的物种了，丢弃
      ctx.drawImage(img, 0, 0, $body.width, $body.height);
    };
    img.src = bodyUrl;
  } else {
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(0, 0, $body.width, $body.height);
    ctx.fillStyle = '#999';
    ctx.font = '16px sans-serif';
    ctx.fillText('身体未绘', 16, 32);
  }

  // face overlay
  $face.src = renderFacePng(faceId);
  $face.style.width = `${N * SCALE}px`;
  $face.style.height = `${N * SCALE}px`;

  let pos = { ...facePosOf(speciesId) };
  const isCustom = has(k.facePos(speciesId));
  applyPos();

  function applyPos() {
    $face.style.left = `${pos.x * SCALE}px`;
    $face.style.top  = `${pos.y * SCALE}px`;
    $coords.textContent = `x=${pos.x}, y=${pos.y}`;
    $status.innerHTML = isCustom
      ? '<span class="custom-tag">已自定义</span>'
      : '<span class="default-tag">使用默认</span>';
  }

  // 关键：用 .on* 赋值替换（而非 addEventListener 叠加），
  // 否则每次 openFacePositionEditor 都会给同一个 $face 元素再加一套监听器，
  // 旧物种的闭包会和新物种的闭包同时触发，覆盖位置显示。
  let dragging = false, dragStart = null, posAtStart = null;
  $face.onpointerdown = e => {
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    posAtStart = { ...pos };
    $face.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  $face.onpointermove = e => {
    if (!dragging) return;
    const dxPx = e.clientX - dragStart.x;
    const dyPx = e.clientY - dragStart.y;
    pos.x = posAtStart.x + Math.round(dxPx / SCALE);
    pos.y = posAtStart.y + Math.round(dyPx / SCALE);
    pos.x = Math.max(-N + 4, Math.min(N - 4, pos.x));
    pos.y = Math.max(-N + 4, Math.min(N - 4, pos.y));
    applyPos();
  };
  $face.onpointerup = e => {
    dragging = false;
    try { $face.releasePointerCapture(e.pointerId); } catch {}
  };

  m.querySelector('[data-role="reset"]').onclick = () => {
    pos = { x: 0, y: 0 };
    applyPos();
  };
  m.querySelector('[data-role="cancel"]').onclick = close;
  m.querySelector('[data-role="save"]').onclick = async () => {
    await set(k.facePos(speciesId), pos);
    onSaved?.();
    close();
  };
}
