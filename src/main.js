import { BIOMES, FOOD_MODES, foodModeLabel, biomeById, foodNameOf, setFoodName } from './data/biomes.js';
import { breed, autoSelfParent } from './genetics.js';
import { initStorage, subscribe } from './storage.js';
import { createParentCard } from './ui/parent-card.js';
import { renderResults } from './ui/results-panel.js';
import { renderSpeciesLibrary } from './ui/species-library.js';
import { renderFaceLibrary } from './ui/face-library.js';
import { renderFavoritesPanel } from './ui/favorites-panel.js';
import { onFavoritesChange, countFavorites } from './data/favorites.js';
import { getConnections, setConnections } from './data/connections.js';
import { getMamaCount, setMamaCount } from './data/mamaring.js';
import * as fsSync from './data/fs-sync.js';

await initStorage();

// 启动时若本地 IndexedDB 为空（如新设备 / 清缓存后），自动从 assets/library.json 加载
let autoLoadResult = null;
try {
  autoLoadResult = await fsSync.autoLoadIfEmpty();
  if (autoLoadResult.loaded) {
    console.log(`[fs-sync] 自动从 library.json 加载了 ${autoLoadResult.count} 条数据`);
  }
} catch (e) {
  console.warn('[fs-sync] 自动加载失败:', e);
}

// state.color 是任意 hex 字符串
// 默认面部 = 对应物种位置的面部（fc_01 ↔ 陆地·甲01，fc_18 ↔ 天空·甲01）
const initialA = { biome: 'land', species: 'sp_l_A1', face: 'fc_01', color: '#FFB7C5' };
const initialB = { biome: 'sky',  species: 'sp_s_A1', face: 'fc_18', color: '#4A6FE3' };

// 遗传偏向：仅「自动」模式（按育成场判定本体）
const view = { raiseBiome: 'land', foodMode: 'A' };

const $a = document.getElementById('parent-a');
const $b = document.getElementById('parent-b');
const $results = document.getElementById('results-panel');
const $raiseBiome = document.getElementById('raise-biome');
const $foodMode = document.getElementById('food-mode');
const $settingsToggle = document.getElementById('settings-toggle');
const $settingsPanel = document.getElementById('settings-panel');
const $libraryToggle = document.getElementById('library-toggle');
const $librarySection = document.getElementById('library-section');
const $libraryPanel = document.getElementById('library-panel');
const $faceLibToggle = document.getElementById('face-library-toggle');
const $faceLibSection = document.getElementById('face-library-section');
const $faceLibPanel = document.getElementById('face-library-panel');
const $foodNameEditor = document.getElementById('food-name-editor');
const $fsSyncControls = document.getElementById('fs-sync-controls');
const $favoritesToggle = document.getElementById('favorites-toggle');
const $favoritesSection = document.getElementById('favorites-section');
const $favoritesPanel = document.getElementById('favorites-panel');

function fillFoodModeOptions() {
  const biome = biomeById(view.raiseBiome);
  $foodMode.innerHTML = FOOD_MODES
    .map(m => `<option value="${m.key}">${foodModeLabel(biome, m.key)}</option>`)
    .join('');
  $foodMode.value = view.foodMode;
}

$raiseBiome.innerHTML = BIOMES.map(b => `<option value="${b.id}">${b.emoji} ${b.name}</option>`).join('');
$raiseBiome.value = view.raiseBiome;
fillFoodModeOptions();

const cardA = createParentCard($a, 'A', initialA, () => recompute());
const cardB = createParentCard($b, 'B', initialB, () => recompute());

$raiseBiome.addEventListener('change', () => {
  view.raiseBiome = $raiseBiome.value;
  fillFoodModeOptions();
  recompute();
});
$foodMode.addEventListener('change', () => { view.foodMode = $foodMode.value; recompute(); });

$settingsToggle.addEventListener('click', () => { $settingsPanel.hidden = !$settingsPanel.hidden; });

function syncToggleStates() {
  $libraryToggle.classList.toggle('active', !$librarySection.hidden);
  $libraryToggle.textContent = ($librarySection.hidden ? '▶ ' : '▼ ') + '物种库';
  $faceLibToggle.classList.toggle('active', !$faceLibSection.hidden);
  $faceLibToggle.textContent = ($faceLibSection.hidden ? '▶ ' : '▼ ') + '面部库';
  $settingsToggle.classList.toggle('active', !$settingsPanel.hidden);
  $favoritesToggle.classList.toggle('active', !$favoritesSection.hidden);
  const n = countFavorites();
  $favoritesToggle.textContent = ($favoritesSection.hidden ? '▶ ' : '▼ ')
    + '⭐ 收藏' + (n > 0 ? ` (${n})` : '');
}

let libraryRendered = false;
$libraryToggle.addEventListener('click', () => {
  $librarySection.hidden = !$librarySection.hidden;
  if (!$librarySection.hidden && !libraryRendered) {
    renderSpeciesLibrary($libraryPanel, () => { cardA.refresh(); cardB.refresh(); recompute(); });
    libraryRendered = true;
  }
  syncToggleStates();
});

let faceLibRendered = false;
$faceLibToggle.addEventListener('click', () => {
  $faceLibSection.hidden = !$faceLibSection.hidden;
  if (!$faceLibSection.hidden && !faceLibRendered) {
    renderFaceLibrary($faceLibPanel, () => { cardA.refresh(); cardB.refresh(); recompute(); });
    faceLibRendered = true;
  }
  syncToggleStates();
});

let favoritesRendered = false;
$favoritesToggle.addEventListener('click', () => {
  $favoritesSection.hidden = !$favoritesSection.hidden;
  if (!$favoritesSection.hidden && !favoritesRendered) {
    renderFavoritesPanel($favoritesPanel, { onRestore: applyFavoriteSnapshot });
    favoritesRendered = true;
  }
  syncToggleStates();
});
onFavoritesChange(syncToggleStates);

$settingsToggle.addEventListener('click', syncToggleStates);
syncToggleStates();

// Food name editor — 4 biomes × 3 categories of editable inputs
function renderFoodNameEditor() {
  $foodNameEditor.innerHTML = BIOMES.map(b => `
    <div class="food-row" data-biome="${b.id}">
      <span class="food-row-label">${b.emoji} ${b.name}</span>
      ${b.foodCategories.map(c => `
        <label>
          <small>${c.key}</small>
          <input type="text" data-key="${c.key}" value="${escapeAttr(foodNameOf(b.id, c.key))}" maxlength="8">
        </label>
      `).join('')}
    </div>
  `).join('');
}
function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

$foodNameEditor.addEventListener('change', async (e) => {
  const input = e.target.closest('input[data-key]');
  if (!input) return;
  const biomeId = input.closest('[data-biome]').dataset.biome;
  await setFoodName(biomeId, input.dataset.key, input.value);
  // subscribe in main → recompute → results panel + food mode dropdown re-render
});

renderFoodNameEditor();

// 资源同步面板
function renderFsSyncControls() {
  const s = fsSync.getStatus();
  let autoLoadLine = '';
  if (autoLoadResult) {
    if (autoLoadResult.loaded)
      autoLoadLine = `<div class="fs-status connected">✓ 启动时自动加载了 <strong>${autoLoadResult.count}</strong> 条数据（来自 <code>assets/library.json</code>）</div>`;
    else if (autoLoadResult.reason === 'idb-has-data')
      autoLoadLine = `<div class="fs-status">本地已有 <strong>${autoLoadResult.count}</strong> 条数据 — 跳过自动加载（如需用 GitHub 版本，点下面的「从仓库重新加载」）</div>`;
    else if (autoLoadResult.reason === 'no-file')
      autoLoadLine = `<div class="fs-status">未找到 <code>assets/library.json</code>（仓库里还没提交过）</div>`;
  }

  let writeSection;
  const lastWrite = s.lastWriteTs ? `最近写入：${new Date(s.lastWriteTs).toLocaleTimeString()}` : '';
  if (!s.supported) {
    writeSection = `
      <div class="fs-status">当前浏览器不支持目录自动写入（仅 Chrome / Edge）；用「下载 library.json」手动同步。</div>
    `;
  } else if (s.connected) {
    writeSection = `
      <div class="fs-status connected">✓ 自动写入已连接：<code>${s.dirName}</code>/assets/library.json · ${lastWrite}</div>
      <div class="fs-buttons">
        <button type="button" data-role="fs-save" class="primary">立即写入磁盘</button>
        <button type="button" data-role="fs-disconnect">断开</button>
      </div>
    `;
  } else {
    writeSection = `
      <div class="fs-status">自动写入未连接 — 连上仓库目录后，所有改动会 1.5s 防抖写入 <code>assets/library.json</code>（Chrome/Edge 限定）</div>
      <div class="fs-buttons">
        <button type="button" data-role="fs-pick" class="primary">连接仓库目录（自动写入）</button>
      </div>
    `;
  }

  $fsSyncControls.innerHTML = `
    <div class="fs-section">
      <h3 class="fs-section-title">📥 加载</h3>
      ${autoLoadLine}
      <div class="fs-buttons">
        <button type="button" data-role="fs-reload">从仓库重新加载 library.json（覆盖本地）</button>
      </div>
    </div>
    <div class="fs-section">
      <h3 class="fs-section-title">📤 保存</h3>
      <div class="fs-buttons">
        <button type="button" data-role="fs-download" class="primary">下载 library.json（任意浏览器，再手动放进 assets/）</button>
      </div>
      ${writeSection}
    </div>
    <div class="fs-section">
      <h3 class="fs-section-title">🖼️ 批量导入像素图文件夹</h3>
      <p class="hint">
        选一个根目录（含 <code>body/</code> <code>mask/</code> <code>eye/</code> 子文件夹），
        按 <code>{type}_{N}_{M}.png</code> 命名约定一键写入对应物种 / 面部。
        <br>N=1-16 表示 (生态, 主食) 槽位：1-4 陆地 A/B/C/杂、5-8 天空、9-12 海洋、13-16 翠林；
        M=1-4 为该槽位内 4 物种之一，<code>yin</code> 为该生态的隐藏物种。<strong>仅 Chrome / Edge 支持。</strong>
      </p>
      <div class="fs-buttons">
        <button type="button" data-role="fs-import-folder" class="primary">选择文件夹并一键导入</button>
      </div>
    </div>
  `;
}
$fsSyncControls.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-role]');
  if (!btn) return;
  try {
    if (btn.dataset.role === 'fs-pick') {
      await fsSync.pickDirectory();
      const r = await fsSync.loadFromDisk().catch(() => null);
      if (r?.found) alert(`已从磁盘加载 ${r.restored} 条数据。`);
      else await fsSync.writeToDisk();
    } else if (btn.dataset.role === 'fs-save') {
      await fsSync.writeToDisk();
    } else if (btn.dataset.role === 'fs-disconnect') {
      await fsSync.disconnect();
    } else if (btn.dataset.role === 'fs-reload') {
      const r = await fsSync.reloadFromLibraryJson();
      alert(r.loaded ? `已重新加载 ${r.count} 条数据。` : '未找到 assets/library.json。');
      autoLoadResult = r.loaded ? { loaded: true, count: r.count } : autoLoadResult;
      renderFsSyncControls();
    } else if (btn.dataset.role === 'fs-download') {
      const n = fsSync.downloadLibraryJson();
      alert(`已触发下载（含 ${n} 条数据）。把文件放到仓库的 assets/ 目录下，git commit + push 即可同步到 GitHub。`);
    } else if (btn.dataset.role === 'fs-import-folder') {
      const r = await fsSync.importImageFolder();
      const summary = `导入完成：身体 ${r.body} / 蒙版 ${r.mask} / 面部 ${r.eye}（跳过 ${r.skipped} 个非 PNG）`;
      const errLines = r.errors.length
        ? `\n\n错误 ${r.errors.length} 条：\n${r.errors.slice(0, 10).join('\n')}${r.errors.length > 10 ? '\n…' : ''}`
        : '';
      alert(summary + errLines);
    }
  } catch (err) {
    // 用户在浏览器选择器里点了取消/Esc → 安静地忽略
    if (err && (err.name === 'AbortError' || /aborted/i.test(err.message || ''))) return;
    console.error(err);
    alert(`操作失败：${err.message || err}`);
  }
});
fsSync.onStatusChange(renderFsSyncControls);
fsSync.tryRestore().then(renderFsSyncControls);

subscribe((key) => {
  // food name change → relabel the food-mode dropdown options
  if (key.startsWith('food:')) fillFoodModeOptions();
  recompute();
});

function buildSnapshot() {
  const a = cardA.getState();
  const b = cardB.getState();
  const connectionsByBiome = {};
  for (const biome of BIOMES) {
    connectionsByBiome[biome.id] = Array.from(getConnections(biome.id));
  }
  return {
    parentA: { biome: a.biome, species: a.species, face: a.face, color: a.color },
    parentB: { biome: b.biome, species: b.species, face: b.face, color: b.color },
    raiseBiome: view.raiseBiome,
    foodMode: view.foodMode,
    mamaCount: getMamaCount(),
    connectionsByBiome,
  };
}

async function applyFavoriteSnapshot(snap) {
  // 1) 父母 → setState
  cardA.setState(snap.parentA);
  cardB.setState(snap.parentB);
  // 2) 育成场 + 喂食模式
  view.raiseBiome = snap.raiseBiome;
  $raiseBiome.value = snap.raiseBiome;
  fillFoodModeOptions();
  view.foodMode = snap.foodMode;
  $foodMode.value = snap.foodMode;
  // 3) 麻麻圈
  await setMamaCount(snap.mamaCount);
  // 4) 联机记录（覆盖所有生态）
  if (snap.connectionsByBiome) {
    for (const [biomeId, list] of Object.entries(snap.connectionsByBiome)) {
      await setConnections(biomeId, list);
    }
  }
  // 5) 收起收藏面板，让用户看到结果
  $favoritesSection.hidden = true;
  syncToggleStates();
  recompute();
}

function recompute() {
  const a = cardA.getState();
  const b = cardB.getState();
  // 本体自动按育成场判定（只有一种模式）
  const effectiveSelf = autoSelfParent(a.biome, b.biome, view.raiseBiome);
  const dist = breed(
    { face: a.face, color: a.color },
    { face: b.face, color: b.color },
    { selfParent: effectiveSelf }
  );
  renderResults($results, dist, view.raiseBiome, view.foodMode, {
    effectiveSelf,
    parentBiomes: { A: a.biome, B: b.biome },
  }, buildSnapshot);
}

recompute();
