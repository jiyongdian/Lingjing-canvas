// 路径与文件名工具：文件名/路径段净化、下载目录解析、file URL 与 dataURL 解析等。
const fs = require("fs");
const path = require("path");
const { fileURLToPath, pathToFileURL } = require("url");
const { app } = require("../electron-refs.cjs");
const { appendDesktopLog } = require("../logging.cjs");

function sanitizeFilename(filename) {
  const fallback = `wanjuan-${Date.now()}`;
  const clean = String(filename || fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

function sanitizePathSegment(value, fallback = "asset") {
  const clean = String(value || fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return clean || fallback;
}

function defaultDownloadDirectory() {
  return path.join(app.getPath("downloads"), "万卷灵境");
}

function resolveWritableDownloadDirectory(requestedDirectory) {
  const requested = requestedDirectory || defaultDownloadDirectory();
  try {
    fs.mkdirSync(requested, { recursive: true });
    fs.accessSync(requested, fs.constants.W_OK);
    return { directory: requested, fallback: false };
  } catch (error) {
    appendDesktopLog("save-download-directory-fallback", {
      requestedDirectory: requested,
      fallbackDirectory: defaultDownloadDirectory(),
      error: String(error?.message || error)
    });
  }

  const fallback = defaultDownloadDirectory();
  fs.mkdirSync(fallback, { recursive: true });
  fs.accessSync(fallback, fs.constants.W_OK);
  return { directory: fallback, fallback: true };
}

function mediaLibraryRoot(directory) {
  return path.join(directory || defaultDownloadDirectory(), "万卷画布媒体库");
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

function fileUrlFromLocalPath(value) {
  if (typeof value !== "string" || !value) return "";
  try {
    const normalized = value.replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(normalized)) {
      return `file:///${encodeURI(normalized).replace(/#/g, "%23")}`;
    }
    if (normalized.startsWith("//")) {
      const match = normalized.match(/^\/\/([^/]+)\/?(.*)$/);
      if (match?.[1]) {
        const sharePath = match[2] ? `/${match[2]}` : "/";
        return `file://${encodeURIComponent(match[1])}${encodeURI(sharePath).replace(/#/g, "%23")}`;
      }
    }
    return pathToFileURL(value).href;
  } catch {
    return "";
  }
}

function basenameWithoutExt(value) {
  const base = path.basename(String(value || ""));
  return path.basename(base, path.extname(base)).toLowerCase();
}

function bufferFromDataUrlValue(value) {
  if (typeof value !== "string" || !value.startsWith("data:")) return null;
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const body = match[3] || "";
  return {
    buffer: match[2] ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body)),
    mime
  };
}

module.exports = {
  sanitizeFilename,
  sanitizePathSegment,
  defaultDownloadDirectory,
  resolveWritableDownloadDirectory,
  mediaLibraryRoot,
  localPathFromFileUrl,
  fileUrlFromLocalPath,
  basenameWithoutExt,
  bufferFromDataUrlValue
};
