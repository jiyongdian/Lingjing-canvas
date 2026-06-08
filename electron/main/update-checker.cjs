const { app, BrowserWindow, dialog, Menu, shell } = require("./electron-refs.cjs");
const { appendDesktopLog, formatErrorMessage } = require("./logging.cjs");
const { parse: parseYaml } = require("yaml");

const RELEASES_API_URL = "https://api.github.com/repos/Guan-XX003/Lingjing-canvas/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/Guan-XX003/Lingjing-canvas/releases/latest";
const LATEST_MAC_YML_URL = "https://github.com/Guan-XX003/Lingjing-canvas/releases/latest/download/latest-mac.yml";
const AUTO_CHECK_DELAY_MS = 6000;

let activeCheck = null;

function parseVersion(value) {
  const match = String(value || "").match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function selectDownloadAsset(assets = [], arch = process.arch) {
  const available = assets.filter((asset) => asset?.browser_download_url && asset?.name);
  const architecture = String(arch || "").toLowerCase();
  const matchingDmg = available.find((asset) => {
    const name = asset.name.toLowerCase();
    return name.endsWith(".dmg") && name.includes(architecture);
  });
  const dmg = available.find((asset) => asset.name.toLowerCase().endsWith(".dmg"));
  const matchingZip = available.find((asset) => {
    const name = asset.name.toLowerCase();
    return name.endsWith(".zip") && name.includes(architecture);
  });
  const fallbackZip = available.find((asset) => asset.name.toLowerCase().endsWith(".zip"));
  return matchingDmg || dmg || matchingZip || fallbackZip || null;
}

function normalizeRelease(release, arch = process.arch) {
  const version = parseVersion(release?.tag_name)?.join(".") || "";
  if (!version || release?.draft || release?.prerelease) return null;
  const asset = selectDownloadAsset(release?.assets, arch);
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

function normalizeLatestMacYaml(text, arch = process.arch) {
  const metadata = parseYaml(String(text || ""));
  const version = parseVersion(metadata?.version)?.join(".") || "";
  if (!version) return null;
  const files = Array.isArray(metadata?.files) ? metadata.files : [];
  const assets = files.map((file) => ({
    name: String(file?.url || ""),
    browser_download_url: file?.url
      ? `https://github.com/Guan-XX003/Lingjing-canvas/releases/latest/download/${encodeURIComponent(file.url)}`
      : ""
  }));
  const asset = selectDownloadAsset(assets, arch);
  return {
    version,
    name: `万卷灵境 v${version}`,
    notes: "",
    publishedAt: String(metadata?.releaseDate || ""),
    releaseUrl: RELEASES_PAGE_URL,
    downloadUrl: String(asset?.browser_download_url || ""),
    assetName: String(asset?.name || ""),
    source: "latest-mac.yml"
  };
}

async function fetchLatestMacYaml() {
  const response = await fetch(LATEST_MAC_YML_URL, {
    headers: { "user-agent": `wanjuan-lingjing/${app.getVersion()}` },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`latest-mac.yml 请求失败：HTTP ${response.status}`);
  const release = normalizeLatestMacYaml(await response.text());
  if (!release) throw new Error("latest-mac.yml 内容无效");
  return release;
}

async function fetchLatestReleaseWithFallback() {
  try {
    return await fetchLatestRelease();
  } catch (apiError) {
    appendDesktopLog("update-check-api-fallback", { message: formatErrorMessage(apiError) });
    return fetchLatestMacYaml();
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
  parseVersion,
  compareVersions,
  selectDownloadAsset,
  normalizeRelease,
  normalizeLatestMacYaml,
  fetchLatestRelease,
  fetchLatestMacYaml,
  fetchLatestReleaseWithFallback,
  checkForUpdates,
  installApplicationMenu,
  scheduleAutomaticUpdateCheck
};
