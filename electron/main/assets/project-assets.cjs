// 项目素材管理：素材持久化、扫描匹配、外部素材导出/校验与清单注入。
const fs = require("fs");
const path = require("path");

const {
  ensureExtname,
  guessMimeFromFilename,
  extensionFromMime,
  assetKindFromMime
} = require("../utils/mime.cjs");
const { sha256Buffer, sha256File, portableValueFromBuffer } = require("../utils/crypto.cjs");
const {
  sanitizeFilename,
  sanitizePathSegment,
  defaultDownloadDirectory,
  mediaLibraryRoot,
  localPathFromFileUrl,
  basenameWithoutExt,
  bufferFromDataUrlValue
} = require("../utils/paths.cjs");
const { resolveAssetPayload, normalizeImagePayload, readLocalFilePayload } = require("../media/payload.cjs");
const { writeContentAddressedFile, writeContentAddressedFileFromPath, diagnoseContentStore } = require("./content-store.cjs");

async function persistProjectAsset(payload = {}) {
  const downloadRoot = payload?.directory || defaultDownloadDirectory();
  const projectId = sanitizePathSegment(payload?.projectId || "default", "default");
  const nodeId = sanitizePathSegment(payload?.nodeId || "node", "node");
  const field = sanitizePathSegment(payload?.field || "asset", "asset");
  const kind = String(payload?.kind || "binary").trim() || "binary";
  const assetId = sanitizePathSegment(
    payload?.assetId || `${kind}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    `${kind}-${Date.now()}`
  );
  const projectRoot = path.join(mediaLibraryRoot(downloadRoot), projectId);
  const forceArchiveSource = payload?.forceArchiveExistingFile && payload?.localPath && fs.existsSync(payload.localPath)
    ? path.resolve(payload.localPath)
    : "";
  if (forceArchiveSource) {
    const filename = ensureExtname(sanitizeFilename(payload?.filename || path.basename(forceArchiveSource)), payload?.mime);
    const finalMime = payload?.mime || guessMimeFromFilename(filename) || guessMimeFromFilename(forceArchiveSource);
    const stored = await writeContentAddressedFileFromPath(
      projectRoot,
      forceArchiveSource,
      extensionFromMime(finalMime) || path.extname(forceArchiveSource)
    );
    const stat = fs.statSync(stored.path);
    return {
      ok: true,
      assetId,
      kind,
      mime: finalMime,
      filename,
      localPath: stored.path,
      projectId,
      nodeId,
      field,
      size: stat.size,
      savedAt: new Date().toISOString(),
      sha256: stored.sha256,
      deduplicated: stored.deduplicated,
      contentAddressed: true,
      archivedFromExistingFile: true,
      valueFormat: /^(image|video|audio)\//i.test(finalMime) ? "file-url" : undefined
    };
  }
  const resolved = await resolveAssetPayload(payload);
  const shouldNormalizeImage =
    /^image\//i.test(String(resolved.mime || "")) ||
    /^image$/i.test(kind) ||
    /^image/i.test(field);
  const normalized = shouldNormalizeImage
    ? normalizeImagePayload(resolved.buffer, resolved.mime)
    : { buffer: resolved.buffer, mime: resolved.mime };
  const buffer = normalized.buffer;
  const mime = normalized.mime || resolved.mime;
  const rawFilename = resolved.filename;
  const sourceName = sanitizeFilename(rawFilename || `${field}-${assetId}`);
  const filename = ensureExtname(sourceName, mime);
  const finalMime = mime || guessMimeFromFilename(filename);
  if ((/^video\//i.test(finalMime) || /^audio\//i.test(finalMime)) && buffer.length < 1024) {
    throw new Error("Media asset is empty or too small to save");
  }
  const stored = await writeContentAddressedFile(
    projectRoot,
    buffer,
    extensionFromMime(finalMime) || path.extname(filename)
  );
  const targetPath = stored.path;
  const stat = fs.statSync(targetPath);
  const isBinaryMedia =
    /^image\//i.test(finalMime) ||
    /^video\//i.test(finalMime) ||
    /^audio\//i.test(finalMime);
  const portableValue = isBinaryMedia
    ? { valueFormat: "file-url" }
    : portableValueFromBuffer(buffer, finalMime);
  return {
    ok: true,
    assetId,
    kind,
    mime: finalMime,
    filename,
    localPath: targetPath,
    projectId,
    nodeId,
    field,
    size: stat.size,
    savedAt: new Date().toISOString(),
    sha256: stored.sha256,
    deduplicated: stored.deduplicated,
    contentAddressed: true,
    ...portableValue
  };
}

function diagnoseProjectAssets(payload = {}) {
  const downloadRoot = payload?.directory || defaultDownloadDirectory();
  const root = mediaLibraryRoot(downloadRoot);
  return diagnoseContentStore(root);
}

async function checkProjectAssets(payload = {}) {
  const paths = Array.isArray(payload?.paths) ? payload.paths : [];
  return {
    ok: true,
    assets: paths.map((assetPath) => {
      const normalized = String(assetPath || "").trim();
      if (!normalized) return { path: normalized, exists: false };
      try {
        const exists = fs.existsSync(normalized);
        const stat = exists ? fs.statSync(normalized) : null;
        return {
          path: normalized,
          exists,
          size: stat?.size || 0,
          updatedAt: stat?.mtime?.toISOString?.() || null
        };
      } catch (error) {
        return { path: normalized, exists: false, error: String(error?.message || error) };
      }
    })
  };
}

function normalizeAssetMatchName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getAssetMatchNames(entry = {}) {
  const names = new Set();
  [
    entry.filename,
    entry.originalName,
    entry.basename,
    entry.assetId,
    entry.localPath ? path.basename(entry.localPath) : ""
  ].forEach((value) => {
    const normalized = normalizeAssetMatchName(value);
    if (normalized) names.add(normalized);
  });
  return [...names];
}

function expectedAssetKind(entry = {}) {
  const kind = String(entry?.kind || "").toLowerCase();
  if (["image", "video", "audio", "text"].includes(kind)) return kind;
  return assetKindFromMime(entry?.mime || "", entry?.filename || entry?.originalName || entry?.localPath || "");
}

function fileMatchesExpectedMetadata(filePath, entry = {}, manifestItem = {}) {
  try {
    const stat = fs.statSync(filePath);
    const expectedSize = Number(entry?.size || manifestItem?.size || 0);
    if (expectedSize && stat.size !== expectedSize) return false;
    const expectedSha = String(entry?.sha256 || manifestItem?.sha256 || "").trim().toLowerCase();
    if (expectedSha && sha256File(filePath).toLowerCase() !== expectedSha) return false;
    return true;
  } catch {
    return false;
  }
}

function stringSimilarityScore(a, b) {
  const left = basenameWithoutExt(a);
  const right = basenameWithoutExt(b);
  if (!left || !right) return 0;
  if (left === right) return 30;
  if (left.includes(right) || right.includes(left)) return 18;
  const leftParts = new Set(left.split(/[^a-z0-9\u4e00-\u9fa5]+/i).filter((part) => part.length >= 2));
  const rightParts = new Set(right.split(/[^a-z0-9\u4e00-\u9fa5]+/i).filter((part) => part.length >= 2));
  if (!leftParts.size || !rightParts.size) return 0;
  let overlap = 0;
  for (const part of leftParts) {
    if (rightParts.has(part)) overlap += 1;
  }
  return Math.min(16, Math.round((overlap / Math.max(leftParts.size, rightParts.size)) * 16));
}

function manifestItemForFile(filePath, manifests = []) {
  const base = path.basename(filePath);
  for (const manifest of manifests) {
    const item = manifest.files.find((entry) => !entry?.error && entry?.filename === base);
    if (item) return item;
  }
  return null;
}

function buildProjectAssetCandidates(entry = {}, files = [], manifests = []) {
  const expectedKind = expectedAssetKind(entry);
  const expectedSize = Number(entry?.size || 0);
  const expectedAssetId = normalizeAssetMatchName(entry?.assetId || "");
  const expectedProjectId = String(entry?.projectId || "");
  const expectedNodeId = String(entry?.nodeId || "");
  const expectedField = String(entry?.field || "");
  const names = getAssetMatchNames(entry);
  const candidates = [];
  for (const filePath of files) {
    const base = path.basename(filePath);
    if (base === "wanjuan-external-assets-manifest.json" || base.startsWith(".")) continue;
    let stat = null;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    const manifestItem = manifestItemForFile(filePath, manifests);
    const mime = manifestItem?.mime || guessMimeFromFilename(filePath);
    const kind = String(manifestItem?.kind || assetKindFromMime(mime, filePath) || "").toLowerCase();
    if (expectedKind && kind && expectedKind !== kind) continue;
    let score = 0;
    const reasons = [];
    if (expectedKind && expectedKind === kind) {
      score += 45;
      reasons.push("类型一致");
    }
    const normalizedBase = normalizeAssetMatchName(base);
    if (expectedAssetId && normalizedBase.includes(expectedAssetId)) {
      score += 90;
      reasons.push("文件名包含素材ID");
    }
    for (const name of names) {
      const value = stringSimilarityScore(base, name);
      if (value > 0) {
        score += value;
        reasons.push("文件名相似");
        break;
      }
    }
    if (expectedSize && stat.size) {
      const diffRatio = Math.abs(stat.size - expectedSize) / Math.max(expectedSize, stat.size);
      if (diffRatio === 0) {
        score += 35;
        reasons.push("文件大小一致");
      } else if (diffRatio <= 0.05) {
        score += 24;
        reasons.push("文件大小接近");
      } else if (diffRatio <= 0.2) {
        score += 10;
        reasons.push("文件大小相近");
      }
    }
    if (manifestItem) {
      if (expectedProjectId && manifestItem.projectId === expectedProjectId) {
        score += 20;
        reasons.push("同项目");
      }
      if (expectedNodeId && manifestItem.nodeId === expectedNodeId) {
        score += 35;
        reasons.push("同节点");
      }
      if (expectedField && manifestItem.field === expectedField) {
        score += 10;
        reasons.push("同字段");
      }
      if (entry?.assetId && manifestItem.assetId === entry.assetId) {
        score += 120;
        reasons.push("素材ID一致");
      }
    }
    if (score < 35) continue;
    candidates.push({
      path: filePath,
      filename: base,
      originalName: manifestItem?.originalName || base,
      mime,
      kind,
      size: stat.size,
      sha256: manifestItem?.sha256 || "",
      score,
      reasons: [...new Set(reasons)].slice(0, 4),
      projectId: manifestItem?.projectId || "",
      nodeId: manifestItem?.nodeId || "",
      field: manifestItem?.field || "",
      assetId: manifestItem?.assetId || ""
    });
  }
  return candidates
    .sort((a, b) => b.score - a.score || Math.abs((a.size || 0) - expectedSize) - Math.abs((b.size || 0) - expectedSize))
    .slice(0, 8);
}

function walkAssetFolder(root, limit = 12000) {
  const files = [];
  const stack = [root];
  while (stack.length && files.length < limit) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
        if (files.length >= limit) break;
      }
    }
  }
  return files;
}

function loadProjectAssetManifests(files = []) {
  const manifests = [];
  for (const filePath of files) {
    if (path.basename(filePath) !== "wanjuan-external-assets-manifest.json") continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(manifest?.files)) continue;
      manifests.push({
        baseDir: path.dirname(filePath),
        files: manifest.files
      });
    } catch {
      // Ignore broken manifests and continue with filename matching.
    }
  }
  return manifests;
}

function findAssetFromManifests(entry = {}, manifests = []) {
  const nodeId = String(entry?.nodeId || "");
  const field = String(entry?.field || "");
  const assetId = String(entry?.assetId || "");
  for (const manifest of manifests) {
    const candidates = manifest.files.filter((item) => {
      if (item?.error) return false;
      if (nodeId && field && item.nodeId === nodeId && item.field === field) return true;
      if (assetId && item.assetId === assetId) return true;
      return false;
    });
    for (const item of candidates) {
      const filePath = path.join(manifest.baseDir, item.filename || item.originalName || "");
      if (filePath && fs.existsSync(filePath) && fileMatchesExpectedMetadata(filePath, entry, item)) return filePath;
    }
  }
  return "";
}

function findAssetManifestIssue(entry = {}, manifests = []) {
  const nodeId = String(entry?.nodeId || "");
  const field = String(entry?.field || "");
  const assetId = String(entry?.assetId || "");
  for (const manifest of manifests) {
    const candidates = manifest.files.filter((item) => {
      if (nodeId && field && item.nodeId === nodeId && item.field === field) return true;
      if (assetId && item.assetId === assetId) return true;
      return false;
    });
    for (const item of candidates) {
      const filePath = item?.filename ? path.join(manifest.baseDir, item.filename) : "";
      if (item?.error) {
        return {
          error: String(item.error),
          sourcePath: item.sourcePath || "",
          filename: item.filename || "",
          originalName: item.originalName || ""
        };
      }
      if (filePath && !fs.existsSync(filePath)) {
        return {
          error: "素材清单记录了该文件，但文件夹中缺少对应文件",
          sourcePath: item.sourcePath || "",
          filename: item.filename || "",
          originalName: item.originalName || ""
        };
      }
    }
  }
  return null;
}

async function findProjectAssetsInFolder(payload = {}) {
  const folderPath = String(payload?.folderPath || payload?.path || "").trim();
  if (!folderPath || !fs.existsSync(folderPath)) {
    return { ok: false, error: "素材文件夹不存在", matches: [] };
  }
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const files = walkAssetFolder(folderPath);
  const manifests = loadProjectAssetManifests(files);
  const byName = new Map();
  for (const filePath of files) {
    const base = normalizeAssetMatchName(path.basename(filePath));
    if (!base) continue;
    if (!byName.has(base)) byName.set(base, filePath);
  }
  const matches = entries.map((entry) => {
    const names = getAssetMatchNames(entry);
    let match = findAssetFromManifests(entry, manifests);
    for (const name of names) {
      if (match) break;
      if (byName.has(name)) {
        const candidatePath = byName.get(name);
        if (fileMatchesExpectedMetadata(candidatePath, entry, {})) match = candidatePath;
        break;
      }
    }
    if (!match && entry?.assetId) {
      const assetId = normalizeAssetMatchName(entry.assetId);
      const found = files.find((filePath) =>
        normalizeAssetMatchName(path.basename(filePath)).includes(assetId) &&
        fileMatchesExpectedMetadata(filePath, entry, {})
      );
      if (found) match = found;
    }
    const manifestIssue = match ? null : findAssetManifestIssue(entry, manifests);
    const candidates = match ? [] : buildProjectAssetCandidates(entry, files, manifests);
    return {
      nodeId: entry?.nodeId || "",
      field: entry?.field || "",
      assetId: entry?.assetId || "",
      originalName: entry?.originalName || entry?.filename || "",
      path: match,
      error: manifestIssue?.error || "",
      sourcePath: manifestIssue?.sourcePath || "",
      manifestFilename: manifestIssue?.filename || "",
      manifestOriginalName: manifestIssue?.originalName || "",
      candidates
    };
  });
  return {
    ok: true,
    folderPath,
    scanned: files.length,
    matched: matches.filter((entry) => entry.path).length,
    unavailable: matches.filter((entry) => !entry.path && entry.error),
    candidateCount: matches.reduce((total, entry) => total + (Array.isArray(entry.candidates) ? entry.candidates.length : 0), 0),
    matches
  };
}

function uniqueAssetExportPath(folderPath, preferredName, fallbackName) {
  const safeName = sanitizeFilename(preferredName || fallbackName || `asset-${Date.now()}`);
  const parsed = path.parse(safeName);
  let target = path.join(folderPath, safeName);
  let index = 1;
  while (fs.existsSync(target)) {
    target = path.join(folderPath, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return target;
}

function resolveAssetExportBuffer(entry = {}) {
  const sourcePath =
    entry?.path ||
    entry?.localPath ||
    localPathFromFileUrl(entry?.value) ||
    localPathFromFileUrl(entry?.portableData) ||
    "";
  if (sourcePath && fs.existsSync(sourcePath)) {
    const file = readLocalFilePayload(sourcePath);
    return {
      buffer: file.buffer,
      mime: file.mime,
      source: "file",
      sourcePath
    };
  }
  const dataUrl =
    (typeof entry?.dataUrl === "string" && entry.dataUrl.startsWith("data:") && entry.dataUrl) ||
    (typeof entry?.portableData === "string" && entry.portableData.startsWith("data:") && entry.portableData) ||
    (typeof entry?.value === "string" && entry.value.startsWith("data:") && entry.value) ||
    "";
  const data = bufferFromDataUrlValue(dataUrl);
  if (!data) {
    const plainText =
      (typeof entry?.portableData === "string" && entry.portableData) ||
      (typeof entry?.value === "string" && entry.value) ||
      "";
    if (plainText.startsWith("external-asset-file:")) return null;
    if (
      /^file:\/\//i.test(plainText) &&
      ["image", "video", "audio"].includes(String(entry?.kind || assetKindFromMime(entry?.mime || "", entry?.filename || "")).toLowerCase())
    ) {
      return null;
    }
    if (!plainText) return null;
    return {
      buffer: Buffer.from(plainText, "utf8"),
      mime: entry?.mime || "text/plain",
      source: "portable-text",
      sourcePath
    };
  }
  return {
    ...data,
    source: "data-url",
    sourcePath
  };
}

function validateExternalProjectAssetFiles(assetFiles = []) {
  const entries = Array.isArray(assetFiles) ? assetFiles.filter(Boolean) : [];
  const missingAssets = [];
  for (const [index, entry] of entries.entries()) {
    try {
      const source = resolveAssetExportBuffer(entry);
      if (!source?.buffer?.length) {
        missingAssets.push({
          index,
          projectId: entry?.projectId || "",
          nodeId: entry?.nodeId || "",
          field: entry?.field || "",
          assetId: entry?.assetId || "",
          originalName: entry?.originalName || entry?.filename || "",
          sourcePath: entry?.path || entry?.localPath || localPathFromFileUrl(entry?.value) || localPathFromFileUrl(entry?.portableData) || "",
          error: entry?.path || entry?.localPath ? "源素材文件不存在，且没有可恢复的内嵌素材数据" : "没有可导出的素材数据"
        });
      }
    } catch (error) {
      missingAssets.push({
        index,
        projectId: entry?.projectId || "",
        nodeId: entry?.nodeId || "",
        field: entry?.field || "",
        assetId: entry?.assetId || "",
        originalName: entry?.originalName || entry?.filename || "",
        sourcePath: entry?.path || entry?.localPath || "",
        error: String(error?.message || error)
      });
    }
  }
  return {
    ok: missingAssets.length === 0,
    total: entries.length,
    missingAssets
  };
}

function copyExternalProjectAssetFiles(targetJsonPath, assetFiles = [], requestedFolderName = "") {
  const entries = Array.isArray(assetFiles) ? assetFiles.filter(Boolean) : [];
  if (!entries.length) return null;
  const parsed = path.parse(targetJsonPath);
  const folderName = sanitizeFilename(requestedFolderName || `${parsed.name}-external-assets`);
  const folderPath = path.join(parsed.dir, folderName);
  fs.mkdirSync(folderPath, { recursive: true });
  const manifest = {
    version: 2,
    exportedAt: new Date().toISOString(),
    total: entries.length,
    physicalFileCount: 0,
    files: []
  };
  const exportedByHash = new Map();
  for (const entry of entries) {
    const source = resolveAssetExportBuffer(entry);
    const preferredName =
      entry.exportName ||
      entry.originalName ||
      entry.filename ||
      (entry.path ? path.basename(entry.path) : "");
    const fallbackExt = extensionFromMime(source?.mime || entry.mime || "") || path.extname(preferredName) || ".bin";
    try {
      if (!source) throw new Error(entry?.path ? "源素材文件不存在，且没有可恢复的内嵌素材数据" : "没有可导出的素材数据");
      const contentHash = sha256Buffer(source.buffer);
      const existingTargetPath = exportedByHash.get(contentHash);
      const targetPath = existingTargetPath ||
        uniqueAssetExportPath(folderPath, preferredName, `asset-${manifest.files.length + 1}${fallbackExt}`);
      if (!existingTargetPath) {
        fs.writeFileSync(targetPath, source.buffer);
        exportedByHash.set(contentHash, targetPath);
        manifest.physicalFileCount += 1;
      }
      const stat = fs.statSync(targetPath);
      manifest.files.push({
        projectId: entry.projectId || "",
        nodeId: entry.nodeId || "",
        field: entry.field || "",
        assetId: entry.assetId || "",
        kind: entry.kind || "",
        originalName: entry.originalName || entry.filename || (entry.path ? path.basename(entry.path) : path.basename(targetPath)),
        filename: path.basename(targetPath),
        size: stat.size,
        sha256: contentHash,
        deduplicated: Boolean(existingTargetPath),
        mime: source.mime || entry.mime || "",
        source: source.source || "file",
        sourceOrigin: entry.sourceOrigin || "",
        portableDataRef: entry.portableDataRef || "",
        sourcePath: source.sourcePath || entry.path || ""
      });
    } catch (error) {
      manifest.files.push({
        projectId: entry.projectId || "",
        nodeId: entry.nodeId || "",
        field: entry.field || "",
        assetId: entry.assetId || "",
        kind: entry.kind || "",
        mime: entry.mime || "",
        sourceOrigin: entry.sourceOrigin || "",
        originalName: entry.originalName || entry.filename || (entry.path ? path.basename(entry.path) : ""),
        sourcePath: entry.path || "",
        error: String(error?.message || error)
      });
    }
  }
  manifest.copied = manifest.files.filter((entry) => !entry.error).length;
  manifest.failed = manifest.files.filter((entry) => entry.error).length;
  fs.writeFileSync(path.join(folderPath, "wanjuan-external-assets-manifest.json"), JSON.stringify(manifest, null, 2));
  return {
    folderPath,
    folderName,
    copied: manifest.copied,
    failed: manifest.failed,
    manifest
  };
}

function summarizeExternalAssetBundle(assetBundle) {
  if (!assetBundle?.manifest) return null;
  const manifest = assetBundle.manifest;
  return {
    version: manifest.version || 2,
    manifestVersion: manifest.version || 2,
    folderName: assetBundle.folderName || "",
    fileCount: Array.isArray(manifest.files) ? manifest.files.length : 0,
    physicalFileCount: Number(manifest.physicalFileCount || 0),
    copied: assetBundle.copied || 0,
    failed: assetBundle.failed || 0,
    assets: (manifest.files || []).map((entry) => ({
      projectId: entry.projectId || "",
      nodeId: entry.nodeId || "",
      field: entry.field || "",
      assetId: entry.assetId || "",
      kind: entry.kind || "",
      mime: entry.mime || "",
      size: entry.size || 0,
      sha256: entry.sha256 || "",
      filename: entry.filename || "",
      originalName: entry.originalName || "",
      sourceOrigin: entry.sourceOrigin || "",
      deduplicated: entry.deduplicated === true,
      error: entry.error || ""
    }))
  };
}

function injectExternalAssetBundleSummary(text, assetBundle) {
  if (!assetBundle || typeof text !== "string") return null;
  try {
    const parsed = JSON.parse(text || "{}");
    if (!parsed?.modules?.projects) return null;
    return JSON.stringify({
      ...parsed,
      modules: {
        ...parsed.modules,
        projects: {
          ...parsed.modules.projects,
          externalAssetBundle: summarizeExternalAssetBundle(assetBundle)
        }
      }
    }, null, 2);
  } catch {
    return null;
  }
}

async function removeProjectAssets(payload = {}) {
  const downloadRoot = payload?.directory || defaultDownloadDirectory();
  const projectId = sanitizePathSegment(payload?.projectId || "default", "default");
  const projectRoot = path.join(mediaLibraryRoot(downloadRoot), projectId);
  try {
    if (fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    return { ok: true, path: projectRoot, removed: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error), path: projectRoot };
  }
}

module.exports = {
  persistProjectAsset,
  diagnoseProjectAssets,
  checkProjectAssets,
  normalizeAssetMatchName,
  getAssetMatchNames,
  expectedAssetKind,
  fileMatchesExpectedMetadata,
  stringSimilarityScore,
  manifestItemForFile,
  buildProjectAssetCandidates,
  walkAssetFolder,
  loadProjectAssetManifests,
  findAssetFromManifests,
  findAssetManifestIssue,
  findProjectAssetsInFolder,
  uniqueAssetExportPath,
  resolveAssetExportBuffer,
  validateExternalProjectAssetFiles,
  copyExternalProjectAssetFiles,
  summarizeExternalAssetBundle,
  injectExternalAssetBundleSummary,
  removeProjectAssets
};
