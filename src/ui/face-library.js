// 面部库：按对应物种的「生态 + 主食」分组（与物种库结构对齐）。
// 每个面部 fc_NN 通过 faceIndexOf 映射到 SPECIES 同序位置的物种，
// 所以分组维度也跟着那个物种。

import { FACES, faceNameOf, faceIndexOf } from '../data/faces.js';
import { SPECIES } from '../data/species.js';
import { BIOMES, FOOD_MODES, foodModeLabel } from '../data/biomes.js';
import { renderFacePng } from './species-render.js';
import { openEditor } from './canvas-editor.js';
import { has, k, subscribe } from '../storage.js';

const STATE = { filterBiome: 'all' };

export function renderFaceLibrary(rootEl, onChange) {
  rootEl.innerHTML = `
    <p class="hint">68 个可遗传面部特征。<strong>仅画眼睛 / 表情</strong>（嘴属于身体，请到「物种库」的「身体」里画）。
       名字自动跟随对应位置的物种名（在物种库重命名物种即同步更新）。</p>
    <div class="lib-controls">
      <label>生态区：<select data-role="filter">
        <option value="all">全部</option>
        ${BIOMES.map(b => `<option value="${b.id}">${b.emoji} ${b.name}</option>`).join('')}
      </select></label>
    </div>
    <div data-role="groups"></div>
  `;
  const $filter = rootEl.querySelector('[data-role="filter"]');
  const $groups = rootEl.querySelector('[data-role="groups"]');
  $filter.value = STATE.filterBiome;

  // 预计算：face → species（不可变映射，由 SPECIES 顺序决定）
  const faceToSpecies = new Map();
  for (const f of FACES) {
    const idx = faceIndexOf(f.id);
    const sp = SPECIES[idx];
    if (sp) faceToSpecies.set(f.id, sp);
  }

  function repaint() {
    const biomes = STATE.filterBiome === 'all'
      ? BIOMES
      : BIOMES.filter(b => b.id === STATE.filterBiome);

    $groups.innerHTML = biomes.map(b => {
      const sections = FOOD_MODES.concat([{ key: 'hidden' }]).map(mode => {
        const list = FACES.filter(f => {
          const sp = faceToSpecies.get(f.id);
          return sp && sp.biome === b.id && sp.foodMode === mode.key;
        });
        if (!list.length) return '';
        const label = mode.key === 'hidden' ? '隐藏（特殊条件）' : foodModeLabel(b, mode.key);
        return `
          <h4 class="lib-group-title">${label}</h4>
          <div class="lib-grid">
            ${list.map(f => renderCard(f)).join('')}
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

  function renderCard(f) {
    const drawn = has(k.face(f.id));
    return `
      <div class="lib-card" data-face="${f.id}">
        <div class="lib-card-art ${drawn ? '' : 'undrawn'}">
          <img class="px-img" src="${renderFacePng(f.id)}" alt="">
        </div>
        <div class="lib-card-name">${faceNameOf(f.id)}${drawn ? '' : ' <small>· 未绘</small>'}</div>
        <button data-action="edit" type="button">编辑</button>
      </div>
    `;
  }

  $filter.addEventListener('change', () => {
    STATE.filterBiome = $filter.value;
    repaint();
  });

  $groups.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action="edit"]');
    if (!btn) return;
    const id = btn.closest('[data-face]').dataset.face;
    openEditor({
      title: `编辑面部：${faceNameOf(id)}（仅眼睛 / 表情，不含嘴）`,
      storageKey: k.face(id),
      pngKey: k.facePng(id),
      onSaved: () => { repaint(); onChange?.(); },
    });
  });

  subscribe(key => {
    if (key.startsWith('face:') || key.startsWith('name:') || key.startsWith('food:')) repaint();
  });
  repaint();
}
