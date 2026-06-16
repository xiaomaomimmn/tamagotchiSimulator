// 像素画板：128×128 网格，每像素 4px 显示。
// state: 二维数组 grid[y][x] = '#rrggbb' 或 null（透明）
// 工具：pencil / eraser / fill / eyedropper / import
// 调色板：传入数组（每个 hex 或 null=透明专槽）

const SIZE = 128;
const CELL = 4;
const GUIDE_EVERY = 16; // 每 16 格画一条粗辅助线

export function createPixelCanvas(rootEl, opts = {}) {
  const palette = opts.palette || defaultPalette();
  let grid = makeBlank();
  let referenceUrl = opts.referenceUrl || null;
  let referenceOpacity = opts.referenceOpacity ?? 0.35;
  let currentColor = palette.find(c => c) || '#000000';
  let currentTool = 'pencil';

  rootEl.innerHTML = `
    <div class="pix-toolbar">
      ${tool('pencil', '✏️ 铅笔')}
      ${tool('eraser', '🩹 橡皮')}
      ${tool('fill',   '🪣 填充')}
      ${tool('eyedrop','💧 取色')}
      ${tool('move',   '🤚 移动')}
      <label class="pix-tool" title="从外部 PNG/JPG 导入并自动采样到 128×128">
        📁 导入图片
        <input type="file" data-role="import" accept="image/*" style="display:none">
      </label>
      <span class="pix-current">
        当前色：<span class="pix-current-swatch" data-role="current"></span>
      </span>
    </div>
    <div class="pix-palette">
      ${palette.map((c, i) => `
        <button class="pix-swatch ${c === null ? 'pix-transparent' : ''}"
                data-color="${c ?? ''}"
                data-idx="${i}"
                style="${c ? `background:${c}` : ''}"
                title="${c ?? '透明'}"></button>
      `).join('')}
    </div>
    <div class="pix-canvas-wrap">
      <canvas class="pix-reference" data-role="ref" width="${SIZE * CELL}" height="${SIZE * CELL}"></canvas>
      <canvas class="pix-checker" data-role="checker" width="${SIZE * CELL}" height="${SIZE * CELL}"></canvas>
      <canvas class="pix-grid" data-role="grid" width="${SIZE * CELL}" height="${SIZE * CELL}"></canvas>
      <canvas class="pix-overlay" data-role="overlay" width="${SIZE * CELL}" height="${SIZE * CELL}"></canvas>
    </div>
  `;

  const $current = rootEl.querySelector('[data-role="current"]');
  const $checker = rootEl.querySelector('[data-role="checker"]');
  const $ref = rootEl.querySelector('[data-role="ref"]');
  const $gridCv = rootEl.querySelector('[data-role="grid"]');
  const $overlay = rootEl.querySelector('[data-role="overlay"]');
  const checkerCtx = $checker.getContext('2d');
  const refCtx = $ref.getContext('2d');
  const gridCtx = $gridCv.getContext('2d');
  const overlayCtx = $overlay.getContext('2d');

  paintChecker();
  paintReference();
  paintGrid();
  paintGridLines();
  updateCurrent();
  highlightActiveTool();

  // ---------- events ----------

  rootEl.querySelectorAll('.pix-tool').forEach(btn => {
    if (!btn.dataset.tool) return; // skip the "import" label button
    btn.addEventListener('click', () => {
      currentTool = btn.dataset.tool;
      highlightActiveTool();
    });
  });

  const $import = rootEl.querySelector('[data-role="import"]');
  $import.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await importImage(file);
      $import.value = ''; // 允许重选同一文件
    }
  });

  rootEl.querySelectorAll('.pix-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.color;
      currentColor = c === '' ? null : c;
      updateCurrent();
    });
  });

  let dragging = false;
  let moveBase = null;  // { grid, cell:{x,y} } — 移动工具拖拽起点
  $overlay.addEventListener('pointerdown', e => {
    dragging = true;
    moveBase = null; // 重置移动基线
    $overlay.setPointerCapture(e.pointerId);
    applyAt(e);
  });
  $overlay.addEventListener('pointermove', e => {
    if (!dragging) return;
    if (currentTool === 'pencil' || currentTool === 'eraser' || currentTool === 'move') applyAt(e);
  });
  $overlay.addEventListener('pointerup', e => {
    dragging = false;
    moveBase = null;
    try { $overlay.releasePointerCapture(e.pointerId); } catch {}
  });
  $overlay.addEventListener('pointercancel', () => { dragging = false; moveBase = null; });

  function applyAt(e) {
    const rect = $overlay.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / (rect.width / SIZE));
    const y = Math.floor((e.clientY - rect.top)  / (rect.height / SIZE));
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
    if (currentTool === 'pencil') setCell(x, y, currentColor);
    else if (currentTool === 'eraser') setCell(x, y, null);
    else if (currentTool === 'fill') floodFill(x, y, currentColor);
    else if (currentTool === 'eyedrop') {
      currentColor = grid[y][x];
      updateCurrent();
    }
    else if (currentTool === 'move') {
      if (!moveBase) {
        moveBase = { grid: cloneGrid(grid), cell: { x, y } };
      } else {
        const dx = x - moveBase.cell.x;
        const dy = y - moveBase.cell.y;
        grid = shiftGrid(moveBase.grid, dx, dy);
        paintGrid();
      }
    }
  }

  function shiftGrid(src, dx, dy) {
    const out = makeBlank();
    for (let y = 0; y < SIZE; y++) {
      const sy = y - dy;
      if (sy < 0 || sy >= SIZE) continue;
      for (let x = 0; x < SIZE; x++) {
        const sx = x - dx;
        if (sx < 0 || sx >= SIZE) continue;
        out[y][x] = src[sy][sx];
      }
    }
    return out;
  }

  function setCell(x, y, color) {
    if (grid[y][x] === color) return;
    grid[y][x] = color;
    paintCell(x, y);
  }

  function floodFill(x, y, color) {
    const target = grid[y][x];
    if (target === color) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
      if (grid[cy][cx] !== target) continue;
      grid[cy][cx] = color;
      paintCell(cx, cy);
      stack.push([cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]);
    }
  }

  // ---------- rendering ----------

  function paintChecker() {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        checkerCtx.fillStyle = (x + y) % 2 ? '#f0f0f0' : '#ffffff';
        checkerCtx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }

  function paintReference() {
    refCtx.clearRect(0, 0, $ref.width, $ref.height);
    if (!referenceUrl) return;
    const img = new Image();
    img.onload = () => {
      refCtx.globalAlpha = referenceOpacity;
      refCtx.imageSmoothingEnabled = false;
      refCtx.drawImage(img, 0, 0, $ref.width, $ref.height);
      refCtx.globalAlpha = 1;
    };
    img.src = referenceUrl;
  }

  function paintCell(x, y) {
    gridCtx.clearRect(x * CELL, y * CELL, CELL, CELL);
    const c = grid[y][x];
    if (c) {
      gridCtx.fillStyle = c;
      gridCtx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  function paintGrid() {
    gridCtx.clearRect(0, 0, $gridCv.width, $gridCv.height);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) paintCell(x, y);
    }
  }

  function paintGridLines() {
    overlayCtx.clearRect(0, 0, $overlay.width, $overlay.height);
    // 细线（每像素）：128 格太密，画浅一点
    overlayCtx.strokeStyle = 'rgba(0,0,0,0.04)';
    overlayCtx.lineWidth = 1;
    for (let i = 0; i <= SIZE; i++) {
      if (i % GUIDE_EVERY === 0) continue;
      const p = i * CELL + 0.5;
      overlayCtx.beginPath(); overlayCtx.moveTo(p, 0); overlayCtx.lineTo(p, SIZE * CELL); overlayCtx.stroke();
      overlayCtx.beginPath(); overlayCtx.moveTo(0, p); overlayCtx.lineTo(SIZE * CELL, p); overlayCtx.stroke();
    }
    // 辅助粗线（每 16 格）
    overlayCtx.strokeStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i <= SIZE; i += GUIDE_EVERY) {
      const p = i * CELL + 0.5;
      overlayCtx.beginPath(); overlayCtx.moveTo(p, 0); overlayCtx.lineTo(p, SIZE * CELL); overlayCtx.stroke();
      overlayCtx.beginPath(); overlayCtx.moveTo(0, p); overlayCtx.lineTo(SIZE * CELL, p); overlayCtx.stroke();
    }
    // 中轴十字线（主题色虚线，用于面部居中对齐）
    overlayCtx.strokeStyle = 'rgba(226, 106, 143, 0.65)';
    overlayCtx.lineWidth = 1;
    overlayCtx.setLineDash([6, 4]);
    const mid = (SIZE / 2) * CELL + 0.5;
    overlayCtx.beginPath(); overlayCtx.moveTo(mid, 0); overlayCtx.lineTo(mid, SIZE * CELL); overlayCtx.stroke();
    overlayCtx.beginPath(); overlayCtx.moveTo(0, mid); overlayCtx.lineTo(SIZE * CELL, mid); overlayCtx.stroke();
    overlayCtx.setLineDash([]);
  }

  function updateCurrent() {
    if (currentColor === null) {
      $current.style.background = 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50% / 8px 8px';
    } else {
      $current.style.background = currentColor;
    }
  }

  function highlightActiveTool() {
    rootEl.querySelectorAll('.pix-tool').forEach(b =>
      b.classList.toggle('active', b.dataset.tool === currentTool));
    $overlay.dataset.tool = currentTool;
  }

  // ---------- API ----------

  function setPixels(g) {
    grid = normalizeGrid(g);
    paintGrid();
  }

  async function importImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      // contain-fit：保持宽高比，居中，多余区域透明
      const off = document.createElement('canvas');
      off.width = SIZE; off.height = SIZE;
      const offCtx = off.getContext('2d', { willReadFrequently: true });
      offCtx.imageSmoothingEnabled = true;
      offCtx.imageSmoothingQuality = 'high';
      const ratio = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
      const w = img.naturalWidth * ratio;
      const h = img.naturalHeight * ratio;
      offCtx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      const data = offCtx.getImageData(0, 0, SIZE, SIZE).data;
      const g = makeBlank();
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          if (data[i + 3] >= 128) {
            g[y][x] = '#' + [data[i], data[i+1], data[i+2]]
              .map(n => n.toString(16).padStart(2, '0').toUpperCase())
              .join('');
          }
        }
      }
      grid = g;
      paintGrid();
    } catch (err) {
      console.error(err);
      alert('图片加载失败');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function getPixels() {
    return cloneGrid(grid);
  }

  function clearAll() {
    grid = makeBlank();
    paintGrid();
  }

  function toDataURL() {
    return gridToDataURL(grid);
  }

  function setReference(url, opacity = 0.35) {
    referenceUrl = url;
    referenceOpacity = opacity;
    paintReference();
  }

  return { setPixels, getPixels, clearAll, toDataURL, setReference };
}

// ---------- helpers (exported for storage layer reuse) ----------

export function makeBlank() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

// 把任意尺寸的 grid 上采样到当前 SIZE（最近邻）；旧 32×32 数据自动迁移到 128×128。
export function normalizeGrid(g) {
  if (!Array.isArray(g) || !g.length) return makeBlank();
  if (g.length === SIZE) return g.map(row => row.slice());
  const oldN = g.length;
  if (SIZE % oldN !== 0 && oldN % SIZE !== 0) return makeBlank();
  const out = makeBlank();
  const factor = SIZE / oldN; // 可能 < 1（下采样）
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const ox = Math.floor(x / factor);
      const oy = Math.floor(y / factor);
      if (ox < oldN && oy < oldN) out[y][x] = g[oy]?.[ox] ?? null;
    }
  }
  return out;
}

export function gridToDataURL(grid) {
  const cv = document.createElement('canvas');
  cv.width = SIZE; cv.height = SIZE;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const c = grid[y][x];
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return cv.toDataURL('image/png');
}

export function defaultPalette() {
  // Imported by callers if they want the default 19-swatch palette.
  // 16 body colors + black + white + transparent
  return [
    '#F8F8F8','#FFB7C5','#E63946','#F4A261',
    '#F7D060','#B5DE6D','#5AB35A','#8FD3C7',
    '#5FCAD9','#7EC0EE','#4A6FE3','#A06CD5',
    '#D854A2','#A0744A','#9AA0A6','#2B2B2B',
    '#000000','#FFFFFF', null,
  ];
}

function cloneGrid(g) {
  return g.map(row => row.slice());
}

function tool(id, label) {
  return `<button class="pix-tool" data-tool="${id}" type="button">${label}</button>`;
}

export const PIXEL_SIZE = SIZE;
