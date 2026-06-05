import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/renderer/bundle/index.js", import.meta.url), "utf8");

assert.match(source, /isProjectMediaFileBackedBinding/);
assert.match(source, /kind === `image`/);
assert.match(source, /t === `imageUrl`/);
assert.match(source, /localFileUrl && \(data\[bindingKey\] = localFileUrl\)/);
assert.match(source, /portableDataRef: fileBacked \? void 0 : storageKey/);
assert.match(source, /await X\.default\.setItem\(storageKey, payload\.portableValue\)/);
assert.match(source, /resolvedBinding\.missing &&\s*isProjectMediaFileBackedBinding/);
assert.match(source, /binding\?\.missing &&\s*isProjectMediaFileBackedBinding/);
assert.doesNotMatch(source, /binding\?\.missing &&\s*isExternalUploadedProjectAssetBinding/);

console.log("storage lab state policy guards passed");
