// 资源同步：把 IndexedDB 里的所有 user data 自动落盘到本地 `assets/library.json`，
// 这样 git commit + push 即可同步到 GitHub。
//
// 依赖 File System Access API（Chromium 95+）。Firefox/Safari 不支持时返回 false。
//
// 流程：
//   1. 用户在设置面板点「选择资源目录」→ 浏览器弹目录选择器
//   2. 句柄存进 IndexedDB（key=__fs_dir_handle__）以备会话间复用
//   3. 之后每次 IndexedDB 写入都 debounce 1.5s 重写一次 library.json
//   4. 重新打开页面 → 自动验证句柄权限 → 还可用则继续自动写

import { keys, get, set, has, subscribe } from '../storage.js';
import { imageFileToGrid, gridToDataURL } from '../ui/pixel-canvas.js';

const HANDLE_KEY = '__fs_dir_handle__';
const FILENAME = 'library.json';
const DIR_NAME = 'assets';

let dirHandle = null;
let assetsHandle = null;
let writeTimer = null;
let isRestoring = false;
let lastWriteTs = 0;
const listeners = new Set();

export function isSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function getStatus() {
  return {
    supported: isSupported(),
    connected: !!dirHandle,
    dirName: dirHandle?.name || null,
    lastWriteTs,
  };
}

export function onStatusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() { for (const fn of listeners) try { fn(); } catch (e) { console.error(e); } }

async function verifyPermission(handle, write = true) {
  const opts = { mode: write ? 'readwrite' : 'read' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

/** 启动时调用：如果之前授权过的目录还在，尝试恢复连接（默默尝试，失败也不弹窗）。 */
export async function tryRestore() {
  if (!isSupported()) return false;
  const saved = get(HANDLE_KEY);
  if (!saved) return false;
  // queryPermission 不弹窗
  try {
    if ((await saved.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
    dirHandle = saved;
    assetsHandle = await getOrCreateAssetsDir(dirHandle);
    notify();
    return true;
  } catch (e) {
    return false;
  }
}

/** 用户点「选择目录」按钮时调用。 */
export async function pickDirectory() {
  if (!isSupported()) throw new Error('当前浏览器不支持 File System Access API（仅 Chrome / Edge）');
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  if (!(await verifyPermission(handle))) throw new Error('未授予写入权限');
  dirHandle = handle;
  assetsHandle = await getOrCreateAssetsDir(dirHandle);
  await set(HANDLE_KEY, handle);
  notify();
  return handle.name;
}

async function getOrCreateAssetsDir(rootHandle) {
  // 优先复用 assets/，没有就在选定目录下创建
  try {
    return await rootHandle.getDirectoryHandle(DIR_NAME, { create: false });
  } catch {
    return await rootHandle.getDirectoryHandle(DIR_NAME, { create: true });
  }
}

/** 读 library.json → 覆盖 IndexedDB。返回 {restored, found}。 */
export async function loadFromDisk() {
  if (!assetsHandle) throw new Error('未连接资源目录');
  let fileHandle;
  try {
    fileHandle = await assetsHandle.getFileHandle(FILENAME);
  } catch (e) {
    if (e.name === 'NotFoundError') return { restored: 0, found: false };
    throw e;
  }
  const file = await fileHandle.getFile();
  const text = await file.text();
  const data = JSON.parse(text);
  isRestoring = true;
  try {
    let restored = 0;
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('__')) continue;
      await set(k, v);
      restored++;
    }
    return { restored, found: true };
  } finally {
    isRestoring = false;
  }
}

/** 写当前 IndexedDB 全集 → library.json。 */
export async function writeToDisk() {
  if (!assetsHandle) return false;
  const data = {};
  for (const k of keys()) {
    if (k.startsWith('__')) continue; // 跳过句柄等内部键
    const v = get(k);
    if (v != null) data[k] = v;
  }
  const fileHandle = await assetsHandle.getFileHandle(FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
  lastWriteTs = Date.now();
  notify();
  return true;
}

function scheduleWrite(ms = 1500) {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    writeTimer = null;
    try { await writeToDisk(); }
    catch (e) { console.error('fs-sync write failed:', e); }
  }, ms);
}

/** 主动断开（不删除磁盘文件）。 */
export async function disconnect() {
  dirHandle = null;
  assetsHandle = null;
  // 把句柄从 IndexedDB 清掉（这是用 storage.del 而不是 set null，否则下次仍能 get 到）
  const { del } = await import('../storage.js');
  await del(HANDLE_KEY);
  notify();
}

// 任意存储变动 → 防抖写盘（除了内部键和恢复中状态）
subscribe(k => {
  if (k.startsWith('__') || isRestoring) return;
  if (!dirHandle) return;
  scheduleWrite();
});

// ============================================================
// HTTP 自动加载：浏览器开页时通过 fetch 读 assets/library.json，
// 不需要 File System Access API、不需要任何用户授权。
// ============================================================

const LIBRARY_URL = './assets/library.json';

/** 通过 HTTP 拉取 library.json。文件不存在或非法返回 null。 */
export async function fetchLibraryJson() {
  try {
    const resp = await fetch(LIBRARY_URL, { cache: 'no-cache' });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    return null;
  }
}

/** 把 library.json 数据写回 IndexedDB（覆盖现有 key）。 */
export async function applyLibraryData(data) {
  isRestoring = true;
  try {
    let count = 0;
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('__')) continue;
      await set(k, v);
      count++;
    }
    return count;
  } finally {
    isRestoring = false;
  }
}

/** 启动时调用：本地 IDB 没有用户数据时，从 library.json 自动加载。 */
export async function autoLoadIfEmpty() {
  const userKeys = keys().filter(k => !k.startsWith('__'));
  if (userKeys.length > 0) return { loaded: false, reason: 'idb-has-data', count: userKeys.length };
  const data = await fetchLibraryJson();
  if (!data) return { loaded: false, reason: 'no-file' };
  const count = await applyLibraryData(data);
  return { loaded: true, count };
}

/** 强制从 library.json 重新加载（覆盖本地）。 */
export async function reloadFromLibraryJson() {
  const data = await fetchLibraryJson();
  if (!data) return { loaded: false, reason: 'no-file' };
  const count = await applyLibraryData(data);
  return { loaded: true, count };
}

// ============================================================
// 文件夹一键导入：选定一个根目录，自动扫 body/ mask/ eye/ 三个
// 子目录里的 PNG，按文件名映射到对应的物种/面部并写入 IndexedDB。
//
// 命名约定：{type}_{N}_{M}.png
//   N = 1-16：(N-1)/4 = 生态下标（0-3：陆地/天空/海洋/翠林），
//             (N-1)%4 = 主食下标（0-3：甲/乙/丙/杂）
//   M = 1-4：该 (生态, 主食) 槽位的物种序号
//   M = "yin"：该生态的隐藏物种
// 例：body_1_1 → 陆地·甲01；body_5_1 → 天空·甲01；body_1_yin → 陆地·隐藏
// ============================================================

const BIOME_PREFIXES = ['l', 's', 'w', 'f']; // 陆地/天空/海洋/翠林
const FOOD_MODES_KEYS = ['A', 'B', 'C', 'omnivore'];

function parseImageFilename(folderType, name) {
  const m = name.match(/^(body|mask|eye)_(\d+)_(\d+|yin)\.png$/i);
  if (!m) return null;
  const [, type, nStr, mStr] = m;
  if (type.toLowerCase() !== folderType) return null;
  const N = parseInt(nStr, 10);
  const biomeIdx = Math.floor((N - 1) / 4);
  if (biomeIdx < 0 || biomeIdx > 3) return null;
  const biomePrefix = BIOME_PREFIXES[biomeIdx];

  let speciesId, faceIndex;
  if (mStr.toLowerCase() === 'yin') {
    speciesId = `sp_${biomePrefix}_hidden1`;
    faceIndex = biomeIdx * 17 + 16; // 4×4 normal + 1 hidden = 17，hidden 在最后
  } else {
    const foodIdx = (N - 1) % 4;
    const foodMode = FOOD_MODES_KEYS[foodIdx];
    const speciesIdx = parseInt(mStr, 10) - 1;
    if (speciesIdx < 0 || speciesIdx > 3) return null;
    speciesId = `sp_${biomePrefix}_${foodMode}${speciesIdx + 1}`;
    faceIndex = biomeIdx * 17 + foodIdx * 4 + speciesIdx;
  }
  const faceId = `fc_${String(faceIndex + 1).padStart(2, '0')}`;
  return { speciesId, faceId };
}

/**
 * 弹目录选择器 → 扫 body/ mask/ eye/ → 全部 PNG 导入到对应物种/面部。
 * 返回 { body, mask, eye, skipped, errors[] }
 */
export async function importImageFolder() {
  if (!isSupported()) throw new Error('当前浏览器不支持目录访问（仅 Chrome / Edge）');
  const rootHandle = await window.showDirectoryPicker({ mode: 'read' });

  const results = { body: 0, mask: 0, eye: 0, skipped: 0, errors: [] };
  isRestoring = true; // 屏蔽 fs-sync 自动回写（避免每张图触发一次写盘）
  try {
    for (const folderType of ['body', 'mask', 'eye']) {
      let subDir;
      try {
        subDir = await rootHandle.getDirectoryHandle(folderType);
      } catch {
        continue; // 子目录不存在 → 跳过
      }
      for await (const [name, handle] of subDir.entries()) {
        if (handle.kind !== 'file' || !name.toLowerCase().endsWith('.png')) {
          results.skipped++;
          continue;
        }
        const target = parseImageFilename(folderType, name);
        if (!target) {
          results.errors.push(`${folderType}/${name}：文件名格式不识别`);
          continue;
        }
        try {
          const file = await handle.getFile();
          const grid = await imageFileToGrid(file);
          const dataUrl = gridToDataURL(grid);
          if (folderType === 'body') {
            await set(`body:${target.speciesId}`, grid);
            await set(`body:${target.speciesId}:png`, dataUrl);
            results.body++;
          } else if (folderType === 'mask') {
            await set(`mask:${target.speciesId}`, grid);
            results.mask++;
          } else if (folderType === 'eye') {
            await set(`face:${target.faceId}`, grid);
            await set(`face:${target.faceId}:png`, dataUrl);
            results.eye++;
          }
        } catch (e) {
          results.errors.push(`${folderType}/${name}：${e.message || e}`);
        }
      }
    }
  } finally {
    isRestoring = false;
  }
  // 完成后触发一次写盘（如果连接了目录）
  if (dirHandle) scheduleWrite(0);
  return results;
}

/** 触发浏览器下载当前 IndexedDB 全集为 library.json（任何浏览器都能用）。 */
export function downloadLibraryJson() {
  const data = {};
  for (const k of keys()) {
    if (k.startsWith('__')) continue;
    const v = get(k);
    if (v != null) data[k] = v;
  }
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'library.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  return Object.keys(data).length;
}
