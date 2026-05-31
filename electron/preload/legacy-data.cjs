// 旧版用户数据迁移/清理与桌面存储恢复：检测有意义存储、清空 IndexedDB/运行时数据、主题值归一化与恢复
const { fs, path } = require("./runtime.cjs");
const {
  RECOVERY_MARKER_KEY,
  LEGACY_DATA_DECISION_KEY,
  LEGACY_DATA_DECISION_VERSION,
  STORAGE_DB_NAME,
} = require("./constants.cjs");

function hasMeaningfulDesktopStorage(store) {
  if (!store || typeof store !== "object") return false;
  return Object.entries(store).some(([key, value]) => {
    if (key === "users" && Array.isArray(value) && value.length === 0) return false;
    return hasStoredValue(value);
  });
}

async function listIndexedDbNames() {
  if (!window.indexedDB || typeof window.indexedDB.databases !== "function") return [];
  try {
    const databases = await window.indexedDB.databases();
    return databases
      .map((entry) => String(entry?.name || "").trim())
      .filter(Boolean);
  } catch (error) {
    console.warn("indexedDB database listing skipped", error);
    return [];
  }
}

async function clearAllIndexedDbDatabases() {
  const names = await listIndexedDbNames();
  for (const name of names) {
    await new Promise((resolve) => {
      try {
        const request = window.indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      } catch (error) {
        console.warn("indexedDB delete skipped", name, error);
        resolve();
      }
    });
  }
  resetStorageDbPromise();
}

async function clearAllUserRuntimeData() {
  try {
    await clearDesktopStorage();
  } catch (error) {
    console.warn("desktop storage clear skipped", error);
  }
  try {
    await clearAllIndexedDbDatabases();
  } catch (error) {
    console.warn("indexedDB clear skipped", error);
  }
  try {
    window.sessionStorage.clear();
  } catch (error) {
    console.warn("sessionStorage clear skipped", error);
  }
  try {
    window.localStorage.clear();
  } catch (error) {
    console.warn("localStorage clear skipped", error);
  }
  clearLegacyThemeStorage();
}

async function confirmLegacyUserDataChoice() {
  const decision = window.localStorage.getItem(LEGACY_DATA_DECISION_KEY);
  if (decision === LEGACY_DATA_DECISION_VERSION) return;

  clearLegacyThemeStorage();
  const databaseNames = await listIndexedDbNames();
  const hasLegacyData =
    databaseNames.some((name) => name && name !== STORAGE_DB_NAME);
  if (!hasLegacyData) {
    window.localStorage.setItem(LEGACY_DATA_DECISION_KEY, LEGACY_DATA_DECISION_VERSION);
    return;
  }
  window.localStorage.setItem(LEGACY_DATA_DECISION_KEY, LEGACY_DATA_DECISION_VERSION);
}

const THEME_STORAGE_KEYS = ["themeMode", "uiTheme", "theme", "appearanceTheme"];
const LEGACY_THEME_VALUE_MAP = {
  "": "graphite",
  default: "graphite",
  graphite: "graphite",
  dark: "dark",
  "theme-dark": "dark",
  "theme-graphite": "graphite",
  light: "light",
  "theme-light": "light",
  "warm-light": "warm-light",
  "theme-warm-light": "warm-light",
  "mist-blue": "chrome-blue",
  "sky-blue": "chrome-blue",
  sky: "chrome-blue",
  blue: "chrome-blue",
  "theme-mist-blue": "chrome-blue",
  "chrome-blue": "chrome-blue",
  "theme-chrome-blue": "chrome-blue",
  "chrome-rose": "chrome-rose",
  "theme-chrome-rose": "chrome-rose",
  "chrome-sand": "chrome-sand",
  "theme-chrome-sand": "chrome-sand",
  "chrome-teal": "sage-green",
  "theme-chrome-teal": "sage-green",
  "sage-green": "sage-green",
  "theme-sage-green": "sage-green"
};

function normalizeThemeValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return LEGACY_THEME_VALUE_MAP[normalized];
}

function applyThemeStorageDefaults(current, recovered) {
  clearLegacyThemeStorage();
  let hasThemeValue = false;
  for (const key of THEME_STORAGE_KEYS) {
    const normalized = normalizeThemeValue(current[key]);
    if (normalized) {
      recovered[key] = normalized;
      hasThemeValue = true;
    }
  }
  if (!hasThemeValue) {
    recovered.themeMode = "graphite";
    recovered.uiTheme = "graphite";
    recovered.theme = "graphite";
    recovered.appearanceTheme = "graphite";
  }
}

async function applyDesktopStorageRecovery() {
  try {
    const recoveryPath = path.join(__dirname, "desktop-storage-recovery.json");
    if (!fs.existsSync(recoveryPath)) return;
    const recovery = JSON.parse(fs.readFileSync(recoveryPath, "utf8"));
    if (!recovery || !recovery.id || !recovery.items) return;
    if (window.localStorage.getItem(RECOVERY_MARKER_KEY) === recovery.id) return;

    const recoveryKeys = Object.keys(recovery.items);
    const current = await getDesktopStorageItems([...recoveryKeys, ...THEME_STORAGE_KEYS]);
    const recovered = { ...current };
    const forceKeys = Array.isArray(recovery.forceKeys) ? new Set(recovery.forceKeys) : new Set();
    for (const [key, value] of Object.entries(recovery.items)) {
      if (forceKeys.has(key)) recovered[key] = value;
      else if (key === "apiConfigs" && !hasStoredValue(current[key])) {
        recovered[key] = mergeRecoveredApiConfigs(current[key], value);
      } else if (!hasStoredValue(current[key])) recovered[key] = value;
    }
    applyThemeStorageDefaults(current, recovered);
    await setDesktopStorageItems(recovered);
    window.localStorage.setItem(RECOVERY_MARKER_KEY, recovery.id);
  } catch (error) {
    console.warn("desktop storage recovery skipped", error);
  }
}

module.exports = {
  hasMeaningfulDesktopStorage,
  listIndexedDbNames,
  clearAllIndexedDbDatabases,
  clearAllUserRuntimeData,
  confirmLegacyUserDataChoice,
  THEME_STORAGE_KEYS,
  LEGACY_THEME_VALUE_MAP,
  normalizeThemeValue,
  applyThemeStorageDefaults,
  applyDesktopStorageRecovery,
};

var { clearLegacyThemeStorage, mergeRecoveredApiConfigs, hasStoredValue } = require("./boot-theme.cjs");
var { clearDesktopStorage } = require("./project-safety.cjs");
var { getDesktopStorageItems, setDesktopStorageItems, resetStorageDbPromise } = require("./storage.cjs");
