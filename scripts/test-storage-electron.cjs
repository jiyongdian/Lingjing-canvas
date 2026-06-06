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
  const {
    beginProjectMigration,
    getProjectMigration,
    listIncompleteMigrations,
    saveProjectMigrationSnapshot,
    loadProjectMigrationSnapshot,
    cancelProjectMigration,
    commitProjectMigration,
    rollbackProjectMigration,
    cleanupUnreferencedBlobs,
    syncProjectReferences
  } = require("../electron/main/assets/migration-manager.cjs");
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
  assert.equal(rehomed.localPath.includes(`${path.sep}_blobs${path.sep}blobs${path.sep}`), true);
  assert.equal(fs.readFileSync(rehomed.localPath).length, 4096);
  assert.equal(rehomed.localPath, first.localPath);

  const report = diagnoseProjectAssets({ directory: root });
  assert.equal(report.ok, true);
  assert.equal(report.fileCount, 1);
  assert.equal(report.duplicateFileCount, 0);

  const migration = beginProjectMigration({ directory: root, projectId: "migration-project", total: 2 });
  assert.equal(migration.ok, true);
  assert.equal(beginProjectMigration({ directory: root, projectId: "migration-project" }).error, "PROJECT_MIGRATION_LOCKED");
  const migrated = await persistProjectAsset({
    ...payload,
    directory: root,
    projectId: "migration-project",
    migrationId: migration.migrationId
  });
  assert.equal(migrated.ok, true);
  assert.equal(saveProjectMigrationSnapshot({
    migrationId: migration.migrationId,
    projectId: "migration-project",
    state: { nodes: [{ id: "before" }] }
  }).ok, true);
  assert.deepEqual(loadProjectMigrationSnapshot({ migrationId: migration.migrationId }).state.nodes, [{ id: "before" }]);
  assert.equal(getProjectMigration({ migrationId: migration.migrationId }).session.progress.completed, 1);
  const failedCommit = commitProjectMigration({
    migrationId: migration.migrationId,
    references: [path.join(root, "missing.mp4")]
  });
  assert.equal(failedCommit.error, "MIGRATION_REFERENCE_MISSING");
  const outsidePath = path.join(root, "outside.mp4");
  fs.writeFileSync(outsidePath, Buffer.alloc(1));
  const outsideCommit = commitProjectMigration({
    migrationId: migration.migrationId,
    references: [outsidePath],
    requireGlobalBlobs: true
  });
  assert.equal(outsideCommit.error, "MIGRATION_REFERENCE_OUTSIDE_BLOB_STORE");
  assert.equal(rollbackProjectMigration({ migrationId: migration.migrationId, error: "injected" }).ok, true);

  const cancelled = beginProjectMigration({ directory: root, projectId: "cancelled-project" });
  assert.equal(cancelProjectMigration({ migrationId: cancelled.migrationId }).ok, true);
  await assert.rejects(
    () => persistProjectAsset({ ...payload, directory: root, projectId: "cancelled-project", migrationId: cancelled.migrationId }),
    /MIGRATION_CANCELLED/
  );

  const committed = beginProjectMigration({ directory: root, projectId: "committed-project" });
  assert.equal(commitProjectMigration({
    migrationId: committed.migrationId,
    references: [first.localPath],
    requireGlobalBlobs: true
  }).ok, true);
  const cleanupPreview = cleanupUnreferencedBlobs({ directory: root });
  assert.equal(cleanupPreview.ok, true);
  assert.equal(cleanupPreview.dryRun, true);
  const blockedCleanup = cleanupUnreferencedBlobs({ directory: root, confirm: true });
  assert.equal(blockedCleanup.error, "REFERENCE_INDEX_INCOMPLETE");
  const interrupted = beginProjectMigration({ directory: root, projectId: "interrupted-project" });
  assert.equal(saveProjectMigrationSnapshot({
    migrationId: interrupted.migrationId,
    projectId: "interrupted-project",
    state: { nodes: [] }
  }).ok, true);
  const managerPath = require.resolve("../electron/main/assets/migration-manager.cjs");
  delete require.cache[managerPath];
  const restartedManager = require("../electron/main/assets/migration-manager.cjs");
  assert.equal(restartedManager.listIncompleteMigrations({ directory: root }).migrations.some((entry) => entry.id === interrupted.migrationId), true);
  assert.deepEqual(
    restartedManager.loadProjectMigrationSnapshot({ migrationId: interrupted.migrationId }).state,
    { nodes: [] }
  );
  assert.equal(restartedManager.rollbackProjectMigration({
    directory: root,
    migrationId: interrupted.migrationId
  }).ok, true);

  assert.equal(syncProjectReferences({
    directory: root,
    projectId: "referenced-project",
    references: [first.localPath],
    complete: true
  }).ok, true);
  const orphanPath = path.join(path.dirname(first.localPath), "orphan.mp4");
  fs.writeFileSync(orphanPath, Buffer.alloc(3, 9));
  const cleanup = cleanupUnreferencedBlobs({
    directory: root,
    confirm: true,
    referenceIndexComplete: true
  });
  assert.equal(cleanup.ok, true);
  assert.equal(fs.existsSync(first.localPath), true);
  assert.equal(fs.existsSync(orphanPath), false);

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
