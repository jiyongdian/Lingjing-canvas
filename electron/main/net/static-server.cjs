// 本地静态服务器：生产模式下服务工程根目录的 dist/，渲染进程经 http://127.0.0.1:port 加载。
// 开发模式(WANJUAN_DEV_SERVER_URL)直接返回 Vite dev server 地址。
const fs = require("fs");
const http = require("http");
const path = require("path");
const { app } = require("../electron-refs.cjs");
const { TEST_DEFAULT_PORT } = require("../config.cjs");
const { getMimeType } = require("../utils/mime.cjs");

function createStaticServer() {
  // 开发模式：若设置了 Vite dev server 地址，直接返回该地址，跳过本地静态服务器
  const devServerUrl = process.env.WANJUAN_DEV_SERVER_URL;
  if (devServerUrl) {
    return Promise.resolve(devServerUrl.replace(/\/$/, ""));
  }
  // 生产模式：dist 位于工程根目录（electron/main/net 的上三级）
  const distRoot = path.resolve(__dirname, "..", "..", "..", "dist");
  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: http: https: file:",
    "media-src 'self' data: blob: http: https: file:",
    "connect-src http: https: ws: wss: blob: file:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join("; ");
  const server = http.createServer((req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, {
        "content-type": "text/plain; charset=utf-8",
        "allow": "GET, HEAD",
        "cache-control": "no-store"
      });
      res.end("Method not allowed");
      return;
    }

    const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
    const requested = decodeURIComponent(parsedUrl.pathname === "/" ? "/index.html" : parsedUrl.pathname);
    const safeRelative = requested.replace(/^\/+/, "");
    const filePath = path.resolve(distRoot, safeRelative);
    if (!filePath.startsWith(distRoot + path.sep) && filePath !== distRoot) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": getMimeType(filePath),
        "content-length": data.length,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy": contentSecurityPolicy
      });
      if (method === "HEAD") {
        res.end();
        return;
      }
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    const preferredPort = Number(process.env.WANJUAN_DESKTOP_PORT || TEST_DEFAULT_PORT);
    const listen = (port) => server.listen(port, "127.0.0.1");

    server.once("error", (error) => {
      if (
        preferredPort &&
        process.env.WANJUAN_ALLOW_RANDOM_PORT === "1" &&
        error &&
        error.code === "EADDRINUSE"
      ) {
        server.removeAllListeners("error");
        server.once("error", reject);
        listen(0);
        return;
      }
      reject(error);
    });

    listen(preferredPort || 0);
    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to bind desktop static server"));
        return;
      }
      app.on("before-quit", () => server.close());
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}


module.exports = { createStaticServer };
