// Experimental content-addressed media store. It never deletes source files.
const fs = require("fs");
const path = require("path");
const { sha256Buffer, sha256File } = require("../utils/crypto.cjs");

const pendingWrites = new Map();

function contentAddressedPath(projectRoot, buffer, extension = "") {
  const sha256 = sha256Buffer(buffer);
  const normalizedExtension = String(extension || "").startsWith(".") ? extension : extension ? `.${extension}` : "";
  return {
    sha256,
    path: path.join(projectRoot, "blobs", `${sha256}${normalizedExtension.toLowerCase()}`)
  };
}

async function writeContentAddressedFile(projectRoot, buffer, extension = "") {
  const addressed = contentAddressedPath(projectRoot, buffer, extension);
  const existing = pendingWrites.get(addressed.path);
  if (existing) {
    return existing.then((result) => ({
      ...result,
      deduplicated: true,
      created: false
    }));
  }

  const operation = Promise.resolve().then(() => {
    fs.mkdirSync(path.dirname(addressed.path), { recursive: true });
    if (fs.existsSync(addressed.path)) {
      return { ...addressed, deduplicated: true, created: false };
    }

    const temporaryPath = `${addressed.path}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
    try {
      fs.writeFileSync(temporaryPath, buffer, { flag: "wx" });
      try {
        fs.renameSync(temporaryPath, addressed.path);
        return { ...addressed, deduplicated: false, created: true };
      } catch (error) {
        if (!fs.existsSync(addressed.path)) throw error;
        return { ...addressed, deduplicated: true, created: false };
      }
    } finally {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch {}
    }
  }).finally(() => {
    pendingWrites.delete(addressed.path);
  });

  pendingWrites.set(addressed.path, operation);
  return operation;
}

function walkFiles(root, results = []) {
  if (!root || !fs.existsSync(root)) return results;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(entryPath, results);
    else if (entry.isFile()) results.push(entryPath);
  }
  return results;
}

function diagnoseContentStore(root) {
  const files = walkFiles(root);
  const bySize = new Map();
  let totalBytes = 0;
  for (const filePath of files) {
    const size = fs.statSync(filePath).size;
    totalBytes += size;
    if (!bySize.has(size)) bySize.set(size, []);
    bySize.get(size).push(filePath);
  }

  const duplicateGroups = [];
  let reclaimableBytes = 0;
  for (const [size, candidates] of bySize) {
    if (candidates.length < 2) continue;
    const byHash = new Map();
    for (const filePath of candidates) {
      const sha256 = sha256File(filePath);
      if (!byHash.has(sha256)) byHash.set(sha256, []);
      byHash.get(sha256).push(filePath);
    }
    for (const [sha256, matches] of byHash) {
      if (matches.length < 2) continue;
      reclaimableBytes += size * (matches.length - 1);
      duplicateGroups.push({ sha256, size, count: matches.length, paths: matches });
    }
  }

  return {
    ok: true,
    root,
    fileCount: files.length,
    totalBytes,
    duplicateGroupCount: duplicateGroups.length,
    duplicateFileCount: duplicateGroups.reduce((sum, group) => sum + group.count - 1, 0),
    reclaimableBytes,
    duplicateGroups
  };
}

module.exports = {
  contentAddressedPath,
  writeContentAddressedFile,
  diagnoseContentStore
};
