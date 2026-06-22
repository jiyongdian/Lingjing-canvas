// 工作空间团队服务：跨 macOS / Windows 的局域网只读模板共享 HTTP 服务。
const http = require("node:http");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const { app } = require("./electron-refs.cjs");
const { appendDesktopLog, formatErrorMessage } = require("./logging.cjs");
const { localPathFromFileUrl } = require("./utils/paths.cjs");
const { guessMimeFromFilename } = require("./utils/mime.cjs");

const DEFAULT_WORKSPACE_TEAM_PORT = 39218;
const WORKSPACE_PROTOCOL_VERSION = 1;

let teamServer = null;
let teamServerState = {
  enabled: false,
  port: DEFAULT_WORKSPACE_TEAM_PORT,
  memberName: "",
  deviceId: "",
  templates: [],
  startedAt: 0,
  lastError: "",
};

function normalizeTeamTemplate(template = {}) {
  const id = String(template.id || "").trim();
  if (!id) return null;
  return {
    id,
    title: String(template.title || "未命名提示词模板").slice(0, 120),
    prompt: String(template.prompt || ""),
    type: String(template.type || "video"),
    groupId: String(template.groupId || ""),
    sourceProvider: String(template.sourceProvider || "seedance"),
    sourceNodeId: String(template.sourceNodeId || ""),
    sourceProjectId: String(template.sourceProjectId || ""),
    modelName: String(template.modelName || ""),
    generationMode: String(template.generationMode || template.tianjiSeedanceGenerationMode || "text-to-video"),
    params: template.params && typeof template.params === "object" ? template.params : {},
    resultUrl: String(template.resultUrl || template.videoUrl || ""),
    resultLocalPath: String(template.resultLocalPath || template.videoLocalPath || template.localPath || ""),
    thumbnailUrl: String(template.thumbnailUrl || template.posterUrl || ""),
    thumbnailLocalPath: String(template.thumbnailLocalPath || template.posterLocalPath || ""),
    createdAt: Number(template.createdAt || Date.now()),
    updatedAt: Number(template.updatedAt || template.createdAt || Date.now()),
  };
}

function normalizeTeamTemplates(templates) {
  return (Array.isArray(templates) ? templates : [])
    .map(normalizeTeamTemplate)
    .filter(Boolean)
    .slice(0, 1000);
}

function getLocalIPv4AddressEntries() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.family !== "IPv4" || entry.internal) continue;
      addresses.push({ name, address: entry.address });
    }
  }
  return addresses;
}

function isLikelyLanIPv4(address) {
  const parts = String(address || "").split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function getWorkspaceManifest() {
  const port = Number(teamServerState.port || DEFAULT_WORKSPACE_TEAM_PORT);
  const allAddressEntries = getLocalIPv4AddressEntries();
  const lanAddressEntries = allAddressEntries.filter((entry) => isLikelyLanIPv4(entry.address));
  const addressEntries = lanAddressEntries.length ? lanAddressEntries : allAddressEntries;
  const addresses = addressEntries.map((entry) => entry.address);
  const allAddresses = allAddressEntries.map((entry) => entry.address);
  const preferredAddress = addresses[0] || "";
  return {
    protocol: "wanjuan-workspace-team",
    protocolVersion: WORKSPACE_PROTOCOL_VERSION,
    appName: "万卷灵境",
    appVersion: app?.getVersion?.() || "",
    platform: process.platform,
    memberName: teamServerState.memberName || os.hostname() || "团队成员",
    deviceId: teamServerState.deviceId || os.hostname() || "",
    enabled: !!teamServerState.enabled,
    port,
    addresses,
    allAddresses,
    addressEntries,
    allAddressEntries,
    preferredAddress,
    preferredUrl: preferredAddress ? `http://${preferredAddress}:${port}` : "",
    urls: addresses.map((address) => `http://${address}:${port}`),
    allUrls: allAddresses.map((address) => `http://${address}:${port}`),
    templateCount: teamServerState.templates.length,
    startedAt: teamServerState.startedAt || 0,
  };
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  const body = Buffer.from(String(html || ""), "utf8");
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function sendFile(res, req, filePath) {
  let stats;
  try {
    stats = fs.statSync(filePath);
    if (!stats.isFile()) throw new Error("Not a file");
  } catch {
    sendJson(res, 404, { ok: false, error: "Media not found" });
    return;
  }

  const total = stats.size;
  const mime = guessMimeFromFilename(filePath);
  const range = String(req.headers.range || "");
  const commonHeaders = {
    "content-type": mime,
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff",
  };

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : total - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      res.writeHead(416, {
        ...commonHeaders,
        "content-range": `bytes */${total}`,
      });
      res.end();
      return;
    }
    const safeEnd = Math.min(end, total - 1);
    res.writeHead(206, {
      ...commonHeaders,
      "content-length": safeEnd - start + 1,
      "content-range": `bytes ${start}-${safeEnd}/${total}`,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
    return;
  }

  res.writeHead(200, {
    ...commonHeaders,
    "content-length": total,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function localPathFromTemplateUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^file:\/\//i.test(raw)) return localPathFromFileUrl(raw);
  if (path.isAbsolute(raw)) return raw;
  if (/^[A-Za-z]:[\\/]/.test(raw)) return raw;
  return "";
}

function templateMediaLocalPath(template, kind) {
  const localPath = kind === "thumbnail" ?
    String(template.thumbnailLocalPath || "").trim() || localPathFromTemplateUrl(template.thumbnailUrl) :
    String(template.resultLocalPath || "").trim() || localPathFromTemplateUrl(template.resultUrl);
  if (!localPath) return "";
  try {
    const stats = fs.statSync(localPath);
    return stats.isFile() ? localPath : "";
  } catch {
    return "";
  }
}

function requestBaseUrl(req) {
  const host = String(req.headers.host || "").trim();
  return host ? `http://${host}` : getWorkspaceManifest().preferredUrl;
}

function mediaUrlForTemplate(req, template, kind) {
  const localPath = templateMediaLocalPath(template, kind);
  if (!localPath) return "";
  const baseUrl = requestBaseUrl(req);
  if (!baseUrl) return "";
  const filename = encodeURIComponent(path.basename(localPath) || `${kind}.bin`);
  return `${baseUrl}/workspace/media/${encodeURIComponent(template.id)}/${kind}/${filename}`;
}

function templateForResponse(req, template) {
  const next = { ...template };
  const resultProxyUrl = mediaUrlForTemplate(req, next, "result");
  const thumbnailProxyUrl = mediaUrlForTemplate(req, next, "thumbnail");
  if (resultProxyUrl) {
    next.originalResultUrl = next.resultUrl;
    next.resultUrl = resultProxyUrl;
    next.mediaProxied = true;
  }
  if (thumbnailProxyUrl) {
    next.originalThumbnailUrl = next.thumbnailUrl;
    next.thumbnailUrl = thumbnailProxyUrl;
  }
  delete next.resultLocalPath;
  delete next.thumbnailLocalPath;
  return next;
}

function templatesForResponse(req) {
  return (teamServerState.templates || []).map((template) => templateForResponse(req, template));
}

function renderWorkspaceHomePage() {
  const manifest = getWorkspaceManifest();
  const templates = teamServerState.templates || [];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>万卷灵境团队空间</title>
  <style>
    :root{color-scheme:dark;background:#111418;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{margin:0;padding:28px;background:#111418}
    main{max-width:880px;margin:0 auto;display:grid;gap:16px}
    section{border:1px solid #303640;border-radius:12px;background:#171a1f;padding:16px}
    h1{margin:0;font-size:20px}
    h2{margin:0 0 10px;font-size:14px;color:#f3f4f6}
    p{margin:6px 0;color:#9ca3af;font-size:13px;line-height:1.6}
    code{background:#0f1217;border:1px solid #2b313a;border-radius:6px;padding:2px 6px;color:#bfdbfe}
    .template{display:grid;gap:6px;border-top:1px solid #2b313a;padding-top:12px;margin-top:12px}
    .title{font-weight:800;color:#f8fafc}
    .prompt{white-space:pre-wrap;color:#cbd5e1;font-size:12px;line-height:1.55}
    a{color:#93c5fd}
  </style>
</head>
<body>
  <main>
    <section>
      <h1>万卷灵境团队空间</h1>
      <p>这台电脑的团队空间服务已运行。另一台电脑在万卷灵境的工作空间里添加本地址后，点击“刷新团队”即可拉取模板。</p>
      <p>模板接口：<code>/workspace/templates</code>，当前共享模板 <strong>${templates.length}</strong> 个。</p>
      <p>成员名：${escapeHtml(manifest.memberName || "团队成员")}；端口：${escapeHtml(manifest.port)}</p>
    </section>
    <section>
      <h2>共享模板</h2>
      ${templates.length ? templates.map((template) => `
        <div class="template">
          <div class="title">${escapeHtml(template.title)}</div>
          <div class="prompt">${escapeHtml(template.prompt || "无提示词内容")}</div>
        </div>
      `).join("") : `<p>当前没有共享模板。请先在个人空间的提示词模板卡片点击“发到团队”。</p>`}
    </section>
  </main>
</body>
</html>`;
}

function createWorkspaceTeamServer() {
  return http.createServer((req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    if (method === "OPTIONS") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";
    if (pathname === "/") {
      sendHtml(res, 200, renderWorkspaceHomePage());
      return;
    }
    if (pathname === "/workspace/manifest") {
      sendJson(res, 200, { ok: true, manifest: getWorkspaceManifest() });
      return;
    }
    if (pathname === "/workspace/templates") {
      sendJson(res, 200, {
        ok: true,
        manifest: getWorkspaceManifest(),
        templates: templatesForResponse(req),
      });
      return;
    }
    const mediaMatch = pathname.match(/^\/workspace\/media\/([^/]+)\/(result|thumbnail)(?:\/.*)?$/);
    if (mediaMatch) {
      const id = decodeURIComponent(mediaMatch[1]);
      const kind = mediaMatch[2];
      const template = teamServerState.templates.find((item) => item.id === id);
      const localPath = template ? templateMediaLocalPath(template, kind) : "";
      if (!localPath) {
        sendJson(res, 404, { ok: false, error: "Media not found" });
        return;
      }
      sendFile(res, req, localPath);
      return;
    }
    const match = pathname.match(/^\/workspace\/template\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const template = teamServerState.templates.find((item) => item.id === id);
      if (!template) {
        sendJson(res, 404, { ok: false, error: "Template not found" });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        manifest: getWorkspaceManifest(),
        template: templateForResponse(req, template),
      });
      return;
    }
    sendJson(res, 404, { ok: false, error: "Not found" });
  });
}

function stopWorkspaceTeamServer() {
  return new Promise((resolve) => {
    if (!teamServer) {
      teamServerState.enabled = false;
      resolve({ ok: true, status: getWorkspaceTeamStatus() });
      return;
    }
    const current = teamServer;
    teamServer = null;
    current.close(() => {
      teamServerState.enabled = false;
      appendDesktopLog("workspace-team-stopped", { port: teamServerState.port });
      resolve({ ok: true, status: getWorkspaceTeamStatus() });
    });
  });
}

async function startWorkspaceTeamServer(options = {}) {
  const port = Math.max(1024, Math.min(65535, Math.round(Number(options.port || DEFAULT_WORKSPACE_TEAM_PORT))));
  teamServerState = {
    ...teamServerState,
    port,
    memberName: String(options.memberName || teamServerState.memberName || os.hostname() || "团队成员").trim(),
    deviceId: String(options.deviceId || teamServerState.deviceId || os.hostname() || "").trim(),
    templates: normalizeTeamTemplates(options.templates || teamServerState.templates),
    lastError: "",
  };
  await stopWorkspaceTeamServer();
  teamServerState.port = port;
  teamServerState.templates = normalizeTeamTemplates(options.templates || teamServerState.templates);

  teamServer = createWorkspaceTeamServer();
  return new Promise((resolve) => {
    teamServer.once("error", (error) => {
      teamServer = null;
      teamServerState.enabled = false;
      teamServerState.lastError = formatErrorMessage(error);
      appendDesktopLog("workspace-team-start-failed", {
        port,
        error: teamServerState.lastError,
        platform: process.platform,
      });
      resolve({
        ok: false,
        error: teamServerState.lastError,
        status: getWorkspaceTeamStatus(),
      });
    });
    teamServer.listen(port, "0.0.0.0", () => {
      teamServerState.enabled = true;
      teamServerState.startedAt = Date.now();
      appendDesktopLog("workspace-team-started", getWorkspaceManifest());
      resolve({ ok: true, status: getWorkspaceTeamStatus() });
    });
  });
}

function updateWorkspaceTeamPublishedTemplates(templates = []) {
  teamServerState.templates = normalizeTeamTemplates(templates);
  return { ok: true, status: getWorkspaceTeamStatus() };
}

function getWorkspaceTeamStatus() {
  return {
    ...getWorkspaceManifest(),
    running: !!teamServer,
    lastError: teamServerState.lastError || "",
  };
}

function normalizeMemberAddress(address) {
  const raw = String(address || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[，；、]/g, " ")
    .trim();
  if (!raw) return "";
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i);
  const ipv4Match = raw.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:\/[^\s"'<>]*)?/);
  const localhostMatch = raw.match(/\blocalhost(?::\d{1,5})?(?:\/[^\s"'<>]*)?/i);
  const candidate = String(urlMatch?.[0] || ipv4Match?.[0] || localhostMatch?.[0] || raw)
    .replace(/[)。）\],;，；]+$/g, "")
    .trim();
  try {
    const parsed = new URL(/^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (!parsed.port) parsed.port = String(DEFAULT_WORKSPACE_TEAM_PORT);
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

async function fetchWorkspaceTeamMember(address, timeoutMs = 8000) {
  const baseUrl = normalizeMemberAddress(address);
  if (!baseUrl) return { ok: false, address, inputAddress: address, error: "无效的团队空间地址，请输入类似 192.168.1.8:39218 的地址" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 8000)));
  try {
    const response = await fetch(`${baseUrl}/workspace/templates`, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }
    return {
      ok: true,
      address: baseUrl,
      inputAddress: address,
      manifest: json.manifest || {},
      templates: normalizeTeamTemplates(json.templates || []),
      fetchedAt: Date.now(),
    };
  } catch (error) {
    return {
      ok: false,
      address: baseUrl,
      inputAddress: address,
      error: error?.name === "AbortError" ? "连接超时" : formatErrorMessage(error),
      fetchedAt: Date.now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_WORKSPACE_TEAM_PORT,
  normalizeTeamTemplates,
  getWorkspaceTeamStatus,
  startWorkspaceTeamServer,
  stopWorkspaceTeamServer,
  updateWorkspaceTeamPublishedTemplates,
  fetchWorkspaceTeamMember,
};
