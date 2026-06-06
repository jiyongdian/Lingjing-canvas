import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/renderer/bundle/index.js", import.meta.url), "utf8");

assert.match(source, /isProjectMediaFileBackedBinding/);
assert.match(source, /kind === `image`/);
assert.match(source, /t === `imageUrl`/);
assert.match(source, /localFileUrl && \(data\[bindingKey\] = localFileUrl\)/);
assert.match(source, /portableDataRef: fileBacked \? void 0 : storageKey/);
assert.match(source, /await X\.default\.setItem\(storageKey, payload\.portableValue\)/);
assert.match(source, /options\.forceRehomeExistingFiles/);
assert.match(source, /forceArchiveExistingFile: !0/);
assert.match(source, /forceRehomeProjectDataFileReferences/);
assert.match(source, /portableDataRef: void 0/);
assert.match(source, /resolvedBinding\.missing &&\s*isProjectMediaFileBackedBinding/);
assert.match(source, /binding\?\.missing &&\s*isProjectMediaFileBackedBinding/);
assert.doesNotMatch(source, /binding\?\.missing &&\s*isExternalUploadedProjectAssetBinding/);
assert.match(source, /saveProjectMigrationSnapshot/);
assert.match(source, /syncProjectReferences/);
assert.match(source, /main-process migration lock/);
assert.match(source, /migration started during persistence/);
assert.match(source, /recoverInterruptedProjectMigrations/);
assert.match(source, /requireGlobalBlobs: !0/);
assert.match(source, /cancelForcedArchiveMigration/);
assert.match(source, /getForcedArchiveMigrationStatus/);
assert.doesNotMatch(source, /migration-snapshot-v1-/);
assert.doesNotMatch(source, /globalThis\.readProjectCanvasStorageState/);
assert.doesNotMatch(source, /globalThis\.writeProjectCanvasStorageState/);
assert.match(source, /storageOptimizationEnabled/);
assert.match(source, /rebuildStorageReferenceIndex/);

console.log("storage lab state policy guards passed");
