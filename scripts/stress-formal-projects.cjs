const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const userData = process.env.WANJUAN_TEST_USER_DATA_PATH;
const migratedMedia = process.env.WANJUAN_MIGRATION_TARGET;
const resultPath = process.env.WANJUAN_STRESS_RESULT;
const mode = process.env.WANJUAN_STRESS_MODE || "migrate";
const selectedIds = new Set(String(process.env.WANJUAN_STRESS_PROJECTS || "").split(",").filter(Boolean));
const sourceMediaRoot = path.join(process.env.HOME, "Downloads", "万卷灵境", "万卷画布媒体库");

if (!userData || !migratedMedia || !resultPath) {
  throw new Error("Missing stress-test paths");
}

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
  throw new Error("Timed out waiting for stress-test window");
}

app.whenReady().then(async () => {
  const win = await waitForWindow();
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const chromeState = await new Promise((resolve) =>
        chrome.storage.local.get(["projects", "lastOpenedProjectId"], resolve)
      );
      const selected = new Set(${JSON.stringify([...selectedIds])});
      const migratedRoot = ${JSON.stringify(migratedMedia)};
      const projects = [];
      for (const project of chromeState.projects || []) {
        if (selected.size && !selected.has(project.id)) continue;
        if (${JSON.stringify(mode)} === "inventory") {
          projects.push({
            projectId: project.id,
            name: project.name,
            storageStatus: project.storageStatus || "unoptimized"
          });
          continue;
        }
        const beforeHeap = performance.memory?.usedJSHeapSize || 0;
        const startedAt = performance.now();
        try {
          const migrated = await globalThis.runForcedArchiveMigration(project.id, migratedRoot, {
            currentProjectId: "__stress_test__"
          });
          const elapsedMs = performance.now() - startedAt;
          const afterBytes = JSON.stringify(migrated.state).length;
          const references = migrated.references || [];
          projects.push({
            projectId: project.id,
            name: project.name,
            nodeCount: migrated.state?.nodes?.length || 0,
            edgeCount: migrated.state?.edges?.length || 0,
            afterBytes,
            elapsedMs,
            referenceCount: references.length,
            allGlobal: references.every((entry) => entry.includes("/_blobs/blobs/")),
            missingReferences: (await window.wanjuanDesktop.checkProjectAssets(references)).assets.filter((entry) => !entry.exists).length,
            beforeHeap,
            afterHeap: performance.memory?.usedJSHeapSize || 0,
            status: migrated.session?.status
          });
        } catch (error) {
          projects.push({
            projectId: project.id,
            name: project.name,
            elapsedMs: performance.now() - startedAt,
            error: String(error?.message || error)
          });
        }
      }
      return {
        testedAt: new Date().toISOString(),
        lastOpenedProjectId: chromeState.lastOpenedProjectId,
        projectCount: projects.length,
        projects
      };
    })()
  `, true);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
