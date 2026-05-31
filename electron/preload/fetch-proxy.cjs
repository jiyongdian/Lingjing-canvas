// 职责：渲染进程 fetch 稳定性与桌面代理 —— 请求分类、并发队列、重试、桌面端 proxyFetch 代理及 shim 安装。
const { ipcRenderer } = require("./runtime.cjs");

const fetchStabilityState = {
  installed: false,
  queues: new Map()
};

function getFetchRequestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input.url === "string") return input.url;
  return "";
}

function getFetchRequestMethod(input, init) {
  return String(init?.method || input?.method || "GET").toUpperCase();
}

function getFetchRequestSignal(input, init) {
  return init?.signal || input?.signal || null;
}

function createAbortError() {
  try {
    return new DOMException("The operation was aborted.", "AbortError");
  } catch {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    return error;
  }
}

function classifyStableFetch(input, init) {
  const rawUrl = getFetchRequestUrl(input);
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const method = getFetchRequestMethod(input, init);
  const path = `${url.pathname}${url.search}`;
  const host = url.host;

  if (method === "POST" && /\/v1beta\/models\/[^/]+:generateContent/i.test(url.pathname)) {
    return { key: `ai-generate:${host}`, limit: getPerformanceFetchLimit("aiGenerateLimit", 3), retries: 2, label: "gemini-generate-content" };
  }
  if (method === "POST" && /\/v1\/chat\/completions$/i.test(url.pathname)) {
    return { key: `ai-chat:${host}`, limit: getPerformanceFetchLimit("aiChatLimit", 2), retries: 1, label: "chat-completion" };
  }
  if (method === "POST" && /\/api\/async\/image_gpt$/i.test(url.pathname)) {
    return { key: `ai-submit:${host}`, limit: getPerformanceFetchLimit("aiSubmitLimit", 1), retries: 0, label: "image-task-submit" };
  }
  if (method === "POST" && /\/contents\/generations\/tasks$/i.test(url.pathname)) {
    return { key: `ai-submit:${host}`, limit: getPerformanceFetchLimit("aiSubmitLimit", 1), retries: 0, label: "video-task-submit" };
  }
  if (method === "GET" && /\/contents\/generations\/tasks\/[^/?#]+/i.test(url.pathname)) {
    return { key: `ai-poll:${host}`, limit: getPerformanceFetchLimit("aiPollLimit", 2), retries: 1, label: "task-poll" };
  }
  if (/litterbox\.catbox\.moe|tmpfiles\.org|volces\.com|volces\.com\.cn/i.test(host + path)) {
    return { key: `media-transfer:${host}`, limit: 1, retries: 2, label: "media-transfer" };
  }

  return null;
}

function getFetchQueue(rule) {
  let queue = fetchStabilityState.queues.get(rule.key);
  if (!queue) {
    queue = { active: 0, items: [], limit: rule.limit };
    fetchStabilityState.queues.set(rule.key, queue);
  }
  queue.limit = rule.limit;
  return queue;
}

function pumpFetchQueue(queue) {
  while (queue.active < queue.limit && queue.items.length > 0) {
    const item = queue.items.shift();
    if (item.cancelled) continue;
    queue.active += 1;
    item.run()
      .then(item.resolve, item.reject)
      .finally(() => {
        queue.active -= 1;
        pumpFetchQueue(queue);
      });
  }
}

function enqueueStableFetch(rule, signal, run) {
  if (signal?.aborted) return Promise.reject(createAbortError());
  const queue = getFetchQueue(rule);
  return new Promise((resolve, reject) => {
    const item = {
      cancelled: false,
      run,
      resolve,
      reject
    };
    const onAbort = () => {
      item.cancelled = true;
      reject(createAbortError());
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    const cleanup = (callback) => (value) => {
      if (signal) signal.removeEventListener("abort", onAbort);
      callback(value);
    };
    item.resolve = cleanup(resolve);
    item.reject = cleanup(reject);
    queue.items.push(item);
    pumpFetchQueue(queue);
  });
}

function isRetryableFetchError(error) {
  if (!error || error.name === "AbortError") return false;
  const message = String(error.message || error);
  return error instanceof TypeError || /Failed to fetch|NetworkError|Load failed|ERR_|ECONN|ETIMEDOUT|ENOTFOUND/i.test(message);
}

function isMediaStorageFetch(url, method) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") return false;
  const target = `${url.host || ""}${url.pathname || ""}${url.search || ""}`.toLowerCase();
  return /storage\.googleapis\.com|tos-[^/]+\.volces\.com|volces\.com|byteimg\.com|bytedance\.com|catbox\.moe|tmpfiles\.org|0x0\.st|transfer\.sh|filebin\.net|uguu\.se/i.test(target);
}

function isApiLikeDesktopFetch(url, method) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") return true;
  const pathname = `${url.pathname || ""}${url.search || ""}`;
  return /\/v\d+(beta)?\/|\/api\/|\/contents\/generations\/tasks/i.test(pathname);
}

function shouldProxyDesktopFetchUrl(rawUrl, method) {
  try {
    const currentOrigin = typeof location !== "undefined" ? location.origin : "";
    const url = new URL(String(rawUrl || ""), currentOrigin || undefined);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (isMediaStorageFetch(url, method)) return false;
    return isApiLikeDesktopFetch(url, method);
  } catch {
    return false;
  }
}

function getDesktopProxyFetchTimeout(url, method) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return 180000;
  }
  const pathname = parsed.pathname || "";
  if (
    normalizedMethod === "POST" &&
    (
      /\/v1beta\/models\/[^/]+:generateContent/i.test(pathname) ||
      /\/v1\/images\/generations$/i.test(pathname) ||
      /\/v1\/images\/edits$/i.test(pathname) ||
      /\/images\/generations$/i.test(pathname)
    )
  ) {
    return 600000;
  }
  if (normalizedMethod === "POST" && /\/api\/async\/image_gpt$/i.test(pathname)) {
    return 600000;
  }
  if (normalizedMethod === "GET" && /storage\.googleapis\.com|tos-[^/]+\.volces\.com|volces\.com/i.test(parsed.host)) {
    return 600000;
  }
  return 180000;
}

async function buildDesktopProxyFetchPayload(input, init) {
  const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
  const method = String(request.method || "GET").toUpperCase();
  let bodyBase64 = "";
  if (method !== "GET" && method !== "HEAD") {
    const cloned = request.clone();
    const buffer = Buffer.from(await cloned.arrayBuffer());
    if (buffer.length > 0) {
      bodyBase64 = buffer.toString("base64");
    }
  }
  return {
    requestId: `desktop-fetch-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    url: request.url,
    method,
    headers: Object.fromEntries(request.headers.entries()),
    bodyBase64,
    requestTimeout: getDesktopProxyFetchTimeout(request.url, method)
  };
}

function buildDesktopProxyFetchResponse(result) {
  const body = result?.bodyBase64 ? Buffer.from(result.bodyBase64, "base64") : Buffer.alloc(0);
  return new Response(body, {
    status: Number(result?.status || 200),
    statusText: result?.statusText || "OK",
    headers: Array.isArray(result?.headers) ? result.headers : []
  });
}

function plainHeadersFromResponseHeaders(headers) {
  try {
    return Object.fromEntries(new Headers(headers || {}).entries());
  } catch {
    return {};
  }
}

function base64FromBridgeBody(body) {
  if (body == null) return "";
  if (typeof body === "string") return Buffer.from(body).toString("base64");
  if (body instanceof ArrayBuffer) return Buffer.from(body).toString("base64");
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("base64");
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    throw new Error("Blob bodies must be converted to arrayBuffer before calling wanjuanDesktop.proxyFetch");
  }
  return Buffer.from(JSON.stringify(body)).toString("base64");
}

function buildDesktopProxyFetchBridgePayload(payload = {}) {
  const url = String(payload.url || "").trim();
  const method = String(payload.method || "GET").toUpperCase();
  const headers = plainHeadersFromResponseHeaders(payload.headers);
  const bodyBase64 = payload.bodyBase64
    ? String(payload.bodyBase64)
    : base64FromBridgeBody(payload.body);
  return {
    requestId: String(payload.requestId || `desktop-fetch-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    url,
    method,
    headers,
    bodyBase64,
    requestTimeout: Number(payload.requestTimeout || getDesktopProxyFetchTimeout(url, method))
  };
}

async function invokeDesktopProxyFetchPayload(payload, signal) {
  let aborted = false;
  const abortProxyRequest = () => {
    aborted = true;
    ipcRenderer.send("wanjuan:abort-fetch", payload.requestId);
  };
  if (signal?.aborted) {
    abortProxyRequest();
    throw createAbortError();
  }
  if (signal) signal.addEventListener("abort", abortProxyRequest, { once: true });

  try {
    const result = await ipcRenderer.invoke("wanjuan:proxy-fetch", payload);
    if (result?.aborted || aborted) throw createAbortError();
    if (!result?.ok) throw new TypeError(result?.error || "Failed to fetch");
    return result;
  } catch (error) {
    throw error;
  } finally {
    if (signal) signal.removeEventListener("abort", abortProxyRequest);
  }
}

function installDesktopFetchProxy() {
  if (fetchStabilityState.desktopProxyInstalled || typeof window === "undefined" || typeof window.fetch !== "function") return;
  fetchStabilityState.desktopProxyInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const rawUrl = (() => {
      if (typeof input === "string" || input instanceof URL) return String(input);
      if (input && typeof input.url === "string") return input.url;
      return "";
    })();
    const method = getFetchRequestMethod(input, init);
    if (!shouldProxyDesktopFetchUrl(rawUrl, method)) return nativeFetch(input, init);

    const payload = await buildDesktopProxyFetchPayload(input, init);
    const signal = getFetchRequestSignal(input, init);
    const result = await invokeDesktopProxyFetchPayload(payload, signal);
    return buildDesktopProxyFetchResponse(result);
  };
}

function waitForFetchRetry(ms, signal) {
  if (signal?.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

function cloneFetchInputForRetry(input) {
  try {
    if (typeof Request !== "undefined" && input instanceof Request) return input.clone();
  } catch {
    // Cross-realm Request instances are safe to reuse only for the first attempt.
  }
  return input;
}

async function runStableFetch(nativeFetch, input, init, rule, signal) {
  const attempts = rule.retries + 1;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const nextInput = attempt === 0 ? input : cloneFetchInputForRetry(input);
      return await nativeFetch(nextInput, init);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1 || !isRetryableFetchError(error)) throw error;
      const delay = Math.min(3000, 700 * (2 ** attempt)) + Math.floor(Math.random() * 250);
      console.warn(`[wanjuan-fetch] ${rule.label} retry ${attempt + 1}/${rule.retries}`, String(error?.message || error));
      await waitForFetchRetry(delay, signal);
    }
  }
  throw lastError;
}

function installFetchStabilityShim() {
  if (fetchStabilityState.installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  fetchStabilityState.installed = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const rule = classifyStableFetch(input, init);
    if (!rule) return nativeFetch(input, init);
    const signal = getFetchRequestSignal(input, init);
    return enqueueStableFetch(rule, signal, () => runStableFetch(nativeFetch, input, init, rule, signal));
  };
}

module.exports = {
  fetchStabilityState,
  getFetchRequestUrl,
  getFetchRequestMethod,
  getFetchRequestSignal,
  createAbortError,
  classifyStableFetch,
  getFetchQueue,
  pumpFetchQueue,
  enqueueStableFetch,
  isRetryableFetchError,
  isMediaStorageFetch,
  isApiLikeDesktopFetch,
  shouldProxyDesktopFetchUrl,
  getDesktopProxyFetchTimeout,
  buildDesktopProxyFetchPayload,
  buildDesktopProxyFetchResponse,
  plainHeadersFromResponseHeaders,
  base64FromBridgeBody,
  buildDesktopProxyFetchBridgePayload,
  invokeDesktopProxyFetchPayload,
  installDesktopFetchProxy,
  waitForFetchRetry,
  cloneFetchInputForRetry,
  runStableFetch,
  installFetchStabilityShim
};

// 跨模块 late-require（避免循环依赖；var 提升，放最后）
var { getPerformanceFetchLimit } = require("./storage.cjs");
