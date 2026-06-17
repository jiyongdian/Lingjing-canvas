const assert = require("node:assert/strict");
const path = require("node:path");
const tools = require("../electron/main/tools/external-tools.cjs");

assert.equal(typeof tools.ensureUvCommand, "function");
assert.equal(typeof tools.ensureFfmpegCommand, "function");
assert.equal(typeof tools.extensionInstallLogPath, "function");

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
console.log("extension tool runtime resolution passed");
