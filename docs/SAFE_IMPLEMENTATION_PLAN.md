# 极鑫默认模型配置 - 最终实施方案

## 🎯 理解现有架构

### 三种视频节点类型

1. **视频大模型节点** - 使用 `videoModel` 和 `videoModelApiBindings`
   - 调用：通过 API 配置的视频接口
   - 协议：`极鑫视频兼容`
   
2. **通义万相节点** (`tongyiWanxiangNode: true`)
   - 有独立的节点标识
   - 模式选择：`tongyiWanxiangMode` (text-to-video, image-to-video, reference-to-video, video-edit)
   - 模型列表：`currentTongyiWanxiangModels`（在节点中解析）
   
3. **即梦节点** (`seedanceNode: true`)
   - 有独立的节点标识
   - 两种模式：
     - `official` - 官方模式（使用 doubao-seedance 模型）
     - `tianji` - 天玑模式（使用天玑配置，有独立的人像库系统）
   - 生成模式（天玑）：`tianjiSeedanceGenerationMode` (text-to-video, first-frame, first-last)
   - **关键**：天玑配置是独立的，使用 `wanjuanTianjiSeedanceDefaults`

---

## ✅ 安全的修改方案

### 只修改这些地方，不改逻辑：

1. **文本模型列表** - 扩展到 17 个
2. **图片模型列表** - 扩展到 21 个
3. **视频大模型列表** - 只放 Veo + Grok（13 个）
4. **音频模型列表** - 新增 13 个
5. **音乐模型列表** - 扩展到 4 个
6. **协议映射** - 为新增的模型添加协议映射

### 不修改的地方：

❌ **不修改**通义万相节点逻辑（它有独立的模型列表解析）
❌ **不修改**即梦节点逻辑（它有两套生成方式，天玑配置独立）
❌ **不修改**节点类型判断和初始化逻辑
❌ **不修改**视频参数配置（durations, resolutions, ratios 已经存在）

---

## 📝 具体修改内容

### 1. 文本模型（第 16319 行）

```javascript
const WANJUAN_JIXIN_BUILTIN_TEXT_MODELS = [
  // OpenAI GPT 系列（2个）
  `gpt-5.5`,
  `gpt-5.4`,
  
  // DeepSeek 系列（2个）
  `deepseek-v4-pro`,
  `deepseek-v4-flash`,
  
  // Claude 系列（4个）
  `claude-opus-4-8`,
  `claude-opus-4-7`,
  `claude-sonnet-4-6`,
  `claude-sonnet-4-5`,
  
  // Qwen 系列（2个）
  `Qwen3-235B-A22B-Instruct-2507`,
  `Qwen3-30B-A3B-Instruct-2507`,
  
  // Gemini 系列（2个）
  `gemini-3-pro`,
  `gemini-2.5-pro`,
  
  // Kimi 系列（2个）
  `Kimi-K2-Instruct`,
  `kimi-k2.6`,
  
  // Grok 系列（2个）
  `grok-4.2`,
  `grok-4.1`,
  
  // MiniMax 系列（1个）
  `MiniMax-M3`,
];
```

### 2. 图片模型（第 16329 行）

```javascript
const WANJUAN_JIXIN_BUILTIN_IMAGE_MODELS = [
  // GPT Image 系列
  `gpt-image-2-pro`,
  `gpt-image-2`,
  `gpt-image-1.5`,
  `gpt-image-1`,
  
  // Gemini Image 系列
  `gemini-3-pro-image-preview`,
  `gemini-3.1-flash-image-preview`,
  `gemini-2.5-flash-image-preview`,
  
  // Grok Image 系列
  `grok-4.2-image`,
  `grok-4.1-image`,
  `grok-imagine-image-pro`,
  `grok-imagine-image`,
  
  // Qwen Image 系列
  `qwen-image-2.0-pro`,
  `qwen-image-2.0`,
  `qwen-image-max`,
  `qwen-image-plus-2026-01-09`,
  
  // 通义万象 Image
  `wan2.7-image-pro`,
  `wan2.7-image`,
  `wan2.6-image`,
  
  // 其他
  `Z-Image-Turbo`,
  `kling-image`,
];
```

### 3. 视频大模型（第 16336 行）- 只放 Veo + Grok

```javascript
const WANJUAN_JIXIN_BUILTIN_VIDEO_MODELS = [
  // Google Veo3.1 系列
  `veo3.1`,
  `veo3.1-pro`,
  `veo3.1-fast`,
  `veo3.1-landscape`,
  `veo3.1-landscape-4k`,
  `veo3.1-landscape-hd`,
  `veo3.1-portrait`,
  `veo3.1-portrait-4k`,
  `veo3.1-portrait-hd`,
  
  // Grok Video 系列
  `grok-video-3`,
  `grok-video-3-pro`,
  `grok-video-3-max`,
  `grok-video-4.2`,
];
```

### 4. 音乐模型（第 16342 行）

```javascript
const WANJUAN_JIXIN_BUILTIN_MUSIC_MODELS = [
  `suno_music`,
  `suno_music_open`,
  `suno_lyrics`,
  `suno_concat`,
];
```

### 5. 文本模型协议（第 16345 行）

```javascript
const WANJUAN_JIXIN_BUILTIN_TEXT_PROTOCOLS = {
  // Gemini 系列必须用 Gemini 原生协议
  [`gemini-3-pro`]: `Gemini 文本原生`,
  [`gemini-2.5-pro`]: `Gemini 文本原生`,
  
  // 其他模型使用 OpenAI Chat 格式（默认）
};
```

### 6. 图片模型协议（第 16349 行）

```javascript
const WANJUAN_JIXIN_BUILTIN_IMAGE_PROTOCOLS = {
  // GPT Image 系列
  [`gpt-image-2-pro`]: `极鑫图片兼容`,
  [`gpt-image-2`]: `极鑫图片兼容`,
  [`gpt-image-1.5`]: `极鑫图片兼容`,
  [`gpt-image-1`]: `极鑫图片兼容`,
  
  // Z-Image
  [`Z-Image-Turbo`]: `极鑫图片兼容`,
  
  // Gemini Image 系列
  [`gemini-3-pro-image-preview`]: `极鑫 Gemini 图片兼容`,
  [`gemini-3.1-flash-image-preview`]: `极鑫 Gemini 图片兼容`,
  [`gemini-2.5-flash-image-preview`]: `极鑫 Gemini 图片兼容`,
  
  // Grok Image 系列
  [`grok-4.2-image`]: `极鑫图片兼容`,
  [`grok-4.1-image`]: `极鑫图片兼容`,
  [`grok-imagine-image-pro`]: `极鑫图片兼容`,
  [`grok-imagine-image`]: `极鑫图片兼容`,
  
  // Qwen Image 系列
  [`qwen-image-2.0-pro`]: `极鑫图片兼容`,
  [`qwen-image-2.0`]: `极鑫图片兼容`,
  [`qwen-image-max`]: `极鑫图片兼容`,
  [`qwen-image-plus-2026-01-09`]: `极鑫图片兼容`,
  
  // 通义万象 Image
  [`wan2.7-image-pro`]: `极鑫图片兼容`,
  [`wan2.7-image`]: `极鑫图片兼容`,
  [`wan2.6-image`]: `极鑫图片兼容`,
  
  // Kling Image
  [`kling-image`]: `极鑫图片兼容`,
};
```

---

## 🚫 不需要修改的部分

### 通义万相
- ✅ 已经有独立的节点类型 (`tongyiWanxiangNode: true`)
- ✅ 已经有模式选择 (`tongyiWanxiangMode`)
- ✅ 模型列表在节点中动态解析 (`currentTongyiWanxiangModels`)
- ✅ 用户在节点界面选择模型和模式

### 即梦（Seedance）
- ✅ 已经有独立的节点类型 (`seedanceNode: true`)
- ✅ 已经有两种模式切换（官方/天玑）
- ✅ 天玑配置是独立的系统 (`wanjuanTianjiSeedanceDefaults`)
- ✅ 模型列表：
  - 官方模式：`doubao-seedance-2-0-260128`, `doubao-seedance-2-0-fast-260128`
  - 天玑模式：使用天玑 API，模型在天玑配置中

### 视频参数
- ✅ 已经有默认配置：
  - durations: `5\n10`
  - resolutions: `720p\n1080p`
  - ratios: `16:9\n9:16\n1:1\n4:3\n3:4\n21:9`

---

## ✅ 修改前检查清单

1. [ ] 备份当前 `src/renderer/bundle/index.js`
2. [ ] 提交当前代码到 Git
3. [ ] 只修改模型列表常量（5个）
4. [ ] 只修改协议映射（2个）
5. [ ] 不修改任何节点逻辑
6. [ ] 不修改通义万相相关代码
7. [ ] 不修改即梦/天玑相关代码
8. [ ] 重新构建后测试每种节点

---

## 🧪 测试清单

### 文本模型
- [ ] GPT-5.5 能正常调用
- [ ] DeepSeek-v4 能正常调用
- [ ] Claude-opus-4-8 能正常调用
- [ ] Gemini-3-pro 能正常调用（Gemini 协议）

### 图片模型
- [ ] gpt-image-2 能正常生成
- [ ] gemini 图片能正常生成
- [ ] grok-image 能正常生成
- [ ] qwen-image 能正常生成
- [ ] wan-image 能正常生成

### 视频大模型节点
- [ ] veo3.1 能正常生成
- [ ] grok-video-3 能正常生成
- [ ] 节点可以正常选择模型

### 通义万相节点
- [ ] 节点可以正常打开
- [ ] 可以选择模式（t2v、i2v、r2v、videoedit）
- [ ] 可以选择模型（wan2.6、wan2.7）
- [ ] 可以正常生成视频

### 即梦节点
- [ ] 节点可以正常打开
- [ ] 官方模式可以选择模型（doubao-seedance）
- [ ] 天玑模式可以切换
- [ ] 天玑模式可以选择生成模式
- [ ] 可以正常生成视频

### 音乐模型
- [ ] suno_music 能正常生成

---

**这个方案是最小化、最安全的修改。准备好开始吗？**
