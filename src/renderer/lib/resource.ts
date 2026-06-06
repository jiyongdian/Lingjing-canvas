/**
 * 资源类型 / 来源 / 过滤工具模块。
 *
 * 负责判定素材资源(resource)的媒体种类(图片 / 视频 / 音频 / 文本)与来源
 * (AI 生成 / 外部素材)，并据此实现资源列表的过滤匹配。
 * 另外提供工程媒体绑定值的反序列化与本地文件地址(file://)的构造工具。
 */

/**
 * 判定资源的媒体种类。
 *
 * 综合资源的 type / mediaKind 以及 url / localPath / path / thumbnailUrl 等字段，
 * 通过 MIME 前缀、data URI、文件扩展名等线索判断，返回 text / audio / video / image 之一，
 * 无法识别时默认归为 image。
 */
export function wanjuanResourceKind(resource: any): `text` | `audio` | `video` | `image` {
  let typeString = String(resource?.type || resource?.mediaKind || ``).toLowerCase(),
    urlString = String(
      resource?.url ||
        resource?.videoUrl ||
        resource?.resultVideoUrl ||
        resource?.audioUrl ||
        resource?.resultAudioUrl ||
        resource?.imageUrl ||
        resource?.mediaUrl ||
        resource?.resultUrl ||
        resource?.localPath ||
        resource?.path ||
        resource?.thumbnailUrl ||
        ``,
    ).toLowerCase();
  return typeString === `text` || typeString.startsWith(`text/`)
    ? `text`
    : typeString === `audio` ||
        typeString.startsWith(`audio/`) ||
        /^data:audio\//.test(urlString) ||
        /\.(mp3|wav|m4a|aac|ogg|flac)(?:$|[?#])/i.test(urlString)
      ? `audio`
      : typeString === `video` ||
          typeString.startsWith(`video/`) ||
          /^data:video\//.test(urlString) ||
          /\.(mp4|webm|mov|m4v|mpeg|mpg|avi|mkv)(?:$|[?#])/i.test(urlString)
        ? `video`
        : `image`;
}

/**
 * 判定资源的来源种类。
 *
 * 汇总 source / sourceOrigin / mediaSourceOrigin / origin / sourceKind / pageUrl 等字段，
 * 若命中 AI 相关关键字(generated、seedream、seedance、tts、music 等)则视为 "generated"，
 * 否则视为 "external"。
 */
export function wanjuanResourceSourceKind(resource: any): `generated` | `external` {
  let combinedSource = [
    resource?.source,
    resource?.sourceOrigin,
    resource?.mediaSourceOrigin,
    resource?.origin,
    resource?.sourceKind,
    resource?.pageUrl,
  ]
    .map((value) => String(value || ``).toLowerCase())
    .filter(Boolean)
    .join(` `);
  return /\bgenerated\b|ai|seedream|seedance|doubao|tongyi|wanxiang|task|tts|music|video-editor/.test(
    combinedSource,
  )
    ? `generated`
    : `external`;
}

/**
 * 判断资源是否满足当前筛选条件。
 *
 * @param resource     待判定的资源对象
 * @param kindFilter   媒体种类筛选值；特殊值 "favorite" 表示仅看收藏(种类不限)
 * @param sourceFilter 来源筛选值(generated / external / all)，默认 "all"
 * @param favoriteOnly 是否仅显示收藏项，默认 false
 *
 * 当 kindFilter 为 "favorite" 时，等效于种类不限且强制开启收藏过滤。
 * 三个维度(种类 / 来源 / 收藏)全部匹配时返回 true。
 */
export function wanjuanResourceMatchesFilter(
  resource: any,
  kindFilter: string,
  sourceFilter: string = `all`,
  favoriteOnly: boolean = false,
): boolean {
  let effectiveKindFilter = kindFilter === `favorite` ? `all` : kindFilter,
    requireFavorite = favoriteOnly || kindFilter === `favorite`,
    matchesKind =
      effectiveKindFilter === `all` ||
      !effectiveKindFilter ||
      wanjuanResourceKind(resource) === effectiveKindFilter,
    matchesSource =
      sourceFilter === `all` || !sourceFilter || wanjuanResourceSourceKind(resource) === sourceFilter,
    matchesFavorite = !requireFavorite || resource?.isFavorite === true;
  return matchesKind && matchesSource && matchesFavorite;
}

/**
 * 反序列化工程媒体绑定的可移植值(portableData)。
 *
 * 绑定不存在时返回 undefined；portableData 非字符串时原样返回；
 * 当 valueFormat 为 "json" 时尝试 JSON 解析，解析失败则回退为原始字符串。
 */
export function reviveProjectMediaBindingValue(binding: any): any {
  if (!binding) return undefined;
  let portableData = binding.portableData;
  if (typeof portableData != `string`) return portableData;
  if (binding.valueFormat === `json`)
    try {
      return JSON.parse(portableData);
    } catch {
      return portableData;
    }
  return portableData;
}

/**
 * 由本地文件路径构造 file:// 协议地址。
 *
 * 非字符串或空字符串返回空串；已是 file:// 开头的地址原样返回；
 * 否则对路径进行 URI 编码并把 "#" 转义为 "%23"，再拼接 file:// 前缀。
 */
export function buildProjectMediaFileUrl(filePath: any): string {
  return typeof filePath == `string` && filePath
    ? /^file:\/\//i.test(filePath)
      ? filePath
      : `file://${encodeURI(filePath).replace(/#/g, `%23`)}`
    : ``;
}
