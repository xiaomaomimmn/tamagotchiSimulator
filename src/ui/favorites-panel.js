// 收藏列表面板：每条 = 一个具体的 (物种, 面部, 体色) 组合 + 育成上下文快照。
// 点「查看配种方法」 → onRestore(snapshot) 由 main.js 还原 UI。

import { listFavorites, removeFavorite, onFavoritesChange } from '../data/favorites.js';
import { nameOf, speciesById } from '../data/species.js';
import { faceNameOf } from '../data/faces.js';
import { biomeById, foodModeLabel } from '../data/biomes.js';
import { renderSpeciesPng } from './species-render.js';

export function renderFavoritesPanel(rootEl, { onRestore }) {
  function repaint() {
    const favs = listFavorites();
    if (!favs.length) {
      rootEl.innerHTML = `<p class="hint">还没有收藏。在「后代可能性」里点输出卡左上角的 ☆ 即可收藏那个具体的 (物种 + 面部 + 体色) 组合及当时配种方法。</p>`;
      return;
    }
    rootEl.innerHTML = `
      <p class="hint">每条收藏 = <strong>一个具体可能性</strong>（物种 + 面部 + 体色 + 当时上下文）。点「查看配种方法」还原全部输入。</p>
      <div class="fav-grid">
        ${favs.map(renderEntry).join('')}
      </div>
    `;
  }

  function renderEntry({ speciesId, face, color, snapshot }) {
    const biome = biomeById(snapshot.raiseBiome);
    const a = snapshot.parentA;
    const b = snapshot.parentB;
    const img = renderSpeciesPng(speciesId, face, color);
    return `
      <div class="fav-card" data-species="${speciesId}" data-face="${face}" data-color="${color}">
        <img class="px-img fav-art" src="${img}" alt="${nameOf(speciesId)}">
        <div class="fav-meta">
          <div class="fav-name">${nameOf(speciesId)}</div>
          <div class="fav-target">
            面部：<strong>${faceNameOf(face)}</strong> ·
            体色：<span class="inline-swatch" style="background:${color}"></span><code>${color}</code>
          </div>
          <div class="fav-summary">
            育成：${biome?.emoji ?? ''} ${biome?.name ?? '?'} · ${foodModeLabel(biome, snapshot.foodMode)}<br>
            父母 A：${nameOf(a.species)}（${biomeById(a.biome)?.name ?? '?'}）<br>
            父母 B：${nameOf(b.species)}（${biomeById(b.biome)?.name ?? '?'}）
            ${snapshot.mamaCount != null ? `<br>麻麻圈：${snapshot.mamaCount}` : ''}
          </div>
          <div class="fav-actions">
            <button data-action="restore" type="button" class="primary-btn">查看配种方法</button>
            <button data-action="remove"  type="button">删除</button>
          </div>
        </div>
      </div>
    `;
  }

  rootEl.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-species]');
    const speciesId = card.dataset.species;
    const face = card.dataset.face;
    const color = card.dataset.color;
    if (btn.dataset.action === 'restore') {
      const fav = listFavorites().find(f =>
        f.speciesId === speciesId && f.face === face && f.color === color);
      if (fav) onRestore(fav.snapshot);
    } else if (btn.dataset.action === 'remove') {
      await removeFavorite(speciesId, face, color);
    }
  });

  onFavoritesChange(repaint);
  repaint();
}
