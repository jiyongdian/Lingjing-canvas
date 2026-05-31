# main.cjs 模块化方案（电子主进程）

原文件：reference/src/main.cjs (5143 行, 183 个顶层声明)
目标目录：electron/main/

## 分层与模块划分（按依赖顺序，低层无依赖）

### L0 基础设施（无内部依赖，纯函数/常量）
- `config.cjs` — TEST_* 常量、gpu 配置、单实例锁 (行 21-117 的常量部分)
- `logging.cjs` — appendDesktopLog, sanitizeLogPayload, truncateLogValue, formatErrorMessage, summarizeUploadError, isBenignEpipeError (2879-2931, 34-38)
- `utils/mime.cjs` — getMimeType, extensionFromMime, guessMimeFromFilename, sniffImageMime, ensureExtname, assetKindFromMime (118-134, 285-313, 397-463, 657-665)
- `utils/crypto.cjs` — sha256Buffer, sha256File, sha256Hex, hmac, portableValueFromBuffer (493-500, 2983-2989, 501-518)
- `utils/paths.cjs` — sanitizeFilename, sanitizePathSegment, defaultDownloadDirectory, resolveWritableDownloadDirectory, mediaLibraryRoot, basenameWithoutExt, localPathFromFileUrl, bufferFromDataUrlValue (276-284, 360-396, 685-689, 648-656, 974-985)

### L1 网络/安全
- `net/security.cjs` — isBlockedNetworkHost, assertPublicHttpUrl, isSafeExternalUrl (314-359)
- `net/static-server.cjs` — createStaticServer (185-275)  ※已含 dev-server 改造
- `net/proxy-fetch.cjs` — proxyHttpRequest 及其族 + desktop proxy 队列/控制器(共享状态) (3537-3874)

### L2 领域功能
- `knowledge.cjs` — normalizeKnowledgeText, extractKnowledgeFileText (135-184)
- `assets/project-assets.cjs` — 项目素材 persist/check/find/export 全族 (529-1202)
- `media/payload.cjs` — bufferFromDownloadPayload, bufferFromMediaPayload, resolveAssetPayload, readLocalFilePayload, normalizeImagePayload (519-547, 464-492, 1203-1353)
- `tools/external-tools.cjs` — python/ffmpeg/qwen-tts/real-esrgan/deface/homebrew 工具链管理 (1354-2520) ※含 realEsrganJobs 共享状态
- `uploaders/anonymous-hosts.cjs` — litterbox/tmpfiles/0x0/transfer.sh/catbox/uguu/filebin + buildMultipartBody/requestTextWithRetries/decodeProxyBody (2521-2846, 2873-2982)
- `uploaders/cloud-storage.cjs` — TOS/Qiniu S3 签名与上传 (2987-3536)
- `uploaders/custom-host.cjs` — uploadToCustomPublicHost, parseKeyValueConfig, getByPath (2847-2872, 2932-2982 的相关部分)

### L3 应用编排（依赖全部下层）
- `ipc.cjs` — registerDesktopIpc + IPC 信任校验 (3875-4438)
- `window.cjs` — createMainWindow (4439-5109)
- `index.cjs` — 顶层 require、app.whenReady 引导 (1-33, 93-117, 5110-5143)

## 集成规则（关键）
- 每个模块顶部 require 它需要的下层模块；模块导出具名函数。
- 共享可变状态(realEsrganJobs, desktopProxyFetch*, desktopPerformanceSettings, desktopBaseUrl)封装在对应模块内,通过 getter/setter 或直接导出 Map 实例共享。
- electron 对象(app/BrowserWindow 等)由 index.cjs 顶层解构后,通过参数或一个 `electron-refs.cjs` 共享。
- 行为零改动：函数体逐字保留,只改 require/export 包装。
- 验证：每加一组模块 → `node --check` 全部 .cjs → 启动冒烟测试确认 appReady。
