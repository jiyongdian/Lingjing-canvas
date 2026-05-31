// 职责：自定义图床的键值配置解析、结果路径取值与自定义公网直链上传通道。
const path = require("path");

const { extractPublicUrlFromText, formatErrorMessage } = require("../logging.cjs");
const { extensionFromMime } = require("../utils/mime.cjs");
const { sanitizeFilename } = require("../utils/paths.cjs");
const { assertPublicHttpUrl } = require("../net/security.cjs");
const { bufferFromMediaPayload } = require("../media/payload.cjs");
const { validatePublicMediaUrl } = require("./anonymous-hosts.cjs");

function parseKeyValueConfig(value) {
  const raw = String(value || "").trim();
  if (!raw) return {};
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }
  return raw.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce((result, line) => {
      const index = line.indexOf("=");
      if (index <= 0) return result;
      const key = line.slice(0, index).trim();
      const val = line.slice(index + 1).trim();
      if (key) result[key] = val;
      return result;
    }, {});
}

function getByPath(value, pathValue) {
  const pathText = String(pathValue || "").trim();
  if (!pathText) return value;
  return pathText.split(".").reduce((current, key) => current?.[key], value);
}

async function uploadToCustomPublicHost(payload) {
  const config = payload?.customUpload || {};
  const endpoint = String(config.endpoint || "").trim();
  assertPublicHttpUrl(endpoint, "Custom upload URL");
  const fileField = String(config.fileField || "file").trim() || "file";
  const method = String(config.method || "POST").trim().toUpperCase();
  const resultPath = String(config.resultPath || "").trim();
  const { buffer, mime, filename: rawFilename } = await bufferFromMediaPayload(payload || {});
  let filename = sanitizeFilename(payload?.filename || rawFilename || `seedance-reference-${Date.now()}${extensionFromMime(mime) || ".mp4"}`);
  const ext = extensionFromMime(mime);
  if (ext && !path.extname(filename)) filename += ext;

  const form = new FormData();
  const fields = parseKeyValueConfig(config.fields || config.extraFields || "");
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  form.append(fileField, new Blob([buffer], { type: mime || "application/octet-stream" }), filename);

  const headers = parseKeyValueConfig(config.headers || "");
  let response;
  try {
    response = await fetch(endpoint, {
      method,
      headers,
      body: form
    });
  } catch (error) {
    throw new Error(`Upload request failed for ${endpoint}: ${formatErrorMessage(error)}`);
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`Upload failed: ${response.status} ${text}`);

  let url = "";
  const contentType = response.headers.get("content-type") || "";
  if (resultPath || /json/i.test(contentType) || /^[\[{]/.test(text.trim())) {
    try {
      const data = JSON.parse(text);
      const value = getByPath(data, resultPath);
      url = typeof value === "string" ? value : extractPublicUrlFromText(JSON.stringify(value || data));
    } catch {
      url = extractPublicUrlFromText(text);
    }
  } else {
    url = extractPublicUrlFromText(text);
  }
  if (!/^https?:\/\//i.test(url)) throw new Error("Upload did not return a public URL");
  await validatePublicMediaUrl(url, payload?.kind || "custom-upload");
  return { ok: true, url };
}

module.exports = {
  parseKeyValueConfig,
  getByPath,
  uploadToCustomPublicHost
};
