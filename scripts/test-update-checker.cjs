const assert = require("node:assert/strict");
const {
  parseVersion,
  compareVersions,
  selectDownloadAsset,
  normalizeRelease,
  normalizeLatestMacYaml
} = require("../electron/main/update-checker.cjs");

assert.deepEqual(parseVersion("v1.2.9-release"), [1, 2, 9]);
assert.equal(compareVersions("1.3.0", "1.2.9"), 1);
assert.equal(compareVersions("1.2.9", "1.2.9"), 0);
assert.equal(compareVersions("1.2.8", "1.2.9"), -1);

const assets = [
  { name: "latest-mac.yml", browser_download_url: "https://example.com/latest.yml" },
  { name: "wanjuan-lingjing-1.3.0.dmg", browser_download_url: "https://example.com/app.dmg" },
  { name: "wanjuan-lingjing-1.3.0-arm64-mac.zip", browser_download_url: "https://example.com/arm64.zip" }
];
assert.equal(selectDownloadAsset(assets, "arm64").name, "wanjuan-lingjing-1.3.0.dmg");
assert.equal(selectDownloadAsset(assets, "x64").name, "wanjuan-lingjing-1.3.0.dmg");

const release = normalizeRelease({
  tag_name: "v1.3.0-release",
  name: "万卷灵境 v1.3.0",
  body: "更新说明",
  html_url: "https://example.com/release",
  assets
}, "arm64");
assert.equal(release.version, "1.3.0");
assert.equal(release.assetName, "wanjuan-lingjing-1.3.0.dmg");

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

console.log("update checker tests passed");
require("electron").app.quit();
