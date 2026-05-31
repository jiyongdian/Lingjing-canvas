// 预加载层桌面存储域：性能档位读取/持久化 + IndexedDB 桌面存储层(读写/迁移/键值增删)。
const {
  STORAGE_KEY,
  STORAGE_DB_NAME,
  STORAGE_DB_VERSION,
  STORAGE_DB_STORE,
  PERFORMANCE_PROFILE_STORAGE_KEY,
  PERFORMANCE_PROFILE_CUSTOM_KEY,
  PERFORMANCE_PROFILE_PRESETS,
} = require("./constants.cjs");

let storageDbPromise = null;
let legacyStorageMigrationPromise = null;

function clampPerformanceNumber(value, fallback, min = 1, max = 20) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizePerformanceProfileKey(value) {
  const key = String(value || "").trim();
  return PERFORMANCE_PROFILE_PRESETS[key] ? key : "balanced";
}

function readPerformanceProfileKey() {
  try {
    return normalizePerformanceProfileKey(window.localStorage?.getItem(PERFORMANCE_PROFILE_STORAGE_KEY));
  } catch {
    return "balanced";
  }
}

function readCustomPerformanceSettings() {
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(PERFORMANCE_PROFILE_CUSTOM_KEY) || "{}");
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  return {};
}

function getPerformanceSettings() {
  const key = readPerformanceProfileKey();
  const base = PERFORMANCE_PROFILE_PRESETS[key] || PERFORMANCE_PROFILE_PRESETS.balanced;
  const custom = key === "custom" ? readCustomPerformanceSettings() : {};
  return {
    ...base,
    ...custom,
    key,
    layeredRunMaxConcurrency: clampPerformanceNumber(custom.layeredRunMaxConcurrency ?? base.layeredRunMaxConcurrency, base.layeredRunMaxConcurrency, 1, 20),
    aiGenerateLimit: clampPerformanceNumber(custom.aiGenerateLimit ?? base.aiGenerateLimit, base.aiGenerateLimit, 1, 10),
    aiChatLimit: clampPerformanceNumber(custom.aiChatLimit ?? base.aiChatLimit, base.aiChatLimit, 1, 10),
    aiSubmitLimit: clampPerformanceNumber(custom.aiSubmitLimit ?? base.aiSubmitLimit, base.aiSubmitLimit, 1, 5),
    aiPollLimit: clampPerformanceNumber(custom.aiPollLimit ?? base.aiPollLimit, base.aiPollLimit, 1, 10)
  };
}

function getPerformanceFetchLimit(name, fallback) {
  return clampPerformanceNumber(getPerformanceSettings()[name], fallback, 1, 10);
}

function persistPerformanceProfile(key, settings = null) {
  const normalizedKey = normalizePerformanceProfileKey(key);
  try {
    window.localStorage?.setItem(PERFORMANCE_PROFILE_STORAGE_KEY, normalizedKey);
    if (settings && normalizedKey === "custom") {
      window.localStorage?.setItem(PERFORMANCE_PROFILE_CUSTOM_KEY, JSON.stringify(settings));
    }
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent("wanjuan:performance-profile-changed", {
      detail: { key: normalizedKey, settings: getPerformanceSettings() }
    }));
  } catch {}
}

function openDesktopStorageDb() {
  if (storageDbPromise) return storageDbPromise;
  storageDbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = window.indexedDB.open(STORAGE_DB_NAME, STORAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORAGE_DB_STORE)) db.createObjectStore(STORAGE_DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open desktop storage database"));
  });
  return storageDbPromise;
}

async function getIndexedDesktopStorage() {
  const db = await openDesktopStorageDb();
  return new Promise((resolve, reject) => {
    const result = {};
    const transaction = db.transaction(STORAGE_DB_STORE, "readonly");
    const store = transaction.objectStore(STORAGE_DB_STORE);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      result[cursor.key] = cursor.value;
      cursor.continue();
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || request.error);
  });
}

async function getIndexedDesktopStorageItems(keys) {
  const db = await openDesktopStorageDb();
  const keyList = Array.isArray(keys) ? keys : [keys];
  return new Promise((resolve, reject) => {
    const result = {};
    const transaction = db.transaction(STORAGE_DB_STORE, "readonly");
    const store = transaction.objectStore(STORAGE_DB_STORE);
    let pending = keyList.length;
    if (!pending) {
      resolve(result);
      return;
    }
    for (const key of keyList) {
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result !== undefined) result[key] = request.result;
        pending -= 1;
        if (pending === 0) resolve(result);
      };
      request.onerror = () => reject(request.error);
    }
    transaction.onerror = () => reject(transaction.error);
  });
}

async function setIndexedDesktopStorageItems(items) {
  const db = await openDesktopStorageDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORAGE_DB_STORE, "readwrite");
    const store = transaction.objectStore(STORAGE_DB_STORE);
    for (const [key, value] of Object.entries(items || {})) store.put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function removeIndexedDesktopStorageItems(keys) {
  const db = await openDesktopStorageDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORAGE_DB_STORE, "readwrite");
    const store = transaction.objectStore(STORAGE_DB_STORE);
    for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function clearIndexedDesktopStorage() {
  const db = await openDesktopStorageDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORAGE_DB_STORE, "readwrite");
    transaction.objectStore(STORAGE_DB_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function readDesktopStorage() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeDesktopStorage(value) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value || {}));
}

function migrateLegacyDesktopStorage() {
  if (legacyStorageMigrationPromise) return legacyStorageMigrationPromise;
  legacyStorageMigrationPromise = (async () => {
    const legacy = readDesktopStorage();
    if (!legacy || Object.keys(legacy).length === 0) return;
    await setIndexedDesktopStorageItems(legacy);
    window.localStorage.removeItem(STORAGE_KEY);
  })().catch((error) => {
    console.warn("desktop storage migration skipped", error);
  });
  return legacyStorageMigrationPromise;
}

async function readDesktopStorageAsync() {
  try {
    await migrateLegacyDesktopStorage();
    return await getIndexedDesktopStorage();
  } catch (error) {
    console.warn("desktop storage read fallback", error);
    return readDesktopStorage();
  }
}

async function getDesktopStorageItems(keys) {
  if (keys === null || keys === undefined) return readDesktopStorageAsync();
  const keyList = Array.isArray(keys)
    ? keys
    : typeof keys === "string"
      ? [keys]
      : keys && typeof keys === "object"
        ? Object.keys(keys)
        : [];
  try {
    await migrateLegacyDesktopStorage();
    const stored = await getIndexedDesktopStorageItems(keyList);
    if (keys && typeof keys === "object" && !Array.isArray(keys)) {
      return { ...keys, ...stored };
    }
    return stored;
  } catch (error) {
    console.warn("desktop storage keyed read fallback", error);
    return pickStorage(keys, readDesktopStorage());
  }
}

async function setDesktopStorageItems(items) {
  try {
    await migrateLegacyDesktopStorage();
    await setIndexedDesktopStorageItems(items || {});
    mirrorBootThemeFromStore(items);
  } catch (error) {
    console.warn("desktop storage set fallback", error);
    try {
      const next = { ...readDesktopStorage(), ...(items || {}) };
      writeDesktopStorage(next);
      mirrorBootThemeFromStore(items);
    } catch (fallbackError) {
      console.warn("desktop localStorage fallback skipped", fallbackError);
    }
  }
}

async function removeDesktopStorageItems(keys) {
  try {
    await migrateLegacyDesktopStorage();
    await removeIndexedDesktopStorageItems(keys);
  } catch (error) {
    console.warn("desktop storage remove fallback", error);
    const store = readDesktopStorage();
    for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
    writeDesktopStorage(store);
  }
}

const resetStorageDbPromise = () => { storageDbPromise = null; };

module.exports = {
  clampPerformanceNumber,
  normalizePerformanceProfileKey,
  readPerformanceProfileKey,
  readCustomPerformanceSettings,
  getPerformanceSettings,
  getPerformanceFetchLimit,
  persistPerformanceProfile,
  openDesktopStorageDb,
  getIndexedDesktopStorage,
  getIndexedDesktopStorageItems,
  setIndexedDesktopStorageItems,
  removeIndexedDesktopStorageItems,
  clearIndexedDesktopStorage,
  readDesktopStorage,
  writeDesktopStorage,
  migrateLegacyDesktopStorage,
  readDesktopStorageAsync,
  getDesktopStorageItems,
  setDesktopStorageItems,
  removeDesktopStorageItems,
  resetStorageDbPromise,
};

// 跨模块 late-require：避免循环依赖，运行时再解析引用。
var { mirrorBootThemeFromStore } = require("./boot-theme.cjs");
var { pickStorage } = require("./chrome-shim.cjs");
