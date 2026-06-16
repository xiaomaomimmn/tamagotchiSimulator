// IndexedDB-backed art store with in-memory cache.
//
// Keys are namespaced strings: 'body:sp_l01', 'mask:sp_l01', 'face:fc_03',
// 'facepos:sp_l01'. Values are JSON-serializable (pixel grids = 2D arrays of
// hex strings or null; positions = {x,y}; PNG data URLs = strings).
//
// Call `initStorage()` once at startup — it opens the DB and fills the cache.
// All reads (`get`) hit cache synchronously. All writes (`set`) update cache
// AND async-write to IndexedDB.

const DB_NAME = 'tamagotchi-art';
const STORE = 'art';
const DB_VERSION = 1;

const cache = new Map();
let db = null;
const subscribers = new Set();

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function initStorage() {
  db = await openDB();
  await new Promise((resolve, reject) => {
    const req = tx('readonly').openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(); return; }
      cache.set(cur.key, cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export function get(key) {
  return cache.get(key);
}

export function has(key) {
  return cache.has(key);
}

export function keys() {
  return Array.from(cache.keys());
}

export async function set(key, value) {
  cache.set(key, value);
  notify(key);
  if (!db) return;
  await new Promise((resolve, reject) => {
    const req = tx('readwrite').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function del(key) {
  cache.delete(key);
  notify(key);
  if (!db) return;
  await new Promise((resolve, reject) => {
    const req = tx('readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function notify(key) {
  for (const fn of subscribers) {
    try { fn(key); } catch (e) { console.error(e); }
  }
}

// ---------- helpers for art keys ----------

export const k = {
  body:    id => `body:${id}`,
  bodyPng: id => `body:${id}:png`,
  mask:    id => `mask:${id}`,
  face:    id => `face:${id}`,
  facePng: id => `face:${id}:png`,
  facePos: id => `facepos:${id}`,
};
