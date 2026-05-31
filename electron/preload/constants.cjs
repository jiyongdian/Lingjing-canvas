// 预加载层常量：存储键、IndexedDB 库名、项目安全快照参数、性能档位预设等。

const STORAGE_KEY = "__wanjuan_desktop_chrome_storage__";
const RECOVERY_MARKER_KEY = "__wanjuan_desktop_storage_recovery__";
const LEGACY_DATA_DECISION_KEY = "__wanjuan_legacy_data_decision__";
const LEGACY_DATA_DECISION_VERSION = "2026-04-24-v1";
const LEGACY_THEME_STORAGE_KEYS = ["infini_theme"];
const BOOT_THEME_MIRROR_KEY = "__wanjuan_boot_theme_mode__";
const BOOT_THEME_STORAGE_KEYS = ["themeMode", "uiTheme", "theme", "appearanceTheme"];
const STORAGE_DB_NAME = "wanjuan-desktop-chrome-storage";
const STORAGE_DB_VERSION = 1;
const STORAGE_DB_STORE = "items";
const CANVAS_STATE_DB_NAME = "mutiwindow";
const CANVAS_STATE_STORE = "canvas_state";
const CANVAS_STATE_PREFIX = "canvas-state-v1-";
const DESKTOP_CANVAS_MIRROR_PREFIX = "desktop-canvas-state-v1-";
const PROJECT_SAFETY_DB_NAME = "wanjuan-project-safety";
const PROJECT_SAFETY_DB_VERSION = 1;
const PROJECT_SAFETY_SNAPSHOT_STORE = "snapshots";
const PROJECT_SAFETY_QUARANTINE_STORE = "quarantine";
const PROJECT_SAFETY_META_STORE = "meta";
const PROJECT_SAFETY_MAX_SNAPSHOTS_PER_PROJECT = 100;
const PROJECT_SAFETY_DEFAULT_CURRENT_BACKUP_INTERVAL_MS = 10 * 60 * 1000;
const PROJECT_SAFETY_DEFAULT_ALL_BACKUP_INTERVAL_MS = 60 * 60 * 1000;
const PROJECT_SAFETY_SCHEDULER_TICK_MS = 60 * 1000;
const PROJECT_SAFETY_FILE_RETENTION_DAYS = 30;
const PROJECT_SAFETY_SNAPSHOT_FILE_FOLDER = "安全快照";
const PROJECT_SAFETY_RUNTIME_ENABLED = false;
const PERFORMANCE_PROFILE_STORAGE_KEY = "wanjuanPerformanceProfile";
const PERFORMANCE_PROFILE_CUSTOM_KEY = "wanjuanPerformanceCustomSettings";
const PERFORMANCE_PROFILE_PRESETS = {
  performance: {
    key: "performance",
    label: "极速性能",
    description: "低渲染负载，推荐低配电脑或大项目批量生成。",
    layeredRunConcurrencyOptions: "1\n2\n3",
    layeredRunMaxConcurrency: 2,
    aiGenerateLimit: 2,
    aiChatLimit: 1,
    aiSubmitLimit: 1,
    aiPollLimit: 1,
    renderMode: "low"
  },
  balanced: {
    key: "balanced",
    label: "均衡",
    description: "默认档位，兼顾稳定和体验。",
    layeredRunConcurrencyOptions: "2\n3\n5",
    layeredRunMaxConcurrency: 3,
    aiGenerateLimit: 3,
    aiChatLimit: 2,
    aiSubmitLimit: 1,
    aiPollLimit: 2,
    renderMode: "balanced"
  },
  quality: {
    key: "quality",
    label: "高画质",
    description: "更完整的预览和动画，适合高性能电脑。",
    layeredRunConcurrencyOptions: "3\n5\n8",
    layeredRunMaxConcurrency: 5,
    aiGenerateLimit: 5,
    aiChatLimit: 3,
    aiSubmitLimit: 2,
    aiPollLimit: 2,
    renderMode: "quality"
  },
  custom: {
    key: "custom",
    label: "自定义",
    description: "保留手动设置的并发和渲染策略。",
    layeredRunConcurrencyOptions: "2\n3\n5",
    layeredRunMaxConcurrency: 3,
    aiGenerateLimit: 3,
    aiChatLimit: 2,
    aiSubmitLimit: 1,
    aiPollLimit: 2,
    renderMode: "custom"
  }
};
const PROJECT_SAFETY_INTERVAL_OPTIONS = [
  { value: 5 * 60 * 1000, label: "5 分钟" },
  { value: 10 * 60 * 1000, label: "10 分钟" },
  { value: 15 * 60 * 1000, label: "15 分钟" },
  { value: 30 * 60 * 1000, label: "30 分钟" },
  { value: 60 * 60 * 1000, label: "1 小时" },
  { value: 2 * 60 * 60 * 1000, label: "2 小时" },
  { value: 6 * 60 * 60 * 1000, label: "6 小时" },
  { value: 24 * 60 * 60 * 1000, label: "24 小时" }
];

module.exports = {
  STORAGE_KEY,
  RECOVERY_MARKER_KEY,
  LEGACY_DATA_DECISION_KEY,
  LEGACY_DATA_DECISION_VERSION,
  LEGACY_THEME_STORAGE_KEYS,
  BOOT_THEME_MIRROR_KEY,
  BOOT_THEME_STORAGE_KEYS,
  STORAGE_DB_NAME,
  STORAGE_DB_VERSION,
  STORAGE_DB_STORE,
  CANVAS_STATE_DB_NAME,
  CANVAS_STATE_STORE,
  CANVAS_STATE_PREFIX,
  DESKTOP_CANVAS_MIRROR_PREFIX,
  PROJECT_SAFETY_DB_NAME,
  PROJECT_SAFETY_DB_VERSION,
  PROJECT_SAFETY_SNAPSHOT_STORE,
  PROJECT_SAFETY_QUARANTINE_STORE,
  PROJECT_SAFETY_META_STORE,
  PROJECT_SAFETY_MAX_SNAPSHOTS_PER_PROJECT,
  PROJECT_SAFETY_DEFAULT_CURRENT_BACKUP_INTERVAL_MS,
  PROJECT_SAFETY_DEFAULT_ALL_BACKUP_INTERVAL_MS,
  PROJECT_SAFETY_SCHEDULER_TICK_MS,
  PROJECT_SAFETY_FILE_RETENTION_DAYS,
  PROJECT_SAFETY_SNAPSHOT_FILE_FOLDER,
  PROJECT_SAFETY_RUNTIME_ENABLED,
  PERFORMANCE_PROFILE_STORAGE_KEY,
  PERFORMANCE_PROFILE_CUSTOM_KEY,
  PERFORMANCE_PROFILE_PRESETS,
  PROJECT_SAFETY_INTERVAL_OPTIONS,
};
