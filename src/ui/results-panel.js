import { faceById, faceNameOf } from '../data/faces.js';
import { speciesByBiomeAndMode, hiddenSpeciesByBiome, nameOf } from '../data/species.js';
import { BIOMES, biomeById, foodModeLabel } from '../data/biomes.js';
import { getConnections, toggleConnection, hiddenUnlocked } from '../data/connections.js';
import {
  getMamaCount, setMamaCount, speciesIndexForCount, MAMA_MAX,
} from '../data/mamaring.js';
import { isFavorite, toggleFavorite } from '../data/favorites.js';
import { renderSpeciesPng } from './species-render.js';

export function renderResults(rootEl, distribution, raisingBiome, foodMode, biasInfo = {}, getSnapshot = null) {
  const biome = biomeById(raisingBiome);
  const modeLabel = foodModeLabel(biome, foodMode);
  const foodSpecies = speciesByBiomeAndMode(raisingBiome, foodMode);
  const hiddenSp = hiddenSpeciesByBiome(raisingBiome);

  const isOmnivore = foodMode === 'omnivore';
  const connected = hiddenUnlocked(raisingBiome);
  const hiddenActive = connected && !isOmnivore;

  const mamaCount = getMamaCount();
  const mamaIdx = speciesIndexForCount(mamaCount);

  // 物种池：
  //   hiddenActive   → 单一物种 = 隐藏（必然）
  //   mama 指定      → 仅匹配的那 1 个物种（4 选 1）
  //   两者都不       → 当前 foodMode 的 4 个物种均等
  let activeSpecies;
  if (hiddenActive && hiddenSp) {
    activeSpecies = [{ sp: hiddenSp, isHidden: true }];
  } else if (mamaIdx != null && foodSpecies[mamaIdx]) {
    activeSpecies = [{ sp: foodSpecies[mamaIdx], isHidden: false }];
  } else {
    activeSpecies = foodSpecies.map(s => ({ sp: s, isHidden: false }));
  }

  const groups = activeSpecies.map(({ sp, isHidden }) => ({
    species: sp,
    isHidden,
    isLocked: false,
    cards: distribution.map(fc => ({
      face: fc.face,
      color: fc.color,
      probability: fc.probability,
    })),
  }));

  // 锁定的物种作为预览组（灰化）：
  //   - 隐藏物种锁定时
  //   - mama 指定后，未匹配的其他 3 个物种
  if (!hiddenActive && hiddenSp) {
    groups.push({
      species: hiddenSp,
      isHidden: true,
      isLocked: true,
      lockReason: isOmnivore ? 'omnivore' : 'no-connection',
      cards: distribution.map(fc => ({ face: fc.face, color: fc.color, probability: 0 })),
    });
  }
  if (!hiddenActive && mamaIdx != null) {
    foodSpecies.forEach((sp, i) => {
      if (i === mamaIdx) return;
      groups.push({
        species: sp,
        isHidden: false,
        isLocked: true,
        lockReason: 'mama-mismatch',
        cards: distribution.map(fc => ({ face: fc.face, color: fc.color, probability: 0 })),
      });
    });
  }

  let topHint;
  if (hiddenActive) {
    topHint = `🔓 隐藏物种已激活 — 后代<strong>必然</strong>为「${nameOf(hiddenSp.id)}」。`;
  } else if (mamaIdx != null) {
    topHint = `🧬 麻麻圈 = ${mamaCount} → 后代<strong>必然</strong>为「${nameOf(foodSpecies[mamaIdx].id)}」。`;
  } else {
    topHint = `物种均等出现：${foodSpecies.length} 个物种 × ${(100 / foodSpecies.length).toFixed(1)}%`
      + `；选择麻麻圈数量可锁定到具体物种。组内 4 种面色组合均分。`;
  }

  rootEl.innerHTML = `
    <h2>后代可能性</h2>

    ${renderUnlockBlock(biome, isOmnivore, connected, hiddenActive, hiddenSp, mamaCount, foodSpecies)}

    ${renderBiasBanner(biasInfo)}

    <p class="hint">
      在 ${biome?.emoji} ${biome?.name} 场育成，${modeLabel}。${topHint}
    </p>

    <div class="outcome-groups">
      ${groups.length
        ? groups.map(renderGroup).join('')
        : '<p>该 (生态, 喂食) 槽位无物种数据。</p>'}
    </div>
  `;

  rootEl.querySelectorAll('input[data-role="conn-toggle"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      await toggleConnection(raisingBiome, cb.dataset.other);
    });
  });
  rootEl.querySelectorAll('button[data-role="mama-pick"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const v = btn.dataset.count;
      await setMamaCount(v === '' ? null : Number(v));
    });
  });

  // 收藏切换：点输出卡左上角的 ☆/⭐（按 species+face+color 三元组独立收藏）
  rootEl.querySelectorAll('button[data-role="fav-toggle"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const speciesId = btn.dataset.species;
      const face = btn.dataset.face;
      const color = btn.dataset.color;
      const snapshot = getSnapshot ? getSnapshot() : null;
      if (!snapshot) return;
      await toggleFavorite(speciesId, face, color, snapshot);
    });
  });
}

function renderGroup({ species, isHidden, isLocked, lockReason, cards }) {
  let lockTip = '';
  if (lockReason === 'omnivore') lockTip = '杂食模式下不可解锁';
  else if (lockReason === 'no-connection') lockTip = '联机不足';
  else if (lockReason === 'mama-mismatch') lockTip = '麻麻圈数量不匹配';
  const speciesName = nameOf(species.id);
  return `
    <section class="outcome-group ${isHidden ? 'hidden-group' : ''} ${isLocked ? 'locked-group' : ''}">
      <h4 class="outcome-group-title">
        ${isHidden ? '✨ ' : ''}${speciesName}
        ${isLocked
          ? `<span class="locked-tag">🔒 ${lockTip}</span>`
          : `<small class="hint">${cards.length} 种可能性，组内均分</small>`}
      </h4>
      <div class="outcome-grid">
        ${cards.map((card, i) =>
          renderOutcomeCard(species, speciesName, card, i + 1, cards.length, isLocked)
        ).join('')}
      </div>
    </section>
  `;
}

function renderOutcomeCard(species, speciesName, { face, color, probability }, idx, total, isLocked) {
  const src = renderSpeciesPng(species.id, face, color);
  const pct = isLocked
    ? '🔒'
    : (probability * 100).toFixed(probability < 0.001 ? 3 : 1) + '%';
  const label = total > 1 ? `${speciesName}-${idx}` : speciesName;
  const faved = isFavorite(species.id, face, color);
  return `
    <div class="outcome-card ${isLocked ? 'locked-species' : ''}"
         title="${label} · ${faceNameOf(face)} · ${color}">
      <button class="fav-btn ${faved ? 'faved' : ''}"
              data-role="fav-toggle"
              data-species="${species.id}"
              data-face="${face}"
              data-color="${color}"
              title="${faved ? '已收藏此组合，点击取消' : '收藏这一具体可能性（物种 + 面部 + 体色）'}"
              type="button">${faved ? '⭐' : '☆'}</button>
      <div class="outcome-prob">${pct}</div>
      <img class="px-img outcome-art" src="${src}" alt="">
      <div class="outcome-name">${label}</div>
    </div>
  `;
}

function renderBiasBanner(biasInfo) {
  const { effectiveSelf, parentBiomes } = biasInfo;
  if (parentBiomes == null) return ''; // 调用方未传，跳过
  const aBiomeName = biomeNameOf(parentBiomes.A);
  const bBiomeName = biomeNameOf(parentBiomes.B);
  let line, ratio;
  if (effectiveSelf === 'A') {
    line = `本体 = 父母 A（${aBiomeName}）· 对方 = 父母 B（${bBiomeName}）`;
    ratio = 'A 25% / B 75%';
  } else if (effectiveSelf === 'B') {
    line = `本体 = 父母 B（${bBiomeName}）· 对方 = 父母 A（${aBiomeName}）`;
    ratio = 'A 75% / B 25%';
  } else {
    line = '无明确本体 — 父母双方均在或均不在育成场';
    ratio = 'A 50% / B 50%';
  }
  return `<p class="bias-banner">🧬 ${line} · <strong>${ratio}</strong></p>`;
}

function biomeNameOf(biomeId) {
  const b = BIOMES.find(x => x.id === biomeId);
  return b ? `${b.emoji} ${b.name}` : '?';
}

function renderUnlockBlock(biome, isOmnivore, connected, hiddenActive, hiddenSp, mamaCount, foodSpecies) {
  const conns = getConnections(biome.id);
  const remaining = Math.max(0, 2 - conns.size);
  const others = BIOMES.filter(b => b.id !== biome.id);

  let hiddenStatusTag;
  if (isOmnivore) {
    hiddenStatusTag = '<span class="locked-tag">🔒 杂食模式下隐藏永远不出现</span>';
  } else if (hiddenActive) {
    hiddenStatusTag = '<span class="unlocked-tag">✓ 已激活（后代 100% 隐藏）</span>';
  } else {
    hiddenStatusTag = `<span class="locked-tag">🔒 还差 ${remaining} 个生态</span>`;
  }

  // 麻麻圈选项：未指定 + 0..6
  const mamaOptions = [
    { v: '',  label: '未指定' },
    ...Array.from({ length: MAMA_MAX + 1 }, (_, i) => ({ v: String(i), label: String(i) })),
  ];
  const matchedName = (() => {
    const idx = speciesIndexForCount(mamaCount);
    return idx != null && foodSpecies[idx] ? nameOf(foodSpecies[idx].id) : null;
  })();

  return `
    <div class="conn-block">
      ${hiddenSp ? `
      <div class="conn-section">
        <strong>${biome.emoji} ${biome.name}</strong> 隐藏物种解锁：
        与 ≥ 2 个不同生态联机 + 非杂食 · ${hiddenStatusTag}
        <div class="conn-checks">
          ${others.map(o => `
            <label>
              <input type="checkbox" data-role="conn-toggle" data-other="${o.id}" ${conns.has(o.id) ? 'checked' : ''}>
              ${o.emoji} ${o.name}
            </label>
          `).join('')}
        </div>
        ${isOmnivore && connected
          ? '<p class="hint" style="margin-top:8px">⚠ 联机条件已满足，但当前是杂食模式 —— 切换为主食 A/B/C 即可激活。</p>'
          : ''}
      </div>
      ` : ''}

      <div class="conn-section">
        <strong>麻麻圈数量</strong>
        <small class="hint">
          基因里有几个麻麻圈决定主食大类下成年成哪种：
          0→01 · 1→02 · 2–5→03 · 6→04
        </small>
        <div class="mama-pick">
          ${mamaOptions.map(o => `
            <button type="button"
                    data-role="mama-pick"
                    data-count="${o.v}"
                    class="mama-btn ${String(mamaCount ?? '') === o.v ? 'active' : ''}">
              ${o.label}
            </button>
          `).join('')}
        </div>
        <p class="hint" style="margin-top:6px">
          ${matchedName
            ? `当前 = ${mamaCount} → 锁定到 <strong>${matchedName}</strong>`
            : '未指定 → 4 物种均展示'}
          ${hiddenActive ? '（隐藏激活时，此设定被覆盖）' : ''}
        </p>
      </div>
    </div>
  `;
}
