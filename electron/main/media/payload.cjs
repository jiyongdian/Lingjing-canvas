// 媒体与下载载荷处理：把各种来源(arrayBuffer/bytes/text/dataURL/远程URL/本地文件)
// 归一化为 { buffer, mime }，供素材持久化、上传、外部工具消费。
const fs = require("fs");
const path = require("path");
const { sniffImageMime, guessMimeFromFilename } = require("../utils/mime.cjs");
const { sha256Buffer } = require("../utils/crypto.cjs");
const { localPathFromFileUrl } = require("../utils/paths.cjs");
const { assertPublicHttpUrl } = require("../net/security.cjs");

function normalizeImagePayload(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) {
    return { buffer, mime };
  }
  const declaredMime = String(mime || "").split(";")[0].trim().toLowerCase();
  const signatures = [
    { mime: "image/png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    { mime: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff]) },
    { mime: "image/gif", bytes: Buffer.from([0x47, 0x49, 0x46, 0x38]) },
    { mime: "image/webp", bytes: Buffer.from("RIFF", "ascii"), verify: (candidate) => candidate.length >= 12 && candidate.slice(8, 12).toString("ascii") === "WEBP" }
  ];
  let normalizedBuffer = buffer;
  for (const signature of signatures) {
    const offset = buffer.indexOf(signature.bytes);
    if (offset > 0 && offset < 4096) {
      const candidate = buffer.slice(offset);
      if (!signature.verify || signature.verify(candidate)) {
        normalizedBuffer = candidate;
        break;
      }
    }
  }
  const sniffedMime = sniffImageMime(normalizedBuffer);
  return {
    buffer: normalizedBuffer,
    mime: sniffedMime || declaredMime || mime
  };
}

function readLocalFilePayload(filePath) {
  const resolvedPath = path.resolve(String(filePath || ""));
  const buffer = fs.readFileSync(resolvedPath);
  return {
    buffer,
    mime: guessMimeFromFilename(resolvedPath),
    filename: path.basename(resolvedPath)
  };
}

async function resolveAssetPayload(payload) {
  if (payload?.text !== undefined && payload?.text !== null) {
    return {
      buffer: Buffer.from(String(payload.text), "utf8"),
      mime: payload?.mime || "text/plain",
      filename: payload?.filename || "asset.txt"
    };
  }
  if (payload?.localPath && fs.existsSync(payload.localPath)) {
    return readLocalFilePayload(payload.localPath);
  }
  const media = await bufferFromMediaPayload(payload || {});
  return {
    buffer: media.buffer,
    mime: media.mime,
    filename: payload?.filename || `asset-${Date.now()}`
  };
}

async function bufferFromDownloadPayload(payload) {
  const url = String(payload?.url || "");
  const text = payload?.text;
  const sender = payload?.sender;
  const downloadId = payload?.downloadId;
  const emitProgress = (progress) => {
    if (!sender || !downloadId) return;
    sender.send(`wanjuan:download-progress:${downloadId}`, progress);
  };
  if (payload?.arrayBuffer) {
    const buffer = Buffer.from(payload.arrayBuffer);
    emitProgress({ percent: 100, receivedBytes: buffer.length, totalBytes: buffer.length });
    return {
      buffer,
      mime: payload?.mime || "application/octet-stream"
    };
  }
  if (payload?.bytes) {
    const buffer = Buffer.from(payload.bytes);
    emitProgress({ percent: 100, receivedBytes: buffer.length, totalBytes: buffer.length });
    return {
      buffer,
      mime: payload?.mime || "application/octet-stream"
    };
  }
  if (text !== undefined && text !== null) {
    const body = Buffer.from(String(text), "utf8");
    emitProgress({ percent: 100, receivedBytes: body.length, totalBytes: body.length });
    return {
      buffer: body,
      mime: payload?.mime || "application/json"
    };
  }
  if (!url) throw new Error("Missing download URL");

  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw new Error("Unsupported data URL");
    const isBase64 = Boolean(match[2]);
    const body = match[3] || "";
    emitProgress({ percent: 100, receivedBytes: body.length, totalBytes: body.length });
    return {
      buffer: isBase64 ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body)),
      mime: match[1] || payload.mime || ""
    };
  }

  if (payload?.base64) {
    emitProgress({ percent: 100, receivedBytes: String(payload.base64).length, totalBytes: String(payload.base64).length });
    return {
      buffer: Buffer.from(String(payload.base64), "base64"),
      mime: payload.mime || ""
    };
  }
  if (payload?.localPath && fs.existsSync(payload.localPath)) {
    const file = readLocalFilePayload(payload.localPath);
    emitProgress({ percent: 100, receivedBytes: file.buffer.length, totalBytes: file.buffer.length });
    return file;
  }
  if (payload?.path && fs.existsSync(payload.path)) {
    const file = readLocalFilePayload(payload.path);
    emitProgress({ percent: 100, receivedBytes: file.buffer.length, totalBytes: file.buffer.length });
    return file;
  }
  if (/^file:\/\//i.test(url)) {
    const file = readLocalFilePayload(decodeURIComponent(new URL(url).pathname));
    emitProgress({ percent: 100, receivedBytes: file.buffer.length, totalBytes: file.buffer.length });
    return file;
  }

  if (!/^https?:\/\//i.test(url)) throw new Error("Unsupported download URL");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const totalBytes = Number(response.headers.get("content-length") || 0);
  if (!response.body || typeof response.body.getReader !== "function") {
    const arrayBuffer = await response.arrayBuffer();
    emitProgress({ percent: 100, receivedBytes: arrayBuffer.byteLength, totalBytes: arrayBuffer.byteLength });
    return {
      buffer: Buffer.from(arrayBuffer),
      mime: response.headers.get("content-type") || payload.mime || ""
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let receivedBytes = 0;
  emitProgress({ percent: totalBytes ? 0 : null, receivedBytes, totalBytes });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    receivedBytes += chunk.length;
    emitProgress({
      percent: totalBytes ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : null,
      receivedBytes,
      totalBytes
    });
  }
  emitProgress({ percent: 100, receivedBytes, totalBytes: totalBytes || receivedBytes });
  return {
    buffer: Buffer.concat(chunks),
    mime: response.headers.get("content-type") || payload.mime || ""
  };
}

async function bufferFromMediaPayload(payload) {
  const url = String(payload?.url || "");
  const localPath =
    (typeof payload?.localPath === "string" && payload.localPath) ||
    (typeof payload?.path === "string" && payload.path) ||
    (/^file:\/\//i.test(url) ? new URL(url).pathname : "");
  if (localPath) {
    return readLocalFilePayload(decodeURIComponent(localPath));
  }
  if (payload?.arrayBuffer) {
    return {
      buffer: Buffer.from(payload.arrayBuffer),
      mime: payload?.mime || "application/octet-stream"
    };
  }
  if (payload?.bytes) {
    return {
      buffer: Buffer.from(payload.bytes),
      mime: payload?.mime || "application/octet-stream"
    };
  }
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw new Error("Unsupported data URL");
    return {
      buffer: match[2] ? Buffer.from(match[3] || "", "base64") : Buffer.from(decodeURIComponent(match[3] || "")),
      mime: match[1] || payload?.mime || "application/octet-stream"
    };
  }
  if (payload?.base64) {
    return {
      buffer: Buffer.from(String(payload.base64), "base64"),
      mime: payload?.mime || "application/octet-stream"
    };
  }
  assertPublicHttpUrl(url, "Media URL");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch media failed: ${response.status}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mime: response.headers.get("content-type") || payload?.mime || guessMimeFromFilename(new URL(url).pathname) || "application/octet-stream"
  };
}

module.exports = {
  normalizeImagePayload,
  readLocalFilePayload,
  resolveAssetPayload,
  bufferFromDownloadPayload,
  bufferFromMediaPayload,
};
