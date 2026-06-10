// 桌面环境补丁域：注入 Chrome shim、项目重命名/切换器、画布压力计、性能档位面板、生成结果自动下载、即梦官方图标与即梦天玑(Tianji)设置面板等渲染进程 DOM 补丁。
const { ipcRenderer } = require("./runtime.cjs");
const { PERFORMANCE_PROFILE_STORAGE_KEY, PERFORMANCE_PROFILE_PRESETS } = require("./constants.cjs");

function installDesktopPatches() {
  if (typeof window !== "undefined") {
    installChromeShim();
  }

  const hideByText = (label) => {
    const safeHide = (wrapper) => {
      if (
        !wrapper ||
        !(wrapper instanceof HTMLElement) ||
        wrapper.id === "root" ||
        wrapper === document.body ||
        wrapper === document.documentElement
      ) {
        return;
      }
      wrapper.style.display = "none";
      wrapper.setAttribute("data-wanjuan-desktop-hidden", "true");
    };

    // 1) Actionable controls
    /** @type {Element[]} */
    const actionable = Array.from(
      document.querySelectorAll("button, a, [role='button'], [role='menuitem'], [role='tab']")
    );
    for (const el of actionable) {
      const text = (el.textContent || "").trim();
      if (!text) continue;
      if (text === label || text.includes(label)) {
        const wrapper = el.closest("li") || el.closest("[role='menuitem']") || el;
        safeHide(wrapper);
      }
    }

    // Avoid hiding broad containers here; the desktop shell only needs to hide
    // the specific extension-only navigation controls.
  };

  const autoClickByText = (labels) => {
    /** @type {Element[]} */
    const candidates = Array.from(document.querySelectorAll("body *"));
    for (const label of labels) {
      const target = candidates.find((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        return text && (text === label || text.includes(label));
      });
      if (!target) continue;
      const hidden = target.closest("[data-wanjuan-desktop-hidden='true']");
      if (hidden) continue;
      const clickable =
        target.closest("button, a, [role='button'], [role='menuitem']") ||
        target.closest("li") ||
        target;
      if (!(clickable instanceof HTMLElement)) continue;
      clickable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
      clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      clickable.click?.();
      return true;
    }
    return false;
  };

  const hideSettingsCardByTitle = (title) => {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"));
    for (const heading of headings) {
      const text = (heading.textContent || "").replace(/\s+/g, " ").trim();
      if (!text.includes(title)) continue;
      const card = heading.closest(".group");
      if (card instanceof HTMLElement) {
        card.style.display = "none";
        card.setAttribute("data-wanjuan-desktop-hidden", "true");
      }
    }
  };

  const installSettingsUpdateButton = () => {
    if (document.querySelector("[data-wanjuan-check-updates]")) return true;
    const labels = Array.from(document.querySelectorAll("label"));
    const versionLabel = labels.find((label) => (label.textContent || "").replace(/\s+/g, " ").trim() === "当前版本");
    const field = versionLabel?.parentElement;
    const row = field?.querySelector(".wanjuan-settings-readonly-row");
    if (!(row instanceof HTMLElement)) return false;

    const trailing = row.lastElementChild;
    const actions = document.createElement("div");
    actions.setAttribute("data-wanjuan-update-actions", "true");
    actions.style.display = "flex";
    actions.style.alignItems = "center";
    actions.style.gap = "12px";
    actions.style.marginLeft = "auto";

    if (trailing instanceof HTMLElement) {
      trailing.style.whiteSpace = "nowrap";
      actions.appendChild(trailing);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "检查更新";
    button.className = "wanjuan-settings-button wanjuan-check-updates-button";
    button.setAttribute("data-wanjuan-check-updates", "true");
    button.style.cssText = [
      "appearance:none",
      "cursor:pointer"
    ].join(";");
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.style.opacity = ".65";
      button.style.cursor = "wait";
      button.textContent = "检查中…";
      try {
        await ipcRenderer.invoke("wanjuan:check-for-updates");
      } catch (error) {
        console.warn("check for updates failed", error);
      } finally {
        button.disabled = false;
        button.style.opacity = "1";
        button.style.cursor = "pointer";
        button.textContent = "检查更新";
      }
    });
    actions.appendChild(button);
    row.appendChild(actions);
    return true;
  };

  const getProjectControls = () => {
    const nameButton = document.querySelector("button[title='双击重命名项目'], button[title='点击重命名项目']");
    const select = document.querySelector("select[title='切换项目']");
    if (!(nameButton instanceof HTMLButtonElement) || !(select instanceof HTMLSelectElement)) {
      return null;
    }
    return { nameButton, select };
  };

  const syncProjectNameFromStorage = async () => {
    const controls = getProjectControls();
    if (!controls) return false;

    const { nameButton, select } = controls;
    const store = await getDesktopStorageItems(["projects"]);
    const projects = Array.isArray(store.projects) ? store.projects : [];
    const current = projects.find((project) => project.id === select.value);
    if (!current?.name) return false;

    nameButton.textContent = current.name;
    const option = Array.from(select.options).find((item) => item.value === select.value);
    if (option) option.textContent = current.name;
    const comboLabel = document.querySelector(".wanjuan-project-combo-label");
    if (comboLabel instanceof HTMLElement) comboLabel.textContent = current.name;
    return true;
  };

  const beginInlineProjectRename = () => {
    const controls = getProjectControls();
    if (!controls) return;

    const { nameButton, select } = controls;
    if (nameButton.dataset.renaming === "true") return;
    nameButton.dataset.renaming = "true";

    const projectId = select.value || "default";
    const currentName = (nameButton.textContent || "").trim() || "未命名项目";
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentName;
    input.className = nameButton.className;
    input.title = "输入项目名称，回车保存";
    input.style.height = `${nameButton.offsetHeight || 32}px`;
    input.style.boxSizing = "border-box";

    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      const nextName = input.value.trim();
      const finalName = save && nextName ? nextName : currentName;
      if (save && nextName) {
        saveProjectName(projectId, finalName);
        const option = Array.from(select.options).find((item) => item.value === projectId);
        if (option) option.textContent = finalName;
      }
      nameButton.textContent = finalName;
      nameButton.style.display = "";
      nameButton.dataset.renaming = "false";
      input.remove();
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
  }
});
    input.addEventListener("blur", () => finish(true), { once: true });

    nameButton.style.display = "none";
    nameButton.insertAdjacentElement("afterend", input);
    input.focus();
    input.select();
  };

  const markCanvasModelToolbar = () => {
    const select = document.querySelector("select[title='切换项目']");
    if (!(select instanceof HTMLSelectElement)) return;

    const leftGroup = select.parentElement;
    const toolbar = leftGroup?.parentElement;
    if (!(leftGroup instanceof HTMLElement) || !(toolbar instanceof HTMLElement)) return;

    const projectButton = leftGroup.querySelector("button[title='双击重命名项目'], button[title='点击重命名项目']");
    const addButton = leftGroup.querySelector("button[title='新建项目']");
    const deleteButton = leftGroup.querySelector("button[title='删除当前项目']");
    const taskButton = Array.from(toolbar.querySelectorAll("button")).find((button) =>
      (button.textContent || "").replace(/\s+/g, " ").trim().includes("任务清单")
    );

    toolbar.classList.add("wanjuan-canvas-model-toolbar");
    leftGroup.classList.add("wanjuan-canvas-model-toolbar-left");
    select.classList.add("wanjuan-canvas-model-toolbar-select");
    if (projectButton instanceof HTMLElement) projectButton.classList.add("wanjuan-canvas-model-toolbar-project");
    if (addButton instanceof HTMLElement) addButton.classList.add("wanjuan-canvas-model-toolbar-icon", "is-add");
    if (deleteButton instanceof HTMLElement) deleteButton.classList.add("wanjuan-canvas-model-toolbar-icon", "is-delete");
    if (taskButton instanceof HTMLElement) taskButton.classList.add("wanjuan-canvas-model-toolbar-task");
    installMergedProjectSwitcher(leftGroup, projectButton, select);
  };

  const projectComboMenuSignature = (select) => {
    const parts = [`active:${select.value || ""}`];
    Array.from(select.children).forEach((child) => {
      if (child instanceof HTMLOptGroupElement) {
        parts.push(`group:${child.label || ""}`);
        Array.from(child.children).forEach((option) => {
          if (option instanceof HTMLOptionElement) parts.push(`option:${option.value}:${option.textContent || ""}`);
        });
      } else if (child instanceof HTMLOptionElement) {
        parts.push(`option:${child.value}:${child.textContent || ""}`);
      }
    });
    return parts.join("|");
  };

  const buildProjectComboMenu = (combo, select, label, options = {}) => {
    const menu = combo.querySelector(".wanjuan-project-combo-menu");
    if (!(menu instanceof HTMLElement)) return;
    const signature = projectComboMenuSignature(select);
    if (!options.force && menu.childElementCount > 0 && combo.dataset.menuSignature === signature) return;
    combo.dataset.menuSignature = signature;
    menu.textContent = "";

    const addOption = (option) => {
      if (!(option instanceof HTMLOptionElement)) return;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "wanjuan-project-combo-option";
      item.dataset.value = option.value;
      item.dataset.active = option.value === select.value ? "true" : "false";
      item.textContent = option.textContent || "未命名项目";
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        label.textContent = option.textContent || "未命名项目";
        combo.dataset.open = "false";
      });
      menu.appendChild(item);
    };

    Array.from(select.children).forEach((child) => {
      if (child instanceof HTMLOptGroupElement) {
        const heading = document.createElement("div");
        heading.className = "wanjuan-project-combo-group";
        heading.textContent = child.label || "分组";
        menu.appendChild(heading);
        Array.from(child.children).forEach(addOption);
      } else {
        addOption(child);
      }
    });
  };

  const installMergedProjectSwitcher = (leftGroup, projectButton, select) => {
    if (!(leftGroup instanceof HTMLElement) ||
      !(projectButton instanceof HTMLButtonElement) ||
      !(select instanceof HTMLSelectElement)) {
      return;
    }

    let combo = leftGroup.querySelector(".wanjuan-project-combo");
    if (!(combo instanceof HTMLElement)) {
      combo = document.createElement("div");
      combo.className = "wanjuan-project-combo";
      combo.dataset.open = "false";
      combo.innerHTML = `
        <span class="wanjuan-project-combo-label"></span>
        <button type="button" class="wanjuan-project-combo-rename" title="重命名当前项目" aria-label="重命名当前项目">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
          </svg>
        </button>
        <button type="button" class="wanjuan-project-combo-arrow" title="切换项目" aria-label="切换项目">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6"></path>
          </svg>
        </button>
        <div class="wanjuan-project-combo-menu" role="listbox"></div>
      `;
      leftGroup.insertBefore(combo, projectButton);
      combo.addEventListener("click", (event) => event.stopPropagation());
      document.addEventListener("click", (event) => {
        if (!combo.isConnected || combo.contains(event.target)) return;
        combo.dataset.open = "false";
      }, true);
    }

    const label = combo.querySelector(".wanjuan-project-combo-label");
    const rename = combo.querySelector(".wanjuan-project-combo-rename");
    const arrow = combo.querySelector(".wanjuan-project-combo-arrow");
    if (!(label instanceof HTMLElement) ||
      !(rename instanceof HTMLButtonElement) ||
      !(arrow instanceof HTMLButtonElement)) {
      return;
    }

    const currentText = select.selectedOptions?.[0]?.textContent ||
      projectButton.textContent ||
      "未命名项目";
    label.textContent = currentText.trim() || "未命名项目";
    buildProjectComboMenu(combo, select, label);

    rename.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      combo.dataset.open = "false";
      projectButton.click();
    };

    arrow.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      buildProjectComboMenu(combo, select, label, { force: true });
      combo.dataset.open = combo.dataset.open === "true" ? "false" : "true";
    };

    select.onchange = () => {
      label.textContent = select.selectedOptions?.[0]?.textContent?.trim() ||
        projectButton.textContent?.trim() ||
        "未命名项目";
      combo.dataset.menuSignature = "";
    };

    projectButton.classList.add("wanjuan-project-combo-source");
    select.classList.add("wanjuan-project-combo-source");
  };

  let canvasPressureMeterInstalled = false;
  let canvasPressureMeterTimer = 0;
  let canvasPressureMeterRaf = 0;
  let canvasPressureMonitorStarted = false;
  let canvasPressureFrameRaf = 0;
  let canvasPressureLastFrame = 0;
  let canvasPressureLastLagTick = 0;
  const canvasPressureFrameDeltas = [];
  const canvasPressureRuntime = {
    fps: 60,
    longTaskMs: 0,
    eventLoopLagMs: 0
  };

  const clampCanvasPressure = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

  const startCanvasPressureRuntimeMonitor = () => {
    if (canvasPressureMonitorStarted) return;
    canvasPressureMonitorStarted = true;

    const sampleFrame = (now) => {
      if (document.hidden) {
        canvasPressureLastFrame = now;
        canvasPressureFrameRaf = window.requestAnimationFrame(sampleFrame);
        return;
      }
      if (canvasPressureLastFrame > 0) {
        const delta = now - canvasPressureLastFrame;
        if (delta > 0 && delta < 1000) {
          canvasPressureFrameDeltas.push(delta);
          if (canvasPressureFrameDeltas.length > 80) canvasPressureFrameDeltas.shift();
          const averageDelta = canvasPressureFrameDeltas.reduce((sum, item) => sum + item, 0) / canvasPressureFrameDeltas.length;
          canvasPressureRuntime.fps = clampCanvasPressure(1000 / averageDelta, 1, 60);
        }
      }
      canvasPressureLastFrame = now;
      canvasPressureFrameRaf = window.requestAnimationFrame(sampleFrame);
    };
    canvasPressureFrameRaf = window.requestAnimationFrame(sampleFrame);

    canvasPressureLastLagTick = performance.now();
    window.setInterval(() => {
      const now = performance.now();
      const lag = Math.max(0, now - canvasPressureLastLagTick - 750);
      canvasPressureLastLagTick = now;
      canvasPressureRuntime.eventLoopLagMs = Math.max(
        lag,
        canvasPressureRuntime.eventLoopLagMs * 0.72
      );
    }, 750);

    if (typeof PerformanceObserver === "function") {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            canvasPressureRuntime.longTaskMs = Math.min(
              1500,
              canvasPressureRuntime.longTaskMs + Math.max(0, entry.duration || 0)
            );
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
      } catch {}
    }

    window.setInterval(() => {
      canvasPressureRuntime.longTaskMs *= 0.62;
    }, 1200);

    window.addEventListener("beforeunload", () => {
      if (canvasPressureFrameRaf) window.cancelAnimationFrame(canvasPressureFrameRaf);
    }, { once: true });
  };

  const getCanvasRenderPressure = () => {
    const nodes = Array.from(document.querySelectorAll(".react-flow__node"));
    const edges = Array.from(document.querySelectorAll(".react-flow__edge"));
    const media = document.querySelectorAll(
      ".react-flow__node img[src], .react-flow__node video[src], .react-flow__node audio[src], .react-flow__node canvas"
    ).length;
    const textInputs = document.querySelectorAll(
      ".react-flow__node textarea, .react-flow__node input, .react-flow__node select"
    ).length;
    const animatedEdges = edges.filter((edge) =>
      edge.classList.contains("animated") ||
      edge.querySelector(".wanjuan-flow-edge-energy-flow, .wanjuan-flow-edge-energy-spark")
    ).length;
    const loadingNodes = nodes.filter((node) => /生成中|排队中|请求中|正在处理|loading/i.test(node.textContent || "")).length;

    const structuralRaw =
      nodes.length * 0.55 +
      edges.length * 0.22 +
      media * 0.9 +
      textInputs * 0.16 +
      animatedEdges * 1.3 +
      loadingNodes * 2.2;
    const structuralValue = clampCanvasPressure(structuralRaw);
    const fpsPenalty = clampCanvasPressure((55 - canvasPressureRuntime.fps) * 1.45, 0, 38);
    const longTaskPenalty = clampCanvasPressure(canvasPressureRuntime.longTaskMs / 18, 0, 34);
    const lagPenalty = clampCanvasPressure(canvasPressureRuntime.eventLoopLagMs * 1.35, 0, 30);
    const runtimeValue = clampCanvasPressure(fpsPenalty + longTaskPenalty + lagPenalty);
    const hardwarePenalty =
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 ? 5 : 0) +
      (navigator.deviceMemory && navigator.deviceMemory <= 4 ? 5 : 0) +
      (window.devicePixelRatio && window.devicePixelRatio >= 2.5 ? 4 : 0);
    const value = clampCanvasPressure(Math.round(structuralValue * 0.58 + runtimeValue * 0.42 + hardwarePenalty));
    const level = value >= 82 ? "overload" : value >= 62 ? "high" : value >= 36 ? "medium" : "low";
    const label = level === "overload" ? "过载" : level === "high" ? "高" : level === "medium" ? "中" : "低";

    return {
      value,
      level,
      label,
      nodes: nodes.length,
      edges: edges.length,
      media,
      animatedEdges,
      loadingNodes,
      structuralValue: Math.round(structuralValue),
      runtimeValue: Math.round(runtimeValue),
      fps: Math.round(canvasPressureRuntime.fps),
      longTaskMs: Math.round(canvasPressureRuntime.longTaskMs),
      eventLoopLagMs: Math.round(canvasPressureRuntime.eventLoopLagMs),
      hardwarePenalty
    };
  };

  const updateCanvasPressureMeter = () => {
    canvasPressureMeterRaf = 0;
    const meter = document.querySelector("[data-wanjuan-canvas-pressure='true']");
    if (!(meter instanceof HTMLElement)) return;

    const pressure = getCanvasRenderPressure();
    meter.dataset.pressureLevel = pressure.level;
    meter.style.setProperty("--wanjuan-pressure", `${pressure.value}%`);
    meter.setAttribute(
      "title",
      `当前画布渲染压力：${pressure.label}（${pressure.value}%）\n结构压力 ${pressure.structuralValue}%，实时压力 ${pressure.runtimeValue}%\nFPS ${pressure.fps}，长任务 ${pressure.longTaskMs}ms，事件循环延迟 ${pressure.eventLoopLagMs}ms\n可见节点 ${pressure.nodes}，连线 ${pressure.edges}，媒体 ${pressure.media}，动画连线 ${pressure.animatedEdges}，运行中节点 ${pressure.loadingNodes}`
    );

    const value = meter.querySelector("[data-wanjuan-pressure-value='true']");
    const label = meter.querySelector("[data-wanjuan-pressure-label='true']");
    const meta = meter.querySelector("[data-wanjuan-pressure-meta='true']");
    if (value) value.textContent = `${pressure.value}%`;
    if (label) label.textContent = pressure.label;
    if (meta) meta.textContent = `${pressure.nodes} 节点 · ${pressure.fps} FPS`;
    maybePromptPerformanceDowngrade(pressure);
  };

  const queueCanvasPressureMeterUpdate = () => {
    if (canvasPressureMeterRaf) return;
    canvasPressureMeterRaf = window.requestAnimationFrame(updateCanvasPressureMeter);
  };

  const installCanvasPressureMeter = () => {
    const select = document.querySelector("select[title='切换项目']");
    if (!(select instanceof HTMLSelectElement)) return;
    const leftGroup = select.parentElement;
    const toolbar = leftGroup?.parentElement;
    if (!(leftGroup instanceof HTMLElement) || !(toolbar instanceof HTMLElement)) return;
    toolbar.classList.add("wanjuan-canvas-subtoolbar");
    if (toolbar.querySelector("[data-wanjuan-canvas-pressure='true']")) {
      queueCanvasPressureMeterUpdate();
      return;
    }

    const taskButton = Array.from(toolbar.querySelectorAll("button")).find((button) =>
      (button.textContent || "").replace(/\s+/g, " ").trim().includes("任务清单")
    );
    const taskGroup = taskButton?.parentElement;
    if (!(taskGroup instanceof HTMLElement)) return;

    startCanvasPressureRuntimeMonitor();
    const meter = document.createElement("div");
    meter.dataset.wanjuanCanvasPressure = "true";
    meter.className = "wanjuan-canvas-pressure-meter";
    meter.innerHTML = `
      <div class="wanjuan-canvas-pressure-copy">
        <span class="wanjuan-canvas-pressure-title">画布压力</span>
        <span class="wanjuan-canvas-pressure-meta" data-wanjuan-pressure-meta="true">0 节点 · 0 线</span>
      </div>
      <div class="wanjuan-canvas-pressure-track" aria-hidden="true">
        <span class="wanjuan-canvas-pressure-fill"></span>
      </div>
      <div class="wanjuan-canvas-pressure-readout">
        <span data-wanjuan-pressure-label="true">低</span>
        <strong data-wanjuan-pressure-value="true">0%</strong>
      </div>
    `;
    toolbar.insertBefore(meter, taskGroup);
    queueCanvasPressureMeterUpdate();

    if (!canvasPressureMeterInstalled) {
      canvasPressureMeterInstalled = true;
      canvasPressureMeterTimer = window.setInterval(queueCanvasPressureMeterUpdate, 1200);
      window.addEventListener("beforeunload", () => {
        if (canvasPressureMeterTimer) window.clearInterval(canvasPressureMeterTimer);
      }, { once: true });
    }
  };

  let performanceSettingsInstalled = false;
  let performancePressurePromptOpen = false;
  let performancePressurePromptLastShown = 0;
  // 记录性能面板上次渲染时的激活档位，避免 MutationObserver 高频触发下反复重建按钮 DOM，
  // 否则鼠标悬停时按钮每隔 250ms 被销毁重建一次，hover 过渡反复重启 = 持续闪烁。
  let performancePanelRenderedKey = null;

  const syncPerformanceProfileClass = () => {
    try {
      const settings = getPerformanceSettings();
      document.documentElement.dataset.wanjuanPerformanceProfile = settings.key;
      document.documentElement.dataset.wanjuanRenderMode = settings.renderMode || settings.key;
    } catch {}
  };

  const writeReactInputValue = (element, value) => {
    if (!element) return;
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(element, String(value));
    else element.value = String(value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const findGenerationSettingsCard = () => {
    const cards = Array.from(document.querySelectorAll(".wanjuan-settings-card, .group"));
    return cards.find((card) => /生成设置/.test(card.textContent || "") && /默认最大并发数/.test(card.textContent || "")) || null;
  };

  const applyPerformanceProfileToControls = (settings) => {
    if (!settings || settings.key === "custom") return;
    const card = findGenerationSettingsCard();
    if (!(card instanceof HTMLElement)) return;
    const textareaLabel = Array.from(card.querySelectorAll("label")).find((label) =>
      (label.textContent || "").includes("按层级运行最大并发数选项")
    );
    const textarea = textareaLabel?.parentElement?.querySelector("textarea") || card.querySelector("textarea");
    if (textarea) writeReactInputValue(textarea, settings.layeredRunConcurrencyOptions || "2\n3\n5");
    window.setTimeout(() => {
      const targetText = `${settings.layeredRunMaxConcurrency} 并发`;
      const button = Array.from(card.querySelectorAll("button")).find((item) =>
        (item.textContent || "").replace(/\s+/g, " ").trim() === targetText
      );
      button?.click?.();
    }, 60);
  };

  const readCurrentGenerationCustomSettings = () => {
    const card = findGenerationSettingsCard();
    const textareaLabel = card ? Array.from(card.querySelectorAll("label")).find((label) =>
      (label.textContent || "").includes("按层级运行最大并发数选项")
    ) : null;
    const textarea = textareaLabel?.parentElement?.querySelector("textarea") || card?.querySelector("textarea");
    const activeButton = card ? Array.from(card.querySelectorAll("button")).find((button) =>
      /并发/.test(button.textContent || "") && /bg-green|green/.test(button.className || "")
    ) : null;
    const activeValue = Number(String(activeButton?.textContent || "").match(/\d+/)?.[0]);
    return {
      ...PERFORMANCE_PROFILE_PRESETS.custom,
      layeredRunConcurrencyOptions: textarea?.value || PERFORMANCE_PROFILE_PRESETS.custom.layeredRunConcurrencyOptions,
      layeredRunMaxConcurrency: Number.isFinite(activeValue) && activeValue > 0 ? activeValue : PERFORMANCE_PROFILE_PRESETS.custom.layeredRunMaxConcurrency
    };
  };

  const storePerformanceSettings = async (key, options = {}) => {
    const normalizedKey = normalizePerformanceProfileKey(key);
    persistPerformanceProfile(normalizedKey, options.customSettings || null);
    const settings = getPerformanceSettings();
    syncPerformanceProfileClass();
    try {
      await ipcRenderer.invoke("wanjuan:set-performance-settings", settings);
    } catch {}
    try {
      if (window.chrome?.storage?.local?.set) {
        const stored = {
          [PERFORMANCE_PROFILE_STORAGE_KEY]: normalizedKey
        };
        if (normalizedKey !== "custom") {
          stored.layeredRunConcurrencyOptions = settings.layeredRunConcurrencyOptions;
          stored.layeredRunMaxConcurrency = settings.layeredRunMaxConcurrency;
        }
        window.chrome.storage.local.set(stored);
      }
    } catch {}
    if (options.applyControls !== false) applyPerformanceProfileToControls(settings);
    console.warn("[wanjuan-performance] profile-applied", {
      profile: settings.key,
      layeredRunMaxConcurrency: settings.layeredRunMaxConcurrency,
      aiGenerateLimit: settings.aiGenerateLimit,
      aiChatLimit: settings.aiChatLimit,
      renderMode: settings.renderMode
    });
    return settings;
  };

  const showPerformanceDowngradeDialog = (pressure) => new Promise((resolve) => {
    performancePressurePromptOpen = true;
    const overlay = document.createElement("div");
    overlay.className = "wanjuan-performance-dialog-overlay";
    overlay.innerHTML = `
      <div class="wanjuan-performance-dialog" role="dialog" aria-modal="true">
        <div class="wanjuan-performance-dialog-title">画布压力过高</div>
        <div class="wanjuan-performance-dialog-body"></div>
        <div class="wanjuan-performance-dialog-actions">
          <button type="button" data-action="keep">本次保持</button>
          <button type="button" data-action="settings">打开设置页</button>
          <button type="button" data-action="downgrade">临时降到极速性能</button>
        </div>
      </div>
    `;
    const body = overlay.querySelector(".wanjuan-performance-dialog-body");
    if (body) {
      body.textContent = `当前压力 ${pressure.value}%（${pressure.label}），FPS ${pressure.fps}，运行中节点 ${pressure.loadingNodes}。是否切换到低渲染负载档位？`;
    }
    const finish = (action) => {
      overlay.remove();
      performancePressurePromptOpen = false;
      resolve(action);
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish("keep");
      const action = event.target?.dataset?.action;
      if (action) finish(action);
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish("keep");
    });
    document.body.appendChild(overlay);
  });

  const maybePromptPerformanceDowngrade = (pressure) => {
    if (!pressure || performancePressurePromptOpen) return;
    const settings = getPerformanceSettings();
    if (settings.key === "performance") return;
    const now = Date.now();
    const severe = pressure.level === "overload" || (pressure.level === "high" && pressure.fps <= 24);
    if (!severe || now - performancePressurePromptLastShown < 90000) return;
    performancePressurePromptLastShown = now;
    showPerformanceDowngradeDialog(pressure).then((action) => {
      console.warn("[wanjuan-performance] pressure-action", {
        action,
        profile: settings.key,
        pressure
      });
      if (action === "downgrade") storePerformanceSettings("performance");
      if (action === "settings") {
        const settingsButton = Array.from(document.querySelectorAll("button")).find((button) =>
          /设置/.test(button.textContent || "")
        );
        settingsButton?.click?.();
      }
    });
  };

  const renderPerformanceSettingsPanel = (panel) => {
    const settings = getPerformanceSettings();
    // 幂等保护：档位未变且面板已有按钮时，跳过重建 innerHTML。
    // 这样 MutationObserver 高频触发 runOnce 时不会反复销毁/重建按钮，hover 状态保持稳定，不再闪烁。
    if (performancePanelRenderedKey === settings.key && panel.querySelector("[data-profile]")) {
      return;
    }
    performancePanelRenderedKey = settings.key;
    panel.innerHTML = `
      <div class="wanjuan-performance-header">
        <div>
          <div class="wanjuan-performance-title">性能 / 渲染档位</div>
          <div class="wanjuan-performance-subtitle">全局默认设置；会同步到下面的并发设置，不做隐藏保护。</div>
        </div>
        <div class="wanjuan-performance-current">${PERFORMANCE_PROFILE_PRESETS[settings.key]?.label || "均衡"}</div>
      </div>
      <div class="wanjuan-performance-options">
        ${["performance", "balanced", "quality", "custom"].map((key) => {
          const preset = PERFORMANCE_PROFILE_PRESETS[key];
          return `<button type="button" data-profile="${key}" class="${settings.key === key ? "active" : ""}">
            <strong>${preset.label}</strong>
            <span>${preset.description}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="wanjuan-performance-details">
        层级并发 ${settings.layeredRunMaxConcurrency} · AI生成队列 ${settings.aiGenerateLimit} · 聊天队列 ${settings.aiChatLimit} · 轮询 ${settings.aiPollLimit}
      </div>
    `;
    panel.querySelectorAll("[data-profile]").forEach((button) => {
      button.addEventListener("click", async () => {
        const key = button.dataset.profile || "balanced";
        await storePerformanceSettings(key, {
          customSettings: key === "custom" ? readCurrentGenerationCustomSettings() : null
        });
        // 切档后强制重绘以刷新 active 高亮（档位已变，指纹失配也会触发重绘，这里显式重置更稳妥）。
        performancePanelRenderedKey = null;
        renderPerformanceSettingsPanel(panel);
      });
    });
  };

  const installPerformanceSettingsPanel = () => {
    syncPerformanceProfileClass();
    const card = findGenerationSettingsCard();
    if (!(card instanceof HTMLElement)) return;
    const body = card.querySelector(".wanjuan-settings-card-body") || card.querySelector(".px-4.pt-4") || card;
    if (!(body instanceof HTMLElement)) return;
    let panel = body.querySelector("[data-wanjuan-performance-panel='true']");
    if (!(panel instanceof HTMLElement)) {
      panel = document.createElement("div");
      panel.dataset.wanjuanPerformancePanel = "true";
      panel.className = "wanjuan-performance-panel";
      body.insertBefore(panel, body.firstChild);
    }
    renderPerformanceSettingsPanel(panel);
    performanceSettingsInstalled = true;
  };

  const SEEDREAM_ICON_SVG = `
    <svg class="wanjuan-seedream-official-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="wanjuan-seedream-gradient" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#21C8FF"/>
          <stop offset="0.48" stop-color="#2F7DFF"/>
          <stop offset="1" stop-color="#7DF4A9"/>
        </linearGradient>
      </defs>
      <path fill="url(#wanjuan-seedream-gradient)" d="M12.7 2.5c.7 4.3 1.6 6 3.5 7.1 1.3.8 2.9 1.2 5.3 1.7-4.2.7-6 1.7-7.2 3.7-.8 1.3-1.2 2.9-1.7 5.1-.7-4.1-1.7-5.8-3.6-7-1.3-.8-2.9-1.3-5.5-1.8 4.1-.7 5.8-1.6 7-3.5.9-1.3 1.4-2.9 2.2-5.3Z"/>
    </svg>
  `;

  const createSeedreamIcon = () => {
    const template = document.createElement("template");
    template.innerHTML = SEEDREAM_ICON_SVG.trim();
    return template.content.firstElementChild;
  };

  const looksLikeLegacySeedreamIcon = (element) => {
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
    if (element.classList?.contains("wanjuan-seedream-official-icon")) return true;
    if (element instanceof SVGElement) return true;
    const text = (element.textContent || "").trim();
    return text.length > 0 && text.length <= 3;
  };

  const getDirectSeedreamText = (container) =>
    Array.from(container.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE || node instanceof HTMLSpanElement)
      .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
      .join("")
      .trim();

  const isSeedreamTitleContainer = (container) => {
    const directText = getDirectSeedreamText(container);
    if (directText !== "即梦节点") return false;
    return !container.querySelector("textarea, input, video, img, canvas, audio, button, select");
  };

  const cleanupSeedreamOuterIcons = () => {
    document.querySelectorAll(".wanjuan-seedream-official-row").forEach((container) => {
      if (!(container instanceof HTMLElement) || isSeedreamTitleContainer(container)) return;
      container.classList.remove("wanjuan-seedream-official-row");
      Array.from(container.children).forEach((child) => {
        if (child.classList?.contains("wanjuan-seedream-official-icon")) child.remove();
      });
    });
  };

  const replaceSeedreamIconIn = (container) => {
    if (!(container instanceof HTMLElement)) return;
    if (!isSeedreamTitleContainer(container)) return;
    const nodes = Array.from(container.childNodes);
    const firstTextIndex = nodes.findIndex((node) => (node.textContent || "").includes("即梦节点"));
    const icon = createSeedreamIcon();
    if (!icon) return;
    container.classList.add("wanjuan-seedream-official-row");
    if (container.querySelector(".wanjuan-seedream-official-icon")) return;
    const oldIcon = nodes.slice(0, Math.max(firstTextIndex, 0)).find(looksLikeLegacySeedreamIcon);
    if (oldIcon) oldIcon.replaceWith(icon);
    else container.insertBefore(icon, container.firstChild);
  };

  const installSeedreamOfficialIcons = () => {
    cleanupSeedreamOuterIcons();
    const candidates = document.querySelectorAll("button, h1, h2, h3, div, [role='menuitem'], [role='button'], label");
    for (const candidate of candidates) replaceSeedreamIconIn(candidate);
  };

  const AUTO_DOWNLOAD_KEY = "autoDownloadGeneratedResults";
  const autoDownloadSeenResults = new Set();
  let autoDownloadEnabled = false;
  let autoDownloadBaselineReady = false;
  let autoDownloadScanTimer = 0;
  let autoDownloadObserverInstalled = false;

  const isAutoDownloadEnabledValue = (value) => value === true || value === "true" || value === 1;

  const inferGeneratedResultMime = (element, url) => {
    const raw = String(url || "");
    const dataMime = raw.match(/^data:([^;,]+)/i)?.[1] || "";
    if (dataMime) return dataMime;
    if (element instanceof HTMLVideoElement) return "video/mp4";
    if (element instanceof HTMLAudioElement) return "audio/mpeg";
    if (/\.webp($|\?)/i.test(raw)) return "image/webp";
    if (/\.jpe?g($|\?)/i.test(raw)) return "image/jpeg";
    if (/\.gif($|\?)/i.test(raw)) return "image/gif";
    if (/\.(mp4|m4v)($|\?)/i.test(raw)) return "video/mp4";
    if (/\.webm($|\?)/i.test(raw)) return "video/webm";
    if (/\.mov($|\?)/i.test(raw)) return "video/quicktime";
    if (/\.wav($|\?)/i.test(raw)) return "audio/wav";
    if (/\.ogg($|\?)/i.test(raw)) return "audio/ogg";
    return element instanceof HTMLImageElement ? "image/png" : "";
  };

  const generatedResultKind = (element, mime) => {
    if (element instanceof HTMLVideoElement || /^video\//i.test(mime)) return "video";
    if (element instanceof HTMLAudioElement || /^audio\//i.test(mime)) return "audio";
    return "image";
  };

  const generatedResultFilename = (element, mime) => {
    const kind = generatedResultKind(element, mime);
    const ext = extensionFromMime(mime) || (kind === "video" ? ".mp4" : kind === "audio" ? ".mp3" : ".png");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `wanjuan-generated-${kind}-${stamp}${ext}`;
  };

  const markGeneratingNodes = () => {
    for (const node of document.querySelectorAll(".react-flow__node")) {
      const text = (node.textContent || "").replace(/\s+/g, " ");
      if (/生成中|排队中|请求中|正在处理/.test(text)) {
        node.dataset.wanjuanWasGenerating = "true";
      }
    }
  };

  const shouldAutoDownloadMedia = (element, node, url) => {
    if (!url || url.startsWith("chrome-extension:")) return false;
    if (url.startsWith("data:image/svg")) return false;
    if (!node || node.dataset.wanjuanWasGenerating !== "true") return false;
    if (element instanceof HTMLImageElement && element.naturalWidth > 0 && element.naturalHeight > 0) {
      if (element.naturalWidth < 240 || element.naturalHeight < 240) return false;
    }
    return true;
  };

  const autoDownloadGeneratedResult = async (element, url) => {
    const store = await getDesktopStorageItems(["downloadDirectory", AUTO_DOWNLOAD_KEY]);
    if (!isAutoDownloadEnabledValue(store[AUTO_DOWNLOAD_KEY])) return;

    let nextUrl = url;
    let mime = inferGeneratedResultMime(element, nextUrl);
    if (typeof nextUrl === "string" && nextUrl.startsWith("blob:")) {
      const converted = await dataUrlFromBlobUrl(nextUrl);
      nextUrl = converted.dataUrl;
      mime = converted.mime || mime;
    }

    const payload = {
      mime,
      filename: generatedResultFilename(element, mime),
      directory: store.downloadDirectory || ""
    };
    if (typeof nextUrl === "string" && /^file:\/\//i.test(nextUrl)) {
      try {
        payload.localPath = decodeURIComponent(new URL(nextUrl).pathname);
      } catch {
        payload.url = nextUrl;
      }
    } else payload.url = nextUrl;

    const result = await ipcRenderer.invoke("wanjuan:save-download", payload);
    if (!result?.ok) throw new Error(result?.error || "自动下载失败");
  };

  const scanGeneratedResultsForAutoDownload = () => {
    if (!autoDownloadEnabled) {
      autoDownloadBaselineReady = true;
      return;
    }
    markGeneratingNodes();
    const mediaElements = document.querySelectorAll(
      ".react-flow__node img[src], .react-flow__node video[src], .react-flow__node audio[src]"
    );
    for (const element of mediaElements) {
      const node = element.closest(".react-flow__node");
      const url = element.currentSrc || element.getAttribute("src") || "";
      if (!url) continue;
      const key = `${node?.getAttribute("data-id") || ""}|${element.tagName}|${url.length}|${url.slice(0, 96)}|${url.slice(-96)}`;
      if (autoDownloadSeenResults.has(key)) continue;
      if (!autoDownloadBaselineReady || !autoDownloadEnabled) continue;
      if (!shouldAutoDownloadMedia(element, node, url)) continue;
      autoDownloadSeenResults.add(key);
      if (autoDownloadSeenResults.size > 2000) autoDownloadSeenResults.clear();
      autoDownloadGeneratedResult(element, url).catch((error) => {
        autoDownloadSeenResults.delete(key);
        console.warn("auto download generated result skipped", error);
      });
    }
    autoDownloadBaselineReady = true;
  };

  const queueAutoDownloadScan = () => {
    if (autoDownloadScanTimer) return;
    autoDownloadScanTimer = window.setTimeout(() => {
      autoDownloadScanTimer = 0;
      scanGeneratedResultsForAutoDownload();
    }, 600);
  };

  const installAutoDownloadObserver = () => {
    if (autoDownloadObserverInstalled) return;
    autoDownloadObserverInstalled = true;
    new MutationObserver(queueAutoDownloadScan).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"]
    });
  };

  const setAutoDownloadEnabled = async (enabled) => {
    autoDownloadEnabled = Boolean(enabled);
    await setDesktopStorageItems({ [AUTO_DOWNLOAD_KEY]: autoDownloadEnabled });
    updateAutoDownloadControls();
    if (autoDownloadEnabled) {
      autoDownloadBaselineReady = false;
      autoDownloadSeenResults.clear();
      installAutoDownloadObserver();
      queueAutoDownloadScan();
    }
  };

  const updateAutoDownloadControls = () => {
    const checkbox = document.querySelector("[data-wanjuan-auto-download-toggle='true']");
    const label = document.querySelector("[data-wanjuan-auto-download-state='true']");
    const button = document.querySelector(".wanjuan-auto-download-switch");
    if (checkbox instanceof HTMLInputElement) checkbox.checked = autoDownloadEnabled;
    if (label instanceof HTMLElement) label.textContent = autoDownloadEnabled ? "已开启" : "已关闭";
    if (button instanceof HTMLElement) button.setAttribute("aria-checked", autoDownloadEnabled ? "true" : "false");
  };

  const installAutoDownloadSettingRow = async () => {
    const store = await getDesktopStorageItems([AUTO_DOWNLOAD_KEY]);
    autoDownloadEnabled = isAutoDownloadEnabledValue(store[AUTO_DOWNLOAD_KEY]);

    const labels = Array.from(document.querySelectorAll("label, div, span"))
      .filter((item) => (item.textContent || "").trim() === "文件下载地址");
    const title = labels[0];
    if (!(title instanceof HTMLElement)) return;

    const section = title.parentElement;
    if (!(section instanceof HTMLElement)) return;
    if (section.querySelector("[data-wanjuan-auto-download-row='true']")) {
      updateAutoDownloadControls();
      return;
    }

    const row = document.createElement("div");
    row.dataset.wanjuanAutoDownloadRow = "true";
    row.className = "wanjuan-auto-download-row";
    row.innerHTML = `
      <div class="wanjuan-auto-download-copy">
        <div class="wanjuan-auto-download-title">生成结果自动下载</div>
        <div class="wanjuan-auto-download-desc">开启后，图片、视频、音频生成完成会自动保存到上面的文件夹。</div>
      </div>
      <button type="button" class="wanjuan-auto-download-switch" role="switch" aria-label="生成结果自动下载">
        <span class="wanjuan-auto-download-knob"></span>
        <span class="wanjuan-auto-download-state" data-wanjuan-auto-download-state="true"></span>
        <input type="checkbox" data-wanjuan-auto-download-toggle="true" />
      </button>
    `;
    const hint = Array.from(section.querySelectorAll("p, div, span"))
      .find((item) => (item.textContent || "").includes("节点下载按钮会直接保存"));
    if (hint?.parentElement === section) hint.insertAdjacentElement("afterend", row);
    else section.appendChild(row);

    const button = row.querySelector(".wanjuan-auto-download-switch");
    button?.addEventListener("click", (event) => {
      event.preventDefault();
      setAutoDownloadEnabled(!autoDownloadEnabled).catch((error) => {
        console.warn("auto download setting update failed", error);
      });
    });
    updateAutoDownloadControls();
  };

  document.addEventListener("dblclick", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const renameButton = target.closest("button[title='双击重命名项目'], button[title='点击重命名项目']");
    if (!renameButton) return;
    event.preventDefault();
    event.stopPropagation();
    beginInlineProjectRename();
  }, true);

  const installCanvasMediaPerformancePatches = () => {
    const root = document.documentElement;
    if (root.dataset.wanjuanMediaPerfInstalled === "true") return;
    root.dataset.wanjuanMediaPerfInstalled = "true";
    const perfStats = {
      managedVideos: 0,
      unloadedVideos: 0,
      restoredVideos: 0,
      lastRefreshAt: 0
    };
    try { window.__wanjuanCanvasMediaPerfStats = perfStats; } catch {}

    const getCanvasVideos = () =>
      Array.from(document.querySelectorAll(".react-flow__node video"))
        .filter((video) => video instanceof HTMLVideoElement);

    const shouldKeepVideoLoaded = (video) =>
      video.matches(":hover") ||
      document.activeElement === video ||
      Boolean(video.closest(".react-flow__node.selected, .react-flow__node[aria-selected='true']"));

    const pauseCanvasVideos = () => {
      for (const video of getCanvasVideos()) {
        if (shouldKeepVideoLoaded(video)) continue;
        try {
          if (!video.paused) video.pause();
        } catch {}
      }
    };

    const restoreVideoSource = (video) => {
      const storedSrc = video.dataset.wanjuanMediaSrc;
      if (storedSrc && !video.getAttribute("src")) {
        video.setAttribute("src", storedSrc);
        perfStats.restoredVideos++;
        try {
          video.load();
        } catch {}
      }
    };

    const unloadVideoSource = (video) => {
      if (shouldKeepVideoLoaded(video)) return;
      try {
        if (!video.paused) video.pause();
      } catch {}
      const src = video.getAttribute("src") || video.currentSrc;
      if (!src) return;
      video.dataset.wanjuanMediaSrc = src;
      video.removeAttribute("src");
      perfStats.unloadedVideos++;
      try {
        video.load();
      } catch {}
    };

    const observer = typeof IntersectionObserver !== "undefined" ?
      new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const video = entry.target;
          if (!(video instanceof HTMLVideoElement)) continue;
          if (entry.isIntersecting) restoreVideoSource(video);
          else unloadVideoSource(video);
        }
      }, { root: null, rootMargin: "900px", threshold: 0.01 }) :
      null;

    const manageVideo = (video) => {
      if (!(video instanceof HTMLVideoElement) || video.dataset.wanjuanMediaManaged === "true") return;
      video.dataset.wanjuanMediaManaged = "true";
      perfStats.managedVideos++;
      video.preload = "metadata";
      video.playsInline = true;
      video.disableRemotePlayback = true;
      video.addEventListener("pointerenter", () => restoreVideoSource(video), { passive: true });
      video.addEventListener("focus", () => restoreVideoSource(video), { passive: true });
      observer?.observe(video);
    };

    const refreshVideos = () => {
      perfStats.lastRefreshAt = Date.now();
      for (const video of getCanvasVideos()) manageVideo(video);
    };

    let mediaRefreshTimer = 0;
    const queueRefreshVideos = () => {
      if (mediaRefreshTimer) return;
      mediaRefreshTimer = window.setTimeout(() => {
        mediaRefreshTimer = 0;
        refreshVideos();
      }, 500);
    };

    window.__wanjuanPauseCanvasVideos = pauseCanvasVideos;
    refreshVideos();
    new MutationObserver(queueRefreshVideos).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseCanvasVideos();
    }, true);
  };

  let canvasInteractionTimer = 0;
  const setCanvasInteracting = () => {
    document.documentElement.classList.add("wanjuan-canvas-dragging");
    window.__wanjuanPauseCanvasVideos?.();
    if (canvasInteractionTimer) window.clearTimeout(canvasInteractionTimer);
    canvasInteractionTimer = window.setTimeout(() => {
      canvasInteractionTimer = 0;
      document.documentElement.classList.remove("wanjuan-canvas-dragging");
    }, 260);
  };

  const isCanvasInteractionTarget = (target) => {
    if (!(target instanceof Element)) return false;
    if (target.closest("textarea, input, select, button, [contenteditable='true'], .react-flow__node")) return false;
    return Boolean(target.closest(".react-flow__pane, .react-flow__viewport, .react-flow__renderer"));
  };

  document.addEventListener("pointerdown", (event) => {
    if (!isCanvasInteractionTarget(event.target)) return;
    document.documentElement.classList.add("wanjuan-canvas-dragging");
    window.__wanjuanPauseCanvasVideos?.();
  }, true);

  document.addEventListener("pointerup", () => {
    document.documentElement.classList.remove("wanjuan-canvas-dragging");
  }, true);

  document.addEventListener("pointercancel", () => {
    document.documentElement.classList.remove("wanjuan-canvas-dragging");
  }, true);

  document.addEventListener("wheel", (event) => {
    if (!isCanvasInteractionTarget(event.target)) return;
    setCanvasInteracting();
  }, { capture: true, passive: true });

  const markCanvasLockControl = () => {
    for (const button of document.querySelectorAll(".react-flow__controls-interactive")) {
      const path = button.querySelector("path")?.getAttribute("d") || "";
      const isUnlocked = path.includes("4.114") || path.includes("1.828");
      button.classList.toggle("wanjuan-canvas-lock-control", true);
      button.classList.toggle("wanjuan-canvas-lock-open", isUnlocked);
      button.classList.toggle("wanjuan-canvas-lock-closed", !isUnlocked);
    }
  };

  const hideLabels = ["非插件环境"];
  const autoClickLabels = ["开发模式：模拟进入", "模拟进入"];
  let autoClicked = false;
  let projectNameSynced = false;

  const TIANJI_DEFAULT_CONFIG = {
    baseUrl: "https://ai.kulunli.cn",
    token: "",
    sassId: "1",
    platform: "web",
    models: "doubao-seedance-2-0-260128\ndoubao-seedance-2-0-fast-260128",
    durations: "5\n10",
    resolutions: "720p\n1080p",
    ratios: "16:9\n9:16\n1:1\n4:3\n3:4\n21:9",
    generateAudio: true,
    watermark: false
  };
  let tianjiSettingsInstalled = false;
  let tianjiSettingsState = null;
  let tianjiAssetsState = { LivenessFace: [], AIGC: [] };
  let tianjiGroupsState = {};
  let tianjiPointsLogsDialog = null;

  const tianjiStorageGet = (keys) =>
    new Promise((resolve) => {
      try {
        window.chrome?.storage?.local?.get(keys, (value) => resolve(value || {}));
      } catch {
        resolve({});
      }
    });

  const tianjiStorageSet = (items) =>
    new Promise((resolve) => {
      try {
        window.chrome?.storage?.local?.set(items || {}, resolve);
      } catch {
        resolve();
      }
    });

  const tianjiEncodeBody = (value) => Buffer.from(String(value || ""), "utf8").toString("base64");
  const tianjiDecodeBody = (value) => Buffer.from(String(value || ""), "base64").toString("utf8");
  const tianjiEscapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const tianjiBrokenAssetImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="8" fill="#111827"/><rect x="17" y="21" width="62" height="38" rx="5" fill="#1f2937" stroke="#374151"/><circle cx="35" cy="36" r="5" fill="#4b5563"/><path d="M24 55l14-14 9 9 7-8 18 13H24z" fill="#334155"/><text x="48" y="78" text-anchor="middle" font-size="10" font-family="Arial, sans-serif" fill="#9ca3af">素材失效</text></svg>`)}`;

  const tianjiNormalizeConfig = (value = {}) => ({
    ...TIANJI_DEFAULT_CONFIG,
    ...(value && typeof value === "object" ? value : {}),
    baseUrl: String(value?.baseUrl || TIANJI_DEFAULT_CONFIG.baseUrl).replace(/\s+/g, "").replace(/\/+$/, "") || TIANJI_DEFAULT_CONFIG.baseUrl,
    sassId: String(value?.sassId || "1").trim() || "1",
    platform: String(value?.platform || "web").trim() || "web",
    generateAudio: value?.generateAudio !== false,
    watermark: value?.watermark === true
  });

  const tianjiFindArray = (value) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    for (const key of ["list", "List", "items", "Items", "records", "Records", "assets", "Assets", "asset_list", "AssetList", "results", "Results", "result", "Result", "rows", "Rows", "data", "Data"]) {
      const found = tianjiFindArray(value[key]);
      if (found.length) return found;
    }
    return [];
  };

  const tianjiResultSummary = (value) => {
    try {
      const data = value?.data || value?.Data || value || {};
      const keys = data && typeof data === "object" ? Object.keys(data).slice(0, 12).join(",") : "";
      const total = tianjiFindDeepValue(value, ["total", "Total", "count", "Count", "total_count", "TotalCount"]);
      const code = value?.code ?? value?.Code ?? "";
      const message = value?.message || value?.msg || value?.Message || "";
      return [`code=${code || "?"}`, message ? `msg=${message}` : "", total ? `total=${total}` : "", keys ? `keys=${keys}` : ""].filter(Boolean).join(" ");
    } catch {
      return "";
    }
  };

  const tianjiFindDeepValue = (value, keys) => {
    const wanted = new Set(keys.map((key) => String(key).toLowerCase()));
    const visit = (next, seen = new Set()) => {
      if (!next || typeof next !== "object" || seen.has(next)) return "";
      seen.add(next);
      if (Array.isArray(next)) {
        for (const item of next) {
          const found = visit(item, seen);
          if (found) return found;
        }
        return "";
      }
      for (const [key, item] of Object.entries(next)) {
        if (wanted.has(String(key).toLowerCase()) && item !== undefined && item !== null && String(item) !== "") return String(item);
      }
      for (const item of Object.values(next)) {
        const found = visit(item, seen);
        if (found) return found;
      }
      return "";
    };
    return visit(value);
  };

  const tianjiPadNumber = (value) => String(value).padStart(2, "0");

  const tianjiFormatDateTime = (date) => {
    const next = date instanceof Date ? date : new Date(date || Date.now());
    if (!Number.isFinite(next.getTime())) return "";
    return `${next.getFullYear()}-${tianjiPadNumber(next.getMonth() + 1)}-${tianjiPadNumber(next.getDate())} ${tianjiPadNumber(next.getHours())}:${tianjiPadNumber(next.getMinutes())}:${tianjiPadNumber(next.getSeconds())}`;
  };

  const tianjiPointsLogsRange = (preset = "30d") => {
    const end = new Date();
    const start = new Date(end);
    if (preset === "today") start.setHours(0, 0, 0, 0);
    else start.setDate(start.getDate() - (preset === "7d" ? 7 : 30));
    return {
      startDate: tianjiFormatDateTime(start),
      endDate: tianjiFormatDateTime(end)
    };
  };

  const tianjiNormalizePointsLogRows = (result) => {
    const rows = tianjiFindArray(result);
    const totalText = tianjiFindDeepValue(result, ["total", "Total", "count", "Count", "total_count", "totalCount", "TotalCount"]);
    const total = Number(totalText || rows.length || 0) || rows.length || 0;
    return { rows, total };
  };

  const tianjiPointsLogCell = (row, keys, fallback = "") => {
    if (!row || typeof row !== "object") return fallback;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined && row[key] !== null && String(row[key]) !== "") return String(row[key]);
    }
    return tianjiFindDeepValue(row, keys) || fallback;
  };

  const tianjiRenderPointsLogsRows = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return `<tr><td colspan="5" class="wanjuan-tianji-points-empty">没有查到积分变动记录。</td></tr>`;
    }
    return rows.map((row) => {
      const time = tianjiPointsLogCell(row, ["created_at", "createdAt", "create_time", "createTime", "updated_at", "time", "date", "created"]);
      const type = tianjiPointsLogCell(row, ["type", "log_type", "logType", "event", "scene", "business_type", "businessType", "source"], "积分变动");
      const change = tianjiPointsLogCell(row, ["points", "point", "amount", "change", "change_points", "changePoints", "value", "num"], "-");
      const balance = tianjiPointsLogCell(row, ["balance", "after_balance", "afterBalance", "remaining_points", "remainingPoints", "remain_points", "remainPoints"], "-");
      const remark = tianjiPointsLogCell(row, ["remark", "remarks", "description", "desc", "message", "msg", "task_id", "taskId", "execute_id", "executeId", "title", "name"], "");
      return `<tr>
        <td>${tianjiEscapeHtml(time || "-")}</td>
        <td>${tianjiEscapeHtml(type || "-")}</td>
        <td class="${String(change).trim().startsWith("-") ? "is-negative" : "is-positive"}">${tianjiEscapeHtml(change)}</td>
        <td>${tianjiEscapeHtml(balance)}</td>
        <td title="${tianjiEscapeHtml(remark)}">${tianjiEscapeHtml(remark || "-")}</td>
      </tr>`;
    }).join("");
  };

  const tianjiOpenPointsLogsDialog = async (panel, status) => {
    if (tianjiPointsLogsDialog && document.body.contains(tianjiPointsLogsDialog)) tianjiPointsLogsDialog.remove();
    const initialRange = tianjiPointsLogsRange("30d");
    const state = {
      page: 1,
      pageSize: 30,
      startDate: initialRange.startDate,
      endDate: initialRange.endDate,
      total: 0,
      loading: false
    };
    const overlay = document.createElement("div");
    overlay.className = "wanjuan-tianji-points-overlay";
    overlay.innerHTML = `
      <div class="wanjuan-tianji-points-dialog" role="dialog" aria-modal="true" aria-label="积分明细">
        <div class="wanjuan-tianji-points-header">
          <div>
            <div class="wanjuan-tianji-points-title">积分明细</div>
            <div class="wanjuan-tianji-points-subtitle">查看天玑模式账户积分变动记录</div>
          </div>
          <button type="button" class="wanjuan-tianji-points-close" data-tianji-points-close aria-label="关闭">关闭</button>
        </div>
        <div class="wanjuan-tianji-points-toolbar">
          <div class="wanjuan-tianji-points-presets">
            <button type="button" data-tianji-points-preset="today">今天</button>
            <button type="button" data-tianji-points-preset="7d">7天</button>
            <button type="button" data-tianji-points-preset="30d" class="is-active">30天</button>
          </div>
          <label>开始时间<input data-tianji-points-field="startDate" value="${tianjiEscapeHtml(state.startDate)}"></label>
          <label>结束时间<input data-tianji-points-field="endDate" value="${tianjiEscapeHtml(state.endDate)}"></label>
          <button type="button" class="wanjuan-tianji-points-refresh" data-tianji-points-refresh>刷新</button>
        </div>
        <div class="wanjuan-tianji-points-status" data-tianji-points-status></div>
        <div class="wanjuan-tianji-points-table-wrap">
          <table class="wanjuan-tianji-points-table">
            <thead><tr><th>时间</th><th>类型</th><th>变动</th><th>余额</th><th>说明</th></tr></thead>
            <tbody data-tianji-points-rows><tr><td colspan="5" class="wanjuan-tianji-points-empty">正在加载...</td></tr></tbody>
          </table>
        </div>
        <div class="wanjuan-tianji-points-footer">
          <button type="button" data-tianji-points-prev>上一页</button>
          <span data-tianji-points-page>第 1 页</span>
          <button type="button" data-tianji-points-next>下一页</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    tianjiPointsLogsDialog = overlay;
    const close = () => {
      if (document.body.contains(overlay)) overlay.remove();
      if (tianjiPointsLogsDialog === overlay) tianjiPointsLogsDialog = null;
    };
    const setDialogStatus = (text) => {
      const target = overlay.querySelector("[data-tianji-points-status]");
      if (target) target.textContent = text || "";
    };
    const syncFields = () => {
      const startInput = overlay.querySelector("[data-tianji-points-field='startDate']");
      const endInput = overlay.querySelector("[data-tianji-points-field='endDate']");
      if (startInput) startInput.value = state.startDate;
      if (endInput) endInput.value = state.endDate;
      const pageText = overlay.querySelector("[data-tianji-points-page]");
      const totalPage = state.total ? Math.max(1, Math.ceil(state.total / state.pageSize)) : "";
      if (pageText) pageText.textContent = `第 ${state.page} 页${totalPage ? ` / ${totalPage} 页` : ""}${state.total ? ` · 共 ${state.total} 条` : ""}`;
      const prev = overlay.querySelector("[data-tianji-points-prev]");
      const next = overlay.querySelector("[data-tianji-points-next]");
      if (prev) prev.disabled = state.loading || state.page <= 1;
      if (next) next.disabled = state.loading || (state.total ? state.page >= Math.ceil(state.total / state.pageSize) : false);
    };
    const load = async () => {
      state.loading = true;
      syncFields();
      setDialogStatus("正在查询积分明细...");
      overlay.querySelector("[data-tianji-points-rows]").innerHTML = `<tr><td colspan="5" class="wanjuan-tianji-points-empty">正在加载...</td></tr>`;
      try {
        await tianjiSaveConfigFromPanel(panel);
        const result = await tianjiRequest(tianjiSettingsState, "/api/tasks/points-logs", {
          method: "GET",
          query: {
            page: state.page,
            pageSize: state.pageSize,
            start_date: state.startDate,
            end_date: state.endDate
          }
        });
        const normalized = tianjiNormalizePointsLogRows(result);
        state.total = normalized.total;
        overlay.querySelector("[data-tianji-points-rows]").innerHTML = tianjiRenderPointsLogsRows(normalized.rows);
        setDialogStatus(`查询完成：第 ${state.page} 页，${normalized.rows.length} 条记录${state.total ? `，共 ${state.total} 条` : ""}`);
        status?.(`积分明细已更新：${normalized.rows.length} 条记录`);
      } catch (error) {
        console.error("Tianji points logs failed", error);
        overlay.querySelector("[data-tianji-points-rows]").innerHTML = `<tr><td colspan="5" class="wanjuan-tianji-points-empty">${tianjiEscapeHtml(error?.message || String(error))}</td></tr>`;
        setDialogStatus(error?.message || String(error));
        status?.(error?.message || String(error));
      } finally {
        state.loading = false;
        syncFields();
      }
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target?.hasAttribute?.("data-tianji-points-close")) {
        event.preventDefault();
        close();
      }
    });
    overlay.addEventListener("input", (event) => {
      const field = event.target?.getAttribute?.("data-tianji-points-field");
      if (field === "startDate" || field === "endDate") state[field] = event.target.value;
    });
    overlay.addEventListener("click", (event) => {
      const preset = event.target?.getAttribute?.("data-tianji-points-preset");
      if (preset) {
        event.preventDefault();
        const range = tianjiPointsLogsRange(preset);
        state.startDate = range.startDate;
        state.endDate = range.endDate;
        state.page = 1;
        overlay.querySelectorAll("[data-tianji-points-preset]").forEach((button) => button.classList.toggle("is-active", button.getAttribute("data-tianji-points-preset") === preset));
        load();
        return;
      }
      if (event.target?.hasAttribute?.("data-tianji-points-refresh")) {
        event.preventDefault();
        state.page = 1;
        load();
      }
      if (event.target?.hasAttribute?.("data-tianji-points-prev")) {
        event.preventDefault();
        if (state.page > 1) {
          state.page -= 1;
          load();
        }
      }
      if (event.target?.hasAttribute?.("data-tianji-points-next")) {
        event.preventDefault();
        state.page += 1;
        load();
      }
    });
    await load();
  };

  const tianjiCreateLocalUploadAsset = ({ type, name, imageUrl, result }) => ({
    id: tianjiFindDeepValue(result, ["portrait_asset_id", "asset_id", "assetId", "id", "AssetId"]) || `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    portrait_asset_id: tianjiFindDeepValue(result, ["portrait_asset_id", "asset_id", "assetId", "id", "AssetId"]) || "",
    name: name || "人像素材",
    image_url: imageUrl || "",
    status: tianjiFindDeepValue(result, ["status", "Status"]) || "已提交",
    groupType: type,
    localUploaded: true,
    createdAt: Date.now()
  });

  const tianjiMergeLocalAssets = (loaded) =>
    Array.isArray(loaded) ? loaded.filter((item) => item?.localUploaded !== true) : [];

  const tianjiExtractGroups = (result, current = {}, preferredType = "") => {
    const found = [];
    const visit = (value, path = []) => {
      if (value === null || value === undefined) return;
      if (typeof value === "string" || typeof value === "number") {
        const text = String(value);
        const matches = text.match(/group-[0-9a-z-]+/ig) || [];
        for (const id of matches) found.push({ id, path: path.join(".").toLowerCase() });
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, path.concat(String(index))));
        return;
      }
      if (typeof value === "object") {
        Object.entries(value).forEach(([key, item]) => visit(item, path.concat(key)));
      }
    };
    visit(result);
    const unique = [];
    const seen = new Set();
    found.forEach((item) => {
      const id = String(item.id || "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      unique.push(item);
    });
    const pickByPath = (pattern) => unique.find((item) => pattern.test(item.path))?.id || "";
    let live = result?.data?.LivenessFace || result?.data?.group_id || result?.data?.livenessFaceGroupId || result?.data?.live_group_id || pickByPath(/liveness|live|real|真人/i);
    let aigc = result?.data?.AIGC || result?.data?.virtal_group_id || result?.data?.virtual_group_id || result?.data?.virtral_group_id || result?.data?.aigcGroupId || result?.data?.aigc_group_id || pickByPath(/aigc|virtual|virtal|virtral|虚拟/i);
    const ids = unique.map((item) => item.id);
    if (!live && !aigc && ids.length === 1) {
      if (preferredType === "AIGC") aigc = ids[0];
      else if (preferredType === "LivenessFace") live = ids[0];
    } else if (preferredType === "AIGC" && !aigc) {
      const virtualByPath = pickByPath(/aigc|virtual|virtal|virtral|虚拟/i);
      if (virtualByPath) aigc = virtualByPath;
    } else if (preferredType === "LivenessFace" && !live) {
      const liveByPath = pickByPath(/liveness|live|real|真人/i);
      if (liveByPath) live = liveByPath;
    }
    const dataHasExplicitLive = result?.data && Object.prototype.hasOwnProperty.call(result.data, "group_id");
    const dataHasExplicitAigc = result?.data && (
      Object.prototype.hasOwnProperty.call(result.data, "virtal_group_id") ||
      Object.prototype.hasOwnProperty.call(result.data, "virtual_group_id") ||
      Object.prototype.hasOwnProperty.call(result.data, "virtral_group_id")
    );
    return {
      LivenessFace: live || (dataHasExplicitLive ? "" : current.LivenessFace) || "",
      AIGC: aigc || (dataHasExplicitAigc ? "" : current.AIGC) || ""
    };
  };

  const tianjiApplyPreferredGroupFallback = (panel, preferredType = "") => {
    if (preferredType !== "AIGC" && preferredType !== "LivenessFace") return false;
    const liveInput = panel.querySelector("[data-tianji-field='liveGroupId']");
    const aigcInput = panel.querySelector("[data-tianji-field='aigcGroupId']");
    const live = liveInput?.value || tianjiGroupsState.LivenessFace || "";
    const aigc = aigcInput?.value || tianjiGroupsState.AIGC || "";
    if (preferredType === "AIGC" && !aigc && live) {
      tianjiGroupsState = { ...tianjiGroupsState, LivenessFace: "", AIGC: live };
      if (liveInput) liveInput.value = "";
      if (aigcInput) aigcInput.value = live;
      return true;
    }
    if (preferredType === "LivenessFace" && !live && aigc) {
      tianjiGroupsState = { ...tianjiGroupsState, LivenessFace: aigc, AIGC: "" };
      if (liveInput) liveInput.value = aigc;
      if (aigcInput) aigcInput.value = "";
      return true;
    }
    return false;
  };

  const tianjiSummarizeAssetStatuses = (items = []) => {
    const list = Array.isArray(items) ? items : [];
    return list.reduce((summary, item) => {
      const status = String(item?.status || item?.Status || "").trim().toLowerCase();
      if (!status || ["active", "success", "succeeded", "completed", "complete", "done"].includes(status)) summary.active += 1;
      else if (["failed", "fail", "error"].includes(status)) summary.failed += 1;
      else summary.processing += 1;
      summary.total += 1;
      return summary;
    }, { total: 0, active: 0, processing: 0, failed: 0 });
  };

  const tianjiSyncGroups = async (panel, preferredType = "") => {
    const result = await tianjiRequest(tianjiSettingsState, "/api/cut/model/seedance-portrait-auth-status");
    tianjiGroupsState = tianjiExtractGroups(result, {
      LivenessFace: panel.querySelector("[data-tianji-field='liveGroupId']")?.value || tianjiGroupsState.LivenessFace || "",
      AIGC: panel.querySelector("[data-tianji-field='aigcGroupId']")?.value || tianjiGroupsState.AIGC || ""
    }, preferredType);
    const liveInput = panel.querySelector("[data-tianji-field='liveGroupId']");
    const aigcInput = panel.querySelector("[data-tianji-field='aigcGroupId']");
    if (liveInput) liveInput.value = tianjiGroupsState.LivenessFace;
    if (aigcInput) aigcInput.value = tianjiGroupsState.AIGC;
    await tianjiStorageSet({ tianjiSeedanceGroups: tianjiGroupsState });
    return tianjiGroupsState;
  };

  const tianjiRequest = async (config, path, { method = "POST", params = {}, query = {} } = {}) => {
    const nextConfig = tianjiNormalizeConfig(config);
    if (!nextConfig.token) throw new Error("请先填写即梦天玑 Authorization Token");
    const url = new URL(`${nextConfig.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
    });
    const headers = {
      Authorization: nextConfig.token,
      "Xx-Sass-Id": nextConfig.sassId,
      "Xx-Platform": nextConfig.platform
    };
    let body = "";
    if (method !== "GET") {
      const form = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        if (Array.isArray(value)) value.forEach((item) => item !== undefined && item !== null && item !== "" && form.append(key, String(item)));
        else form.append(key, String(value));
      });
      body = form.toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    let response;
    if (typeof ipcRenderer?.invoke === "function") {
      const bridged = await ipcRenderer.invoke("wanjuan:proxy-fetch", {
        requestId: `tianji-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        url: url.toString(),
        method,
        headers,
        bodyBase64: body ? tianjiEncodeBody(body) : "",
        requestTimeout: 180000
      });
      if (!bridged?.ok) throw new Error(bridged?.error || "即梦天玑请求失败");
      response = {
        ok: bridged.status >= 200 && bridged.status < 300,
        status: bridged.status,
        statusText: bridged.statusText || "",
        text: async () => tianjiDecodeBody(bridged.bodyBase64)
      };
    } else {
      response = await fetch(url.toString(), { method, headers, body: body || undefined });
    }
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!response.ok) throw new Error(json?.message || json?.msg || `即梦天玑请求失败: ${response.status} ${response.statusText}`);
    if (json && json.code && json.code !== 200) throw new Error(json.message || json.msg || `即梦天玑返回错误: ${json.code}`);
    return json;
  };

  const tianjiSaveConfigFromPanel = async (panel) => {
    const config = tianjiNormalizeConfig({
      baseUrl: panel.querySelector("[data-tianji-field='baseUrl']")?.value,
      token: panel.querySelector("[data-tianji-field='token']")?.value,
      sassId: panel.querySelector("[data-tianji-field='sassId']")?.value,
      platform: panel.querySelector("[data-tianji-field='platform']")?.value,
      generateAudio: panel.querySelector("[data-tianji-field='generateAudio']")?.checked,
      watermark: panel.querySelector("[data-tianji-field='watermark']")?.checked
    });
    tianjiSettingsState = config;
    await tianjiStorageSet({ tianjiSeedanceConfig: config });
  };

  const tianjiRenderAssetList = (panel) => {
    const target = panel.querySelector("[data-tianji-assets]");
    if (!target) return;
    const renderGroup = (title, type) => {
      const assets = Array.isArray(tianjiAssetsState[type]) ? tianjiAssetsState[type] : [];
      const body = assets.length
        ? assets.slice(0, 60).map((item) => {
            const isLocalPending = item?.localUploaded === true;
            const id = item.portrait_asset_id || item.asset_id || item.assetId || item.id || item.Id || item.AssetId || "";
            const name = item.name || item.Name || id || "未命名素材";
            const img = item.image_url || item.imageUrl || item.cover_url || item.preview_url || item.url || item.URL || "";
            const status = isLocalPending ? "待天玑素材库返回" : item.status || item.Status || "";
            return `<div class="wanjuan-tianji-asset${isLocalPending ? " is-pending" : ""}" title="${tianjiEscapeHtml(isLocalPending ? "上传已提交，等待刷新为天玑资产" : img || id || "")}">
              ${img ? `<img src="${tianjiEscapeHtml(img)}" alt="" onerror="this.onerror=null;this.src='${tianjiBrokenAssetImage}';this.title='素材图片无法加载，可能是天玑返回的签名链接已过期或不可访问';">` : `<span>无图</span>`}
              ${isLocalPending ? `<div class="wanjuan-tianji-asset-badge">待刷新</div>` : ``}
              <div class="wanjuan-tianji-asset-name">${tianjiEscapeHtml(name)}</div>
              <div class="wanjuan-tianji-asset-status">${tianjiEscapeHtml(status || id).slice(0, 24)}</div>
              ${id && !isLocalPending ? `<div class="wanjuan-tianji-asset-actions"><button data-tianji-info="${tianjiEscapeHtml(id)}">详情</button><button data-tianji-delete="${tianjiEscapeHtml(id)}">删除</button></div>` : ``}
            </div>`;
          }).join("")
        : `<div class="wanjuan-tianji-empty">暂无素材，刷新列表或上传人像后查看。</div>`;
      return `<section><div class="wanjuan-tianji-subtitle">${title} · ${assets.length} 个</div><div class="wanjuan-tianji-grid">${body}</div></section>`;
    };
    target.innerHTML = renderGroup("真人人像", "LivenessFace") + renderGroup("虚拟人像", "AIGC");
    target.querySelectorAll("[data-tianji-info]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.getAttribute("data-tianji-info");
        if (!id) return;
        const result = await tianjiRequest(tianjiSettingsState, "/api/cut/model/get-portrait-info", {
          params: { portrait_asset_id: id }
        });
        const summary = JSON.stringify(result, null, 2).slice(0, 1800);
        window.alert(`素材 ID：${id}\n\n${summary}`);
      });
    });
    target.querySelectorAll("[data-tianji-delete]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.getAttribute("data-tianji-delete");
        if (!id || !window.confirm(`删除素材 ${id}？`)) return;
        await tianjiRequest(tianjiSettingsState, "/api/cut/model/delete-portrait", {
          params: { portrait_asset_id: id }
        });
        for (const type of ["LivenessFace", "AIGC"]) {
          tianjiAssetsState[type] = (tianjiAssetsState[type] || []).filter((item) => String(item.portrait_asset_id || item.asset_id || item.assetId || item.id || item.AssetId || "") !== id);
        }
        await tianjiStorageSet({ tianjiSeedanceAssets: tianjiAssetsState });
        tianjiRenderAssetList(panel);
      });
    });
  };

  const tianjiRefreshAssets = async (panel) => {
    await tianjiSaveConfigFromPanel(panel);
    let liveGroup = panel.querySelector("[data-tianji-field='liveGroupId']")?.value || "";
    let aigcGroup = panel.querySelector("[data-tianji-field='aigcGroupId']")?.value || "";
    const load = async (groupType, groupId) => {
      if (!groupId) return { items: [], raw: null, summary: "缺少 group_id" };
      const result = await tianjiRequest(tianjiSettingsState, "/api/cut/model/get-list-assets", {
        params: {
          group_ids: groupId,
          group_type: groupType,
          statuses: "Active",
          PageNumber: "1",
          PageSize: "60",
          SortBy: "CreateTime",
          SortOrder: "Desc"
        }
      });
      return { items: tianjiFindArray(result), raw: result, summary: tianjiResultSummary(result) };
    };
    const loadWithFallback = async (groupType, primaryGroupId) => {
      const tried = [];
      const summaries = [];
      if (primaryGroupId) {
        tried.push(primaryGroupId);
        const loaded = await load(groupType, primaryGroupId);
        summaries.push(`${primaryGroupId}: ${loaded.summary}`);
        return { items: loaded.items, groupId: primaryGroupId, tried, summaries };
      }
      return { items: [], groupId: primaryGroupId || "", tried, summaries };
    };
    const liveResult = await loadWithFallback("LivenessFace", liveGroup);
    const aigcResult = await loadWithFallback("AIGC", aigcGroup);
    const loadedLive = liveResult.items;
    const loadedAigc = aigcResult.items;
    if (liveResult.groupId && liveResult.groupId !== liveGroup) liveGroup = liveResult.groupId;
    if (aigcResult.groupId && aigcResult.groupId !== aigcGroup) aigcGroup = aigcResult.groupId;
    tianjiGroupsState = { ...tianjiGroupsState, LivenessFace: liveGroup, AIGC: aigcGroup };
    const liveInput = panel.querySelector("[data-tianji-field='liveGroupId']");
    const aigcInput = panel.querySelector("[data-tianji-field='aigcGroupId']");
    if (liveInput) liveInput.value = liveGroup;
    if (aigcInput) aigcInput.value = aigcGroup;
    tianjiAssetsState = {
      LivenessFace: tianjiMergeLocalAssets(loadedLive),
      AIGC: tianjiMergeLocalAssets(loadedAigc)
    };
    if (liveResult.groupId || aigcResult.groupId) await tianjiStorageSet({ tianjiSeedanceGroups: tianjiGroupsState });
    await tianjiStorageSet({ tianjiSeedanceAssets: tianjiAssetsState });
    tianjiRenderAssetList(panel);
    return {
      liveGroup,
      aigcGroup,
      liveTried: liveResult.tried,
      aigcTried: aigcResult.tried,
      liveSummaries: liveResult.summaries,
      aigcSummaries: aigcResult.summaries,
      live: tianjiSummarizeAssetStatuses(loadedLive),
      aigc: tianjiSummarizeAssetStatuses(loadedAigc)
    };
  };

  const installTianjiSettingsPanel = async () => {
    if (!document.body) return;
    const tianjiModeHost = document.querySelector("[data-wanjuan-tianji-mode-host]");
    if (tianjiSettingsInstalled) {
      const existingPanel = document.querySelector(".wanjuan-tianji-settings-card");
      const existingModeSwitch = document.querySelector("[data-wanjuan-tianji-mode-switch]");
      if (document.body.contains(existingPanel) && (!tianjiModeHost || document.body.contains(existingModeSwitch))) return;
      tianjiSettingsInstalled = false;
    }
    const tianjiHost = document.querySelector("[data-wanjuan-tianji-settings-host]");
    if (!tianjiHost) {
      document.querySelector(".wanjuan-tianji-settings-card")?.remove?.();
      tianjiSettingsInstalled = false;
      return;
    }
    const exactTextNodes = [];
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if ((node.textContent || "").includes("即梦节点")) exactTextNodes.push(node.parentElement);
      }
    } catch {}
    const headers = [
      ...exactTextNodes,
      ...Array.from(document.querySelectorAll(".wanjuan-settings-card-header, h1, h2, h3, button, div"))
    ].filter(Boolean);
    const seedanceHeader = headers.find((node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      return text.includes("即梦节点") && text.length < 80;
    });
    const seedanceCard = tianjiModeHost?.closest?.(".wanjuan-settings-card") || seedanceHeader?.closest?.(".wanjuan-settings-card") || null;
    if (!tianjiModeHost && !tianjiHost && (!seedanceCard || seedanceCard.parentElement?.querySelector(".wanjuan-tianji-settings-card"))) return;
    seedanceCard?.classList?.add("wanjuan-seedance-settings-card");
    const stored = await tianjiStorageGet(["tianjiSeedanceConfig", "tianjiSeedanceAssets", "tianjiSeedanceGroups", "tianjiSeedanceSettingsMode"]);
    tianjiSettingsState = tianjiNormalizeConfig(stored.tianjiSeedanceConfig || {});
    tianjiAssetsState = {
      LivenessFace: tianjiMergeLocalAssets(stored.tianjiSeedanceAssets?.LivenessFace || tianjiAssetsState.LivenessFace),
      AIGC: tianjiMergeLocalAssets(stored.tianjiSeedanceAssets?.AIGC || tianjiAssetsState.AIGC)
    };
    tianjiGroupsState = stored.tianjiSeedanceGroups || tianjiGroupsState;
    const tianjiSettingsPanelMode = stored.tianjiSeedanceSettingsMode === "tianji" ? "tianji" : "official";
    if (!document.getElementById("wanjuan-tianji-settings-style")) {
      const style = document.createElement("style");
      style.id = "wanjuan-tianji-settings-style";
      style.textContent = `
      .wanjuan-tianji-settings-card{display:block!important;height:auto!important;min-height:420px;margin-top:12px;background:color-mix(in srgb,var(--wj-surface-2,#1a1a1a) 92%,transparent);border:1px solid color-mix(in srgb,var(--wj-border,#333) 76%,transparent);border-radius:10px;overflow:visible;color:var(--wj-text,#d1d5db)}
      .wanjuan-tianji-settings-card[hidden]{display:none!important}
      .wanjuan-tianji-settings-host{display:grid;gap:12px}
      .wanjuan-seedance-settings-card.wanjuan-tianji-mode-active .wanjuan-settings-card-body > :not(.wanjuan-tianji-mode-row):not(.wanjuan-tianji-settings-host){display:none!important}
      .wanjuan-seedance-settings-card.wanjuan-tianji-mode-active .wanjuan-tianji-settings-card{margin-top:0}
      .wanjuan-tianji-mode-row{display:flex!important;align-items:center;justify-content:space-between;gap:12px;border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:8px;background:color-mix(in srgb,var(--wj-surface,#121212) 92%,transparent);padding:8px 10px}
      .wanjuan-tianji-mode-row-title{font-size:12px;font-weight:600;color:var(--wj-text,#d1d5db)}
      .wanjuan-tianji-mode-row-help{font-size:10px;color:var(--wj-muted,#6b7280);margin-top:2px}
      .wanjuan-tianji-mode-host{display:flex;align-items:center;justify-content:flex-end;margin-left:0;vertical-align:middle}
      .wanjuan-tianji-mode-switch{display:inline-flex;align-items:center;gap:3px;padding:3px;border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:9px;background:color-mix(in srgb,var(--wj-surface,#121212) 92%,transparent);box-shadow:0 1px 0 rgba(255,255,255,.04) inset}
      .wanjuan-tianji-mode-switch button{height:26px;min-width:64px;padding:0 12px!important;border:1px solid transparent!important;border-radius:7px!important;background:transparent!important;color:var(--wj-muted,#9ca3af)!important;font-size:11px!important;font-weight:600!important;transition:background .14s ease,border-color .14s ease,color .14s ease,box-shadow .14s ease,transform .14s ease}
      .wanjuan-tianji-mode-switch button:not(.is-active):not([aria-pressed="true"]):hover{background:color-mix(in srgb,var(--wj-surface-3,#2a2a2a) 88%,var(--wj-accent,#60a5fa) 12%)!important;color:var(--wj-text,#d1d5db)!important}
      .wanjuan-tianji-mode-switch button:focus-visible{outline:2px solid color-mix(in srgb,var(--wj-accent,#60a5fa) 70%,#fff 30%)!important;outline-offset:2px!important}
      .wanjuan-tianji-body{min-height:420px;padding:12px;display:grid!important;gap:14px}
      .wanjuan-tianji-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .wanjuan-tianji-settings-card label{display:grid;gap:6px;font-size:11px;color:var(--wj-muted,#6b7280)}
      .wanjuan-tianji-settings-card input,.wanjuan-tianji-settings-card textarea,.wanjuan-tianji-settings-card select{background:color-mix(in srgb,var(--wj-surface,#121212) 92%,transparent);border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:8px;color:var(--wj-text,#e5e7eb);padding:9px 10px;font-size:12px;outline:none}
      .wanjuan-tianji-settings-card input:focus,.wanjuan-tianji-settings-card textarea:focus,.wanjuan-tianji-settings-card select:focus{border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 68%,var(--wj-border,#333))}
      .wanjuan-tianji-settings-card textarea{min-height:76px;resize:vertical}
      .wanjuan-tianji-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .wanjuan-tianji-settings-card button{border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);background:color-mix(in srgb,var(--wj-surface-3,#222) 86%,transparent);color:var(--wj-text,#d1d5db);border-radius:7px;padding:7px 10px;font-size:11px;cursor:pointer}
      .wanjuan-tianji-settings-card button:hover{background:color-mix(in srgb,var(--wj-accent,#60a5fa) 10%,var(--wj-surface-3,#2a2a2a))}
      .wanjuan-tianji-mode-switch button.is-active,.wanjuan-tianji-mode-switch button[aria-pressed="true"]{background:color-mix(in srgb,var(--wj-accent,#60a5fa) 16%,var(--wj-surface-3,#222) 84%)!important;border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 52%,var(--wj-border,#333) 48%)!important;color:color-mix(in srgb,var(--wj-accent,#60a5fa) 82%,var(--wj-text,#fff) 18%)!important;font-weight:650!important;text-shadow:none!important;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 10%,transparent),0 2px 8px color-mix(in srgb,var(--wj-accent,#60a5fa) 18%,transparent)!important}
      .wanjuan-tianji-primary{background:color-mix(in srgb,var(--wj-accent,#2563eb) 76%,var(--wj-surface-3,#222))!important;border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 80%,var(--wj-border,#333))!important;color:var(--wj-text,#fff)!important}
      .wanjuan-tianji-subtitle{font-size:12px;font-weight:700;color:var(--wj-text,#e5e7eb);margin:8px 0}
      .wanjuan-tianji-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px;max-height:260px;overflow:auto}
      .wanjuan-tianji-asset{position:relative;background:color-mix(in srgb,var(--wj-surface,#151515) 92%,transparent);border:1px solid color-mix(in srgb,var(--wj-border,#2f2f2f) 72%,transparent);border-radius:8px;padding:6px;display:grid;gap:4px;text-align:center;min-width:0}
      .wanjuan-tianji-asset.is-pending{opacity:.72;border-style:dashed}
      .wanjuan-tianji-asset-badge{position:absolute;top:8px;right:8px;padding:2px 5px;border-radius:5px;background:color-mix(in srgb,var(--wj-accent,#60a5fa) 26%,#000);color:var(--wj-text,#fff);font-size:9px;line-height:1}
      .wanjuan-tianji-asset img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;background:color-mix(in srgb,var(--wj-surface,#0f0f0f) 90%,#000)}
      .wanjuan-tianji-asset span{display:grid;place-items:center;width:100%;aspect-ratio:1;border-radius:6px;background:color-mix(in srgb,var(--wj-surface,#0f0f0f) 90%,#000);color:var(--wj-muted,#6b7280);font-size:10px}
      .wanjuan-tianji-asset-name{font-size:10px;color:var(--wj-text,#e5e7eb);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wanjuan-tianji-asset-status{font-size:9px;color:var(--wj-muted,#6b7280);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wanjuan-tianji-asset-actions{display:grid;grid-template-columns:1fr 1fr;gap:4px}
      .wanjuan-tianji-asset-actions button{padding:4px 2px!important;font-size:9px!important;border-radius:5px!important}
      .wanjuan-tianji-empty{font-size:12px;color:var(--wj-muted,#6b7280);text-align:center;border:1px dashed color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:8px;padding:16px}
      .wanjuan-tianji-points-overlay{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:28px;background:color-mix(in srgb,var(--wj-surface,#111827) 46%,transparent);backdrop-filter:blur(10px)}
      .wanjuan-tianji-points-dialog{width:min(920px,calc(100vw - 36px));max-height:min(720px,calc(100vh - 36px));display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;gap:12px;background:var(--wj-surface-2,var(--wj-surface,#171717));border:1px solid color-mix(in srgb,var(--wj-border,#333) 78%,transparent);border-radius:10px;color:var(--wj-text,#e5e7eb);box-shadow:0 24px 80px color-mix(in srgb,var(--wj-surface,#000) 62%,transparent);padding:14px;overflow:hidden}
      .wanjuan-tianji-points-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .wanjuan-tianji-points-title{font-size:15px;font-weight:750;color:var(--wj-text,#f3f4f6)}
      .wanjuan-tianji-points-subtitle{margin-top:4px;font-size:11px;color:var(--wj-muted,#9ca3af)}
      .wanjuan-tianji-points-dialog button{height:30px;border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:8px;background:color-mix(in srgb,var(--wj-surface-3,var(--wj-surface,#222)) 88%,transparent);color:var(--wj-text,#e5e7eb);padding:0 11px;font-size:11px;font-weight:650;cursor:pointer;transition:background .14s ease,border-color .14s ease,color .14s ease,box-shadow .14s ease}
      .wanjuan-tianji-points-dialog button:hover{background:color-mix(in srgb,var(--wj-accent,#60a5fa) 10%,var(--wj-surface-3,var(--wj-surface,#222)));border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 38%,var(--wj-border,#333))}
      .wanjuan-tianji-points-dialog button:focus-visible{outline:2px solid color-mix(in srgb,var(--wj-accent,#60a5fa) 72%,transparent);outline-offset:2px}
      .wanjuan-tianji-points-close{min-width:54px}
      .wanjuan-tianji-points-toolbar{display:grid;grid-template-columns:auto minmax(176px,1fr) minmax(176px,1fr) auto;gap:8px;align-items:end}
      .wanjuan-tianji-points-toolbar label{display:grid;gap:5px;font-size:11px;color:var(--wj-muted,#9ca3af)}
      .wanjuan-tianji-points-toolbar input{height:30px;background:color-mix(in srgb,var(--wj-surface,var(--wj-surface-2,#121212)) 92%,transparent);border:1px solid color-mix(in srgb,var(--wj-border,#333) 68%,transparent);border-radius:8px;color:var(--wj-text,#e5e7eb);padding:0 9px;font-size:11px;outline:none}
      .wanjuan-tianji-points-toolbar input:focus{border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 66%,var(--wj-border,#333));box-shadow:0 0 0 2px color-mix(in srgb,var(--wj-accent,#60a5fa) 16%,transparent)}
      .wanjuan-tianji-points-presets{display:inline-flex;gap:3px;align-items:center;padding:3px;border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:9px;background:color-mix(in srgb,var(--wj-surface,var(--wj-surface-2,#121212)) 92%,transparent);box-shadow:0 1px 0 color-mix(in srgb,var(--wj-text,#fff) 7%,transparent) inset}
      .wanjuan-tianji-points-presets button{height:26px;min-width:46px;padding:0 10px;border-color:transparent;background:transparent;color:var(--wj-muted,#9ca3af);border-radius:7px;box-shadow:none}
      .wanjuan-tianji-points-presets button:hover{background:color-mix(in srgb,var(--wj-accent,#60a5fa) 10%,var(--wj-surface-3,var(--wj-surface,#222)));border-color:transparent;color:var(--wj-text,#e5e7eb)}
      .wanjuan-tianji-points-presets button.is-active{background:color-mix(in srgb,var(--wj-accent,#60a5fa) 16%,var(--wj-surface-3,var(--wj-surface,#222)) 84%);border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 52%,var(--wj-border,#333) 48%);color:color-mix(in srgb,var(--wj-accent,#60a5fa) 82%,var(--wj-text,#fff) 18%);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--wj-text,#fff) 10%,transparent),0 2px 8px color-mix(in srgb,var(--wj-accent,#60a5fa) 18%,transparent)}
      .wanjuan-tianji-points-refresh{background:color-mix(in srgb,var(--wj-accent,#2563eb) 76%,var(--wj-surface-3,var(--wj-surface,#222)))!important;border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 80%,var(--wj-border,#333))!important;color:var(--wj-on-accent,var(--wj-text,#fff))!important;min-width:58px}
      .wanjuan-tianji-points-status{min-height:16px;font-size:11px;color:var(--wj-muted,#9ca3af)}
      .wanjuan-tianji-points-table-wrap{min-height:0;overflow:auto;border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:8px;background:color-mix(in srgb,var(--wj-surface,#111) 94%,transparent)}
      .wanjuan-tianji-points-table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}
      .wanjuan-tianji-points-table th,.wanjuan-tianji-points-table td{padding:9px 10px;border-bottom:1px solid color-mix(in srgb,var(--wj-border,#333) 58%,transparent);text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .wanjuan-tianji-points-table th{position:sticky;top:0;background:color-mix(in srgb,var(--wj-surface-3,var(--wj-surface,#202020)) 94%,var(--wj-surface,#000));font-size:10px;color:var(--wj-muted,#9ca3af);font-weight:700;z-index:1}
      .wanjuan-tianji-points-table th:nth-child(1){width:170px}
      .wanjuan-tianji-points-table th:nth-child(2){width:140px}
      .wanjuan-tianji-points-table th:nth-child(3),.wanjuan-tianji-points-table th:nth-child(4){width:90px}
      .wanjuan-tianji-points-table td.is-positive{color:var(--wj-success,#22c55e)}
      .wanjuan-tianji-points-table td.is-negative{color:var(--wj-danger,#ef4444)}
      .wanjuan-tianji-points-empty{text-align:center!important;color:var(--wj-muted,#9ca3af)!important;padding:32px 12px!important}
      .wanjuan-tianji-points-footer{display:flex;gap:8px;align-items:center;justify-content:flex-end;font-size:11px;color:var(--wj-muted,#9ca3af)}
      .wanjuan-tianji-points-footer button:disabled{opacity:.45;cursor:not-allowed}
      @media(max-width:900px){.wanjuan-tianji-row{grid-template-columns:1fr}}
      @media(max-width:720px){.wanjuan-tianji-points-toolbar{grid-template-columns:1fr}.wanjuan-tianji-points-presets{flex-wrap:wrap}.wanjuan-tianji-points-table{min-width:720px}}
    `;
      document.head.appendChild(style);
    }
    const panel = document.createElement("div");
    panel.className = "wanjuan-tianji-settings-card";
    panel.dataset.tianjiMode = tianjiSettingsPanelMode;
    panel.hidden = tianjiSettingsPanelMode !== "tianji";
    panel.innerHTML = `
      <div class="wanjuan-tianji-body">
        <div class="wanjuan-tianji-actions">
          <button data-tianji-action="balance">查询积分</button>
          <button data-tianji-action="pointsLogs">积分明细</button>
          <button data-tianji-action="groups">获取组 ID</button>
          <button data-tianji-action="refresh">刷新素材</button>
          <button class="wanjuan-tianji-primary" data-tianji-action="save">保存</button>
          <span data-tianji-status-top style="font-size:11px;color:var(--wj-muted,#9ca3af);align-self:center"></span>
        </div>
        <div class="wanjuan-tianji-row">
          <label>接口地址<input data-tianji-field="baseUrl" value="${tianjiSettingsState.baseUrl}"></label>
          <label>Authorization Token<input data-tianji-field="token" type="password" value="${tianjiSettingsState.token || ""}"></label>
          <label>平台标识<input data-tianji-field="platform" value="${tianjiSettingsState.platform}"></label>
          <label>Sass ID<input data-tianji-field="sassId" value="${tianjiSettingsState.sassId}"></label>
          <label>真人组 ID<input data-tianji-field="liveGroupId" value="${tianjiGroupsState.LivenessFace || ""}"></label>
          <label>虚拟组 ID<input data-tianji-field="aigcGroupId" value="${tianjiGroupsState.AIGC || ""}"></label>
        </div>
        <div class="wanjuan-tianji-row">
          <label style="display:flex;align-items:center;gap:8px"><input data-tianji-field="generateAudio" type="checkbox" ${tianjiSettingsState.generateAudio ? "checked" : ""}>生成同步声音</label>
          <label style="display:flex;align-items:center;gap:8px"><input data-tianji-field="watermark" type="checkbox" ${tianjiSettingsState.watermark ? "checked" : ""}>添加水印</label>
        </div>
        <div class="wanjuan-tianji-row">
          <label>上传类型<select data-tianji-upload-type><option value="LivenessFace">真人人像</option><option value="AIGC">虚拟人像</option></select></label>
          <label>素材名称<input data-tianji-upload-name placeholder="素材名称"></label>
          <label>图片文件<input data-tianji-upload-file type="file" accept="image/*"></label>
        </div>
        <div class="wanjuan-tianji-actions"><button class="wanjuan-tianji-primary" data-tianji-action="upload">上传到人像库</button><span data-tianji-status style="font-size:11px;color:#9ca3af;align-self:center"></span></div>
        <div data-tianji-assets></div>
      </div>
    `;
    tianjiHost.replaceChildren(panel);
    const updateTianjiModeButtons = (normalizedMode) => {
      document.querySelectorAll("[data-tianji-mode]").forEach((button) => {
        const isActive = button.getAttribute("data-tianji-mode") === normalizedMode;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.style.setProperty("height", "26px", "important");
        button.style.setProperty("min-width", "64px", "important");
        button.style.setProperty("border-radius", "7px", "important");
        button.style.setProperty("border-style", "solid", "important");
        button.style.setProperty("border-width", "1px", "important");
        if (isActive) {
          button.style.setProperty("background", "color-mix(in srgb,var(--wj-accent,#60a5fa) 16%,var(--wj-surface-3,#222) 84%)", "important");
          button.style.setProperty("border-color", "color-mix(in srgb,var(--wj-accent,#60a5fa) 52%,var(--wj-border,#333) 48%)", "important");
          button.style.setProperty("color", "color-mix(in srgb,var(--wj-accent,#60a5fa) 82%,var(--wj-text,#fff) 18%)", "important");
          button.style.setProperty("font-weight", "650", "important");
          button.style.setProperty("text-shadow", "none", "important");
          button.style.setProperty("box-shadow", "inset 0 1px 0 color-mix(in srgb,#fff 10%,transparent),0 2px 8px color-mix(in srgb,var(--wj-accent,#60a5fa) 18%,transparent)", "important");
        } else {
          button.style.setProperty("background", "transparent", "important");
          button.style.setProperty("border-color", "transparent", "important");
          button.style.setProperty("color", "var(--wj-muted,#9ca3af)", "important");
          button.style.setProperty("font-weight", "600", "important");
          button.style.setProperty("text-shadow", "none", "important");
          button.style.setProperty("box-shadow", "none", "important");
        }
      });
    };
    tianjiSettingsInstalled = Boolean(panel.isConnected);
    const setTianjiMode = async (mode, shouldSave = true) => {
      const normalizedMode = mode === "tianji" ? "tianji" : "official";
      seedanceCard?.classList?.toggle("wanjuan-tianji-mode-active", normalizedMode === "tianji");
      panel.dataset.tianjiMode = normalizedMode;
      panel.hidden = normalizedMode !== "tianji";
      updateTianjiModeButtons(normalizedMode);
      if (shouldSave) await tianjiStorageSet({ tianjiSeedanceSettingsMode: normalizedMode });
    };
    setTianjiMode(tianjiSettingsPanelMode, false).catch(console.warn);
    const status = (text) => {
      panel.querySelectorAll("[data-tianji-status],[data-tianji-status-top]").forEach((node) => {
        node.textContent = text || "";
      });
    };
    panel.addEventListener("change", (event) => {
      if (event.target?.hasAttribute?.("data-tianji-field")) tianjiSaveConfigFromPanel(panel).catch(console.warn);
    });
    panel.addEventListener("input", (event) => {
      if (event.target?.hasAttribute?.("data-tianji-field")) tianjiSaveConfigFromPanel(panel).catch(console.warn);
    });
    panel.addEventListener("click", async (event) => {
      const action = event.target?.getAttribute?.("data-tianji-action");
      if (!action) return;
      try {
        status("处理中...");
        await tianjiSaveConfigFromPanel(panel);
        if (action === "save") status("已保存");
        if (action === "balance") {
          const result = await tianjiRequest(tianjiSettingsState, "/api/cut/model/fetch-points-balance");
          status(`积分余额：${result?.data?.points ?? result?.points ?? "未知"}`);
        }
        if (action === "pointsLogs") {
          status("正在打开积分明细...");
          await tianjiOpenPointsLogsDialog(panel, status);
        }
        if (action === "groups") {
          const type = panel.querySelector("[data-tianji-upload-type]")?.value || "";
          status("正在获取真人/虚拟组 ID...");
          await tianjiSyncGroups(panel, type);
          const live = tianjiGroupsState.LivenessFace || "未返回";
          const aigc = tianjiGroupsState.AIGC || "未返回";
          status(`组 ID 已更新：真人 ${live}，虚拟 ${aigc}`);
        }
        if (action === "refresh") {
          tianjiGroupsState = {
            LivenessFace: panel.querySelector("[data-tianji-field='liveGroupId']")?.value || "",
            AIGC: panel.querySelector("[data-tianji-field='aigcGroupId']")?.value || ""
          };
          await tianjiStorageSet({ tianjiSeedanceGroups: tianjiGroupsState });
          status("正在从天玑素材库刷新状态...");
          const summary = await tianjiRefreshAssets(panel);
          const missing = [];
          if (!summary.liveGroup) missing.push("真人组 ID");
          if (!summary.aigcGroup) missing.push("虚拟组 ID");
          const liveText = summary.liveGroup ? `真人 ${summary.live.active}/${summary.live.total} 可用` : "真人未查";
          const aigcText = summary.aigcGroup ? `虚拟 ${summary.aigc.active}/${summary.aigc.total} 可用` : "虚拟未查";
          const waiting = summary.live.processing + summary.aigc.processing;
          const failed = summary.live.failed + summary.aigc.failed;
          const tried = [
            summary.liveTried?.length ? `真人查 ${summary.liveTried.join("/")}` : "",
            summary.aigcTried?.length ? `虚拟查 ${summary.aigcTried.join("/")}` : ""
          ].filter(Boolean).join("；");
          const rawSummary = [
            summary.liveSummaries?.length ? `真人返回 ${summary.liveSummaries.join(" | ")}` : "",
            summary.aigcSummaries?.length ? `虚拟返回 ${summary.aigcSummaries.join(" | ")}` : ""
          ].filter(Boolean).join("；");
          status(`刷新完成：${liveText}，${aigcText}${waiting ? `，${waiting} 个处理中` : ""}${failed ? `，${failed} 个失败` : ""}${missing.length ? `；缺少${missing.join("、")}` : ""}${tried ? `；${tried}` : ""}${rawSummary ? `；${rawSummary}` : ""}`);
        }
        if (action === "upload") {
          const file = panel.querySelector("[data-tianji-upload-file]")?.files?.[0];
          if (!file) throw new Error("请选择一张人像图片");
          const type = panel.querySelector("[data-tianji-upload-type]")?.value || "LivenessFace";
          const name = panel.querySelector("[data-tianji-upload-name]")?.value || file.name || "人像素材";
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
            reader.readAsDataURL(file);
          });
          const uploaded = await ipcRenderer.invoke("wanjuan:upload-public-media", {
            url: dataUrl,
            kind: "image",
            filename: `tianji-portrait-${Date.now()}`
          });
          if (!uploaded?.ok || !uploaded.url) throw new Error(uploaded?.error || "图片公网链接上传失败");
          const uploadResult = await tianjiRequest(tianjiSettingsState, type === "AIGC" ? "/api/cut/model/upload-VirtralPortrait" : "/api/cut/model/upload-Portrait", {
            params: { image_url: uploaded.url, name }
          });
          if (!tianjiGroupsState.LivenessFace || !tianjiGroupsState.AIGC) {
            status("上传成功，正在获取素材组...");
            await tianjiSyncGroups(panel, type).catch(() => {});
          }
          status("上传成功，正在刷新素材...");
          await tianjiRefreshAssets(panel).catch(() => {});
          status("上传已提交；请刷新素材列表，接口返回后才会显示在人像库");
        }
      } catch (error) {
        console.error("Tianji settings action failed", error);
        status(error?.message || String(error));
      }
    });
    tianjiRenderAssetList(panel);
  };

  const runOnce = () => {
    for (const label of hideLabels) hideByText(label);
    hideSettingsCardByTitle("会员与激活");
    if (!projectNameSynced) {
      projectNameSynced = true;
      syncProjectNameFromStorage()
        .then((synced) => {
          if (!synced) projectNameSynced = false;
        })
        .catch(() => {
          projectNameSynced = false;
        });
    }
    installAutoDownloadSettingRow().catch(() => {});
    if (autoDownloadEnabled) installAutoDownloadObserver();
    installCanvasMediaPerformancePatches();
    markCanvasLockControl();
    markCanvasModelToolbar();
    installPerformanceSettingsPanel();
    installSettingsUpdateButton();
    installCanvasPressureMeter();
    installSeedreamOfficialIcons();
    installTianjiSettingsPanel().catch((error) => console.warn("Tianji settings panel skipped", error));
    installProjectSafetyBackupCenter();
    ensureProjectSafetyAutoBackupStarted();
    if (!autoClicked && autoClickByText(autoClickLabels)) autoClicked = true;
  };

  runOnce();
  // 启动后延迟预热备份中心数据（避开首屏渲染高峰），使用户首次打开"数据管理"即可秒开完全体，
  // 不再经历"同步中占位骨架 → 约 1 秒加载 → 完全体"的两段式割裂切换。内部有守卫，只会真正执行一次。
  window.setTimeout(() => {
    try { prewarmProjectSafetyCenter?.(); } catch (error) { console.warn("project safety prewarm trigger skipped", error); }
  }, 2500);
  let patchQueued = false;
  const queueDesktopPatchRefresh = () => {
    if (patchQueued) return;
    patchQueued = true;
    window.setTimeout(() => {
      patchQueued = false;
      runOnce();
    }, 250);
  };
  const mo = new MutationObserver(queueDesktopPatchRefresh);
  mo.observe(document.documentElement, { subtree: true, childList: true });

  let seedreamIconPatchQueued = false;
  const seedreamIconObserver = new MutationObserver(() => {
    if (seedreamIconPatchQueued) return;
    seedreamIconPatchQueued = true;
    queueMicrotask(() => {
      seedreamIconPatchQueued = false;
      installSeedreamOfficialIcons();
    });
  });
  seedreamIconObserver.observe(document.documentElement, { subtree: true, childList: true });

  const timer = window.setInterval(() => {
    if (autoClicked) {
      window.clearInterval(timer);
      return;
    }
    if (autoClickByText(autoClickLabels)) autoClicked = true;
  }, 300);
  window.setTimeout(() => window.clearInterval(timer), 10000);
  const tianjiSettingsTimer = window.setInterval(() => {
    if (tianjiSettingsInstalled) {
      window.clearInterval(tianjiSettingsTimer);
      return;
    }
    installTianjiSettingsPanel().catch(() => {});
  }, 1000);
  window.setTimeout(() => window.clearInterval(tianjiSettingsTimer), 30000);
}

module.exports = { installDesktopPatches };

// 跨域 late-require（放在 module.exports 之后，利用 var 提升，避免循环依赖在 require 时取到 undefined）
var { installChromeShim } = require("./chrome-shim.cjs");
var { dataUrlFromBlobUrl, extensionFromMime, saveProjectName } = require("./media-utils.cjs");
var { ensureProjectSafetyAutoBackupStarted, installProjectSafetyBackupCenter, prewarmProjectSafetyCenter } = require("./safety-center.cjs");
var { getDesktopStorageItems, getPerformanceSettings, normalizePerformanceProfileKey, persistPerformanceProfile, setDesktopStorageItems } = require("./storage.cjs");
