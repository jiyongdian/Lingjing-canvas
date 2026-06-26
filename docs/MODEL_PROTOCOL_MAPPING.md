# 极鑫默认模型配置 - 协议映射方案

## 🔑 关键原理

1. **模型列表**：定义哪些模型可用
2. **API 绑定**：每个模型绑定到哪个 API 配置（默认都绑到 `jixin-default`）
3. **协议映射**：每个模型使用哪种协议（OpenAI、Gemini、Claude 等）
4. **协议配置**：每种协议的具体请求格式和字段映射

---

## 📝 完整的协议映射配置

### 文本模型协议（WANJUAN_JIXIN_BUILTIN_TEXT_PROTOCOLS）

```javascript
const WANJUAN_JIXIN_BUILTIN_TEXT_PROTOCOLS = {
  // Gemini 系列 - 使用 Gemini 原生协议
  [`gemini-3-pro`]: `Gemini 文本原生`,
  [`gemini-2.5-pro`]: `Gemini 文本原生`,
  
  // 其他模型默认使用 OpenAI 兼容协议
  // GPT、DeepSeek、Claude、Qwen、Kimi、Grok、MiniMax、GLM 都支持 OpenAI 格式
};
```

**说明**：
- Gemini 模型必须用 `Gemini 文本原生` 协议
- 其他所有模型（GPT、DeepSeek、Claude 等）都使用 OpenAI Chat Completions 接口
- 接口文档说明：Claude、Gemini 等模型在极鑫中转站已经适配了 OpenAI 格式

---

### 图片模型协议（WANJUAN_JIXIN_BUILTIN_IMAGE_PROTOCOLS）

```javascript
const WANJUAN_JIXIN_BUILTIN_IMAGE_PROTOCOLS = {
  // GPT Image 系列 - 极鑫图片兼容
  [`gpt-image-2-pro`]: `极鑫图片兼容`,
  [`gpt-image-2`]: `极鑫图片兼容`,
  [`gpt-image-1.5`]: `极鑫图片兼容`,
  [`gpt-image-1`]: `极鑫图片兼容`,
  
  // Z-Image - 极鑫图片兼容
  [`Z-Image-Turbo`]: `极鑫图片兼容`,
  
  // Gemini Image 系列 - 极鑫 Gemini 图片兼容
  [`gemini-3-pro-image-preview`]: `极鑫 Gemini 图片兼容`,
  [`gemini-3.1-flash-image-preview`]: `极鑫 Gemini 图片兼容`,
  [`gemini-2.5-flash-image-preview`]: `极鑫 Gemini 图片兼容`,
  
  // Grok Image 系列 - 极鑫图片兼容
  [`grok-4.2-image`]: `极鑫图片兼容`,
  [`grok-4.1-image`]: `极鑫图片兼容`,
  [`grok-imagine-image-pro`]: `极鑫图片兼容`,
  [`grok-imagine-image`]: `极鑫图片兼容`,
  
  // Qwen Image 系列 - 极鑫图片兼容
  [`qwen-image-2.0-pro`]: `极鑫图片兼容`,
  [`qwen-image-2.0`]: `极鑫图片兼容`,
  [`qwen-image-max`]: `极鑫图片兼容`,
  [`qwen-image-plus-2026-01-09`]: `极鑫图片兼容`,
  
  // 通义万象 Image - 极鑫图片兼容
  [`wan2.7-image-pro`]: `极鑫图片兼容`,
  [`wan2.7-image`]: `极鑫图片兼容`,
  [`wan2.6-image`]: `极鑫图片兼容`,
  
  // Kling Image - 极鑫图片兼容
  [`kling-image`]: `极鑫图片兼容`,
};
```

**说明**：
- 大部分图片模型使用 `极鑫图片兼容` 协议（OpenAI Images 格式）
- Gemini 图片模型使用 `极鑫 Gemini 图片兼容` 协议

---

### 视频模型协议（自动映射）

#### 视频大模型（Veo + Grok）

```javascript
// 在 videoModelProtocolBindings 中自动映射为 `极鑫视频兼容`
const WANJUAN_JIXIN_BUILTIN_VIDEO_MODELS = [
  // 所有模型自动使用 `极鑫视频兼容` 协议
  `veo3.1`,
  `veo3.1-pro`,
  `veo3.1-fast`,
  // ... 其他 Veo 和 Grok 模型
];
```

#### 通义万相模型（需要新协议）

```javascript
// 新增：通义万相协议
const WANJUAN_JIXIN_BUILTIN_WANXIANG_PROTOCOLS = {
  // 所有 Wan 模型使用通义万相协议
  [`wan2.6-t2v-1080P`]: `极鑫通义万相兼容`,
  [`wan2.6-t2v-720P`]: `极鑫通义万相兼容`,
  // ... 其他 Wan 模型
};

// 在 WANJUAN_JIXIN_BUILTIN_PROTOCOLS 中添加：
[`极鑫通义万相兼容`]: {
  category: `wanxiang-video`,  // 特殊分类
  requestType: `wanxiang-video`,
  submitPath: `/v1/wanxiang/videos`,
  pollPath: `/v1/wanxiang/videos/{taskId}`,
  fieldMapping: {
    model: `model`,
    prompt: `prompt`,
    mode: `mode`,  // t2v, i2v, r2v, videoedit
    resolution: `resolution`,
    aspectRatio: `aspect_ratio`,
    duration: `duration`,
    referenceImage: `reference_image`,
    referenceVideo: `reference_video`,
  },
  responseMapping: {
    video: [`data.video_url`, `video_url`, `url`],
    taskId: [`id`, `task_id`],
    status: [`status`],
  },
};
```

#### 即梦模型（Seedance）

```javascript
// 即梦模型使用天玑 API，不在这里配置
// 它们通过专门的天玑设置处理
```

---

### 音频模型协议（新增）

```javascript
// 新增常量
const WANJUAN_JIXIN_BUILTIN_AUDIO_PROTOCOLS = {
  // Qwen TTS - OpenAI TTS 兼容
  [`qwen3-tts-flash`]: `极鑫 TTS 兼容`,
  [`qwen3-tts-instruct-flash`]: `极鑫 TTS 兼容`,
  [`qwen-tts-flash`]: `极鑫 TTS 兼容`,
  
  // GPT Audio/TTS
  [`gpt-4o-audio-preview`]: `极鑫 TTS 兼容`,
  [`gpt-4o-mini-audio-preview`]: `极鑫 TTS 兼容`,
  [`tts-1-hd`]: `极鑫 TTS 兼容`,
  [`tts-1`]: `极鑫 TTS 兼容`,
  
  // 其他 TTS
  [`kling-audio`]: `极鑫 TTS 兼容`,
  [`vidu-tts`]: `极鑫 TTS 兼容`,
  
  // Whisper ASR
  [`whisper`]: `极鑫 ASR 兼容`,
  [`whisper-1`]: `极鑫 ASR 兼容`,
  [`qwen3-asr-flash-realtime`]: `极鑫 ASR 兼容`,
};

// 在 WANJUAN_JIXIN_BUILTIN_PROTOCOLS 中添加：
[`极鑫 TTS 兼容`]: {
  category: `audio`,
  requestType: `openai-tts`,
  submitPath: `/v1/audio/speech`,
  fieldMapping: {
    model: `model`,
    input: `input`,
    voice: `voice`,
  },
  responseMapping: {
    audio: [`audio_url`, `url`],
  },
},
[`极鑫 ASR 兼容`]: {
  category: `audio`,
  requestType: `openai-asr`,
  submitPath: `/v1/audio/transcriptions`,
  fieldMapping: {
    model: `model`,
    file: `file`,
  },
  responseMapping: {
    text: [`text`, `transcription`],
  },
},
```

---

### 音乐模型协议（已有）

```javascript
// 音乐模型使用现有的 `极鑫 Suno 音乐生成` 协议
const WANJUAN_JIXIN_BUILTIN_MUSIC_PROTOCOLS = {
  [`suno_music`]: `极鑫 Suno 音乐生成`,
  [`suno_music_open`]: `极鑫 Suno 音乐生成`,
  [`suno_lyrics`]: `极鑫 Suno 音乐生成`,
  [`suno_concat`]: `极鑫 Suno 音乐生成`,
};
```

---

## 🔧 需要修改的代码位置

### 1. 模型常量定义（~16319-16343 行）

```javascript
// 文本模型（17个）
const WANJUAN_JIXIN_BUILTIN_TEXT_MODELS = [ ... ];

// 图片模型（21个）
const WANJUAN_JIXIN_BUILTIN_IMAGE_MODELS = [ ... ];

// 视频大模型（13个 - 仅 Veo + Grok）
const WANJUAN_JIXIN_BUILTIN_VIDEO_MODELS = [ ... ];

// 🆕 通义万相模型（16个）
const WANJUAN_JIXIN_BUILTIN_WANXIANG_MODELS = [ ... ];

// 🆕 即梦模型（2个）
const WANJUAN_JIXIN_BUILTIN_SEEDANCE_MODELS = [ ... ];

// 🆕 音频模型（13个）
const WANJUAN_JIXIN_BUILTIN_AUDIO_MODELS = [ ... ];

// 音乐模型（4个）
const WANJUAN_JIXIN_BUILTIN_MUSIC_MODELS = [ ... ];
```

### 2. 协议映射定义（~16345-16355 行）

```javascript
// 更新文本协议
const WANJUAN_JIXIN_BUILTIN_TEXT_PROTOCOLS = { ... };

// 更新图片协议（添加新模型）
const WANJUAN_JIXIN_BUILTIN_IMAGE_PROTOCOLS = { ... };

// 🆕 通义万相协议
const WANJUAN_JIXIN_BUILTIN_WANXIANG_PROTOCOLS = { ... };

// 🆕 音频协议
const WANJUAN_JIXIN_BUILTIN_AUDIO_PROTOCOLS = { ... };

// 🆕 音乐协议
const WANJUAN_JIXIN_BUILTIN_MUSIC_PROTOCOLS = { ... };
```

### 3. 协议配置（~16356 行）

在 `WANJUAN_JIXIN_BUILTIN_PROTOCOLS` 中添加：
- `极鑫通义万相兼容`
- `极鑫 TTS 兼容`
- `极鑫 ASR 兼容`

### 4. 初始化逻辑（~16501-16570 行）

在 `wanjuanBuildJixinBuiltinBasePatch` 函数中添加：
- wanxiangBindings
- seedanceBindings
- audioBindings 的协议映射

---

## ✅ 测试验证清单

### 文本模型测试
- [ ] GPT-5.5 调用成功
- [ ] DeepSeek-v4-pro 调用成功
- [ ] Claude-opus-4-8 调用成功
- [ ] Gemini-3-pro 调用成功（使用 Gemini 原生协议）
- [ ] Qwen、Kimi、Grok、MiniMax 调用成功

### 图片模型测试
- [ ] gpt-image-2 调用成功
- [ ] gemini 图片模型调用成功
- [ ] grok-image 调用成功
- [ ] qwen-image 调用成功
- [ ] wan-image 调用成功

### 视频模型测试
- [ ] veo3.1 调用成功
- [ ] grok-video-3 调用成功
- [ ] wan2.7-t2v 调用成功（正确识别为 t2v 模式）
- [ ] wan2.7-i2v 调用成功（正确识别为 i2v 模式）
- [ ] doubao-seedance 调用成功

### 音频/音乐模型测试
- [ ] qwen3-tts-flash 调用成功
- [ ] whisper 调用成功
- [ ] suno_music 调用成功

---

## 🚨 重要注意事项

1. **Gemini 模型**：必须使用专门的 Gemini 协议，不能用 OpenAI 格式
2. **通义万相**：需要根据模型名称自动识别生成模式（t2v/i2v/r2v/videoedit）
3. **即梦模型**：使用天玑 API 配置，不在极鑫配置中
4. **音频模型**：区分 TTS（文本转语音）和 ASR（语音转文本）
5. **API 令牌**：默认配置中令牌为空，需要用户填写

---

**准备好开始实施了吗？**
