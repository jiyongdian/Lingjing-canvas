# 万卷灵境 — 可维护源码工程

本工程由原 macOS 应用 `万卷灵境.app`（Electron 打包产物）逆向重建而来，目标是得到一份
**功能正常、可后期维护升级、结构清晰** 的源码。

## 目录结构

```
wanjuan-source/
├── electron/                 # Electron 桌面外壳（完整模块化源码，逐字保真）
│   ├── main/                 #   主进程：21 个模块
│   │   ├── index.cjs         #     引导入口
│   │   ├── config / logging / runtime-state / electron-refs / self-test
│   │   ├── ipc.cjs           #     26 个 IPC 通道注册
│   │   ├── window.cjs        #     主窗口创建
│   │   ├── utils/            #     mime / crypto / paths
│   │   ├── net/              #     security / proxy-fetch / static-server
│   │   ├── media/payload.cjs #     媒体载荷处理
│   │   ├── assets/           #     项目素材管理
│   │   ├── tools/            #     外部工具链（ffmpeg/python/real-esrgan/...）
│   │   └── uploaders/        #     匿名图床 / TOS / 七牛 / 自定义
│   └── preload/              #   预加载：13 个模块
│       ├── index.cjs         #     入口（严格保持原执行顺序）
│       ├── storage / project-safety / boot-theme / legacy-data
│       ├── media-utils / chrome-shim / fetch-proxy
│       ├── safety-center / desktop-patches / bridge-api
│       └── runtime / constants
├── src/renderer/             # 前端（React + React Flow）
│   └── lib/                  #   反混淆出的可读业务工具库（见下）
├── dist/                     # 前端构建产物（见「关于前端」）
├── reference/                # 原始产物原样保留，作对照基准（不参与构建）
├── scripts/dev.mjs           # 开发启动脚本（先起 Vite 再起 Electron）
├── vite.config.ts            # 前端构建配置
└── package.json              # 真实 npm 依赖
```

## 技术栈

- Electron 37.10.3
- React 19 + React Flow（@xyflow/react）+ zustand + lucide-react + GSAP
- Vite 6 + TypeScript 5

## 关于各部分的来源与可读性

| 部分 | 状态 |
|------|------|
| `electron/main`、`electron/preload` | **完整可读源码**。原 `main.cjs`(5143行)、`preload.cjs`(5771行) 本就是未混淆代码，已按功能拆分为模块（主进程 21 个、预加载 13 个），函数体逐字保真，并通过真实启动回归验证（应用正常渲染、IPC/桥接全部就绪）。 |
| `src/renderer/lib` | **反混淆的可读业务源码**。从前端 bundle 提取出 56 个 `wanjuan*` 工具函数，对局部变量做了语义化重命名、补充类型与中文注释，行为与原实现一致（已做等价性测试）。 |
| `src/renderer/bundle/index.js` | **反混淆后的前端主体**（React Flow 画布应用）。已完成：去除 rolldown 打包外壳（`(0,q.useState)`→`useState` 等 3390 处）、React/jsx/ReactDOM API 还原为可读名、中型组件内部变量语义化重命名、三个巨型组件（Le/dt/St 共约 4 万行）做语义化变量重命名（4693 处）。单字母局部变量从 1807 降至 344。每一步都经过 AST+字面量等价校验、严格解析与真实启动回归，保证行为不变。仍保留为大文件（未按原始多文件结构拆分，因无 sourcemap），但已是可读、可编译、可维护的源码。 |
| `src/renderer/bundle/vendor.js`、`rolldown-runtime.js` | **第三方库打包副本**（React/ReactDOM/@xyflow/react/zustand/lucide-react/localforage/dagre）。这些是开源库的构建产物；对应的真实 npm 依赖已列入 `package.json`，后续可逐步切换为直接 import。 |

## 反混淆工具（scripts/）

为本工程构建的可复用作用域安全重命名工具链：
- `analyze-bindings.mjs` — 提取代码块的短名局部变量及其作用域/用途上下文
- `apply-rename-map.mjs` — 按重命名映射做作用域安全的标识符替换（处理同名遮蔽、跨作用域冲突，保留原始格式）
- `verify-equiv.mjs` — 校验重命名前后 AST 结构与字面量完全一致（证明行为不变）
- `batch-bindings.mjs` — 按成员分组绑定，便于分批命名
- `test-lib.mjs` — `src/renderer/lib` 工具函数的行为回归测试

## 开发与构建

```bash
npm install          # 安装依赖
npm run build:web    # 用 Vite 把 src/renderer 构建为 dist/
npm start            # 启动 Electron（加载 dist/）
npm run debug        # 带 DevTools 启动
npm run build        # 构建前端 + electron-builder 打包
npm run typecheck    # TypeScript 类型检查
npm run test:lib     # 工具库行为回归测试
```

## 说明

- `reference/` 是原始产物的完整拷贝，仅作对照，不参与构建，可随时比对行为。
- 关于软件著作权：本工程中 `electron/`、`src/renderer/lib/` 与反混淆后的 `src/renderer/bundle/index.js` 为可读源码；
  第三方库（`vendor.js` 等）应作为「第三方/已构建资源」如实区分。著作权登记的
  权属认定请咨询专业机构，本工程不构成法律意见。
