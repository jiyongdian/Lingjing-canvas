const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const platformKey = process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : process.platform;
const archKey = process.arch === "x64" ? "x64" : process.arch === "ia32" ? "ia32" : process.arch === "arm64" ? "arm64" : process.arch;
const isWindows = process.platform === "win32";
const runtimeRoot = path.join(repoRoot, "tool-runtime", `${platformKey}-${archKey}`);
const candidates = [
  path.join(runtimeRoot, "bin", isWindows ? "deface.exe" : "deface"),
  path.join(runtimeRoot, "deface", "venv", isWindows ? "Scripts" : "bin", isWindows ? "deface.exe" : "deface")
];

function commandWorks(command, args) {
  try {
    const output = execFileSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });
    return String(output || "").trim() || "ok";
  } catch {
    return "";
  }
}

const existing = candidates.filter((candidate) => fs.existsSync(candidate));
if (!existing.length) {
  throw new Error(`Bundled Deface not found for ${platformKey}-${archKey}. Run npm run prepare:bundled-deface on this platform first.`);
}

for (const command of existing) {
  const version = commandWorks(command, ["--version"]);
  if (version) {
    console.log(`Bundled Deface verified for ${platformKey}-${archKey}: ${command}`);
    console.log(version);
    process.exit(0);
  }
  const help = commandWorks(command, ["--help"]);
  if (help) {
    console.log(`Bundled Deface verified for ${platformKey}-${archKey}: ${command}`);
    console.log(help.split("\n")[0]);
    process.exit(0);
  }
}

throw new Error(`Bundled Deface exists but is not runnable for ${platformKey}-${archKey}: ${existing.join(", ")}`);
