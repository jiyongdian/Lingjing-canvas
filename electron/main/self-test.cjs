// 文本 API 自测配置加载（仅在 WANJUAN_TEST_* 环境变量开启时使用）。
const fs = require("fs");
const { TEST_TEXT_API_BACKUP_PATH } = require("./config.cjs");

function loadTextApiSelfTestConfig() {
  if (!TEST_TEXT_API_BACKUP_PATH) return null;
  const backup = JSON.parse(fs.readFileSync(TEST_TEXT_API_BACKUP_PATH, "utf8"));
  const storage = backup?.modules?.settings?.chromeStorage || {};
  const configs = Array.isArray(storage.apiConfigs) ? storage.apiConfigs : [];
  const candidateModels = String(storage.textModel || "")
    .split(/\n+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const model =
    candidateModels.find((value) => /lite/i.test(value)) ||
    candidateModels.find((value) => /flash/i.test(value)) ||
    candidateModels[0] ||
    "gemini-3.1-flash-lite-preview";
  const configId =
    storage.textModelApiBindings?.[model] ||
    storage.textApiConfigId ||
    "default";
  const config =
    configs.find((item) => item?.id === configId) ||
    configs.find((item) => item?.id === storage.textApiConfigId) ||
    configs[0];
  const key = config?.key || config?.apiKey || config?.token || storage.textApiKey;
  const baseUrl = String(config?.url || storage.textApiUrl || "").replace(/\s+/g, "").replace(/\/$/, "");
  if (!baseUrl || !key) throw new Error("Text API self-test config is incomplete");
  return {
    model,
    configId: String(config?.id || configId || ""),
    baseUrl,
    key
  };
}

module.exports = { loadTextApiSelfTestConfig };
