const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("../electron-refs.cjs");
const { defaultDownloadDirectory, mediaLibraryRoot, sanitizePathSegment } = require("../utils/paths.cjs");

const sessions = new Map();
const projectLocks = new Map();

function atomicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

function migrationRoot(directory) {
  return path.join(mediaLibraryRoot(directory || defaultDownloadDirectory()), "_migrations");
}

function manifestRoot(directory) {
  return path.join(mediaLibraryRoot(directory || defaultDownloadDirectory()), "_projects");
}

function registryPath() {
  return path.join(app.getPath("userData"), "project-migration-directories.json");
}

function knownMigrationDirectories() {
  const directories = new Set([defaultDownloadDirectory()]);
  try {
    const saved = JSON.parse(fs.readFileSync(registryPath(), "utf8"));
    for (const directory of saved.directories || []) directories.add(directory);
  } catch {}
  return [...directories];
}

function registerMigrationDirectory(directory) {
  const directories = new Set(knownMigrationDirectories());
  directories.add(directory);
  atomicJson(registryPath(), { version: 1, directories: [...directories].sort() });
}

function sessionPath(session) {
  return path.join(migrationRoot(session.directory), `${session.id}.json`);
}

function snapshotPath(session) {
  return path.join(migrationRoot(session.directory), `${session.id}.snapshot.json`);
}

function projectLockKey(directory, projectId) {
  return `${path.resolve(directory)}\0${projectId}`;
}

function saveSession(session) {
  session.updatedAt = new Date().toISOString();
  sessions.set(session.id, session);
  atomicJson(sessionPath(session), session);
  return session;
}

function beginProjectMigration(payload = {}) {
  const directory = payload.directory || defaultDownloadDirectory();
  const projectId = sanitizePathSegment(payload.projectId || "default", "default");
  const lockKey = projectLockKey(directory, projectId);
  const existing = projectLocks.get(lockKey);
  if (existing) return { ok: false, error: "PROJECT_MIGRATION_LOCKED", migrationId: existing };
  const id = `migration-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const session = {
    id,
    projectId,
    directory,
    status: "preparing",
    startedAt: new Date().toISOString(),
    progress: { completed: 0, total: Number(payload.total || 0), bytes: 0 },
    assets: [],
    lockKey,
    error: ""
  };
  registerMigrationDirectory(directory);
  projectLocks.set(lockKey, id);
  saveSession(session);
  return { ok: true, migrationId: id, session };
}

function saveProjectMigrationSnapshot(payload = {}) {
  const session = assertActiveMigration(payload.migrationId, sanitizePathSegment(payload.projectId || "default", "default"));
  atomicJson(snapshotPath(session), payload.state || {});
  session.snapshotSaved = true;
  saveSession(session);
  return { ok: true, path: snapshotPath(session) };
}

function loadProjectMigrationSnapshot(payload = {}) {
  const session = sessions.get(String(payload.migrationId || ""));
  if (!session) return { ok: false, error: "MIGRATION_NOT_FOUND" };
  const filePath = snapshotPath(session);
  if (!fs.existsSync(filePath)) return { ok: false, error: "MIGRATION_SNAPSHOT_NOT_FOUND" };
  return { ok: true, state: JSON.parse(fs.readFileSync(filePath, "utf8")) };
}

function getProjectMigration(payload = {}) {
  const migrationId = String(payload.migrationId || "");
  let session = sessions.get(migrationId);
  if (!session && payload.directory) {
    const filePath = path.join(migrationRoot(payload.directory), `${migrationId}.json`);
    if (fs.existsSync(filePath)) {
      session = JSON.parse(fs.readFileSync(filePath, "utf8"));
      sessions.set(session.id, session);
    }
  }
  return session ? { ok: true, session } : { ok: false, error: "MIGRATION_NOT_FOUND" };
}

function listIncompleteMigrations(payload = {}) {
  const directories = payload.directory ? [payload.directory] : knownMigrationDirectories();
  const activeStatuses = new Set(["preparing", "archiving", "interrupted", "cancelled"]);
  const incomplete = [];
  for (const directory of directories) {
    const root = migrationRoot(directory);
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      if (!name.endsWith(".json") || name.endsWith(".snapshot.json")) continue;
      try {
        const session = JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
        if (!activeStatuses.has(session.status)) continue;
        const liveSession = sessions.get(session.id);
        if (liveSession && ["preparing", "archiving"].includes(liveSession.status)) continue;
        session.status = "interrupted";
        session.lockKey ||= projectLockKey(session.directory || directory, session.projectId);
        session.snapshotAvailable = fs.existsSync(snapshotPath(session));
        saveSession(session);
        projectLocks.set(session.lockKey, session.id);
        incomplete.push(session);
      } catch {}
    }
  }
  return { ok: true, migrations: incomplete };
}

function assertActiveMigration(migrationId, projectId) {
  if (!migrationId) return null;
  const session = sessions.get(String(migrationId));
  if (!session || session.projectId !== projectId) throw new Error("MIGRATION_NOT_FOUND");
  if (session.status === "cancelled") throw new Error("MIGRATION_CANCELLED");
  if (!["preparing", "archiving"].includes(session.status)) throw new Error("MIGRATION_NOT_ACTIVE");
  return session;
}

function recordMigrationAsset(migrationId, asset = {}) {
  if (!migrationId) return;
  const session = sessions.get(String(migrationId));
  if (!session) return;
  session.status = "archiving";
  session.assets.push({
    sha256: asset.sha256 || "",
    localPath: asset.localPath || "",
    size: Number(asset.size || 0),
    created: asset.deduplicated !== true
  });
  session.progress.completed += 1;
  session.progress.bytes += Number(asset.size || 0);
  saveSession(session);
}

function cancelProjectMigration(payload = {}) {
  const session = sessions.get(String(payload.migrationId || ""));
  if (!session) return { ok: false, error: "MIGRATION_NOT_FOUND" };
  session.status = "cancelled";
  saveSession(session);
  return { ok: true, session };
}

function commitProjectMigration(payload = {}) {
  const session = sessions.get(String(payload.migrationId || ""));
  if (!session) return { ok: false, error: "MIGRATION_NOT_FOUND" };
  if (session.status === "cancelled") return { ok: false, error: "MIGRATION_CANCELLED" };
  const references = [...new Set((payload.references || []).filter(Boolean))].sort();
  const missing = references.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length) return { ok: false, error: "MIGRATION_REFERENCE_MISSING", missing };
  if (payload.requireGlobalBlobs === true) {
    const blobRoot = `${path.resolve(mediaLibraryRoot(session.directory), "_blobs", "blobs")}${path.sep}`;
    const outside = references.filter((filePath) => !path.resolve(filePath).startsWith(blobRoot));
    if (outside.length) return { ok: false, error: "MIGRATION_REFERENCE_OUTSIDE_BLOB_STORE", outside };
  }
  const manifest = {
    version: 1,
    projectId: session.projectId,
    committedAt: new Date().toISOString(),
    references
  };
  atomicJson(path.join(manifestRoot(session.directory), `${session.projectId}.json`), manifest);
  session.status = "committed";
  session.references = references;
  saveSession(session);
  projectLocks.delete(session.lockKey);
  fs.rmSync(snapshotPath(session), { force: true });
  return { ok: true, session, manifest };
}

function rollbackProjectMigration(payload = {}) {
  const session = getProjectMigration(payload).session;
  if (!session) return { ok: false, error: "MIGRATION_NOT_FOUND" };
  session.status = "rolled-back";
  session.error = String(payload.error || "");
  saveSession(session);
  projectLocks.delete(session.lockKey);
  fs.rmSync(snapshotPath(session), { force: true });
  // Blobs are deliberately retained as safe orphans; cleanup requires a reference-index pass.
  return { ok: true, session };
}

function syncProjectReferences(payload = {}) {
  const directory = payload.directory || defaultDownloadDirectory();
  const projectId = sanitizePathSegment(payload.projectId || "default", "default");
  const references = [...new Set((payload.references || []).filter(Boolean).map((entry) => path.resolve(entry)))].sort();
  const missing = references.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length) return { ok: false, error: "PROJECT_REFERENCE_MISSING", missing };
  const manifest = {
    version: 1,
    projectId,
    complete: payload.complete !== false,
    updatedAt: new Date().toISOString(),
    references
  };
  atomicJson(path.join(manifestRoot(directory), `${projectId}.json`), manifest);
  return { ok: true, manifest };
}

function removeProjectReferences(payload = {}) {
  const directory = payload.directory || defaultDownloadDirectory();
  const projectId = sanitizePathSegment(payload.projectId || "default", "default");
  const filePath = path.join(manifestRoot(directory), `${projectId}.json`);
  fs.rmSync(filePath, { force: true });
  return { ok: true, path: filePath };
}

function listReferencedFiles(directory) {
  const root = manifestRoot(directory);
  const references = new Set();
  if (!fs.existsSync(root)) return references;
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith(".json")) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
      for (const filePath of manifest.references || []) references.add(filePath);
    } catch {}
  }
  return references;
}

function cleanupUnreferencedBlobs(payload = {}) {
  const directory = payload.directory || defaultDownloadDirectory();
  const blobRoot = path.join(mediaLibraryRoot(directory), "_blobs", "blobs");
  const referenced = listReferencedFiles(directory);
  const candidates = [];
  if (fs.existsSync(blobRoot)) {
    for (const name of fs.readdirSync(blobRoot)) {
      const filePath = path.join(blobRoot, name);
      if (fs.statSync(filePath).isFile() && !referenced.has(filePath)) {
        candidates.push({ path: filePath, size: fs.statSync(filePath).size });
      }
    }
  }
  if (payload.confirm === true && payload.referenceIndexComplete !== true) {
    return {
      ok: false,
      error: "REFERENCE_INDEX_INCOMPLETE",
      dryRun: true,
      candidateCount: candidates.length,
      candidateBytes: candidates.reduce((sum, item) => sum + item.size, 0),
      candidates
    };
  }
  if (payload.confirm === true) {
    for (const candidate of candidates) fs.rmSync(candidate.path, { force: true });
  }
  return {
    ok: true,
    dryRun: payload.confirm !== true,
    candidateCount: candidates.length,
    candidateBytes: candidates.reduce((sum, item) => sum + item.size, 0),
    candidates
  };
}

function isProjectMigrationLocked(payload = {}) {
  const directory = payload.directory || defaultDownloadDirectory();
  const projectId = sanitizePathSegment(payload.projectId || "default", "default");
  return projectLocks.has(projectLockKey(directory, projectId));
}

module.exports = {
  beginProjectMigration,
  getProjectMigration,
  listIncompleteMigrations,
  saveProjectMigrationSnapshot,
  loadProjectMigrationSnapshot,
  assertActiveMigration,
  recordMigrationAsset,
  cancelProjectMigration,
  commitProjectMigration,
  rollbackProjectMigration,
  syncProjectReferences,
  removeProjectReferences,
  cleanupUnreferencedBlobs,
  isProjectMigrationLocked
};
