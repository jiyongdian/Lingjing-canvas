# 极鑫默认模型配置调整计划

## 📋 配置需求总结

### 1. 文本模型
- 选择每个厂商最新的前两代模型
- 优先选择正式版本（无后缀/前缀）
- 排除带 `-preview`, `-exp`, `-beta` 等测试版本

### 2. 图片模型
- **全部导入**扫描到的所有图片模型

### 3. 视频模型
- **Veo 系列**：所有 veo3.1 相关模型
- **Grok 系列**：所有 grok-video 相关模型
- **通义万象（Wan）**：只导入 wan 系列视频模型（wan2.6, wan2.7）
- **即梦（Seedance）**：只选官方模型名字

### 4. 音频/音乐模型
- **全部导入**扫描到的所有音频和音乐模型

### 5. 视频参数配置
需要为视频节点添加默认参数：
- 可选时长（秒数、换行分隔）：6, 8, 10
- 可选分辨率（换行分隔）：720x1280, 1280x720, 1080x1920, 1920x1080
- 可选比例（换行分隔）：9:16, 21:9, 1:1, 4:3, 3:4, 21:9

---

## 📊 筛选后的模型列表

### 文本模型（每厂商最新2代）

#### OpenAI GPT 系列
- `gpt-5.5` ⭐ 最新
- `gpt-5.4`

#### DeepSeek 系列
- `deepseek-v4-pro` ⭐ 最新
- `deepseek-v4-flash`

#### Claude 系列
- `claude-opus-4-8` ⭐ 最新
- `claude-opus-4-7`
- `claude-sonnet-4-6` ⭐ 最新
- `claude-sonnet-4-5`

#### Qwen 系列
- `Qwen3-235B-A22B-Instruct-2507` ⭐ 最新
- `Qwen3-30B-A3B-Instruct-2507`

#### Gemini 系列
- `gemini-3-pro` ⭐ 最新
- `gemini-2.5-pro`

#### Kimi 系列
- `Kimi-K2-Instruct` ⭐ 最新
- `kimi-k2.6`

#### Grok 系列
- `grok-4.2` ⭐ 最新
- `grok-4.1`

#### MiniMax 系列
- `MiniMax-M3` ⭐ 最新
- `MiniMax-M2.7`

#### GLM 系列
- `glm-5.1` ⭐ 最新
- `glm-5`

**总计文本模型：17 个**

---

### 图片模型（全部导入）

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

**总计图片模型：21 个**

---

### 视频模型（按类型筛选）

#### Veo 系列（全部）
```javascript
// Veo3.1 标准系列
`veo3.1`,
`veo3.1-pro`,
`veo3.1-fast`,

// Veo3.1 横屏系列
`veo3.1-landscape`,
`veo3.1-landscape-4k`,
`veo3.1-landscape-hd`,

// Veo3.1 竖屏系列
`veo3.1-portrait`,
`veo3.1-portrait-4k`,
`veo3.1-portrait-hd`,
```

#### Grok Video 系列（全部）
```javascript
`grok-video-3`,
`grok-video-3-pro`,
`grok-video-3-max`,
`grok-video-4.2`,
```

#### 通义万象 Wan 系列（wan 视频模型）
```javascript
// Wan2.6 系列
`wan2.6-t2v-1080P`,
`wan2.6-t2v-720P`,
`wan2.6-i2v-1080P`,
`wan2.6-i2v-720P`,
`wan2.6-r2v-1080P`,
`wan2.6-r2v-720P`,

// Wan2.7 系列
`wan2.7-t2v-1080P`,
`wan2.7-t2v-720P`,
`wan2.7-i2v-1080P`,
`wan2.7-i2v-720P`,
`wan2.7-r2v-1080P`,
`wan2.7-r2v-720P`,
`wan2.7-videoedit-1080P`,
`wan2.7-videoedit-720P`,
```

#### 即梦 Seedance 系列（官方模型）
```javascript
`doubao-seedance-2-0-260128`,
`doubao-seedance-2-0-fast-260128`,
`seedance-2.0`,
```

**总计视频模型：30 个**

---

### 音频模型（全部导入）

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

**总计音频模型：13 个**

---

### 音乐模型（全部导入）

```javascript
const WANJUAN_JIXIN_BUILTIN_MUSIC_MODELS = [
  `suno_music`,
  `suno_music_open`,
  `suno_lyrics`,
  `suno_concat`,
];
```

**总计音乐模型：4 个**

---

## 🎬 视频节点参数配置

根据你提供的图片，需要添加以下默认参数：

### 通用视频参数
```javascript
// 可选时长（秒数，换行分隔）
const WANJUAN_VIDEO_DURATIONS = `6
8
10`;

// 可选分辨率（换行分隔）
const WANJUAN_VIDEO_RESOLUTIONS = `720x1280
1280x720
1080x1920
1920x1080`;

// 可选比例（换行分隔）
const WANJUAN_VIDEO_RATIOS = `9:16
16:9
21:9
1:1
4:3
3:4`;
```

### Wan 系列模型映射
```javascript
// 根据模型名称自动填入对应模式
const WANJUAN_WAN_VIDEO_MODE_MAP = {
  // t2v = 文生视频
  'wan2.6-t2v-1080P': 't2v',
  'wan2.6-t2v-720P': 't2v',
  'wan2.7-t2v-1080P': 't2v',
  'wan2.7-t2v-720P': 't2v',
  
  // i2v = 图生视频
  'wan2.6-i2v-1080P': 'i2v',
  'wan2.6-i2v-720P': 'i2v',
  'wan2.7-i2v-1080P': 'i2v',
  'wan2.7-i2v-720P': 'i2v',
  
  // r2v = 参考图视频
  'wan2.6-r2v-1080P': 'r2v',
  'wan2.6-r2v-720P': 'r2v',
  'wan2.7-r2v-1080P': 'r2v',
  'wan2.7-r2v-720P': 'r2v',
  
  // videoedit = 视频编辑
  'wan2.7-videoedit-1080P': 'videoedit',
  'wan2.7-videoedit-720P': 'videoedit',
};
```

---

## 🔧 需要修改的代码位置

### 1. 模型定义（src/renderer/bundle/index.js）

#### 文本模型（约第 16320 行）
```javascript
const WANJUAN_JIXIN_BUILTIN_TEXT_MODELS = [
  // 17 个筛选后的模型
];
```

#### 图片模型（约第 16330 行）
```javascript
const WANJUAN_JIXIN_BUILTIN_IMAGE_MODELS = [
  // 21 个图片模型
];
```

#### 视频模型（约第 16340 行）
```javascript
const WANJUAN_JIXIN_BUILTIN_VIDEO_MODELS = [
  // 30 个视频模型
];
```

#### 音频模型（约第 16345 行）
```javascript
const WANJUAN_JIXIN_BUILTIN_AUDIO_MODELS = [
  // 13 个音频模型
];
```

#### 音乐模型（约第 16350 行）
```javascript
const WANJUAN_JIXIN_BUILTIN_MUSIC_MODELS = [
  // 4 个音乐模型
];
```

### 2. 视频参数配置

需要在视频节点初始化时添加默认参数配置。

---

## ✅ 实施步骤

1. **第一步**：更新所有模型列表常量
2. **第二步**：添加视频参数配置常量
3. **第三步**：更新 Wan 系列模型的模式映射逻辑
4. **第四步**：重新构建应用
5. **第五步**：测试验证

---

## 💾 备份计划

在修改前：
1. 备份当前的 `src/renderer/bundle/index.js`
2. 提交到 Git
3. 创建备份分支

---

**准备好开始修改了吗？**
