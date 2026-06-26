const LANGUAGE_ALIASES = {
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-tw": "zh-TW",
  "zh-hk": "zh-TW",
  "zh-hant": "zh-TW",
  en: "en-US",
  "en-us": "en-US",
  "en-gb": "en-US",
};

const LANGUAGE_PACKS = {
  "zh-CN": {},
  "zh-TW": {
    "灵境画布": "靈境畫布",
    "资源": "資源",
    "智能体": "智慧體",
    "工作空间": "工作空間",
    "设置": "設定",
    "设置菜单": "設定選單",
    "模型服务": "模型服務",
    "运行": "執行",
    "数据": "資料",
    "基础": "基礎",
    "一站式中心": "一站式中心",
    "API 配置": "API 配置",
    "模型配置": "模型配置",
    "上传与直链": "上傳與直連",
    "生成与下载": "生成與下載",
    "本地工具": "本機工具",
    "项目与备份": "專案與備份",
    "外观与通用": "外觀與通用",
    "界面主题": "介面主題",
    "语言设置": "語言設定",
    "关于": "關於",
    "版本更新日志": "版本更新日誌",
    "当前版本": "目前版本",
    "个性设置": "個人化設定",
    "云盘设置": "雲端硬碟設定",
    "生成设置": "生成設定",
    "拓展功能": "擴充功能",
    "数据管理": "資料管理",
    "当前已启用全局统一API配置": "目前已啟用全域統一 API 配置",
    "切换石墨灰、曜石黑、晴空蓝、暖砂白、樱雾粉、薄荷绿或跟随系统外观，不改变现有布局结构": "切換石墨灰、曜石黑、晴空藍、暖砂白、櫻霧粉、薄荷綠或跟隨系統外觀，不改變現有布局結構",
    "选择界面语言偏好，后续多语言文案将按此设置展示": "選擇介面語言偏好，後續多語言文案會依此設定顯示",
    "曜石黑": "曜石黑",
    "晴空蓝": "晴空藍",
    "暖砂白": "暖砂白",
    "樱雾粉": "櫻霧粉",
    "薄荷绿": "薄荷綠",
    "石墨灰": "石墨灰",
    "跟随系统": "跟隨系統",
    "全部": "全部",
    "图片": "圖片",
    "视频": "影片",
    "音频": "音訊",
    "文本": "文字",
    "全部来源": "全部來源",
    "AI生成": "AI 生成",
    "外部素材": "外部素材",
    "显示大小": "顯示大小",
    "下载目录": "下載目錄",
    "打开下载目录": "開啟下載目錄",
    "清理失效素材": "清理失效素材",
    "检查中...": "檢查中...",
    "清空全部": "清空全部",
    "暂无资源": "暫無資源",
    "当前筛选没有资源": "目前篩選沒有資源",
    "只看收藏": "只看收藏",
    "显示全部收藏筛选": "顯示全部收藏篩選",
    "右键自由生成你的想象": "右鍵自由生成你的想像",
    "文字生成": "文字生成",
    "图片生成": "圖片生成",
    "视频生成": "影片生成",
    "音乐生成": "音樂生成",
    "错误查询": "錯誤查詢",
    "任务清单": "任務清單",
    "保存设置": "儲存設定",
    "设置已保存": "設定已儲存",
    "个人空间": "個人空間",
    "团队空间": "團隊空間",
    "关闭工作空间": "關閉工作空間",
    "个人提示词资产和局域网团队模板共享": "個人提示詞資產與區域網路團隊模板共享",
    "提示词模板": "提示詞模板",
    "功能提示词": "功能提示詞",
    "新建分组": "新建分組",
    "新增功能提示词": "新增功能提示詞",
    "全部模板": "全部模板",
    "未分组": "未分組",
    "搜索标题、提示词、模型": "搜尋標題、提示詞、模型",
    "返回": "返回",
    "暂无提示词模板。可以先新建分组，后续从生成结果整理为模板。": "暫無提示詞模板。可以先新建分組，後續從生成結果整理為模板。",
    "暂无功能提示词": "暫無功能提示詞",
    "关闭": "關閉",
    "复制": "複製",
    "删除": "刪除",
    "启用": "啟用",
    "添加成员": "新增成員",
    "刷新团队": "刷新團隊",
    "保存团队设置": "儲存團隊設定",
    "重命名分组": "重新命名分組",
    "删除分组": "刪除分組",
    "模板分组": "模板分組",
    "无结果预览": "無結果預覽",
    "使用": "使用",
    "存到个人": "存到個人",
    "发到团队": "發到團隊",
    "复制提示词": "複製提示詞",
    "功能提示词类型": "功能提示詞類型",
    "通用": "通用",
    "本机": "本機",
    "已开启，其他成员优先添加：": "已開啟，其他成員優先新增：",
    "端口": "連接埠",
    "当前共享模板：{count} 个。可在另一台电脑浏览器打开此地址检查是否连通。": "目前共享模板：{count} 個。可在另一台電腦瀏覽器開啟此地址檢查是否連通。",
    "其他可用地址：{urls}": "其他可用地址：{urls}",
    "如果推荐地址连不上，让对方改用同一 Wi-Fi/网线网段里的另一个 192.168/10/172 地址。": "如果推薦地址連不上，讓對方改用同一 Wi-Fi/網路線網段裡的另一個 192.168/10/172 地址。",
    "未开启。Windows 首次开启如无法访问，请允许防火墙访问当前端口。": "未開啟。Windows 首次開啟如無法存取，請允許防火牆存取目前連接埠。",
    "错误：{message}": "錯誤：{message}",
    "{count} 个模板": "{count} 個模板",
    "连接失败：{message}": "連線失敗：{message}",
    "未知错误": "未知錯誤",
    "未刷新": "未刷新",
    "系统错误码：{code}": "系統錯誤碼：{code}",
    "移除": "移除",
    "更换网络环境（如更换Wi-Fi频段，更换有线网，开启VPN等情况）需要关闭团队空间后关闭软件再重新开启软件与团队空间，重新复制更换后的局域网端口。": "更換網路環境（如更換 Wi-Fi 頻段、更換有線網路、開啟 VPN 等情況）需要關閉團隊空間後關閉軟體，再重新開啟軟體與團隊空間，重新複製更換後的區域網路連接埠。",
    "关闭团队空间": "關閉團隊空間",
    "开启团队空间": "開啟團隊空間",
    "我的团队昵称": "我的團隊暱稱",
    "例如：设计一号机": "例如：設計一號機",
    "团队空间端口": "團隊空間連接埠",
    "这是本机对外共享团队空间使用的端口；其他电脑共享时可使用各自设置的端口。": "這是本機對外共享團隊空間使用的連接埠；其他電腦共享時可使用各自設定的連接埠。",
    "成员地址，如 192.168.1.8:39218": "成員地址，如 192.168.1.8:39218",
    "刷新中": "刷新中",
    "标题": "標題",
    "提示词内容": "提示詞內容",
    "没有匹配的功能提示词": "沒有匹配的功能提示詞",
    "暂无团队模板。先添加成员地址并刷新，或让本机发布模板。": "暫無團隊模板。先新增成員地址並刷新，或讓本機發布模板。",
    "团队空间开启失败：{message}": "團隊空間開啟失敗：{message}",
    "端口可能被占用或被防火墙拦截": "連接埠可能被占用或被防火牆攔截",
    "已复制": "已複製",
    "复制失败": "複製失敗",
    "已刷新 {count} 个成员": "已刷新 {count} 個成員",
    "输入新的分组名称": "輸入新的分組名稱",
    "未命名分组": "未命名分組",
    "分组已重命名": "分組已重新命名",
    "删除分组“{name}”？": "刪除分組「{name}」？",
    "该分组下 {count} 个模板会移到“未分组”。": "該分組下 {count} 個模板會移到「未分組」。",
    "分组已删除": "分組已刪除",
    "输入提示词模板分组名称": "輸入提示詞模板分組名稱",
    "新分组": "新分組",
    "新功能提示词": "新功能提示詞",
    "已删除模板": "已刪除模板",
    "已从团队空间删除": "已從團隊空間刪除",
    "已存到个人空间": "已存到個人空間",
    "团队设置已保存": "團隊設定已儲存",
    "已保存到工作空间": "已儲存到工作空間",
    "已发布到团队空间": "已發布到團隊空間",
    "已加入团队发布列表，开启团队空间后可被成员拉取": "已加入團隊發布列表，開啟團隊空間後可被成員拉取",
    },
  "en-US": {
    "灵境画布": "Canvas",
    "资源": "Assets",
    "智能体": "Agents",
    "工作空间": "Workspace",
    "设置": "Settings",
    "设置菜单": "Settings Menu",
    "模型服务": "Model Services",
    "运行": "Run",
    "数据": "Data",
    "基础": "Basics",
    "一站式中心": "One-stop Center",
    "API 配置": "API Config",
    "模型配置": "Model Config",
    "上传与直链": "Uploads & Links",
    "生成与下载": "Generation & Downloads",
    "本地工具": "Local Tools",
    "项目与备份": "Projects & Backup",
    "外观与通用": "Appearance & General",
    "界面主题": "Theme",
    "语言设置": "Language",
    "关于": "About",
    "版本更新日志": "Release Notes",
    "当前版本": "Current Version",
    "个性设置": "Personalization",
    "云盘设置": "Cloud Storage",
    "生成设置": "Generation",
    "拓展功能": "Extensions",
    "数据管理": "Data",
    "当前已启用全局统一API配置": "Global unified API config is enabled",
    "切换石墨灰、曜石黑、晴空蓝、暖砂白、樱雾粉、薄荷绿或跟随系统外观，不改变现有布局结构": "Switch the visual theme without changing the current layout.",
    "选择界面语言偏好，后续多语言文案将按此设置展示": "Choose the interface language. Supported interface text follows this setting.",
    "曜石黑": "Obsidian",
    "晴空蓝": "Sky Blue",
    "暖砂白": "Warm Sand",
    "樱雾粉": "Rose Mist",
    "薄荷绿": "Mint",
    "石墨灰": "Graphite",
    "跟随系统": "Follow System",
    "全部": "All",
    "图片": "Images",
    "视频": "Videos",
    "音频": "Audio",
    "文本": "Text",
    "全部来源": "All Sources",
    "AI生成": "AI Generated",
    "外部素材": "External",
    "显示大小": "Size",
    "下载目录": "Downloads",
    "打开下载目录": "Open Downloads",
    "清理失效素材": "Clean Invalid Assets",
    "检查中...": "Checking...",
    "清空全部": "Clear All",
    "暂无资源": "No assets yet",
    "当前筛选没有资源": "No assets match this filter",
    "只看收藏": "Favorites Only",
    "显示全部收藏筛选": "Show All Favorites Filter",
    "右键自由生成你的想象": "Right-click to create freely",
    "文字生成": "Text",
    "图片生成": "Image",
    "视频生成": "Video",
    "音乐生成": "Music",
    "错误查询": "Errors",
    "任务清单": "Tasks",
    "保存设置": "Save Settings",
    "设置已保存": "Settings saved",
    "个人空间": "Personal",
    "团队空间": "Team",
    "关闭工作空间": "Close Workspace",
    "个人提示词资产和局域网团队模板共享": "Personal prompt assets and LAN team templates",
    "提示词模板": "Prompt Templates",
    "功能提示词": "Function Prompts",
    "新建分组": "New Group",
    "新增功能提示词": "New Function Prompt",
    "全部模板": "All Templates",
    "未分组": "Ungrouped",
    "搜索标题、提示词、模型": "Search titles, prompts, models",
    "返回": "Back",
    "暂无提示词模板。可以先新建分组，后续从生成结果整理为模板。": "No prompt templates yet. Create a group first, then organize generated results into templates.",
    "暂无功能提示词": "No function prompts yet",
    "关闭": "Close",
    "复制": "Copy",
    "删除": "Delete",
    "启用": "Enabled",
    "添加成员": "Add Member",
    "刷新团队": "Refresh Team",
    "保存团队设置": "Save Team Settings",
    "重命名分组": "Rename Group",
    "删除分组": "Delete Group",
    "模板分组": "Template Group",
    "无结果预览": "No Preview",
    "使用": "Use",
    "存到个人": "Save to Personal",
    "发到团队": "Publish to Team",
    "复制提示词": "Copy Prompt",
    "功能提示词类型": "Function Prompt Type",
    "通用": "General",
    "本机": "This Device",
    "已开启，其他成员优先添加：": "Enabled. Other members should add:",
    "端口": "Port",
    "当前共享模板：{count} 个。可在另一台电脑浏览器打开此地址检查是否连通。": "{count} templates shared. Open this address in a browser on another computer to check the connection.",
    "其他可用地址：{urls}": "Other available addresses: {urls}",
    "如果推荐地址连不上，让对方改用同一 Wi-Fi/网线网段里的另一个 192.168/10/172 地址。": "If the recommended address does not connect, ask them to use another 192.168/10/172 address on the same Wi-Fi or wired network.",
    "未开启。Windows 首次开启如无法访问，请允许防火墙访问当前端口。": "Disabled. On Windows, allow firewall access to this port if it is not reachable the first time.",
    "错误：{message}": "Error: {message}",
    "{count} 个模板": "{count} templates",
    "连接失败：{message}": "Connection failed: {message}",
    "未知错误": "Unknown error",
    "未刷新": "Not refreshed",
    "系统错误码：{code}": "System error code: {code}",
    "移除": "Remove",
    "更换网络环境（如更换Wi-Fi频段，更换有线网，开启VPN等情况）需要关闭团队空间后关闭软件再重新开启软件与团队空间，重新复制更换后的局域网端口。": "After changing networks, such as switching Wi-Fi bands, changing wired networks, or enabling a VPN, close Team Space, quit the app, reopen both, and copy the new LAN address.",
    "关闭团队空间": "Turn Off Team Space",
    "开启团队空间": "Turn On Team Space",
    "我的团队昵称": "My Team Nickname",
    "例如：设计一号机": "Example: Design Station 1",
    "团队空间端口": "Team Space Port",
    "这是本机对外共享团队空间使用的端口；其他电脑共享时可使用各自设置的端口。": "This port is used by this device to share Team Space. Other computers can use their own configured ports.",
    "成员地址，如 192.168.1.8:39218": "Member address, e.g. 192.168.1.8:39218",
    "刷新中": "Refreshing",
    "标题": "Title",
    "提示词内容": "Prompt Content",
    "没有匹配的功能提示词": "No matching function prompts",
    "暂无团队模板。先添加成员地址并刷新，或让本机发布模板。": "No team templates yet. Add a member address and refresh, or publish templates from this device.",
    "团队空间开启失败：{message}": "Failed to start Team Space: {message}",
    "端口可能被占用或被防火墙拦截": "The port may be occupied or blocked by the firewall",
    "已复制": "Copied",
    "复制失败": "Copy failed",
    "已刷新 {count} 个成员": "Refreshed {count} members",
    "输入新的分组名称": "Enter a new group name",
    "未命名分组": "Untitled Group",
    "分组已重命名": "Group renamed",
    "删除分组“{name}”？": "Delete group \"{name}\"?",
    "该分组下 {count} 个模板会移到“未分组”。": "{count} templates in this group will move to Ungrouped.",
    "分组已删除": "Group deleted",
    "输入提示词模板分组名称": "Enter a prompt template group name",
    "新分组": "New Group",
    "新功能提示词": "New Function Prompt",
    "已删除模板": "Template deleted",
    "已从团队空间删除": "Deleted from Team Space",
    "已存到个人空间": "Saved to Personal Space",
    "团队设置已保存": "Team settings saved",
    "已保存到工作空间": "Saved to Workspace",
    "已发布到团队空间": "Published to Team Space",
    "已加入团队发布列表，开启团队空间后可被成员拉取": "Added to the team publish list. Members can fetch it after Team Space is enabled.",
  },
};

const TEXT_NODE_ROOTS = [
  "[data-wanjuan-i18n-root]",
  ".wanjuan-app-top-nav",
  ".wanjuan-settings-page",
  ".wanjuan-resource-toolbar",
  ".wanjuan-resource-main",
  ".wanjuan-workspace-page",
  ".wanjuan-context-menu-item",
  ".wanjuan-toast",
  ".wanjuan-backup-dialog",
  ".wanjuan-project-group-dialog",
];

const SKIP_TEXT_SELECTOR = [
  "input",
  "textarea",
  "select",
  "script",
  "style",
  "code",
  "pre",
  "[contenteditable='true']",
  ".wanjuan-agent-page textarea",
  ".wanjuan-agent-page [data-message-id]",
].join(",");

const SKIP_ATTRIBUTE_SELECTOR = [
  "script",
  "style",
  "code",
  "pre",
  "[contenteditable='true']",
  ".wanjuan-agent-page [data-message-id]",
].join(",");

const textOriginals = new WeakMap();
const attrOriginals = new WeakMap();
let currentLanguage = "zh-CN";
let observer = null;
let scheduled = false;

const normalizeLanguage = (language) => {
  const raw = String(language || "").trim();
  const key = raw.toLowerCase();
  return LANGUAGE_ALIASES[key] || (LANGUAGE_PACKS[raw] ? raw : "zh-CN");
};

const getStoredLanguage = () => {
  try {
    return localStorage.getItem("appLanguage") || localStorage.getItem("uiLanguage") || "";
  } catch {
    return "";
  }
};

const missingSet = () => {
  const root = globalThis;
  if (!root.__wanjuanI18nMissing) root.__wanjuanI18nMissing = new Set();
  return root.__wanjuanI18nMissing;
};

const rememberMissing = (text, language) => {
  if (!text || language === "zh-CN") return;
  if (!/[\u4e00-\u9fff]/.test(text)) return;
  missingSet().add(`${language}:${text}`);
};

const renderedFromSource = (source, value) => {
  const normalizedSource = String(source ?? "");
  const normalizedValue = String(value ?? "");
  if (normalizedSource === normalizedValue) return true;
  return Object.values(LANGUAGE_PACKS).some((pack) => pack?.[normalizedSource] === normalizedValue);
};

const canonicalSource = (value) => {
  const source = String(value ?? "");
  for (const pack of Object.values(LANGUAGE_PACKS)) {
    for (const [key, translated] of Object.entries(pack || {})) {
      if (translated === source) return key;
    }
  }
  return source;
};

const t = (text, language = currentLanguage) => {
  const normalizedLanguage = normalizeLanguage(language);
  const source = String(text ?? "");
  if (!source || normalizedLanguage === "zh-CN") return source;
  const translated = LANGUAGE_PACKS[normalizedLanguage]?.[source];
  if (!translated) rememberMissing(source, normalizedLanguage);
  return translated || source;
};

const format = (text, values = {}, language = currentLanguage) =>
  t(text, language).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    values[key] == null ? match : String(values[key])
  );

const splitWhitespace = (value) => {
  const source = String(value ?? "");
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return {
    lead: match?.[1] || "",
    core: match?.[2] || source,
    tail: match?.[3] || "",
  };
};

const isInUiRoot = (element) => {
  if (!element?.closest) return false;
  return TEXT_NODE_ROOTS.some((selector) => element.closest(selector));
};

const shouldSkipElement = (element) => !element || element.closest?.(SKIP_TEXT_SELECTOR);

const shouldSkipAttributeElement = (element) => !element || element.closest?.(SKIP_ATTRIBUTE_SELECTOR);

const translateTextNode = (node) => {
  const parent = node.parentElement;
  if (!parent || shouldSkipElement(parent) || !isInUiRoot(parent)) return;
  const currentValue = node.nodeValue;
  const storedOriginal = textOriginals.get(node);
  const original = storedOriginal && renderedFromSource(storedOriginal, currentValue) ?
    storedOriginal :
    canonicalSource(currentValue);
  const { lead, core, tail } = splitWhitespace(original);
  if (!core.trim()) return;
  textOriginals.set(node, original);
  const translated = t(core.trim());
  const nextValue = `${lead}${translated}${tail}`;
  if (node.nodeValue !== nextValue) node.nodeValue = nextValue;
};

const translateElementAttributes = (element) => {
  if (!element || shouldSkipAttributeElement(element) || !isInUiRoot(element)) return;
  const attrs = ["title", "aria-label", "placeholder"];
  let originalMap = attrOriginals.get(element);
  if (!originalMap) {
    originalMap = {};
    attrOriginals.set(element, originalMap);
  }
  attrs.forEach((attr) => {
    if (!element.hasAttribute(attr)) return;
    const currentValue = element.getAttribute(attr);
    const storedOriginal = originalMap[attr];
    const original = storedOriginal && renderedFromSource(storedOriginal, currentValue) ?
      storedOriginal :
      canonicalSource(currentValue);
    if (!original) return;
    originalMap[attr] = original;
    const translated = t(original);
    if (element.getAttribute(attr) !== translated) element.setAttribute(attr, translated);
  });
};

const translateTree = (root = document.body) => {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node);
    node = walker.nextNode();
  }
  if (root.nodeType === Node.ELEMENT_NODE) translateElementAttributes(root);
  root.querySelectorAll?.("[title], [aria-label], [placeholder]").forEach(translateElementAttributes);
};

const scheduleTranslate = () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    translateTree();
  });
};

const setLanguage = (language) => {
  const nextLanguage = normalizeLanguage(language);
  currentLanguage = nextLanguage;
  try {
    document.documentElement.dataset.wanjuanLanguage = nextLanguage;
  } catch {}
  translateTree();
};

const registerRoot = (selector) => {
  const normalizedSelector = String(selector || "").trim();
  if (!normalizedSelector || TEXT_NODE_ROOTS.includes(normalizedSelector)) return;
  TEXT_NODE_ROOTS.push(normalizedSelector);
  translateTree();
};

const addLanguagePack = (language, entries = {}) => {
  const normalizedLanguage = normalizeLanguage(language);
  LANGUAGE_PACKS[normalizedLanguage] = {
    ...(LANGUAGE_PACKS[normalizedLanguage] || {}),
    ...(entries || {}),
  };
  translateTree();
};

const install = () => {
  currentLanguage = normalizeLanguage(getStoredLanguage());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setLanguage(currentLanguage), { once: true });
  } else {
    setLanguage(currentLanguage);
  }
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length || mutation.type === "attributes")) scheduleTranslate();
  });
  const startObserver = () => {
    if (!document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder"],
    });
  };
  if (document.body) startObserver();
  else document.addEventListener("DOMContentLoaded", startObserver, { once: true });
};

globalThis.wanjuanI18nRuntime = {
  languagePacks: LANGUAGE_PACKS,
  normalizeLanguage,
  getLanguage: () => currentLanguage,
  setLanguage,
  t,
  format,
  translateTree,
  registerRoot,
  addLanguagePack,
  install,
};

globalThis.wanjuanT = t;

install();
