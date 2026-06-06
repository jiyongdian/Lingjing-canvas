const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const projectId = process.env.WANJUAN_MIGRATION_PROJECT || "proj-1780383471076";
const targetRoot = process.env.WANJUAN_MIGRATION_TARGET ||
  path.join(os.tmpdir(), "wanjuan-storage-migration-tests", `${projectId}-migration-test`);
const manifestPath = path.join(targetRoot, "migration-manifest.json");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wanjuan-migrated-project-electron-"));

app.setPath("userData", path.join(tempRoot, "user-data"));

app.whenReady().then(async () => {
  assert.equal(fs.existsSync(manifestPath), true, "migration manifest missing");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const paths = [...new Set(manifest.mappings.map((item) => path.join(targetRoot, item.targetRelativePath)))];
  const { checkProjectAssets } = require("../electron/main/assets/project-assets.cjs");
  const checked = await checkProjectAssets({ paths: [...paths, path.join(targetRoot, "missing-file.mp4")] });

  assert.equal(checked.ok, true);
  assert.equal(checked.assets.slice(0, -1).every((asset) => asset.exists && asset.size > 0), true);
  assert.equal(checked.assets.at(-1).exists, false);

  const videoPath = paths.find((filePath) => filePath.endsWith(".mp4"));
  const audioPath = paths.find((filePath) => filePath.endsWith(".mp3"));
  assert.ok(videoPath, "migrated video missing");
  assert.ok(audioPath, "migrated audio missing");

  console.log(JSON.stringify({
    checkedUniqueFiles: paths.length,
    missingFileDetected: checked.assets.at(-1).exists === false,
    videoPath,
    audioPath
  }, null, 2));
}).then(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  app.quit();
}).catch((error) => {
  console.error(error);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  app.exit(1);
});
