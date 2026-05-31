/**
 * 天玑人像资源处理模块。
 *
 * 负责把天玑(Seedance)接口返回的原始人像素材数据归一化为统一结构，
 * 并把单个归一化人像转换为编辑器内部使用的资源对象(resource)。
 */

/** 归一化后的天玑人像素材结构。 */
interface TianjiPortraitAsset {
  id: string;
  name: string;
  portraitAssetId: string;
  imageUrl: string;
  previewUrl: string;
  groupType: string;
  status: string;
  localUploaded: boolean;
  createdAt: number;
}

/**
 * 归一化天玑人像素材。
 *
 * 入参既可能是素材数组，也可能是按分组(LivenessFace / AIGC)组织的对象；
 * 统一展开后提取人像 id、图片地址、分组类型等字段，过滤掉无图片地址和本地上传的项。
 */
export function wanjuanNormalizeTianjiPortraitAssets(rawAssets: any): TianjiPortraitAsset[] {
  let flattened: any[] = [];
  if (Array.isArray(rawAssets))
    flattened = rawAssets.map((asset) => ({
      ...asset,
      groupType: asset?.groupType || asset?.group_type || asset?.type || ``,
    }));
  else if (rawAssets && typeof rawAssets == `object`)
    [`LivenessFace`, `AIGC`].forEach((groupName) => {
      Array.isArray(rawAssets[groupName]) &&
        rawAssets[groupName].forEach((asset: any) =>
          flattened.push({
            ...asset,
            groupType: asset?.groupType || asset?.group_type || groupName,
          }),
        );
    });
  return flattened
    .map((asset, index) => {
      let assetId = String(
          asset?.portrait_asset_id ||
            asset?.asset_id ||
            asset?.assetId ||
            asset?.id ||
            asset?.Id ||
            asset?.AssetId ||
            ``,
        ).trim(),
        imageUrl = String(
          asset?.image_url ||
            asset?.imageUrl ||
            asset?.cover_url ||
            asset?.preview_url ||
            asset?.url ||
            asset?.URL ||
            asset?.thumbnailUrl ||
            ``,
        ).trim(),
        groupType = String(
          asset?.groupType || asset?.group_type || asset?.asset_type || asset?.type || ``,
        ).trim();
      return imageUrl
        ? {
            id: assetId || `tianji-portrait-${Date.now()}-${index}`,
            name: String(
              asset?.name || asset?.Name || asset?.label || (groupType === `AIGC` ? `虚拟人像` : `真人人像`),
            ),
            portraitAssetId: assetId,
            imageUrl: imageUrl,
            previewUrl: imageUrl,
            groupType: groupType || `LivenessFace`,
            status: String(asset?.status || asset?.Status || ``),
            localUploaded: asset?.localUploaded === !0,
            createdAt: Number(asset?.createdAt || asset?.CreateTime || Date.now()),
          }
        : null;
    })
    .filter((asset): asset is TianjiPortraitAsset => !!asset && asset.localUploaded !== !0);
}

/**
 * 把单个归一化天玑人像转换为编辑器内部资源对象。
 *
 * 缺少图片地址时返回 null；否则构造带 isTianjiPortrait 标记、
 * source/sourceOrigin 为 tianji-portrait 的图片资源。
 */
export function wanjuanTianjiPortraitToResource(portrait: any, index = 0): any {
  let imageUrl = String(portrait?.imageUrl || portrait?.previewUrl || portrait?.url || ``).trim();
  if (!imageUrl) return null;
  let defaultName = portrait?.groupType === `AIGC` ? `虚拟人像` : `真人人像`,
    portraitAssetId = String(portrait?.portraitAssetId || portrait?.id || ``).trim();
  return {
    id: `tianji-portrait-${portrait?.id || index}`,
    tianjiPortraitAssetId: portraitAssetId,
    url: imageUrl,
    thumbnailUrl: portrait?.previewUrl || imageUrl,
    previewUrl: portrait?.previewUrl || imageUrl,
    type: `image/tianji-portrait`,
    pageTitle: portrait?.name || defaultName,
    label: portrait?.name || defaultName,
    name: portrait?.name || defaultName,
    source: `tianji-portrait`,
    sourceOrigin: `tianji-portrait`,
    groupType: portrait?.groupType || `LivenessFace`,
    localUploaded: portrait?.localUploaded === !0,
    isTianjiPortrait: !0,
  };
}
