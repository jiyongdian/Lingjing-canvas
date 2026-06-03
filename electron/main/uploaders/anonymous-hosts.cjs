// 匿名图床上传：将媒体 Buffer 依次尝试上传到多个公网临时直链服务，并校验返回的公网 URL 可访问。
const crypto = require("crypto");

const {
  extractPublicUrlFromText,
  formatErrorMessage,
  summarizeUploadError,
  truncateLogValue,
  appendDesktopLog
} = require("../logging.cjs");
const { extensionFromMime } = require("../utils/mime.cjs");
const { sanitizeFilename } = require("../utils/paths.cjs");
const { assertPublicHttpUrl } = require("../net/security.cjs");
const { proxyHttpRequest } = require("../net/proxy-fetch.cjs");

async function validatePublicMediaUrl(url, kind = "media", redirectCount = 0) {
  assertPublicHttpUrl(url, `Public URL for ${kind}`);
  const response = await requestTextWithRetries(url, {
    method: "GET",
    headers: {
      Range: "bytes=0-0",
      "User-Agent": "Mozilla/5.0 WanJuanCanvas/1.2.7.1"
    },
    requestTimeout: 45000
  }, 2);
  const status = Number(response.status);
  if (status >= 300 && status < 400 && redirectCount < 3) {
    const redirectHeaders = new Map((response.headers || []).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
    const location = redirectHeaders.get("location");
    if (location) {
      return validatePublicMediaUrl(new URL(location, url).toString(), kind, redirectCount + 1);
    }
  }
  if (status !== 200 && status !== 206) {
    const text = decodeProxyBody(response).toString("utf8");
    throw new Error(`Public URL validation failed for ${kind}: ${status} ${truncateLogValue(text, 500)}`);
  }
  const headerMap = Object.fromEntries((response.headers || []).map(([key, value]) => [String(key).toLowerCase(), value]));
  const body = decodeProxyBody(response);
  if (body.length < 1 && Number(headerMap["content-length"] || 0) < 1) {
    throw new Error(`Public URL validation failed for ${kind}: empty response`);
  }
  return {
    ok: true,
    status,
    contentType: headerMap["content-type"] || "",
    contentLength: Number(headerMap["content-length"] || 0)
  };
}

function normalizeTmpfilesUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  const match = value.match(/^https?:\/\/tmpfiles\.org\/(\d+)\/(.+)$/i);
  if (!match) return value.replace(/^http:\/\//i, "https://");
  return `https://tmpfiles.org/dl/${match[1]}/${match[2]}`;
}

function buildMultipartBody(parts = []) {
  const boundary = `----wanjuan-${crypto.randomBytes(12).toString("hex")}`;
  const chunks = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`, "utf8"));
    let disposition = `Content-Disposition: form-data; name="${String(part.name || "").replace(/"/g, '\\"')}"`;
    if (part.filename) {
      disposition += `; filename="${String(part.filename).replace(/"/g, '\\"')}"`;
    }
    chunks.push(Buffer.from(`${disposition}\r\n`, "utf8"));
    if (part.contentType) {
      chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`, "utf8"));
    }
    chunks.push(Buffer.from(`\r\n`, "utf8"));
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(String(part.value ?? ""), "utf8"));
    chunks.push(Buffer.from(`\r\n`, "utf8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function decodeProxyBody(result) {
  return Buffer.from(String(result?.bodyBase64 || ""), "base64");
}

async function requestTextWithRetries(url, options = {}, attempts = 2) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await proxyHttpRequest(url, options);
    } catch (error) {
      lastError = error;
      if (index < attempts - 1) {
        appendDesktopLog("proxy-http-retry", {
          url,
          attempt: index + 1,
          attempts,
          error: formatErrorMessage(error)
        });
      }
    }
  }
  throw lastError;
}

async function uploadToLitterbox(buffer, mime, filename) {
  const { body, contentType } = buildMultipartBody([
    { name: "reqtype", value: "fileupload" },
    { name: "time", value: "1h" },
    {
      name: "fileToUpload",
      value: buffer,
      filename,
      contentType: mime || "application/octet-stream"
    }
  ]);
  const response = await requestTextWithRetries("https://litterbox.catbox.moe/resources/internals/api.php", {
    method: "POST",
    headers: {
      "Content-Type": contentType
    },
    body,
    requestTimeout: 45000
  }, 3);
  const text = decodeProxyBody(response).toString("utf8");
  if (Number(response.status) < 200 || Number(response.status) >= 300) {
    throw new Error(`Litterbox upload failed: ${response.status} ${truncateLogValue(text, 800)}`);
  }
  const url = extractPublicUrlFromText(text);
  if (!/^https?:\/\//i.test(url)) throw new Error(`Litterbox did not return a public URL: ${text}`);
  return url;
}

async function uploadToTmpfiles(buffer, mime, filename) {
  const { body, contentType } = buildMultipartBody([
    {
      name: "file",
      value: buffer,
      filename,
      contentType: mime || "application/octet-stream"
    }
  ]);
  const response = await requestTextWithRetries("https://tmpfiles.org/api/v1/upload", {
    method: "POST",
    headers: {
      "Content-Type": contentType
    },
    body,
    requestTimeout: 45000
  }, 3);
  const text = decodeProxyBody(response).toString("utf8");
  if (Number(response.status) < 200 || Number(response.status) >= 300) {
    throw new Error(`Tmpfiles upload failed: ${response.status} ${truncateLogValue(text, 800)}`);
  }
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Tmpfiles returned non-JSON response: ${text}`);
  }
  const url = normalizeTmpfilesUrl(data?.data?.url || data?.url || "");
  if (!/^https?:\/\//i.test(url)) throw new Error("Tmpfiles did not return a public URL");
  return url;
}

async function uploadTo0x0(buffer, mime, filename) {
  const { body, contentType } = buildMultipartBody([
    {
      name: "file",
      value: buffer,
      filename,
      contentType: mime || "application/octet-stream"
    }
  ]);
  const response = await requestTextWithRetries("https://0x0.st", {
    method: "POST",
    headers: {
      "Content-Type": contentType
    },
    body,
    requestTimeout: 45000
  }, 3);
  const text = decodeProxyBody(response).toString("utf8");
  if (Number(response.status) < 200 || Number(response.status) >= 300) {
    throw new Error(`0x0 upload failed: ${response.status} ${truncateLogValue(text, 800)}`);
  }
  const url = extractPublicUrlFromText(text);
  if (!/^https?:\/\//i.test(url)) throw new Error(`0x0 did not return a public URL: ${text}`);
  return url;
}

async function uploadToTransferSh(buffer, mime, filename) {
  const safeName = encodeURIComponent(filename || `wanjuan-${Date.now()}`);
  const response = await requestTextWithRetries(`https://transfer.sh/${safeName}`, {
    method: "PUT",
    headers: {
      "Content-Type": mime || "application/octet-stream"
    },
    body: buffer,
    requestTimeout: 60000
  }, 2);
  const text = decodeProxyBody(response).toString("utf8");
  if (Number(response.status) < 200 || Number(response.status) >= 300) {
    throw new Error(`transfer.sh upload failed: ${response.status} ${truncateLogValue(text, 800)}`);
  }
  const url = extractPublicUrlFromText(text);
  if (!/^https?:\/\//i.test(url)) throw new Error(`transfer.sh did not return a public URL: ${text}`);
  return url;
}

async function uploadToCatbox(buffer, mime, filename) {
  const { body, contentType } = buildMultipartBody([
    { name: "reqtype", value: "fileupload" },
    {
      name: "fileToUpload",
      value: buffer,
      filename,
      contentType: mime || "application/octet-stream"
    }
  ]);
  const response = await requestTextWithRetries("https://catbox.moe/user/api.php", {
    method: "POST",
    headers: {
      "Content-Type": contentType
    },
    body,
    requestTimeout: 60000
  }, 2);
  const text = decodeProxyBody(response).toString("utf8");
  if (Number(response.status) < 200 || Number(response.status) >= 300) {
    throw new Error(`Catbox upload failed: ${response.status} ${truncateLogValue(text, 800)}`);
  }
  const url = extractPublicUrlFromText(text);
  if (!/^https?:\/\//i.test(url)) throw new Error(`Catbox did not return a public URL: ${text}`);
  return url;
}

async function uploadToUguu(buffer, mime, filename) {
  const { body, contentType } = buildMultipartBody([
    {
      name: "files[]",
      value: buffer,
      filename,
      contentType: mime || "application/octet-stream"
    }
  ]);
  const response = await requestTextWithRetries("https://uguu.se/upload.php", {
    method: "POST",
    headers: {
      "Content-Type": contentType
    },
    body,
    requestTimeout: 60000
  }, 2);
  const text = decodeProxyBody(response).toString("utf8");
  if (Number(response.status) < 200 || Number(response.status) >= 300) {
    throw new Error(`Uguu upload failed: ${response.status} ${truncateLogValue(text, 800)}`);
  }
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Uguu returned non-JSON response: ${text}`);
  }
  const url = data?.files?.[0]?.url || data?.url || "";
  if (!/^https?:\/\//i.test(url)) throw new Error(`Uguu did not return a public URL: ${text}`);
  return url;
}

async function uploadToFilebin(buffer, mime, filename) {
  const safeName = sanitizeFilename(filename || `wanjuan-${Date.now()}${extensionFromMime(mime) || ""}`);
  const binId = `wanjuan-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const response = await requestTextWithRetries(`https://filebin.net/${encodeURIComponent(binId)}/${encodeURIComponent(safeName)}`, {
    method: "POST",
    headers: {
      "Content-Type": mime || "application/octet-stream"
    },
    body: buffer,
    requestTimeout: 60000
  }, 2);
  const text = decodeProxyBody(response).toString("utf8");
  if (Number(response.status) < 200 || Number(response.status) >= 300) {
    throw new Error(`Filebin upload failed: ${response.status} ${truncateLogValue(text, 800)}`);
  }
  return `https://filebin.net/${encodeURIComponent(binId)}/${encodeURIComponent(safeName)}`;
}

async function uploadToAnonymousHosts(buffer, mime, filename, skipHosts = []) {
  const skip = new Set(
    (Array.isArray(skipHosts) ? skipHosts : [skipHosts])
      .filter(Boolean)
      .map((item) => String(item).toLowerCase())
  );
  const attempts = [
    {
      id: "uguu",
      run: () => uploadToUguu(buffer, mime, filename)
    },
    {
      id: "0x0",
      run: () => uploadTo0x0(buffer, mime, filename)
    },
    {
      id: "catbox",
      run: () => uploadToCatbox(buffer, mime, filename)
    },
    {
      id: "litterbox",
      run: () => uploadToLitterbox(buffer, mime, filename)
    },
    {
      id: "transfer.sh",
      run: () => uploadToTransferSh(buffer, mime, filename)
    },
    {
      id: "tmpfiles",
      run: () => uploadToTmpfiles(buffer, mime, filename)
    },
    {
      id: "filebin",
      run: () => uploadToFilebin(buffer, mime, filename)
    }
  ];
  const errors = [];
  for (const attempt of attempts) {
    if (skip.has(attempt.id)) continue;
    try {
      const url = await attempt.run();
      await validatePublicMediaUrl(url, `anonymous-${attempt.id}`);
      return url;
    } catch (error) {
      errors.push(`${attempt.id}: ${summarizeUploadError(error)}`);
      appendDesktopLog("anonymous-upload-attempt-failed", {
        host: attempt.id,
        error: summarizeUploadError(error, 500)
      });
    }
  }
  throw new Error(`公网临时直链上传失败，已尝试 ${errors.length} 个通道：${errors.join(" | ")}`);
}

module.exports = {
  validatePublicMediaUrl,
  normalizeTmpfilesUrl,
  buildMultipartBody,
  decodeProxyBody,
  requestTextWithRetries,
  uploadToLitterbox,
  uploadToTmpfiles,
  uploadTo0x0,
  uploadToTransferSh,
  uploadToCatbox,
  uploadToUguu,
  uploadToFilebin,
  uploadToAnonymousHosts
};
