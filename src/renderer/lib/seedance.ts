/**
 * Seedance 虚拟人像工具模块。
 *
 * 负责处理 Seedance 虚拟人像的素材标识与地址(asset:// 协议)、
 * 预览图的压缩与可移植化(转 dataURL)、原始人像数据的归一化，
 * 以及把单个归一化人像转换为编辑器内部使用的资源对象(resource)。
 *
 * 本组 8 个函数仅互相调用，不依赖外部 wanjuan* 工具，也不使用 React/JSX。
 */

/** 归一化后的 Seedance 虚拟人像结构。 */
interface SeedanceVirtualPortrait {
  id: string;
  name: string;
  assetId: string;
  imageUrl: string;
  previewUrl: string;
  projectName: string;
  notes: string;
  createdAt: number;
}

/** 预览图压缩选项。 */
interface PreparePreviewOptions {
  maxSize?: number;
  quality?: number;
}

/**
 * 归一化 Seedance 素材 id：去首尾空白、去 asset:// 前缀、移除所有空白字符。
 */
export function wanjuanNormalizeSeedanceAssetId(rawAssetId: any): string {
  return String(rawAssetId || ``)
    .trim()
    .replace(/^asset:\/\//i, ``)
    .replace(/\s+/g, ``);
}

/**
 * 把素材 id 转换为 asset:// 协议地址；id 为空时返回空字符串。
 */
export function wanjuanSeedanceAssetUrl(rawAssetId: any): string {
  let assetId = wanjuanNormalizeSeedanceAssetId(rawAssetId);
  return assetId ? `asset://${assetId}` : ``;
}

/**
 * 把 Blob 读取为 dataURL；读取失败时 reject。
 */
export function wanjuanBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result == `string` ? reader.result : ``);
    reader.onerror = () => reject(reader.error || Error(`blob read failed`));
    reader.readAsDataURL(blob);
  });
}

/**
 * 把 image/ 类型的 dataURL 缩放压缩为更小的预览图 dataURL。
 *
 * 非 image dataURL、或缺少 Image/document 环境时原样返回；
 * 按最长边等比缩放到 maxSize(默认 256)，按 quality(默认 0.82)编码，
 * 保留 png/webp 类型，其余统一转为 jpeg。任何异常都回退为原始字符串。
 */
export function wanjuanPrepareSeedancePortraitPreview(
  rawDataUrl: any,
  options: PreparePreviewOptions = {},
): Promise<string> {
  let dataUrl = String(rawDataUrl || ``);
  if (
    !dataUrl ||
    !/^data:image\//i.test(dataUrl) ||
    typeof Image > `u` ||
    typeof document > `u`
  )
    return Promise.resolve(dataUrl);
  let maxSize = Number(options.maxSize || 256),
    quality = Number(options.quality || 0.82);
  return new Promise((resolve) => {
    let image = new Image();
    image.onload = () => {
      try {
        let sourceWidth = image.naturalWidth || image.width || 0,
          sourceHeight = image.naturalHeight || image.height || 0;
        if (!sourceWidth || !sourceHeight) {
          resolve(dataUrl);
          return;
        }
        let scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight)),
          targetWidth = Math.max(1, Math.round(sourceWidth * scale)),
          targetHeight = Math.max(1, Math.round(sourceHeight * scale)),
          canvas = document.createElement(`canvas`);
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        let context = canvas.getContext(`2d`);
        if (!context) {
          resolve(dataUrl);
          return;
        }
        context.drawImage(image, 0, 0, targetWidth, targetHeight);
        let sourceMime = /^data:(image\/[^;]+);/i.exec(dataUrl)?.[1] || `image/jpeg`,
          outputMime =
            sourceMime === `image/png` || sourceMime === `image/webp` ? sourceMime : `image/jpeg`;
        resolve(canvas.toDataURL(outputMime, quality) || dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

/**
 * 把任意预览地址转换为可移植的预览 dataURL。
 *
 * asset:// 地址(已是可移植标识)返回空字符串；data:image dataURL 直接压缩；
 * blob:/file://https?:// 地址先 fetch 再转 dataURL 后压缩，失败时 blob/file 回退空、其余回退原值。
 */
export async function wanjuanPortableSeedancePortraitPreview(rawUrl: any): Promise<string> {
  let url = String(rawUrl || ``).trim();
  if (!url || /^asset:\/\//i.test(url)) return ``;
  if (/^data:image\//i.test(url)) return await wanjuanPrepareSeedancePortraitPreview(url);
  if (/^(blob:|file:\/\/|https?:\/\/)/i.test(url))
    try {
      let response = await fetch(url);
      if (!response.ok) throw Error(`preview fetch failed`);
      return await wanjuanPrepareSeedancePortraitPreview(
        await wanjuanBlobToDataUrl(await response.blob()),
      );
    } catch (error) {
      return (
        console.warn(`Seedance portrait preview portable fallback`, error),
        /^(blob:|file:\/\/)/i.test(url) ? `` : url
      );
    }
  return url;
}

/**
 * 把虚拟人像列表转换为可移植形式。
 *
 * 先归一化，再清空 imageUrl，并把 previewUrl(回退 imageUrl)转换为可移植预览 dataURL。
 */
export async function wanjuanMakeSeedanceVirtualPortraitsPortable(
  rawPortraits: any,
): Promise<SeedanceVirtualPortrait[]> {
  let portraits = wanjuanNormalizeSeedanceVirtualPortraits(rawPortraits);
  return await Promise.all(
    portraits.map(async (portrait) => ({
      ...portrait,
      imageUrl: ``,
      previewUrl: await wanjuanPortableSeedancePortraitPreview(
        portrait.previewUrl || portrait.imageUrl || ``,
      ),
    })),
  );
}

/**
 * 归一化 Seedance 虚拟人像列表。
 *
 * 入参非数组返回空数组；按 assetId/seedanceAssetId/id 优先级提取素材 id，
 * 无素材 id 的项过滤掉，其余补全 id、名称、预览地址、项目名、备注、创建时间等字段。
 */
export function wanjuanNormalizeSeedanceVirtualPortraits(rawPortraits: any): SeedanceVirtualPortrait[] {
  return Array.isArray(rawPortraits)
    ? rawPortraits
        .map((portrait, index) => {
          let assetId = wanjuanNormalizeSeedanceAssetId(
            portrait?.assetId || portrait?.seedanceAssetId || portrait?.id,
          );
          if (!assetId) return null;
          let previewUrl = String(
            portrait?.previewUrl ||
              portrait?.imageUrl ||
              portrait?.url ||
              portrait?.thumbnailUrl ||
              ``,
          );
          return {
            id: String(portrait?.id || `portrait-${Date.now()}-${index}`),
            name: String(portrait?.name || portrait?.label || `虚拟人像 ${index + 1}`),
            assetId: assetId,
            imageUrl: String(portrait?.imageUrl || ``),
            previewUrl: previewUrl,
            projectName: String(portrait?.projectName || ``),
            notes: String(portrait?.notes || ``),
            createdAt: Number(portrait?.createdAt || Date.now()),
          };
        })
        .filter((portrait): portrait is SeedanceVirtualPortrait => !!portrait)
    : [];
}

/**
 * 把单个归一化虚拟人像转换为编辑器内部资源对象。
 *
 * 缺少素材 id 时返回 null；否则构造带 isSeedanceVirtualPortrait 标记、
 * url 为 asset:// 地址、source 为 seedance-virtual-portrait 的图片资源。
 */
export function wanjuanSeedancePortraitToResource(portrait: any, index = 0): any {
  let assetId = wanjuanNormalizeSeedanceAssetId(portrait?.assetId);
  if (!assetId) return null;
  return {
    id: `seedance-portrait-${portrait.id || assetId}`,
    virtualPortraitId: portrait.id || ``,
    seedanceAssetId: assetId,
    url: wanjuanSeedanceAssetUrl(assetId),
    thumbnailUrl: portrait.previewUrl || portrait.imageUrl || ``,
    previewUrl: portrait.previewUrl || portrait.imageUrl || ``,
    type: `image/virtual-portrait`,
    pageTitle: portrait.name || `虚拟人像 ${index + 1}`,
    label: portrait.name || `虚拟人像 ${index + 1}`,
    name: portrait.name || `虚拟人像 ${index + 1}`,
    projectName: portrait.projectName || ``,
    source: `seedance-virtual-portrait`,
    isSeedanceVirtualPortrait: true,
  };
}
