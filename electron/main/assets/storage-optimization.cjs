const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { defaultDownloadDirectory, mediaLibraryRoot, sanitizePathSegment } = require("../utils/paths.cjs");

let maintenanceLock = "";

function assertStorageWriteAllowed() {
  if (maintenanceLock) throw new Error(`STORAGE_MAINTENANCE_BUSY:${maintenanceLock}`);
}

function isStorageMaintenanceActive() {
  return Boolean(maintenanceLock);
}

function atomicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

function roots(directory) {
  const library = mediaLibraryRoot(directory || defaultDownloadDirectory());
  return {
    directory: directory || defaultDownloadDirectory(),
    library,
    blobs: path.join(library, "_blobs", "blobs"),
    projects: path.join(library, "_projects"),
    trash: path.join(library, "_trash"),
    referenceIndex: path.join(library, "_reference-index.json")
  };
}

function walkFiles(root, results = []) {
  if (!root || !fs.existsSync(root)) return results;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(entryPath, results);
    else if (entry.isFile() && !entry.name.startsWith(".")) results.push(entryPath);
  }
  return results;
}

function fileSummary(filePath) {
  const stat = fs.statSync(filePath);
  return { path: path.resolve(filePath), size: stat.size, readable: true };
}

function readReferenceIndex(directory) {
  const target = roots(directory).referenceIndex;
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    return null;
  }
}

function rebuildReferenceIndex(payload = {}) {
  if (maintenanceLock) return { ok: false, error: "STORAGE_MAINTENANCE_BUSY", operation: maintenanceLock };
  maintenanceLock = "index";
  try {
    const location = roots(payload.directory);
    const projects = Array.isArray(payload.projects) ? payload.projects : [];
    const normalizedProjects = [];
    const references = new Set();
    const issues = [];
    for (const project of projects) {
      const projectId = sanitizePathSegment(project?.projectId || "default", "default");
      const projectReferences = [...new Set((project?.references || []).filter(Boolean).map((item) => path.resolve(item)))].sort();
      const missing = [];
      for (const filePath of projectReferences) {
        try {
          fs.accessSync(filePath, fs.constants.R_OK);
          references.add(filePath);
        } catch {
          missing.push(filePath);
        }
      }
      const complete = project?.complete === true && missing.length === 0;
      if (!complete) issues.push({ projectId, missing, reason: project?.complete === true ? "REFERENCE_MISSING" : "PROJECT_INDEX_INCOMPLETE" });
      normalizedProjects.push({ projectId, complete, referenceCount: projectReferences.length, missing });
    }
    const index = {
      version: 1,
      builtAt: new Date().toISOString(),
      directory: location.directory,
      complete: projects.length > 0 && issues.length === 0,
      projectCount: projects.length,
      projects: normalizedProjects,
      references: [...references].sort(),
      issues
    };
    atomicJson(location.referenceIndex, index);
    restoreReferencedTrash({ directory: location.directory, references: index.references });
    return { ok: true, index };
  } finally {
    maintenanceLock = "";
  }
}

function scanReclaimable(payload = {}) {
  const location = roots(payload.directory);
  const index = readReferenceIndex(location.directory);
  if (!index?.complete) {
    return { ok: false, error: "REFERENCE_INDEX_INCOMPLETE", index: index || null, candidates: [], candidateCount: 0, candidateBytes: 0 };
  }
  const referenced = new Set((index.references || []).map((item) => path.resolve(item)));
  const candidates = walkFiles(location.blobs)
    .map(fileSummary)
    .filter((item) => !referenced.has(item.path));
  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    indexBuiltAt: index.builtAt,
    candidateCount: candidates.length,
    candidateBytes: candidates.reduce((sum, item) => sum + item.size, 0),
    candidates
  };
}

function moveUnreferencedToTrash(payload = {}) {
  if (maintenanceLock) return { ok: false, error: "STORAGE_MAINTENANCE_BUSY", operation: maintenanceLock };
  maintenanceLock = "cleanup";
  try {
    const scan = scanReclaimable(payload);
    if (!scan.ok) return scan;
    if (payload.confirm !== true) return { ...scan, dryRun: true };
    const location = roots(payload.directory);
    const cleanupId = `cleanup-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const cleanupRoot = path.join(location.trash, cleanupId);
    const entries = [];
    for (const candidate of scan.candidates) {
      const relative = path.relative(location.blobs, candidate.path);
      const target = path.join(cleanupRoot, "files", relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(candidate.path, target);
      entries.push({
        originalPath: candidate.path,
        trashPath: target,
        size: candidate.size,
        hash: path.basename(candidate.path).split(".")[0],
        deletedAt: new Date().toISOString()
      });
    }
    const manifest = { version: 1, cleanupId, createdAt: new Date().toISOString(), entries };
    atomicJson(path.join(cleanupRoot, "manifest.json"), manifest);
    return { ok: true, cleanupId, movedCount: entries.length, movedBytes: entries.reduce((sum, item) => sum + item.size, 0), manifest };
  } finally {
    maintenanceLock = "";
  }
}

function listTrash(payload = {}) {
  const location = roots(payload.directory);
  const cleanups = [];
  if (fs.existsSync(location.trash)) {
    for (const name of fs.readdirSync(location.trash)) {
      try {
        cleanups.push(JSON.parse(fs.readFileSync(path.join(location.trash, name, "manifest.json"), "utf8")));
      } catch {}
    }
  }
  return {
    ok: true,
    cleanups: cleanups.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    totalFiles: cleanups.reduce((sum, item) => sum + (item.entries?.length || 0), 0),
    totalBytes: cleanups.reduce((sum, item) => sum + (item.entries || []).reduce((entrySum, entry) => entrySum + Number(entry.size || 0), 0), 0)
  };
}

function restoreTrash(payload = {}) {
  const location = roots(payload.directory);
  const selected = new Set(Array.isArray(payload.paths) ? payload.paths.map((item) => path.resolve(item)) : []);
  let restoredCount = 0;
  for (const cleanup of listTrash(payload).cleanups) {
    let changed = false;
    cleanup.entries = (cleanup.entries || []).filter((entry) => {
      if (selected.size && !selected.has(path.resolve(entry.originalPath))) return true;
      if (!fs.existsSync(entry.trashPath)) return false;
      fs.mkdirSync(path.dirname(entry.originalPath), { recursive: true });
      if (!fs.existsSync(entry.originalPath)) fs.renameSync(entry.trashPath, entry.originalPath);
      else fs.rmSync(entry.trashPath, { force: true });
      restoredCount += 1;
      changed = true;
      return false;
    });
    const cleanupRoot = path.join(location.trash, cleanup.cleanupId);
    if (!cleanup.entries.length) fs.rmSync(cleanupRoot, { recursive: true, force: true });
    else if (changed) atomicJson(path.join(cleanupRoot, "manifest.json"), cleanup);
  }
  return { ok: true, restoredCount };
}

function restoreReferencedTrash(payload = {}) {
  const references = new Set((payload.references || []).map((item) => path.resolve(item)));
  if (!references.size) return { ok: true, restoredCount: 0 };
  return restoreTrash({ directory: payload.directory, paths: [...references] });
}

function purgeTrash(payload = {}) {
  const location = roots(payload.directory);
  const cutoff = Date.now() - Math.max(0, Number(payload.olderThanDays ?? 30)) * 86400000;
  let purgedCleanups = 0;
  let purgedFiles = 0;
  for (const cleanup of listTrash(payload).cleanups) {
    if (payload.confirm !== true) continue;
    if (payload.force !== true && Date.parse(cleanup.createdAt || 0) > cutoff) continue;
    purgedFiles += cleanup.entries?.length || 0;
    fs.rmSync(path.join(location.trash, cleanup.cleanupId), { recursive: true, force: true });
    purgedCleanups += 1;
  }
  return { ok: true, dryRun: payload.confirm !== true, purgedCleanups, purgedFiles };
}

function getStorageOptimizationStatus(payload = {}) {
  const location = roots(payload.directory);
  let writable = false;
  let accessError = "";
  try {
    fs.mkdirSync(location.library, { recursive: true });
    fs.accessSync(location.library, fs.constants.R_OK | fs.constants.W_OK);
    writable = true;
  } catch (error) {
    accessError = String(error?.message || error);
  }
  const blobFiles = walkFiles(location.blobs).map(fileSummary);
  const trash = listTrash(payload);
  const index = readReferenceIndex(location.directory);
  let freeBytes = null;
  try {
    freeBytes = fs.statfsSync(location.directory).bavail * fs.statfsSync(location.directory).bsize;
  } catch {}
  return {
    ok: true,
    directory: location.directory,
    libraryPath: location.library,
    blobCount: blobFiles.length,
    blobBytes: blobFiles.reduce((sum, item) => sum + item.size, 0),
    trashFiles: trash.totalFiles,
    trashBytes: trash.totalBytes,
    referenceIndex: index,
    referenceIndexComplete: index?.complete === true,
    maintenanceOperation: maintenanceLock || null,
    freeBytes,
    writable,
    accessError
  };
}

module.exports = {
  assertStorageWriteAllowed,
  isStorageMaintenanceActive,
  rebuildReferenceIndex,
  scanReclaimable,
  moveUnreferencedToTrash,
  listTrash,
  restoreTrash,
  restoreReferencedTrash,
  purgeTrash,
  getStorageOptimizationStatus
};
