import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const home = os.homedir();
const indexedDbRoot = process.env.WANJUAN_SCAN_INDEXEDDB ||
  path.join(home, "Library", "Application Support", "wanjuan-ai-canvas-desktop-test", "IndexedDB");
const mediaRoot = process.env.WANJUAN_SCAN_MEDIA ||
  path.join(home, "Downloads", "万卷灵境", "万卷画布媒体库");
const outputRoot = process.env.WANJUAN_SCAN_OUTPUT ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "reports");
const generatedAt = new Date();
const stamp = generatedAt.toISOString().replace(/[:.]/g, "-");

function walkFiles(root, files = []) {
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "LOCK") continue;
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(filePath, files);
    else if (entry.isFile()) {
      const stat = fs.statSync(filePath);
      files.push({ path: filePath, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return files;
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

function sniffMedia(filePath) {
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(64);
  let bytes = 0;
  try {
    bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const head = buffer.subarray(0, bytes);
  const ascii = head.toString("ascii");
  if (head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image/png";
  if (head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (ascii.startsWith("GIF8")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") return "audio/wav";
  if (ascii.slice(4, 8) === "ftyp") return "video/mp4";
  if (head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  if (ascii.startsWith("ID3") || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii.startsWith("OggS")) return "audio/ogg";
  if (ascii.startsWith("fLaC")) return "audio/flac";
  return "";
}

function scanEmbeddedMedia(files) {
  const items = [];
  let scanned = 0;
  for (const file of files) {
    const content = fs.readFileSync(file.path).toString("latin1");
    const pattern = /data:(image|video|audio)\/([a-zA-Z0-9.+-]+)(?:;[^,;]+)*;base64,([a-zA-Z0-9+/=]+)/g;
    for (const match of content.matchAll(pattern)) {
      const encoded = match[3];
      const buffer = Buffer.from(encoded, "base64");
      if (!buffer.length) continue;
      items.push({
        sourcePath: file.path,
        mime: `${match[1]}/${match[2]}`,
        encodedBytes: encoded.length,
        decodedBytes: buffer.length,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex")
      });
    }
    scanned += 1;
    if (scanned % 50 === 0 || scanned === files.length) {
      process.stderr.write(`\rIndexedDB embedded media scan: ${scanned}/${files.length} files, ${items.length} media values`);
    }
  }
  if (files.length) process.stderr.write("\n");
  return items;
}

function duplicateEmbeddedMedia(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.sha256)) groups.set(item.sha256, []);
    groups.get(item.sha256).push(item);
  }
  const duplicates = [...groups.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([sha256, matches]) => ({
      sha256,
      size: matches[0].decodedBytes,
      count: matches.length,
      reclaimableBytes: matches[0].decodedBytes * (matches.length - 1),
      sourcePaths: [...new Set(matches.map((item) => item.sourcePath))]
    }))
    .sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);
  return {
    duplicateGroupCount: duplicates.length,
    duplicateValueCount: duplicates.reduce((total, group) => total + group.count - 1, 0),
    reclaimableBytes: duplicates.reduce((total, group) => total + group.reclaimableBytes, 0),
    groups: duplicates
  };
}

function sum(files) {
  return files.reduce((total, file) => total + file.size, 0);
}

function groupBySize(files) {
  const groups = new Map();
  for (const file of files) {
    if (!groups.has(file.size)) groups.set(file.size, []);
    groups.get(file.size).push(file);
  }
  return groups;
}

function hashFiles(files, label) {
  let done = 0;
  let bytes = 0;
  const totalBytes = sum(files);
  for (const file of files) {
    file.sha256 ||= sha256File(file.path);
    done += 1;
    bytes += file.size;
    if (done % 200 === 0 || done === files.length) {
      process.stderr.write(`\r${label}: ${done}/${files.length} files, ${formatBytes(bytes)}/${formatBytes(totalBytes)}`);
    }
  }
  if (files.length) process.stderr.write("\n");
}

function duplicateReport(files, label) {
  const candidates = [...groupBySize(files).values()].filter((group) => group.length > 1).flat();
  hashFiles(candidates, `${label} duplicate hashing`);
  const byHash = new Map();
  for (const file of candidates) {
    if (!byHash.has(file.sha256)) byHash.set(file.sha256, []);
    byHash.get(file.sha256).push(file);
  }
  const groups = [...byHash.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([sha256, matches]) => ({
      sha256,
      size: matches[0].size,
      count: matches.length,
      reclaimableBytes: matches[0].size * (matches.length - 1),
      paths: matches.map((file) => file.path)
    }))
    .sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);
  return {
    duplicateGroupCount: groups.length,
    duplicateFileCount: groups.reduce((total, group) => total + group.count - 1, 0),
    reclaimableBytes: groups.reduce((total, group) => total + group.reclaimableBytes, 0),
    groups
  };
}

function mediaProjectReport(files, root) {
  hashFiles(files, "Media project attribution hashing");
  const projects = new Map();
  for (const file of files) {
    const relative = path.relative(root, file.path);
    const projectId = relative.split(path.sep)[0] || "(root)";
    if (!projects.has(projectId)) projects.set(projectId, []);
    projects.get(projectId).push(file);
  }
  return [...projects.entries()].map(([projectId, matches]) => {
    const uniqueByHash = new Map(matches.map((file) => [file.sha256, file]));
    const totalBytes = sum(matches);
    const uniqueBytes = sum([...uniqueByHash.values()]);
    return {
      projectId,
      fileCount: matches.length,
      uniqueFileCount: uniqueByHash.size,
      duplicateFileCount: matches.length - uniqueByHash.size,
      totalBytes,
      uniqueBytes,
      duplicateBytes: totalBytes - uniqueBytes,
      duplicateRatio: totalBytes ? (totalBytes - uniqueBytes) / totalBytes : 0
    };
  }).sort((a, b) => b.totalBytes - a.totalBytes);
}

function recommendPilotProject(projects) {
  const candidates = projects.filter((project) =>
    project.projectId !== "default" &&
    project.totalBytes >= 20 * 1024 * 1024 &&
    project.totalBytes <= 500 * 1024 * 1024 &&
    project.duplicateBytes > 0
  );
  return [...candidates].sort((a, b) =>
    b.duplicateRatio - a.duplicateRatio ||
    a.totalBytes - b.totalBytes
  )[0] || null;
}

function formatBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = Number(bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function snapshotRoot(root) {
  const stat = fs.statSync(root);
  return { root, mtimeMs: stat.mtimeMs, mtime: stat.mtime.toISOString() };
}

function markdown(report) {
  const lines = [
    "# 万卷灵境旧项目存储迁移预览",
    "",
    `生成时间：${report.generatedAt}`,
    "",
    "> 本报告由只读扫描生成。扫描过程中未迁移、删除或改写正式项目、IndexedDB 或媒体库。",
    "",
    "## 结论摘要",
    "",
    `- 正式 IndexedDB 总体积：${formatBytes(report.indexedDb.totalBytes)}，其中 Blob 文件 ${report.indexedDb.blobFileCount} 个，共 ${formatBytes(report.indexedDb.blobBytes)}。`,
    `- IndexedDB 序列化记录中嵌入媒体值：${report.indexedDb.embeddedMedia.count} 个，解码后共 ${formatBytes(report.indexedDb.embeddedMedia.decodedBytes)}，序列化 Base64 文本约 ${formatBytes(report.indexedDb.embeddedMedia.encodedBytes)}。这是迁移为本地文件引用后的理论候选释放量，不等于立即可删除量。`,
    `- IndexedDB 嵌入媒体值内部确认重复：${report.indexedDb.embeddedMedia.duplicates.duplicateValueCount} 个重复值，解码口径约 ${formatBytes(report.indexedDb.embeddedMedia.duplicates.reclaimableBytes)}。`,
    `- IndexedDB Blob 内部确认重复：${report.indexedDb.duplicates.duplicateFileCount} 个重复副本，可保守释放约 ${formatBytes(report.indexedDb.duplicates.reclaimableBytes)}。`,
    `- 正式媒体库：${report.mediaLibrary.fileCount} 个文件，共 ${formatBytes(report.mediaLibrary.totalBytes)}。`,
    `- 正式媒体库内部确认重复：${report.mediaLibrary.duplicates.duplicateFileCount} 个重复副本，可保守释放约 ${formatBytes(report.mediaLibrary.duplicates.reclaimableBytes)}。`,
    `- IndexedDB 嵌入媒体与媒体库内容完全相同：${report.crossStore.matchCount} 个媒体值，共 ${formatBytes(report.crossStore.matchBytes)}。迁移时这些内容可直接复用已有媒体文件。`,
    "",
    "## 建议的实际测试顺序",
    "",
    "1. 先在实验 App 中复制一个正式项目及其素材，只迁移该项目。",
    "2. 验证节点显示、再次生成、复制节点、项目切换、资源库、上传引用和备份导入导出。",
    "3. 对比迁移前后项目状态大小和启动耗时。",
    "4. 仅在迁移完成并保留回滚快照后，清理已确认无引用的旧 Blob 与重复媒体。",
    "",
    "## 建议的首批测试项目",
    "",
    "以下项目目录按当前体积排序。首轮建议选择体积适中、重复率较高且仍能人工核对内容的项目。",
    "",
    report.mediaLibrary.recommendedPilot
      ? `自动建议试点：\`${report.mediaLibrary.recommendedPilot.projectId}\`，当前 ${formatBytes(report.mediaLibrary.recommendedPilot.totalBytes)}，其中精确重复约 ${formatBytes(report.mediaLibrary.recommendedPilot.duplicateBytes)}（${(report.mediaLibrary.recommendedPilot.duplicateRatio * 100).toFixed(1)}%）。`
      : "自动建议试点：没有找到 20 MiB 至 500 MiB 且包含精确重复内容的非默认项目，请人工选择较小项目。",
    ""
  ];
  for (const project of report.mediaLibrary.projects.slice(0, 12)) {
    lines.push(`- \`${project.projectId}\`：${project.fileCount} 个文件，当前 ${formatBytes(project.totalBytes)}，内容去重后约 ${formatBytes(project.uniqueBytes)}，精确重复 ${project.duplicateFileCount} 份 / ${formatBytes(project.duplicateBytes)}（${(project.duplicateRatio * 100).toFixed(1)}%）。`);
  }
  lines.push(
    "",
    "## 最大重复组",
    "",
    "### 媒体库",
    ""
  );
  for (const group of report.mediaLibrary.duplicates.groups.slice(0, 20)) {
    lines.push(`- ${group.count} 份 × ${formatBytes(group.size)}，可释放 ${formatBytes(group.reclaimableBytes)}，SHA-256 \`${group.sha256.slice(0, 16)}...\``);
  }
  lines.push("", "### IndexedDB Blob", "");
  for (const group of report.indexedDb.duplicates.groups.slice(0, 20)) {
    lines.push(`- ${group.count} 份 × ${formatBytes(group.size)}，可释放 ${formatBytes(group.reclaimableBytes)}，SHA-256 \`${group.sha256.slice(0, 16)}...\``);
  }
  lines.push(
    "",
    "## 口径说明",
    "",
    "- 保守可释放量只统计内容哈希完全相同的重复文件。",
    "- IndexedDB 媒体候选量通过扫描 Chromium 序列化记录中的媒体 Base64 计算，不包含远程 URL 和纯本地路径引用。",
    "- LevelDB 日志和表文件不能通过删除单条记录等比例释放，需要 Chromium 后续压缩，因此不计入立即可释放量。",
    "- 本报告不判断素材是否仍被项目、资源库、撤销历史或备份引用；正式清理前必须建立引用清单。"
  );
  return `${lines.join("\n")}\n`;
}

console.error("Scanning file inventories...");
const indexedDbFiles = walkFiles(indexedDbRoot);
const blobFiles = indexedDbFiles.filter((file) => file.path.includes(".indexeddb.blob"));
const levelDbFiles = indexedDbFiles.filter((file) => file.path.includes(".indexeddb.leveldb"));
const mediaFiles = walkFiles(mediaRoot);

console.error("Sniffing IndexedDB Blob media...");
for (const file of blobFiles) file.mime = sniffMedia(file.path);
const mediaBlobFiles = blobFiles.filter((file) => file.mime);
const embeddedMedia = scanEmbeddedMedia(blobFiles);
const embeddedMediaDuplicates = duplicateEmbeddedMedia(embeddedMedia);

const indexedDbDuplicates = duplicateReport(blobFiles, "IndexedDB Blob");
const mediaDuplicates = duplicateReport(mediaFiles, "Media library");
const mediaProjects = mediaProjectReport(mediaFiles, mediaRoot);
const recommendedPilot = recommendPilotProject(mediaProjects);

const embeddedSizes = new Set(embeddedMedia.map((item) => item.decodedBytes));
const crossMediaCandidates = mediaFiles.filter((file) => embeddedSizes.has(file.size));
hashFiles(crossMediaCandidates, "Media cross-store hashing");
const mediaHashes = new Map(crossMediaCandidates.map((file) => [file.sha256, file]));
const crossMatches = embeddedMedia.filter((item) => mediaHashes.has(item.sha256));

const report = {
  version: 1,
  generatedAt: generatedAt.toISOString(),
  readOnly: true,
  rootsBefore: {
    indexedDb: snapshotRoot(indexedDbRoot),
    mediaLibrary: snapshotRoot(mediaRoot)
  },
  indexedDb: {
    root: indexedDbRoot,
    fileCount: indexedDbFiles.length,
    totalBytes: sum(indexedDbFiles),
    levelDbFileCount: levelDbFiles.length,
    levelDbBytes: sum(levelDbFiles),
    blobFileCount: blobFiles.length,
    blobBytes: sum(blobFiles),
    mediaBlobCount: mediaBlobFiles.length,
    mediaBlobBytes: sum(mediaBlobFiles),
    mediaByMime: Object.fromEntries(
      [...new Set(mediaBlobFiles.map((file) => file.mime))].sort().map((mime) => {
        const matches = mediaBlobFiles.filter((file) => file.mime === mime);
        return [mime, { count: matches.length, bytes: sum(matches) }];
      })
    ),
    embeddedMedia: {
      count: embeddedMedia.length,
      encodedBytes: embeddedMedia.reduce((total, item) => total + item.encodedBytes, 0),
      decodedBytes: embeddedMedia.reduce((total, item) => total + item.decodedBytes, 0),
      byMime: Object.fromEntries(
        [...new Set(embeddedMedia.map((item) => item.mime))].sort().map((mime) => {
          const matches = embeddedMedia.filter((item) => item.mime === mime);
          return [mime, {
            count: matches.length,
            encodedBytes: matches.reduce((total, item) => total + item.encodedBytes, 0),
            decodedBytes: matches.reduce((total, item) => total + item.decodedBytes, 0)
          }];
        })
      ),
      duplicates: embeddedMediaDuplicates
    },
    duplicates: indexedDbDuplicates
  },
  mediaLibrary: {
    root: mediaRoot,
    fileCount: mediaFiles.length,
    totalBytes: sum(mediaFiles),
    projectDirectoryCount: fs.readdirSync(mediaRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length,
    projects: mediaProjects,
    recommendedPilot,
    duplicates: mediaDuplicates
  },
  crossStore: {
    matchCount: crossMatches.length,
    matchBytes: crossMatches.reduce((total, item) => total + item.decodedBytes, 0),
    matches: crossMatches.map((item) => ({
      sha256: item.sha256,
      size: item.decodedBytes,
      indexedDbPath: item.sourcePath,
      mime: item.mime,
      mediaPath: mediaHashes.get(item.sha256).path
    }))
  },
  rootsAfter: {
    indexedDb: snapshotRoot(indexedDbRoot),
    mediaLibrary: snapshotRoot(mediaRoot)
  }
};

fs.mkdirSync(outputRoot, { recursive: true });
const jsonPath = path.join(outputRoot, `storage-migration-preview-${stamp}.json`);
const markdownPath = path.join(outputRoot, `storage-migration-preview-${stamp}.md`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(markdownPath, markdown(report));
console.log(JSON.stringify({ jsonPath, markdownPath, summary: {
  indexedDbBytes: report.indexedDb.totalBytes,
  indexedDbMediaCandidateBytes: report.indexedDb.embeddedMedia.decodedBytes,
  indexedDbDuplicateBytes: report.indexedDb.duplicates.reclaimableBytes,
  mediaLibraryBytes: report.mediaLibrary.totalBytes,
  mediaDuplicateBytes: report.mediaLibrary.duplicates.reclaimableBytes,
  crossStoreMatchBytes: report.crossStore.matchBytes
}}, null, 2));
