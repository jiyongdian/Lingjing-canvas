/**
 * 资源过滤标签渲染
 *
 * 提供素材选择器中两组筛选标签的渲染逻辑，以及图片加载失败时的占位资源：
 * - wanjuanBrokenResourceImage：素材图片加载失败时使用的内联 SVG 占位图（data URL）。
 * - wanjuanUseBrokenResourceImage：<img> onError 处理器，把失效图片替换为占位图。
 * - wanjuanRenderResourceFilterTabs：渲染按资源类型（全部/图片/视频/音频/文本）筛选的标签。
 * - wanjuanRenderResourceSourceTabs：渲染按资源来源（AI生成/外部素材）筛选的标签 + 收藏过滤开关。
 *
 * 注意：这些函数只产出 React 元素（通过 jsx/jsxs），自身不持有状态，状态由调用方通过传入的
 * setter（onSelect/setPage 等）管理。
 */
import { jsx, jsxs } from "react/jsx-runtime";
import type { SyntheticEvent } from "react";

/**
 * 素材图片加载失败时使用的内联 SVG 占位图（data URL）。
 * SVG 内容保持原始字节不变，仅由 encodeURIComponent 转义后拼成 data URL。
 */
export const wanjuanBrokenResourceImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151a22"/><stop offset="1" stop-color="#0b0f15"/></linearGradient></defs><rect width="96" height="96" rx="10" fill="url(#g)"/><rect x="16" y="18" width="64" height="44" rx="6" fill="#111827" stroke="#2f3847"/><circle cx="33" cy="33" r="5" fill="#4b5563"/><path d="M22 55l15-16 10 10 7-8 20 14H22z" fill="#334155"/><text x="48" y="78" text-anchor="middle" font-size="10" font-family="Arial, sans-serif" fill="#9ca3af">素材失效</text></svg>`)}`;

/**
 * <img> 的 onError 处理器：图片加载失败时替换为占位图，避免重复触发并给出提示。
 * （名字里带 Use，但并非 React Hook，而是一个事件处理函数。）
 */
export function wanjuanUseBrokenResourceImage(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  image.onerror = null;
  image.src = wanjuanBrokenResourceImage;
  image.classList.add("wanjuan-resource-image-broken");
  image.title = "素材图片无法加载，可能是链接已失效或本地文件不可访问";
}

/**
 * 渲染按资源类型筛选的标签（全部/图片/视频/音频/文本）。
 * 返回一个按钮元素数组，由调用方放入容器中。
 *
 * @param activeKind   当前选中的资源类型（"all" | "image" | "video" | "audio" | "text"）
 * @param onSelectKind 选中某类型时调用，传入类型值
 * @param setPage      切换筛选时重置分页页码（固定回到第 1 页）
 */
export function wanjuanRenderResourceFilterTabs(
  activeKind: string,
  onSelectKind: (kind: string) => void,
  setPage: (page: number) => void,
) {
  const selectedKind = activeKind || "all";
  return (
    [
      ["all", "全部"],
      ["image", "图片"],
      ["video", "视频"],
      ["audio", "音频"],
      ["text", "文本"],
    ] as const
  ).map(([kind, label]) => {
    const isActive = selectedKind === kind;
    return jsx(
      "button",
      {
        "aria-pressed": isActive,
        "data-active": isActive ? "true" : undefined,
        className: `wanjuan-resource-filter-tab h-7 flex-1 min-w-0 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${isActive ? "wanjuan-resource-filter-tab-active" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"}`,
        style: isActive
          ? {
              backgroundColor: "#8ab4f8",
              color: "#0f172a",
              WebkitTextFillColor: "#0f172a",
              boxShadow: "inset 0 0 0 1px rgba(219,234,254,0.72), 0 6px 14px rgba(96,165,250,0.24)",
            }
          : undefined,
        onClick: () => {
          onSelectKind(kind);
          setPage(1);
        },
        children: label,
      },
      kind,
    );
  });
}

/**
 * 渲染按资源来源筛选的标签组（全部来源/AI生成/外部素材）以及"只看收藏"开关。
 *
 * @param activeSource    当前选中的来源（"all" | "generated" | "external"）
 * @param onSelectSource  选中某来源时调用，传入来源值
 * @param favoriteOnly    是否只显示收藏的素材
 * @param setFavoriteOnly 切换"只看收藏"状态
 * @param setPage         切换筛选时重置分页页码（固定回到第 1 页）
 * @param withTopMargin   是否在容器上方加 mt-1 间距（默认 false）
 */
export function wanjuanRenderResourceSourceTabs(
  activeSource: string,
  onSelectSource: (source: string) => void,
  favoriteOnly: boolean,
  setFavoriteOnly: (value: boolean) => void,
  setPage: (page: number) => void,
  withTopMargin = false,
) {
  const selectedSource = activeSource || "all";
  return jsxs("div", {
    className: `${withTopMargin ? "mt-2 " : ""}flex items-center gap-2 wanjuan-resource-source-filter`,
    children: [
      jsxs("div", {
        className: "flex flex-1 min-w-0 bg-[#151a22] border border-[#343b46] rounded-lg p-0.5",
        children: (
          [
            ["all", "全部来源"],
            ["generated", "AI生成"],
            ["external", "外部素材"],
          ] as const
        ).map(([source, label]) => {
          const isActive = selectedSource === source;
          return jsx(
            "button",
            {
              "aria-pressed": isActive,
              "data-active": isActive ? "true" : undefined,
              className: `wanjuan-resource-filter-tab h-7 flex-1 min-w-0 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${isActive ? "wanjuan-resource-filter-tab-active" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"}`,
              style: isActive
                ? {
                    backgroundColor: "#8ab4f8",
                    color: "#0f172a",
                    WebkitTextFillColor: "#0f172a",
                    boxShadow: "inset 0 0 0 1px rgba(219,234,254,0.72), 0 6px 14px rgba(96,165,250,0.24)",
                  }
                : undefined,
              onClick: () => {
                onSelectSource(source);
                setPage(1);
              },
              children: label,
            },
            source,
          );
        }),
      }),
      jsx("button", {
        className: `w-8 h-8 inline-flex items-center justify-center rounded-lg border transition-colors ${favoriteOnly ? "border-yellow-400/60 text-yellow-300 bg-yellow-400/10" : "border-[#343b46] text-gray-500 hover:text-yellow-300 hover:border-yellow-400/40 hover:bg-yellow-400/5"}`,
        title: favoriteOnly ? "显示全部收藏筛选" : "只看收藏",
        onClick: () => {
          setFavoriteOnly(!favoriteOnly);
          setPage(1);
        },
        children: favoriteOnly ? "★" : "☆",
      }),
    ],
  });
}
