// 万卷灵境 桌面端主进程引导入口（模块化重建版）。
// 职责：解析 Electron 对象、应用启动期副作用（命名/GPU/单实例锁/全局错误处理），
// 注册 IPC，待 app ready 后启动静态服务器并创建主窗口。
//
// 本文件由原 reference/src/main.cjs 拆分而来，业务逻辑分布在 electron/main/ 下各模块：
//   config.cjs / logging.cjs / runtime-state.cjs
//   utils/{mime,crypto,paths}.cjs · net/{security,proxy-fetch,static-server}.cjs
//   knowledge.cjs · media/payload.cjs · assets/project-assets.cjs · tools/external-tools.cjs
//   uploaders/{anonymous-hosts,cloud-storage,custom-host}.cjs · self-test.cjs
//   ipc.cjs（IPC 注册）· window.cjs（主窗口）
const fs = require("fs");
const path = require("path");

const { app, BrowserWindow } = require("./electron-refs.cjs");
const { TEST_BUILD_NAME, TEST_USER_DATA_DIR, TEST_USER_DATA_PATH } = require("./config.cjs");
const { isBenignEpipeError, appendDesktopLog } = require("./logging.cjs");
const { setDesktopBaseUrl } = require("./runtime-state.cjs");
const { createStaticServer } = require("./net/static-server.cjs");
const { registerDesktopIpc } = require("./ipc.cjs");
const { createMainWindow } = require("./window.cjs");
const { installApplicationMenu, scheduleAutomaticUpdateCheck } = require("./update-checker.cjs");

// 应用标识与用户数据目录（保持与原 app 一致，沿用同一 userData，迁移用户无感）。
try {
  app.setName(TEST_BUILD_NAME);
  app.setPath("userData", TEST_USER_DATA_PATH || path.join(app.getPath("appData"), TEST_USER_DATA_DIR));
} catch {}

// stdout/stderr 的 EPIPE 容错：管道提前关闭不应导致进程崩溃。
for (const stream of [process.stdout, process.stderr]) {
  if (stream && typeof stream.on === "function") {
    stream.on("error", (error) => {
      if (!isBenignEpipeError(error)) throw error;
    });
  }
}

// 未捕获异常：良性 EPIPE 忽略，其余写入崩溃日志后重新抛出。
process.on("uncaughtException", (error) => {
  if (isBenignEpipeError(error)) return;
  try {
    const crashLogPath = path.join(app.getPath("userData"), "desktop-main-crash.log");
    fs.appendFileSync(
      crashLogPath,
      `${new Date().toISOString()} ${String(error?.stack || error?.message || error)}\n`,
      "utf8"
    );
  } catch {}
  throw error;
});

// GPU 模式开关（off / performance / stable，默认 stable）。
const legacyDisableGpu = process.env.WANJUAN_DISABLE_GPU === "1";
const gpuMode = String(process.env.WANJUAN_GPU_MODE || (legacyDisableGpu ? "off" : "stable")).toLowerCase();
if (gpuMode === "off") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("disable-gpu-rasterization");
  app.commandLine.appendSwitch("disable-zero-copy");
  app.commandLine.appendSwitch("disable-accelerated-2d-canvas");
  app.commandLine.appendSwitch("disable-features", "CanvasOopRasterization,VizDisplayCompositor");
} else if (gpuMode === "performance") {
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("force_high_performance_gpu");
} else {
  app.commandLine.appendSwitch("disable-gpu-rasterization");
  app.commandLine.appendSwitch("disable-zero-copy");
  app.commandLine.appendSwitch("disable-features", "CanvasOopRasterization");
}

// 单实例锁：已有实例运行时直接退出。
const gotSingleInstanceLock = app.requestSingleInstanceLock ? app.requestSingleInstanceLock() : true;
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

registerDesktopIpc();

app.whenReady().then(async () => {
  installApplicationMenu();
  const desktopBaseUrl = await createStaticServer();
  setDesktopBaseUrl(desktopBaseUrl);
  appendDesktopLog("test-build-info", {
    name: TEST_BUILD_NAME,
    userData: app.getPath("userData"),
    baseUrl: desktopBaseUrl,
    appVersion: app.getVersion(),
    packageName: "wanjuan-lingjing-desktop-test"
  });
  createMainWindow(desktopBaseUrl);
  scheduleAutomaticUpdateCheck();

  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(desktopBaseUrl);
  });
}).catch((e) => {
  console.error("Failed to start desktop app", e);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
