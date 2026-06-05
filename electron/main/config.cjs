// 主进程全局常量与运行配置（测试构建标识、端口、上下文隔离开关等）。
// 取自 reference/src/main.cjs 行 21-27，值逐字保留。
const TEST_BUILD_NAME = "万卷灵境-存储实验版";
const TEST_USER_DATA_DIR = "wanjuan-lingjing-storage-lab";
const TEST_DEFAULT_PORT = 54135;
const TEST_CONTEXT_ISOLATION = process.env.WANJUAN_TEST_CONTEXT_ISOLATION === "1";
const TEST_PROXY_FETCH_SELFTEST = process.env.WANJUAN_TEST_PROXY_FETCH_SELFTEST === "1";
const TEST_PROXY_FETCH_SELFTEST_URL =
  process.env.WANJUAN_TEST_PROXY_FETCH_SELFTEST_URL || "https://example.com/";
const TEST_TEXT_API_BACKUP_PATH = process.env.WANJUAN_TEST_TEXT_API_BACKUP_PATH || "";

module.exports = {
  TEST_BUILD_NAME,
  TEST_USER_DATA_DIR,
  TEST_DEFAULT_PORT,
  TEST_CONTEXT_ISOLATION,
  TEST_PROXY_FETCH_SELFTEST,
  TEST_PROXY_FETCH_SELFTEST_URL,
  TEST_TEXT_API_BACKUP_PATH,
};
