// 桌面端代理 HTTP 请求：优先走 Electron net（带会话 Cookie），失败回退 Node http/https。
// 含针对 AI 生成接口的并发队列限流，以及请求中止控制器表。
const http = require("http");
const https = require("https");
const { net } = require("../electron-refs.cjs");
const { appendDesktopLog, formatErrorMessage } = require("../logging.cjs");

// 并发与性能设置（由 IPC 的 set-performance-settings 更新）
const DESKTOP_AI_GENERATE_CONCURRENCY = 3;
let desktopPerformanceSettings = {
  key: "balanced",
  aiGenerateLimit: 3
};
const desktopProxyFetchControllers = new Map();
const desktopProxyFetchQueues = new Map();

function getDesktopPerformanceSettings() {
  return desktopPerformanceSettings;
}
function setDesktopPerformanceSettings(next) {
  desktopPerformanceSettings = next;
  return desktopPerformanceSettings;
}

function getDesktopAiGenerateConcurrency() {
  const value = Number(desktopPerformanceSettings?.aiGenerateLimit);
  if (!Number.isFinite(value)) return DESKTOP_AI_GENERATE_CONCURRENCY;
  return Math.max(1, Math.min(10, Math.round(value)));
}

function createDesktopAbortError() {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function classifyDesktopProxyFetch(payload) {
  try {
    const url = new URL(String(payload?.url || ""));
    const method = String(payload?.method || "GET").toUpperCase();
    if (method === "POST" && /\/v1beta\/models\/[^/]+:generateContent/i.test(url.pathname)) {
      return {
        key: `main-ai-generate:${url.host}`,
        limit: getDesktopAiGenerateConcurrency(),
        label: "gemini-generate-content"
      };
    }
  } catch {}
  return null;
}

function getDesktopProxyFetchQueue(rule) {
  let queue = desktopProxyFetchQueues.get(rule.key);
  if (!queue) {
    queue = { active: 0, items: [], limit: rule.limit, label: rule.label };
    desktopProxyFetchQueues.set(rule.key, queue);
  }
  queue.limit = rule.limit;
  queue.label = rule.label;
  return queue;
}

function pumpDesktopProxyFetchQueue(queue) {
  while (queue.active < queue.limit && queue.items.length > 0) {
    const item = queue.items.shift();
    if (item.cancelled) continue;
    queue.active += 1;
    item.run()
      .then(item.resolve, item.reject)
      .finally(() => {
        queue.active -= 1;
        pumpDesktopProxyFetchQueue(queue);
      });
  }
}

function enqueueDesktopProxyFetch(rule, requestId, signal, run) {
  if (signal?.aborted) return Promise.reject(createDesktopAbortError());
  const queue = getDesktopProxyFetchQueue(rule);
  return new Promise((resolve, reject) => {
    const item = {
      cancelled: false,
      run,
      resolve,
      reject
    };
    const cancel = () => {
      if (item.cancelled) return;
      item.cancelled = true;
      reject(createDesktopAbortError());
      pumpDesktopProxyFetchQueue(queue);
    };
    const entry = desktopProxyFetchControllers.get(requestId);
    if (entry) entry.cancel = cancel;
    const cleanup = (callback) => (value) => {
      const current = desktopProxyFetchControllers.get(requestId);
      if (current && current.cancel === cancel) current.cancel = null;
      callback(value);
    };
    item.resolve = cleanup(resolve);
    item.reject = cleanup(reject);
    queue.items.push(item);
    appendDesktopLog("proxy-fetch-queued", {
      requestId,
      label: rule.label,
      active: queue.active,
      queued: queue.items.length,
      limit: queue.limit
    });
    pumpDesktopProxyFetchQueue(queue);
  });
}

function sanitizeProxyFetchHeaders(headers) {
  const blocked = new Set([
    "host",
    "connection",
    "content-length",
    "origin",
    "referer",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-dest",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform"
  ]);
  const next = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (!key || value == null) continue;
    const normalized = String(key).toLowerCase();
    if (blocked.has(normalized)) continue;
    next[key] = String(value);
  }
  return next;
}

function serializeProxyFetchHeaders(headers) {
  const entries = [];
  if (!headers || typeof headers.forEach !== "function") return entries;
  headers.forEach((value, key) => {
    entries.push([key, value]);
  });
  return entries;
}

function serializeElectronNetHeaders(headers) {
  return Object.entries(headers || {}).flatMap(([key, value]) => {
    if (Array.isArray(value)) return value.map((item) => [key, String(item)]);
    if (value == null) return [];
    return [[key, String(value)]];
  });
}

function proxyHttpRequestViaElectronNet(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (!net || typeof net.request !== "function") {
      reject(new Error("Electron net.request is unavailable"));
      return;
    }

    let settled = false;
    let req;
    let timeoutId = null;
    let responseStream;
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
    };
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(result);
    };

    try {
      const method = String(options.method || "GET").toUpperCase();
      const headers = { ...(options.headers || {}) };
      const body = Buffer.isBuffer(options.body)
        ? options.body
        : options.body != null
          ? Buffer.from(options.body)
          : null;
      req = net.request({
        method,
        url,
        useSessionCookies: true
      });
      for (const [key, value] of Object.entries(headers)) {
        if (!key || value == null) continue;
        req.setHeader(key, String(value));
      }

      req.on("response", (res) => {
        responseStream = res;
        const chunks = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          finish(null, {
            status: Number(res.statusCode || 200),
            statusText: String(res.statusMessage || "OK"),
            headers: serializeElectronNetHeaders(res.headers),
            bodyBase64: Buffer.concat(chunks).toString("base64")
          });
        });
        res.on("error", (error) => {
          finish(error);
        });
      });
      req.on("error", (error) => {
        finish(error);
      });
      timeoutId = setTimeout(() => {
        const timeoutError = new Error(`Proxy fetch request timeout after ${options.requestTimeout || 120000}ms`);
        if (responseStream && !responseStream.destroyed) responseStream.destroy(timeoutError);
        if (req) req.abort();
        finish(timeoutError);
      }, Number(options.requestTimeout || 120000));

      if (options.signal) {
        const onAbort = () => {
          const abortError = new Error("The operation was aborted.");
          abortError.name = "AbortError";
          if (responseStream && !responseStream.destroyed) responseStream.destroy(abortError);
          if (req) req.abort();
          finish(abortError);
        };
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
        req.on("close", () => {
          options.signal.removeEventListener("abort", onAbort);
        });
      }

      if (body && body.length > 0) req.write(body);
      req.end();
    } catch (error) {
      cleanup();
      try {
        if (req) req.abort();
      } catch {}
      finish(error);
    }
  });
}

function proxyHttpRequestViaNode(url, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    let responseStream;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(result);
    };
    try {
      const target = new URL(url);
      const transport = target.protocol === "https:" ? https : http;
      const method = String(options.method || "GET").toUpperCase();
      const headers = { ...(options.headers || {}) };
      const body = Buffer.isBuffer(options.body)
        ? options.body
        : options.body != null
          ? Buffer.from(options.body)
          : null;
      if (body && headers["Content-Length"] == null && headers["content-length"] == null) {
        headers["Content-Length"] = String(body.length);
      }
      req = transport.request(target, {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname || "/"}${target.search || ""}`,
        method,
        headers,
        timeout: Number(options.requestTimeout || 120000),
        rejectUnauthorized: true
      }, (res) => {
        responseStream = res;
        const chunks = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          finish(null, {
            status: Number(res.statusCode || 200),
            statusText: String(res.statusMessage || "OK"),
            headers: Object.entries(res.headers || {}).flatMap(([key, value]) => {
              if (Array.isArray(value)) return value.map((item) => [key, String(item)]);
              if (value == null) return [];
              return [[key, String(value)]];
            }),
            bodyBase64: Buffer.concat(chunks).toString("base64")
          });
        });
        res.on("error", (error) => {
          finish(error);
        });
      });
      req.on("timeout", () => {
        req.destroy(new Error(`Proxy fetch request timeout after ${options.requestTimeout || 120000}ms`));
      });
      req.on("error", (error) => {
        finish(error);
      });
      if (options.signal) {
        const onAbort = () => {
          const abortError = new Error("The operation was aborted.");
          abortError.name = "AbortError";
          if (responseStream && !responseStream.destroyed) responseStream.destroy(abortError);
          if (req && !req.destroyed) req.destroy(abortError);
          finish(abortError);
        };
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
        req.on("close", () => {
          options.signal.removeEventListener("abort", onAbort);
        });
      }
      if (body && body.length > 0) req.write(body);
      req.end();
    } catch (error) {
      if (req && !req.destroyed) req.destroy();
      finish(error);
    }
  });
}

async function proxyHttpRequest(url, options = {}) {
  try {
    return await proxyHttpRequestViaElectronNet(url, options);
  } catch (error) {
    if (options.signal?.aborted || error?.name === "AbortError") throw error;
    appendDesktopLog("proxy-http-electron-net-fallback", {
      url,
      method: options.method || "GET",
      error: formatErrorMessage(error)
    });
    return proxyHttpRequestViaNode(url, options);
  }
}

module.exports = {
  DESKTOP_AI_GENERATE_CONCURRENCY,
  desktopProxyFetchControllers,
  desktopProxyFetchQueues,
  getDesktopPerformanceSettings,
  setDesktopPerformanceSettings,
  getDesktopAiGenerateConcurrency,
  createDesktopAbortError,
  classifyDesktopProxyFetch,
  getDesktopProxyFetchQueue,
  pumpDesktopProxyFetchQueue,
  enqueueDesktopProxyFetch,
  sanitizeProxyFetchHeaders,
  serializeProxyFetchHeaders,
  serializeElectronNetHeaders,
  proxyHttpRequestViaElectronNet,
  proxyHttpRequestViaNode,
  proxyHttpRequest,
};
