const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "wanjuan-storage-electron-"));
app.setPath("userData", path.join(root, "user-data"));

app.whenReady().then(async () => {
  const { persistProjectAsset, diagnoseProjectAssets } = require("../electron/main/assets/project-assets.cjs");
  const payload = {
    arrayBuffer: Buffer.alloc(4096, 7),
    mime: "video/mp4",
    filename: "result.mp4",
    directory: root,
    projectId: "project-a",
    nodeId: "node-a",
    field: "videoUrl",
    kind: "video"
  };

  const first = await persistProjectAsset(payload);
  const second = await persistProjectAsset({ ...payload, nodeId: "node-b" });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.localPath, second.localPath);
  assert.equal(first.created, undefined);
  assert.equal(first.contentAddressed, true);
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(fs.readFileSync(first.localPath).length, 4096);

  const report = diagnoseProjectAssets({ directory: root });
  assert.equal(report.ok, true);
  assert.equal(report.fileCount, 1);
  assert.equal(report.duplicateFileCount, 0);

  console.log("storage lab electron integration passed");
}).then(() => {
  fs.rmSync(root, { recursive: true, force: true });
  app.quit();
}).catch((error) => {
  console.error(error);
  fs.rmSync(root, { recursive: true, force: true });
  app.exit(1);
});
