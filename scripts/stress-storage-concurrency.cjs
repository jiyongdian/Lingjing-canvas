const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const directory = process.env.WANJUAN_MIGRATION_TARGET;
const resultPath = process.env.WANJUAN_STRESS_RESULT;
if (!directory || !resultPath) throw new Error("WANJUAN_MIGRATION_TARGET and WANJUAN_STRESS_RESULT are required");

app.whenReady().then(async () => {
  const {
    beginProjectMigration,
    rollbackProjectMigration,
    cleanupUnreferencedBlobs,
    syncProjectReferences
  } = require("../electron/main/assets/migration-manager.cjs");
  const { persistProjectAsset, checkProjectAssets } = require("../electron/main/assets/project-assets.cjs");
  const { rebuildReferenceIndex } = require("../electron/main/assets/storage-optimization.cjs");

  const lock = beginProjectMigration({ directory, projectId: "concurrency-lock-project" });
  const rejectedLock = beginProjectMigration({ directory, projectId: "concurrency-lock-project" });
  assert.equal(rejectedLock.error, "PROJECT_MIGRATION_LOCKED");
  rollbackProjectMigration({ migrationId: lock.migrationId });

  const payloads = Array.from({ length: 8 }, (_, index) => Buffer.alloc(1024 * 1024, index + 1));
  const startedAt = Date.now();
  const writes = await Promise.all(
    Array.from({ length: 240 }, (_, index) =>
      persistProjectAsset({
        directory,
        projectId: `concurrency-project-${index % 24}`,
        nodeId: `node-${index}`,
        field: "imageUrl",
        kind: "image",
        mime: "image/png",
        filename: `stress-${index}.png`,
        arrayBuffer: payloads[index % payloads.length],
        storageOptimizationEnabled: true
      })
    )
  );
  const paths = [...new Set(writes.map((entry) => entry.localPath))];
  assert.equal(paths.length, payloads.length);
  assert.equal(writes.every((entry) => entry.ok && fs.existsSync(entry.localPath)), true);
  for (let project = 0; project < 24; project += 1) {
    const references = [...new Set(writes.filter((_, index) => index % 24 === project).map((entry) => entry.localPath))];
    assert.equal(syncProjectReferences({
      directory,
      projectId: `concurrency-project-${project}`,
      references,
      complete: true
    }).ok, true);
  }

  rebuildReferenceIndex({
    directory,
    projects: Array.from({ length: 24 }, (_, project) => ({
      projectId: `concurrency-project-${project}`,
      complete: true,
      references: [...new Set(writes.filter((_, index) => index % 24 === project).map((entry) => entry.localPath))]
    }))
  });
  const preview = cleanupUnreferencedBlobs({ directory });
  const cleanup = cleanupUnreferencedBlobs({ directory, confirm: true });
  const checked = await checkProjectAssets({ paths });
  assert.equal(checked.assets.every((entry) => entry.exists), true);

  const result = {
    completedAt: new Date().toISOString(),
    writeCount: writes.length,
    uniquePayloadCount: payloads.length,
    uniqueBlobCount: paths.length,
    deduplicatedWrites: writes.filter((entry) => entry.deduplicated).length,
    elapsedMs: Date.now() - startedAt,
    lockRejected: rejectedLock.error,
    cleanupPreviewCandidates: preview.candidateCount,
    cleanupPreviewBytes: preview.candidateBytes,
    cleanupRemovedCandidates: cleanup.candidateCount,
    referencedFilesRemaining: checked.assets.filter((entry) => entry.exists).length
  };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
