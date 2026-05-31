// 职责：项目安全域 - 画布状态快照/自动备份/隔离/可疑保存检测与拦截提示，以及桌面存储清理。

const { fs, os, path } = require("./runtime.cjs");
const {
  STORAGE_KEY,
  BOOT_THEME_MIRROR_KEY,
  CANVAS_STATE_DB_NAME,
  CANVAS_STATE_STORE,
  CANVAS_STATE_PREFIX,
  DESKTOP_CANVAS_MIRROR_PREFIX,
  PROJECT_SAFETY_DB_NAME,
  PROJECT_SAFETY_DB_VERSION,
  PROJECT_SAFETY_SNAPSHOT_STORE,
  PROJECT_SAFETY_QUARANTINE_STORE,
  PROJECT_SAFETY_META_STORE,
  PROJECT_SAFETY_MAX_SNAPSHOTS_PER_PROJECT,
  PROJECT_SAFETY_DEFAULT_CURRENT_BACKUP_INTERVAL_MS,
  PROJECT_SAFETY_DEFAULT_ALL_BACKUP_INTERVAL_MS,
  PROJECT_SAFETY_FILE_RETENTION_DAYS,
  PROJECT_SAFETY_SNAPSHOT_FILE_FOLDER,
  PROJECT_SAFETY_RUNTIME_ENABLED,
  PROJECT_SAFETY_INTERVAL_OPTIONS
} = require("./constants.cjs");

let projectSafetyDbPromise = null;
let canvasStateDbPromise = null;

function sanitizeBackupFilenameSegment(value, fallback = "project") {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function projectSafetyNowIso() {
  return new Date().toISOString();
}

function projectSafetyDateSegment(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function projectSafetyTimestampSegment(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function defaultProjectSafetyBackupRoot() {
  return path.join(os.homedir(), "Downloads", "万卷灵境", "自动备份");
}

function projectSafetySnapshotFileRoot(root = defaultProjectSafetyBackupRoot()) {
  return path.join(root || defaultProjectSafetyBackupRoot(), PROJECT_SAFETY_SNAPSHOT_FILE_FOLDER);
}

function normalizeProjectSafetyInterval(value, fallback) {
  const number = Number(value);
  const option = PROJECT_SAFETY_INTERVAL_OPTIONS.find((item) => item.value === number);
  return option ? option.value : fallback;
}

async function getProjectSafetyConfig() {
  const stored = await projectSafetyGetMeta("config").catch(() => null);
  return {
    enabled: stored?.enabled !== false,
    currentIntervalMs: normalizeProjectSafetyInterval(
      stored?.currentIntervalMs,
      PROJECT_SAFETY_DEFAULT_CURRENT_BACKUP_INTERVAL_MS
    ),
    allIntervalMs: normalizeProjectSafetyInterval(
      stored?.allIntervalMs,
      PROJECT_SAFETY_DEFAULT_ALL_BACKUP_INTERVAL_MS
    ),
    backupRoot: stored?.backupRoot || defaultProjectSafetyBackupRoot()
  };
}

async function setProjectSafetyConfig(patch = {}) {
  const current = await getProjectSafetyConfig();
  const next = {
    ...current,
    ...patch
  };
  next.enabled = next.enabled !== false;
  next.currentIntervalMs = normalizeProjectSafetyInterval(
    next.currentIntervalMs,
    PROJECT_SAFETY_DEFAULT_CURRENT_BACKUP_INTERVAL_MS
  );
  next.allIntervalMs = normalizeProjectSafetyInterval(
    next.allIntervalMs,
    PROJECT_SAFETY_DEFAULT_ALL_BACKUP_INTERVAL_MS
  );
  next.backupRoot = next.backupRoot || defaultProjectSafetyBackupRoot();
  await projectSafetySetMeta("config", next);
  return next;
}

function projectSafetyHash(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value || {});
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function cloneProjectSafetyValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function summarizeProjectCanvasState(state) {
  const nodes = Array.isArray(state?.nodes) ? state.nodes : [];
  const edges = Array.isArray(state?.edges) ? state.edges : [];
  const nodeIds = new Set();
  let duplicateNodeIds = 0;
  for (const node of nodes) {
    if (!node?.id) continue;
    if (nodeIds.has(node.id)) duplicateNodeIds += 1;
    nodeIds.add(node.id);
  }
  return {
    valid: !!state && typeof state === "object" && Array.isArray(state.nodes) && Array.isArray(state.edges),
    nodes: nodes.length,
    edges: edges.length,
    duplicateNodeIds,
    hash: projectSafetyHash(state),
    firstNodeId: nodes[0]?.id || ""
  };
}

function isHealthyProjectCanvasState(state) {
  const summary = summarizeProjectCanvasState(state);
  return summary.valid && summary.duplicateNodeIds === 0 && summary.nodes > 0;
}

function detectSuspiciousCanvasSave(previousState, nextState) {
  const previous = summarizeProjectCanvasState(previousState);
  const next = summarizeProjectCanvasState(nextState);
  if (!next.valid) {
    return {
      suspicious: true,
      severity: "critical",
      reason: "状态结构异常",
      previous,
      next
    };
  }
  if (next.duplicateNodeIds > 0) {
    return {
      suspicious: true,
      severity: "critical",
      reason: "节点 ID 重复",
      previous,
      next
    };
  }
  if (!previous.valid || previous.nodes <= 0) {
    return { suspicious: false, previous, next };
  }
  if (previous.nodes >= 3 && next.nodes <= 1) {
    return {
      suspicious: true,
      severity: "critical",
      reason: `节点数从 ${previous.nodes} 降到 ${next.nodes}`,
      previous,
      next
    };
  }
  if (previous.nodes >= 6 && next.nodes <= Math.floor(previous.nodes * 0.3)) {
    return {
      suspicious: true,
      severity: "critical",
      reason: `节点数骤降 ${previous.nodes} -> ${next.nodes}`,
      previous,
      next
    };
  }
  if (previous.edges >= 3 && next.edges === 0 && next.nodes >= 2) {
    return {
      suspicious: true,
      severity: "warning",
      reason: `连线数从 ${previous.edges} 降到 0`,
      previous,
      next
    };
  }
  return { suspicious: false, previous, next };
}

function openProjectSafetyDb() {
  if (projectSafetyDbPromise) return projectSafetyDbPromise;
  projectSafetyDbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = window.indexedDB.open(PROJECT_SAFETY_DB_NAME, PROJECT_SAFETY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_SAFETY_SNAPSHOT_STORE)) {
        const store = db.createObjectStore(PROJECT_SAFETY_SNAPSHOT_STORE, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(PROJECT_SAFETY_QUARANTINE_STORE)) {
        const store = db.createObjectStore(PROJECT_SAFETY_QUARANTINE_STORE, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(PROJECT_SAFETY_META_STORE)) {
        db.createObjectStore(PROJECT_SAFETY_META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open project safety database"));
  });
  return projectSafetyDbPromise;
}

function openCanvasStateDb() {
  if (canvasStateDbPromise) return canvasStateDbPromise;
  canvasStateDbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = window.indexedDB.open(CANVAS_STATE_DB_NAME);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CANVAS_STATE_STORE)) db.createObjectStore(CANVAS_STATE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open canvas state database"));
  });
  return canvasStateDbPromise;
}

async function getCanvasStateByProjectId(projectId) {
  const db = await openCanvasStateDb();
  const key = `${CANVAS_STATE_PREFIX}${projectId || "default"}`;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CANVAS_STATE_STORE, "readonly");
    const request = transaction.objectStore(CANVAS_STATE_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error || request.error);
  });
}

async function setCanvasStateByProjectId(projectId, state) {
  const db = await openCanvasStateDb();
  const key = `${CANVAS_STATE_PREFIX}${projectId || "default"}`;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CANVAS_STATE_STORE, "readwrite");
    transaction.objectStore(CANVAS_STATE_STORE).put(state, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function projectSafetyGetMeta(key) {
  const db = await openProjectSafetyDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_SAFETY_META_STORE, "readonly");
    const request = transaction.objectStore(PROJECT_SAFETY_META_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error || request.error);
  });
}

async function projectSafetySetMeta(key, value) {
  const db = await openProjectSafetyDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_SAFETY_META_STORE, "readwrite");
    transaction.objectStore(PROJECT_SAFETY_META_STORE).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getProjectNameById(projectId) {
  const store = await getDesktopStorageItems(["projects"]);
  const projects = Array.isArray(store.projects) ? store.projects : [];
  const project = projects.find((item) => item?.id === projectId);
  return project?.name || project?.title || projectId || "未命名项目";
}

async function addProjectSafetyRecord(storeName, record) {
  const db = await openProjectSafetyDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(record);
    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function listProjectSafetySnapshots(projectId = "") {
  const db = await openProjectSafetyDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_SAFETY_SNAPSHOT_STORE, "readonly");
    const store = transaction.objectStore(PROJECT_SAFETY_SNAPSHOT_STORE);
    const request = projectId
      ? store.index("projectId").openCursor(IDBKeyRange.only(projectId))
      : store.openCursor();
    const snapshots = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const item = cursor.value || {};
      snapshots.push({
        id: item.id,
        projectId: item.projectId,
        projectName: item.projectName,
        createdAt: item.createdAt,
        reason: item.reason,
        summary: item.summary,
        appVersion: item.appVersion || ""
      });
      cursor.continue();
    };
    transaction.oncomplete = () => resolve(snapshots.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    transaction.onerror = () => reject(transaction.error || request.error);
  });
}

async function getProjectSafetySnapshot(snapshotId) {
  const db = await openProjectSafetyDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_SAFETY_SNAPSHOT_STORE, "readonly");
    const request = transaction.objectStore(PROJECT_SAFETY_SNAPSHOT_STORE).get(snapshotId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error || request.error);
  });
}

async function listFullProjectSafetySnapshots(projectId = "") {
  const db = await openProjectSafetyDb();
  return new Promise((resolve, reject) => {
    const snapshots = [];
    const transaction = db.transaction(PROJECT_SAFETY_SNAPSHOT_STORE, "readonly");
    const request = transaction.objectStore(PROJECT_SAFETY_SNAPSHOT_STORE).openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const item = cursor.value || {};
      if (!projectId || item.projectId === projectId) snapshots.push(item);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve(snapshots.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    transaction.onerror = () => reject(transaction.error || request.error);
  });
}

async function pruneProjectSafetySnapshots(projectId) {
  const db = await openProjectSafetyDb();
  const snapshots = await listProjectSafetySnapshots(projectId);
  const remove = snapshots.slice(PROJECT_SAFETY_MAX_SNAPSHOTS_PER_PROJECT);
  if (!remove.length) return;
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_SAFETY_SNAPSHOT_STORE, "readwrite");
    const store = transaction.objectStore(PROJECT_SAFETY_SNAPSHOT_STORE);
    for (const snapshot of remove) store.delete(snapshot.id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function createProjectSafetySnapshot({ projectId, state, reason = "manual", projectName = "" }) {
  if (!projectId || !isHealthyProjectCanvasState(state)) return null;
  const createdAt = projectSafetyNowIso();
  const summary = summarizeProjectCanvasState(state);
  const name = projectName || await getProjectNameById(projectId);
  const record = {
    id: `${projectId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    projectId,
    projectName: name,
    createdAt,
    reason,
    summary,
    appVersion: chromeShim?.runtime?.getManifest?.()?.version || "",
    state: cloneProjectSafetyValue(state)
  };
  await addProjectSafetyRecord(PROJECT_SAFETY_SNAPSHOT_STORE, record);
  await writeProjectSafetySnapshotFile(record).catch((error) => console.warn("project safety snapshot file skipped", error));
  await pruneProjectSafetySnapshots(projectId);
  return {
    id: record.id,
    projectId: record.projectId,
    projectName: record.projectName,
    createdAt: record.createdAt,
    reason: record.reason,
    summary: record.summary
  };
}

async function writeProjectSafetySnapshotFile(record) {
  if (!record?.projectId || !record?.state) return "";
  const config = await getProjectSafetyConfig();
  const root = config.backupRoot || defaultProjectSafetyBackupRoot();
  const created = record.createdAt ? new Date(record.createdAt) : new Date();
  const folder = path.join(projectSafetySnapshotFileRoot(root), projectSafetyDateSegment(created));
  fs.mkdirSync(folder, { recursive: true });
  const cleanProject = sanitizeBackupFilenameSegment(record.projectName || record.projectId || "project", "project");
  const cleanReason = sanitizeBackupFilenameSegment(record.reason || "snapshot", "snapshot");
  const filename = `${cleanReason}-${cleanProject}-${projectSafetyTimestampSegment(created)}.json`;
  const filePath = path.join(folder, filename);
  fs.writeFileSync(filePath, JSON.stringify({
    version: 1,
    kind: "safety-snapshot",
    exportedAt: record.createdAt || projectSafetyNowIso(),
    appVersion: record.appVersion || chromeShim?.runtime?.getManifest?.()?.version || "",
    projectId: record.projectId || "",
    projectName: record.projectName || "",
    snapshotId: record.id || "",
    reason: record.reason || "",
    metadata: {
      summary: record.summary || summarizeProjectCanvasState(record.state)
    },
    state: cloneProjectSafetyValue(record.state)
  }, null, 2), "utf8");
  return filePath;
}

async function mirrorProjectSafetySnapshotsToFiles(projectId = "") {
  const snapshots = await listFullProjectSafetySnapshots(projectId);
  let written = 0;
  for (const snapshot of snapshots) {
    const filePath = await writeProjectSafetySnapshotFile(snapshot).catch((error) => {
      console.warn("project safety snapshot mirror skipped", error);
      return "";
    });
    if (filePath) written += 1;
  }
  return written;
}

async function quarantineSuspiciousCanvasSave({ projectId, state, previousState, detection }) {
  const projectName = await getProjectNameById(projectId);
  const record = {
    id: `${projectId || "unknown"}-quarantine-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    projectId,
    projectName,
    createdAt: projectSafetyNowIso(),
    reason: detection?.reason || "疑似异常保存",
    detection,
    summary: summarizeProjectCanvasState(state),
    previousSummary: summarizeProjectCanvasState(previousState),
    state: cloneProjectSafetyValue(state)
  };
  await addProjectSafetyRecord(PROJECT_SAFETY_QUARANTINE_STORE, record);
  await writeProjectSafetyBackupFile({
    kind: "quarantine",
    projectId,
    projectName,
    state,
    metadata: {
      reason: record.reason,
      detection: record.detection,
      previousSummary: record.previousSummary
    }
  }).catch((error) => console.warn("project safety quarantine file skipped", error));
  return record;
}

async function writeProjectSafetyBackupFile({ kind, projectId, projectName, state, states, metadata = {} }) {
  const now = new Date();
  const config = await getProjectSafetyConfig();
  const root = config.backupRoot || defaultProjectSafetyBackupRoot();
  const folder = path.join(root, projectSafetyDateSegment(now));
  fs.mkdirSync(folder, { recursive: true });
  const cleanKind = sanitizeBackupFilenameSegment(kind || "backup", "backup");
  const cleanProject = sanitizeBackupFilenameSegment(projectName || projectId || "all-projects", "project");
  const filename = `${cleanKind}-${cleanProject}-${projectSafetyTimestampSegment(now)}.json`;
  const filePath = path.join(folder, filename);
  const payload = {
    version: 1,
    kind,
    exportedAt: now.toISOString(),
    appVersion: chromeShim?.runtime?.getManifest?.()?.version || "",
    projectId: projectId || "",
    projectName: projectName || "",
    metadata,
    state: state !== undefined ? cloneProjectSafetyValue(state) : undefined,
    states: states !== undefined ? cloneProjectSafetyValue(states) : undefined
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

function pruneProjectSafetyBackupFiles(root = defaultProjectSafetyBackupRoot()) {
  const cutoff = Date.now() - PROJECT_SAFETY_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const pruneFolder = (folderPath) => {
    for (const entry of fs.readdirSync(folderPath)) {
      const entryPath = path.join(folderPath, entry);
      let stat = null;
      try {
        stat = fs.statSync(entryPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        pruneFolder(entryPath);
        try {
          if (fs.readdirSync(entryPath).length === 0) fs.rmdirSync(entryPath);
        } catch {}
        continue;
      }
      try {
        if (stat.isFile() && stat.mtimeMs < cutoff) fs.rmSync(entryPath, { force: true });
      } catch {}
    }
  };
  try {
    if (!fs.existsSync(root)) return;
    pruneFolder(root);
  } catch (error) {
    console.warn("project safety backup prune skipped", error);
  }
}

async function readAllProjectCanvasStates(projects = []) {
  const result = {};
  for (const project of projects) {
    if (!project?.id) continue;
    try {
      const state = await getCanvasStateByProjectId(project.id);
      if (state !== undefined) result[project.id] = state;
    } catch (error) {
      console.warn("project safety state read skipped", project.id, error);
    }
  }
  return result;
}

async function maybeRunProjectSafetyAutoBackup({ force = false } = {}) {
  if (!PROJECT_SAFETY_RUNTIME_ENABLED) {
    return { disabled: true, reason: "disabled-by-desktop-hotfix" };
  }
  const now = Date.now();
  const config = await getProjectSafetyConfig();
  if (!force && !config.enabled) {
    return {
      ...(await projectSafetyGetMeta("autoBackup").catch(() => ({})) || {}),
      disabled: true
    };
  }
  const meta = await projectSafetyGetMeta("autoBackup").catch(() => ({})) || {};
  const store = await getDesktopStorageItems(["projects", "lastOpenedProjectId"]);
  const projects = Array.isArray(store.projects) ? store.projects : [];
  const currentProjectId = store.lastOpenedProjectId || projects[0]?.id || "default";
  const currentProjectName = await getProjectNameById(currentProjectId);

  if (force || !meta.lastCurrentBackupAt || now - meta.lastCurrentBackupAt >= config.currentIntervalMs) {
    const state = await getCanvasStateByProjectId(currentProjectId).catch(() => undefined);
    if (isHealthyProjectCanvasState(state)) {
      const filePath = await writeProjectSafetyBackupFile({
        kind: "current-project",
        projectId: currentProjectId,
        projectName: currentProjectName,
        state,
        metadata: { summary: summarizeProjectCanvasState(state) }
      });
      meta.lastCurrentBackupAt = now;
      meta.lastCurrentBackupPath = filePath;
    }
  }

  if (force || !meta.lastAllBackupAt || now - meta.lastAllBackupAt >= config.allIntervalMs) {
    const states = await readAllProjectCanvasStates(projects);
    if (Object.keys(states).length) {
      const filePath = await writeProjectSafetyBackupFile({
        kind: "all-projects",
        states,
        metadata: {
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name || project.title || project.id
          })),
          summaries: Object.fromEntries(Object.entries(states).map(([id, state]) => [id, summarizeProjectCanvasState(state)]))
        }
      });
      meta.lastAllBackupAt = now;
      meta.lastAllBackupPath = filePath;
    }
  }

  await projectSafetySetMeta("autoBackup", meta).catch(() => {});
  pruneProjectSafetyBackupFiles(config.backupRoot);
  return { ...meta, config };
}

async function beforeProjectCanvasSave(payload = {}) {
  if (!PROJECT_SAFETY_RUNTIME_ENABLED) {
    return { ok: true, block: false, disabled: true, reason: "disabled-by-desktop-hotfix" };
  }
  const projectId = payload.projectId || "default";
  const nextState = payload.state;
  const previousState = payload.previousState !== undefined
    ? payload.previousState
    : await getCanvasStateByProjectId(projectId).catch(() => undefined);
  const detection = detectSuspiciousCanvasSave(previousState, nextState);
  const projectName = payload.projectName || await getProjectNameById(projectId);
  let latestSnapshot = null;

  if (isHealthyProjectCanvasState(previousState)) {
    latestSnapshot = await createProjectSafetySnapshot({
      projectId,
      projectName,
      state: previousState,
      reason: detection.suspicious ? "before-suspicious-save" : "before-save"
    }).catch((error) => console.warn("project safety snapshot skipped", error));
  }

  if (detection.suspicious && detection.severity === "critical") {
    await quarantineSuspiciousCanvasSave({
      projectId,
      state: nextState,
      previousState,
      detection
    }).catch((error) => console.warn("project safety quarantine skipped", error));
    if (isProjectSafetySaveAcceptedForProject(projectId) && /^节点数/.test(String(detection.reason || ""))) {
      if (isHealthyProjectCanvasState(nextState)) {
        maybeRunProjectSafetyAutoBackup().catch((error) => console.warn("project safety auto backup skipped", error));
      }
      return {
        ok: true,
        block: false,
        accepted: true,
        projectId,
        projectName,
        warning: detection.reason,
        previous: detection.previous,
        next: detection.next
      };
    }
    return {
      ok: false,
      block: true,
      projectId,
      projectName,
      reason: detection.reason,
      message: `已拦截疑似异常保存：${detection.reason}。上一版画布已保存在安全快照，可从设置的数据管理“备份中心”中恢复。`,
      incidentId: projectSafetyHash({
        projectId,
        reason: detection.reason,
        previous: detection.previous,
        next: detection.next
      }),
      snapshot: latestSnapshot,
      previous: detection.previous,
      next: detection.next
    };
  }

  if (detection.suspicious) {
    await createProjectSafetySnapshot({
      projectId,
      projectName,
      state: previousState,
      reason: "before-warning-save"
    }).catch(() => {});
  }

  if (isHealthyProjectCanvasState(nextState)) {
    maybeRunProjectSafetyAutoBackup().catch((error) => console.warn("project safety auto backup skipped", error));
  }
  return {
    ok: true,
    block: false,
    warning: detection.suspicious ? detection.reason : "",
    previous: detection.previous,
    next: detection.next
  };
}

async function restoreProjectSafetySnapshot(snapshotId, options = {}) {
  const snapshot = await getProjectSafetySnapshot(snapshotId);
  if (!snapshot?.state || !snapshot.projectId) {
    return { ok: false, error: "未找到可恢复的快照" };
  }
  const store = await getDesktopStorageItems(["projects"]);
  const projects = Array.isArray(store.projects) && store.projects.length
    ? store.projects
    : [{ id: "default", name: "默认项目" }];
  const restoreAsNew = options.restoreAsNew !== false;
  const restoredProjectId = restoreAsNew
    ? `recovered-${snapshot.projectId}-${Date.now()}`
    : snapshot.projectId;
  const restoredProjectName = restoreAsNew
    ? `${snapshot.projectName || snapshot.projectId}-恢复-${new Date().toLocaleString("zh-CN", { hour12: false })}`
    : snapshot.projectName || snapshot.projectId;

  if (!restoreAsNew) {
    const currentState = await getCanvasStateByProjectId(snapshot.projectId).catch(() => undefined);
    if (isHealthyProjectCanvasState(currentState)) {
      await createProjectSafetySnapshot({
        projectId: snapshot.projectId,
        projectName: snapshot.projectName,
        state: currentState,
        reason: "before-restore"
      }).catch(() => {});
    }
  }

  await setCanvasStateByProjectId(restoredProjectId, snapshot.state);
  await setDesktopStorageItems({
    [`${DESKTOP_CANVAS_MIRROR_PREFIX}${restoredProjectId}`]: snapshot.state,
    projects: projects.some((project) => project.id === restoredProjectId)
      ? projects.map((project) => project.id === restoredProjectId ? { ...project, name: restoredProjectName } : project)
      : [...projects, { id: restoredProjectId, name: restoredProjectName }],
    lastOpenedProjectId: restoredProjectId
  });
  try {
    window.localStorage.setItem("lastOpenedProjectId", restoredProjectId);
  } catch {}

  await writeProjectSafetyBackupFile({
    kind: "restore",
    projectId: restoredProjectId,
    projectName: restoredProjectName,
    state: snapshot.state,
    metadata: {
      sourceSnapshotId: snapshot.id,
      sourceProjectId: snapshot.projectId,
      restoreAsNew
    }
  }).catch(() => {});

  return {
    ok: true,
    projectId: restoredProjectId,
    projectName: restoredProjectName,
    summary: summarizeProjectCanvasState(snapshot.state)
  };
}

const PROJECT_SAFETY_PROMPT_ID = "wanjuan-project-safety-blocked-save-prompt";
const PROJECT_SAFETY_PROMPT_STYLE_ID = "wanjuan-project-safety-blocked-save-style";
const PROJECT_SAFETY_PROMPT_DISMISS_PREFIX = "wanjuanProjectSafety.dismissedIncident.";
const PROJECT_SAFETY_PROMPT_DISMISSED_PROJECT_PREFIX = "wanjuanProjectSafety.dismissedProject.";

function ensureProjectSafetyBlockedPromptStyle() {
  if (typeof document === "undefined" || document.getElementById(PROJECT_SAFETY_PROMPT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PROJECT_SAFETY_PROMPT_STYLE_ID;
  style.textContent = `
    #${PROJECT_SAFETY_PROMPT_ID} {
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483646;
      width: min(760px, calc(100vw - 32px));
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid color-mix(in srgb, var(--wanjuan-theme-border, #6b7280) 72%, var(--wanjuan-theme-primary, #60a5fa) 28%);
      background: color-mix(in srgb, var(--wanjuan-theme-surface, #2b3039) 92%, #ffffff 8%);
      color: var(--wanjuan-theme-text, #f8fafc);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
      font-family: inherit;
      pointer-events: auto;
      -webkit-app-region: no-drag;
    }
    #${PROJECT_SAFETY_PROMPT_ID} .wj-safety-prompt-title {
      font-size: 13px;
      line-height: 1.55;
      font-weight: 700;
      margin: 0 0 4px;
    }
    #${PROJECT_SAFETY_PROMPT_ID} .wj-safety-prompt-message {
      font-size: 12px;
      line-height: 1.55;
      color: color-mix(in srgb, var(--wanjuan-theme-text, #f8fafc) 72%, transparent);
      margin: 0;
    }
    #${PROJECT_SAFETY_PROMPT_ID} .wj-safety-prompt-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    #${PROJECT_SAFETY_PROMPT_ID} button {
      appearance: none;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--wanjuan-theme-border, #6b7280) 78%, transparent);
      padding: 7px 12px;
      font-size: 12px;
      line-height: 1;
      font-weight: 700;
      cursor: pointer;
      transition: transform 140ms ease, background 140ms ease, border-color 140ms ease, color 140ms ease;
    }
    #${PROJECT_SAFETY_PROMPT_ID} button:hover {
      transform: translateY(-1px);
    }
    #${PROJECT_SAFETY_PROMPT_ID} button:disabled {
      cursor: wait;
      opacity: 0.68;
      transform: none;
    }
    #${PROJECT_SAFETY_PROMPT_ID} [data-safety-restore] {
      border-color: color-mix(in srgb, var(--wanjuan-theme-primary, #60a5fa) 74%, #ffffff 26%);
      background: var(--wanjuan-theme-primary, #3b82f6);
      color: var(--wanjuan-theme-on-primary, #ffffff);
    }
    #${PROJECT_SAFETY_PROMPT_ID} [data-safety-dismiss] {
      background: color-mix(in srgb, var(--wanjuan-theme-surface, #2b3039) 82%, #000000 18%);
      color: color-mix(in srgb, var(--wanjuan-theme-text, #f8fafc) 78%, transparent);
    }
  `;
  document.head.appendChild(style);
}

function removeProjectSafetyBlockedPrompt() {
  try {
    document.getElementById(PROJECT_SAFETY_PROMPT_ID)?.remove();
  } catch {}
}

function isProjectSafetySaveAcceptedForProject(projectId) {
  if (!projectId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${PROJECT_SAFETY_PROMPT_DISMISSED_PROJECT_PREFIX}${projectId}`) === "1";
  } catch {
    return false;
  }
}

function showProjectSafetyBlockedPrompt(result = {}) {
  if (typeof document === "undefined") return { ok: false, error: "document unavailable" };
  const incidentId = String(result.incidentId || result.reason || "blocked-save");
  const projectId = String(result.projectId || result.snapshot?.projectId || result.project?.id || "");
  try {
    if (
      (projectId && window.localStorage.getItem(`${PROJECT_SAFETY_PROMPT_DISMISSED_PROJECT_PREFIX}${projectId}`) === "1") ||
      window.localStorage.getItem(`${PROJECT_SAFETY_PROMPT_DISMISS_PREFIX}${incidentId}`) === "1"
    ) {
      return { ok: false, dismissed: true };
    }
  } catch {}

  ensureProjectSafetyBlockedPromptStyle();
  let prompt = document.getElementById(PROJECT_SAFETY_PROMPT_ID);
  if (!prompt) {
    prompt = document.createElement("div");
    prompt.id = PROJECT_SAFETY_PROMPT_ID;
    prompt.setAttribute("role", "dialog");
    prompt.setAttribute("aria-live", "assertive");
    prompt.innerHTML = `
      <div class="wj-safety-prompt-copy">
        <div class="wj-safety-prompt-title"></div>
        <p class="wj-safety-prompt-message"></p>
      </div>
      <div class="wj-safety-prompt-actions">
        <button type="button" data-safety-restore>立即恢复备份</button>
        <button type="button" data-safety-dismiss>关闭且不再询问</button>
      </div>
    `;
    document.body.appendChild(prompt);
  }

  const snapshotId = result.snapshot?.id || result.snapshotId || "";
  prompt.dataset.incidentId = incidentId;
  prompt.dataset.projectId = projectId;
  prompt.dataset.snapshotId = snapshotId;
  prompt.querySelector(".wj-safety-prompt-title").textContent = "已拦截疑似异常保存";
  prompt.querySelector(".wj-safety-prompt-message").textContent =
    result.message || "上一版画布已保存在安全快照，可以立即恢复为新项目。";

  const restoreButton = prompt.querySelector("[data-safety-restore]");
  const dismissButton = prompt.querySelector("[data-safety-dismiss]");
  restoreButton.disabled = !snapshotId;
  restoreButton.onclick = async () => {
    if (!snapshotId) {
      window.alert("没有找到可恢复的安全快照，请到设置的数据管理“备份中心”查看。");
      return;
    }
    const originalLabel = restoreButton.textContent;
    restoreButton.disabled = true;
    dismissButton.disabled = true;
    restoreButton.textContent = "正在恢复...";
    try {
      const restoreResult = await restoreProjectSafetySnapshot(snapshotId, { restoreAsNew: true });
      if (!restoreResult?.ok) throw new Error(restoreResult?.error || "恢复失败");
      removeProjectSafetyBlockedPrompt();
      window.location.reload();
    } catch (error) {
      restoreButton.disabled = false;
      dismissButton.disabled = false;
      restoreButton.textContent = originalLabel;
      window.alert(`恢复失败：${error?.message || error}`);
    }
  };
  dismissButton.onclick = () => {
    try {
      if (projectId) window.localStorage.setItem(`${PROJECT_SAFETY_PROMPT_DISMISSED_PROJECT_PREFIX}${projectId}`, "1");
      window.localStorage.setItem(`${PROJECT_SAFETY_PROMPT_DISMISS_PREFIX}${incidentId}`, "1");
    } catch {}
    removeProjectSafetyBlockedPrompt();
    window.setTimeout(() => {
      try {
        window.__wanjuanProjectSafetyRetryCanvasSave?.();
      } catch {}
    }, 0);
  };

  return { ok: true, incidentId, projectId, snapshotId };
}

async function getCurrentProjectSafetyInfo() {
  const store = await getDesktopStorageItems(["projects", "lastOpenedProjectId"]);
  const projects = Array.isArray(store.projects) ? store.projects : [];
  const projectId = store.lastOpenedProjectId || projects[0]?.id || "default";
  // 拿到 projectId 后，下面 5 个读取互不依赖，并发执行以压缩备份中心的加载耗时（原先串行 await 约 1 秒）。
  const [projectName, state, snapshots, meta, config] = await Promise.all([
    getProjectNameById(projectId),
    getCanvasStateByProjectId(projectId).catch(() => undefined),
    listProjectSafetySnapshots(projectId).catch(() => []),
    projectSafetyGetMeta("autoBackup").catch(() => ({})).then((value) => value || {}),
    getProjectSafetyConfig()
  ]);
  return {
    projectId,
    projectName,
    summary: summarizeProjectCanvasState(state),
    snapshots,
    backupRoot: config.backupRoot,
    snapshotRoot: projectSafetySnapshotFileRoot(config.backupRoot),
    autoBackup: meta,
    config,
    intervalOptions: PROJECT_SAFETY_INTERVAL_OPTIONS
  };
}

async function clearDesktopStorage() {
  try {
    await clearIndexedDesktopStorage();
  } catch (error) {
    console.warn("desktop storage clear fallback", error);
  }
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(BOOT_THEME_MIRROR_KEY);
}

module.exports = {
  sanitizeBackupFilenameSegment,
  projectSafetyNowIso,
  projectSafetyDateSegment,
  projectSafetyTimestampSegment,
  defaultProjectSafetyBackupRoot,
  projectSafetySnapshotFileRoot,
  normalizeProjectSafetyInterval,
  getProjectSafetyConfig,
  setProjectSafetyConfig,
  projectSafetyHash,
  cloneProjectSafetyValue,
  summarizeProjectCanvasState,
  isHealthyProjectCanvasState,
  detectSuspiciousCanvasSave,
  openProjectSafetyDb,
  openCanvasStateDb,
  getCanvasStateByProjectId,
  setCanvasStateByProjectId,
  projectSafetyGetMeta,
  projectSafetySetMeta,
  getProjectNameById,
  addProjectSafetyRecord,
  listProjectSafetySnapshots,
  getProjectSafetySnapshot,
  listFullProjectSafetySnapshots,
  pruneProjectSafetySnapshots,
  createProjectSafetySnapshot,
  writeProjectSafetySnapshotFile,
  mirrorProjectSafetySnapshotsToFiles,
  quarantineSuspiciousCanvasSave,
  writeProjectSafetyBackupFile,
  pruneProjectSafetyBackupFiles,
  readAllProjectCanvasStates,
  maybeRunProjectSafetyAutoBackup,
  beforeProjectCanvasSave,
  restoreProjectSafetySnapshot,
  PROJECT_SAFETY_PROMPT_ID,
  PROJECT_SAFETY_PROMPT_STYLE_ID,
  PROJECT_SAFETY_PROMPT_DISMISS_PREFIX,
  PROJECT_SAFETY_PROMPT_DISMISSED_PROJECT_PREFIX,
  ensureProjectSafetyBlockedPromptStyle,
  removeProjectSafetyBlockedPrompt,
  isProjectSafetySaveAcceptedForProject,
  showProjectSafetyBlockedPrompt,
  getCurrentProjectSafetyInfo,
  clearDesktopStorage
};

var {
  getDesktopStorageItems,
  setDesktopStorageItems,
  clearIndexedDesktopStorage
} = require("./storage.cjs");
var { createChromeShim } = require("./chrome-shim.cjs");
var chromeShim = createChromeShim();
