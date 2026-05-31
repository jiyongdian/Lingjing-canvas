// 渲染进程入口：按原始顺序加载样式，再启动应用主 bundle。
//
// 说明：bundle/index.js 是从原 dist 产物迁入的前端主体（React Flow 画布应用），
// 仍依赖 bundle/vendor.js（react/react-dom/@xyflow/react/zustand/lucide/localforage/dagre 的打包副本）
// 与 bundle/rolldown-runtime.js。后续反混淆会逐步把 index.js 拆成可读模块，
// 并将 vendor 依赖切换为 package.json 中的真实 npm 包。
import "./styles/reactflow.css";
import "./styles/app.css";
import "./styles/canvas-controls-polish.css";
import "./styles/theme-controls-final.css";
import "./bundle/index.js";
