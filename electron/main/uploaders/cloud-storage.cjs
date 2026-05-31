// 职责：火山引擎 TOS 与七牛云 S3 兼容存储的签名计算与文件上传（预签名/Header 双模式）。

const path = require("path");

const { hmac, sha256Hex } = require("../utils/crypto.cjs");
const { sanitizeFilename } = require("../utils/paths.cjs");
const { extensionFromMime } = require("../utils/mime.cjs");
const { appendDesktopLog, formatErrorMessage } = require("../logging.cjs");
const { bufferFromMediaPayload } = require("../media/payload.cjs");
const { validatePublicMediaUrl } = require("./anonymous-hosts.cjs");

function encodeTosObjectKey(value) {
  return String(value || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function normalizeTosEndpoint(endpoint, bucket) {
  const clean = String(endpoint || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/g, "").toLowerCase();
  if (!clean) throw new Error("Missing TOS endpoint");
  if (bucket && (clean.startsWith(`${bucket}.`) || clean.startsWith(`${bucket}-tos-`))) return clean;
  return bucket ? `${bucket}.${clean}` : clean;
}

function normalizeS3Endpoint(endpoint) {
  const clean = String(endpoint || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/g, "").toLowerCase();
  if (!clean) throw new Error("Missing S3 endpoint");
  return clean;
}

function normalizePublicBaseUrl(baseUrl) {
  let value = String(baseUrl || "").trim().replace(/^http\(s\):\/\//i, "").replace(/\/+$/g, "");
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

function encodeS3ObjectKey(value) {
  return String(value || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function inferQiniuRegion(endpointHost, configuredRegion = "") {
  const explicit = String(configuredRegion || "").trim();
  if (explicit) return explicit;
  const match = String(endpointHost || "").match(/s3[.-]([a-z0-9-]+)\.qiniucs\.com/i);
  return match?.[1] || "us-east-1";
}

function createTosSigningKey(secretAccessKey, dateStamp, region, service, useTos4SecretPrefix = false) {
  const baseSecret = useTos4SecretPrefix ? `TOS4${secretAccessKey}` : secretAccessKey;
  const kDate = hmac(baseSecret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "request");
}

function buildQiniuPresignedPutUrl({
  accessKeyId,
  secretAccessKey,
  region,
  endpointHost,
  bucket,
  encodedKey,
  virtualHost = false,
  expires = 900
}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = "s3";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.max(1, Math.min(Number(expires) || 900, 604800))),
    "X-Amz-SignedHeaders": "host"
  });
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const signedHost = virtualHost ? `${bucket}.${endpointHost}` : endpointHost;
  const canonicalUri = virtualHost ? `/${encodedKey}` : `/${bucket}/${encodedKey}`;
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `host:${signedHost}\n`,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");
  query.set("X-Amz-Signature", signature);
  return virtualHost
    ? `https://${signedHost}/${encodedKey}?${query.toString()}`
    : `https://${endpointHost}/${bucket}/${encodedKey}?${query.toString()}`;
}

function buildQiniuPresignedGetUrl({
  accessKeyId,
  secretAccessKey,
  region,
  signedHost,
  canonicalUri,
  expires = 604800
}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = "s3";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.max(1, Math.min(Number(expires) || 604800, 604800))),
    "X-Amz-SignedHeaders": "host"
  });
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    `host:${signedHost}\n`,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");
  query.set("X-Amz-Signature", signature);
  return `https://${signedHost}${canonicalUri}?${query.toString()}`;
}

function isQiniuS3Host(hostname) {
  return /(?:^|\.)s3[.-][a-z0-9-]+\.qiniucs\.com$/i.test(String(hostname || ""));
}

function isTosHost(hostname) {
  return /(?:^|\.)tos-[a-z0-9-]+\.volces\.com$/i.test(String(hostname || ""));
}

function buildQiniuSignedGetTarget({ parsedPublicBase, publicBaseUrl, bucket, endpointHost, encodedKey, successfulAttempt }) {
  if (parsedPublicBase && !isQiniuS3Host(parsedPublicBase.hostname)) {
    return {
      signed: false,
      url: `${publicBaseUrl}/${encodedKey}`
    };
  }

  const baseHost = parsedPublicBase?.hostname || "";
  const basePath = parsedPublicBase?.pathname
    ? parsedPublicBase.pathname.replace(/\/+$/g, "")
    : "";
  const hostUsesBucket = baseHost
    ? baseHost.toLowerCase().startsWith(`${bucket.toLowerCase()}.`)
    : Boolean(successfulAttempt?.virtualHost);
  const signedHost = baseHost || (hostUsesBucket ? `${bucket}.${endpointHost}` : endpointHost);
  const canonicalUri = hostUsesBucket
    ? `${basePath || ""}/${encodedKey}`
    : `${basePath && basePath !== "/" ? basePath : `/${bucket}`}/${encodedKey}`;

  return {
    signed: true,
    signedHost,
    canonicalUri
  };
}

function buildTosPresignedGetUrl({
  accessKeyId,
  secretAccessKey,
  region,
  endpointHost,
  objectKey,
  canonicalUri,
  useTos4SecretPrefix = false,
  expires = 604800
}) {
  const encodedKey = encodeTosObjectKey(objectKey);
  const requestUri = canonicalUri || `/${encodedKey}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = "tos";
  const credentialScope = `${dateStamp}/${region}/${service}/request`;
  const payloadHash = "UNSIGNED-PAYLOAD";
  const query = new URLSearchParams({
    "X-Tos-Algorithm": "TOS4-HMAC-SHA256",
    "X-Tos-Content-Sha256": payloadHash,
    "X-Tos-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Tos-Date": amzDate,
    "X-Tos-Expires": String(Math.max(1, Math.min(Number(expires) || 604800, 604800))),
    "X-Tos-SignedHeaders": "host"
  });
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const canonicalRequest = [
    "GET",
    requestUri,
    canonicalQuery,
    `host:${endpointHost}\n`,
    "host",
    payloadHash
  ].join("\n");
  const stringToSign = [
    "TOS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const kSigning = createTosSigningKey(secretAccessKey, dateStamp, region, service, useTos4SecretPrefix);
  const signature = hmac(kSigning, stringToSign, "hex");
  query.set("X-Tos-Signature", signature);
  return `https://${endpointHost}${requestUri}?${query.toString()}`;
}

function buildTosPresignedPutUrl({
  accessKeyId,
  secretAccessKey,
  region,
  endpointHost,
  encodedKey,
  useTos4SecretPrefix = false,
  expires = 900
}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = "tos";
  const credentialScope = `${dateStamp}/${region}/${service}/request`;
  const payloadHash = "UNSIGNED-PAYLOAD";
  const query = new URLSearchParams({
    "X-Tos-Algorithm": "TOS4-HMAC-SHA256",
    "X-Tos-Content-Sha256": payloadHash,
    "X-Tos-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Tos-Date": amzDate,
    "X-Tos-Expires": String(Math.max(1, Math.min(Number(expires) || 900, 604800))),
    "X-Tos-SignedHeaders": "host"
  });
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const canonicalRequest = [
    "PUT",
    `/${encodedKey}`,
    canonicalQuery,
    `host:${endpointHost}\n`,
    "host",
    payloadHash
  ].join("\n");
  const stringToSign = [
    "TOS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const kSigning = createTosSigningKey(secretAccessKey, dateStamp, region, service, useTos4SecretPrefix);
  const signature = hmac(kSigning, stringToSign, "hex");
  query.set("X-Tos-Signature", signature);
  return `https://${endpointHost}/${encodedKey}?${query.toString()}`;
}

async function uploadToTos(payload) {
  const config = payload?.tos || {};
  const accessKeyId = String(config.accessKeyId || config.accessKey || "").trim();
  const secretAccessKey = String(config.secretAccessKey || config.secretKey || "").trim();
  const region = String(config.region || "cn-beijing").trim();
  const bucket = String(config.bucket || "").trim();
  const endpointHost = normalizeTosEndpoint(config.endpoint || "tos-cn-beijing.volces.com", bucket);
  const prefix = String(config.prefix || "wanjuan/seedance/").replace(/^\/+|\/+$/g, "");
  const publicBaseUrl = normalizePublicBaseUrl(config.publicBaseUrl || "");
  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("TOS 配置不完整：需要 AccessKey、SecretKey 和 Bucket");
  }

  const { buffer, mime, filename: rawFilename } = await bufferFromMediaPayload(payload || {});
  let filename = sanitizeFilename(payload?.filename || rawFilename || `seedance-reference-${Date.now()}${extensionFromMime(mime) || ".mp4"}`);
  const ext = extensionFromMime(mime);
  if (ext && !path.extname(filename)) filename += ext;
  const objectKey = `${prefix ? `${prefix}/` : ""}${Date.now()}-${Math.random().toString(16).slice(2)}-${filename}`;
  const encodedKey = encodeTosObjectKey(objectKey);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = "tos";
  const contentType = mime || "application/octet-stream";
  const payloadHash = sha256Hex(buffer);
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${endpointHost}\n` +
    `x-tos-content-sha256:${payloadHash}\n` +
    `x-tos-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-tos-content-sha256;x-tos-date";
  const canonicalRequest = [
    "PUT",
    `/${encodedKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/request`;
  const stringToSign = [
    "TOS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  let response = null;
  let tosSigningKeyUsesPrefix = false;
  let lastTosUploadErrorText = "";
  for (const useTos4SecretPrefix of [false, true]) {
    response = await fetch(buildTosPresignedPutUrl({
      accessKeyId,
      secretAccessKey,
      region,
      endpointHost,
      encodedKey,
      useTos4SecretPrefix
    }), {
      method: "PUT",
      headers: {
        "Content-Type": contentType
      },
      body: buffer
    });
    if (response.ok) {
      tosSigningKeyUsesPrefix = useTos4SecretPrefix;
      break;
    }
    lastTosUploadErrorText = await response.text().catch(() => "");
    appendDesktopLog("upload-tos-media-presigned-put-failed", {
      signingKey: useTos4SecretPrefix ? "tos4-prefixed" : "standard",
      status: response.status,
      error: lastTosUploadErrorText.slice(0, 500),
      endpointHost,
      objectKey
    });
  }
  if (!response?.ok) {
    for (const useTos4SecretPrefix of [false, true]) {
      const kSigning = createTosSigningKey(secretAccessKey, dateStamp, region, service, useTos4SecretPrefix);
      const signature = hmac(kSigning, stringToSign, "hex");
      const authorization = `TOS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
      response = await fetch(`https://${endpointHost}/${encodedKey}`, {
        method: "PUT",
        headers: {
          Authorization: authorization,
          "Content-Type": contentType,
          "x-tos-content-sha256": payloadHash,
          "x-tos-date": amzDate
        },
        body: buffer
      });
      if (response.ok) {
        tosSigningKeyUsesPrefix = useTos4SecretPrefix;
        break;
      }
      lastTosUploadErrorText = await response.text().catch(() => "");
      appendDesktopLog("upload-tos-media-header-put-failed", {
        signingKey: useTos4SecretPrefix ? "tos4-prefixed" : "standard",
        status: response.status,
        error: lastTosUploadErrorText.slice(0, 500),
        endpointHost,
        objectKey
      });
    }
  }
  if (!response.ok) {
    const text = lastTosUploadErrorText || await response.text().catch(() => "");
    const readableHint = /SignatureDoesNotMatch/i.test(text)
      ? "TOS 上传签名失败：请确认 SecretKey 是否正确，Bucket 所在区域是否和 Region/Endpoint 一致。"
      : `TOS upload failed: ${response.status}`;
    throw new Error(`${readableHint} ${text}`);
  }
  let parsedPublicBase = null;
  try {
    parsedPublicBase = publicBaseUrl ? new URL(publicBaseUrl) : null;
  } catch {
    parsedPublicBase = null;
  }
  const signedGet = !parsedPublicBase || isTosHost(parsedPublicBase.hostname);
  const url = !signedGet
    ? `${publicBaseUrl}/${encodedKey}`
    : buildTosPresignedGetUrl({
        accessKeyId,
        secretAccessKey,
        region,
        endpointHost: parsedPublicBase?.hostname || endpointHost,
        objectKey,
        canonicalUri: `${parsedPublicBase?.pathname ? parsedPublicBase.pathname.replace(/\/+$/g, "") : ""}/${encodedKey}`,
        useTos4SecretPrefix: tosSigningKeyUsesPrefix
      });
  const validation = await validatePublicMediaUrl(url, payload?.kind || "tos-upload");
  appendDesktopLog("upload-tos-media-succeeded", {
    kind: payload?.kind || "",
    endpointHost,
    objectKey,
    usingPublicBaseUrl: Boolean(publicBaseUrl),
    signedGet,
    tosSigningKey: tosSigningKeyUsesPrefix ? "tos4-prefixed" : "standard",
    validation
  });
  return { ok: true, url, objectKey };
}

async function uploadToQiniuS3(payload) {
  const config = payload?.qiniu || {};
  const accessKeyId = String(config.accessKey || config.accessKeyId || "").trim();
  const secretAccessKey = String(config.secretKey || config.secretAccessKey || "").trim();
  const bucket = String(config.bucket || "").trim();
  const endpointHost = normalizeS3Endpoint(config.endpoint || "s3.cn-south-1.qiniucs.com");
  const region = inferQiniuRegion(endpointHost, config.region);
  const prefix = String(config.prefix || "wanjuan/seedance/").replace(/^\/+|\/+$/g, "");
  const publicBaseUrl = normalizePublicBaseUrl(config.domain || config.publicBaseUrl || "");
  if (!accessKeyId || !secretAccessKey || !bucket || !endpointHost) {
    throw new Error("七牛云配置不完整：需要 Access Key、Secret Key、Bucket 和 S3 Endpoint");
  }

  const { buffer, mime, filename: rawFilename } = await bufferFromMediaPayload(payload || {});
  let filename = sanitizeFilename(payload?.filename || rawFilename || `seedance-reference-${Date.now()}${extensionFromMime(mime) || ".mp4"}`);
  const ext = extensionFromMime(mime);
  if (ext && !path.extname(filename)) filename += ext;
  const objectKey = `${prefix ? `${prefix}/` : ""}${Date.now()}-${Math.random().toString(16).slice(2)}-${filename}`;
  const encodedKey = encodeS3ObjectKey(objectKey);
  const contentType = mime || "application/octet-stream";
  const uploadAttempts = [
    { label: "path-style", virtualHost: false },
    ...(bucket.includes(".") ? [] : [{ label: "virtual-host", virtualHost: true }])
  ];
  let response = null;
  let lastUploadErrorText = "";
  let successfulAttempt = uploadAttempts[0];
  for (const attempt of uploadAttempts) {
    const putUrl = buildQiniuPresignedPutUrl({
      accessKeyId,
      secretAccessKey,
      region,
      endpointHost,
      bucket,
      encodedKey,
      virtualHost: attempt.virtualHost
    });
    response = await fetch(putUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType
      },
      body: buffer
    });
    if (response.ok) {
      successfulAttempt = attempt;
      appendDesktopLog("upload-qiniu-media-put-succeeded", {
        attempt: attempt.label,
        endpointHost,
        bucket,
        objectKey
      });
      break;
    }
    lastUploadErrorText = await response.text().catch(() => "");
    appendDesktopLog("upload-qiniu-media-put-failed", {
      attempt: attempt.label,
      status: response.status,
      error: lastUploadErrorText.slice(0, 500),
      endpointHost,
      bucket,
      objectKey
    });
  }
  if (!response.ok) {
    throw new Error(`Qiniu S3 upload failed: ${response.status} ${lastUploadErrorText}`);
  }
  let url;
  let signedGet = false;
  let parsedPublicBase = null;
  try {
    parsedPublicBase = publicBaseUrl ? new URL(publicBaseUrl) : null;
  } catch {
    parsedPublicBase = null;
  }
  const getTarget = buildQiniuSignedGetTarget({
    parsedPublicBase,
    publicBaseUrl,
    bucket,
    endpointHost,
    encodedKey,
    successfulAttempt
  });
  if (!getTarget.signed) {
    url = getTarget.url;
  } else {
    const signedRegion = inferQiniuRegion(getTarget.signedHost, region);
    url = buildQiniuPresignedGetUrl({
      accessKeyId,
      secretAccessKey,
      region: signedRegion,
      signedHost: getTarget.signedHost,
      canonicalUri: getTarget.canonicalUri
    });
    signedGet = true;
  }
  let validation = null;
  try {
    validation = await validatePublicMediaUrl(url, payload?.kind || "qiniu-upload");
  } catch (error) {
    appendDesktopLog("upload-qiniu-media-validation-skipped", {
      kind: payload?.kind || "",
      endpointHost,
      bucket,
      objectKey,
      url,
      error: formatErrorMessage(error)
    });
  }
  appendDesktopLog("upload-qiniu-media-succeeded", {
    kind: payload?.kind || "",
    endpointHost,
    bucket,
    objectKey,
    usingPublicBaseUrl: Boolean(publicBaseUrl),
    signedGet,
    validation
  });
  return { ok: true, url, objectKey };
}

module.exports = {
  encodeTosObjectKey,
  normalizeTosEndpoint,
  normalizeS3Endpoint,
  normalizePublicBaseUrl,
  encodeS3ObjectKey,
  inferQiniuRegion,
  createTosSigningKey,
  buildQiniuPresignedPutUrl,
  buildQiniuPresignedGetUrl,
  isQiniuS3Host,
  isTosHost,
  buildQiniuSignedGetTarget,
  buildTosPresignedGetUrl,
  buildTosPresignedPutUrl,
  uploadToTos,
  uploadToQiniuS3
};
