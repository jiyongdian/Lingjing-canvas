const fs = require("node:fs");
const path = require("node:path");

const userData = process.env.WANJUAN_TEST_USER_DATA_PATH;
const mediaDirectory = process.env.WANJUAN_MIGRATION_TARGET;
const projectName = process.env.WANJUAN_MIGRATION_PROJECT_NAME || "migration-test-project";
const requestedProjectId = process.env.WANJUAN_MIGRATION_PROJECT || "proj-1780383471076";

if (!userData || !mediaDirectory) {
  throw new Error("WANJUAN_TEST_USER_DATA_PATH and WANJUAN_MIGRATION_TARGET are required");
}

process.env.WANJUAN_TEST_USER_DATA_PATH = userData;
process.env.WANJUAN_DESKTOP_PORT ||= "54134";
process.env.WANJUAN_ALLOW_RANDOM_PORT = "0";

const { app, BrowserWindow } = require("electron");
require("../electron/main/index.cjs");

async function waitForWindow() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.webContents.isLoading()) return win;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for test window");
}

app.whenReady().then(async () => {
  fs.mkdirSync(mediaDirectory, { recursive: true });
  const win = await waitForWindow();
  const execution = win.webContents.executeJavaScript(`
    (async () => {
      const storage = await new Promise((resolve) =>
        chrome.storage.local.get(["projects", "lastOpenedProjectId"], resolve)
      );
      const project =
        (storage.projects || []).find((entry) => entry.id === ${JSON.stringify(requestedProjectId)}) ||
        (storage.projects || []).find((entry) => entry.name === ${JSON.stringify(projectName)}) ||
        { id: ${JSON.stringify(requestedProjectId)}, name: ${JSON.stringify(projectName)} };
      const migrated = await globalThis.runForcedArchiveMigration(
        project.id,
        ${JSON.stringify(mediaDirectory)},
        { currentProjectId: "__isolated_test_project__" }
      );
      const after = migrated.state;
      return {
        projectId: project.id,
        projectName: project.name,
        afterBytes: JSON.stringify(after || {}).length,
        nodeCount: after?.nodes?.length || 0,
        edgeCount: after?.edges?.length || 0,
        referenceCount: migrated.references.length,
        allGlobal: migrated.references.every((entry) => entry.includes("/_blobs/blobs/")),
        migrationStatus: migrated.session.status
      };
    })()
  `, true);
  const result = await Promise.race([
    execution,
    new Promise((_, reject) => setTimeout(() => reject(new Error("REAL_PROJECT_MIGRATION_TIMEOUT")), 120000))
  ]);
  console.log(JSON.stringify(result, null, 2));
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
