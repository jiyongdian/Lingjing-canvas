/**
 * 即梦天玑（Seedance）视频生成 API 客户端模块。
 *
 * 职责：
 * - 维护即梦天玑接口的默认配置，并对用户配置做归一化。
 * - 封装对天玑后端的 HTTP 请求（支持桌面端 proxyFetch 代理与普通 fetch 两条通道）。
 * - 提供在任意深度 JSON 结构中按候选 key 查找视频地址 / 缩略图 / 任务 id / 状态 / 进度 / 错误信息的工具。
 * - 编排「文生视频 / 首帧 / 首尾帧 / 参考素材」四种生成模式的提交与轮询全过程，
 *   并把进度、结果、错误回写到画布节点、全局任务列表与持久化状态。
 *
 * 纯逻辑模块，不含 React / JSX 依赖。行为与原始 bundle 完全一致，仅做可读化重命名。
 */

// normalizeVideoAspectRatioValue 是 bundle 内的通用视频比例归一化工具（原 bundle line 3522），
// 非本组函数，从兄弟模块引入。
import { normalizeVideoAspectRatioValue } from "./video-aspect-ratio";

/** chrome 扩展运行时（仅在浏览器扩展环境存在）。 */
declare const chrome: any;

declare global {
  interface Window {
    /** 万卷桌面端注入的桥接对象（proxyFetch / uploadPublicMedia 等能力）。 */
    wanjuanDesktop?: any;
  }
}

export const WANJUAN_TIANJI_DEFAULT_BASE_URL = `https://newapi.guancn.uk`;
export const WANJUAN_TIANJI_SYNC_SOURCE_JIXIN = `jixin-default`;
export const WANJUAN_TIANJI_SYNC_SOURCE_MANUAL = `manual`;

/** 即梦天玑配置结构（字段较动态，使用宽松类型）。 */
export interface TianjiSeedanceConfig {
  baseUrl: string;
  token: string;
  sassId: string;
  platform: string;
  models: string;
  durations: string;
  resolutions: string;
  ratios: string;
  generateAudio: boolean;
  watermark: boolean;
  [key: string]: any;
}

/** wanjuanTianjiRequest 的可选项。 */
interface TianjiRequestOptions {
  method?: string;
  params?: Record<string, any>;
  query?: Record<string, any>;
  signal?: AbortSignal;
}

/** wanjuanRunTianjiSeedanceVideo 的运行入参（来自调用方编辑器上下文）。 */
interface RunTianjiSeedanceVideoOptions {
  sourceNode?: { data?: Record<string, any> };
  prompt?: string;
  extraPrompts?: string[];
  selectedDuration?: string | number;
  selectedSize?: string;
  imageRefs?: any[];
  videoRefs?: any[];
  audioRefs?: any[];
  nodeId: string;
  projectIdAtStart?: string;
  dailyKey: string;
  dailyCount: number;
  pollingInterval: number;
  maxPollingDuration?: number;
  abortControllers: { current: Map<string, AbortController> };
  showToast: (message: string) => void;
  setDailyCount: (count: number) => void;
  updateNodes: (updater: (nodes: any[]) => any[]) => void;
  updateEdges: (updater: (edges: any[]) => any[]) => void;
  updateGlobalTasks?: (updater: (tasks: any[]) => any[]) => void;
  addTransitResource?: (url: string, kind: string, origin: string) => void;
  persistVideoNodeState: (style: Record<string, any>, data: Record<string, any>) => Promise<any>;
}

/** 即梦天玑默认配置（base 地址、可选模型 / 时长 / 分辨率 / 画幅比例等）。 */
export const wanjuanTianjiSeedanceDefaults: TianjiSeedanceConfig = {
  baseUrl: WANJUAN_TIANJI_DEFAULT_BASE_URL,
  token: ``,
  syncSource: WANJUAN_TIANJI_SYNC_SOURCE_JIXIN,
  sassId: `1`,
  platform: `web`,
  models: ``,
  durations: `5\n10`,
  resolutions: `720p\n1080p`,
  ratios: `16:9\n9:16\n1:1\n4:3\n3:4\n21:9`,
  generateAudio: true,
  watermark: false,
};

/** 从 chrome 扩展本地存储读取指定 key，读取失败或非扩展环境时返回空对象。 */
export const wanjuanTianjiStorageGet = (keys: string[]): Promise<Record<string, any>> =>
  new Promise((resolve) => {
    try {
      typeof chrome < `u` && chrome.storage?.local
        ? chrome.storage.local.get(keys, (result: any) => resolve(result || {}))
        : resolve({});
    } catch {
      resolve({});
    }
  });

/** 归一化用户传入的天玑配置：合并默认值并清洗 baseUrl / token / sassId 等字段。 */
export const wanjuanNormalizeTianjiSeedanceConfig = (config: any = {}): TianjiSeedanceConfig => ({
  ...wanjuanTianjiSeedanceDefaults,
  ...(config && typeof config == `object` ? config : {}),
  baseUrl:
    String(Object.prototype.hasOwnProperty.call(config || {}, `baseUrl`) ? config?.baseUrl : WANJUAN_TIANJI_DEFAULT_BASE_URL)
      .replace(/\s+/g, ``)
      .replace(/\/+$/, ``),
  token: String(config?.token || ``).trim(),
  syncSource:
    config?.syncSource === WANJUAN_TIANJI_SYNC_SOURCE_MANUAL
      ? WANJUAN_TIANJI_SYNC_SOURCE_MANUAL
      : WANJUAN_TIANJI_SYNC_SOURCE_JIXIN,
  sassId: String(config?.sassId || `1`).trim() || `1`,
  platform: String(config?.platform || `web`).trim() || `web`,
  generateAudio: config?.generateAudio !== false,
  watermark: config?.watermark === true,
});

export const wanjuanNormalizeTianjiApiBaseUrl = (value: any): string =>
  String(value || ``)
    .replace(/\s+/g, ``)
    .replace(/\/+$/, ``);

export const wanjuanBuildSyncedTianjiConfigFromJixin = (
  currentConfig: any = {},
  jixinConfig: any = null,
  { force = false }: { force?: boolean } = {},
): TianjiSeedanceConfig => {
  let jixinBaseUrl = wanjuanNormalizeTianjiApiBaseUrl(jixinConfig?.url || WANJUAN_TIANJI_DEFAULT_BASE_URL) || WANJUAN_TIANJI_DEFAULT_BASE_URL,
    rawCurrentBaseUrl = wanjuanNormalizeTianjiApiBaseUrl(currentConfig?.baseUrl || ``),
    hasExplicitSyncSource = Object.prototype.hasOwnProperty.call(currentConfig || {}, `syncSource`);
  if (!force && !hasExplicitSyncSource && rawCurrentBaseUrl && rawCurrentBaseUrl !== WANJUAN_TIANJI_DEFAULT_BASE_URL && rawCurrentBaseUrl !== jixinBaseUrl) {
    return wanjuanMarkTianjiConfigManual(currentConfig);
  }
  let current = wanjuanNormalizeTianjiSeedanceConfig(currentConfig || {});
  if (!force && current.syncSource === WANJUAN_TIANJI_SYNC_SOURCE_MANUAL) return current;
  return wanjuanNormalizeTianjiSeedanceConfig({
    ...current,
    baseUrl: jixinBaseUrl,
    token: String(jixinConfig?.key || ``).trim(),
    syncSource: WANJUAN_TIANJI_SYNC_SOURCE_JIXIN,
  });
};

export const wanjuanMarkTianjiConfigManual = (config: any = {}): TianjiSeedanceConfig =>
  wanjuanNormalizeTianjiSeedanceConfig({
    ...(config && typeof config === `object` ? config : {}),
    syncSource: WANJUAN_TIANJI_SYNC_SOURCE_MANUAL,
  });

/** 把以空白 / 逗号 / 顿号分隔的字符串拆为列表，返回首个非空项，无则返回 fallback。 */
export const wanjuanTianjiFirstListValue = (list: any, fallback = ``): string =>
  String(list || ``)
    .split(/[\s,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean)[0] || fallback;

/** 将字符串按 UTF-8 编码后做 base64，分块处理以避免超大字符串触发栈溢出。 */
export const wanjuanTianjiBase64Encode = (input: any): string => {
  let bytes = new TextEncoder().encode(String(input || ``)),
    binary = ``;
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    let chunk = bytes.slice(offset, offset + 8192);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

/** base64 解码回 UTF-8 字符串。 */
export const wanjuanTianjiBase64Decode = (input: any): string => {
  let binary = atob(String(input || ``)),
    bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

/**
 * 向即梦天玑后端发起请求。
 *
 * 非 GET 请求以 x-www-form-urlencoded 提交 params；优先走桌面端 proxyFetch 代理，
 * 否则回退到浏览器 fetch。统一解析返回 JSON 并对 HTTP / 业务错误码抛出异常。
 */
export const wanjuanTianjiRequest = async (
  rawConfig: any,
  path: string,
  { method = `POST`, params = {}, query = {}, signal }: TianjiRequestOptions = {},
): Promise<any> => {
  let config = wanjuanNormalizeTianjiSeedanceConfig(rawConfig);
  if (!config.token) throw Error(`请先在设置里的“即梦天玑”填写 Authorization Token`);
  let url = new URL(`${config.baseUrl}${path.startsWith(`/`) ? path : `/${path}`}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    value !== void 0 && value !== null && String(value) !== `` && url.searchParams.set(key, String(value));
  });
  let headers: Record<string, string> = {
      Authorization: config.token,
      "Xx-Sass-Id": config.sassId,
      "Xx-Platform": config.platform,
    },
    body = ``;
  if (method !== `GET`) {
    let form = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      value === void 0 ||
        value === null ||
        value === `` ||
        (Array.isArray(value)
          ? value.forEach(
              (item) => item !== void 0 && item !== null && item !== `` && form.append(key, String(item)),
            )
          : form.append(key, String(value)));
    });
    body = form.toString();
    headers[`Content-Type`] = `application/x-www-form-urlencoded`;
  }
  let response: { ok: boolean; status: number; statusText: string; text: () => Promise<string> };
  if (window.wanjuanDesktop?.proxyFetch) {
    let proxyResult = await window.wanjuanDesktop.proxyFetch({
      requestId: `tianji-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      url: url.toString(),
      method,
      headers,
      bodyBase64: body ? wanjuanTianjiBase64Encode(body) : ``,
      requestTimeout: 18e4,
    });
    if (!proxyResult?.ok) throw Error(proxyResult?.error || `即梦天玑请求失败`);
    response = {
      ok: proxyResult.status >= 200 && proxyResult.status < 300,
      status: proxyResult.status,
      statusText: proxyResult.statusText || ``,
      text: async () => wanjuanTianjiBase64Decode(proxyResult.bodyBase64),
    };
  } else
    response = await fetch(url.toString(), {
      method,
      headers,
      body: body || void 0,
      signal,
    });
  let text = await response.text(),
    json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok)
    throw Error(json?.message || json?.msg || `即梦天玑请求失败: ${response.status} ${response.statusText}`);
  if (json?.code && json.code !== 200) throw Error(json.message || json.msg || `即梦天玑返回错误: ${json.code}`);
  return json;
};

/**
 * 在任意深度的对象 / 数组中递归查找首个命中候选 key（大小写不敏感）的非空字符串值。
 * 使用 seen 集合防止循环引用导致的无限递归。
 */
export const wanjuanTianjiFindDeep = (root: any, keys: string[]): string => {
  let keySet = new Set(keys.map((key) => String(key).toLowerCase())),
    search = (value: any, seen: Set<any> = new Set()): string => {
      if (value === null || value === void 0 || seen.has(value)) return ``;
      if (typeof value == `string` || typeof value == `number`) return ``;
      if (Array.isArray(value)) {
        seen.add(value);
        for (let item of value) {
          let found = search(item, seen);
          if (found) return found;
        }
        return ``;
      }
      if (typeof value == `object`) {
        seen.add(value);
        for (let [key, val] of Object.entries(value)) {
          if (keySet.has(String(key).toLowerCase()) && val !== null && val !== void 0 && String(val).trim())
            return String(val).trim();
        }
        for (let val of Object.values(value)) {
          let found = search(val, seen);
          if (found) return found;
        }
      }
      return ``;
    };
  return search(root);
};

/** 从返回结构中查找视频地址，仅接受 http(s) 或 blob 协议，并剔除反引号 / 空白。 */
export const wanjuanTianjiFindVideoUrl = (data: any): string => {
  let url = wanjuanTianjiFindDeep(data, [
    `video_url`,
    `videoUrl`,
    `result_url`,
    `resultUrl`,
    `output_url`,
    `outputUrl`,
    `download_url`,
    `downloadUrl`,
    `url`,
  ]);
  return /^https?:\/\//i.test(url) || /^blob:/i.test(url) ? url.replace(/[`\s]/g, ``) : ``;
};

/** 从返回结构中查找任务 id（execute_id / task_id / id 等）。 */
export const wanjuanTianjiFindTaskId = (data: any): string =>
  wanjuanTianjiFindDeep(data, [`execute_id`, `executeId`, `task_id`, `taskId`, `id`]);

/** 从返回结构中查找缩略图 / 封面 / 末帧地址，仅接受 http(s)。 */
export const wanjuanTianjiFindThumbUrl = (data: any): string => {
  let url = wanjuanTianjiFindDeep(data, [
    `thumbnail_url`,
    `thumbnailUrl`,
    `cover_url`,
    `coverUrl`,
    `last_frame_url`,
    `lastFrameUrl`,
  ]);
  return /^https?:\/\//i.test(url) ? url.replace(/[`\s]/g, ``) : ``;
};

/** 提取任务状态字符串（按常见嵌套路径优先，再深度查找），统一转小写。 */
export const wanjuanTianjiStatus = (data: any): string =>
  String(
    data?.status ||
      data?.data?.status ||
      data?.result?.status ||
      data?.output?.status ||
      data?.task?.status ||
      wanjuanTianjiFindDeep(data, [`status`]) ||
      ``,
  ).toLowerCase();

/** 提取进度百分比：0~1 的小数会被放大到百分制，结果限制在 0~99 之间。 */
export const wanjuanTianjiFindProgress = (data: any): number => {
  let progress = Number(
    wanjuanTianjiFindDeep(data, [`progress`, `percent`, `percentage`, `rate`, `Progress`, `Percent`]),
  );
  if (isNaN(progress)) return NaN;
  if (progress > 0 && progress <= 1) progress *= 100;
  return Math.min(99, Math.max(0, Math.round(progress)));
};

const wanjuanTianjiAssetUrl = (assetId: any): string => {
  let cleanId = String(assetId || ``)
    .trim()
    .replace(/^asset:\/\//i, ``)
    .replace(/\s+/g, ``);
  return cleanId ? `asset://${cleanId}` : ``;
};

const wanjuanTianjiPortraitAssetUrl = (media: any): string => {
  if (!media || typeof media != `object`) return ``;
  let isTianjiPortrait =
      media.isTianjiPortrait === true ||
      media.source === `tianji-portrait` ||
      media.sourceOrigin === `tianji-portrait` ||
      media.mediaSourceOrigin === `tianji-portrait` ||
      media.type === `image/tianji-portrait`,
    assetId =
      media.tianjiPortraitAssetId ||
      media.portraitAssetId ||
      media.portrait_asset_id ||
      media.assetId ||
      media.asset_id ||
      media.id;
  return isTianjiPortrait ? wanjuanTianjiAssetUrl(assetId) : ``;
};

/** 把原始状态码映射为中文进度文案（排队中 / 生成中）。 */
export const wanjuanTianjiStatusLabel = (status: any): string => {
  let normalized = String(status || ``).toLowerCase();
  if ([`queued`, `queue`, `pending`, `waiting`, `created`, `submitted`].includes(normalized)) return `排队中`;
  if ([`running`, `processing`, `generating`, `in_progress`, `progress`].includes(normalized)) return `生成中`;
  return normalized ? `生成中` : `生成中`;
};

/**
 * 从失败返回结构中提取人类可读的错误信息。
 * 优先取常见嵌套字段，再深度查找；过滤掉无意义的 "[object Object]" / "异步查询成功"，
 * 最终回退到错误码或通用兜底文案。
 */
export const wanjuanTianjiErrorMessage = (data: any): string => {
  let message =
    data?.data?.message ||
    data?.data?.msg ||
    data?.data?.error_message ||
    data?.data?.errorMessage ||
    data?.data?.fail_reason ||
    data?.data?.failReason ||
    data?.data?.reason ||
    data?.data?.detail ||
    data?.result?.message ||
    data?.result?.msg ||
    data?.output?.message ||
    data?.output?.msg ||
    data?.task?.message ||
    data?.task?.msg ||
    wanjuanTianjiFindDeep(data, [
      `message`,
      `msg`,
      `error_message`,
      `errorMessage`,
      `fail_reason`,
      `failReason`,
      `reason`,
      `detail`,
      `error`,
    ]);
  if (message && !/^\[object Object\]$/i.test(String(message)) && !/^异步查询成功$/.test(String(message)))
    return String(message);
  let code = wanjuanTianjiFindDeep(data, [`code`]);
  return code && String(code) !== `200`
    ? `接口返回错误码：${code}`
    : `即梦天玑任务返回失败状态，但接口没有提供具体错误信息`;
};

/**
 * 把参考素材（图片 / 视频 / 音频）解析为公网 URL。
 * 已是 http(s) 直接返回；否则通过桌面端 uploadPublicMedia 上传后取回公网地址。
 * 本地未回传的天玑人像会直接抛错提示刷新。
 */
export const wanjuanTianjiMediaUrl = async (media: any, kind = `image`, uploadOptions: any = {}): Promise<string> => {
  if (media && typeof media == `object` && media.localUploaded === true)
    throw Error(`这张天玑人像还没有从素材库返回，请先刷新天玑素材列表后再生成`);
  let portraitAssetUrl = wanjuanTianjiPortraitAssetUrl(media);
  if (portraitAssetUrl) return portraitAssetUrl;
  let raw =
    media && typeof media == `object`
      ? String(media.url || media.localPath || media.path || media.imageUrl || media.thumbnailUrl || ``).trim()
      : String(media || ``).trim();
  if (!raw) return ``;
  if (/^asset:\/\//i.test(raw)) return wanjuanTianjiAssetUrl(raw);
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!window.wanjuanDesktop?.uploadPublicMedia && !window.wanjuanDesktop?.uploadTosMedia && !window.wanjuanDesktop?.uploadCustomPublicMedia && !window.wanjuanDesktop?.uploadQiniuMedia)
    throw Error(`天玑模式参考${kind === `video` ? `视频` : kind === `audio` ? `音频` : `图片`}必须是公网 URL`);
  let uploadMode = String(uploadOptions.uploadMode || uploadOptions.seedanceUploadMode || `public`).trim(),
    filename = `tianji-seedance-${kind}-${Date.now()}`;
  let uploadResult =
    uploadMode === `tos` && typeof window.wanjuanDesktop?.uploadTosMedia == `function`
      ? await window.wanjuanDesktop.uploadTosMedia({
          url: raw,
          kind,
          filename,
          tos: uploadOptions.tosConfig || {},
        })
      : uploadMode === `custom` && typeof window.wanjuanDesktop?.uploadCustomPublicMedia == `function`
        ? await window.wanjuanDesktop.uploadCustomPublicMedia({
            url: raw,
            kind,
            filename,
            customUpload: uploadOptions.customPublicUploadConfig || {},
          })
        : uploadMode === `qiniu` && typeof window.wanjuanDesktop?.uploadQiniuMedia == `function`
          ? await window.wanjuanDesktop.uploadQiniuMedia({
              url: raw,
              kind,
              filename,
              qiniu: uploadOptions.qiniuConfig || {},
            })
          : await window.wanjuanDesktop.uploadPublicMedia({
              url: raw,
              kind,
              filename,
            });
  if (!uploadResult?.ok || !uploadResult.url)
    throw Error(uploadResult?.error || `天玑模式参考${kind === `video` ? `视频` : kind === `audio` ? `音频` : `图片`}上传失败`);
  return uploadResult.url;
};

/**
 * 即梦天玑 Seedance 视频生成主流程。
 *
 * 步骤：读取并归一化配置 → 组装提示词 / 模型 / 分辨率 / 时长 / 画幅 → 解析参考素材 →
 * 按生成模式（文生视频 / 首帧 / 首尾帧 / 参考素材）选择接口并补充入参 → 提交任务并写入全局任务列表与节点状态 →
 * 按 pollingInterval 轮询历史接口，处理成功 / 失败 / 进行中三种状态，超时或取消时抛错。
 */
export async function wanjuanRunTianjiSeedanceVideo(options: RunTianjiSeedanceVideoOptions): Promise<void> {
  let stored = await wanjuanTianjiStorageGet([`tianjiSeedanceConfig`]),
    config = wanjuanNormalizeTianjiSeedanceConfig(stored.tianjiSeedanceConfig || {}),
    nodeData = options.sourceNode?.data || {},
    prompt = (
      Array.isArray(options.extraPrompts) && options.extraPrompts.length > 0
        ? `${options.extraPrompts.join(`\n`)}\n${options.prompt || ``}`
        : options.prompt || ``
    ).trim(),
    model = wanjuanTianjiFirstListValue(nodeData.tianjiSelectedModel || nodeData.selectedModel || nodeData.videoModel || config.models),
    resolution = String(
      nodeData.selectedResolution ||
        wanjuanTianjiFirstListValue(nodeData.seedanceResolutions || config.resolutions, `720p`),
    ).trim(),
    duration = String(
      nodeData.selectedSeconds ||
        options.selectedDuration ||
        wanjuanTianjiFirstListValue(nodeData.videoDurations || config.durations, `5`),
    ).trim(),
    ratio = String(
      nodeData.size ||
        options.selectedSize ||
        wanjuanTianjiFirstListValue(nodeData.seedanceRatios || nodeData.videoResolutions || config.ratios, `16:9`),
    ).trim();
  if (!ratio.includes(`:`)) ratio = normalizeVideoAspectRatioValue(ratio, `1280x720`);
  if (!model) throw Error(`请先在设置中配置天玑 Seedance 模型`);
  let generationMode = nodeData.tianjiSeedanceGenerationMode || `text-to-video`,
    payload: any = {
      duration,
      ratio,
      prompt,
      watermark: nodeData.watermark === void 0 ? config.watermark : nodeData.watermark === true,
      model_name: model,
      resolution,
      generate_audio: nodeData.generateAudio === void 0 ? config.generateAudio : nodeData.generateAudio !== false,
    },
    endpoint = `/api/cut/model/coze-seedance-text-special`,
    abortControllers = options.abortControllers,
    abortController = new AbortController();
  abortControllers.current.set(options.nodeId, abortController);
  let resolveMediaUrls = async (refs: any[], kind: string, limit: number) => {
      let urls: string[] = [];
      for (let ref of refs.slice(0, limit)) {
        let mediaUrl = await wanjuanTianjiMediaUrl(ref, kind, {
          uploadMode: nodeData.seedanceUploadMode,
          tosConfig: nodeData.tosConfig,
          customPublicUploadConfig: nodeData.customPublicUploadConfig,
          qiniuConfig: nodeData.qiniuConfig,
        });
        mediaUrl && urls.push(mediaUrl);
      }
      return urls;
    },
    imageUrls = await resolveMediaUrls(options.imageRefs || [], `image`, 9),
    videoUrls = await resolveMediaUrls(options.videoRefs || [], `video`, 3),
    audioUrls = await resolveMediaUrls(options.audioRefs || [], `audio`, 3);
  if (!prompt) throw Error(`请输入天玑提示词`);
  if (generationMode === `first-frame`) {
    if (!imageUrls[0]) throw Error(`天玑首帧生视频需要连接至少一张图片`);
    (endpoint = `/api/cut/model/coze-seedance-image-first-special`), (payload.first_frame = imageUrls[0]);
  } else if (generationMode === `first-last`) {
    if (!imageUrls[0] || !imageUrls[1]) throw Error(`天玑首尾帧生视频需要连接至少两张图片`);
    (endpoint = `/api/cut/model/coze-seedance-image-first-last-special`),
      (payload.first_frame = imageUrls[0]),
      (payload.last_frame = imageUrls[1]);
  } else if (generationMode === `reference-media`) {
    endpoint = `/api/cut/model/coze-seedance-video-special`;
    imageUrls.length > 0 && (payload[`images[]`] = imageUrls);
    videoUrls.length > 0 && (payload[`videos[]`] = videoUrls);
    audioUrls.length > 0 && (payload[`audios[]`] = audioUrls);
  }
  options.showToast(`即梦天玑任务提交中...`);
  let submitResponse = await wanjuanTianjiRequest(config, endpoint, {
      params: payload,
      signal: abortController.signal,
    }),
    taskId = wanjuanTianjiFindTaskId(submitResponse);
  if (!taskId) throw Error(`即梦天玑提交成功但未返回 execute_id`);
  (options.updateGlobalTasks &&
    options.updateGlobalTasks((tasks) => [
      ...tasks,
      {
        id: taskId,
        type: `video`,
        provider: `tianji-seedance`,
        apiBaseUrl: config.baseUrl,
        modelName: model,
        projectId: options.projectIdAtStart,
        nodeId: options.nodeId,
        status: `pending`,
        progress: 0,
        createdAt: Date.now(),
        prompt: options.prompt,
      },
    ]),
    options.updateNodes((nodes) =>
      nodes.map((node) =>
        node.id === options.nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                seedanceTaskId: taskId,
                tianjiExecuteId: taskId,
                videoUrl: void 0,
                thumbnailUrl: void 0,
                resultData: void 0,
                loading: true,
                progress: 1,
                errorMessage: void 0,
                loadingText: `任务已提交，等待查询...`,
              },
            }
          : node,
      ),
    ),
    await options.persistVideoNodeState(
      {},
      {
        seedanceTaskId: taskId,
        tianjiExecuteId: taskId,
        videoUrl: void 0,
        thumbnailUrl: void 0,
        resultData: void 0,
        loading: true,
        progress: 1,
        errorMessage: void 0,
        loadingText: `任务已提交，等待查询...`,
      },
    ),
    localStorage.setItem(options.dailyKey, (options.dailyCount + 1).toString()),
    options.setDailyCount(options.dailyCount + 1),
    options.showToast(`即梦天玑任务提交成功，正在生成中...`));
  let done = false,
    pollCount = 0,
    consecutiveErrors = 0,
    maxPollingMs = Math.max(5e3, (Number(options.maxPollingDuration) || 600) * 1e3),
    startTime = Date.now();
  for (; !done; ) {
    if (abortController.signal.aborted) throw Error(`生成已取消`);
    if (Date.now() - startTime >= maxPollingMs)
      throw Error(`即梦天玑视频生成超时，请在设置中增大全局异步轮询最大时长后重试`);
    await new Promise((resolve) => setTimeout(resolve, options.pollingInterval));
    pollCount++;
    try {
      let statusResponse = await wanjuanTianjiRequest(config, `/api/cut/model/coze-run-seedance-special-history`, {
          method: `GET`,
          query: {
            execute_id: taskId,
          },
          signal: abortController.signal,
        }),
        status = wanjuanTianjiStatus(statusResponse),
        videoUrl = wanjuanTianjiFindVideoUrl(statusResponse),
        thumbUrl = wanjuanTianjiFindThumbUrl(statusResponse),
        statusLabel = wanjuanTianjiStatusLabel(status);
      consecutiveErrors = 0;
      if ([`succeeded`, `completed`, `complete`, `success`, `done`].includes(status) || videoUrl) {
        if (!videoUrl) throw Error(`即梦天玑任务已完成，但未返回视频地址`);
        let displayWidth = 320,
          displayHeight = 320,
          aspectRatioCss: string | null = null,
          ratioMatch = String(ratio || `16:9`).match(/^(\d+(?:\.\d+)?)\s*[:xX\/]\s*(\d+(?:\.\d+)?)$/);
        if (ratioMatch) {
          let ratioW = Number(ratioMatch[1]),
            ratioH = Number(ratioMatch[2]);
          if (!isNaN(ratioW) && !isNaN(ratioH) && ratioH > 0) {
            let aspectRatio = ratioW / ratioH;
            (aspectRatioCss = `${ratioW} / ${ratioH}`),
              aspectRatio > 1
                ? ((displayWidth = Math.min(600, Math.max(320, 360 * aspectRatio))),
                  (displayHeight = displayWidth / aspectRatio))
                : aspectRatio < 1
                ? ((displayHeight = 420), (displayWidth = displayHeight * aspectRatio))
                : ((displayHeight = 320), (displayWidth = displayHeight));
          }
        }
        (options.updateGlobalTasks &&
          options.updateGlobalTasks((tasks) =>
            tasks.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    status: `completed`,
                    progress: 100,
                    resultUrl: videoUrl,
                    thumbnailUrl: thumbUrl,
                  }
                : task,
            ),
          ),
          options.updateNodes((nodes) =>
            nodes.map((node) =>
              node.id === options.nodeId &&
              (node.data?.seedanceTaskId === taskId ||
                node.data?.taskId === taskId ||
                node.data?.tianjiExecuteId === taskId)
                ? {
                    ...node,
                    style: {
                      ...node.style,
                      width: displayWidth,
                      height: displayHeight + 24,
                    },
                    data: {
                      ...node.data,
                      videoUrl,
                      thumbnailUrl: thumbUrl,
                      videoAspectRatio: aspectRatioCss,
                      loading: false,
                      progress: 100,
                      errorMessage: void 0,
                      loadingText: void 0,
                    },
                  }
                : node,
            ),
          ),
          await options.persistVideoNodeState(
            {
              width: displayWidth,
              height: displayHeight + 24,
            },
            {
              videoUrl,
              thumbnailUrl: thumbUrl,
              videoAspectRatio: aspectRatioCss,
              loading: false,
              progress: 100,
              errorMessage: void 0,
              loadingText: void 0,
            },
          ),
          options.updateEdges((edges) =>
            edges.map((edge) => (edge.target === options.nodeId ? { ...edge, animated: false } : edge)),
          ),
          options.addTransitResource && options.addTransitResource(videoUrl, `video`, `generated`),
          options.showToast(`即梦天玑视频生成成功！`));
        done = true;
      } else if ([`failed`, `fail`, `error`, `expired`, `canceled`, `cancelled`, `rejected`].includes(status))
        throw Error(wanjuanTianjiErrorMessage(statusResponse));
      else {
        let progress = wanjuanTianjiFindProgress(statusResponse),
          hasRealProgress = !isNaN(progress);
        progress = hasRealProgress ? Math.min(99, Math.max(1, progress)) : NaN;
        (options.updateNodes((nodes) =>
          nodes.map((node) =>
            node.id === options.nodeId &&
            (node.data?.seedanceTaskId === taskId ||
              node.data?.taskId === taskId ||
              node.data?.tianjiExecuteId === taskId)
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    loading: true,
                    progress: hasRealProgress ? progress : node.data?.progress ?? 1,
                    errorMessage: void 0,
                    loadingText: hasRealProgress ? `${statusLabel}... ${progress}%` : `${statusLabel}...`,
                  },
                }
              : node,
          ),
        ),
          options.updateGlobalTasks &&
            options.updateGlobalTasks((tasks) =>
              tasks.map((task) =>
                task.id === taskId
                  ? task.status === `completed` || task.resultUrl
                    ? task
                    : {
                      ...task,
                      status: `running`,
                      ...(hasRealProgress ? { progress } : {}),
                    }
                  : task,
              ),
            ));
      }
    } catch (error: any) {
      if (error?.message && /失败|failed|error|expired|canceled|cancelled|rejected/i.test(error.message)) throw error;
      (console.warn(`Tianji Seedance polling error:`, error),
        consecutiveErrors++,
        consecutiveErrors === 5 && options.showToast(`即梦天玑状态查询暂时失败，仍会继续重试...`));
    }
  }
}
