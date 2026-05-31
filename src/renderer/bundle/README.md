# src/renderer/bundle/ 说明

本目录是从原应用产物迁入的前端代码，已完成反混淆（去 rolldown 打包外壳、React API 还原可读名、
约 5800 处局部变量语义化重命名）。其中 `index.js` 是**自有业务源码**（万卷灵境的 React Flow 画布应用），
`vendor.js` 与 `rolldown-runtime.js` 是**第三方开源库的打包副本**，列示如下，便于区分软著边界。

## index.js（自有源码）

万卷灵境前端主体，约 4.7 万行。已反混淆为可读 React 代码：组件、hooks、JSX、业务逻辑、
中文文案均清晰可读。它从 `vendor.js` 导入第三方库能力（见下），从 `rolldown-runtime.js` 取
CommonJS 互操作辅助函数。

## vendor.js（第三方开源库打包副本）

由原应用构建时把以下 7 个开源库打包而成（均为 MIT / 类似宽松许可）。
对应的真实 npm 依赖已列入工程根 `package.json`，版本对照：

| 库 | vendor 内版本 | package.json | 用途 |
|----|--------------|--------------|------|
| react | 19.2.4 | ^19.2.6 | UI 框架 |
| react-dom | 19.2.4 | ^19.2.6 | DOM 渲染 |
| @xyflow/react (React Flow) | 12.x | ^12.10.2 | 节点画布 |
| zustand | 5.x | ^5.0.14 | 状态管理（React Flow 依赖） |
| lucide-react | — | ^1.17.0 | 图标 |
| localforage | 1.x | ^1.10.0 | IndexedDB 存储封装 |
| dagre | 0.8.x | ^0.8.5 | 图自动布局 |

另有 `public/gsap.min.js`（GSAP ^3.15.0，动画库）作为独立脚本加载。

## rolldown-runtime.js（构建工具运行时）

Rolldown（Vite 的打包器）生成的 CommonJS↔ESM 互操作辅助代码，约 30 行。属构建工具产物。

## 为什么保留打包副本而非直接用 npm 包

`vendor.js` 自包含了一份 React 实例，`index.js` 全程使用这一份，运行稳定。
若改为从 npm 直接 import，需把 vendor 的 77 个压缩别名逐一映射回真实导出，其中 18 个
React Flow / zustand 的 hook 因函数名被压缩而无法 100% 确定映射，**误判会导致画布功能静默损坏
且难以排查**。为遵守「不破坏功能」的前提，保留打包副本是当前最稳妥的选择。
真实 npm 依赖已就绪，后续若需要可在充分回归测试下逐步切换。

## 软著申报建议

- `index.js`：反混淆后的自有业务源码（可读、可维护、可编译）。
- `vendor.js` / `rolldown-runtime.js` / `public/gsap.min.js`：第三方开源库与构建工具产物，
  应作为「第三方/已构建资源」如实区分，不计入自有源码。
- 著作权权属认定请咨询专业机构，本说明不构成法律意见。
