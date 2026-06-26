const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(repoRoot, "tool-runtime");

function archName(arch) {
  const names = {
    0: "ia32",
    1: "x64",
    2: "armv7l",
    3: "arm64",
    4: "universal"
  };
  return names[arch] || String(arch || "");
}

function resourceRoot(context) {
  if (context.electronPlatformName === "darwin") {
    return path.join(context.appOutDir, "万卷灵境.app", "Contents", "Resources");
  }
  return path.join(context.appOutDir, "resources");
}

function copyRuntimeDir(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true });
  return true;
}

module.exports = async function copyPlatformToolRuntime(context) {
  const platformKey = context.electronPlatformName === "win32" ? "win32" : context.electronPlatformName;
  const architecture = archName(context.arch);
  const resources = resourceRoot(context);
  const targetRoot = path.join(resources, "tool-runtime");
  fs.rmSync(targetRoot, { recursive: true, force: true });

  const runtimeNames = [`${platformKey}-${architecture}`, platformKey];
  const copied = runtimeNames.filter((runtimeName) =>
    copyRuntimeDir(path.join(sourceRoot, runtimeName), path.join(targetRoot, runtimeName))
  );

  if (copied.length) {
    console.log(`Copied bundled tool runtime for ${platformKey}-${architecture}: ${copied.join(", ")}`);
  } else {
    console.log(`No bundled tool runtime found for ${platformKey}-${architecture}; package will use managed/user tools.`);
  }
};
