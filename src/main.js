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

await initStorage();

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
