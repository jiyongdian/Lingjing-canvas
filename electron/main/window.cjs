// 主窗口创建与生命周期：窗口外观、全屏快捷键、外链拦截、渲染崩溃恢复、
// 启动遮罩揭示时机、桌面端 CSS 注入与可选自测注入。
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, shell, dialog } = require("./electron-refs.cjs");
const { TEST_CONTEXT_ISOLATION, TEST_PROXY_FETCH_SELFTEST, TEST_PROXY_FETCH_SELFTEST_URL } = require("./config.cjs");
const { appendDesktopLog, formatErrorMessage, truncateLogValue } = require("./logging.cjs");
const { isSafeExternalUrl } = require("./net/security.cjs");
const { loadTextApiSelfTestConfig } = require("./self-test.cjs");

function createMainWindow(baseUrl) {
  let isRecoveringRenderer = false;
  let blankScreenHits = 0;
  let blankScreenTimer = null;
  const recoverRenderer = (reason, details) => {
    if (isRecoveringRenderer || win.isDestroyed()) return;
    isRecoveringRenderer = true;
    console.error("recover-renderer", { reason, details });
    appendDesktopLog("recover-renderer", { reason, details });
    setTimeout(() => {
      if (win.isDestroyed()) return;
      blankScreenHits = 0;
      hasRevealedContent = false;
      desktopCssInjected = false;
      win.webContents.reloadIgnoringCache();
      win.webContents.loadURL(`${baseUrl}/index.html`).catch((error) => {
        console.error("recover-renderer loadURL failed", error);
        appendDesktopLog("recover-renderer-load-failed", {
          message: String(error?.message || error)
        });
      }).finally(() => {
        revealWindowWhenStable("recover-renderer").catch((error) => {
          appendDesktopLog("recover-renderer-reveal-failed", { message: String(error?.message || error) });
          showWindowShell("recover-renderer-reveal-failed");
        });
        isRecoveringRenderer = false;
      });
    }, 800);
  };

  const win = new BrowserWindow({
    title: " ",
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 18 },
    backgroundColor: "#0c1021",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      contextIsolation: TEST_CONTEXT_ISOLATION,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  });

  let hasShownWindow = false;
  let hasRevealedContent = false;
  let hasRunProxyFetchSelfTest = false;
  let hasRunTextApiSelfTest = false;
  const runProxyFetchSelfTest = async () => {
    if (!TEST_PROXY_FETCH_SELFTEST || hasRunProxyFetchSelfTest || win.isDestroyed()) return;
    hasRunProxyFetchSelfTest = true;
    try {
      const result = await win.webContents.executeJavaScript(`
        (async () => {
          if (typeof window.wanjuanDesktop?.proxyFetch !== 'function') {
            return { ok: false, error: 'proxyFetch bridge missing' };
          }
          const testRequest = window.wanjuanDesktop.proxyFetch({
            url: ${JSON.stringify(TEST_PROXY_FETCH_SELFTEST_URL)},
            method: 'GET',
            headers: { accept: 'text/html' },
            requestTimeout: 8000
          });
          const timeout = new Promise((resolve) => setTimeout(() => {
            resolve({ ok: false, error: 'proxyFetch self-test timed out' });
          }, 12000));
          const response = await Promise.race([testRequest, timeout]);
          return {
            ok: !!response?.ok,
            url: ${JSON.stringify(TEST_PROXY_FETCH_SELFTEST_URL)},
            status: response?.status || 0,
            error: response?.error || '',
            bodyBytes: response?.bodyBase64 ? response.bodyBase64.length : 0
          };
        })();
      `, true);
      appendDesktopLog("proxy-fetch-self-test", result);
    } catch (error) {
      appendDesktopLog("proxy-fetch-self-test", {
        ok: false,
        error: formatErrorMessage(error)
      });
    }
  };
  const runTextApiSelfTest = async () => {
    if (!TEST_TEXT_API_BACKUP_PATH || hasRunTextApiSelfTest || win.isDestroyed()) return;
    hasRunTextApiSelfTest = true;
    try {
      const config = loadTextApiSelfTestConfig();
      const url = `${config.baseUrl}/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
      const requestBody = {
        contents: [{ role: "user", parts: [{ text: "请只回复两个字：通过" }] }],
        generationConfig: { maxOutputTokens: 32, temperature: 0 }
      };
      const result = await win.webContents.executeJavaScript(`
        (async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 25000);
          const startedAt = Date.now();
          try {
            const response = await window.fetch(${JSON.stringify(url)}, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-goog-api-key': ${JSON.stringify(config.key)}
              },
              body: ${JSON.stringify(JSON.stringify(requestBody))},
              signal: controller.signal
            });
            const text = await response.text();
            let parsed = null;
            try { parsed = JSON.parse(text); } catch {}
            const answer = parsed?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
            return {
              ok: response.ok,
              status: response.status,
              durationMs: Date.now() - startedAt,
              answer: answer.slice(0, 20),
              bodyPreview: answer ? '' : text.slice(0, 180),
              usedMainWorldFetchProxy: window.__wanjuanMainWorldFetchProxyInstalled === true
            };
          } catch (error) {
            return {
              ok: false,
              error: String(error?.name || 'Error') + ': ' + String(error?.message || error),
              durationMs: Date.now() - startedAt,
              usedMainWorldFetchProxy: window.__wanjuanMainWorldFetchProxyInstalled === true
            };
          } finally {
            clearTimeout(timer);
          }
        })();
      `, true);
      appendDesktopLog("text-api-self-test", {
        ...result,
        configId: config.configId,
        model: config.model,
        baseUrl: config.baseUrl
      });
    } catch (error) {
      appendDesktopLog("text-api-self-test", {
        ok: false,
        error: formatErrorMessage(error)
      });
    }
  };
  const showWindowShell = (reason = "unknown") => {
    if (hasShownWindow || win.isDestroyed()) return;
    hasShownWindow = true;
    appendDesktopLog("window-shell-shown", { reason });
    win.show();
    win.focus();
  };
  const revealWindowWhenStable = async (reason = "unknown") => {
    if (hasRevealedContent || win.isDestroyed()) return;
    const startedAt = Date.now();
    const maxWaitMs = 12000;
    const settleMs = 420;
    let stableSince = 0;
    let lastStatus = null;

    while (!hasRevealedContent && !win.isDestroyed() && Date.now() - startedAt < maxWaitMs) {
      try {
        const status = await win.webContents.executeJavaScript(`
          (() => {
            const root = document.getElementById('root');
            const text = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
            const hasMainNav = /(灵境画布|万卷灵境)/.test(text) && /资源/.test(text) && /智能体/.test(text) && /设置/.test(text);
            const isLoading = /^Loading\\.\\.\\.$/.test(text) || text === 'Loading...';
            const rootRect = root?.getBoundingClientRect?.();
            return {
              readyState: document.readyState,
              appReady: document.documentElement.dataset.wanjuanAppReady === 'true',
              projectId: document.documentElement.dataset.wanjuanProjectId || '',
              themeMode: document.documentElement.dataset.wanjuanThemeMode || '',
              desktopBridge: {
                hasProxyFetch: typeof window.wanjuanDesktop?.proxyFetch === 'function',
                hasAbortProxyFetch: typeof window.wanjuanDesktop?.abortProxyFetch === 'function',
                hasSaveDownload: typeof window.wanjuanDesktop?.saveDownload === 'function',
                hasUploadPublicMedia: typeof window.wanjuanDesktop?.uploadPublicMedia === 'function',
                hasMainWorldFetchProxy: window.__wanjuanMainWorldFetchProxyInstalled === true
              },
              hasMainNav,
              isLoading,
              rootChildren: root?.childElementCount || 0,
              rootWidth: Math.round(rootRect?.width || 0),
              rootHeight: Math.round(rootRect?.height || 0)
            };
          })();
        `, true);
        lastStatus = status;

        const baseReady =
          status &&
          (status.readyState === "interactive" || status.readyState === "complete") &&
          status.hasMainNav &&
          !status.isLoading &&
          status.rootChildren > 0 &&
          status.rootWidth > 200 &&
          status.rootHeight > 200;
        const ready = baseReady && status.appReady;

        if (ready) {
          if (!stableSince) stableSince = Date.now();
          if (Date.now() - stableSince >= settleMs) break;
        } else {
          stableSince = 0;
        }
      } catch (error) {
        stableSince = 0;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (hasRevealedContent || win.isDestroyed()) return;
    hasRevealedContent = true;
    try {
      await win.webContents.executeJavaScript(`
        (() => {
          document.documentElement.classList.remove('wanjuan-booting');
          document.documentElement.dataset.wanjuanBootReady = 'true';
        })();
      `, true);
    } catch {}
    appendDesktopLog("window-revealed", {
      reason,
      waitMs: Date.now() - startedAt,
      status: lastStatus
    });
    runProxyFetchSelfTest().catch(() => {});
    runTextApiSelfTest().catch(() => {});
    showWindowShell("reveal-content");
  };

  appendDesktopLog("desktop-web-preferences", {
    contextIsolation: TEST_CONTEXT_ISOLATION,
    nodeIntegration: false,
    sandbox: false,
    webSecurity: false,
    mode: TEST_CONTEXT_ISOLATION ? "context-isolation-test" : "compat"
  });

  const checkForBlankScreen = async () => {
    if (win.isDestroyed() || win.webContents.isLoadingMainFrame()) return;
    try {
      const status = await win.webContents.executeJavaScript(`
        (() => {
          const isVisible = (el) => {
            if (!(el instanceof Element)) return false;
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
            const rect = el.getBoundingClientRect();
            return rect.width >= 8 && rect.height >= 8;
          };
          const visibleText = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
          const contentMarkers = /灵境画布|万卷灵境|资源|设置|任务清单|上传|空节点|点击配置|果汁|赞面包/.test(visibleText);
          const structuralMarkers = Boolean(
            document.querySelector('.react-flow, .react-flow__pane, [data-testid], canvas, video, img, input, textarea, select')
          );
          const visibleControls = Array.from(document.querySelectorAll('button, a, [role="button"], [role="tab"], [role="menuitem"]'))
            .filter(isVisible)
            .length;
          const root = document.getElementById('root');
          const rootRect = root?.getBoundingClientRect?.();
          return {
            url: location.href,
            readyState: document.readyState,
            textLength: visibleText.length,
            visibleText: visibleText.slice(0, 240),
            contentMarkers,
            structuralMarkers,
            visibleControls,
            rootChildren: root?.childElementCount || 0,
            rootWidth: Math.round(rootRect?.width || 0),
            rootHeight: Math.round(rootRect?.height || 0),
            bodyBg: getComputedStyle(document.body).backgroundColor
          };
        })();
      `, true);

      const looksBlank =
        status &&
        status.readyState === "complete" &&
        status.rootWidth > 200 &&
        status.rootHeight > 200 &&
        !status.contentMarkers &&
        (!status.structuralMarkers || status.visibleControls <= 3);

      if (looksBlank) {
        blankScreenHits += 1;
        appendDesktopLog("blank-screen-hit", { hits: blankScreenHits, status });
        if (blankScreenHits >= 2) {
          recoverRenderer("blank-screen-watchdog", status);
        }
        return;
      }
      blankScreenHits = 0;
    } catch (error) {
      appendDesktopLog("blank-screen-check-failed", {
        message: String(error?.message || error)
      });
    }
  };

  win.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    console.error("did-fail-load", { errorCode, errorDescription, validatedURL });
    recoverRenderer("did-fail-load", { errorCode, errorDescription, validatedURL });
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("render-process-gone", details);
    recoverRenderer("render-process-gone", details);
  });
  win.webContents.on("unresponsive", () => {
    recoverRenderer("unresponsive");
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log("renderer-console", { level, message: truncateLogValue(message), line, sourceId });
    appendDesktopLog("renderer-console", { level, message, line, sourceId });
  });
  win.webContents.on("did-finish-load", () => {
    blankScreenHits = 0;
    if (!blankScreenTimer) blankScreenTimer = setInterval(checkForBlankScreen, 5000);
    setTimeout(checkForBlankScreen, 6000);
  });
  win.webContents.once("dom-ready", () => {
    showWindowShell("boot-dom-ready");
  });
  win.webContents.on("before-input-event", (event, input) => {
    const isNativeFullScreen =
      typeof win.isFullScreen === "function" && win.isFullScreen();
    const isSimpleFullScreen =
      typeof win.isSimpleFullScreen === "function" && win.isSimpleFullScreen();

    if (input.type !== "keyDown") return;
    const key = String(input.key || "");
    const isToggleFullScreenShortcut =
      key === "F11" ||
      (process.platform === "darwin" &&
        key.toLowerCase() === "f" &&
        input.control &&
        input.meta &&
        !input.alt);

    if (isToggleFullScreenShortcut) {
      event.preventDefault();
      if (typeof win.setFullScreen === "function") {
        win.setFullScreen(!isNativeFullScreen);
        return;
      }
      if (typeof win.setSimpleFullScreen === "function") {
        win.setSimpleFullScreen(!isSimpleFullScreen);
      }
      return;
    }

    if (key === "Escape" && (isNativeFullScreen || isSimpleFullScreen)) {
      event.preventDefault();
      if (isNativeFullScreen && typeof win.setFullScreen === "function") {
        win.setFullScreen(false);
      }
      if (isSimpleFullScreen && typeof win.setSimpleFullScreen === "function") {
        win.setSimpleFullScreen(false);
      }
    }
  });
  win.on("closed", () => {
    if (blankScreenTimer) clearInterval(blankScreenTimer);
    blankScreenTimer = null;
  });

  win.loadURL(`${baseUrl}/index.html`).catch((e) => {
    console.error("loadURL failed", e);
    appendDesktopLog("loadURL-failed", { message: String(e?.message || e) });
  });
  win.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    win.setTitle(" ");
  });
  win.setTitle(" ");
  win.once("ready-to-show", () => {
    showWindowShell("ready-to-show");
    revealWindowWhenStable("ready-to-show").catch((error) => {
      appendDesktopLog("window-reveal-failed", { message: String(error?.message || error) });
      showWindowShell("reveal-failed");
    });
  });
  setTimeout(() => {
    showWindowShell("fallback-timeout");
    revealWindowWhenStable("fallback-timeout").catch(() => {
      showWindowShell("reveal-fallback-failed");
    });
  }, 2200);

  // Helpful for debugging blank screen. Enable by launching with WANJUAN_DEBUG=1
  if (process.env.WANJUAN_DEBUG === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }

  // Desktop-only UI polish via CSS overrides (no logic changes).
  const cssPath = path.join(__dirname, "ui-overrides.css");
  let desktopCssInjected = false;
  const injectDesktopCss = async () => {
    if (desktopCssInjected || win.isDestroyed()) return;
    try {
      const css = fs.readFileSync(cssPath, "utf8");
      await win.webContents.insertCSS(css);
      desktopCssInjected = true;
    } catch {
      // Ignore missing CSS (keep app functional)
    }
  };
  win.webContents.on("did-start-loading", () => {
    desktopCssInjected = false;
  });
  win.webContents.on("dom-ready", () => {
    injectDesktopCss();
  });
  win.webContents.on("did-finish-load", async () => {
    await injectDesktopCss();
    if (TEST_CONTEXT_ISOLATION) return;
    try {
      await win.webContents.executeJavaScript(`
        (() => {
          const chromeObj = window.chrome || {};

          chromeObj.runtime ||= {};
          chromeObj.runtime.id ||= 'desktop';
          chromeObj.runtime.sendMessage ||= async () => {};
          chromeObj.runtime.getURL ||= (p) => 'file://' + p;
          window.chrome = chromeObj;

          const labels = ['开发模式：模拟进入', '模拟进入'];
          const findClickable = () => {
            const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"]'));
            for (const label of labels) {
              const target = candidates.find((el) => {
                const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
                return text && (text === label || text.includes(label));
              });
              if (!target) continue;
              const hidden = target.closest("[data-wanjuan-desktop-hidden='true']");
              if (hidden) continue;
              return target.closest('button, a, [role="button"], [role="menuitem"]') || target;
            }
            return null;
          };

          const clickOnce = () => {
            const el = findClickable();
            if (!el) return false;
            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            el.click?.();
            return true;
          };

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => clickOnce(), { once: true });
          }
          let attempts = 0;
          const timer = window.setInterval(() => {
            if (clickOnce() || ++attempts > 40) window.clearInterval(timer);
          }, 250);

          const isNodeTextScrollTarget = (target) => {
            if (!(target instanceof Element)) return false;
            const textTarget = target.closest('textarea, [contenteditable="true"]');
            if (textTarget?.closest('.react-flow__node')) return true;
            const scrollTarget = target.closest(
              '.react-flow__node .custom-scrollbar, .react-flow__node [class*="overflow-y-auto"], .react-flow__node [class*="overflow-auto"]'
            );
            return Boolean(scrollTarget);
          };

          const markNodeTextScrollTargets = () => {
            document
              .querySelectorAll(
                '.react-flow__node textarea, .react-flow__node [contenteditable="true"], .react-flow__node .custom-scrollbar, .react-flow__node [class*="overflow-y-auto"], .react-flow__node [class*="overflow-auto"]'
              )
              .forEach((el) => {
                if (!el.classList.contains('nowheel')) el.classList.add('nowheel');
                if (!el.classList.contains('nopan')) el.classList.add('nopan');
              });
          };

          const keepWheelInsideNodeText = (event) => {
            if (!isNodeTextScrollTarget(event.target)) return;
            event.stopPropagation();
          };

          const isEditableSelectionTarget = (target) => {
            if (!(target instanceof Element)) return false;
            return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .wanjuan-allow-text-select'));
          };

          const isNativeSelectionGuardTarget = (target) => {
            if (!(target instanceof Element) || isEditableSelectionTarget(target)) return false;
            return Boolean(target.closest('.react-flow, .react-flow__pane, .react-flow__viewport, .react-flow__renderer, .react-flow__panel, .wanjuan-app-top-nav, .wanjuan-resource-toolbar, button, [role="button"], [role="tab"], [role="menuitem"]'));
          };

          const clearNativeSelection = () => {
            try {
              const selection = window.getSelection?.();
              selection?.removeAllRanges?.();
            } catch {}
          };

          let nativeSelectionGuardActive = false;
          const enableNativeSelectionGuard = () => {
            nativeSelectionGuardActive = true;
            document.documentElement.classList.add('wanjuan-native-selection-guard');
            document.documentElement.classList.add('wanjuan-canvas-dragging');
            clearNativeSelection();
          };

          const disableNativeSelectionGuard = () => {
            if (!nativeSelectionGuardActive) return;
            nativeSelectionGuardActive = false;
            document.documentElement.classList.remove('wanjuan-native-selection-guard');
            document.documentElement.classList.remove('wanjuan-canvas-dragging');
            window.setTimeout(clearNativeSelection, 0);
          };

          window.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || !isNativeSelectionGuardTarget(event.target)) return;
            enableNativeSelectionGuard();
          }, { capture: true });
          window.addEventListener('pointerup', disableNativeSelectionGuard, { capture: true });
          window.addEventListener('pointercancel', disableNativeSelectionGuard, { capture: true });
          window.addEventListener('blur', disableNativeSelectionGuard);
          window.addEventListener('selectstart', (event) => {
            if (!nativeSelectionGuardActive || isEditableSelectionTarget(event.target)) return;
            event.preventDefault();
            clearNativeSelection();
          }, { capture: true });

          let markQueued = false;
          const queueMarkNodeTextScrollTargets = () => {
            if (markQueued) return;
            markQueued = true;
            window.setTimeout(() => {
              markQueued = false;
              markNodeTextScrollTargets();
            }, 200);
          };

	          markNodeTextScrollTargets();
	          new MutationObserver(queueMarkNodeTextScrollTargets).observe(document.body || document.documentElement, {
	            childList: true,
	            subtree: true,
	          });
	          window.addEventListener('wheel', keepWheelInsideNodeText, { capture: true, passive: false });

              const getElementText = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
              const findTextElement = (selector, matcher) =>
                Array.from(document.querySelectorAll(selector)).find((el) => matcher(getElementText(el)));
              const findVideoEditorRoot = () => {
                const title = findTextElement('span, div', (text) => text.includes('视频剪辑台'));
                return title?.closest('[role="dialog"], [class*="fixed"], body > div') || title?.parentElement || null;
              };
              const refreshVideoEditorControls = () => {
                const root = findVideoEditorRoot();
                if (!root) return;

                const previewSizeTextPattern = new RegExp('^预览画面\\\\s+\\\\d+%$');
                const timelineStatusTextPattern = new RegExp('^\\\\d{2}:\\\\d{2}\\\\.\\\\d\\\\s*/\\\\s*\\\\d{2}:\\\\d{2}\\\\.\\\\d$');
                Array.from(root.querySelectorAll('span, div')).forEach((el) => {
                  const text = getElementText(el);
                  if (previewSizeTextPattern.test(text) || timelineStatusTextPattern.test(text)) {
                    el.style.display = 'none';
                    el.setAttribute('aria-hidden', 'true');
                    el.dataset.wanjuanHiddenPreviewSize = 'true';
                  }
                });

                const monitorLabel = findTextElement('span, div', (text) => text.startsWith('节目监视器'));
                if (!monitorLabel || !root.contains(monitorLabel)) return;
                const header = monitorLabel.parentElement;
                if (!header || header.querySelector('[data-wanjuan-video-play-toggle="true"]')) return;

                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.wanjuanVideoPlayToggle = 'true';
                button.title = '播放/暂停';
                button.setAttribute('aria-label', '播放/暂停');
                button.textContent = '▶';
                Object.assign(button.style, {
                  marginLeft: '8px',
                  marginRight: 'auto',
                  width: '28px',
                  height: '28px',
                  borderRadius: '999px',
                  border: '1px solid rgba(255,255,255,0.16)',
                  background: 'rgba(37,99,235,0.92)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  lineHeight: '1',
                  boxShadow: '0 8px 20px rgba(37,99,235,0.24)'
                });

                const syncButton = () => {
                  const video = root.querySelector('video');
                  button.textContent = video && !video.paused ? '⏸' : '▶';
                };
                button.addEventListener('click', async (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const video = root.querySelector('video');
                  if (!video) return;
                  try {
                    if (video.paused) await video.play();
                    else video.pause();
                  } catch (error) {
                    console.warn('Video editor play toggle skipped', error);
                  } finally {
                    syncButton();
                  }
                });
                root.addEventListener('play', syncButton, true);
                root.addEventListener('pause', syncButton, true);
                header.insertBefore(button, monitorLabel.nextSibling);
                syncButton();
              };

              let videoEditorQueued = false;
              const queueVideoEditorControls = () => {
                if (videoEditorQueued) return;
                videoEditorQueued = true;
                window.setTimeout(() => {
                  videoEditorQueued = false;
                  refreshVideoEditorControls();
                }, 120);
              };
              refreshVideoEditorControls();
              new MutationObserver(queueVideoEditorControls).observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                characterData: true,
              });
		        })();
		      `);
    } catch {
      // Ignore script injection failures (keep app functional)
    }

  });

  // Safer default: open external links in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(baseUrl)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) shell.openExternal(url).catch(() => {});
    }
  });
}


module.exports = { createMainWindow };
