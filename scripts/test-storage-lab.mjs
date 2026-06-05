import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  contentAddressedPath,
  writeContentAddressedFile,
  writeContentAddressedFileFromPath,
  diagnoseContentStore
} = require("../electron/main/assets/content-store.cjs");

const root = mkdtempSync(join(tmpdir(), "wanjuan-storage-lab-"));
try {
  const body = Buffer.from("same-media-payload");
  const addressed = contentAddressedPath(root, body, ".bin");
  assert.match(addressed.path, /blobs\/[a-f0-9]{64}\.bin$/);

  const writes = await Promise.all(
    Array.from({ length: 12 }, () => writeContentAddressedFile(root, body, ".bin"))
  );
  assert.equal(new Set(writes.map((result) => result.path)).size, 1);
  assert.equal(readFileSync(writes[0].path).toString(), body.toString());
  assert.equal(writes.filter((result) => result.created).length, 1);
  const sourcePath = join(root, "stream-source.bin");
  writeFileSync(sourcePath, body);
  const streamed = await writeContentAddressedFileFromPath(root, sourcePath, ".bin");
  assert.equal(streamed.path, writes[0].path);
  assert.equal(streamed.deduplicated, true);

  const duplicateA = join(root, "legacy-a.bin");
  const duplicateB = join(root, "legacy-b.bin");
  writeFileSync(duplicateA, body);
  writeFileSync(duplicateB, body);
  const report = diagnoseContentStore(root);
  assert.equal(report.ok, true);
  assert.equal(report.fileCount, 4);
  assert.equal(report.duplicateGroupCount, 1);
  assert.equal(report.duplicateFileCount, 3);
  assert.equal(report.reclaimableBytes, body.length * 3);

  console.log("storage lab: content addressing, concurrent dedupe and read-only diagnosis passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
