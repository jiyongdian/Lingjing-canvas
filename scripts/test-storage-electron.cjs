const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "wanjuan-storage-electron-"));
app.setPath("userData", path.join(root, "user-data"));

app.whenReady().then(async () => {
  const {
    persistProjectAsset,
    diagnoseProjectAssets,
    copyExternalProjectAssetFiles
  } = require("../electron/main/assets/project-assets.cjs");
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
  const rehomed = await persistProjectAsset({
    localPath: first.localPath,
    mime: "video/mp4",
    filename: "rehomed.mp4",
    directory: root,
    projectId: "project-b",
    nodeId: "node-c",
    field: "videoUrl",
    kind: "video",
    forceArchiveExistingFile: true
  });
  assert.equal(rehomed.ok, true);
  assert.equal(rehomed.archivedFromExistingFile, true);
  assert.equal(rehomed.localPath.includes(`${path.sep}project-b${path.sep}blobs${path.sep}`), true);
  assert.equal(fs.readFileSync(rehomed.localPath).length, 4096);

  const report = diagnoseProjectAssets({ directory: root });
  assert.equal(report.ok, true);
  assert.equal(report.fileCount, 2);
  assert.equal(report.duplicateFileCount, 1);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const image = await persistProjectAsset({
    arrayBuffer: png,
    mime: "image/png",
    filename: "result.png",
    directory: root,
    projectId: "project-a",
    nodeId: "image-node",
    field: "imageUrl",
    kind: "image"
  });
  assert.equal(image.ok, true);
  assert.equal(image.valueFormat, "file-url");
  assert.equal(image.value, undefined);
  assert.equal(image.localPath.endsWith(".png"), true);

  const backupTarget = path.join(root, "backup.json");
  const bundle = copyExternalProjectAssetFiles(backupTarget, [
    { projectId: "project-a", nodeId: "image-a", field: "imageUrl", assetId: "asset-a", kind: "image", mime: "image/png", path: image.localPath },
    { projectId: "project-a", nodeId: "image-b", field: "imageUrl", assetId: "asset-b", kind: "image", mime: "image/png", path: image.localPath }
  ], "backup-assets");
  assert.equal(bundle.manifest.files.length, 2);
  assert.equal(bundle.manifest.physicalFileCount, 1);
  assert.equal(bundle.manifest.files[0].filename, bundle.manifest.files[1].filename);
  assert.equal(bundle.manifest.files[1].deduplicated, true);
  assert.equal(fs.readdirSync(bundle.folderPath).filter((name) => name !== "wanjuan-external-assets-manifest.json").length, 1);

  console.log("storage lab electron integration passed");
}).then(() => {
  fs.rmSync(root, { recursive: true, force: true });
  app.quit();
}).catch((error) => {
  console.error(error);
  fs.rmSync(root, { recursive: true, force: true });
  app.exit(1);
});
