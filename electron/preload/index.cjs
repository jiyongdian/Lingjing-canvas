// 万卷灵境 预加载脚本入口（模块化重建版）。
// 在渲染进程加载前注入桌面桥接能力、存储层、主题/启动稳定性、项目安全备份与各类补丁。
//
// 严格保持原 reference/src/preload.cjs 的执行顺序：
//   1) 加载各域模块（纯定义，无对外副作用）
//   2) 安装 fetch 代理与稳定性 shim、上报性能设置、注入启动样式与初始主题
//   3) 异步执行 legacy 数据确认 / 存储恢复 / chrome shim 安装
//   4) 加载 bridge-api（其 exposeGlobal 在此刻对外暴露 wanjuanDesktop / wanjuanProjectSafety）
//   5) DOMContentLoaded 时安装桌面补丁
const { ipcRenderer } = require("./runtime.cjs");

// —— 各域模块（require 即完成函数定义；chrome-shim 等无对外副作用）——
const { getPerformanceSettings } = require("./storage.cjs");
const { installBootStabilityStyle, applyInitialThemeClass, resolveBootThemeMode } = require("./boot-theme.cjs");
const { confirmLegacyUserDataChoice, applyDesktopStorageRecovery } = require("./legacy-data.cjs");
const { installChromeShim } = require("./chrome-shim.cjs");
const { installDesktopFetchProxy, installFetchStabilityShim } = require("./fetch-proxy.cjs");
const { installDesktopPatches } = require("./desktop-patches.cjs");

// —— 启动期副作用（对应原文件行 3043-3055，顺序保持一致）——
installDesktopFetchProxy();
installFetchStabilityShim();
ipcRenderer.invoke("wanjuan:set-performance-settings", getPerformanceSettings()).catch(() => {});
installBootStabilityStyle();
applyInitialThemeClass(resolveBootThemeMode());
(async () => {
  await confirmLegacyUserDataChoice();
  await applyDesktopStorageRecovery();
  installChromeShim();
})().catch((error) => {
  console.warn("desktop bootstrap skipped", error);
  installChromeShim();
});

// —— 暴露主世界桥接 API（对应原文件行 3149 / 3294 的 exposeGlobal）——
// bridge-api 模块在被 require 时立即执行其 exposeGlobal 副作用，
// 必须在上面的启动期副作用之后加载，以匹配原始顺序。
require("./bridge-api.cjs");

// —— DOM 就绪后安装桌面补丁（对应原文件行 5768-5771）——
if (typeof window !== "undefined") {
  installChromeShim();
  window.addEventListener("DOMContentLoaded", installDesktopPatches, { once: true });
}
