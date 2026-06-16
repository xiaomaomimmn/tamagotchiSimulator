import { SPECIES, nameOf, setName } from '../data/species.js';
import { BIOMES, biomeById, FOOD_MODES, foodModeLabel } from '../data/biomes.js';
import { FACES, faceNameOf } from '../data/faces.js';
import { renderSpeciesPng } from './species-render.js';
import { openEditor } from './canvas-editor.js';
import { openFacePositionEditor } from './face-position-editor.js';
import { k, has, get, subscribe } from '../storage.js';

const STATE = {
  filterBiome: 'all',
  previewColor: '#4A6FE3',
  previewFace: 'fc_01',
};

export function renderSpeciesLibrary(rootEl, onChange) {
  rootEl.innerHTML = `
    <div class="lib-controls">
      <label>生态区：<select data-role="filter">
        <option value="all">全部</option>
        ${BIOMES.map(b => `<option value="${b.id}">${b.emoji} ${b.name}</option>`).join('')}
      </select></label>
      <label>预览体色：<input type="color" data-role="pcolor" value="${STATE.previewColor}"></label>
      <label>预览面部：<select data-role="pface"></select></label>
      <span class="hint">每物种 3 件可编辑资产：身体（含嘴）/ 染色蒙版 / 面部位置。点击物种名可重命名（对应面部名会同步更新）。</span>
    </div>
    <div data-role="groups"></div>
  `;

  const $filter = rootEl.querySelector('[data-role="filter"]');
  const $pc = rootEl.querySelector('[data-role="pcolor"]');
  const $pf = rootEl.querySelector('[data-role="pface"]');
  const $groups = rootEl.querySelector('[data-role="groups"]');
  $filter.value = STATE.filterBiome;

  function refreshFaceOptions() {
    $pf.innerHTML = FACES.map(f => `<option value="${f.id}">${faceNameOf(f.id)}</option>`).join('');
    $pf.value = STATE.previewFace;
  }

  function repaint() {
    refreshFaceOptions();
    const biomes = STATE.filterBiome === 'all'
      ? BIOMES
      : BIOMES.filter(b => b.id === STATE.filterBiome);

    $groups.innerHTML = biomes.map(b => {
      const sections = FOOD_MODES.concat([{ key: 'hidden' }])
        .map(mode => {
          const list = SPECIES.filter(s => s.biome === b.id && s.foodMode === mode.key);
          if (!list.length) return '';
          const label = mode.key === 'hidden' ? '隐藏（特殊条件）' : foodModeLabel(b, mode.key);
          return `
            <h4 class="lib-group-title">${label}</h4>
            <div class="lib-grid">
              ${list.map(s => renderCard(s)).join('')}
            </div>
          `;
        }).join('');
      return `
        <section class="lib-biome">
          <h3 class="lib-biome-title">${b.emoji} ${b.name}</h3>
          ${sections}
        </section>
      `;
    }).join('');
  }

  function renderCard(species) {
    const bodyDrawn = has(k.body(species.id));
    return `
      <div class="lib-card" data-species="${species.id}">
        <div class="lib-card-art ${bodyDrawn ? '' : 'undrawn'}">
          <img class="px-img" src="${renderSpeciesPng(species.id, STATE.previewFace, STATE.previewColor)}" alt="">
        </div>
        <input class="lib-card-name-input" data-role="rename"
               value="${escapeAttr(nameOf(species.id))}"
               title="点击修改物种名">
        <div class="lib-card-actions">
          <button data-action="body" type="button">身体</button>
          <button data-action="mask" type="button">蒙版</button>
          <button data-action="facepos" type="button">面位</button>
        </div>
      </div>
    `;
  }

  $filter.addEventListener('change', () => { STATE.filterBiome = $filter.value; repaint(); });
  $pc.addEventListener('input', () => { STATE.previewColor = $pc.value.toUpperCase(); repaint(); });
  $pf.addEventListener('change', () => { STATE.previewFace = $pf.value; repaint(); });

  $groups.addEventListener('change', async e => {
    const input = e.target.closest('input[data-role="rename"]');
    if (input) {
      const id = input.closest('[data-species]').dataset.species;
      const newName = input.value.trim();
      if (newName) await setName(id, newName);
      onChange?.();
      return;
    }
  });

  $groups.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('[data-species]').dataset.species;
    const action = btn.dataset.action;
    const species = SPECIES.find(s => s.id === id);
    const refresh = () => { repaint(); onChange?.(); };

    if (action === 'body') {
      openEditor({
        title: `编辑身体：${nameOf(id)}（含嘴）`,
        storageKey: k.body(id),
        pngKey: k.bodyPng(id),
        onSaved: refresh,
      });
    } else if (action === 'mask') {
      openEditor({
        title: `编辑染色蒙版：${nameOf(id)}`,
        storageKey: k.mask(id),
        referenceUrl: get(k.bodyPng(id)) || null,
        onSaved: refresh,
      });
    } else if (action === 'facepos') {
      openFacePositionEditor({
        speciesId: id,
        faceId: STATE.previewFace,
        onSaved: refresh,
      });
    }
  });

  subscribe(key => {
    if (key.startsWith('body:') || key.startsWith('mask:') ||
        key.startsWith('face:') || key.startsWith('facepos:') ||
        key.startsWith('name:') || key.startsWith('food:')) {
      repaint();
    }
  });

  repaint();
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
