// 职责：启动主题解析与开机启动画面(boot splash)样式注入及主题镜像。
const { fs, os, path } = require("./runtime.cjs");
const {
  LEGACY_THEME_STORAGE_KEYS,
  BOOT_THEME_MIRROR_KEY,
  BOOT_THEME_STORAGE_KEYS,
} = require("./constants.cjs");

function mergeRecoveredApiConfigs(currentValue, recoveryValue) {
  const recoveredConfigs = Array.isArray(recoveryValue) ? recoveryValue : [];
  const firstRecoveredConfig = recoveredConfigs[0];
  if (!firstRecoveredConfig) return currentValue;
  const currentConfigs = Array.isArray(currentValue) ? currentValue : [];
  return [
    firstRecoveredConfig,
    ...currentConfigs.slice(1).filter((item) => item && item.id !== firstRecoveredConfig.id),
  ];
}

function clearLegacyThemeStorage() {
  for (const key of LEGACY_THEME_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn("legacy theme storage cleanup skipped", key, error);
    }
  }
}

function appendRendererDebugLog(type, payload) {
  try {
    const logPath = path.join(os.tmpdir(), "wanjuan-renderer-debug.log");
    fs.appendFileSync(
      logPath,
      `${JSON.stringify({ time: new Date().toISOString(), type, payload })}\n`
    );
  } catch {}
}

function resolveBootThemeMode() {
  const readStoredThemeMode = () => {
    try {
      const root = document.documentElement;
      const datasetTheme = normalizeThemeValue(String(root?.dataset?.wanjuanThemeMode || "").trim().toLowerCase());
      if (datasetTheme && datasetTheme !== "graphite") return datasetTheme;
      const className = Array.from(root?.classList || []).find((item) => /^theme-/.test(item));
      const fromClass = normalizeThemeValue(className ? className.replace(/^theme-/, "") : "");
      if (fromClass && fromClass !== "graphite") return fromClass;
      const keys = BOOT_THEME_STORAGE_KEYS;
      let lsFallback = null;
      for (const key of keys) {
        const raw = String(window.localStorage.getItem(key) || "").trim().toLowerCase();
        if (raw === "system") continue;
        const normalized = normalizeThemeValue(raw);
        if (!normalized) continue;
        if (normalized !== "light") return normalized;
        if (!lsFallback) lsFallback = normalized;
      }
      if (lsFallback) return lsFallback;
      const mirroredTheme = normalizeThemeValue(window.localStorage.getItem(BOOT_THEME_MIRROR_KEY));
      if (mirroredTheme) return mirroredTheme;
      if (datasetTheme) return datasetTheme;
      if (fromClass) return fromClass;
      return "graphite";
    } catch {
      return "graphite";
    }
  };
  return readStoredThemeMode();
}

function normalizeBootThemeFromStore(store) {
  if (!store || typeof store !== "object") return null;
  let fallback = null;
  for (const key of BOOT_THEME_STORAGE_KEYS) {
    const normalized = normalizeThemeValue(store[key]);
    if (!normalized) continue;
    // Prefer specific theme over generic "light"
    if (normalized !== "light") return normalized;
    if (!fallback) fallback = normalized;
  }
  return fallback;
}

function mirrorBootThemeMode(theme) {
  const normalized = normalizeThemeValue(theme);
  if (!normalized) return;
  try {
    window.localStorage.setItem(BOOT_THEME_MIRROR_KEY, normalized);
  } catch (error) {
    console.warn("boot theme mirror skipped", error);
  }
}

function mirrorBootThemeFromStore(store) {
  const theme = normalizeBootThemeFromStore(store);
  if (theme) mirrorBootThemeMode(theme);
}

async function resolveBootThemeModeAsync(timeoutMs = 360) {
  const immediateTheme = resolveBootThemeMode();
  if (immediateTheme && immediateTheme !== "graphite") return immediateTheme;
  try {
    const storedTheme = await Promise.race([
      getDesktopStorageItems(BOOT_THEME_STORAGE_KEYS).then((store) => {
        const theme = normalizeBootThemeFromStore(store);
        if (theme) mirrorBootThemeMode(theme);
        return theme;
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]);
    if (storedTheme) return storedTheme;
  } catch (error) {
    console.warn("boot theme async resolve skipped", error);
  }
  return immediateTheme || "graphite";
}

function buildBootParticleMarkup(className, count, seedOffset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const seed = index + 1 + seedOffset;
    const left = (seed * 17) % 100;
    const top = (seed * 29) % 100;
    const size = 4 + ((seed * 7) % 7);
    const delay = (((seed * 19) % 37) / 10).toFixed(2);
    const duration = (4.5 + ((seed * 11) % 29) / 10).toFixed(2);
    const drift = ((seed * 23) % 34) - 17;
    const sway = ((seed * 13) % 22) - 11;
    const rot = (seed * 31) % 360;
    return `<span class="${className}" style="--boot-left:${left}%;--boot-top:${top}%;--boot-size:${size}px;--boot-delay:${delay}s;--boot-duration:${duration}s;--boot-drift:${drift}px;--boot-sway:${sway}px;--boot-rot:${rot}deg"></span>`;
  }).join("");
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    appendRendererDebugLog("error", {
      message: event?.message || "",
      filename: event?.filename || "",
      lineno: event?.lineno || 0,
      colno: event?.colno || 0,
      stack: event?.error?.stack || ""
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    appendRendererDebugLog("unhandledrejection", {
      reason: String(event?.reason?.message || event?.reason || ""),
      stack: event?.reason?.stack || ""
    });
  });
}

function installBootStabilityStyle() {
  const ensureSplash = async () => {
    try {
      if (!document.body) {
        setTimeout(ensureSplash, 0);
        return;
      }
      const splashThemeClass = (theme) => `boot-theme-${String(theme || "graphite").replace(/[^a-z0-9-]/g, "")}`;
      const initialTheme = await resolveBootThemeModeAsync();
      let splash = document.getElementById("wanjuan-boot-splash");
      if (!splash) splash = document.createElement("div");
      splash.id = "wanjuan-boot-splash";
      splash.setAttribute("aria-live", "polite");
      let activeThemeClass = splashThemeClass(initialTheme);
      Array.from(splash.classList)
        .filter((className) => className.startsWith("boot-theme-"))
        .forEach((className) => splash.classList.remove(className));
      splash.classList.remove("is-leaving");
      splash.classList.add(activeThemeClass);
      const scrollStageHTML = `
        <div class="wanjuan-scroll-stage">
          <div class="wanjuan-scroll" aria-hidden="true">
            <div class="wanjuan-scroll-roll left"></div>
            <div class="wanjuan-scroll-paper">
              <div class="wanjuan-scroll-ink ink-one"></div>
              <div class="wanjuan-scroll-ink ink-two"></div>
              <div class="wanjuan-scroll-ink ink-three"></div>
              <div class="wanjuan-scroll-pen"></div>
            </div>
            <div class="wanjuan-scroll-roll right"></div>
          </div>
          <div class="wanjuan-scroll-copy">
            <div class="wanjuan-scroll-title">万卷灵境</div>
            <div class="wanjuan-scroll-subtitle">正在展开灵境项目</div>
          </div>
        </div>`;
      const themeAnimHTML = {
        "graphite": `<div class="wanjuan-boot-atmosphere" aria-hidden="true"><div class="wanjuan-boot-scene scene-book"><span class="wanjuan-boot-orbit orbit-one"></span><span class="wanjuan-boot-orbit orbit-two"></span><span class="wanjuan-boot-orbit orbit-three"></span><span class="wanjuan-boot-book-core"></span></div></div>`,
        "chrome-rose": `<div class="wanjuan-boot-animation rose-bloom" aria-hidden="true"><span class="rose-pistil"></span><span class="rose-petal p1"></span><span class="rose-petal p2"></span><span class="rose-petal p3"></span><span class="rose-petal p4"></span><span class="rose-petal p5"></span><span class="rose-ring r1"></span><span class="rose-ring r2"></span></div>`,
        "chrome-blue": `<div class="wanjuan-boot-animation sky-scene" aria-hidden="true"><span class="sky-sun"></span><span class="sky-cloud c1"></span><span class="sky-cloud c2"></span><span class="sky-cloud c3"></span></div>`,
        "sage-green": `<div class="wanjuan-boot-animation green-grow" aria-hidden="true"><span class="green-seed"></span><span class="green-soil"></span><span class="green-stem"><span class="green-leaf stem-leaf-l"></span><span class="green-leaf stem-leaf-r"></span></span><span class="green-branch-l"><span class="green-leaf branch-leaf"></span></span><span class="green-branch-r"><span class="green-leaf branch-leaf"></span></span></div>`,
        "chrome-sand": `<div class="wanjuan-boot-animation sand-rays" aria-hidden="true"><span class="sand-sun"></span><span class="sand-ray r1"></span><span class="sand-ray r2"></span><span class="sand-ray r3"></span><span class="sand-ray r4"></span><span class="sand-ray r5"></span><span class="sand-ray r6"></span><span class="sand-ray r7"></span><span class="sand-ray r8"></span></div>`,
        "dark": `<div class="wanjuan-boot-animation dark-stars" aria-hidden="true">${buildBootParticleMarkup("dark-dust", 46, 120)}<svg class="star-lines" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet"><line x1="88" y1="86" x2="154" y2="132"/><line x1="154" y1="132" x2="225" y2="96"/><line x1="154" y1="132" x2="196" y2="214"/><line x1="196" y1="214" x2="296" y2="252"/><line x1="225" y1="96" x2="315" y2="158"/><line x1="315" y1="158" x2="296" y2="252"/><line x1="104" y1="278" x2="196" y2="214"/><line x1="104" y1="278" x2="58" y2="202"/><line x1="315" y1="158" x2="354" y2="92"/></svg><span class="dark-star s1"></span><span class="dark-star s2"></span><span class="dark-star s3"></span><span class="dark-star s4"></span><span class="dark-star s5"></span><span class="dark-star s6"></span><span class="dark-star s7"></span><span class="dark-star s8"></span><span class="dark-star s9"></span><span class="dark-star s10"></span><span class="dark-star s11"></span><span class="dark-star s12"></span></div>`
      };
      themeAnimHTML["light"] = themeAnimHTML["chrome-blue"];
      themeAnimHTML["warm-light"] = themeAnimHTML["chrome-sand"];
      const resolvedHTML = themeAnimHTML[initialTheme] || themeAnimHTML["graphite"];
      splash.innerHTML = resolvedHTML + scrollStageHTML;
      if (!splash.parentElement) document.body.appendChild(splash);
      const applyThemeToSplash = (nextTheme) => {
        const nextClass = splashThemeClass(nextTheme);
        if (nextClass === activeThemeClass) return;
        splash.classList.remove(activeThemeClass);
        splash.classList.add(nextClass);
        activeThemeClass = nextClass;
        // Also rebuild HTML content for the new theme
        const newHTML = themeAnimHTML[nextTheme] || themeAnimHTML["graphite"];
        splash.innerHTML = newHTML + scrollStageHTML;
      };
      const syncThemeFromRoot = () => applyThemeToSplash(resolveBootThemeMode());
      const themeObserver = new MutationObserver(syncThemeFromRoot);
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-wanjuan-theme-mode"]
      });
      syncThemeFromRoot();
      getDesktopStorageItems(BOOT_THEME_STORAGE_KEYS)
        .then((store) => {
          const fromStorage = normalizeBootThemeFromStore(store);
          if (fromStorage) {
            mirrorBootThemeMode(fromStorage);
            applyThemeToSplash(fromStorage);
          }
        })
        .catch(() => {});
      const removeWhenReady = () => {
        if (document.documentElement.classList.contains("wanjuan-booting")) return;
        splash.classList.add("is-leaving");
        themeObserver.disconnect();
        setTimeout(() => splash.remove(), 360);
      };
      const observer = new MutationObserver(removeWhenReady);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      splash.addEventListener("transitionend", () => {
        if (splash.classList.contains("is-leaving")) {
          observer.disconnect();
          themeObserver.disconnect();
          splash.remove();
        }
      });
      removeWhenReady();
    } catch (error) {
      console.warn("boot splash skipped", error);
    }
  };
  const install = () => {
    try {
      const root = document.documentElement;
      if (!root) {
        setTimeout(install, 0);
        return;
      }
      root.classList.add("wanjuan-booting");
      const releaseBootingFallback = () => {
        try {
          root.classList.remove("wanjuan-booting");
          root.dataset.wanjuanBootReady = "fallback";
          const splash = document.getElementById("wanjuan-boot-splash");
          if (splash) {
            splash.classList.add("is-leaving");
            setTimeout(() => splash.remove(), 360);
          }
        } catch {}
      };
      setTimeout(releaseBootingFallback, 8000);
      window.addEventListener("load", () => setTimeout(releaseBootingFallback, 3500), { once: true });
      if (document.getElementById("wanjuan-boot-stability-style")) return;
      const style = document.createElement("style");
      style.id = "wanjuan-boot-stability-style";
      style.textContent = `
        html.wanjuan-booting,
        html.wanjuan-booting body {
          background: color-mix(in srgb, var(--wanjuan-theme-bg, #20242b) 90%, #000 10%) !important;
        }
        html.theme-graphite.wanjuan-booting,
        html.theme-graphite.wanjuan-booting body {
          background: #2b3037 !important;
        }
        html.wanjuan-booting *,
        html.wanjuan-booting *::before,
        html.wanjuan-booting *::after {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
        }

        /* ===== BASE SPLASH ===== */
        #wanjuan-boot-splash {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: grid;
          place-items: center;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif;
          opacity: 1;
          transform: translateZ(0);
          isolation: isolate;
          contain: layout paint style;
          transition: opacity 320ms ease, transform 320ms ease !important;
        }
        #wanjuan-boot-splash * {
          pointer-events: none;
        }
        #wanjuan-boot-splash.is-leaving {
          opacity: 0;
          transform: scale(1.008);
          pointer-events: none;
        }

        /* ===== GRAPHITE (default scroll) ===== */
        #wanjuan-boot-splash.boot-theme-graphite {
          color: #f7f9fc;
          background:
            radial-gradient(circle at 50% 36%, rgba(138,180,248,0.18), transparent 34%),
            linear-gradient(180deg, #343a42 0%, #2a2f36 54%, #232830 100%);
        }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-boot-orbit {
          position: absolute; left: 50%; top: 43%; transform: translate(-50%,-50%);
          width: 68vmax; height: 68vmax; border-radius: 50%;
          border: 1px solid rgba(138,180,248,0.14);
          animation: wjOrbit 18s linear infinite !important;
        }
        #wanjuan-boot-splash.boot-theme-graphite .orbit-two { width: 52vmax; height: 52vmax; animation-duration: 14s !important; animation-direction: reverse !important; }
        #wanjuan-boot-splash.boot-theme-graphite .orbit-three { width: 36vmax; height: 36vmax; animation-duration: 11s !important; opacity: 0.6; }

        /* ===== CHROME-ROSE: Flower Bloom ===== */
        #wanjuan-boot-splash.boot-theme-chrome-rose {
          color: #4a2030;
          background:
            radial-gradient(ellipse 60% 50% at 50% 42%, rgba(255,159,189,0.12), transparent 50%),
            linear-gradient(180deg, #fff5f8 0%, #ffecf2 50%, #ffe4ec 100%);
        }
        #wanjuan-boot-splash .rose-bloom { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        #wanjuan-boot-splash .rose-pistil {
          position: absolute; left: 50%; top: 50%; width: 36px; height: 36px; border-radius: 50%;
          background: radial-gradient(circle, #fff 20%, #f87faa 55%, #d6476f 85%);
          box-shadow: 0 0 40px rgba(214,71,111,0.6), 0 0 80px rgba(232,105,154,0.3);
          animation: wjRosePistil 3.6s ease-in-out infinite !important;
        }
        #wanjuan-boot-splash .rose-petal {
          position: absolute; left: calc(50% - 27px); top: calc(50% - 72px); width: 54px; height: 72px;
          border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
          background: linear-gradient(160deg, rgba(255,180,210,0.95) 0%, rgba(240,100,155,0.85) 45%, rgba(200,50,100,0.6) 100%);
          transform-origin: 50% 100%;
          opacity: 0;
          animation: wjRosePetalOpen 4.2s cubic-bezier(.2,.6,.3,1) infinite !important;
        }
        #wanjuan-boot-splash .rose-petal.p1 { --petal-angle: 0deg; animation-delay: 0s !important; }
        #wanjuan-boot-splash .rose-petal.p2 { --petal-angle: 72deg; animation-delay: 0.28s !important; }
        #wanjuan-boot-splash .rose-petal.p3 { --petal-angle: 144deg; animation-delay: 0.56s !important; }
        #wanjuan-boot-splash .rose-petal.p4 { --petal-angle: 216deg; animation-delay: 0.84s !important; }
        #wanjuan-boot-splash .rose-petal.p5 { --petal-angle: 288deg; animation-delay: 1.12s !important; }
        #wanjuan-boot-splash .rose-ring {
          position: absolute; left: 50%; top: 50%; border-radius: 50%;
          border: 2px solid rgba(214,71,111,0.35);
          animation: wjRoseRing 4.2s ease-out infinite !important;
        }
        #wanjuan-boot-splash .rose-ring.r1 { width: 160px; height: 160px; margin-left: -80px; margin-top: -80px; }
        #wanjuan-boot-splash .rose-ring.r2 { width: 160px; height: 160px; margin-left: -80px; margin-top: -80px; animation-delay: -2.1s !important; }

        /* ===== LIGHT / MIST-BLUE / CHROME-BLUE: Sky & Clouds ===== */
        #wanjuan-boot-splash.boot-theme-light,
        #wanjuan-boot-splash.boot-theme-chrome-blue {
          color: #1a2a44;
          background: linear-gradient(180deg, #c8ddf8 0%, #dfeaf8 40%, #edf3fa 100%);
        }
        #wanjuan-boot-splash .sky-scene { position: absolute; inset: 0; }
        #wanjuan-boot-splash .sky-sun {
          position: absolute; left: 50%; top: 28%; width: 48px; height: 48px; border-radius: 50%;
          background: radial-gradient(circle, #fff 30%, #ffe8a0 55%, #f0c850 80%);
          box-shadow: 0 0 40px rgba(240,200,80,0.5), 0 0 80px rgba(240,200,80,0.25);
          transform: translate(-50%, -50%);
          animation: wjSkySun 4s ease-in-out infinite !important;
        }
        #wanjuan-boot-splash .sky-cloud {
          position: absolute;
          width: 120px; height: 40px;
          background: rgba(255,255,255,0.85);
          border-radius: 20px;
          box-shadow: 0 4px 12px rgba(100,140,200,0.1);
          animation: wjSkyCloudDrift 8s ease-in-out infinite !important;
        }
        #wanjuan-boot-splash .sky-cloud::before {
          content: ""; position: absolute; bottom: 50%;
          width: 50px; height: 50px; border-radius: 50%;
          background: rgba(255,255,255,0.9);
          left: 20%;
        }
        #wanjuan-boot-splash .sky-cloud::after {
          content: ""; position: absolute; bottom: 40%;
          width: 36px; height: 36px; border-radius: 50%;
          background: rgba(255,255,255,0.88);
          left: 50%;
        }
        #wanjuan-boot-splash .sky-cloud.c1 { left: 18%; top: 32%; width: 110px; height: 36px; animation-delay: 0s !important; }
        #wanjuan-boot-splash .sky-cloud.c2 { left: 55%; top: 38%; width: 140px; height: 44px; animation-delay: -2.8s !important; }
        #wanjuan-boot-splash .sky-cloud.c3 { left: 35%; top: 50%; width: 100px; height: 32px; opacity: 0.6; animation-delay: -5.2s !important; }

        /* ===== SAGE-GREEN / CHROME-TEAL: Seed Sprout ===== */
        #wanjuan-boot-splash.boot-theme-sage-green {
          color: #1a3a2a;
          background: linear-gradient(180deg, #f2faf6 0%, #e6f5ee 60%, #c8e6d8 100%);
        }
        #wanjuan-boot-splash .green-grow {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
        }
        #wanjuan-boot-splash .green-seed {
          position: absolute; left: 50%; top: 50%;
          width: 12px; height: 12px; border-radius: 50%;
          background: radial-gradient(circle, #8B6914 30%, #5a4010 80%);
          transform: translate(-50%, -50%);
          opacity: 0;
          animation: wjSeedFall 5s ease-in infinite !important;
        }
        #wanjuan-boot-splash .green-soil {
          position: absolute; left: 50%; top: 50%;
          width: 60px; height: 6px; border-radius: 3px;
          background: radial-gradient(ellipse, rgba(90,64,16,0.4), rgba(90,64,16,0.1) 70%, transparent);
          transform: translate(-50%, 0) scaleX(0);
          animation: wjSoilAppear 5s ease-out infinite !important;
        }
        #wanjuan-boot-splash .green-stem,
        #wanjuan-boot-splash .green-branch-l,
        #wanjuan-boot-splash .green-branch-r {
          position: relative;
        }
        #wanjuan-boot-splash .green-stem {
          position: absolute; left: 50%; bottom: 50%;
          width: 3px; height: 0;
          background: linear-gradient(180deg, #4ec89a 0%, #2a9d6a 100%);
          border-radius: 2px;
          transform: translateX(-50%);
          transform-origin: bottom center;
          animation: wjStemGrow 5s cubic-bezier(.2,.6,.4,1) infinite !important;
        }
        #wanjuan-boot-splash .green-branch-l,
        #wanjuan-boot-splash .green-branch-r {
          position: absolute; left: 50%; bottom: calc(50% + 48px);
          width: 2.5px; height: 0;
          background: linear-gradient(180deg, #4ec89a, #6dcaa8);
          border-radius: 2px;
          transform-origin: bottom center;
          opacity: 0;
          animation: wjBranchGrow 5s cubic-bezier(.2,.6,.4,1) infinite !important;
        }
        #wanjuan-boot-splash .green-branch-l {
          transform: translateX(-50%) rotate(-42deg);
          animation-delay: 0s !important;
        }
        #wanjuan-boot-splash .green-branch-r {
          transform: translateX(-50%) rotate(42deg);
          animation-delay: 0.3s !important;
        }
        #wanjuan-boot-splash .green-leaf {
          position: absolute;
          width: 12px; height: 8px;
          background: #3da87e;
          border-radius: 0 70% 0 70%;
          opacity: 0;
          animation: wjLeafUnfurl 5s ease-out infinite !important;
        }
        #wanjuan-boot-splash .green-stem .stem-leaf-l {
          bottom: 0; left: -10px;
          transform: rotate(-40deg);
          animation-delay: 0.2s !important;
        }
        #wanjuan-boot-splash .green-stem .stem-leaf-r {
          bottom: 20px; right: -10px;
          transform: rotate(40deg) scaleX(-1);
          animation-delay: 0.5s !important;
        }
        #wanjuan-boot-splash .green-branch-l .branch-leaf {
          bottom: 0; left: -8px;
          transform: rotate(-30deg);
          animation-delay: 0.3s !important;
        }
        #wanjuan-boot-splash .green-branch-r .branch-leaf {
          bottom: 0; right: -8px;
          transform: rotate(30deg) scaleX(-1);
          animation-delay: 0.6s !important;
        }

        /* ===== WARM-LIGHT/CHROME-SAND: Sun Rays ===== */
        #wanjuan-boot-splash.boot-theme-chrome-sand,
        #wanjuan-boot-splash.boot-theme-warm-light {
          color: #3a2a10;
          background: linear-gradient(180deg, #fdf8f0 0%, #f8f2e8 50%, #f4ede2 100%);
        }
        #wanjuan-boot-splash .sand-rays { position: absolute; inset: 0; }
        #wanjuan-boot-splash .sand-sun {
          position: absolute; left: 50%; top: 42%; width: 40px; height: 40px; border-radius: 50%;
          background: radial-gradient(circle, #fff 22%, #e8c060 52%, #b8862a 82%);
          box-shadow: 0 0 44px rgba(184,134,42,0.6), 0 0 88px rgba(214,173,107,0.3);
          transform: translate(-50%, -50%);
          animation: wjSandSun 4s ease-in-out infinite !important;
        }
        #wanjuan-boot-splash .sand-ray {
          position: absolute; left: 50%; top: 42%;
          width: 2.5px; height: 0;
          background: linear-gradient(180deg, rgba(184,134,42,0.8) 0%, rgba(214,173,107,0.2) 100%);
          border-radius: 2px;
          transform-origin: 50% 0%;
          animation: wjSandRayGrow 4s cubic-bezier(.2,.6,.3,1) infinite !important;
        }
        #wanjuan-boot-splash .sand-ray.r1 { --ray-angle: 0deg; --ray-len: 70px; animation-delay: 0s !important; }
        #wanjuan-boot-splash .sand-ray.r2 { --ray-angle: 45deg; --ray-len: 50px; animation-delay: 0.2s !important; }
        #wanjuan-boot-splash .sand-ray.r3 { --ray-angle: 90deg; --ray-len: 70px; animation-delay: 0.4s !important; }
        #wanjuan-boot-splash .sand-ray.r4 { --ray-angle: 135deg; --ray-len: 50px; animation-delay: 0.6s !important; }
        #wanjuan-boot-splash .sand-ray.r5 { --ray-angle: 180deg; --ray-len: 70px; animation-delay: 0.8s !important; }
        #wanjuan-boot-splash .sand-ray.r6 { --ray-angle: 225deg; --ray-len: 50px; animation-delay: 1.0s !important; }
        #wanjuan-boot-splash .sand-ray.r7 { --ray-angle: 270deg; --ray-len: 70px; animation-delay: 1.2s !important; }
        #wanjuan-boot-splash .sand-ray.r8 { --ray-angle: 315deg; --ray-len: 50px; animation-delay: 1.4s !important; }

        /* ===== DARK: Constellation Breathe ===== */
        #wanjuan-boot-splash.boot-theme-dark {
          color: #e0e8f4;
          background:
            radial-gradient(ellipse 70% 55% at 50% 42%, rgba(138,180,248,0.06), transparent 50%),
            linear-gradient(180deg, #16191f 0%, #111418 50%, #0d0f13 100%);
        }
        #wanjuan-boot-splash .dark-stars { position: absolute; inset: 0; }
        #wanjuan-boot-splash .dark-dust {
          position: absolute;
          left: var(--boot-left);
          top: var(--boot-top);
          width: var(--boot-size);
          height: var(--boot-size);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.92) 0%, rgba(188,214,255,0.62) 42%, transparent 72%);
          opacity: 0.38;
          transform: translate3d(-50%, -50%, 0) rotate(var(--boot-rot));
          animation: wjDustTwinkle var(--boot-duration) ease-in-out infinite !important;
          animation-delay: calc(var(--boot-delay) * -1) !important;
        }
        #wanjuan-boot-splash .star-lines {
          position: absolute; inset: 0; width: 100%; height: 100%;
          stroke: rgba(195,220,255,0.36); stroke-width: 1.2; fill: none;
          opacity: 0;
          animation: wjStarLines 6s ease-in-out infinite !important;
        }
        #wanjuan-boot-splash .dark-star {
          position: absolute; border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(185,215,255,0.7) 40%, transparent 70%);
          opacity: 0.2;
        }
        #wanjuan-boot-splash .dark-star.s1 { width: 10px; height: 10px; left: 30%; top: 25%; animation: wjStarBreathe 4.8s ease-in-out infinite !important; }
        #wanjuan-boot-splash .dark-star.s2 { width: 7px; height: 7px; left: 50%; top: 40%; animation: wjStarBreathe 3.6s ease-in-out infinite !important; animation-delay: -1.2s !important; }
        #wanjuan-boot-splash .dark-star.s3 { width: 12px; height: 12px; left: 70%; top: 30%; animation: wjStarBreathe 5.4s ease-in-out infinite !important; animation-delay: -2.4s !important; }
        #wanjuan-boot-splash .dark-star.s4 { width: 8px; height: 8px; left: 45%; top: 65%; animation: wjStarBreathe 4.2s ease-in-out infinite !important; animation-delay: -0.8s !important; }
        #wanjuan-boot-splash .dark-star.s5 { width: 14px; height: 14px; left: 75%; top: 70%; animation: wjStarBreathe 5.8s ease-in-out infinite !important; animation-delay: -3.2s !important; }
        #wanjuan-boot-splash .dark-star.s6 { width: 6px; height: 6px; left: 25%; top: 55%; animation: wjStarBreathe 3.8s ease-in-out infinite !important; animation-delay: -1.8s !important; }
        #wanjuan-boot-splash .dark-star.s7 { width: 5px; height: 5px; left: 80%; top: 55%; animation: wjStarBreathe 4.4s ease-in-out infinite !important; animation-delay: -2.8s !important; }
        #wanjuan-boot-splash .dark-star.s8 { width: 9px; height: 9px; left: 14%; top: 36%; animation: wjStarBreathe 4.6s ease-in-out infinite !important; animation-delay: -1.4s !important; }
        #wanjuan-boot-splash .dark-star.s9 { width: 11px; height: 11px; left: 62%; top: 18%; animation: wjStarBreathe 5.1s ease-in-out infinite !important; animation-delay: -2.0s !important; }
        #wanjuan-boot-splash .dark-star.s10 { width: 8px; height: 8px; left: 88%; top: 30%; animation: wjStarBreathe 4.1s ease-in-out infinite !important; animation-delay: -0.6s !important; }
        #wanjuan-boot-splash .dark-star.s11 { width: 10px; height: 10px; left: 16%; top: 78%; animation: wjStarBreathe 5.6s ease-in-out infinite !important; animation-delay: -3.6s !important; }
        #wanjuan-boot-splash .dark-star.s12 { width: 7px; height: 7px; left: 58%; top: 82%; animation: wjStarBreathe 3.9s ease-in-out infinite !important; animation-delay: -2.2s !important; }

        /* ===== SCROLL STAGE (shared) ===== */
        #wanjuan-boot-splash .wanjuan-scroll-stage {
          position: relative; z-index: 1;
          width: min(440px, calc(100vw - 56px));
          display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 8px 0;
          animation: wjStageIn 520ms cubic-bezier(.2,.8,.2,1) both !important;
        }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-stage {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(50% - 84px);
          gap: 28px;
          margin: 0 auto;
        }
        #wanjuan-boot-splash .wanjuan-scroll { position: relative; width: 372px; max-width: calc(100vw - 80px); height: 142px; display: flex; align-items: center; justify-content: center; }
        #wanjuan-boot-splash:not(.boot-theme-graphite) .wanjuan-scroll { opacity: 0; height: 0; overflow: hidden; pointer-events: none; }
        #wanjuan-boot-splash .wanjuan-scroll-copy { text-align: center; }
        #wanjuan-boot-splash .wanjuan-scroll-title { font-size: 20px; line-height: 1.25; font-weight: 700; }
        #wanjuan-boot-splash .wanjuan-scroll-subtitle { margin-top: 8px; font-size: 13px; line-height: 1.4; opacity: 0.68; }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-copy { text-shadow: 0 1px 14px rgba(5,8,12,0.32); }

        /* Graphite scroll visuals */
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-paper {
          position: relative; z-index: 1; width: 294px; height: 112px; overflow: hidden;
          border: 1px solid rgba(188,202,220,0.42); border-left: 0; border-right: 0;
          background: linear-gradient(90deg, rgba(138,180,248,0.1), #d8e0ea 13%, #c4ceda 50%, #d8e0ea 87%, rgba(138,180,248,0.1)), repeating-linear-gradient(0deg, rgba(36,43,54,0.1) 0 1px, transparent 1px 9px);
          box-shadow: 0 1px 0 rgba(255,255,255,0.52) inset, 0 -1px 0 rgba(31,38,48,0.2) inset, 0 18px 42px rgba(10,14,20,0.24);
          animation: wjPaperOpen 980ms cubic-bezier(.2,.78,.18,1) both !important;
        }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-roll {
          position: relative; z-index: 2; width: 34px; height: 126px; border-radius: 18px;
          background: linear-gradient(90deg, rgba(239,245,252,0.56), #8aa0ba 42%, #4f5c6d 64%, rgba(238,244,250,0.34));
          box-shadow: 0 14px 30px rgba(8,12,18,0.3), 0 0 0 1px rgba(244,248,252,0.32) inset;
          animation: wjRollSettle 980ms cubic-bezier(.2,.78,.18,1) both !important;
        }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-roll.left { margin-right: -2px; }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-roll.right { margin-left: -2px; }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-ink {
          position: absolute; left: 54px; height: 3px; border-radius: 999px;
          background: linear-gradient(90deg, rgba(36,45,58,0.92), rgba(84,118,168,0.58));
          transform-origin: left center; transform: scaleX(0); opacity: 0.9;
          animation: wjInkWrite 1.9s ease-in-out infinite !important;
        }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-ink.ink-one { top: 34px; width: 168px; animation-delay: 720ms !important; }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-ink.ink-two { top: 55px; width: 118px; animation-delay: 920ms !important; }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-ink.ink-three { top: 76px; width: 146px; animation-delay: 1120ms !important; }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-pen {
          position: absolute; z-index: 3; top: 25px; left: 58px; width: 86px; height: 13px; border-radius: 999px;
          background: linear-gradient(90deg, #d9e8ff, #7f98ba 42%, #2f3948);
          box-shadow: 0 6px 14px rgba(7,10,15,0.26), 0 0 0 1px rgba(255,255,255,0.28) inset;
          transform-origin: 88% 50%;
          animation: wjPenWrite 1.9s ease-in-out infinite !important; animation-delay: 720ms !important;
        }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-pen::before {
          content: ""; position: absolute; left: -13px; top: 50%; width: 0; height: 0;
          border-top: 7px solid transparent; border-bottom: 7px solid transparent;
          border-right: 16px solid #d2dceb; transform: translateY(-50%);
        }
        #wanjuan-boot-splash.boot-theme-graphite .wanjuan-scroll-pen::after {
          content: ""; position: absolute; left: -18px; top: 50%; width: 6px; height: 6px;
          border-radius: 50%; background: rgba(23,31,43,0.86); transform: translateY(-50%);
        }

        /* ===== KEYFRAMES ===== */
        @keyframes wjOrbit { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(360deg); } }
        @keyframes wjStageIn { from { opacity: 0; transform: translateY(8px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes wjPaperOpen { 0% { transform: scaleX(0.04); opacity: 0.72; } 58% { opacity: 1; } 100% { transform: scaleX(1); opacity: 1; } }
        @keyframes wjRollSettle { 0% { transform: scaleX(1.18); } 100% { transform: scaleX(1); } }
        @keyframes wjInkWrite { 0%,14% { transform: scaleX(0); opacity: 0; } 34%,74% { transform: scaleX(1); opacity: 0.82; } 100% { transform: scaleX(1); opacity: 0.35; } }
        @keyframes wjPenWrite {
          0%,12% { transform: translate3d(0,0,0) rotate(-14deg); opacity: 0; }
          18% { opacity: 1; } 36% { transform: translate3d(156px,0,0) rotate(-9deg); }
          43% { transform: translate3d(34px,21px,0) rotate(-14deg); } 62% { transform: translate3d(116px,21px,0) rotate(-9deg); }
          69% { transform: translate3d(42px,42px,0) rotate(-14deg); } 86% { transform: translate3d(140px,42px,0) rotate(-9deg); }
          100% { transform: translate3d(140px,42px,0) rotate(-9deg); opacity: 0; }
        }

        /* Rose keyframes */
        @keyframes wjRosePistil { 0%,100% { transform: translate(-50%,-50%) scale(1); box-shadow: 0 0 40px rgba(214,71,111,0.6), 0 0 80px rgba(232,105,154,0.3); } 50% { transform: translate(-50%,-50%) scale(1.2); box-shadow: 0 0 60px rgba(214,71,111,0.8), 0 0 100px rgba(232,105,154,0.4); } }
        @keyframes wjRosePetalOpen {
          0% { opacity: 0; transform: rotate(var(--petal-angle)) translateY(-12px) scale(0.2); }
          20% { opacity: 0.92; transform: rotate(var(--petal-angle)) translateY(-52px) scale(0.85); }
          50% { opacity: 0.95; transform: rotate(var(--petal-angle)) translateY(-68px) scale(1); }
          80% { opacity: 0.7; transform: rotate(var(--petal-angle)) translateY(-74px) scale(1.02); }
          100% { opacity: 0; transform: rotate(var(--petal-angle)) translateY(-80px) scale(0.9); }
        }
        @keyframes wjRoseRing {
          0% { transform: scale(0.3); opacity: 0.7; border-color: rgba(214,71,111,0.5); }
          100% { transform: scale(2.8); opacity: 0; border-color: rgba(214,71,111,0.02); }
        }

        /* Sky keyframes */
        @keyframes wjSkySun { 0%,100% { transform: translate(-50%,-50%) scale(1); box-shadow: 0 0 40px rgba(240,200,80,0.5), 0 0 80px rgba(240,200,80,0.25); } 50% { transform: translate(-50%,-50%) scale(1.08); box-shadow: 0 0 56px rgba(240,200,80,0.65), 0 0 100px rgba(240,200,80,0.35); } }
        @keyframes wjSkyCloudDrift {
          0% { transform: translateX(0); opacity: 0.85; }
          50% { transform: translateX(20px); opacity: 0.95; }
          100% { transform: translateX(0); opacity: 0.85; }
        }

        /* Green keyframes */
        @keyframes wjSeedFall {
          0% { opacity: 1; transform: translate(-50%, -170px) scale(0.8); }
          16% { opacity: 1; transform: translate(-50%, -14px) scale(1); }
          22% { opacity: 1; transform: translate(-50%, -4px) scale(0.9); }
          30%,100% { opacity: 0; transform: translate(-50%, -4px) scale(0.6); }
        }
        @keyframes wjSoilAppear {
          0%,14% { transform: translate(-50%, 0) scaleX(0); opacity: 0; }
          22% { transform: translate(-50%, 0) scaleX(1.2); opacity: 1; }
          28%,80% { transform: translate(-50%, 0) scaleX(1); opacity: 0.8; }
          100% { transform: translate(-50%, 0) scaleX(1); opacity: 0; }
        }
        @keyframes wjStemGrow {
          0%,20% { height: 0; opacity: 0; }
          25% { height: 0; opacity: 1; }
          55% { height: 88px; opacity: 1; }
          80% { height: 88px; opacity: 0.8; }
          100% { height: 88px; opacity: 0; }
        }
        @keyframes wjBranchGrow {
          0%,40% { height: 0; opacity: 0; }
          45% { height: 0; opacity: 0.9; }
          65% { height: 35px; opacity: 0.9; }
          80% { height: 35px; opacity: 0.6; }
          100% { height: 35px; opacity: 0; }
        }
        @keyframes wjLeafUnfurl {
          0%,44% { opacity: 0; transform: scale(0); }
          55% { opacity: 1; transform: scale(1.3); }
          65%,78% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1); }
        }

        /* Sand keyframes */
        @keyframes wjSandSun { 0%,100% { transform: translate(-50%,-50%) scale(1); box-shadow: 0 0 44px rgba(184,134,42,0.6), 0 0 88px rgba(214,173,107,0.3); } 50% { transform: translate(-50%,-50%) scale(1.15); box-shadow: 0 0 64px rgba(184,134,42,0.8), 0 0 120px rgba(214,173,107,0.4); } }
        @keyframes wjSandRayGrow {
          0% { height: 0; opacity: 0; transform: rotate(var(--ray-angle, 0deg)) translateX(-50%) translateY(-20px); }
          20% { opacity: 0.85; }
          50% { height: var(--ray-len, 56px); opacity: 0.85; transform: rotate(var(--ray-angle, 0deg)) translateX(-50%) translateY(-20px); }
          80% { height: var(--ray-len, 56px); opacity: 0.4; }
          100% { height: var(--ray-len, 56px); opacity: 0; transform: rotate(var(--ray-angle, 0deg)) translateX(-50%) translateY(-20px); }
        }

        /* Dark keyframes */
        @keyframes wjStarBreathe { 0%,100% { opacity: 0.1; transform: scale(0.7); box-shadow: none; } 50% { opacity: 1; transform: scale(1.3); box-shadow: 0 0 20px rgba(185,215,255,0.6); } }
        @keyframes wjStarLines { 0%,100% { opacity: 0; } 30%,70% { opacity: 1; } }
        @keyframes wjDustTwinkle {
          0%,100% { opacity: 0.22; transform: translate3d(-50%, -50%, 0) translateX(0) scale(0.78); }
          50% { opacity: 0.72; transform: translate3d(-50%, -50%, 0) translateX(var(--boot-drift)) scale(1.12); }
        }
      `;      (document.head || root).appendChild(style);
      ensureSplash();
    } catch (error) {
      console.warn("boot stability style skipped", error);
    }
  };
  install();
}

function applyInitialThemeClass(theme = "graphite") {
  try {
    const root = document.documentElement;
    if (!root) return;
    root.classList.remove(
      "theme-dark",
      "theme-light",
      "theme-warm-light",
      "theme-mist-blue",
      "theme-chrome-blue",
      "theme-chrome-rose",
      "theme-chrome-sand",
      "theme-chrome-teal",
      "theme-sage-green",
      "theme-graphite"
    );
    root.classList.add(`theme-${theme || "graphite"}`);
  } catch (error) {
    console.warn("initial theme class apply skipped", error);
  }
}

// 判断某个存储值是否“有内容”（数组非空 / 字符串非空白 / 对象有键 / 非 null）。
// 源 preload.cjs 行 1277，被 legacy-data 的恢复逻辑复用。
function hasStoredValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== undefined && value !== null;
}

module.exports = {
  mergeRecoveredApiConfigs,
  clearLegacyThemeStorage,
  appendRendererDebugLog,
  resolveBootThemeMode,
  normalizeBootThemeFromStore,
  mirrorBootThemeMode,
  mirrorBootThemeFromStore,
  resolveBootThemeModeAsync,
  buildBootParticleMarkup,
  installBootStabilityStyle,
  applyInitialThemeClass,
  hasStoredValue,
};

var { normalizeThemeValue } = require("./legacy-data.cjs");
var { getDesktopStorageItems } = require("./storage.cjs");
