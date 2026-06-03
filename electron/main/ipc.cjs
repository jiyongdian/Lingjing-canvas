// 职责：桌面端 IPC 注册。渲染进程经 contextBridge 调用的所有主进程能力入口，
// 含来源信任校验(rejectUntrustedIpc)与全部 wanjuan:* 通道。
const path = require("node:path");
const fs = require("node:fs");
const { ipcMain, dialog, BrowserWindow } = require("./electron-refs.cjs");
const { getDesktopBaseUrl } = require("./runtime-state.cjs");
const { appendDesktopLog, formatErrorMessage } = require("./logging.cjs");
const { sanitizeFilename } = require("./utils/paths.cjs");
const { ensureExtname, extensionFromMime } = require("./utils/mime.cjs");
const {
  defaultDownloadDirectory,
  resolveWritableDownloadDirectory,
  mediaLibraryRoot,
} = require("./utils/paths.cjs");
const { assertPublicHttpUrl } = require("./net/security.cjs");
const {
  setDesktopPerformanceSettings,
  classifyDesktopProxyFetch,
  enqueueDesktopProxyFetch,
  createDesktopAbortError,
  sanitizeProxyFetchHeaders,
  proxyHttpRequest,
  desktopProxyFetchControllers,
} = require("./net/proxy-fetch.cjs");
const { extractKnowledgeFileText } = require("./knowledge.cjs");
const { normalizeImagePayload, bufferFromDownloadPayload, bufferFromMediaPayload } = require("./media/payload.cjs");
const {
  persistProjectAsset,
  checkProjectAssets,
  findProjectAssetsInFolder,
  removeProjectAssets,
  walkAssetFolder,
  loadProjectAssetManifests,
  validateExternalProjectAssetFiles,
  copyExternalProjectAssetFiles,
  injectExternalAssetBundleSummary,
} = require("./assets/project-assets.cjs");
const {
  getQwenTtsToolStatus,
  installQwenTtsTool,
  getRealEsrganToolStatus,
  installRealEsrganTool,
  getDefaceToolStatus,
  installDefaceTool,
  cloneVoiceWithQwenTts,
  upscaleVideoWithRealEsrgan,
  setRealEsrganJobPaused,
  getRealEsrganJobStatus,
  blurVideoFaces,
  trimVideoSegment,
} = require("./tools/external-tools.cjs");
const { uploadToAnonymousHosts, validatePublicMediaUrl } = require("./uploaders/anonymous-hosts.cjs");
const { uploadToTos, uploadToQiniuS3 } = require("./uploaders/cloud-storage.cjs");
const { uploadToCustomPublicHost } = require("./uploaders/custom-host.cjs");

function getIpcSenderUrl(event) {
  return String(event?.senderFrame?.url || event?.sender?.getURL?.() || "");
}

function isTrustedIpcEvent(event) {
  const desktopBaseUrl = getDesktopBaseUrl();
  if (!desktopBaseUrl) return true;
  const senderUrl = getIpcSenderUrl(event);
  return senderUrl === desktopBaseUrl || senderUrl.startsWith(`${desktopBaseUrl}/`);
}

function rejectUntrustedIpc(event, channel) {
  if (isTrustedIpcEvent(event)) return null;
  const senderUrl = getIpcSenderUrl(event);
  appendDesktopLog("untrusted-ipc-blocked", { channel, senderUrl });
  return { ok: false, error: "Blocked untrusted desktop IPC caller" };
}

function registerDesktopIpc() {
  if (!ipcMain || !dialog) return;

  ipcMain.handle("wanjuan:get-default-download-directory", async (event) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:get-default-download-directory");
    if (blocked) return blocked;
    return {
      ok: true,
      path: defaultDownloadDirectory()
    };
  });

  ipcMain.handle("wanjuan:set-performance-settings", async (event, payload = {}) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:set-performance-settings");
    if (blocked) return blocked;
    const nextSettings = setDesktopPerformanceSettings({
      key: String(payload?.key || "balanced"),
      aiGenerateLimit: Math.max(1, Math.min(10, Math.round(Number(payload?.aiGenerateLimit) || 3)))
    });
    appendDesktopLog("performance-settings-updated", nextSettings);
    return { ok: true, settings: nextSettings };
  });

  ipcMain.handle("wanjuan:capture-window-frame", async (event) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:capture-window-frame");
    if (blocked) return blocked;
    try {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (!senderWindow || senderWindow.isDestroyed()) {
        return { ok: false, error: "Window unavailable" };
      }
      const image = await senderWindow.webContents.capturePage();
      return {
        ok: true,
        dataUrl: image.toDataURL(),
        size: image.getSize()
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle("wanjuan:choose-download-directory", async (event, payload = {}) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:choose-download-directory");
    if (blocked) return blocked;
    const result = await dialog.showOpenDialog({
      title: String(payload?.title || "选择文件下载保存位置"),
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle("wanjuan:choose-project-asset-file", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:choose-project-asset-file");
    if (blocked) return blocked;
    const result = await dialog.showOpenDialog({
      title: String(payload?.title || "选择要重新链接的素材文件"),
      properties: ["openFile"],
      filters: Array.isArray(payload?.filters) && payload.filters.length
        ? payload.filters
        : [{ name: "所有文件", extensions: ["*"] }]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle("wanjuan:choose-project-asset-folder", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:choose-project-asset-folder");
    if (blocked) return blocked;
    const result = await dialog.showOpenDialog({
      title: String(payload?.title || "选择要搜索的素材文件夹"),
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle("wanjuan:choose-backup-file", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:choose-backup-file");
    if (blocked) return blocked;
    const result = await dialog.showOpenDialog({
      title: String(payload?.title || "选择万卷备份 JSON"),
      properties: ["openFile"],
      filters: [
        { name: "万卷备份 JSON", extensions: ["json"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, canceled: true };
    }
    const filePath = result.filePaths[0];
    try {
      const content = fs.readFileSync(filePath, "utf8");
      let externalAssetBundle = null;
      try {
        const parsed = JSON.parse(content);
        const requestedFolderName = parsed?.modules?.projects?.externalAssetBundle?.folderName || "";
        const candidateFolders = [
          requestedFolderName ? path.join(path.dirname(filePath), sanitizeFilename(requestedFolderName)) : "",
          path.join(path.dirname(filePath), `${path.parse(filePath).name}-external-assets`)
        ].filter(Boolean);
        for (const folderPath of candidateFolders) {
          if (!fs.existsSync(folderPath)) continue;
          const files = walkAssetFolder(folderPath);
          const manifests = loadProjectAssetManifests(files);
          const manifest = manifests[0];
          if (!manifest) continue;
          externalAssetBundle = {
            folderPath,
            folderName: path.basename(folderPath),
            files: manifest.files.map((entry) => {
              const filePath = entry?.filename ? path.join(folderPath, entry.filename) : "";
              return {
                ...entry,
                filePath: filePath && fs.existsSync(filePath) ? filePath : ""
              };
            })
          };
          break;
        }
      } catch {
        externalAssetBundle = null;
      }
      return {
        ok: true,
        path: filePath,
        name: path.basename(filePath),
        content,
        externalAssetBundle
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle("wanjuan:read-knowledge-file", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:read-knowledge-file");
    if (blocked) return blocked;
    try {
      const filters = Array.isArray(payload?.filters) && payload.filters.length
        ? payload.filters
        : [
            { name: "知识文件", extensions: ["txt", "md", "markdown", "json", "csv", "js", "ts", "html", "htm", "rtf", "doc", "docx", "odt", "pdf"] },
            { name: "所有文件", extensions: ["*"] }
          ];
      const result = await dialog.showOpenDialog({
        title: String(payload?.title || "选择知识库文件"),
        properties: ["openFile"],
        filters
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return { ok: false, canceled: true };
      }
      const filePath = result.filePaths[0];
      const stat = fs.statSync(filePath);
      const requestedMaxBytes = Number(payload?.maxBytes) > 0 ? Number(payload.maxBytes) : 0;
      const defaultMaxBytes = 1024 * 1024 * 50;
      const maxBytes = requestedMaxBytes || defaultMaxBytes;
      if (stat.size > maxBytes) {
        return {
          ok: false,
          error: `文件过大，当前仅支持导入 ${Math.floor(maxBytes / 1024 / 1024)}MB 以内的知识文件`
        };
      }
      const content = extractKnowledgeFileText(filePath);
      if (!content) {
        return {
          ok: false,
          error: "未能从该文件中提取到可用文本内容"
        };
      }
      return {
        ok: true,
        path: filePath,
        name: path.basename(filePath),
        size: stat.size,
        content
      };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error)
      };
    }
  });

  ipcMain.handle("wanjuan:save-download", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:save-download");
    if (blocked) return blocked;
    try {
      const { buffer, mime } = await bufferFromDownloadPayload({
        ...(payload || {}),
        sender: event.sender
      });
      let filename = sanitizeFilename(payload?.filename || `wanjuan-${Date.now()}`);
      const ext = extensionFromMime(mime);
      if (ext && !path.extname(filename)) filename += ext;

      let target = "";
      if (payload?.saveAsFolder) {
        const { directory: baseDirectory } = resolveWritableDownloadDirectory(payload?.directory);
        const bundleName = sanitizeFilename(payload?.folderName || filename.replace(/\.[^.]+$/i, "") || `wanjuan-backup-${Date.now()}`);
        const result = await dialog.showSaveDialog({
          title: "导出数据文件夹",
          defaultPath: path.join(baseDirectory, bundleName),
          properties: ["createDirectory"]
        });
        if (result.canceled || !result.filePath) return { ok: false, canceled: true };
        const folderPath = result.filePath;
        fs.mkdirSync(folderPath, { recursive: true });
        target = path.join(folderPath, filename);
      } else if (payload?.saveAs) {
        const { directory: baseDirectory } = resolveWritableDownloadDirectory(payload?.directory);
        const result = await dialog.showSaveDialog({
          title: "导出数据",
          defaultPath: path.join(baseDirectory, filename),
          filters: [
            { name: "JSON 文件", extensions: ["json"] },
            { name: "所有文件", extensions: ["*"] }
          ]
        });
        if (result.canceled || !result.filePath) return { ok: false, canceled: true };
        target = result.filePath;
      } else {
        const { directory } = resolveWritableDownloadDirectory(payload?.directory);
        target = path.join(directory, filename);
        const parsed = path.parse(target);
        let index = 1;
        while (fs.existsSync(target)) {
          target = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
          index += 1;
        }
      }

      fs.mkdirSync(path.dirname(target), { recursive: true });
      const externalAssetFiles = Array.isArray(payload?.externalAssetFiles)
        ? payload.externalAssetFiles.filter(Boolean)
        : [];
      const validation = validateExternalProjectAssetFiles(externalAssetFiles);
      if (!validation.ok) {
        return {
          ok: false,
          error: `导出已中止：${validation.missingAssets.length} 个素材源文件缺失`,
          missingAssets: validation.missingAssets,
          externalAssetValidation: validation
        };
      }
      const assetBundle = copyExternalProjectAssetFiles(
        target,
        externalAssetFiles,
        payload?.externalAssetFolderName
      );
      if (assetBundle?.failed) {
        try {
          assetBundle.folderPath && fs.rmSync(assetBundle.folderPath, { recursive: true, force: true });
        } catch {}
        return {
          ok: false,
          error: `导出已中止：${assetBundle.failed} 个素材未能打包`,
          missingAssets: (assetBundle.manifest?.files || []).filter((entry) => entry.error),
          externalAssetBundle: assetBundle
        };
      }
      const finalText = injectExternalAssetBundleSummary(payload?.text, assetBundle);
      fs.writeFileSync(target, finalText !== null ? Buffer.from(finalText, "utf8") : buffer);
      return { ok: true, path: target, externalAssetBundle: assetBundle };
    } catch (error) {
      console.error("save-download failed", error);
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle("wanjuan:upload-public-media", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:upload-public-media");
    if (blocked) return blocked;
    try {
      const { buffer, mime, filename: rawFilename } = await bufferFromMediaPayload(payload || {});
      let filename = sanitizeFilename(payload?.filename || rawFilename || `seedance-reference-${Date.now()}${extensionFromMime(mime) || ".mp4"}`);
      const ext = extensionFromMime(mime);
      if (ext && !path.extname(filename)) filename += ext;
      const url = await uploadToAnonymousHosts(buffer, mime, filename);
      return { ok: true, url };
    } catch (error) {
      console.error("upload-public-media failed", error);
      return { ok: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle("wanjuan:upload-tos-media", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:upload-tos-media");
    if (blocked) return blocked;
    try {
      return await uploadToTos(payload || {});
    } catch (error) {
      console.error("upload-tos-media failed", error);
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle("wanjuan:upload-qiniu-media", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:upload-qiniu-media");
    if (blocked) return blocked;
    try {
      return await uploadToQiniuS3(payload || {});
    } catch (error) {
      console.error("upload-qiniu-media failed", error);
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.handle("wanjuan:upload-custom-public-media", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:upload-custom-public-media");
    if (blocked) return blocked;
    try {
      return await uploadToCustomPublicHost(payload || {});
    } catch (error) {
      console.error("upload-custom-public-media failed", error);
      appendDesktopLog("upload-custom-public-media-failed", {
        error: formatErrorMessage(error),
        kind: payload?.kind || "",
        endpoint: payload?.customUpload?.endpoint || ""
      });
      try {
        const { buffer, mime, filename: rawFilename } = await bufferFromMediaPayload(payload || {});
        let filename = sanitizeFilename(payload?.filename || rawFilename || `seedance-reference-${Date.now()}${extensionFromMime(mime) || ".mp4"}`);
        const ext = extensionFromMime(mime);
        if (ext && !path.extname(filename)) filename += ext;
        const endpoint = String(payload?.customUpload?.endpoint || "").toLowerCase();
        const skipHosts = [];
        endpoint.includes("litterbox.catbox.moe") && skipHosts.push("litterbox");
        endpoint.includes("catbox.moe") && skipHosts.push("catbox");
        endpoint.includes("tmpfiles.org") && skipHosts.push("tmpfiles");
        endpoint.includes("0x0.st") && skipHosts.push("0x0");
        endpoint.includes("transfer.sh") && skipHosts.push("transfer.sh");
        endpoint.includes("uguu.se") && skipHosts.push("uguu");
        endpoint.includes("filebin.net") && skipHosts.push("filebin");
        const url = await uploadToAnonymousHosts(buffer, mime, filename, skipHosts);
        appendDesktopLog("upload-custom-public-media-fallback-succeeded", {
          kind: payload?.kind || "",
          endpoint: payload?.customUpload?.endpoint || "",
          url
        });
        return { ok: true, url, fallback: "public" };
      } catch (fallbackError) {
        console.error("upload-custom-public-media fallback failed", fallbackError);
        appendDesktopLog("upload-custom-public-media-fallback-failed", {
          error: formatErrorMessage(fallbackError),
          kind: payload?.kind || "",
          endpoint: payload?.customUpload?.endpoint || ""
        });
        return { ok: false, error: formatErrorMessage(error) };
      }
    }
  });

  ipcMain.handle("wanjuan:blur-video-faces", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:blur-video-faces");
    if (blocked) return blocked;
    try {
      return await blurVideoFaces(payload || {});
    } catch (error) {
      console.error("blur-video-faces failed", error);
      return { ok: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle("wanjuan:trim-video-segment", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:trim-video-segment");
    if (blocked) return blocked;
    try {
      return await trimVideoSegment(payload || {});
    } catch (error) {
      console.error("trim-video-segment failed", error);
      return { ok: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle("wanjuan:qwen-tts-clone-voice", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:qwen-tts-clone-voice");
    if (blocked) return blocked;
    try {
      return await cloneVoiceWithQwenTts(payload || {});
    } catch (error) {
      console.error("qwen-tts-clone-voice failed", error);
      return { ok: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle("wanjuan:real-esrgan-upscale-video", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:real-esrgan-upscale-video");
    if (blocked) return blocked;
    try {
      return await upscaleVideoWithRealEsrgan(payload || {}, { sender: event.sender });
    } catch (error) {
      console.error("real-esrgan-upscale-video failed", error);
      return { ok: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle("wanjuan:real-esrgan-set-paused", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:real-esrgan-set-paused");
    if (blocked) return blocked;
    return setRealEsrganJobPaused(payload?.jobId, payload?.paused);
  });

  ipcMain.handle("wanjuan:real-esrgan-job-status", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:real-esrgan-job-status");
    if (blocked) return blocked;
    return getRealEsrganJobStatus(payload || {});
  });

  ipcMain.handle("wanjuan:get-extension-tool-status", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:get-extension-tool-status");
    if (blocked) return blocked;
    try {
      const tool = String(payload?.tool || "");
      if (tool === "deface") return getDefaceToolStatus();
      if (tool === "qwen-tts") return getQwenTtsToolStatus();
      if (tool === "real-esrgan") return getRealEsrganToolStatus();
      return { ok: false, error: "暂不支持该拓展工具" };
    } catch (error) {
      console.error("get-extension-tool-status failed", error);
      return { ok: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle("wanjuan:install-extension-tool", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:install-extension-tool");
    if (blocked) return blocked;
    try {
      const tool = String(payload?.tool || "");
      if (tool === "deface") return await installDefaceTool();
      if (tool === "qwen-tts") return await installQwenTtsTool();
      if (tool === "real-esrgan") return await installRealEsrganTool();
      return { ok: false, error: "暂不支持该拓展工具" };
    } catch (error) {
      console.error("install-extension-tool failed", error);
      return { ok: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle("wanjuan:persist-project-asset", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:persist-project-asset");
    if (blocked) return blocked;
    try {
      return await persistProjectAsset(payload || {});
    } catch (error) {
      console.error("persist-project-asset failed", error);
      return { ok: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle("wanjuan:check-project-assets", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:check-project-assets");
    if (blocked) return blocked;
    try {
      return await checkProjectAssets(payload || {});
    } catch (error) {
      console.error("check-project-assets failed", error);
      return { ok: false, error: formatErrorMessage(error), assets: [] };
    }
  });

  ipcMain.handle("wanjuan:find-project-assets-in-folder", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:find-project-assets-in-folder");
    if (blocked) return blocked;
    try {
      return await findProjectAssetsInFolder(payload || {});
    } catch (error) {
      console.error("find-project-assets-in-folder failed", error);
      return { ok: false, error: formatErrorMessage(error), matches: [] };
    }
  });

  ipcMain.handle("wanjuan:remove-project-assets", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:remove-project-assets");
    if (blocked) return blocked;
    try {
      return await removeProjectAssets(payload || {});
    } catch (error) {
      console.error("remove-project-assets failed", error);
      return { ok: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle("wanjuan:proxy-fetch", async (event, payload) => {
    const blocked = rejectUntrustedIpc(event, "wanjuan:proxy-fetch");
    if (blocked) return blocked;
    const requestId = String(payload?.requestId || "").trim();
    const url = String(payload?.url || "").trim();
    if (!requestId) {
      return { ok: false, error: "Invalid proxy fetch payload" };
    }
    try {
      assertPublicHttpUrl(url, "Proxy URL");
    } catch (error) {
      return { ok: false, error: error?.message || "Invalid proxy fetch payload" };
    }

    const controller = new AbortController();
    desktopProxyFetchControllers.set(requestId, { controller, cancel: null });
    try {
      const method = String(payload?.method || "GET").toUpperCase();
      const headers = sanitizeProxyFetchHeaders(payload?.headers);
      const body = payload?.bodyBase64 ? Buffer.from(String(payload.bodyBase64), "base64") : undefined;
      const runProxyRequest = () => proxyHttpRequest(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        requestTimeout: Number(payload?.requestTimeout || 180000)
      });
      const rule = classifyDesktopProxyFetch(payload);
      const response = rule
        ? await enqueueDesktopProxyFetch(rule, requestId, controller.signal, runProxyRequest)
        : await runProxyRequest();
      return {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        headers: Array.isArray(response.headers) ? response.headers : [],
        bodyBase64: String(response.bodyBase64 || "")
      };
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        return { ok: false, aborted: true, error: "The operation was aborted." };
      }
      appendDesktopLog("proxy-fetch-failed", {
        requestId,
        url,
        method: payload?.method,
        error: formatErrorMessage(error)
      });
      return { ok: false, error: formatErrorMessage(error) };
    } finally {
      desktopProxyFetchControllers.delete(requestId);
    }
  });

  ipcMain.on("wanjuan:abort-fetch", (event, requestId) => {
    if (rejectUntrustedIpc(event, "wanjuan:abort-fetch")) return;
    const normalizedId = String(requestId || "").trim();
    if (!normalizedId) return;
    const entry = desktopProxyFetchControllers.get(normalizedId);
    if (!entry) return;
    entry.controller.abort();
    if (typeof entry.cancel === "function") entry.cancel();
  });
}


module.exports = { registerDesktopIpc };
