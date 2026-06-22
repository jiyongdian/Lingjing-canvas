// 渲染进程桥接 API：打开外部链接、原生输入弹窗、agent-browser 文档读取，以及 wanjuanDesktop / wanjuanProjectSafety 两个全局桥接对象的暴露（require 即触发）。
const { ipcRenderer, shell, path, execFileAsync } = require("./runtime.cjs");

// 以下两处 exposeGlobal 为顶层副作用：require 本模块时立即执行，且其暴露对象会在求值时即时引用下列跨模块函数
// （尤其 wanjuanProjectSafety 把函数作为对象值直接读取）。因此改用顶部 require 而非底部 late-require，
// 确保副作用执行时这些函数已就绪。
const { exposeGlobal } = require("./chrome-shim.cjs");
const {
  buildDesktopProxyFetchBridgePayload,
  invokeDesktopProxyFetchPayload,
} = require("./fetch-proxy.cjs");
const {
  arrayBufferFromBlobUrl,
  localPathFromFileUrl,
  localFileToDataUrl,
  uploadPayloadWithReadableBytes,
} = require("./media-utils.cjs");
const { getDesktopStorageItems, getPerformanceSettings, persistPerformanceProfile } = require("./storage.cjs");
const {
  beforeProjectCanvasSave,
  listProjectSafetySnapshots,
  getCurrentProjectSafetyInfo,
  getProjectSafetyConfig,
  setProjectSafetyConfig,
  restoreProjectSafetySnapshot,
  showProjectSafetyBlockedPrompt,
  removeProjectSafetyBlockedPrompt,
  maybeRunProjectSafetyAutoBackup,
} = require("./project-safety.cjs");

async function readDocumentWithAgentBrowser(url) {
  const session = `wanjuan_cfg_${Date.now()}`;
  const run = async (...args) => {
    const result = await execFileAsync(
      process.env.HOME
        ? path.join(process.env.HOME, ".npm-global/bin/agent-browser")
        : "agent-browser",
      ["--session", session, ...args],
      {
        timeout: 45000,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          AGENT_BROWSER_MAX_OUTPUT: "120000",
        },
      }
    );
    return String(result.stdout || "").trim();
  };
  try {
    await run("open", String(url || ""));
    await run("wait", "--load", "networkidle");
    const bodyText = await run("get", "text", "body");
    if (!bodyText) throw new Error("agent-browser 未读取到正文内容");
    return { ok: true, text: bodyText };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  } finally {
    try {
      await run("close");
    } catch {}
  }
}

function isSafeExternalUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ""));
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function showWanjuanInputDialog(options = {}) {
  return new Promise((resolve) => {
    const title = String(options.title || "请输入").trim() || "请输入";
    const message = String(options.message || "").trim();
    const defaultValue = String(options.defaultValue || "");
    const overlay = document.createElement("div");
    overlay.className = "wanjuan-native-input-overlay";
    overlay.innerHTML = `
      <div class="wanjuan-native-input-dialog" role="dialog" aria-modal="true">
        <div class="wanjuan-native-input-title"></div>
        <div class="wanjuan-native-input-message"></div>
        <input class="wanjuan-native-input-control" />
        <div class="wanjuan-native-input-actions">
          <button type="button" data-action="cancel">取消</button>
          <button type="button" data-action="ok">确定</button>
        </div>
      </div>
    `;
    const titleEl = overlay.querySelector(".wanjuan-native-input-title");
    const messageEl = overlay.querySelector(".wanjuan-native-input-message");
    const input = overlay.querySelector(".wanjuan-native-input-control");
    if (titleEl) titleEl.textContent = title;
    if (messageEl) {
      messageEl.textContent = message;
      messageEl.style.display = message ? "" : "none";
    }
    if (input) input.value = defaultValue;
    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(null);
      const action = event.target?.dataset?.action;
      if (action === "cancel") finish(null);
      if (action === "ok") finish(input ? input.value : "");
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(null);
      if (event.key === "Enter") finish(input ? input.value : "");
    });
    document.body.appendChild(overlay);
    window.setTimeout(() => {
      input?.focus();
      input?.select?.();
    }, 0);
  });
}

exposeGlobal("wanjuanDesktop", {
  checkForUpdates: async () => ipcRenderer.invoke("wanjuan:check-for-updates"),
  openExternal: async (url) => {
    try {
      if (!isSafeExternalUrl(url)) {
        return { ok: false, error: "Unsupported external URL scheme" };
      }
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  captureWindowFrame: async () => ipcRenderer.invoke("wanjuan:capture-window-frame"),
  chooseProjectAssetFile: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:choose-project-asset-file", payload),
  chooseProjectAssetFolder: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:choose-project-asset-folder", payload),
  chooseBackupFile: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:choose-backup-file", payload),
  readKnowledgeFile: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:read-knowledge-file", payload),
  chooseDownloadDirectory: async (payload = {}) => ipcRenderer.invoke("wanjuan:choose-download-directory", payload),
  getDefaultDownloadDirectory: async () => ipcRenderer.invoke("wanjuan:get-default-download-directory"),
  getPerformanceSettings: async () => getPerformanceSettings(),
  setPerformanceProfile: async (key, settings = null) => {
    persistPerformanceProfile(key, settings);
    const next = getPerformanceSettings();
    try {
      await ipcRenderer.invoke("wanjuan:set-performance-settings", next);
    } catch {}
    return { ok: true, settings: next };
  },
  workspaceTeamStatus: async () => ipcRenderer.invoke("wanjuan:workspace-team-status"),
  workspaceTeamStart: async (payload = {}) => ipcRenderer.invoke("wanjuan:workspace-team-start", payload),
  workspaceTeamStop: async () => ipcRenderer.invoke("wanjuan:workspace-team-stop"),
  workspaceTeamUpdateTemplates: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:workspace-team-update-templates", payload),
  workspaceTeamFetchMember: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:workspace-team-fetch-member", payload),
  showInputDialog: async (options = {}) => showWanjuanInputDialog(options),
	  saveDownload: async (payload = {}) => {
	    let nextPayload = { ...payload };
	    if (!nextPayload.directory) {
	      try {
	        const store = await getDesktopStorageItems(["downloadDirectory"]);
	        if (store?.downloadDirectory) nextPayload.directory = store.downloadDirectory;
	      } catch {}
	    }
	    if (typeof nextPayload.url === "string" && /^file:\/\//i.test(nextPayload.url)) {
	      try {
	        nextPayload = {
	          ...nextPayload,
	          localPath: localPathFromFileUrl(nextPayload.url) || nextPayload.localPath || "",
	          url: ""
	        };
	      } catch {}
	    }
	    if (typeof nextPayload.url === "string" && nextPayload.url.startsWith("blob:")) {
      const converted = await arrayBufferFromBlobUrl(nextPayload.url);
      nextPayload = {
        ...nextPayload,
        url: "",
        arrayBuffer: converted.arrayBuffer,
        mime: nextPayload.mime || converted.mime,
        size: nextPayload.size || converted.size
      };
    }
    return ipcRenderer.invoke("wanjuan:save-download", nextPayload);
  },
	  persistProjectAsset: async (payload = {}) => {
	    let nextPayload = { ...payload };
	    if (nextPayload.storageOptimizationEnabled === undefined) {
	      try {
	        const store = await getDesktopStorageItems(["storageOptimizationEnabled"]);
	        nextPayload.storageOptimizationEnabled = store?.storageOptimizationEnabled === true;
	      } catch {}
	    }
	    if (typeof nextPayload.url === "string" && /^file:\/\//i.test(nextPayload.url)) {
	      try {
	        nextPayload = {
	          ...nextPayload,
	          localPath: localPathFromFileUrl(nextPayload.url) || nextPayload.localPath || "",
	          url: ""
	        };
	      } catch {}
	    }
	    if (typeof nextPayload.url === "string" && nextPayload.url.startsWith("blob:")) {
      const converted = await arrayBufferFromBlobUrl(nextPayload.url);
      nextPayload = {
        ...nextPayload,
        url: "",
        arrayBuffer: converted.arrayBuffer,
        mime: nextPayload.mime || converted.mime,
        size: nextPayload.size || converted.size
      };
    }
    return ipcRenderer.invoke("wanjuan:persist-project-asset", nextPayload);
  },
  checkProjectAssets: async (paths = []) =>
    ipcRenderer.invoke("wanjuan:check-project-assets", { paths }),
  diagnoseProjectAssets: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:diagnose-project-assets", payload),
  beginProjectMigration: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:begin-project-migration", payload),
  getProjectMigration: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:get-project-migration", payload),
  listIncompleteMigrations: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:list-incomplete-migrations", payload),
  saveProjectMigrationSnapshot: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:save-project-migration-snapshot", payload),
  loadProjectMigrationSnapshot: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:load-project-migration-snapshot", payload),
  cancelProjectMigration: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:cancel-project-migration", payload),
  commitProjectMigration: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:commit-project-migration", payload),
  rollbackProjectMigration: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:rollback-project-migration", payload),
  cleanupUnreferencedBlobs: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:cleanup-unreferenced-blobs", payload),
  syncProjectReferences: async (payload = {}) => {
    try {
      const store = await getDesktopStorageItems(["storageOptimizationEnabled"]);
      if (store?.storageOptimizationEnabled !== true) return { ok: true, skipped: true, reason: "STORAGE_OPTIMIZATION_DISABLED" };
    } catch {}
    return ipcRenderer.invoke("wanjuan:sync-project-references", payload);
  },
  isProjectMigrationLocked: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:is-project-migration-locked", typeof payload === "string" ? { projectId: payload } : payload),
  getStorageOptimizationStatus: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:storage-optimization-status", payload),
  rebuildStorageReferenceIndex: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:rebuild-storage-reference-index", payload),
  scanStorageReclaimable: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:scan-storage-reclaimable", payload),
  moveUnreferencedMediaToTrash: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:move-unreferenced-media-to-trash", payload),
  listStorageTrash: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:list-storage-trash", payload),
  restoreStorageTrash: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:restore-storage-trash", payload),
  purgeStorageTrash: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:purge-storage-trash", payload),
  findProjectAssetsInFolder: async (payload = {}) =>
    ipcRenderer.invoke("wanjuan:find-project-assets-in-folder", payload),
	  removeProjectAssets: async (payload = {}) =>
	    ipcRenderer.invoke("wanjuan:remove-project-assets", payload),
	  readLocalFileAsDataUrl: async (payload = {}) => {
	    try {
	      return localFileToDataUrl(payload?.url || payload?.localPath || payload?.path || "");
	    } catch (error) {
	      return { ok: false, error: String(error?.message || error) };
	    }
	  },
	  proxyFetch: async (payload = {}) => {
    const nextPayload = buildDesktopProxyFetchBridgePayload(payload);
    return invokeDesktopProxyFetchPayload(nextPayload, null);
  },
  abortProxyFetch: async (requestId) => {
    ipcRenderer.send("wanjuan:abort-fetch", String(requestId || ""));
    return { ok: true };
  },
			  uploadPublicMedia: async (payload = {}) => {
			    const nextPayload = await uploadPayloadWithReadableBytes(payload);
		    return ipcRenderer.invoke("wanjuan:upload-public-media", nextPayload);
		  },
			  uploadTosMedia: async (payload = {}) => {
			    const nextPayload = await uploadPayloadWithReadableBytes(payload);
			    return ipcRenderer.invoke("wanjuan:upload-tos-media", nextPayload);
			  },
			  uploadQiniuMedia: async (payload = {}) => {
			    const nextPayload = await uploadPayloadWithReadableBytes(payload);
			    return ipcRenderer.invoke("wanjuan:upload-qiniu-media", nextPayload);
			  },
			  uploadCustomPublicMedia: async (payload = {}) => {
			    const nextPayload = await uploadPayloadWithReadableBytes(payload);
			    return ipcRenderer.invoke("wanjuan:upload-custom-public-media", nextPayload);
			  },
			  blurVideoFaces: async (payload = {}) => {
			    const nextPayload = await uploadPayloadWithReadableBytes(payload);
			    return ipcRenderer.invoke("wanjuan:blur-video-faces", nextPayload);
			  },
			  trimVideoSegment: async (payload = {}) => {
			    const nextPayload = await uploadPayloadWithReadableBytes(payload);
			    return ipcRenderer.invoke("wanjuan:trim-video-segment", nextPayload);
			  },
			  cloneVoiceWithQwenTts: async (payload = {}) => {
			    const nextPayload = await uploadPayloadWithReadableBytes(payload);
			    return ipcRenderer.invoke("wanjuan:qwen-tts-clone-voice", nextPayload);
			  },
			  upscaleVideoWithRealEsrgan: async (payload = {}) => {
			    const nextPayload = await uploadPayloadWithReadableBytes(payload);
			    return ipcRenderer.invoke("wanjuan:real-esrgan-upscale-video", nextPayload);
			  },
			  onRealEsrganProgress: (jobId, callback) => {
			    const channel = `wanjuan:real-esrgan-progress:${String(jobId || "")}`;
			    const listener = (_event, progress) => callback?.(progress || {});
			    ipcRenderer.on(channel, listener);
			    return () => ipcRenderer.removeListener(channel, listener);
			  },
			  setRealEsrganPaused: async (payload = {}) =>
			    ipcRenderer.invoke("wanjuan:real-esrgan-set-paused", payload),
			  getRealEsrganJobStatus: async (payload = {}) =>
			    ipcRenderer.invoke("wanjuan:real-esrgan-job-status", payload),
			  getExtensionToolStatus: async (payload = {}) =>
			    ipcRenderer.invoke("wanjuan:get-extension-tool-status", payload),
				  installExtensionTool: async (payload = {}) =>
				    ipcRenderer.invoke("wanjuan:install-extension-tool", payload),
				  importExtensionToolPack: async (payload = {}) =>
				    ipcRenderer.invoke("wanjuan:import-extension-tool-pack", payload),
  readDocumentWithBrowser: async (url) => readDocumentWithAgentBrowser(url)
			});

exposeGlobal("wanjuanProjectSafety", {
  beforeCanvasSave: beforeProjectCanvasSave,
  listSnapshots: listProjectSafetySnapshots,
  getCurrentInfo: getCurrentProjectSafetyInfo,
  getConfig: getProjectSafetyConfig,
  setConfig: setProjectSafetyConfig,
  restoreSnapshot: restoreProjectSafetySnapshot,
  showBlockedSavePrompt: showProjectSafetyBlockedPrompt,
  closeBlockedSavePrompt: removeProjectSafetyBlockedPrompt,
  runAutoBackup: maybeRunProjectSafetyAutoBackup
});
module.exports = {
  readDocumentWithAgentBrowser,
  isSafeExternalUrl,
  showWanjuanInputDialog,
};
