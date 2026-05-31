/**
 * @提及(mention)token 工具模块
 *
 * 负责处理输入框中 `@` 提及语法的全套纯逻辑：
 * - 在文本中定位光标处正在输入的 `@提及` 区间；
 * - 在 textarea/input 上方计算并定位提及选择器(picker)弹层的坐标；
 * - 格式化 / 规范化 / 还原 `@「素材名」` 形式的提及 token；
 * - 把已成型的提及 token 当作一个整体进行删除(Backspace/Delete)。
 *
 * 本模块为纯 DOM/字符串逻辑，不含任何 React 或 JSX。
 */

/** 提及区间，start 指向 `@` 字符位置，end 指向区间结束(光标处)。 */
export interface MentionRange {
  start: number;
  end: number;
}

/**
 * 在文本 `text` 中，从 `caret`(默认文本末尾)向前查找正在输入的 `@提及` 区间。
 * 若 `@` 之后的片段包含空白/标点等分隔符，或已是完整的 `图片/视频/音频NN` token，则视为无效提及返回 null。
 */
export function wanjuanFindMentionRange(text: string, caret: number = text.length): MentionRange | null {
  const end = Math.max(0, Math.min(Number.isFinite(caret) ? caret : text.length, text.length));
  const atIndex = text.lastIndexOf(`@`, Math.max(0, end - 1));
  if (atIndex < 0) return null;
  const fragment = text.slice(atIndex + 1, end);
  return /[\s」,，.。!！?？;；:：、()[\]{}<>《》"'“”‘’]/.test(fragment) ||
    /^(图片|视频|音频)\d+$/u.test(fragment)
    ? null
    : {
        start: atIndex,
        end,
      };
}

/**
 * 由给定元素向上寻找提及宿主容器(带 data-wanjuan-mention-host="true" 的祖先)，
 * 找不到则回退到父元素。
 */
export function wanjuanMentionHostFromElement(element: any): any {
  return element?.closest?.(`[data-wanjuan-mention-host="true"]`) || element?.parentElement || null;
}

/**
 * 根据 textarea/input 当前文本与光标位置，计算正在输入的提及区间，
 * 并通过镜像元素测量出 `@` token 的屏幕坐标，写入宿主容器的 CSS 变量以定位提及弹层。
 * 返回当前提及区间(或在无有效提及/无宿主时返回区间或 null)。
 */
export function wanjuanUpdateMentionPickerPosition(field: any): MentionRange | null {
  if (!field) return null;
  const range = wanjuanFindMentionRange(field.value || ``, field.selectionStart || 0);
  const host = wanjuanMentionHostFromElement(field);
  if (!range || !host) return range;
  host.dataset.wanjuanMentionHost = `true`;
  host.dataset.wanjuanMentionStart = String(range.start);
  host.dataset.wanjuanMentionEnd = String(range.end);
  const computedStyle = getComputedStyle(field);
  const mirror = document.createElement(`div`);
  const marker = document.createElement(`span`);
  Object.assign(mirror.style, {
    position: `absolute`,
    visibility: `hidden`,
    whiteSpace: `pre-wrap`,
    overflowWrap: `break-word`,
    boxSizing: `border-box`,
    width: `${field.clientWidth}px`,
    minHeight: `${field.clientHeight}px`,
    font: computedStyle.font,
    letterSpacing: computedStyle.letterSpacing,
    lineHeight: computedStyle.lineHeight,
    padding: computedStyle.padding,
    border: computedStyle.border,
  });
  mirror.textContent = (field.value || ``).slice(0, range.end);
  marker.textContent = `​`;
  mirror.appendChild(marker);
  host.appendChild(mirror);
  const lineHeight = parseFloat(computedStyle.lineHeight) || parseFloat(computedStyle.fontSize) * 1.35 || 18;
  const left = Math.max(0, marker.offsetLeft - field.scrollLeft);
  const top = Math.max(0, marker.offsetTop - field.scrollTop + lineHeight + 6);
  mirror.remove();
  host.style.setProperty(`--wanjuan-mention-left`, `${Math.min(left, Math.max(0, host.clientWidth - 288))}px`);
  host.style.setProperty(`--wanjuan-mention-top`, `${top}px`);
  return range;
}

/**
 * 清除提及弹层的定位状态：移除宿主容器上的提及 data 属性与定位用 CSS 变量。
 */
export function wanjuanClearMentionPickerPosition(element: any): void {
  const host = element?.closest?.(`[data-wanjuan-mention-host="true"]`) || wanjuanMentionHostFromElement(element);
  if (!host) return;
  delete host.dataset.wanjuanMentionStart;
  delete host.dataset.wanjuanMentionEnd;
  host.removeAttribute(`data-wanjuan-mention-host`);
  host.style.removeProperty(`--wanjuan-mention-left`);
  host.style.removeProperty(`--wanjuan-mention-top`);
}

/**
 * 判断当前是否应展示提及选择器：即更新定位时能否得到有效提及区间。
 */
export function wanjuanShouldShowMentionPicker(field: any): boolean {
  return !!wanjuanUpdateMentionPickerPosition(field);
}

/**
 * 优先从宿主容器上缓存的提及起止 data 属性还原提及区间(校验起点确为 `@` 且终点不越界)，
 * 否则回退到对整段文本重新查找提及区间。
 */
export function wanjuanMentionRangeFromPicker(element: any, text: string): MentionRange | null {
  const host = element?.closest?.(`[data-wanjuan-mention-host="true"]`);
  const start = Number(host?.dataset?.wanjuanMentionStart);
  const end = Number(host?.dataset?.wanjuanMentionEnd);
  return Number.isFinite(start) && Number.isFinite(end) && text[start] === `@` && end <= text.length
    ? {
        start,
        end,
      }
    : wanjuanFindMentionRange(text, text.length);
}

/**
 * 用 `replacement` 替换文本中指定提及区间的内容；无区间时直接把 `replacement` 追加到末尾。
 */
export function wanjuanReplaceMentionToken(text: string, range: MentionRange | null, replacement: string = ``): string {
  return range ? text.slice(0, range.start) + replacement + text.slice(range.end) : text + replacement;
}

/**
 * 把素材名格式化为标准提及 token `@「名称」`(先剥离已有的前导 `@` 与首尾书名号)。
 */
export function wanjuanFormatMentionToken(label: any): string {
  const name = String(label || `素材`).replace(/^@/, ``).replace(/^「|」$/g, ``);
  return `@「${name}」`;
}

/**
 * 把标准提及 token `@「名称」` 还原为旧版无书名号形式 `@名称`。
 */
export function wanjuanLegacyMentionToken(token: any): string {
  return String(token || ``).replace(/^@「([^」]+)」$/, `@$1`);
}

/**
 * 规范化提及 token 以发送给 API：将形如 `@「图片1」/@「视频2」/@「音频3」` 的内置素材提及去掉书名号变为 `@图片1` 等。
 */
export function wanjuanNormalizeMentionTokensForApi(text: any): string {
  return String(text || ``).replace(/@「((?:图片|视频|音频)\d+)」/g, `@$1`);
}

/**
 * 当光标为单点(无选区)时，判断 Backspace/Delete 是否落在某个提及 token 内部或边界上，
 * 若是则返回该 token 的整体删除区间，以便把 token 作为一个单位删除。
 */
export function wanjuanFindMentionTokenDeleteRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  key: string,
): MentionRange | null {
  if (selectionStart !== selectionEnd) return null;
  const tokenPattern = /@「(?:图片|视频|音频)\d+」|@(图片|视频|音频)\d+/g;
  let match: RegExpExecArray | null;
  for (; (match = tokenPattern.exec(text)); ) {
    const tokenStart = match.index;
    const tokenEnd = tokenStart + match[0].length;
    if (key === `Backspace` && (selectionStart === tokenEnd || (selectionStart > tokenStart && selectionStart <= tokenEnd)))
      return {
        start: tokenStart,
        end: tokenEnd,
      };
    if (key === `Delete` && (selectionStart === tokenStart || (selectionStart >= tokenStart && selectionStart < tokenEnd)))
      return {
        start: tokenStart,
        end: tokenEnd,
      };
  }
  return null;
}

/**
 * 键盘事件处理：在按下不带修饰键的 Backspace/Delete 时，若光标处于某个提及 token 上，
 * 则阻止默认行为、把整个 token 一次性删除，并通过回调上报新文本、在下一帧恢复光标位置。
 * 返回删除后的新文本，未命中 token 时返回 null。
 */
export function wanjuanDeleteMentionTokenAsUnit(event: any, onChange?: (value: string) => void): string | null {
  if (!event || (event.key !== `Backspace` && event.key !== `Delete`) || event.metaKey || event.ctrlKey || event.altKey)
    return null;
  const target = event.currentTarget;
  const value = target.value || ``;
  const selectionStart = Number(target.selectionStart);
  const selectionEnd = Number(target.selectionEnd);
  const range = wanjuanFindMentionTokenDeleteRange(value, selectionStart, selectionEnd, event.key);
  if (!range) return null;
  event.preventDefault();
  const nextValue = `${value.slice(0, range.start)}${value.slice(range.end)}`;
  return (
    requestAnimationFrame(() => {
      try {
        target.selectionStart = range.start;
        target.selectionEnd = range.start;
      } catch {}
    }),
    onChange?.(nextValue),
    nextValue
  );
}
