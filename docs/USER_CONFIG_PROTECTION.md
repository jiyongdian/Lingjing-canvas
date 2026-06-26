# 用户配置保护机制说明

## ✅ 现有保护机制（已实现）

### 核心逻辑

```javascript
// 第 35590-35604 行
if (settings.jixinBuiltinBaseConfigVersion !== WANJUAN_JIXIN_BUILTIN_BASE_CONFIG_VERSION) {
  let shouldSeedJixinBuiltinConfig = !wanjuanHasUserModelConfiguration(settings);
  if (shouldSeedJixinBuiltinConfig) {
    // 🟢 只有在用户没有任何配置时，才应用默认配置
    let seededSettings = wanjuanBuildJixinBuiltinBasePatch(settings);
    // ... 应用默认配置
  } else {
    // 🔴 如果用户已有配置，只更新版本号，不覆盖用户配置
    settings = {
      ...settings,
      jixinBuiltinBaseConfigVersion: WANJUAN_JIXIN_BUILTIN_BASE_CONFIG_VERSION,
    };
  }
}
```

---

## 🛡️ 保护检测（wanjuanHasUserModelConfiguration）

### 检测内容（第 16478-16500 行）

系统会检查用户是否有以下任何配置：

#### 1. 模型文本配置
```javascript
hasModelText = [`textModel`, `drawingModel`, `videoModel`, `audioModel`, `ttsMusicModel`]
  .some((key) => String(settings?.[key] || ``).trim())
```
- 用户是否添加或修改了任何模型列表

#### 2. 模型绑定配置
```javascript
hasModelBinding = [
  `textModelApiBindings`,
  `textModelProtocolBindings`,
  `imageModelApiBindings`,
  `imageModelProtocolBindings`,
  `videoModelApiBindings`,
  `videoModelProtocolBindings`,
  `audioModelApiBindings`,
  `audioModelProtocolBindings`,
].some((key) => settings?.[key] && typeof settings[key] == `object` && Object.keys(settings[key]).length > 0)
```
- 用户是否手动配置了模型与 API 的绑定
- 用户是否手动配置了模型协议

#### 3. 全局配置
```javascript
hasStoredGlobalConfig = Array.isArray(settings.storedGlobalConfigs) && settings.storedGlobalConfigs.length > 0
```
- 用户是否导入了配置备份
- 用户是否创建了自定义全局配置

#### 4. API 配置
```javascript
hasNonDefaultApiConfig = apiConfigs.some((config) => {
  let normalizedUrl = String(config?.url || ``).replace(/\s+/g, ``).replace(/\/+$/, ``);
  return config?.id !== WANJUAN_JIXIN_DEFAULT_API_CONFIG_ID ||
    normalizedUrl && normalizedUrl !== WANJUAN_JIXIN_DEFAULT_API_URL ||
    String(config?.key || ``).trim();
});
```
- 用户是否添加了新的 API 配置
- 用户是否修改了极鑫 API 的地址
- 用户是否填写了 API Key

---

## 🔄 配置合并机制（wanjuanMergeModelText）

### 智能合并（第 16449-16464 行）

```javascript
const wanjuanMergeModelText = (...inputs) => {
  let seen = new Set(), models = [];
  inputs.forEach((input) => {
    (Array.isArray(input) ? input : String(input || ``).split(/[\n,，、]+/))
      .map((model) => String(model || ``).trim())
      .filter(Boolean)
      .forEach((model) => {
        if (seen.has(model)) return;
        seen.add(model);
        models.push(model);
      });
  });
  return models.join(`\n`);
};
```

**工作原理**：
1. 先添加用户的模型列表（`source.textModel`）
2. 再添加默认模型列表（`WANJUAN_JIXIN_BUILTIN_TEXT_MODELS`）
3. **自动去重** - 用户已有的模型不会重复添加
4. **保留顺序** - 用户的模型排在前面

**示例**：
```javascript
// 用户配置: "gpt-4o\nclaude-opus"
// 默认配置: "gpt-5.5\ngpt-5.4\nclaude-opus-4-8"
// 合并结果: "gpt-4o\nclaude-opus\ngpt-5.5\ngpt-5.4\nclaude-opus-4-8"
```

---

## 🔒 对象配置合并（wanjuanMergeObjectDefaults）

### 用户优先（第 16474-16477 行）

```javascript
const wanjuanMergeObjectDefaults = (target = {}, defaults = {}) => ({
  ...(defaults || {}),      // 1. 先放默认配置
  ...(target && typeof target == `object` ? target : {}),  // 2. 用户配置覆盖
});
```

**工作原理**：
- 默认配置作为基础
- 用户配置会覆盖同名的默认配置
- 用户独有的配置会被保留

**示例**：
```javascript
// 默认协议: { "gpt-5.5": "jixin-default", "gemini-3-pro": "jixin-default" }
// 用户协议: { "gpt-5.5": "my-custom-api", "my-model": "my-api" }
// 合并结果: { "gpt-5.5": "my-custom-api", "gemini-3-pro": "jixin-default", "my-model": "my-api" }
```

---

## 📝 配置应用逻辑（wanjuanBuildJixinBuiltinBasePatch）

### 第 16515-16574 行

```javascript
// 模型列表合并 - 用户的在前，默认的在后，自动去重
textModel = wanjuanMergeModelText(source.textModel, WANJUAN_JIXIN_BUILTIN_TEXT_MODELS),
drawingModel = wanjuanMergeModelText(source.drawingModel, WANJUAN_JIXIN_BUILTIN_IMAGE_MODELS),
videoModel = wanjuanMergeModelText(source.videoModel, WANJUAN_JIXIN_BUILTIN_VIDEO_MODELS),
ttsMusicModel = wanjuanMergeModelText(source.ttsMusicModel, WANJUAN_JIXIN_BUILTIN_MUSIC_MODELS),

// API 绑定合并 - 用户配置优先
textModelApiBindings: wanjuanMergeObjectDefaults(source.textModelApiBindings, textBindings),
imageModelApiBindings: wanjuanMergeObjectDefaults(source.imageModelApiBindings, imageBindings),
videoModelApiBindings: wanjuanMergeObjectDefaults(source.videoModelApiBindings, videoBindings),
audioModelApiBindings: wanjuanMergeObjectDefaults(source.audioModelApiBindings, musicBindings),

// 协议绑定合并 - 用户配置优先
textModelProtocolBindings: wanjuanMergeObjectDefaults(source.textModelProtocolBindings, WANJUAN_JIXIN_BUILTIN_TEXT_PROTOCOLS),
imageModelProtocolBindings: wanjuanMergeObjectDefaults(source.imageModelProtocolBindings, WANJUAN_JIXIN_BUILTIN_IMAGE_PROTOCOLS),
```

---

## 🎯 保护场景

### ✅ 场景 1：首次安装
- **状态**：无任何用户配置
- **检测**：`wanjuanHasUserModelConfiguration` 返回 `false`
- **结果**：应用默认配置（17个文本模型、21个图片模型等）

### ✅ 场景 2：用户添加了模型
- **状态**：用户在界面添加了 `my-custom-model`
- **检测**：`wanjuanHasUserModelConfiguration` 返回 `true`（hasModelText = true）
- **结果**：🔒 **不覆盖**，只更新版本号，用户的 `my-custom-model` 保留

### ✅ 场景 3：用户修改了参数
- **状态**：用户修改了清晰度、时长、比例等参数
- **检测**：这些参数已保存在用户配置中
- **结果**：🔒 **不覆盖**，使用 `source.videoResolutions || 默认值` 逻辑保护

### ✅ 场景 4：用户导入了配置备份
- **状态**：用户导入了之前的配置备份
- **检测**：`wanjuanHasUserModelConfiguration` 返回 `true`（hasStoredGlobalConfig = true）
- **结果**：🔒 **不覆盖**，完全使用导入的配置

### ✅ 场景 5：用户填写了 API Key
- **状态**：用户在极鑫配置中填写了令牌
- **检测**：`wanjuanHasUserModelConfiguration` 返回 `true`（hasNonDefaultApiConfig = true）
- **结果**：🔒 **不覆盖**，保留用户的 API Key

### ✅ 场景 6：用户添加了新 API 配置
- **状态**：用户添加了自己的中转站配置
- **检测**：`wanjuanHasUserModelConfiguration` 返回 `true`（hasNonDefaultApiConfig = true）
- **结果**：🔒 **不覆盖**，保留所有 API 配置

---

## 🔧 版本控制机制

### 配置版本号
```javascript
const WANJUAN_JIXIN_BUILTIN_BASE_CONFIG_VERSION = `2026-06-19-v3`;
```

### 工作原理
1. 每次默认配置更新时，更改版本号（如 `2026-06-19-v3` → `2026-06-26-v1`）
2. 检查 `settings.jixinBuiltinBaseConfigVersion` 是否匹配
3. 如果不匹配且用户无自定义配置 → 应用新的默认配置
4. 如果不匹配但用户有自定义配置 → 只更新版本号，不覆盖

---

## ✅ 总结

### 现有机制已完美保护用户配置

1. ✅ **首次安装时**：自动应用默认配置
2. ✅ **用户添加模型时**：保留用户添加的模型
3. ✅ **用户修改参数时**：保留用户的修改
4. ✅ **用户导入备份时**：完全使用导入的配置
5. ✅ **用户填写 API Key 时**：保留用户的配置
6. ✅ **智能合并**：默认模型会被添加到用户模型之后（不重复）
7. ✅ **用户优先**：用户的配置永远优先于默认配置

### 我们只需要：
- 修改默认模型列表常量
- 修改默认协议映射
- 更新版本号（如果需要）

**无需修改保护机制代码！** 🎉

---

**准备好开始实施了吗？这个机制已经保证了用户配置的安全。**
