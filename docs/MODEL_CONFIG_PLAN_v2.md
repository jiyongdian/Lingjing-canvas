# 极鑫默认模型配置调整计划（修订版）

## 📋 视频模型的三个板块

根据应用界面，视频模型分为三个独立的节点类型：

### 1️⃣ 视频大模型节点
- **只放置**: Google Veo 系列 + Grok Video 系列
- **不包括**: 通义万象、即梦等其他模型

### 2️⃣ 通义万相节点
- **只放置**: Wan 系列模型
- **需要配置**: 根据模型名称对应不同生成模式
  - 文生视频模型（t2v）
  - 参考图生视频模型（r2v）
  - 图生视频模型（i2v）
  - 视频编辑模型（videoedit）

### 3️⃣ 即梦节点
- **只放置**: Seedance 系列模型
- **模型列表**:
  - `doubao-seedance-2-0-260128`
  - `doubao-seedance-2-0-fast-260128`

---

## 🎬 重新分类的视频模型

### 视频大模型（WANJUAN_JIXIN_BUILTIN_VIDEO_MODELS）

**仅包含 Veo 和 Grok 系列**

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

**总计：13 个模型**

---

### 通义万相模型（需要新增常量）

**新增常量**: `WANJUAN_JIXIN_BUILTIN_WANXIANG_MODELS`

```javascript
const WANJUAN_JIXIN_BUILTIN_WANXIANG_MODELS = [
  // Wan2.6 文生视频（t2v）
  `wan2.6-t2v-1080P`,
  `wan2.6-t2v-720P`,
  
  // Wan2.6 图生视频（i2v）
  `wan2.6-i2v-1080P`,
  `wan2.6-i2v-720P`,
  
  // Wan2.6 参考图视频（r2v）
  `wan2.6-r2v-1080P`,
  `wan2.6-r2v-720P`,
  
  // Wan2.7 文生视频（t2v）
  `wan2.7-t2v-1080P`,
  `wan2.7-t2v-720P`,
  
  // Wan2.7 图生视频（i2v）
  `wan2.7-i2v-1080P`,
  `wan2.7-i2v-720P`,
  
  // Wan2.7 参考图视频（r2v）
  `wan2.7-r2v-1080P`,
  `wan2.7-r2v-720P`,
  
  // Wan2.7 视频编辑（videoedit）
  `wan2.7-videoedit-1080P`,
  `wan2.7-videoedit-720P`,
];
```

**总计：16 个模型**

#### Wan 模型模式映射

```javascript
const WANJUAN_WANXIANG_MODEL_MODE_MAP = {
  // t2v = 文生视频模型
  'wan2.6-t2v-1080P': 't2v',
  'wan2.6-t2v-720P': 't2v',
  'wan2.7-t2v-1080P': 't2v',
  'wan2.7-t2v-720P': 't2v',
  
  // i2v = 图生视频模型
  'wan2.6-i2v-1080P': 'i2v',
  'wan2.6-i2v-720P': 'i2v',
  'wan2.7-i2v-1080P': 'i2v',
  'wan2.7-i2v-720P': 'i2v',
  
  // r2v = 参考图生视频模型
  'wan2.6-r2v-1080P': 'r2v',
  'wan2.6-r2v-720P': 'r2v',
  'wan2.7-r2v-1080P': 'r2v',
  'wan2.7-r2v-720P': 'r2v',
  
  // videoedit = 视频编辑模型
  'wan2.7-videoedit-1080P': 'videoedit',
  'wan2.7-videoedit-720P': 'videoedit',
};
```

---

### 即梦模型（WANJUAN_JIXIN_BUILTIN_SEEDANCE_MODELS）

**新增常量**: `WANJUAN_JIXIN_BUILTIN_SEEDANCE_MODELS`

```javascript
const WANJUAN_JIXIN_BUILTIN_SEEDANCE_MODELS = [
  `doubao-seedance-2-0-260128`,
  `doubao-seedance-2-0-fast-260128`,
];
```

**总计：2 个模型**

---

## 📝 完整的模型配置列表

### 文本模型（17个）

```javascript
const WANJUAN_JIXIN_BUILTIN_TEXT_MODELS = [
  // OpenAI GPT 系列
  `gpt-5.5`,
  `gpt-5.4`,
  
  // DeepSeek 系列
  `deepseek-v4-pro`,
  `deepseek-v4-flash`,
  
  // Claude 系列
  `claude-opus-4-8`,
  `claude-opus-4-7`,
  `claude-sonnet-4-6`,
  `claude-sonnet-4-5`,
  
  // Qwen 系列
  `Qwen3-235B-A22B-Instruct-2507`,
  `Qwen3-30B-A3B-Instruct-2507`,
  
  // Gemini 系列
  `gemini-3-pro`,
  `gemini-2.5-pro`,
  
  // Kimi 系列
  `Kimi-K2-Instruct`,
  `kimi-k2.6`,
  
  // Grok 系列
  `grok-4.2`,
  `grok-4.1`,
  
  // MiniMax 系列
  `MiniMax-M3`,
];
```

---

### 图片模型（21个）

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

---

### 音频模型（13个）

```javascript
const WANJUAN_JIXIN_BUILTIN_AUDIO_MODELS = [
  // Qwen TTS 系列
  `qwen3-tts-flash`,
  `qwen3-tts-instruct-flash`,
  `qwen-tts-flash`,
  
  // GPT Audio/TTS 系列
  `gpt-4o-audio-preview`,
  `gpt-4o-mini-audio-preview`,
  `tts-1-hd`,
  `tts-1`,
  
  // 其他 TTS
  `kling-audio`,
  `vidu-tts`,
  
  // Whisper ASR 系列
  `whisper`,
  `whisper-1`,
  `qwen3-asr-flash-realtime`,
];
```

---

### 音乐模型（4个）

```javascript
const WANJUAN_JIXIN_BUILTIN_MUSIC_MODELS = [
  `suno_music`,
  `suno_music_open`,
  `suno_lyrics`,
  `suno_concat`,
];
```

---

## 🔧 代码修改位置

### 需要修改的常量（src/renderer/bundle/index.js）

1. **WANJUAN_JIXIN_BUILTIN_TEXT_MODELS** - 更新文本模型列表
2. **WANJUAN_JIXIN_BUILTIN_IMAGE_MODELS** - 更新图片模型列表
3. **WANJUAN_JIXIN_BUILTIN_VIDEO_MODELS** - 更新为仅 Veo + Grok
4. **新增 WANJUAN_JIXIN_BUILTIN_WANXIANG_MODELS** - 通义万相模型
5. **新增 WANJUAN_JIXIN_BUILTIN_SEEDANCE_MODELS** - 即梦模型
6. **新增 WANJUAN_JIXIN_BUILTIN_AUDIO_MODELS** - 音频模型
7. **WANJUAN_JIXIN_BUILTIN_MUSIC_MODELS** - 更新音乐模型列表

### 需要添加的模式映射

```javascript
// Wan 模型模式映射
const WANJUAN_WANXIANG_MODEL_MODE_MAP = { ... };
```

---

## 📊 模型数量总结

| 板块 | 模型数量 |
|------|---------|
| 文本模型 | 17 |
| 图片模型 | 21 |
| 视频大模型 | 13 (Veo + Grok) |
| 通义万相 | 16 (Wan 系列) |
| 即梦 | 2 (Seedance) |
| 音频模型 | 13 |
| 音乐模型 | 4 |
| **总计** | **86** |

---

## ✅ 实施步骤

1. ✅ 备份当前代码
2. 修改所有模型常量
3. 添加 Wan 模型模式映射
4. 更新模型绑定逻辑
5. 重新构建并测试
6. 同步到正式版 app

---

**这个修订后的计划正确吗？**
