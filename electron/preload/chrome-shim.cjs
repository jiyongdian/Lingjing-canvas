// 职责：渲染进程的 chrome.* API 垫片(storage/tabs/downloads 等)、深冻结与全局暴露工具。

const {
  contextBridge,
  ipcRenderer,
  shell,
  path,
  PRELOAD_CONTEXT_ISOLATED
} = require("./runtime.cjs");

function pickStorage(keys, store) {
  if (keys == null) return { ...store };
  if (typeof keys === "string") return { [keys]: store[keys] };
  if (Array.isArray(keys)) {
    return keys.reduce((out, key) => {
      out[key] = store[key];
      return out;
    }, {});
  }
  if (typeof keys === "object") {
    return Object.keys(keys).reduce((out, key) => {
      out[key] = store[key] === undefined ? keys[key] : store[key];
      return out;
    }, {});
  }
  return {};
}

function createChromeShim() {
  const noopEvent = {
    addListener: () => {},
    removeListener: () => {},
    hasListener: () => false
  };

  return {
    runtime: {
      id: "desktop",
      lastError: null,
      getManifest: () => ({ version: "1.2.7.1" }),
      getURL: (p = "") => new URL(p, window.location.href).href,
      sendMessage: (_message, cb) => asyncCallback(cb, {}),
      onMessage: noopEvent
    },
    storage: {
      local: {
        get: (keys, cb) => callbackOrPromise(cb, getDesktopStorageItems(keys)),
        set: (items, cb) => {
          return callbackOrPromise(cb, setDesktopStorageItems(items || {}).then(() => undefined));
        },
        remove: (keys, cb) => {
          return callbackOrPromise(cb, removeDesktopStorageItems(keys).then(() => undefined));
        },
        clear: (cb) => {
          return callbackOrPromise(cb, clearDesktopStorage().then(() => undefined));
        }
      }
    },
    tabs: {
      query: (_queryInfo, cb) => callbackOrPromise(cb, [{ id: 1, active: true, title: "万卷灵境", url: window.location.href }]),
      getCurrent: (cb) => callbackOrPromise(cb, null),
      get: (_tabId, cb) => callbackOrPromise(cb, { id: 1, active: true, title: "万卷灵境", url: window.location.href }),
      create: (_createProperties, cb) => callbackOrPromise(cb, { id: 1 }),
      update: (_tabId, _updateProperties, cb) => callbackOrPromise(cb, { id: 1 }),
      onUpdated: noopEvent,
      onActivated: noopEvent
    },
    cookies: {
      getAll: (_details, cb) => callbackOrPromise(cb, []),
      set: (_details, cb) => callbackOrPromise(cb, {})
    },
    scripting: {
      executeScript: async () => []
    },
    downloads: {
      download: (options = {}, cb) => {
        const run = async () => {
          const store = await getDesktopStorageItems(["downloadDirectory"]);
          let url = options.url;
          let mime = options.mime || "";
          let filename = filenameFromDownloadOptions(options);
          const downloadId = `download-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const toast = createDownloadToast(filename);
          const progressChannel = `wanjuan:download-progress:${downloadId}`;
          const onProgress = (_event, progress) => toast.update(progress);
          ipcRenderer.on(progressChannel, onProgress);

          try {
            if (typeof url === "string" && url.startsWith("blob:")) {
              toast.update({ percent: null, receivedBytes: 0, totalBytes: 0 });
              const converted = await dataUrlFromBlobUrl(url);
              url = converted.dataUrl;
              mime = converted.mime;
              const ext = extensionFromMime(mime);
              if (ext && !path.extname(filename)) filename += ext;
            }

            const result = await ipcRenderer.invoke("wanjuan:save-download", {
              url,
              mime,
              filename,
              downloadId,
              directory: store.downloadDirectory || "",
              saveAs: !!options.saveAs
            });
            if (!result || !result.ok) {
              throw new Error(result?.error || "保存下载文件失败");
            }
            toast.success(result.path);
            return Date.now();
          } catch (error) {
            toast.error(String(error?.message || error));
            throw error;
          } finally {
            ipcRenderer.removeListener(progressChannel, onProgress);
          }
        };

        if (typeof cb === "function") {
          run().then((id) => asyncCallback(cb, id)).catch((error) => {
            console.warn("desktop download failed", error);
            asyncCallback(cb, undefined);
          });
          return undefined;
        }
        return run();
      },
      showDefaultFolder: async () => {
        const store = await getDesktopStorageItems(["downloadDirectory"]);
        const directory =
          store.downloadDirectory ||
          (await ipcRenderer.invoke("wanjuan:get-default-download-directory"))?.path;
        if (directory) await shell.openPath(directory);
      }
    },
    i18n: {
      getUILanguage: () => "zh-CN"
    }
  };
}

const chromeShim = createChromeShim();
let installedChromeShim = null;
function installChromeShim() {
  if (installedChromeShim) return installedChromeShim;

  const hardenedShim = deepFreezeApi({
    runtime: chromeShim.runtime,
    storage: chromeShim.storage,
    tabs: chromeShim.tabs,
    cookies: chromeShim.cookies,
    scripting: chromeShim.scripting,
    downloads: chromeShim.downloads,
    i18n: chromeShim.i18n
  });

  if (PRELOAD_CONTEXT_ISOLATED) {
    try {
      contextBridge.exposeInMainWorld("wanjuanChrome", hardenedShim);
      installedChromeShim = hardenedShim;
      return hardenedShim;
    } catch (error) {
      console.warn("desktop chrome bridge skipped", error);
      return hardenedShim;
    }
  }

  const existing = window.chrome && typeof window.chrome === "object" ? window.chrome : {};
  const merged = {
    ...existing,
    runtime: chromeShim.runtime,
    storage: chromeShim.storage,
    tabs: chromeShim.tabs,
    cookies: chromeShim.cookies,
    scripting: chromeShim.scripting,
    downloads: chromeShim.downloads,
    i18n: chromeShim.i18n
  };
  try {
    Object.defineProperty(window, "chrome", {
      value: merged,
      writable: true,
      configurable: true,
      enumerable: true
    });
  } catch {
    window.chrome = merged;
  }
  installedChromeShim = merged;
  return merged;
}

function deepFreezeApi(value, seen = new WeakSet()) {
  if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    try {
      deepFreezeApi(value[key], seen);
    } catch {}
  }
  try {
    Object.freeze(value);
  } catch {}
  return value;
}

function exposeGlobal(name, value) {
  const exposedValue = deepFreezeApi(value);
  try {
    contextBridge.exposeInMainWorld(name, exposedValue);
    return;
  } catch {
    // Falls back when contextIsolation is disabled or Electron already owns the key.
  }

  try {
    Object.defineProperty(window, name, {
      value: exposedValue,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } catch {
    window[name] = exposedValue;
  }
}

module.exports = {
  pickStorage,
  createChromeShim,
  installChromeShim,
  deepFreezeApi,
  exposeGlobal
};

var { getDesktopStorageItems, setDesktopStorageItems, removeDesktopStorageItems } = require("./storage.cjs");
var { clearDesktopStorage } = require("./project-safety.cjs");
var {
  asyncCallback,
  callbackOrPromise,
  createDownloadToast,
  dataUrlFromBlobUrl,
  extensionFromMime,
  filenameFromDownloadOptions
} = require("./media-utils.cjs");
