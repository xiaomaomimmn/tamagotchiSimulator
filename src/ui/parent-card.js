import { FACES, faceNameOf } from '../data/faces.js';
import { COLORS } from '../data/colors.js';
import { BIOMES } from '../data/biomes.js';
import { speciesByBiome, speciesById, nameOf } from '../data/species.js';
import { renderSpeciesPng, renderFacePng } from './species-render.js';
import { openImagePicker } from './image-color-picker.js';
import { subscribe } from '../storage.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function createParentCard(rootEl, parentLabel, initial, onChange) {
  // state.color 现在是任意 hex 字符串（如 '#FFB7C5'），不是固定调色板 ID
  const state = { ...initial };
  const supportsEyeDrop = typeof window !== 'undefined' && 'EyeDropper' in window;

  rootEl.innerHTML = `
    <h2>父母 ${parentLabel}</h2>
    <div class="parent-preview" data-role="preview">
      <img class="px-img" data-role="preview-img" alt="">
    </div>
    <div class="field">
      <label>生态区</label>
      <select data-role="biome">
        ${BIOMES.map(b => `<option value="${b.id}">${b.emoji} ${b.name}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>物种</label>
      <select data-role="species"></select>
    </div>
    <div class="field">
      <label>面部</label>
      <div class="face-row" data-role="face-row">
        <select data-role="face">
          ${FACES.map(f => `<option value="${f.id}">${faceNameOf(f.id)}</option>`).join('')}
        </select>
        <img class="px-img face-mini" data-role="face-mini" alt="">
      </div>
    </div>
    <div class="field">
      <label>体色</label>
      <div class="color-picker">
        <input type="color" data-role="color-native" value="${state.color}">
        <input type="text" data-role="color-hex" value="${state.color}" maxlength="7" pattern="#[0-9a-fA-F]{6}">
        ${supportsEyeDrop ? '<button type="button" data-role="eyedrop" title="从屏幕任意位置吸色（Chromium 浏览器）">💧屏幕</button>' : ''}
        <button type="button" data-role="img-pick" title="上传 / 粘贴图片后点击吸色（所有浏览器）">📷图片</button>
      </div>
    </div>
    <div class="field">
      <label>快选</label>
      <div class="color-swatches" data-role="colors">
        ${COLORS.map(c => `
          <button type="button" data-color="${c.hex}" style="background:${c.hex}" title="${c.name} ${c.hex}"></button>
        `).join('')}
      </div>
    </div>
  `;

  const $biome = rootEl.querySelector('[data-role="biome"]');
  const $species = rootEl.querySelector('[data-role="species"]');
  const $face = rootEl.querySelector('[data-role="face"]');
  const $faceMini = rootEl.querySelector('[data-role="face-mini"]');
  const $colorWrap = rootEl.querySelector('[data-role="colors"]');
  const $colorNative = rootEl.querySelector('[data-role="color-native"]');
  const $colorHex = rootEl.querySelector('[data-role="color-hex"]');
  const $eyedrop = rootEl.querySelector('[data-role="eyedrop"]');
  const $imgPick = rootEl.querySelector('[data-role="img-pick"]');
  const $previewImg = rootEl.querySelector('[data-role="preview-img"]');

  function refreshSpeciesOptions() {
    const list = speciesByBiome(state.biome);
    $species.innerHTML = list.map(s => `<option value="${s.id}">${nameOf(s.id)}</option>`).join('');
    if (!list.find(s => s.id === state.species)) state.species = list[0]?.id;
    $species.value = state.species || '';
  }

  function refreshFaceOptions() {
    $face.innerHTML = FACES.map(f => `<option value="${f.id}">${faceNameOf(f.id)}</option>`).join('');
    $face.value = state.face;
  }

  function refreshPreview() {
    refreshSpeciesOptions();
    refreshFaceOptions();
    $previewImg.src = renderSpeciesPng(state.species, state.face, state.color);
    $faceMini.src = renderFacePng(state.face);
    $colorWrap.querySelectorAll('button').forEach(btn => {
      btn.setAttribute('aria-pressed',
        btn.dataset.color.toLowerCase() === state.color.toLowerCase() ? 'true' : 'false');
    });
  }

  function setColor(hex, sourceEl) {
    if (!HEX_RE.test(hex)) return;
    state.color = hex.toUpperCase();
    if (sourceEl !== $colorNative) $colorNative.value = state.color.toLowerCase();
    if (sourceEl !== $colorHex)    $colorHex.value = state.color;
    refreshPreview();
    emit();
  }

  function emit() { onChange({ ...state }); }

  $biome.value = state.biome;
  refreshSpeciesOptions();
  $face.value = state.face;
  refreshPreview();

  $biome.addEventListener('change', () => {
    state.biome = $biome.value;
    refreshSpeciesOptions();
    refreshPreview();
    emit();
  });
  $species.addEventListener('change', () => {
    state.species = $species.value;
    refreshPreview();
    emit();
  });
  $face.addEventListener('change', () => {
    state.face = $face.value;
    refreshPreview();
    emit();
  });
  $colorWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-color]');
    if (!btn) return;
    setColor(btn.dataset.color);
  });
  $colorNative.addEventListener('input', () => setColor($colorNative.value.toUpperCase(), $colorNative));
  $colorHex.addEventListener('change', () => {
    let v = $colorHex.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (HEX_RE.test(v)) setColor(v.toUpperCase(), $colorHex);
    else $colorHex.value = state.color; // 还原
  });
  if ($eyedrop) {
    $eyedrop.addEventListener('click', async () => {
      try {
        const result = await new window.EyeDropper().open();
        setColor(result.sRGBHex.toUpperCase());
      } catch (e) { /* 用户取消或权限被拒 */ }
    });
  }
  $imgPick.addEventListener('click', () => {
    openImagePicker(hex => setColor(hex));
  });

  const unsubscribe = subscribe(() => refreshPreview());

  return {
    setBiomeFilter(allowedBiomes) {
      [...$biome.options].forEach(opt => {
        opt.disabled = allowedBiomes ? !allowedBiomes.includes(opt.value) : false;
      });
      if (allowedBiomes && !allowedBiomes.includes(state.biome)) {
        state.biome = allowedBiomes[0];
        $biome.value = state.biome;
        refreshSpeciesOptions();
        refreshPreview();
        emit();
      }
    },
    /** 整体替换 state（用于收藏 restore），更新所有控件 + 触发 onChange。 */
    setState(newState) {
      Object.assign(state, newState);
      $biome.value = state.biome;
      refreshSpeciesOptions();   // 也会同步 $species.value
      $species.value = state.species; // 显式再设一次，因为 refreshSpeciesOptions 可能 fallback
      $face.value = state.face;
      $colorNative.value = state.color.toLowerCase();
      $colorHex.value = state.color;
      refreshPreview();
      emit();
    },
    refresh: refreshPreview,
    getState() { return { ...state }; },
    destroy() { unsubscribe(); },
  };
}
