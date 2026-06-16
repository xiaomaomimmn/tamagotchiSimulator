// 图片吸色器：通用 fallback —— 上传/粘贴任意图片后点击像素吸色。
// 适用所有浏览器，不依赖 EyeDropper API。
//
// 使用：openImagePicker(hex => { ... })

let modalEl = null;
let currentOnPicked = null;

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';
  modalEl.hidden = true;
  modalEl.innerHTML = `
    <div class="modal img-picker-modal">
      <div class="modal-header">
        <h2>从图片吸色</h2>
        <button class="modal-close" data-role="close" type="button">×</button>
      </div>
      <div class="modal-body">
        <div class="img-picker-controls">
          <label class="btn-like">
            选择图片
            <input type="file" data-role="file" accept="image/*" style="display:none">
          </label>
          <span class="hint">或直接 Ctrl+V 粘贴剪贴板里的图片；鼠标移到图上预览，点击吸色。</span>
        </div>
        <div class="img-picker-stage" data-role="stage">
          <p class="img-picker-empty">还没有图片。点击「选择图片」或粘贴一张。</p>
          <canvas data-role="canvas" hidden></canvas>
        </div>
        <div class="img-picker-preview" data-role="preview" hidden>
          <span class="img-picker-swatch" data-role="swatch"></span>
          <code data-role="hex">#000000</code>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  modalEl.addEventListener('click', e => { if (e.target === modalEl) close(); });
  modalEl.querySelector('[data-role="close"]').addEventListener('click', close);

  const $file = modalEl.querySelector('[data-role="file"]');
  const $stage = modalEl.querySelector('[data-role="stage"]');
  const $canvas = modalEl.querySelector('[data-role="canvas"]');
  const $preview = modalEl.querySelector('[data-role="preview"]');
  const $swatch = modalEl.querySelector('[data-role="swatch"]');
  const $hex = modalEl.querySelector('[data-role="hex"]');
  const ctx = $canvas.getContext('2d', { willReadFrequently: true });

  function loadImage(src) {
    const img = new Image();
    img.onload = () => {
      // 适应模态：限定最大尺寸，等比缩放
      const maxW = 700, maxH = 500;
      const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      $canvas.width = w;
      $canvas.height = h;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, w, h);
      $canvas.hidden = false;
      $stage.querySelector('.img-picker-empty')?.remove();
    };
    img.onerror = () => alert('图片加载失败');
    img.src = src;
  }

  $file.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadImage(reader.result);
    reader.readAsDataURL(file);
  });

  // 粘贴支持
  modalEl.addEventListener('paste', e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    const reader = new FileReader();
    reader.onload = () => loadImage(reader.result);
    reader.readAsDataURL(file);
  });

  function pixelAt(e) {
    const rect = $canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * ($canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * ($canvas.height / rect.height));
    if (x < 0 || y < 0 || x >= $canvas.width || y >= $canvas.height) return null;
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    return rgbToHex(r, g, b);
  }

  $canvas.addEventListener('mousemove', e => {
    const hex = pixelAt(e);
    if (!hex) return;
    $preview.hidden = false;
    $swatch.style.background = hex;
    $hex.textContent = hex;
  });

  $canvas.addEventListener('click', e => {
    const hex = pixelAt(e);
    if (hex && currentOnPicked) {
      currentOnPicked(hex);
      close();
    }
  });

  return modalEl;
}

function close() {
  if (modalEl) modalEl.hidden = true;
  currentOnPicked = null;
}

export function openImagePicker(onPicked) {
  const m = ensureModal();
  m.hidden = false;
  // 让 modal 能接收 paste 事件
  m.tabIndex = -1;
  m.focus();
  currentOnPicked = onPicked;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0').toUpperCase()).join('');
}
