// 职责：preload 渲染进程的媒体/下载工具集 —— 项目名保存、回调转换、文件名与 MIME 推断、blob/本地文件转 dataUrl、上传载荷预处理、字节格式化与下载进度浮层 UI。
var { fs, path } = require("./runtime.cjs");
const { fileURLToPath } = require("url");

async function saveProjectName(projectId, name) {
  const store = await getDesktopStorageItems(["projects"]);
  const projects = Array.isArray(store.projects) && store.projects.length > 0
    ? store.projects
    : [{ id: "default", name: "默认项目" }];
  const exists = projects.some((project) => project.id === projectId);
  store.projects = exists
    ? projects.map((project) => (project.id === projectId ? { ...project, name } : project))
    : [...projects, { id: projectId, name }];
  await setDesktopStorageItems({ projects: store.projects });
  return store.projects;
}

function asyncCallback(cb, value) {
  if (typeof cb === "function") queueMicrotask(() => cb(value));
}

function callbackOrPromise(cb, value) {
  const promise = value && typeof value.then === "function" ? value : Promise.resolve(value);
  if (typeof cb === "function") {
    promise.then((resolved) => asyncCallback(cb, resolved)).catch((error) => {
      console.warn("desktop async callback failed", error);
      asyncCallback(cb, undefined);
    });
    return undefined;
  }
  return promise;
}

function filenameFromDownloadOptions(options) {
  const raw = options && options.filename ? String(options.filename) : `download-${Date.now()}`;
  const parts = raw.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || `download-${Date.now()}`;
}

function extensionFromMime(mime) {
  return {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "text/plain": ".txt",
    "application/json": ".json"
  }[String(mime || "").split(";")[0].trim().toLowerCase()] || "";
}

function mimeFromFilename(filename) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  return {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg"
  }[ext] || "application/octet-stream";
}

function localPathFromFileUrl(value) {
  if (typeof value !== "string" || !/^file:\/\//i.test(value)) return "";
  try {
    const parsed = new URL(value);
    const hostname = decodeURIComponent(parsed.hostname || "");
    const pathname = decodeURIComponent(parsed.pathname || "");
    if (hostname && hostname !== "localhost") return `\\\\${hostname}${pathname.replace(/\//g, "\\")}`;
    if (/^\/[A-Za-z]:[\\/]/.test(pathname)) return pathname.slice(1).replace(/\//g, "\\");
    return fileURLToPath(value);
  } catch {
    return "";
  }
}

function localFileToDataUrl(filePath) {
  const rawPath = String(filePath || "");
  const resolvedPath = localPathFromFileUrl(rawPath) || rawPath;
  const buffer = fs.readFileSync(resolvedPath);
  const mime = mimeFromFilename(resolvedPath);
  return {
    ok: true,
    dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
    mime,
    filename: path.basename(resolvedPath),
    size: buffer.length
  };
}

async function dataUrlFromBlobUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, mime: blob.type || "" };
}

async function arrayBufferFromBlobUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return {
    arrayBuffer: await blob.arrayBuffer(),
    mime: blob.type || "",
    size: blob.size || 0
  };
}

async function uploadPayloadWithReadableBytes(payload = {}) {
  let nextPayload = { ...payload };
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
  if (/^file:\/\//i.test(String(nextPayload.url || ""))) {
    try {
      nextPayload = {
        ...nextPayload,
        localPath: localPathFromFileUrl(nextPayload.url) || nextPayload.localPath || "",
        url: ""
      };
    } catch {}
  }
  return nextPayload;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function ensureDownloadToastStyles() {
  if (document.getElementById("wanjuan-download-toast-style")) return;
  const style = document.createElement("style");
  style.id = "wanjuan-download-toast-style";
  style.textContent = `
    #wanjuan-download-toast-root {
      position: fixed;
      right: 20px;
      top: 84px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }
    .wanjuan-download-toast {
      width: 280px;
      padding: 12px 14px;
      border-radius: 14px;
      background:
        radial-gradient(circle at top right, rgba(255, 138, 91, 0.18), transparent 32%),
        linear-gradient(135deg, rgba(16, 22, 48, 0.96), rgba(14, 20, 41, 0.96));
      color: #f8fafc;
      border: 1px solid rgba(124, 140, 255, 0.2);
      box-shadow:
        0 18px 44px rgba(3, 7, 20, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      backdrop-filter: blur(14px);
      transform: translateY(-8px);
      opacity: 0;
      transition: opacity 180ms ease, transform 180ms ease;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
    }
    .wanjuan-download-toast.is-visible {
      transform: translateY(0);
      opacity: 1;
    }
    .wanjuan-download-toast-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .wanjuan-download-toast-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: rgba(248, 250, 252, 0.92);
    }
    .wanjuan-download-toast-percent {
      flex: 0 0 auto;
      color: #8d99ff;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .wanjuan-download-toast-track {
      height: 7px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(98, 112, 176, 0.3);
    }
    .wanjuan-download-toast-bar {
      height: 100%;
      width: 0%;
      border-radius: inherit;
      background: linear-gradient(90deg, #7c8cff, #ff8a5b);
      transition: width 160ms ease;
    }
    .wanjuan-download-toast-bar.is-indeterminate {
      width: 42%;
      animation: wanjuanDownloadSlide 1s ease-in-out infinite;
    }
    .wanjuan-download-toast-meta {
      margin-top: 7px;
      font-size: 11px;
      color: rgba(198, 208, 244, 0.82);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wanjuan-download-toast.is-error .wanjuan-download-toast-percent {
      color: #ff9a78;
    }
    .wanjuan-download-toast.is-error .wanjuan-download-toast-bar {
      width: 100% !important;
      background: linear-gradient(90deg, #ff6b6b, #ff8a5b);
      animation: none;
    }
    @keyframes wanjuanDownloadSlide {
      0% { transform: translateX(-115%); }
      50% { transform: translateX(65%); }
      100% { transform: translateX(245%); }
    }
  `;
  document.head.appendChild(style);
}

function createDownloadToast(filename) {
  ensureDownloadToastStyles();
  let root = document.getElementById("wanjuan-download-toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "wanjuan-download-toast-root";
    document.body.appendChild(root);
  }

  const toast = document.createElement("div");
  toast.className = "wanjuan-download-toast";
  toast.innerHTML = `
    <div class="wanjuan-download-toast-title">
      <span class="wanjuan-download-toast-name"></span>
      <span class="wanjuan-download-toast-percent">准备中</span>
    </div>
    <div class="wanjuan-download-toast-track">
      <div class="wanjuan-download-toast-bar is-indeterminate"></div>
    </div>
    <div class="wanjuan-download-toast-meta">正在准备下载...</div>
  `;
  toast.querySelector(".wanjuan-download-toast-name").textContent = filename || "下载文件";
  root.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  const percentEl = toast.querySelector(".wanjuan-download-toast-percent");
  const barEl = toast.querySelector(".wanjuan-download-toast-bar");
  const metaEl = toast.querySelector(".wanjuan-download-toast-meta");

  const close = (delay = 800) => {
    window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => toast.remove(), 220);
    }, delay);
  };

  return {
    update(progress = {}) {
      const percent = typeof progress.percent === "number" ? Math.max(0, Math.min(100, progress.percent)) : null;
      if (percent == null) {
        percentEl.textContent = "下载中";
        barEl.classList.add("is-indeterminate");
        metaEl.textContent = progress.receivedBytes
          ? `已下载 ${formatBytes(progress.receivedBytes)}`
          : "正在下载...";
        return;
      }
      barEl.classList.remove("is-indeterminate");
      barEl.style.width = `${percent}%`;
      percentEl.textContent = `${percent}%`;
      metaEl.textContent = progress.totalBytes
        ? `${formatBytes(progress.receivedBytes)} / ${formatBytes(progress.totalBytes)}`
        : `已下载 ${formatBytes(progress.receivedBytes)}`;
    },
    success(filePath) {
      barEl.classList.remove("is-indeterminate");
      barEl.style.width = "100%";
      percentEl.textContent = "完成";
      metaEl.textContent = filePath ? `已保存：${filePath}` : "下载完成";
      close(900);
    },
    error(message) {
      toast.classList.add("is-error");
      barEl.classList.remove("is-indeterminate");
      percentEl.textContent = "失败";
      metaEl.textContent = message || "下载失败";
      close(2600);
    }
  };
}

module.exports = {
  saveProjectName,
  asyncCallback,
  callbackOrPromise,
  filenameFromDownloadOptions,
  extensionFromMime,
  mimeFromFilename,
  localPathFromFileUrl,
  localFileToDataUrl,
  dataUrlFromBlobUrl,
  arrayBufferFromBlobUrl,
  uploadPayloadWithReadableBytes,
  formatBytes,
  ensureDownloadToastStyles,
  createDownloadToast
};

var { getDesktopStorageItems, setDesktopStorageItems } = require("./storage.cjs");
