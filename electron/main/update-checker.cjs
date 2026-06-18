const { app, BrowserWindow, dialog, Menu, shell } = require("./electron-refs.cjs");
const { appendDesktopLog, formatErrorMessage } = require("./logging.cjs");
const { parse: parseYaml } = require("yaml");

const RELEASES_API_URL = "https://api.github.com/repos/Guan-XX003/Lingjing-canvas/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/Guan-XX003/Lingjing-canvas/releases/latest";
const LATEST_MAC_YML_URL = "https://github.com/Guan-XX003/Lingjing-canvas/releases/latest/download/latest-mac.yml";
const LATEST_WIN_YML_URL = "https://github.com/Guan-XX003/Lingjing-canvas/releases/latest/download/latest.yml";
const AUTO_CHECK_DELAY_MS = 6000;

let activeCheck = null;

function parseVersion(value) {
  const match = String(value || "").match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function parseVersionParts(value) {
  const match = String(value || "").trim().match(/(\d+)\.(\d+)\.(\d+)(?:-([0-9]+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    suffix: Number(match[4] || 0)
  };
}

function formatVersionParts(parts) {
  if (!parts) return "";
  const base = `${parts.major}.${parts.minor}.${parts.patch}`;
  return parts.suffix > 0 ? `${base}-${parts.suffix}` : base;
}

function compareVersions(left, right) {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    const key = index === 0 ? "major" : index === 1 ? "minor" : "patch";
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.suffix !== b.suffix) return a.suffix > b.suffix ? 1 : -1;
  return 0;
}

function normalizePlatform(value = process.platform) {
  const platform = String(value || "").toLowerCase();
  if (platform === "darwin" || platform === "mac" || platform === "macos") return "darwin";
  if (platform === "win32" || platform === "windows" || platform === "win") return "win32";
  return platform;
}

function normalizeArch(value = process.arch) {
  const arch = String(value || "").toLowerCase();
  if (arch === "x86" || arch === "ia32" || arch === "win32") return "ia32";
  if (arch === "amd64" || arch === "x86_64") return "x64";
  if (arch === "aarch64") return "arm64";
  return arch;
}

function assetName(asset) {
  return String(asset?.name || "").toLowerCase();
}

function isReleasePayloadAsset(asset) {
  const name = assetName(asset);
  return (
    !!asset?.browser_download_url &&
    !!asset?.name &&
    !name.endsWith(".blockmap") &&
    !name.endsWith(".yml") &&
    !name.includes("__uninstaller")
  );
}

function findAsset(assets, predicate) {
  return assets.find((asset) => predicate(assetName(asset), asset));
}

function selectDownloadAsset(assets = [], arch = process.arch, platform = process.platform) {
  const available = assets.filter(isReleasePayloadAsset);
  const architecture = normalizeArch(arch);
  const targetPlatform = normalizePlatform(platform);
  if (targetPlatform === "win32") {
    const archExe = findAsset(available, (name) =>
      name.endsWith(".exe") &&
      name.includes("setup") &&
      name.includes(architecture)
    );
    const setupExe = findAsset(available, (name) => name.endsWith(".exe") && name.includes("setup"));
    const archZip = findAsset(available, (name) =>
      name.endsWith(".zip") &&
      name.includes(architecture) &&
      name.includes("win")
    );
    const winZip = findAsset(available, (name) => name.endsWith(".zip") && name.includes("win"));
    const exe = findAsset(available, (name) => name.endsWith(".exe"));
    return archExe || archZip || setupExe || winZip || exe || null;
  }
  if (targetPlatform === "darwin") {
    const dmg = findAsset(available, (name) => name.endsWith(".dmg"));
    const archMacZip = findAsset(available, (name) =>
      name.endsWith(".zip") &&
      name.includes("mac") &&
      name.includes(architecture)
    );
    const macZip = findAsset(available, (name) => name.endsWith(".zip") && name.includes("mac"));
    return dmg || archMacZip || macZip || null;
  }
  const matchingZip = findAsset(available, (name) => name.endsWith(".zip") && name.includes(architecture));
  const fallbackZip = findAsset(available, (name) => name.endsWith(".zip"));
  return matchingZip || fallbackZip || null;
}

function normalizeRelease(release, arch = process.arch, platform = process.platform) {
  const version = formatVersionParts(parseVersionParts(release?.tag_name)) || "";
  if (!version || release?.draft || release?.prerelease) return null;
  const asset = selectDownloadAsset(release?.assets, arch, platform);
  return {
    version,
    name: String(release?.name || release?.tag_name || `v${version}`),
    notes: String(release?.body || "").trim(),
    publishedAt: String(release?.published_at || ""),
    releaseUrl: String(release?.html_url || RELEASES_PAGE_URL),
    downloadUrl: String(asset?.browser_download_url || ""),
    assetName: String(asset?.name || "")
  };
}

async function fetchLatestRelease() {
  const response = await fetch(RELEASES_API_URL, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": `wanjuan-lingjing/${app.getVersion()}`
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`GitHub Release 请求失败：HTTP ${response.status}`);
  const release = normalizeRelease(await response.json());
  if (!release) throw new Error("GitHub 最新发行版信息无效");
  return release;
}

function normalizeLatestYaml(text, arch = process.arch, platform = process.platform, source = "") {
  const metadata = parseYaml(String(text || ""));
  const version = formatVersionParts(parseVersionParts(metadata?.version)) || "";
  if (!version) return null;
  const files = Array.isArray(metadata?.files) ? metadata.files : [];
  const assets = files.map((file) => ({
    name: String(file?.url || ""),
    browser_download_url: file?.url
      ? `https://github.com/Guan-XX003/Lingjing-canvas/releases/latest/download/${encodeURIComponent(file.url)}`
      : ""
  }));
  const asset = selectDownloadAsset(assets, arch, platform);
  return {
    version,
    name: `万卷灵境 v${version}`,
    notes: "",
    publishedAt: String(metadata?.releaseDate || ""),
    releaseUrl: RELEASES_PAGE_URL,
    downloadUrl: String(asset?.browser_download_url || ""),
    assetName: String(asset?.name || ""),
    source: source || (normalizePlatform(platform) === "win32" ? "latest.yml" : "latest-mac.yml")
  };
}

function normalizeLatestMacYaml(text, arch = process.arch) {
  return normalizeLatestYaml(text, arch, "darwin", "latest-mac.yml");
}

function latestYamlUrlForPlatform(platform = process.platform) {
  return normalizePlatform(platform) === "win32" ? LATEST_WIN_YML_URL : LATEST_MAC_YML_URL;
}

async function fetchLatestYaml() {
  const latestYamlUrl = latestYamlUrlForPlatform();
  const latestYamlName = latestYamlUrl.endsWith("latest.yml") ? "latest.yml" : "latest-mac.yml";
  const response = await fetch(latestYamlUrl, {
    headers: { "user-agent": `wanjuan-lingjing/${app.getVersion()}` },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`${latestYamlName} 请求失败：HTTP ${response.status}`);
  const release = normalizeLatestYaml(await response.text(), process.arch, process.platform, latestYamlName);
  if (!release) throw new Error(`${latestYamlName} 内容无效`);
  return release;
}

async function fetchLatestReleaseWithFallback() {
  try {
    return await fetchLatestRelease();
  } catch (apiError) {
    appendDesktopLog("update-check-api-fallback", { message: formatErrorMessage(apiError) });
    return fetchLatestYaml();
  }
}

function getParentWindow() {
  return BrowserWindow?.getFocusedWindow?.() || BrowserWindow?.getAllWindows?.()[0] || undefined;
}

async function showUpdateAvailable(release) {
  const currentVersion = app.getVersion();
  const detail = [
    `当前版本：${currentVersion}`,
    `最新版本：${release.version}`,
    release.assetName ? `安装包：${release.assetName}` : "",
    release.notes ? `\n${release.notes.slice(0, 1200)}` : ""
  ].filter(Boolean).join("\n");
  const result = await dialog.showMessageBox(getParentWindow(), {
    type: "info",
    title: "发现万卷灵境新版本",
    message: `${release.name} 已发布`,
    detail,
    buttons: ["下载更新", "查看发布说明", "稍后"],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });
  if (result.response === 0) {
    await shell.openExternal(release.downloadUrl || release.releaseUrl);
  } else if (result.response === 1) {
    await shell.openExternal(release.releaseUrl);
  }
}

async function showNoUpdate(currentVersion) {
  await dialog.showMessageBox(getParentWindow(), {
    type: "info",
    title: "检查更新",
    message: "当前已是最新版本",
    detail: `万卷灵境 ${currentVersion}`,
    buttons: ["好"],
    defaultId: 0
  });
}

async function showCheckFailed(error) {
  await dialog.showMessageBox(getParentWindow(), {
    type: "warning",
    title: "检查更新失败",
    message: "暂时无法连接 GitHub Release",
    detail: `${formatErrorMessage(error)}\n\n你也可以前往 GitHub 发布页手动检查。`,
    buttons: ["打开发布页", "取消"],
    defaultId: 0,
    cancelId: 1
  }).then(async (result) => {
    if (result.response === 0) await shell.openExternal(RELEASES_PAGE_URL);
  });
}

async function checkForUpdates({ manual = false } = {}) {
  if (activeCheck) return activeCheck;
  activeCheck = (async () => {
    try {
      const release = await fetchLatestReleaseWithFallback();
      const currentVersion = app.getVersion();
      const hasUpdate = compareVersions(release.version, currentVersion) > 0;
      appendDesktopLog("update-check-completed", {
        manual,
        currentVersion,
        latestVersion: release.version,
        hasUpdate,
        assetName: release.assetName,
        source: release.source || "github-api"
      });
      if (hasUpdate) await showUpdateAvailable(release);
      else if (manual) await showNoUpdate(currentVersion);
      return { ok: true, hasUpdate, currentVersion, release };
    } catch (error) {
      appendDesktopLog("update-check-failed", { manual, message: formatErrorMessage(error) });
      if (manual) await showCheckFailed(error);
      return { ok: false, error: formatErrorMessage(error) };
    } finally {
      activeCheck = null;
    }
  })();
  return activeCheck;
}

function installApplicationMenu() {
  if (!Menu) return;
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        {
          label: "检查更新…",
          accelerator: "CommandOrControl+Shift+U",
          click: () => checkForUpdates({ manual: true })
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "GitHub 发布页",
          click: () => shell.openExternal(RELEASES_PAGE_URL)
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function scheduleAutomaticUpdateCheck() {
  if (!app.isPackaged || process.env.WANJUAN_DISABLE_UPDATE_CHECK === "1") return;
  setTimeout(() => checkForUpdates({ manual: false }), AUTO_CHECK_DELAY_MS);
}

module.exports = {
  RELEASES_API_URL,
  RELEASES_PAGE_URL,
  LATEST_MAC_YML_URL,
  LATEST_WIN_YML_URL,
  parseVersion,
  parseVersionParts,
  compareVersions,
  selectDownloadAsset,
  normalizeRelease,
  normalizeLatestYaml,
  normalizeLatestMacYaml,
  latestYamlUrlForPlatform,
  fetchLatestRelease,
  fetchLatestYaml,
  fetchLatestReleaseWithFallback,
  checkForUpdates,
  installApplicationMenu,
  scheduleAutomaticUpdateCheck
};
