import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { writeContentAddressedFile, diagnoseContentStore } = require("../electron/main/assets/content-store.cjs");

const projectId = process.env.WANJUAN_MIGRATION_PROJECT || "proj-1780383471076";
const sourceRoot = process.env.WANJUAN_MIGRATION_SOURCE ||
  path.join(os.homedir(), "Downloads", "万卷灵境", "万卷画布媒体库", projectId);
const targetRoot = process.env.WANJUAN_MIGRATION_TARGET ||
  path.join(os.homedir(), "Downloads", "万卷灵境-存储实验版", "万卷画布媒体库", `${projectId}-migration-test`);
const reportRoot = process.env.WANJUAN_MIGRATION_REPORTS ||
  path.join(process.cwd(), "migration-tests");

function walkFiles(root, results = []) {
  if (!fs.existsSync(root)) return results;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(entryPath, results);
    else if (entry.isFile()) results.push(entryPath);
  }
  return results;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function sourceSnapshot(root) {
  return walkFiles(root).map((filePath) => {
    const stat = fs.statSync(filePath);
    return {
      relativePath: path.relative(root, filePath),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha256: sha256File(filePath)
    };
  }).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function sameSnapshot(before, after) {
  return JSON.stringify(before) === JSON.stringify(after);
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function formatBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit ? 2 : 0)} ${units[unit]}`;
}

if (!fs.existsSync(sourceRoot)) throw new Error(`Source project does not exist: ${sourceRoot}`);
if (path.resolve(targetRoot).startsWith(`${path.resolve(sourceRoot)}${path.sep}`)) {
  throw new Error("Target must not be inside the source project");
}
if (fs.existsSync(targetRoot)) throw new Error(`Target already exists; refusing to overwrite: ${targetRoot}`);

const startedAt = new Date();
const before = sourceSnapshot(sourceRoot);
const sourceBytes = sum(before, "size");
const mappings = [];

fs.mkdirSync(targetRoot, { recursive: true });
for (const item of before) {
  const sourcePath = path.join(sourceRoot, item.relativePath);
  const extension = path.extname(sourcePath);
  const result = await writeContentAddressedFile(targetRoot, fs.readFileSync(sourcePath), extension);
  const targetSha256 = sha256File(result.path);
  if (targetSha256 !== item.sha256) throw new Error(`Hash mismatch after migration: ${item.relativePath}`);
  mappings.push({
    relativePath: item.relativePath,
    sourceSize: item.size,
    sourceSha256: item.sha256,
    targetRelativePath: path.relative(targetRoot, result.path),
    targetSha256,
    deduplicated: result.deduplicated
  });
}

const after = sourceSnapshot(sourceRoot);
const sourceUnchanged = sameSnapshot(before, after);
if (!sourceUnchanged) throw new Error("Source project changed during migration test");

const diagnosis = diagnoseContentStore(targetRoot);
const uniqueTargetPaths = new Set(mappings.map((item) => item.targetRelativePath));
const targetBytes = diagnosis.totalBytes;
const report = {
  version: 1,
  projectId,
  startedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString(),
  sourceRoot,
  targetRoot,
  sourceUnchanged,
  sourceFileCount: before.length,
  sourceBytes,
  uniqueContentCount: uniqueTargetPaths.size,
  targetFileCount: diagnosis.fileCount,
  targetBytes,
  reducedBytes: sourceBytes - targetBytes,
  reducedRatio: sourceBytes ? (sourceBytes - targetBytes) / sourceBytes : 0,
  targetDuplicateFileCount: diagnosis.duplicateFileCount,
  allMappingsVerified: mappings.every((item) => item.sourceSha256 === item.targetSha256),
  mappings
};

fs.mkdirSync(reportRoot, { recursive: true });
const stamp = report.completedAt.replace(/[:.]/g, "-");
const reportPath = path.join(reportRoot, `${projectId}-${stamp}.json`);
const manifestPath = path.join(targetRoot, "migration-manifest.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
fs.writeFileSync(manifestPath, JSON.stringify({ ...report, sourceRoot: undefined, targetRoot: undefined }, null, 2));

console.log(JSON.stringify({
  reportPath,
  manifestPath,
  projectId,
  sourceUnchanged,
  allMappingsVerified: report.allMappingsVerified,
  sourceFileCount: report.sourceFileCount,
  uniqueContentCount: report.uniqueContentCount,
  sourceBytes: report.sourceBytes,
  targetBytes: report.targetBytes,
  reducedBytes: report.reducedBytes,
  reducedRatio: report.reducedRatio,
  readable: {
    source: formatBytes(report.sourceBytes),
    target: formatBytes(report.targetBytes),
    reduced: formatBytes(report.reducedBytes)
  }
}, null, 2));
