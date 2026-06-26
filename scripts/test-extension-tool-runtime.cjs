const assert = require("node:assert/strict");
const path = require("node:path");
const tools = require("../electron/main/tools/external-tools.cjs");

assert.equal(typeof tools.ensureUvCommand, "function");
assert.equal(typeof tools.ensureFfmpegCommand, "function");
assert.equal(typeof tools.bundledToolCommand, "function");
assert.equal(typeof tools.managedToolCommand, "function");
assert.equal(typeof tools.extensionInstallLogPath, "function");
assert.equal(typeof tools.windowsExpandArchiveArgs, "function");

const logPath = tools.extensionInstallLogPath();
assert.match(logPath, /extension-tools[\\/]+install\.log$/);

const qwenPython = tools.qwenTtsVenvPython();
const defacePython = tools.defaceVenvPython();
if (process.platform === "win32") {
  assert.match(qwenPython, /[\\/]venv[\\/]Scripts[\\/]python\.exe$/i);
  assert.match(defacePython, /[\\/]venv[\\/]Scripts[\\/]python\.exe$/i);
  assert.match(tools.realEsrganReleaseUrl(), /windows\.zip$/i);
} else {
  assert.match(qwenPython, /[\\/]venv[\\/]bin[\\/]python$/);
  assert.match(defacePython, /[\\/]venv[\\/]bin[\\/]python$/);
  if (process.platform === "darwin") assert.match(tools.realEsrganReleaseUrl(), /macos\.zip$/i);
}

assert.equal(path.basename(tools.defaceVenvCommand()).startsWith("deface"), true);
assert.equal(typeof tools.bundledToolCommand("deface"), "string");
assert.equal(typeof tools.managedToolCommand("deface"), "string");

const expandArchiveArgs = tools.windowsExpandArchiveArgs("C:\\Users\\Test User\\uv.zip", "C:\\Users\\Test User\\tools");
assert.equal(expandArchiveArgs[0], "-NoProfile");
assert.equal(expandArchiveArgs.includes("C:\\Users\\Test User\\uv.zip"), false);
assert.equal(expandArchiveArgs.some((item) => /\$args\[\d+\]/.test(item)), false);
assert.match(expandArchiveArgs.join(" "), /Expand-Archive -LiteralPath 'C:\\Users\\Test User\\uv\.zip'/);
assert.match(expandArchiveArgs.join(" "), /-DestinationPath 'C:\\Users\\Test User\\tools'/);

const qwenDeps = tools.qwenTtsPinnedRuntimeDependencies();
assert.equal(qwenDeps.includes("accelerate==1.12.0"), true);
assert.equal(qwenDeps.includes("accelerate==1.10.1"), false);

console.log("extension tool runtime resolution passed");
