// 模态弹窗：包裹像素画板，提供保存/取消，写入 IndexedDB。
//
// openEditor({
//   title: '编辑身体：豆豆-01',
//   storageKey: 'body:sp_l01',
//   pngKey: 'body:sp_l01:png',   // optional, also writes a PNG data URL alongside
//   referenceUrl: null,           // optional underlay (for masks)
//   palette: [...],               // optional override
//   onSaved: () => {},
// })

import { createPixelCanvas, makeBlank, gridToDataURL } from './pixel-canvas.js';
import { get, set } from '../storage.js';

let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';
  modalEl.hidden = true;
  modalEl.innerHTML = `
    <div class="modal" role="dialog">
      <div class="modal-header">
        <h2 data-role="title">编辑</h2>
        <button class="modal-close" data-role="close" type="button" aria-label="关闭">×</button>
      </div>
      <div class="modal-body" data-role="body"></div>
      <div class="modal-footer">
        <button data-role="clear" type="button">清空</button>
        <div class="modal-footer-right">
          <button data-role="cancel" type="button">取消</button>
          <button data-role="save" type="button" class="primary">保存</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  modalEl.addEventListener('click', e => {
    if (e.target === modalEl) close();
  });
  modalEl.querySelector('[data-role="close"]').addEventListener('click', close);
  return modalEl;
}

let activeCanvas = null;
let activeCfg = null;

function close() {
  if (!modalEl) return;
  modalEl.hidden = true;
  modalEl.querySelector('[data-role="body"]').innerHTML = '';
  activeCanvas = null;
  activeCfg = null;
}

export function openEditor(cfg) {
  const m = ensureModal();
  m.hidden = false;
  m.querySelector('[data-role="title"]').textContent = cfg.title || '编辑';

  const body = m.querySelector('[data-role="body"]');
  body.innerHTML = '';
  const canvasHost = document.createElement('div');
  body.appendChild(canvasHost);

  activeCanvas = createPixelCanvas(canvasHost, {
    palette: cfg.palette,
    referenceUrl: cfg.referenceUrl,
  });
  activeCfg = cfg;

  const existing = get(cfg.storageKey);
  if (existing) activeCanvas.setPixels(existing);
  else activeCanvas.setPixels(makeBlank());

  const cancelBtn = m.querySelector('[data-role="cancel"]');
  const saveBtn = m.querySelector('[data-role="save"]');
  const clearBtn = m.querySelector('[data-role="clear"]');
  cancelBtn.onclick = close;
  clearBtn.onclick = () => activeCanvas.clearAll();
  saveBtn.onclick = async () => {
    const pixels = activeCanvas.getPixels();
    await set(cfg.storageKey, pixels);
    if (cfg.pngKey) {
      await set(cfg.pngKey, gridToDataURL(pixels));
    }
    cfg.onSaved?.();
    close();
  };
}
