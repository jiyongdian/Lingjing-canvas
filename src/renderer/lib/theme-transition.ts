/**
 * 主题切换动画模块
 *
 * 负责在切换主题（暗色 / 浅色 / 各种 chrome 色板等）时，在页面上叠加一层
 * 基于 GSAP 的圆形扩散遮罩动画，让旧背景被新主题色逐渐"覆盖"，从而让
 * 主题切换看起来平滑而有仪式感。
 *
 * 依赖：window.gsap（GSAP 动画库，由主 bundle 全局注入）。
 *
 * 导出：
 * - wanjuanThemeTransitionPalette：根据主题名取 [背景色, 强调色] 调色板。
 * - wanjuanRunThemeTransitionFallback：执行实际的 DOM/GSAP 动画（核心实现）。
 * - wanjuanRunThemeTransition：对外入口，做可用性检测并管理全局动画标志位。
 */

/** GSAP 在 window 上的全局引用以及主题切换的全局活跃标志位。 */
declare global {
  interface Window {
    gsap?: any;
    __wanjuanThemeTransitionActive?: boolean;
  }
}

/**
 * 根据主题名返回该主题的 [背景色, 强调色] 调色板二元组。
 * 未知主题回退到 graphite 配色。
 */
export function wanjuanThemeTransitionPalette(theme: string): [string, string] {
  return (
    {
      dark: [`#0b1020`, `rgba(138,180,248,0.34)`],
      graphite: [`#20252c`, `rgba(138,180,248,0.34)`],
      light: [`#f5fafb`, `rgba(108,140,163,0.32)`],
      "warm-light": [`#fbf7f1`, `rgba(186,141,90,0.30)`],
      "mist-blue": [`#f5f9fd`, `rgba(97,128,168,0.30)`],
      "chrome-blue": [`#f5f9ff`, `rgba(71,128,221,0.30)`],
      "chrome-rose": [`#fff8fa`, `rgba(210,109,145,0.30)`],
      "chrome-sand": [`#fbf8f2`, `rgba(188,153,106,0.30)`],
      "chrome-teal": [`#f4fbf8`, `rgba(70,165,142,0.30)`],
      "sage-green": [`#f7fbf7`, `rgba(99,149,112,0.30)`],
    } as Record<string, [string, string]>
  )[theme] || [`#20252c`, `rgba(138,180,248,0.34)`];
}

/**
 * 执行主题切换的圆形扩散动画（核心实现）。
 *
 * 流程：清理旧的捕获层 → 计算半径/视口尺寸/调色板 → 构造一个全屏 SVG 遮罩层
 * 与一个外扩光环 → 用 GSAP 时间线把遮罩圆从 0 扩展到目标半径、光环放大淡出，
 * 动画完成后移除捕获层。期间在 <html> 上挂 wanjuan-theme-transitioning 类。
 *
 * @param theme          主题名（用于取调色板）。
 * @param applyTheme     在动画就绪、旧画面被捕获后调用的回调，用于真正切换主题。
 * @param radiusOverride 可选的扩散半径覆盖值，未传则按视口对角线估算。
 * @returns gsap 不可用时返回 false；动画启动成功返回 true。
 */
export function wanjuanRunThemeTransitionFallback(
  theme: string,
  applyTheme?: (() => void) | null,
  radiusOverride?: number,
): boolean {
  const gsap = window.gsap;
  if (!gsap) return false;

  // 清理上一次残留的捕获层（杀掉其上所有 tween 并移除节点）。
  let captureEl = document.getElementById(`wanjuan-theme-transition-capture`);
  captureEl && gsap.killTweensOf?.(captureEl.querySelectorAll(`*`));
  captureEl?.remove?.();

  const [bgColor, accentColor] = wanjuanThemeTransitionPalette(theme);
  // 扩散圆的目标半径：默认取视口对角线一半再加 96px 余量。
  const radius =
    radiusOverride ||
    Math.ceil(Math.hypot(window.innerWidth || 1, window.innerHeight || 1) / 2) + 96;
  // 外扩光环的最终缩放倍数。
  const ringScale = Math.ceil((radius * 2) / 18) + 2;
  // 旧背景色：优先 --wj-bg 变量，其次 body 背景色，最后兜底 graphite。
  const oldBgColor =
    getComputedStyle(document.documentElement).getPropertyValue(`--wj-bg`) ||
    getComputedStyle(document.body).backgroundColor ||
    `#20252c`;
  const viewportWidth = Math.max(
    1,
    window.innerWidth || document.documentElement.clientWidth || 1,
  );
  const viewportHeight = Math.max(
    1,
    window.innerHeight || document.documentElement.clientHeight || 1,
  );
  const maskId = `wanjuan-theme-transition-mask-${Date.now()}`;

  // 构造捕获层：一个全屏 SVG（带遮罩圆的旧背景）+ 一个外扩光环 div。
  captureEl = document.createElement(`div`);
  captureEl.id = `wanjuan-theme-transition-capture`;
  captureEl.style.setProperty(`--wanjuan-theme-transition-bg`, bgColor);
  captureEl.style.setProperty(`--wanjuan-theme-transition-accent`, accentColor);
  captureEl.style.setProperty(`--wanjuan-theme-transition-old-bg`, oldBgColor);
  captureEl.innerHTML = `<svg class="wanjuan-theme-transition-old" viewBox="0 0 ${viewportWidth} ${viewportHeight}" preserveAspectRatio="none" aria-hidden="true"><defs><mask id="${maskId}" maskUnits="userSpaceOnUse"><rect width="${viewportWidth}" height="${viewportHeight}" fill="white"></rect><circle class="wanjuan-theme-transition-mask-circle" cx="${viewportWidth / 2}" cy="${viewportHeight / 2}" r="0" fill="black"></circle></mask></defs><rect width="${viewportWidth}" height="${viewportHeight}" fill="var(--wanjuan-theme-transition-old-bg, #20252c)" fill-opacity="0.92" mask="url(#${maskId})"></rect></svg><div class="wanjuan-theme-transition-ring"></div>`;
  document.body.appendChild(captureEl);

  const maskCircle = captureEl.querySelector(`.wanjuan-theme-transition-mask-circle`);
  const ringEl = captureEl.querySelector(`.wanjuan-theme-transition-ring`);
  document.documentElement.classList.add(`wanjuan-theme-transitioning`);

  // 初始化各元素的起始状态。
  gsap.set(captureEl, {
    opacity: 1,
  });
  gsap.set(maskCircle, {
    attr: {
      r: 0,
    },
  });
  gsap.set(ringEl, {
    xPercent: -50,
    yPercent: -50,
    scale: 0.001,
    opacity: 0.52,
    force3D: true,
    transformOrigin: `50% 50%`,
  });

  // 起始状态就绪后切换实际主题，使新主题在旧画面被遮罩覆盖时显现。
  typeof applyTheme == `function` && applyTheme();

  // 时间线：扩散遮罩圆、放大并淡出光环、最后整体淡出并移除捕获层。
  gsap
    .timeline({
      defaults: {
        ease: `sine.inOut`,
      },
      onComplete: () => {
        captureEl?.remove?.();
        document.documentElement.classList.remove(`wanjuan-theme-transitioning`);
      },
    })
    .to(
      maskCircle,
      {
        attr: {
          r: radius,
        },
        duration: 0.58,
      },
      0,
    )
    .to(
      ringEl,
      {
        scale: ringScale,
        opacity: 0.2,
        duration: 0.42,
      },
      0.02,
    )
    .to(
      ringEl,
      {
        opacity: 0,
        duration: 0.12,
        ease: `power1.out`,
      },
      0.42,
    )
    .to(
      captureEl,
      {
        opacity: 0,
        duration: 0.12,
        ease: `power1.out`,
      },
      0.58,
    );

  return true;
}

/**
 * 主题切换动画的对外入口。
 *
 * 做可用性检测（非浏览器环境、用户偏好减少动效时直接跳过），随后预算扩散半径，
 * 设置全局活跃标志位并调用核心动画。动画成功则在 760ms 后清除标志位。
 *
 * @param theme      主题名。
 * @param applyTheme 真正切换主题的回调。
 * @returns 是否成功启动了过渡动画。
 */
export function wanjuanRunThemeTransition(
  theme: string,
  applyTheme?: (() => void) | null,
): boolean {
  // typeof document > "u"：等价于 typeof document === "undefined"（非浏览器环境）。
  if (typeof document > `u`) return false;
  // 尊重用户的"减少动效"系统偏好。
  if (window.matchMedia?.(`(prefers-reduced-motion: reduce)`)?.matches) return false;

  const viewportWidth = Math.max(
    1,
    window.innerWidth || document.documentElement.clientWidth || 1,
  );
  const viewportHeight = Math.max(
    1,
    window.innerHeight || document.documentElement.clientHeight || 1,
  );
  const radius = Math.ceil(Math.hypot(viewportWidth, viewportHeight) / 2) + 96;

  window.__wanjuanThemeTransitionActive = true;
  const started = wanjuanRunThemeTransitionFallback(theme, applyTheme, radius);

  return started
    ? (window.setTimeout(() => {
        window.__wanjuanThemeTransitionActive = false;
      }, 760),
      true)
    : ((window.__wanjuanThemeTransitionActive = false), false);
}
