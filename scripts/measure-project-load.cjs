const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const userData = process.env.WANJUAN_TEST_USER_DATA_PATH;
const projectId = process.env.WANJUAN_STRESS_PROJECTS;
const resultPath = process.env.WANJUAN_STRESS_RESULT;
if (!userData || !projectId || !resultPath) throw new Error("Missing load measurement settings");

process.env.WANJUAN_TEST_USER_DATA_PATH = userData;
process.env.WANJUAN_DESKTOP_PORT ||= "54134";
process.env.WANJUAN_ALLOW_RANDOM_PORT = "0";

const { app, BrowserWindow } = require("electron");
require("../electron/main/index.cjs");

async function waitForWindow() {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.webContents.isLoading()) return win;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for load measurement window");
}

async function waitForProject(win) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const state = await win.webContents.executeJavaScript(`({
      projectId: globalThis.__wanjuanCurrentProjectId,
      loading: document.body.innerText.includes("项目加载中...")
    })`, true);
    if (state.projectId === projectId && !state.loading) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for project render");
}

app.whenReady().then(async () => {
  const win = await waitForWindow();
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => chrome.storage.local.set(
      { lastOpenedProjectId: ${JSON.stringify(projectId)} },
      () => { localStorage.setItem("lastOpenedProjectId", ${JSON.stringify(projectId)}); resolve(true); }
    ))
  `, true);
  const startedAt = performance.now();
  win.webContents.reloadIgnoringCache();
  await new Promise((resolve) => win.webContents.once("did-finish-load", resolve));
  await waitForProject(win);
  const renderedAt = performance.now();
  const metrics = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      let frames = 0;
      const started = performance.now();
      const sample = () => {
        frames += 1;
        if (performance.now() - started >= 3000) {
          resolve({
            frames,
            fps: frames / ((performance.now() - started) / 1000),
            heap: performance.memory?.usedJSHeapSize || 0,
            nodeCount: document.querySelectorAll(".react-flow__node").length,
            edgeCount: document.querySelectorAll(".react-flow__edge").length,
            imageCount: document.querySelectorAll("img").length,
            videoCount: document.querySelectorAll("video").length,
            audioCount: document.querySelectorAll("audio").length
          });
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    })
  `, true);
  const result = {
    measuredAt: new Date().toISOString(),
    projectId,
    loadMs: renderedAt - startedAt,
    ...metrics
  };
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
