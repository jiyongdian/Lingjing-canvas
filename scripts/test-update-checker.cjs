const assert = require("node:assert/strict");
const {
  parseVersion,
  parseVersionParts,
  compareVersions,
  selectDownloadAsset,
  normalizeRelease,
  normalizeLatestYaml,
  normalizeLatestMacYaml,
  latestYamlUrlForPlatform
} = require("../electron/main/update-checker.cjs");

assert.deepEqual(parseVersion("v1.2.9-release"), [1, 2, 9]);
assert.deepEqual(parseVersionParts("v1.2.18-2"), { major: 1, minor: 2, patch: 18, suffix: 2 });
assert.equal(compareVersions("1.3.0", "1.2.9"), 1);
assert.equal(compareVersions("1.2.9", "1.2.9"), 0);
assert.equal(compareVersions("1.2.8", "1.2.9"), -1);
assert.equal(compareVersions("1.2.18-2", "1.2.18"), 1);

const assets = [
  { name: "latest-mac.yml", browser_download_url: "https://example.com/latest.yml" },
  { name: "wanjuan-lingjing-1.3.0.dmg", browser_download_url: "https://example.com/app.dmg" },
  { name: "wanjuan-lingjing-1.3.0-arm64-mac.zip", browser_download_url: "https://example.com/arm64.zip" },
  { name: "wanjuan-lingjing-setup-1.3.0-x64.exe", browser_download_url: "https://example.com/setup-x64.exe" },
  { name: "wanjuan-lingjing-setup-1.3.0-x64.exe.blockmap", browser_download_url: "https://example.com/setup-x64.exe.blockmap" },
  { name: "wanjuan-lingjing-1.3.0-x64-win.zip", browser_download_url: "https://example.com/x64-win.zip" },
  { name: "wanjuan-lingjing-setup-1.3.0-ia32.exe", browser_download_url: "https://example.com/setup-ia32.exe" },
  { name: "wanjuan-lingjing-1.3.0-ia32-win.zip", browser_download_url: "https://example.com/ia32-win.zip" }
];
assert.equal(selectDownloadAsset(assets, "arm64", "darwin").name, "wanjuan-lingjing-1.3.0.dmg");
assert.equal(selectDownloadAsset(assets, "x64", "darwin").name, "wanjuan-lingjing-1.3.0.dmg");
assert.equal(selectDownloadAsset(assets, "x64", "win32").name, "wanjuan-lingjing-setup-1.3.0-x64.exe");
assert.equal(selectDownloadAsset(assets, "ia32", "win32").name, "wanjuan-lingjing-setup-1.3.0-ia32.exe");
assert.equal(selectDownloadAsset(assets, "x64", "win32").name.endsWith(".dmg"), false);
assert.equal(latestYamlUrlForPlatform("win32").endsWith("/latest.yml"), true);
assert.equal(latestYamlUrlForPlatform("darwin").endsWith("/latest-mac.yml"), true);

const release = normalizeRelease({
  tag_name: "v1.3.0-2",
  name: "万卷灵境 v1.3.0-2",
  body: "更新说明",
  html_url: "https://example.com/release",
  assets
}, "arm64", "darwin");
assert.equal(release.version, "1.3.0-2");
assert.equal(release.assetName, "wanjuan-lingjing-1.3.0.dmg");

const windowsRelease = normalizeRelease({
  tag_name: "v1.3.0-release",
  name: "万卷灵境 v1.3.0",
  body: "更新说明",
  html_url: "https://example.com/release",
  assets
}, "x64", "win32");
assert.equal(windowsRelease.assetName, "wanjuan-lingjing-setup-1.3.0-x64.exe");
assert.equal(windowsRelease.downloadUrl, "https://example.com/setup-x64.exe");

const fallbackRelease = normalizeLatestMacYaml(`
version: 1.3.0
files:
  - url: wanjuan-lingjing-1.3.0-arm64-mac.zip
  - url: wanjuan-lingjing-1.3.0.dmg
releaseDate: '2026-06-07T00:00:00.000Z'
`, "arm64");
assert.equal(fallbackRelease.version, "1.3.0");
assert.equal(fallbackRelease.assetName, "wanjuan-lingjing-1.3.0.dmg");
assert.match(fallbackRelease.downloadUrl, /releases\/latest\/download\/wanjuan-lingjing-1.3.0.dmg$/);

const windowsFallbackRelease = normalizeLatestYaml(`
version: 1.3.0
files:
  - url: wanjuan-lingjing-setup-1.3.0-x64.exe
  - url: wanjuan-lingjing-1.3.0-x64-win.zip
releaseDate: '2026-06-07T00:00:00.000Z'
`, "x64", "win32", "latest.yml");
assert.equal(windowsFallbackRelease.version, "1.3.0");
assert.equal(windowsFallbackRelease.assetName, "wanjuan-lingjing-setup-1.3.0-x64.exe");
assert.match(windowsFallbackRelease.downloadUrl, /releases\/latest\/download\/wanjuan-lingjing-setup-1.3.0-x64\.exe$/);
assert.equal(windowsFallbackRelease.source, "latest.yml");

console.log("update checker tests passed");
require("electron").app.quit();
