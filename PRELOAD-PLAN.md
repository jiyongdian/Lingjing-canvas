# preload.cjs 模块化方案

原文件 reference/src/preload.cjs (5771行, 193顶层声明)。执行顺序敏感(顶层有副作用调用)，共享可变状态需留在所属模块内。

## 基础（已建）
- constants.cjs ✅ (30个常量导出，行13-100)
- runtime.cjs (header requires: contextBridge/ipcRenderer/shell/fs/os/path/execFileAsync, PRELOAD_CONTEXT_ISOLATED) — 待建

## 域模块（粗粒度，每个模块自持其 let 状态）
1. storage.cjs (170-348 + perf 108-169)
   - 性能档位: clampPerformanceNumber..persistPerformanceProfile
   - IndexedDB存储层: openDesktopStorageDb..removeDesktopStorageItems
   - 自持 state: storageDbPromise, legacyStorageMigrationPromise
   - **导出 resetStorageDbPromise()** 供 legacy-data 模块重置(行2055)
2. project-safety.cjs (349-1267)
   - 快照/备份/隔离/阻断提示全族(最大域)
   - 自持 state: projectSafetyDbPromise, canvasStateDbPromise
   - **导出 getter/setter** 给 safety-center 用
3. boot-theme.cjs (1284-2018)
   - 主题镜像 + boot splash(installBootStabilityStyle 570行) + applyInitialThemeClass
4. legacy-data.cjs (2019-2174)
   - 用户数据清理/恢复/legacy迁移决策; 调用 storage.resetStorageDbPromise
5. media-utils.cjs (2175-2487)
   - 下载/文件名/mime/blob/dataUrl + download toast UI
6. chrome-shim.cjs (2488-2704)
   - createChromeShim/installChromeShim + deepFreezeApi/exposeGlobal
   - 自持 state: installedChromeShim
7. fetch-proxy.cjs (2705-3042)
   - fetch稳定性shim + desktop fetch代理 + 队列限流
   - 自持 state: fetchStabilityState(已是const对象)
8. bridge-api.cjs (3057-3305)
   - readDocumentWithAgentBrowser, isSafeExternalUrl, showWanjuanInputDialog
   - exposeGlobal("wanjuanDesktop",{...}) + exposeGlobal("wanjuanProjectSafety",{...}) 这两个副作用块
9. safety-center.cjs (3306-3934)
   - 项目安全中心UI注入
10. desktop-patches.cjs (3935-5771)
   - installDesktopPatches(1838行) + 末尾 DOMContentLoaded 绑定 + Tianji设置面板等
   - 跨域调用: storage(getDesktopStorageItems等), perf(getPerformanceSettings), chrome-shim(installChromeShim), mime(extensionFromMime)

## index.cjs (slim, 严格保持原执行顺序)
require 各模块 → 按原顺序执行副作用:
  行3043 installDesktopFetchProxy(); 3044 installFetchStabilityShim(); 3046 installBootStabilityStyle(); 3047 applyInitialThemeClass(resolveBootThemeMode());
  行3149/3294 的 exposeGlobal 在 bridge-api 模块加载时执行
  行5768-5771: if(window){ installChromeShim(); addEventListener(DOMContentLoaded, installDesktopPatches) }

## 规则
函数体逐字保留。跨模块调用改 require。验证: node --check + 静态unresolved检查 + 真实Electron启动回归(看appReady)。
