// 外部工具链：python/ffmpeg/qwen-tts/real-esrgan/deface/homebrew 的探测、安装与运行
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { execFile, execFileSync } = require("child_process");
const { pipeline } = require("stream/promises");

const { app, shell } = require("../electron-refs.cjs");
const { formatErrorMessage } = require("../logging.cjs");
const { extensionFromMime } = require("../utils/mime.cjs");
const { fileUrlFromLocalPath, localPathFromFileUrl, sanitizeFilename } = require("../utils/paths.cjs");
const { bufferFromMediaPayload } = require("../media/payload.cjs");

const IS_MAC = process.platform === "darwin";
const IS_WINDOWS = process.platform === "win32";
const PLATFORM_KEY = IS_WINDOWS ? "win32" : IS_MAC ? "darwin" : process.platform;
const ARCH_KEY = process.arch === "x64" ? "x64" : process.arch === "ia32" ? "ia32" : process.arch === "arm64" ? "arm64" : process.arch;

function executableName(name) {
  return IS_WINDOWS ? `${name}.exe` : name;
}

function safeAppPath() {
  try {
    if (app?.getAppPath) return app.getAppPath();
  } catch {}
  return path.resolve(__dirname, "../../..");
}

function safeUserPath(name) {
  try {
    if (app?.getPath) return app.getPath(name);
  } catch {}
  if (name === "home") return process.env.HOME || process.env.USERPROFILE || process.cwd();
  if (name === "userData") return path.join(safeAppPath(), ".wanjuan-tool-test-data");
  return process.cwd();
}

function appResourcePath(...segments) {
  return path.join(process.resourcesPath || path.dirname(safeAppPath()), ...segments);
}

function toolRuntimeRoots() {
  return [
    appResourcePath("tool-runtime", `${PLATFORM_KEY}-${ARCH_KEY}`),
    appResourcePath("tool-runtime", PLATFORM_KEY),
    path.join(safeAppPath(), "tool-runtime", `${PLATFORM_KEY}-${ARCH_KEY}`),
    path.join(safeAppPath(), "tool-runtime", PLATFORM_KEY)
  ];
}

function findExecutableRecursive(root, executable) {
  if (!root || !fs.existsSync(root)) return "";
  const stack = [root];
  const maxVisited = 2000;
  let visited = 0;
  while (stack.length && visited < maxVisited) {
    visited += 1;
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
        if (!/\.app$/i.test(entry.name)) stack.push(fullPath);
        continue;
      }
      if (entry.name.toLowerCase() === executable.toLowerCase()) return fullPath;
    }
  }
  return "";
}

function bundledToolCommand(name) {
  const executable = executableName(name);
  for (const root of toolRuntimeRoots()) {
    const direct = path.join(root, "bin", executable);
    if (fs.existsSync(direct)) return direct;
    const nested = findExecutableRecursive(root, executable);
    if (nested) return nested;
  }
  return "";
}

function managedToolBinRoot() {
  return path.join(safeUserPath("userData"), "extension-tools", "bin", `${PLATFORM_KEY}-${ARCH_KEY}`);
}

function managedToolCommand(name) {
  const executable = executableName(name);
  const direct = path.join(managedToolBinRoot(), executable);
  if (fs.existsSync(direct)) return direct;
  return findExecutableRecursive(managedToolBinRoot(), executable);
}

function execFileWithTimeout(command, args, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 30 * 60 * 1000);
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      ...options,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 16
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    child.on("error", reject);
  });
}

function extensionInstallLogPath() {
  return path.join(safeUserPath("userData"), "extension-tools", "install.log");
}

function appendExtensionInstallLog(type, payload = {}) {
  try {
    const logPath = extensionInstallLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify({ time: new Date().toISOString(), type, ...payload })}\n`, "utf8");
  } catch {}
}

async function runInstallCommand(command, args, options = {}) {
  appendExtensionInstallLog("command-start", { command, args, cwd: options.cwd || "" });
  try {
    const result = await execFileWithTimeout(command, args, options);
    appendExtensionInstallLog("command-ok", {
      command,
      stdout: String(result?.stdout || "").slice(-8000),
      stderr: String(result?.stderr || "").slice(-8000)
    });
    return result;
  } catch (error) {
    appendExtensionInstallLog("command-failed", {
      command,
      args,
      code: error?.code,
      message: String(error?.message || error),
      stdout: String(error?.stdout || "").slice(-12000),
      stderr: String(error?.stderr || "").slice(-12000)
    });
    throw error;
  }
}

function parsePythonVersionText(text = "") {
  const match = String(text || "").match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
  if (!match) return null;
  return {
    major: Number(match[1] || 0),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
    text: match[0]
  };
}

function isPythonVersionAtLeast(version, major, minor) {
  if (!version) return false;
  return version.major > major || (version.major === major && version.minor >= minor);
}

function inspectPythonCommand(candidate) {
  if (!candidate) return null;
  if (candidate.includes(path.sep) && !fs.existsSync(candidate)) return null;
  try {
    const output = execFileSync(candidate, ["--version"], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });
    const version = parsePythonVersionText(output);
    if (!version) return null;
    return { command: candidate, version };
  } catch {
    return null;
  }
}

function resolvePythonCommand(options = {}) {
  const minMajor = Number(options.minMajor || 0);
  const minMinor = Number(options.minMinor || 0);
  const runtimePython = bundledToolCommand("python") || bundledToolCommand("python3") || managedToolCommand("python") || managedToolCommand("python3");
  const candidates = [
    process.env.WANJUAN_QWEN_TTS_PYTHON_BIN,
    runtimePython,
    bundledToolCommand("python3.12"),
    managedToolCommand("python3.12"),
    IS_WINDOWS ? path.join(qwenTtsToolRoot(), "python", "python.exe") : "",
    IS_WINDOWS ? path.join(safeUserPath("home"), "AppData", "Local", "Programs", "Python", "Python312", "python.exe") : "",
    IS_WINDOWS ? path.join(safeUserPath("home"), "AppData", "Local", "Microsoft", "WindowsApps", "python3.12.exe") : "",
    IS_WINDOWS ? path.join(safeUserPath("home"), "AppData", "Local", "Microsoft", "WindowsApps", "python.exe") : "",
    "/opt/homebrew/bin/python3.12",
    "/usr/local/bin/python3.12",
    "python3.12",
    "/opt/homebrew/bin/python3.11",
    "/usr/local/bin/python3.11",
    "python3.11",
    "/opt/homebrew/bin/python3.10",
    "/usr/local/bin/python3.10",
    "python3.10",
    process.env.WANJUAN_PYTHON_BIN,
    path.join(safeUserPath("home"), ".local", "share", "uv", "python", "cpython-3.12-macos-aarch64-none", "bin", "python3.12"),
    "/opt/homebrew/bin/python3.13",
    "/usr/local/bin/python3.13",
    "python3.13",
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "python3"
  ].filter(Boolean);
  for (const candidate of candidates) {
    const info = inspectPythonCommand(candidate);
    if (!info) continue;
    if (minMajor && !isPythonVersionAtLeast(info.version, minMajor, minMinor)) continue;
    return info.command;
  }
  return "";
}

async function ensureQwenTtsPythonCommand() {
  let python = resolvePythonCommand({ minMajor: 3, minMinor: 10 });
  if (python) return python;
  python = await ensureUvPythonCommand({ minMajor: 3, minMinor: 10 });
  if (python) return python;
  const brew = resolveHomebrewCommand();
  if (IS_MAC && brew) {
    await runInstallCommand(brew, ["install", "python@3.12"], {
      timeoutMs: 60 * 60 * 1000
    });
    python = resolvePythonCommand({ minMajor: 3, minMinor: 10 });
    if (python) return python;
  }
  throw new Error("Qwen-TTS 需要 Python 3.10 或更高版本，推荐 Python 3.12。当前未检测到可用 Python，自动安装便携 Python 也失败。请检查网络后重试。");
}

function resolveHomebrewCommand() {
  if (!IS_MAC) return "";
  return ["/opt/homebrew/bin/brew", "/usr/local/bin/brew", "brew"].find((candidate) => {
    try {
      execFileSync(candidate, ["--version"], {
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 1024 * 1024
      });
      return true;
    } catch {
      return false;
    }
  }) || "";
}

function hasCommand(command, args = ["--version"]) {
  if (!command) return false;
  if (command.includes(path.sep) && !fs.existsSync(command)) return false;
  try {
    execFileSync(command, args, {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });
    return true;
  } catch {
    return false;
  }
}

function resolveGitCommand() {
  const candidates = [
    process.env.WANJUAN_GIT_BIN,
    bundledToolCommand("git"),
    managedToolCommand("git"),
    IS_WINDOWS ? path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "cmd", "git.exe") : "",
    IS_WINDOWS ? path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", "cmd", "git.exe") : "",
    "/opt/homebrew/bin/git",
    "/usr/local/bin/git",
    "/usr/bin/git",
    "git"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (hasCommand(candidate, ["--version"])) return candidate;
  }
  return "";
}

function resolveSoxCommand() {
  const candidates = [
    process.env.WANJUAN_SOX_BIN,
    bundledToolCommand("sox"),
    managedToolCommand("sox"),
    path.join(qwenTtsToolRoot(), "bin", executableName("sox")),
    "/opt/homebrew/bin/sox",
    "/usr/local/bin/sox",
    "sox"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (hasCommand(candidate, ["--version"])) return candidate;
  }
  return "";
}

function uvToolRoot() {
  return path.join(safeUserPath("userData"), "extension-tools", "uv");
}

function uvCommand() {
  return path.join(uvToolRoot(), executableName("uv"));
}

function uvDownloadUrl() {
  if (IS_MAC && ARCH_KEY === "arm64") return "https://github.com/astral-sh/uv/releases/latest/download/uv-aarch64-apple-darwin.tar.gz";
  if (IS_MAC) return "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-apple-darwin.tar.gz";
  if (IS_WINDOWS && ARCH_KEY === "arm64") return "https://github.com/astral-sh/uv/releases/latest/download/uv-aarch64-pc-windows-msvc.zip";
  if (IS_WINDOWS && ARCH_KEY === "ia32") return "";
  if (IS_WINDOWS) return "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip";
  return "";
}

function extractTarGzCommand() {
  if (IS_WINDOWS) return "";
  return hasCommand("/usr/bin/tar", ["--version"]) ? "/usr/bin/tar" : hasCommand("tar", ["--version"]) ? "tar" : "";
}

async function ensureUvCommand() {
  const bundled = bundledToolCommand("uv");
  if (bundled) return bundled;
  const managed = uvCommand();
  if (hasCommand(managed, ["--version"])) return managed;
  const url = uvDownloadUrl();
  if (!url) return "";
  const root = uvToolRoot();
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  const archivePath = path.join(root, path.basename(new URL(url).pathname));
  await downloadFile(url, archivePath);
  if (/\.zip$/i.test(archivePath)) {
    const unzipCommand = IS_WINDOWS ? "" : "/usr/bin/unzip";
    if (IS_WINDOWS) {
      await runInstallCommand("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        archivePath,
        root
      ], { timeoutMs: 10 * 60 * 1000 });
    } else {
      await runInstallCommand(unzipCommand, ["-q", "-o", archivePath, "-d", root], { timeoutMs: 10 * 60 * 1000 });
    }
  } else {
    const tar = extractTarGzCommand();
    if (!tar) throw new Error("缺少 tar，无法解压便携 uv。");
    await runInstallCommand(tar, ["-xzf", archivePath, "-C", root], { timeoutMs: 10 * 60 * 1000 });
  }
  const extracted = findExecutableRecursive(root, executableName("uv"));
  if (!extracted) throw new Error("便携 uv 下载完成，但未找到 uv 可执行文件。");
  fs.copyFileSync(extracted, managed);
  if (!IS_WINDOWS) fs.chmodSync(managed, 0o755);
  if (!hasCommand(managed, ["--version"])) throw new Error("便携 uv 无法运行。");
  return managed;
}

async function ensureUvPythonCommand(options = {}) {
  const uv = await ensureUvCommand();
  if (!uv) return "";
  const installDir = path.join(qwenTtsToolRoot(), "python");
  fs.mkdirSync(installDir, { recursive: true });
  const env = { ...process.env, UV_PYTHON_INSTALL_DIR: installDir };
  await runInstallCommand(uv, ["python", "install", "3.12"], {
    env,
    timeoutMs: 30 * 60 * 1000
  });
  const candidates = [
    findExecutableRecursive(installDir, IS_WINDOWS ? "python.exe" : "python3.12"),
    findExecutableRecursive(installDir, executableName("python"))
  ].filter(Boolean);
  for (const candidate of candidates) {
    const info = inspectPythonCommand(candidate);
    if (!info) continue;
    if (options.minMajor && !isPythonVersionAtLeast(info.version, options.minMajor, options.minMinor || 0)) continue;
    return candidate;
  }
  return "";
}

async function ensureHomebrewPackages(packages = []) {
  if (!IS_MAC) return;
  const missing = packages.filter((name) => {
    try {
      execFileSync(name, [name === "ffmpeg" ? "-version" : "--version"], {
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 1024 * 1024
      });
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length === 0) return;
  const brew = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew", "brew"].find((candidate) => {
    try {
      execFileSync(candidate, ["--version"], {
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 1024 * 1024
      });
      return true;
    } catch {
      return false;
    }
  });
  if (!brew) return;
  await execFileWithTimeout(brew, ["install", ...missing], {
    timeoutMs: 60 * 60 * 1000
  });
}

async function extractZipArchive(zipPath, destination) {
  fs.mkdirSync(destination, { recursive: true });
  if (IS_WINDOWS) {
    await runInstallCommand("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
      zipPath,
      destination
    ], { timeoutMs: 10 * 60 * 1000 });
    return;
  }
  await runInstallCommand("/usr/bin/unzip", ["-q", "-o", zipPath, "-d", destination], {
    timeoutMs: 10 * 60 * 1000
  });
}

async function downloadAndExtractQwenTtsRepo(repoDir) {
  const root = qwenTtsToolRoot();
  const zipPath = path.join(root, "qtts-main.zip");
  const extractRoot = path.join(root, "qtts-source");
  fs.rmSync(extractRoot, { recursive: true, force: true });
  await downloadFile("https://github.com/daliusd/qtts/archive/refs/heads/main.zip", zipPath);
  await extractZipArchive(zipPath, extractRoot);
  const extracted = fs.readdirSync(extractRoot)
    .map((name) => path.join(extractRoot, name))
    .find((item) => {
      try {
        return fs.statSync(item).isDirectory() && fs.existsSync(path.join(item, "qtts.py"));
      } catch {
        return false;
      }
    });
  if (!extracted) throw new Error("Qwen-TTS 源码下载完成，但未找到 qtts.py。");
  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.renameSync(extracted, repoDir);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function getQwenTtsMissingPrerequisites() {
  const missing = [];
  if (!resolvePythonCommand({ minMajor: 3, minMinor: 10 })) missing.push("Python 3.10+");
  if (IS_MAC && !resolveSoxCommand()) missing.push("sox");
  return missing;
}

function writeQwenTtsPrerequisiteBootstrapScript(missing = []) {
  const root = qwenTtsToolRoot();
  fs.mkdirSync(root, { recursive: true });
  const scriptPath = path.join(root, "install-qwen-tts-prerequisites.command");
  const markerPath = path.join(root, "install-qwen-tts-prerequisites-result.json");
  const logPath = path.join(root, "install-qwen-tts-prerequisites.log");
  const script = `#!/bin/bash
set -u
LOG=${shellQuote(logPath)}
MARKER=${shellQuote(markerPath)}
rm -f "$MARKER"
touch "$LOG"
exec > >(tee -a "$LOG") 2>&1
finish() {
  code=$?
  if [ "$code" -eq 0 ]; then
    /bin/date -u '+{"ok":true,"completedAt":"%Y-%m-%dT%H:%M:%SZ"}' > "$MARKER"
    echo ""
    echo "Qwen-TTS 依赖安装完成，万卷灵境会继续安装模型环境。"
  else
    /bin/date -u '+{"ok":false,"completedAt":"%Y-%m-%dT%H:%M:%SZ"}' > "$MARKER"
    echo ""
    echo "Qwen-TTS 依赖安装失败，请把上面的错误信息反馈给配置管家。"
  fi
  echo "日志位置：$LOG"
  echo "可以关闭这个终端窗口。"
  exit "$code"
}
trap finish EXIT
set -e

echo "万卷灵境 Qwen-TTS 依赖安装脚本"
echo "缺少依赖：${missing.join(", ") || "未知"}"
echo "开始时间：$(date)"
echo ""

if ! xcode-select -p >/dev/null 2>&1; then
  echo "正在请求安装 Apple Command Line Tools..."
  xcode-select --install || true
  echo "如果系统弹出安装窗口，请完成安装。脚本会等待安装完成。"
  for i in $(seq 1 180); do
    if xcode-select -p >/dev/null 2>&1; then
      break
    fi
    sleep 10
  done
  xcode-select -p >/dev/null 2>&1
fi

if ! command -v brew >/dev/null 2>&1 && [ ! -x /opt/homebrew/bin/brew ] && [ ! -x /usr/local/bin/brew ]; then
  echo "未检测到 Homebrew，正在安装 Homebrew..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

command -v brew >/dev/null 2>&1
echo "Homebrew: $(brew --version | head -n 1)"
brew update || true
brew install python@3.12 git ffmpeg sox

if [ -x /opt/homebrew/bin/python3.12 ]; then
  /opt/homebrew/bin/python3.12 --version
elif [ -x /usr/local/bin/python3.12 ]; then
  /usr/local/bin/python3.12 --version
else
  python3.12 --version
fi
git --version
ffmpeg -version | head -n 1
sox --version
`;
  fs.writeFileSync(scriptPath, script, "utf8");
  fs.chmodSync(scriptPath, 0o755);
  return { scriptPath, markerPath, logPath };
}

async function waitForBootstrapMarker(markerPath, logPath, timeoutMs = 2 * 60 * 60 * 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(markerPath)) {
      let result = {};
      try {
        result = JSON.parse(fs.readFileSync(markerPath, "utf8"));
      } catch {}
      if (result.ok) return result;
      throw new Error(`Qwen-TTS 依赖安装脚本执行失败，请查看日志：${logPath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Qwen-TTS 依赖安装等待超时，请查看终端窗口或日志：${logPath}`);
}

async function bootstrapQwenTtsPrerequisitesIfNeeded() {
  if (!IS_MAC) return;
  const missing = getQwenTtsMissingPrerequisites();
  if (missing.length === 0) return;
  if (resolveHomebrewCommand()) return;
  const { scriptPath, markerPath, logPath } = writeQwenTtsPrerequisiteBootstrapScript(missing);
  const openError = await shell.openPath(scriptPath);
  if (openError) throw new Error(`无法打开 Qwen-TTS 依赖安装脚本：${openError}`);
  await waitForBootstrapMarker(markerPath, logPath);
  const stillMissing = getQwenTtsMissingPrerequisites();
  if (stillMissing.length > 0) {
    throw new Error(`Qwen-TTS 依赖安装后仍缺少：${stillMissing.join("、")}。日志：${logPath}`);
  }
}

function resolveFfmpegCommand() {
  const candidates = [
    process.env.WANJUAN_FFMPEG_BIN,
    bundledToolCommand("ffmpeg"),
    managedToolCommand("ffmpeg"),
    path.join(qwenTtsToolRoot(), "bin", executableName("ffmpeg")),
    IS_WINDOWS ? path.join(process.env.ProgramFiles || "C:\\Program Files", "ffmpeg", "bin", "ffmpeg.exe") : "",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-version"], {
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 1024 * 1024
      });
      return candidate;
    } catch {}
  }
  return "";
}

function ffmpegDownloadUrl() {
  if (IS_MAC) return "https://evermeet.cx/ffmpeg/getrelease/zip";
  if (IS_WINDOWS) return "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
  return "";
}

async function ensureFfmpegCommand() {
  const existing = resolveFfmpegCommand();
  if (existing) return existing;
  const url = ffmpegDownloadUrl();
  if (!url) return "";
  const root = managedToolBinRoot();
  fs.mkdirSync(root, { recursive: true });
  const archivePath = path.join(root, IS_WINDOWS ? "ffmpeg-release-essentials.zip" : "ffmpeg.zip");
  await downloadFile(url, archivePath);
  const extractRoot = path.join(root, "ffmpeg-extracted");
  fs.rmSync(extractRoot, { recursive: true, force: true });
  fs.mkdirSync(extractRoot, { recursive: true });
  if (IS_WINDOWS) {
    await runInstallCommand("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
      archivePath,
      extractRoot
    ], { timeoutMs: 10 * 60 * 1000 });
  } else {
    await runInstallCommand("/usr/bin/unzip", ["-q", "-o", archivePath, "-d", extractRoot], { timeoutMs: 10 * 60 * 1000 });
  }
  const extracted = findExecutableRecursive(extractRoot, executableName("ffmpeg"));
  if (!extracted) throw new Error("ffmpeg 下载完成，但未找到可执行文件。");
  const target = path.join(root, executableName("ffmpeg"));
  fs.copyFileSync(extracted, target);
  if (!IS_WINDOWS) fs.chmodSync(target, 0o755);
  if (!hasCommand(target, ["-version"])) throw new Error("便携 ffmpeg 无法运行。");
  return target;
}

function resolveDefaceCommand() {
  const managedDeface = defaceVenvCommand();
  const userDefaceBins = [];
  try {
    if (IS_MAC) {
      const userPythonBinRoot = path.join(safeUserPath("home"), "Library", "Python");
      for (const version of fs.readdirSync(userPythonBinRoot)) {
        userDefaceBins.push(path.join(userPythonBinRoot, version, "bin", "deface"));
      }
    } else if (IS_WINDOWS) {
      const localPrograms = path.join(safeUserPath("home"), "AppData", "Local", "Programs", "Python");
      for (const version of fs.readdirSync(localPrograms)) {
        userDefaceBins.push(path.join(localPrograms, version, "Scripts", "deface.exe"));
      }
    }
  } catch {}
  const candidates = [
    process.env.WANJUAN_DEFACE_BIN,
    managedDeface,
    "/opt/homebrew/bin/deface",
    "/usr/local/bin/deface",
    ...userDefaceBins,
    "deface"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    if (hasCommand(candidate, ["--version"]) || hasCommand(candidate, ["--help"])) return candidate;
  }
  return "deface";
}

function defaceToolRoot() {
  return path.join(safeUserPath("userData"), "extension-tools", "deface");
}

function defaceVenvPython() {
  return path.join(defaceToolRoot(), "venv", IS_WINDOWS ? "Scripts" : "bin", executableName("python"));
}

function defaceVenvCommand() {
  return path.join(defaceToolRoot(), "venv", IS_WINDOWS ? "Scripts" : "bin", executableName("deface"));
}

function qwenTtsToolRoot() {
  return path.join(safeUserPath("userData"), "extension-tools", "qwen-tts");
}

function qwenTtsRepoDir() {
  return path.join(qwenTtsToolRoot(), "qtts");
}

function qwenTtsVenvPython() {
  return path.join(qwenTtsToolRoot(), "venv", IS_WINDOWS ? "Scripts" : "bin", executableName("python"));
}

function qwenTtsScriptPath() {
  return path.join(qwenTtsRepoDir(), "qtts.py");
}

function realEsrganToolRoot() {
  return path.join(safeUserPath("userData"), "extension-tools", "real-esrgan-ncnn-vulkan");
}

function realEsrganExtractedDir() {
  const flatCommand = path.join(realEsrganToolRoot(), executableName("realesrgan-ncnn-vulkan"));
  if (fs.existsSync(flatCommand)) return realEsrganToolRoot();
  const candidates = fs.existsSync(realEsrganToolRoot())
    ? fs.readdirSync(realEsrganToolRoot()).map((name) => path.join(realEsrganToolRoot(), name)).filter((item) => {
      try {
        return fs.statSync(item).isDirectory() && /realesrgan-ncnn-vulkan/i.test(path.basename(item));
      } catch {
        return false;
      }
    })
    : [];
  return candidates[0] || path.join(realEsrganToolRoot(), IS_WINDOWS ? "realesrgan-ncnn-vulkan-20220424-windows" : "realesrgan-ncnn-vulkan-20220424-macos");
}

function realEsrganCommand() {
  const bundled = bundledToolCommand("realesrgan-ncnn-vulkan");
  if (bundled) return bundled;
  const managed = managedToolCommand("realesrgan-ncnn-vulkan");
  if (managed) return managed;
  return path.join(realEsrganExtractedDir(), executableName("realesrgan-ncnn-vulkan"));
}

function realEsrganReleaseUrl() {
  if (IS_WINDOWS) return "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip";
  return "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-macos.zip";
}

function qwenTtsPinnedRuntimeDependencies() {
  return [
    "qwen-tts==0.1.1",
    "transformers==4.57.3",
    "accelerate==1.10.1",
    "gradio",
    "librosa",
    "torchaudio",
    "soundfile>=0.12.1",
    "sox",
    "onnxruntime",
    "einops",
    "click>=8.0.0",
    "pydub>=0.25.1",
    "torch>=2.0.0"
  ];
}

function shouldRecreateQwenTtsVenv(venvPython) {
  if (!fs.existsSync(venvPython)) return false;
  const info = inspectPythonCommand(venvPython);
  return !info || !isPythonVersionAtLeast(info.version, 3, 10);
}

function patchQwenTtsScriptForMac(scriptPath) {
  if (!fs.existsSync(scriptPath)) return;
  let source = fs.readFileSync(scriptPath, "utf8");
  const original = source;
  source = source.replace(
    /if device == "cpu":\s*\n\s*dtype = torch\.float32\s*\n\s*attn_impl = "eager"\s*\n\s*else:\s*\n\s*dtype = torch\.bfloat16\s*\n\s*# Try flash attention, fallback to eager if not available\s*\n\s*try:\s*\n\s*attn_impl = "flash_attention_2"\s*\n\s*except:\s*\n\s*attn_impl = "eager"/,
    `if device == "cpu" or device == "mps":
            dtype = torch.float32
            attn_impl = "eager"
        else:
            dtype = torch.bfloat16
            try:
                import flash_attn  # noqa: F401
                attn_impl = "flash_attention_2"
            except Exception:
                attn_impl = "eager"`
  );
  if (source !== original) fs.writeFileSync(scriptPath, source);
}

function isValidAudioFile(filePath, minBytes = 512) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size >= minBytes;
  } catch {
    return false;
  }
}

function getQwenTtsToolStatus() {
  const python = qwenTtsVenvPython();
  const script = qwenTtsScriptPath();
  const installed = fs.existsSync(python) && fs.existsSync(script);
  if (!installed) {
    return {
      ok: true,
      installed: false,
      command: "",
      error: "尚未安装 Qwen-TTS 本地克隆工具"
    };
  }
  patchQwenTtsScriptForMac(script);
  try {
    const result = execFileSync(python, [script, "--help"], {
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });
    return {
      ok: true,
      installed: true,
      command: `${python} ${script}`,
      version: String(result || "").split("\n")[0].trim() || "已安装"
    };
  } catch (error) {
    return {
      ok: true,
      installed: false,
      command: `${python} ${script}`,
      error: formatErrorMessage(error)
    };
  }
}

async function installQwenTtsTool() {
  const python = await ensureQwenTtsPythonCommand();
  await ensureFfmpegCommand().catch(() => "");
  if (IS_MAC) await ensureHomebrewPackages(["git", "sox"]);
  const git = resolveGitCommand();
  const root = qwenTtsToolRoot();
  const repoDir = qwenTtsRepoDir();
  const venvPython = qwenTtsVenvPython();
  fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(repoDir)) {
    if (git) {
      await runInstallCommand(git, ["clone", "https://github.com/daliusd/qtts.git", repoDir], {
        timeoutMs: 10 * 60 * 1000
      });
    } else {
      await downloadAndExtractQwenTtsRepo(repoDir);
    }
  } else {
    if (git) {
      await runInstallCommand(git, ["-C", repoDir, "pull", "--ff-only"], {
        timeoutMs: 10 * 60 * 1000
      }).catch(() => null);
    }
  }
  patchQwenTtsScriptForMac(qwenTtsScriptPath());
  if (shouldRecreateQwenTtsVenv(venvPython)) {
    fs.rmSync(path.join(root, "venv"), {
      recursive: true,
      force: true
    });
  }
  if (!fs.existsSync(venvPython)) {
    await runInstallCommand(python, ["-m", "venv", path.join(root, "venv")], {
      timeoutMs: 10 * 60 * 1000
    });
  }
  await runInstallCommand(venvPython, ["-m", "pip", "install", "--upgrade", "pip"], {
    timeoutMs: 10 * 60 * 1000
  });
  await runInstallCommand(venvPython, ["-m", "pip", "install", "--upgrade", "setuptools", "wheel"], {
    timeoutMs: 10 * 60 * 1000
  });
  await runInstallCommand(venvPython, ["-m", "pip", "install", "--no-deps", "qwen-tts==0.1.1"], {
    timeoutMs: 60 * 60 * 1000
  });
  await runInstallCommand(venvPython, ["-m", "pip", "install", ...qwenTtsPinnedRuntimeDependencies().filter((item) => !/^qwen-tts(?:=|<|>|$)/i.test(item))], {
    timeoutMs: 60 * 60 * 1000
  });
  const status = getQwenTtsToolStatus();
  if (!status.installed) {
    throw new Error("Qwen-TTS 安装命令已执行，但仍未检测到 qtts.py。请重启应用或检查安装日志。");
  }
  return {
    ok: true,
    installed: true,
    command: status.command,
    version: status.version || "已安装"
  };
}

function getRealEsrganToolStatus() {
  const command = realEsrganCommand();
  if (fs.existsSync(command)) {
    try {
      fs.chmodSync(command, 0o755);
    } catch {}
  }
  if (!fs.existsSync(command)) {
    return {
      ok: true,
      installed: false,
      command: "",
      error: "尚未安装 Real-ESRGAN NCNN Vulkan 本地视频超分工具"
    };
  }
  try {
    const result = execFileSync(command, ["-h"], {
      cwd: realEsrganExtractedDir(),
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });
    return {
      ok: true,
      installed: true,
      command,
      version: String(result || "").split("\n")[0].trim() || "realesrgan-ncnn-vulkan"
    };
  } catch (error) {
    const detail = String(error?.stdout || error?.stderr || error?.message || "");
    if (/Usage:\s*realesrgan-ncnn-vulkan|-i input-path|-o output-path/i.test(detail)) {
      return {
        ok: true,
        installed: true,
        command,
        version: "realesrgan-ncnn-vulkan"
      };
    }
    return {
      ok: true,
      installed: false,
      command,
      error: formatErrorMessage(error)
    };
  }
}

async function downloadFile(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "User-Agent": "WanJuanCanvas/1.2.8"
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).toString(), destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`下载失败：HTTP ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destination);
      pipeline(response, file).then(resolve, reject);
    });
    request.on("error", reject);
    request.setTimeout(10 * 60 * 1000, () => {
      request.destroy(new Error("下载超时"));
    });
  });
}

async function installRealEsrganTool() {
  await ensureFfmpegCommand();
  const root = realEsrganToolRoot();
  const zipPath = path.join(root, path.basename(new URL(realEsrganReleaseUrl()).pathname));
  fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(zipPath)) {
    await downloadFile(realEsrganReleaseUrl(), zipPath);
  }
  await extractZipArchive(zipPath, root);
  const command = realEsrganCommand();
  if (fs.existsSync(command)) fs.chmodSync(command, 0o755);
  const status = getRealEsrganToolStatus();
  if (!status.installed) {
    throw new Error("Real-ESRGAN 安装完成后仍未检测到可执行文件，请重新点击检测状态或检查网络下载是否完整。");
  }
  return {
    ok: true,
    installed: true,
    command: status.command,
    version: status.version || "已安装"
  };
}

function safeInteger(value, fallback, min, max) {
  const next = Number.parseInt(String(value), 10);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, next));
}

const realEsrganJobs = new Map();

function emitRealEsrganProgress(sender, jobId, progress) {
  if (!sender || !jobId) return;
  const job = realEsrganJobs.get(jobId);
  if (job) {
    job.percent = Math.max(0, Math.min(100, Math.round(Number(progress?.percent) || 0)));
    job.stage = progress?.stage || job.stage || "处理中";
    job.detail = progress?.detail || "";
    job.updatedAt = Date.now();
  }
  try {
    sender.send(`wanjuan:real-esrgan-progress:${jobId}`, progress);
  } catch {}
}

function countPngFilesSafe(dir) {
  try {
    return fs.readdirSync(dir).filter((name) => /\.png$/i.test(name)).length;
  } catch {
    return 0;
  }
}

function parseRealEsrganNodeIdFromJobId(jobId = "") {
  const match = String(jobId || "").match(/^real-esrgan-(.+)-(\d{10,})$/);
  return match ? match[1] : "";
}

function realEsrganJobProgressFromDirs(jobId, framesDir, upscaledDir, fallback = {}) {
  const frameCount = countPngFilesSafe(framesDir);
  const upscaledCount = countPngFilesSafe(upscaledDir);
  let percent = Number(fallback.percent || 0);
  let stage = fallback.stage || "处理中";
  let detail = fallback.detail || "";
  if (frameCount > 0 && upscaledCount > 0) {
    percent = Math.max(percent, Math.min(81, 38 + Math.round((upscaledCount / frameCount) * 43)));
    stage = "超分处理中";
    detail = `${upscaledCount}/${frameCount} 帧`;
  } else if (frameCount > 0) {
    percent = Math.max(percent, 32);
    stage = fallback.stage || "拆帧完成";
    detail = `${frameCount} 帧`;
  }
  return {
    jobId,
    nodeId: fallback.nodeId || parseRealEsrganNodeIdFromJobId(jobId),
    percent,
    stage,
    detail,
    frameCount,
    upscaledCount
  };
}

function listRealEsrganSystemJobs() {
  let output = "";
  try {
    output = execFileSync("/bin/ps", ["-axo", "pid=,stat=,command="], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 1024 * 1024 * 4
    });
  } catch {
    return [];
  }
  return String(output || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\S+)\s+(.+)$/);
      if (!match) return null;
      const pid = Number(match[1]);
      const stat = match[2] || "";
      const command = match[3] || "";
      if (!/real-esrgan-video-upscale/.test(command)) return null;
      const framesMatch = command.match(/real-esrgan-video-upscale\/([^/\s]+)-frames\b/);
      const upscaledMatch = command.match(/real-esrgan-video-upscale\/([^/\s]+)-upscaled\b/);
      const inputMatch = command.match(/real-esrgan-video-upscale\/([^/\s]+)-input\.[^\s]+/);
      const jobId = framesMatch?.[1] || upscaledMatch?.[1] || inputMatch?.[1] || "";
      if (!jobId) return null;
      const root = path.join(safeUserPath("userData"), "real-esrgan-video-upscale");
      const framesDir = path.join(root, `${jobId}-frames`);
      const upscaledDir = path.join(root, `${jobId}-upscaled`);
      const status = realEsrganJobProgressFromDirs(jobId, framesDir, upscaledDir, {
        percent: /realesrgan-ncnn-vulkan/.test(command) ? 38 : 15,
        stage: /realesrgan-ncnn-vulkan/.test(command) ? "超分处理中" : "处理视频中"
      });
      return {
        ...status,
        ok: true,
        running: true,
        pid,
        paused: stat.includes("T"),
        command
      };
    })
    .filter(Boolean);
}

function getRealEsrganJobStatus(payload = {}) {
  const jobId = String(payload?.jobId || "");
  const nodeId = String(payload?.nodeId || "");
  let entry = jobId ? realEsrganJobs.get(jobId) : null;
  if (!entry && nodeId) {
    entry = [...realEsrganJobs.values()].find((item) => item.nodeId === nodeId);
  }
  if (entry) {
    const status = realEsrganJobProgressFromDirs(entry.jobId, entry.framesDir, entry.upscaledDir, entry);
    return {
      ok: true,
      running: true,
      ...status,
      pid: entry.child?.pid || null,
      paused: !!entry.paused
    };
  }
  const systemJobs = listRealEsrganSystemJobs();
  const matched = systemJobs.find((item) => (jobId && item.jobId === jobId) || (nodeId && item.nodeId === nodeId));
  if (matched) return matched;
  return { ok: true, running: false, jobId, nodeId };
}

function setRealEsrganJobChild(jobId, child) {
  const job = realEsrganJobs.get(jobId);
  if (!job) return;
  job.child = child || null;
  if (job.paused && child?.pid) {
    try {
      process.kill(child.pid, "SIGSTOP");
    } catch {}
  }
}

function execFileWithTimeoutAndJob(command, args, options = {}, jobId = "") {
  const timeoutMs = Number(options.timeoutMs || 30 * 60 * 1000);
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      ...options,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 16
    }, (error, stdout, stderr) => {
      setRealEsrganJobChild(jobId, null);
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    setRealEsrganJobChild(jobId, child);
    child.on("error", (error) => {
      setRealEsrganJobChild(jobId, null);
      reject(error);
    });
  });
}

async function upscaleVideoWithRealEsrgan(payload = {}, context = {}) {
  const jobId = String(payload?.jobId || `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
  const nodeId = String(payload?.nodeId || parseRealEsrganNodeIdFromJobId(jobId) || "");
  realEsrganJobs.set(jobId, { jobId, nodeId, paused: false, child: null, percent: 0, stage: "准备中", detail: "", updatedAt: Date.now() });
  const emitProgress = (percent, stage, detail = "") => {
    emitRealEsrganProgress(context.sender, jobId, {
      jobId,
      percent: Math.max(0, Math.min(100, Math.round(Number(percent) || 0))),
      stage,
      detail,
      paused: !!realEsrganJobs.get(jobId)?.paused
    });
  };
  const ensureActive = () => {
    if (!realEsrganJobs.has(jobId)) throw new Error("已停止超分任务");
  };
  emitProgress(2, "准备中");
  try {
  const status = getRealEsrganToolStatus();
  if (!status.installed) {
    throw new Error("Real-ESRGAN NCNN Vulkan 尚未安装。请先在 设置 > 拓展功能 中安装“Real-ESRGAN - 本地视频超分”。");
  }
  ensureActive();
  const { buffer, mime, filename: rawFilename } = await bufferFromMediaPayload(payload || {});
  emitProgress(8, "读取视频");
  const sourceName = sanitizeFilename(payload?.filename || rawFilename || `source-${Date.now()}${extensionFromMime(mime) || ".mp4"}`);
  const inputExt = path.extname(sourceName) || extensionFromMime(mime) || ".mp4";
  const workRoot = path.join(safeUserPath("userData"), "real-esrgan-video-upscale");
  fs.mkdirSync(workRoot, { recursive: true });
  const inputPath = path.join(workRoot, `${jobId}-input${inputExt}`);
  const framesDir = path.join(workRoot, `${jobId}-frames`);
  const upscaledDir = path.join(workRoot, `${jobId}-upscaled`);
  const audioPath = path.join(workRoot, `${jobId}-audio.m4a`);
  const fpsPath = path.join(workRoot, `${jobId}-fps.txt`);
  const outputPath = path.join(workRoot, `${jobId}-${sourceName.replace(/\.[^.]+$/i, "")}-超分.mp4`);
  Object.assign(realEsrganJobs.get(jobId) || {}, { inputPath, framesDir, upscaledDir, outputPath });
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(upscaledDir, { recursive: true });
  fs.writeFileSync(inputPath, buffer);
  const ffmpeg = await ensureFfmpegCommand();
  if (!ffmpeg) throw new Error("Real-ESRGAN 视频超分需要 ffmpeg 拆帧与合成，请先安装 ffmpeg。");
  const scale = safeInteger(payload?.scale || payload?.upscale || 2, 2, 2, 4);
  const tile = safeInteger(payload?.tile || 0, 0, 0, 1024);
  const model = ["realesrgan-x4plus", "realesrgan-x4plus-anime", "realesr-animevideov3"].includes(String(payload?.model || "")) ? String(payload.model) : "realesrgan-x4plus";
  const keepAudio = payload?.keepAudio !== false;
  const fpsResult = await execFileWithTimeoutAndJob(ffmpeg, ["-i", inputPath, "-hide_banner"], {
    timeoutMs: 60 * 1000
  }, jobId).catch((error) => error);
  ensureActive();
  const fpsText = String(fpsResult?.stderr || fpsResult?.stdout || fpsResult?.message || "");
  const fpsMatch = fpsText.match(/,\s*([0-9.]+)\s*fps,/i);
  const fps = fpsMatch ? fpsMatch[1] : "30";
  fs.writeFileSync(fpsPath, fps);
  emitProgress(15, "拆分视频帧");
  await execFileWithTimeoutAndJob(ffmpeg, ["-y", "-i", inputPath, path.join(framesDir, "frame_%08d.png")], {
    timeoutMs: Math.max(60 * 1000, Math.min(2 * 60 * 60 * 1000, Number(payload?.timeoutMs || 45 * 60 * 1000)))
  }, jobId);
  ensureActive();
  const frameCount = fs.readdirSync(framesDir).filter((name) => /\.png$/i.test(name)).length;
  emitProgress(32, "拆帧完成", frameCount ? `${frameCount} 帧` : "");
  if (keepAudio) {
    await execFileWithTimeoutAndJob(ffmpeg, ["-y", "-i", inputPath, "-vn", "-c:a", "aac", audioPath], {
      timeoutMs: 10 * 60 * 1000
    }, jobId).catch(() => null);
  }
  ensureActive();
  const args = ["-i", framesDir, "-o", upscaledDir, "-n", model, "-s", String(scale), "-f", "png"];
  if (tile > 0) args.push("-t", String(tile));
  emitProgress(38, "超分处理中", frameCount ? `正在增强 ${frameCount} 帧` : "");
  await execFileWithTimeoutAndJob(realEsrganCommand(), args, {
    cwd: realEsrganExtractedDir(),
    timeoutMs: Math.max(60 * 1000, Math.min(4 * 60 * 60 * 1000, Number(payload?.timeoutMs || 2 * 60 * 60 * 1000)))
  }, jobId);
  ensureActive();
  const upscaledFiles = fs.readdirSync(upscaledDir).filter((name) => /\.png$/i.test(name)).sort();
  if (upscaledFiles.length < 1) {
    throw new Error("Real-ESRGAN 视频超分失败：未生成超分帧");
  }
  emitProgress(82, "合成视频");
  const firstFrame = upscaledFiles[0];
  const framePattern = /^(.*?)(\d+)(\D*\.png)$/i.test(firstFrame)
    ? firstFrame.replace(/^(.*?)(\d+)(\D*\.png)$/i, (full, prefix, digits, suffix) => `${prefix}%0${digits.length}d${suffix}`)
    : firstFrame;
  const mergeArgs = ["-y", "-framerate", fps, "-i", path.join(upscaledDir, framePattern)];
  if (keepAudio && fs.existsSync(audioPath) && fs.statSync(audioPath).size > 256) {
    mergeArgs.push("-i", audioPath, "-map", "0:v:0", "-map", "1:a:0", "-shortest");
  }
  mergeArgs.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  if (keepAudio && fs.existsSync(audioPath) && fs.statSync(audioPath).size > 256) {
    mergeArgs.push("-c:a", "aac");
  }
  mergeArgs.push(outputPath);
  await execFileWithTimeoutAndJob(ffmpeg, mergeArgs, {
    timeoutMs: Math.max(60 * 1000, Math.min(2 * 60 * 60 * 1000, Number(payload?.timeoutMs || 45 * 60 * 1000)))
  }, jobId);
  ensureActive();
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
    throw new Error("Real-ESRGAN 视频超分失败：没有生成有效输出文件");
  }
  emitProgress(100, "完成");
  return {
    ok: true,
    url: fileUrlFromLocalPath(outputPath) || outputPath,
    localPath: outputPath,
    filename: path.basename(outputPath),
    mime: "video/mp4",
    size: fs.statSync(outputPath).size,
    scale,
    model
  };
  } finally {
    realEsrganJobs.delete(jobId);
  }
}

function setRealEsrganJobPaused(jobId, paused) {
  const job = realEsrganJobs.get(String(jobId || ""));
  if (!job) return { ok: false, error: "没有找到正在运行的超分任务" };
  job.paused = !!paused;
  if (job.child?.pid) {
    try {
      process.kill(job.child.pid, paused ? "SIGSTOP" : "SIGCONT");
    } catch (error) {
      return { ok: false, error: formatErrorMessage(error) };
    }
  }
  return { ok: true, paused: job.paused };
}

async function cloneVoiceWithQwenTts(payload = {}) {
  const status = getQwenTtsToolStatus();
  if (!status.installed) {
    throw new Error("Qwen-TTS 尚未安装。请先在 设置 > 拓展功能 中安装“Qwen-TTS - 本地语音生成”。");
  }
  const mode = String(payload?.mode || payload?.qwenTtsMode || "clone").toLowerCase() === "custom" ? "custom" : "clone";
  const inputText = String(payload?.text || "").trim();
  const refText = String(payload?.refText || "").trim();
  if (!inputText) throw new Error("请输入要朗读的文本");
  const workRoot = path.join(safeUserPath("userData"), "qwen-tts-clone");
  fs.mkdirSync(workRoot, { recursive: true });
  const jobId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const outputFormat = ["wav", "mp3"].includes(String(payload?.format || "").toLowerCase()) ? String(payload.format).toLowerCase() : "mp3";
  const outputPath = path.join(workRoot, `${jobId}-qwen-tts.${outputFormat}`);
  const python = qwenTtsVenvPython();
  const script = qwenTtsScriptPath();
  const args = [
    script,
    inputText,
    "-m",
    mode,
    "-o",
    outputPath
  ];
  const language = String(payload?.language || "").trim();
  if (language) args.push("-l", language);
  if (payload?.model) args.push("--model", String(payload.model).trim());
  if (payload?.device) args.push("--device", String(payload.device).trim());
  if (mode === "clone") {
    if (payload?.authorized !== true) throw new Error("请先确认拥有该声音授权");
    if (!refText) throw new Error("请输入参考音频原文 ref_text");
    const { buffer, mime, filename: rawFilename } = await bufferFromMediaPayload(payload || {});
    const sourceName = sanitizeFilename(payload?.filename || rawFilename || `reference-${Date.now()}${extensionFromMime(mime) || ".mp3"}`);
    const inputExt = path.extname(sourceName) || extensionFromMime(mime) || ".mp3";
    const mediaPath = path.join(workRoot, `${jobId}-reference${inputExt}`);
    const refAudioPath = path.join(workRoot, `${jobId}-reference.wav`);
    fs.writeFileSync(mediaPath, buffer);
    const isVideo = /^video\//i.test(mime) || /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(inputExt);
    if (isVideo) {
      const ffmpeg = await ensureFfmpegCommand();
      if (!ffmpeg) throw new Error("参考视频需要先提取音轨，但未找到 ffmpeg。请安装 ffmpeg 后重试。");
      await execFileWithTimeout(ffmpeg, ["-y", "-i", mediaPath, "-vn", "-ac", "1", "-ar", "24000", refAudioPath], {
        timeoutMs: 20 * 60 * 1000
      });
    } else {
      const ffmpeg = await ensureFfmpegCommand().catch(() => "");
      if (ffmpeg) {
        await execFileWithTimeout(ffmpeg, ["-y", "-i", mediaPath, "-ac", "1", "-ar", "24000", refAudioPath], {
          timeoutMs: 20 * 60 * 1000
        }).catch(() => fs.copyFileSync(mediaPath, refAudioPath));
      } else {
        fs.copyFileSync(mediaPath, refAudioPath);
      }
    }
    args.push("--ref-audio", refAudioPath, "--ref-text", refText);
  } else {
    const speaker = String(payload?.speaker || "Vivian").trim() || "Vivian";
    const instruct = String(payload?.instruct || "").trim();
    args.push("-s", speaker);
    if (instruct) args.push("-i", instruct);
  }
  try {
    await execFileWithTimeout(python, args, {
      cwd: qwenTtsRepoDir(),
      timeoutMs: Math.max(60 * 1000, Math.min(2 * 60 * 60 * 1000, Number(payload?.timeoutMs || 60 * 60 * 1000)))
    });
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error).trim();
    throw new Error(`Qwen-TTS 语音生成失败：${detail || "未知错误"}`);
  }
  let finalOutputPath = outputPath;
  let finalOutputFormat = outputFormat;
  if (!isValidAudioFile(finalOutputPath) && outputFormat === "mp3") {
    const wavFallbackPath = outputPath.replace(/\.mp3$/i, ".wav");
    if (isValidAudioFile(wavFallbackPath)) {
      const ffmpeg = await ensureFfmpegCommand().catch(() => "");
      if (ffmpeg) {
        await execFileWithTimeout(ffmpeg, ["-y", "-i", wavFallbackPath, "-codec:a", "libmp3lame", "-b:a", "192k", outputPath], {
          timeoutMs: 10 * 60 * 1000
        }).catch(() => null);
      }
      if (isValidAudioFile(outputPath)) {
        finalOutputPath = outputPath;
        finalOutputFormat = "mp3";
      } else {
        finalOutputPath = wavFallbackPath;
        finalOutputFormat = "wav";
      }
    }
  }
  if (!isValidAudioFile(finalOutputPath)) {
    throw new Error("Qwen-TTS 语音生成失败：没有生成有效音频文件");
  }
  return {
    ok: true,
    url: fileUrlFromLocalPath(finalOutputPath) || finalOutputPath,
    localPath: finalOutputPath,
    filename: path.basename(finalOutputPath),
    mime: finalOutputFormat === "wav" ? "audio/wav" : "audio/mpeg",
    size: fs.statSync(finalOutputPath).size
  };
}

function getDefaceToolStatus() {
  const command = resolveDefaceCommand();
  try {
    const result = execFileSync(command, ["--version"], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });
    return {
      ok: true,
      installed: true,
      command,
      version: String(result || "").trim() || "已安装"
    };
  } catch (error) {
    try {
      execFileSync(command, ["--help"], {
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 1024 * 1024
      });
      return {
        ok: true,
        installed: true,
        command,
        version: "已安装"
      };
    } catch {}
    return {
      ok: true,
      installed: false,
      command: "",
      error: formatErrorMessage(error)
    };
  }
}

async function installDefaceTool() {
  const python = await ensureQwenTtsPythonCommand();
  await ensureFfmpegCommand().catch(() => "");
  const root = defaceToolRoot();
  const venvPython = defaceVenvPython();
  fs.mkdirSync(root, { recursive: true });
  if (shouldRecreateQwenTtsVenv(venvPython)) {
    fs.rmSync(path.join(root, "venv"), {
      recursive: true,
      force: true
    });
  }
  if (!fs.existsSync(venvPython)) {
    await runInstallCommand(python, ["-m", "venv", path.join(root, "venv")], {
      timeoutMs: 10 * 60 * 1000
    });
  }
  await runInstallCommand(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], {
    timeoutMs: 10 * 60 * 1000
  });
  await runInstallCommand(venvPython, ["-m", "pip", "install", "--upgrade", "deface"], {
    timeoutMs: 60 * 60 * 1000
  });
  const status = getDefaceToolStatus();
  if (!status.installed) {
    throw new Error("Deface 安装命令已执行，但仍未检测到 deface 可执行文件。请重新点击检测状态或查看拓展安装日志。");
  }
  return {
    ok: true,
    installed: true,
    command: status.command,
    version: status.version || "已安装"
  };
}

async function blurVideoFaces(payload = {}) {
  const { buffer, mime, filename: rawFilename } = await bufferFromMediaPayload(payload || {});
  const sourceName = sanitizeFilename(payload?.filename || rawFilename || `source-${Date.now()}${extensionFromMime(mime) || ".mp4"}`);
  const inputExt = path.extname(sourceName) || extensionFromMime(mime) || ".mp4";
  const workRoot = path.join(safeUserPath("userData"), "video-face-blur");
  fs.mkdirSync(workRoot, { recursive: true });
  const jobId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const inputPath = path.join(workRoot, `${jobId}-input${inputExt}`);
  const outputName = sanitizeFilename(payload?.outputFilename || sourceName.replace(/\.[^.]+$/i, "") || "face-blur");
  const outputPath = path.join(workRoot, `${jobId}-${outputName.replace(/\.[^.]+$/i, "")}-打码.mp4`);
  fs.writeFileSync(inputPath, buffer);

  const mode = String(payload?.mode || "mosaic").trim().toLowerCase();
  const validMode = ["blur", "solid", "mosaic"].includes(mode) ? mode : "mosaic";
  const threshold = Math.max(0.02, Math.min(0.99, Number(payload?.threshold || 0.3)));
  const scale = Math.max(0.1, Math.min(4, Number(payload?.scale || 1.3)));
  const keepAudio = payload?.keepAudio !== false;
  const args = [
    inputPath,
    "--output",
    outputPath,
    "--replacewith",
    validMode,
    "--thresh",
    String(threshold),
    "--mask-scale",
    String(scale)
  ];
  if (keepAudio) args.push("--keep-audio");

  try {
    await execFileWithTimeout(resolveDefaceCommand(), args, {
      timeoutMs: Math.max(60 * 1000, Math.min(2 * 60 * 60 * 1000, Number(payload?.timeoutMs || 30 * 60 * 1000)))
    });
  } catch (error) {
    const message = String(error?.message || error || "");
    const detail = String(error?.stderr || error?.stdout || "").trim();
    if (error?.code === "ENOENT" || /ENOENT|not found|no such file/i.test(message)) {
      throw new Error("未找到 deface。请先在 设置 > 拓展功能 中点击安装或重新安装 Deface。");
    }
    throw new Error(`视频人脸打码失败：${detail || message}`);
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
    throw new Error("视频人脸打码失败：没有生成有效输出文件");
  }
  return {
    ok: true,
    url: fileUrlFromLocalPath(outputPath) || outputPath,
    localPath: outputPath,
    filename: path.basename(outputPath),
    mime: "video/mp4",
    size: fs.statSync(outputPath).size
  };
}

async function trimVideoSegment(payload = {}) {
  const ffmpeg = await ensureFfmpegCommand();
  if (!ffmpeg) throw new Error("视频剪辑导出需要 ffmpeg。请先在设置里的拓展功能中安装或修复本地工具依赖。");

  const start = Math.max(0, Number(payload?.start || 0));
  const end = Math.max(start, Number(payload?.end || 0));
  const duration = Math.max(0, end - start);
  if (!Number.isFinite(duration) || duration <= 0.05) throw new Error("剪辑选区无效，请重新设置入点和出点。");

  const url = String(payload?.url || "");
  const workRoot = path.join(safeUserPath("userData"), "video-editor");
  fs.mkdirSync(workRoot, { recursive: true });
  const jobId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const sourceName = sanitizeFilename(payload?.filename || `source-${jobId}.mp4`);
  let inputPath =
    (typeof payload?.localPath === "string" && payload.localPath && fs.existsSync(payload.localPath) && payload.localPath) ||
    (typeof payload?.path === "string" && payload.path && fs.existsSync(payload.path) && payload.path) ||
    "";
  if (!inputPath && /^file:\/\//i.test(url)) {
    try {
      const candidate = localPathFromFileUrl(url) || decodeURIComponent(new URL(url).pathname);
      if (fs.existsSync(candidate)) inputPath = candidate;
    } catch {}
  }

  if (!inputPath) {
    const { buffer, mime, filename: rawFilename } = await bufferFromMediaPayload(payload || {});
    const inputExt = path.extname(rawFilename || sourceName) || extensionFromMime(mime) || ".mp4";
    inputPath = path.join(workRoot, `${jobId}-input${inputExt}`);
    fs.writeFileSync(inputPath, buffer);
  }

  const outputBase = sanitizeFilename(payload?.outputFilename || sourceName.replace(/\.[^.]+$/i, "") || "edited-video");
  const outputPath = path.join(workRoot, `${jobId}-${outputBase.replace(/\.[^.]+$/i, "")}-edited.mp4`);
  const args = [
    "-y",
    "-hide_banner",
    "-ss",
    String(start),
    "-i",
    inputPath,
    "-t",
    String(duration),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outputPath
  ];

  try {
    await execFileWithTimeout(ffmpeg, args, {
      timeoutMs: Math.max(60 * 1000, Math.min(30 * 60 * 1000, Number(payload?.timeoutMs || Math.ceil(duration * 1200 + 120000))))
    });
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error || "").trim();
    throw new Error(`视频剪辑导出失败：${detail || "ffmpeg 未能生成片段"}`);
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
    throw new Error("视频剪辑导出失败：没有生成有效输出文件");
  }
  return {
    ok: true,
    url: fileUrlFromLocalPath(outputPath) || outputPath,
    localPath: outputPath,
    filename: path.basename(outputPath),
    mime: "video/mp4",
    size: fs.statSync(outputPath).size,
    duration
  };
}

module.exports = {
  execFileWithTimeout,
  extensionInstallLogPath,
  appendExtensionInstallLog,
  runInstallCommand,
  parsePythonVersionText,
  isPythonVersionAtLeast,
  inspectPythonCommand,
  resolvePythonCommand,
  ensureQwenTtsPythonCommand,
  resolveHomebrewCommand,
  hasCommand,
  resolveGitCommand,
  resolveSoxCommand,
  ensureHomebrewPackages,
  extractZipArchive,
  downloadAndExtractQwenTtsRepo,
  shellQuote,
  getQwenTtsMissingPrerequisites,
  writeQwenTtsPrerequisiteBootstrapScript,
  waitForBootstrapMarker,
  bootstrapQwenTtsPrerequisitesIfNeeded,
  resolveFfmpegCommand,
  ensureFfmpegCommand,
  ensureUvCommand,
  ensureUvPythonCommand,
  resolveDefaceCommand,
  defaceToolRoot,
  defaceVenvPython,
  defaceVenvCommand,
  qwenTtsToolRoot,
  qwenTtsRepoDir,
  qwenTtsVenvPython,
  qwenTtsScriptPath,
  realEsrganToolRoot,
  realEsrganExtractedDir,
  realEsrganCommand,
  realEsrganReleaseUrl,
  qwenTtsPinnedRuntimeDependencies,
  shouldRecreateQwenTtsVenv,
  patchQwenTtsScriptForMac,
  isValidAudioFile,
  getQwenTtsToolStatus,
  installQwenTtsTool,
  getRealEsrganToolStatus,
  downloadFile,
  installRealEsrganTool,
  safeInteger,
  emitRealEsrganProgress,
  countPngFilesSafe,
  parseRealEsrganNodeIdFromJobId,
  realEsrganJobProgressFromDirs,
  listRealEsrganSystemJobs,
  getRealEsrganJobStatus,
  trimVideoSegment,
  setRealEsrganJobChild,
  execFileWithTimeoutAndJob,
  upscaleVideoWithRealEsrgan,
  setRealEsrganJobPaused,
  cloneVoiceWithQwenTts,
  getDefaceToolStatus,
  installDefaceTool,
  blurVideoFaces,
  realEsrganJobs
};
