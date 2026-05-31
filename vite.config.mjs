import { defineConfig } from "vite";
import { resolve } from "node:path";

// 万卷灵境 前端构建配置。
// root 指向 src/renderer（含 index.html 入口），产物输出到工程根的 dist/。
// 当前阶段：前端主体仍是从原产物迁入的 bundle（src/renderer/bundle/），
// 反混淆推进时会逐步替换为可读模块。
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "chrome120",
    assetsInlineLimit: 0,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "src/renderer/index.html"),
    },
  },
});
