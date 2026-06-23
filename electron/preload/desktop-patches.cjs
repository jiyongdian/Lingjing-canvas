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

  const installDesktopUiStateStyle = () => {
    const existingStyle = document.getElementById("wanjuan-desktop-ui-state-style");
    if (existingStyle) {
      document.head.appendChild(existingStyle);
      return;
    }
    const style = document.createElement("style");
    style.id = "wanjuan-desktop-ui-state-style";
    style.textContent = `
      .wanjuan-node-popover-option:not(.wanjuan-node-popover-option-active):hover,
      .wanjuan-node-popover-option:not(.wanjuan-node-popover-option-active):focus-visible{
        background:color-mix(in srgb,var(--wj-surface-3,#2a2a2a) 86%,var(--wj-accent,#60a5fa) 14%)!important;
        color:var(--wj-text,#f3f4f6)!important;
        border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 34%,var(--wj-border,#333))!important;
        box-shadow:none!important;
      }
      .wanjuan-node-popover-option-active,
      .wanjuan-node-popover-option-active:hover,
      .wanjuan-node-popover-option-active:focus-visible{
        background:var(--wj-accent,#2563eb)!important;
        background-color:var(--wj-accent,#2563eb)!important;
        color:var(--wj-on-accent,#fff)!important;
        border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 78%,#fff 22%)!important;
        box-shadow:none!important;
      }
      .wanjuan-node-preset-save-button{
        background:color-mix(in srgb,var(--wj-accent,#2563eb) 14%,var(--wj-surface-3,#27303a))!important;
        background-color:color-mix(in srgb,var(--wj-accent,#2563eb) 14%,var(--wj-surface-3,#27303a))!important;
        background-image:none!important;
        border:1px solid color-mix(in srgb,var(--wj-accent,#60a5fa) 32%,var(--wj-border,#3a414c))!important;
        color:color-mix(in srgb,var(--wj-accent,#93c5fd) 62%,var(--wj-text,#f3f4f6))!important;
        box-shadow:none!important;
        outline:none!important;
      }
      .wanjuan-node-preset-save-button:hover,
      .wanjuan-node-preset-save-button:focus,
      .wanjuan-node-preset-save-button:focus-visible{
        background:color-mix(in srgb,var(--wj-accent,#2563eb) 24%,var(--wj-surface-3,#2d3540))!important;
        background-color:color-mix(in srgb,var(--wj-accent,#2563eb) 24%,var(--wj-surface-3,#2d3540))!important;
        background-image:none!important;
        border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 58%,var(--wj-border,#3a414c))!important;
        color:var(--wj-text,#fff)!important;
        box-shadow:0 0 0 1px color-mix(in srgb,var(--wj-accent,#60a5fa) 24%,transparent)!important;
        outline:none!important;
      }
      .wanjuan-settings-save-button{
        background:var(--wj-accent,#2563eb)!important;
        background-color:var(--wj-accent,#2563eb)!important;
        background-image:none!important;
        color:var(--wj-on-accent,#fff)!important;
        box-shadow:0 10px 28px color-mix(in srgb,var(--wj-accent,#2563eb) 24%,transparent)!important;
      }
      .wanjuan-settings-save-button:hover,
      .wanjuan-settings-save-button:focus-visible{
        background:color-mix(in srgb,var(--wj-accent,#2563eb) 86%,#fff 14%)!important;
        background-color:color-mix(in srgb,var(--wj-accent,#2563eb) 86%,#fff 14%)!important;
        background-image:none!important;
        color:var(--wj-on-accent,#fff)!important;
        box-shadow:0 10px 28px color-mix(in srgb,var(--wj-accent,#2563eb) 30%,transparent)!important;
      }
    `;
    document.head.appendChild(style);
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
  let canvasPressureFrameTimer = 0;
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

    const startFrameSampleBurst = () => {
      let sampleCount = 0;
      const sampleFrame = (now) => {
      if (document.hidden) {
        canvasPressureLastFrame = now;
        canvasPressureFrameRaf = 0;
        canvasPressureFrameTimer = window.setTimeout(startFrameSampleBurst, 2200);
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
        sampleCount += 1;
        if (sampleCount < 18) {
          canvasPressureFrameRaf = window.requestAnimationFrame(sampleFrame);
        } else {
          canvasPressureFrameRaf = 0;
          canvasPressureFrameTimer = window.setTimeout(startFrameSampleBurst, 1600);
        }
      };
      canvasPressureFrameRaf = window.requestAnimationFrame(sampleFrame);
    };
    startFrameSampleBurst();

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
      if (canvasPressureFrameTimer) window.clearTimeout(canvasPressureFrameTimer);
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
    const root = document.querySelector(".react-flow") || document.querySelector(".wanjuan-settings-page") || document.body;
    const candidates = root.querySelectorAll("button, h1, h2, h3, div, [role='menuitem'], [role='button'], label");
    for (const candidate of candidates) replaceSeedreamIconIn(candidate);
  };

  const AUTO_DOWNLOAD_KEY = "autoDownloadGeneratedResults";
  const autoDownloadSeenResults = new Set();
  let autoDownloadEnabled = false;
  let autoDownloadBaselineReady = false;
  let autoDownloadScanTimer = 0;
  let autoDownloadObserverInstalled = false;

  const isAutoDownloadEnabledValue = (value) => value === true || value === "true" || value === 1;
  const AUTO_DOWNLOAD_ACTIVE_TEXT_RE =
    /生成中|排队中|请求中|正在处理|处理中|等待中|正在生成|提交中|上传中|loading|queued|queue|pending|waiting|submitted|running|processing|generating|in[_ -]?progress/i;

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
      if (AUTO_DOWNLOAD_ACTIVE_TEXT_RE.test(text)) {
        node.dataset.wanjuanWasGenerating = "true";
      }
    }
  };

  const autoDownloadMediaElementFor = (element) => {
    if (element instanceof HTMLSourceElement) {
      const parent = element.parentElement;
      if (parent instanceof HTMLVideoElement || parent instanceof HTMLAudioElement) return parent;
    }
    return element;
  };

  const autoDownloadUrlFor = (element) => {
    if (element instanceof HTMLSourceElement) return element.getAttribute("src") || "";
    if (element instanceof HTMLMediaElement) {
      return element.currentSrc || element.getAttribute("src") || element.querySelector("source[src]")?.getAttribute("src") || "";
    }
    return element.currentSrc || element.getAttribute("src") || "";
  };

  const autoDownloadResultKey = (element, node, url) =>
    `${node?.getAttribute("data-id") || ""}|${autoDownloadMediaElementFor(element).tagName}|${url.length}|${url.slice(0, 96)}|${url.slice(-96)}`;

  const getAutoDownloadMediaElements = () =>
    Array.from(document.querySelectorAll(
      ".react-flow__node img[src], .react-flow__node video, .react-flow__node audio, .react-flow__node source[src]"
    ));

  const seedAutoDownloadBaseline = () => {
    markGeneratingNodes();
    for (const element of getAutoDownloadMediaElements()) {
      const node = element.closest(".react-flow__node");
      const url = autoDownloadUrlFor(element);
      if (!url) continue;
      autoDownloadSeenResults.add(autoDownloadResultKey(element, node, url));
    }
    autoDownloadBaselineReady = true;
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
        payload.localPath = localPathFromFileUrl(nextUrl) || "";
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
    const mediaElements = getAutoDownloadMediaElements();
    for (const element of mediaElements) {
      const node = element.closest(".react-flow__node");
      const mediaElement = autoDownloadMediaElementFor(element);
      const url = autoDownloadUrlFor(element);
      if (!url) continue;
      const key = autoDownloadResultKey(element, node, url);
      if (autoDownloadSeenResults.has(key)) continue;
      if (!autoDownloadBaselineReady || !autoDownloadEnabled) continue;
      if (!shouldAutoDownloadMedia(mediaElement, node, url)) continue;
      autoDownloadSeenResults.add(key);
      if (autoDownloadSeenResults.size > 2000) autoDownloadSeenResults.clear();
      autoDownloadGeneratedResult(mediaElement, url).catch((error) => {
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
      characterData: true,
      attributes: true,
      attributeFilter: ["src"]
    });
  };

  const setAutoDownloadEnabled = async (enabled) => {
    autoDownloadEnabled = Boolean(enabled);
    await setDesktopStorageItems({ [AUTO_DOWNLOAD_KEY]: autoDownloadEnabled });
    updateAutoDownloadControls();
    if (autoDownloadEnabled) {
      autoDownloadSeenResults.clear();
      seedAutoDownloadBaseline();
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
    if (autoDownloadEnabled && !autoDownloadObserverInstalled) {
      seedAutoDownloadBaseline();
      installAutoDownloadObserver();
      queueAutoDownloadScan();
    }

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
  const TIANJI_DEFAULT_BASE_URL = "https://newapi.guancn.uk";
  const TIANJI_SYNC_SOURCE_JIXIN = "jixin-default";
  const TIANJI_SYNC_SOURCE_MANUAL = "manual";

  const TIANJI_DEFAULT_CONFIG = {
    baseUrl: TIANJI_DEFAULT_BASE_URL,
    token: "",
    syncSource: TIANJI_SYNC_SOURCE_JIXIN,
    sassId: "1",
    platform: "web",
    models: "",
    durations: "5\n10",
    resolutions: "720p\n1080p",
    ratios: "16:9\n9:16\n1:1\n4:3\n3:4\n21:9",
    generateAudio: true,
    watermark: false
  };
  let tianjiSettingsInstalled = false;
  let tianjiSettingsState = null;
  let tianjiAssetsState = { LivenessFace: [], AIGC: [] };
  let tianjiAssetPagesState = { LivenessFace: 1, AIGC: 1 };
  let tianjiAssetPageEndState = { LivenessFace: false, AIGC: false };
  const TIANJI_ASSET_PAGE_SIZE = 10;
  let tianjiGroupsState = {};
  let tianjiPointsLogsDialog = null;
  let tianjiSettingsStorageListener = null;
  let workspacePanelInstalled = false;
  let workspaceState = {
    activeSection: "templates",
    activeSpace: "personal",
    query: "",
    selectedGroupId: "",
    teamMemberAddress: "",
    teamResults: [],
    teamRefreshing: false,
    teamServiceError: "",
    status: null,
  };
  let workspaceRenderTimer = null;
  let workspaceRenderSeq = 0;

  const WORKSPACE_KEYS = [
    "presetPrompts",
    "workspacePromptTemplates",
    "workspacePromptTemplateGroups",
    "workspaceTeamSettings",
    "workspacePublishedTemplates",
  ];

  const workspaceStorageGet = (keys) => getDesktopStorageItems(keys);
  const workspaceStorageSet = (items) => setDesktopStorageItems(items);
  const workspaceId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspaceEscapeHtml = (value) =>
    String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const workspaceDateLabel = (value) => {
    let date = new Date(Number(value || Date.now()));
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  };
  const workspaceNormalizeTemplate = (template = {}) => ({
    id: String(template.id || workspaceId("workspace-template")),
    title: String(template.title || "未命名提示词模板").trim() || "未命名提示词模板",
    prompt: String(template.prompt || ""),
    type: String(template.type || "video"),
    groupId: String(template.groupId || ""),
    sourceProvider: String(template.sourceProvider || "seedance"),
    sourceNodeId: String(template.sourceNodeId || ""),
    sourceProjectId: String(template.sourceProjectId || ""),
    modelName: String(template.modelName || ""),
    generationMode: String(template.generationMode || template.tianjiSeedanceGenerationMode || "text-to-video"),
    params: template.params && typeof template.params === "object" ? template.params : {},
    resultUrl: String(template.resultUrl || template.videoUrl || ""),
    resultLocalPath: String(template.resultLocalPath || template.videoLocalPath || template.localPath || ""),
    thumbnailUrl: String(template.thumbnailUrl || template.posterUrl || ""),
    thumbnailLocalPath: String(template.thumbnailLocalPath || template.posterLocalPath || ""),
    createdAt: Number(template.createdAt || Date.now()),
    updatedAt: Number(template.updatedAt || template.createdAt || Date.now()),
  });
  const workspaceNormalizeGroup = (group = {}) => ({
    id: String(group.id || workspaceId("workspace-group")),
    name: String(group.name || "未命名分组").trim() || "未命名分组",
    collapsed: group.collapsed === true,
    createdAt: Number(group.createdAt || Date.now()),
    updatedAt: Number(group.updatedAt || group.createdAt || Date.now()),
  });
  const workspaceDefaultTeamSettings = () => ({
    enabled: false,
    port: 39218,
    memberName: "",
    deviceId: "",
    members: [],
  });
  const workspaceReadAll = async () => {
    let stored = await workspaceStorageGet(WORKSPACE_KEYS);
    return {
      presetPrompts: Array.isArray(stored.presetPrompts) ? stored.presetPrompts : [],
      templates: (Array.isArray(stored.workspacePromptTemplates) ? stored.workspacePromptTemplates : []).map(workspaceNormalizeTemplate),
      groups: (Array.isArray(stored.workspacePromptTemplateGroups) ? stored.workspacePromptTemplateGroups : []).map(workspaceNormalizeGroup),
      teamSettings: {
        ...workspaceDefaultTeamSettings(),
        ...(stored.workspaceTeamSettings && typeof stored.workspaceTeamSettings === "object" ? stored.workspaceTeamSettings : {}),
      },
      publishedTemplates: (Array.isArray(stored.workspacePublishedTemplates) ? stored.workspacePublishedTemplates : []).map(workspaceNormalizeTemplate),
    };
  };
  const workspaceSyncPublishedTemplates = async (publishedTemplates) => {
    try {
      await window.wanjuanDesktop?.workspaceTeamUpdateTemplates?.({ templates: publishedTemplates || [] });
    } catch (error) {
      console.warn("workspace published template sync failed", error);
    }
  };
  const workspaceEnsureTeamService = async (data = null) => {
    const nextData = data || await workspaceReadAll();
    if (!nextData.teamSettings?.enabled) return null;
    try {
      const statusResult = await Promise.resolve(window.wanjuanDesktop?.workspaceTeamStatus?.()).catch(() => null);
      if (statusResult?.status?.running) {
        await workspaceSyncPublishedTemplates(nextData.publishedTemplates);
        workspaceState.teamServiceError = "";
        return statusResult.status;
      }
      const startResult = await window.wanjuanDesktop?.workspaceTeamStart?.({
        ...nextData.teamSettings,
        templates: nextData.publishedTemplates,
      });
      if (!startResult?.ok) {
        workspaceState.teamServiceError = startResult?.error || "团队空间服务未能开启";
        return startResult?.status || statusResult?.status || null;
      }
      workspaceState.teamServiceError = "";
      return startResult.status || null;
    } catch (error) {
      workspaceState.teamServiceError = error?.message || String(error);
      return null;
    }
  };
  const workspaceSaveTemplate = async (template) => {
    let data = await workspaceReadAll(),
      normalized = workspaceNormalizeTemplate(template),
      nextTemplates = [normalized, ...data.templates.filter((item) => item.id !== normalized.id)];
    await workspaceStorageSet({ workspacePromptTemplates: nextTemplates });
    return normalized;
  };
  const workspaceScheduleRender = () => {
    if (!document.documentElement.classList.contains("wanjuan-workspace-open")) return;
    if (workspaceRenderTimer) window.clearTimeout(workspaceRenderTimer);
    workspaceRenderTimer = window.setTimeout(() => {
      workspaceRenderTimer = null;
      renderWorkspacePanel();
    }, 160);
  };
  const workspaceFindTeamTemplate = (id) => {
    for (const result of workspaceState.teamResults || []) {
      const template = (result.templates || []).find((item) => String(item.id) === String(id));
      if (template) {
        return workspaceNormalizeTemplate({
          ...template,
          memberName: result.manifest?.memberName || result.name || result.address,
          sourceMemberName: result.manifest?.memberName || result.name || result.address,
          sourceMemberAddress: result.address,
        });
      }
    }
    return null;
  };
  const workspaceCopyText = async (text) => {
    try {
      await navigator.clipboard?.writeText?.(String(text || ""));
      workspaceToast("已复制");
    } catch {
      workspaceToast("复制失败");
    }
  };
  const workspaceToast = (message) => {
    let toast = document.createElement("div");
    toast.textContent = String(message || "");
    toast.className = "wanjuan-workspace-toast";
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 1800);
  };
  const workspaceOpenCanvas = () => {
    let canvasTab = Array.from(document.querySelectorAll(".wanjuan-app-nav-tab")).find((button) =>
      /灵境画布/.test(button.textContent || "")
    );
    canvasTab?.click?.();
    document.documentElement.classList.remove("wanjuan-workspace-open");
  };
  const workspaceUseTemplate = (template) => {
    workspaceOpenCanvas();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("wanjuan:workspace-create-seedance-node", {
        detail: { template: workspaceNormalizeTemplate(template) }
      }));
    }, 120);
  };
  const workspaceRefreshTeamMembers = async () => {
    let overlay = document.querySelector(".wanjuan-workspace-page");
    if (!overlay) return;
    workspaceState.teamRefreshing = true;
    renderWorkspacePanel();
    try {
      let data = await workspaceReadAll(),
        members = Array.isArray(data.teamSettings.members) ? data.teamSettings.members : [],
        results = [];
      for (let member of members) {
        let address = typeof member === "string" ? member : member.address;
        if (!address) continue;
        let result = await window.wanjuanDesktop?.workspaceTeamFetchMember?.({ address, timeoutMs: 12000 });
        results.push({
          address,
          name: member.name || result?.manifest?.memberName || address,
          ...result,
        });
      }
      workspaceState.teamResults = results;
      workspaceToast(`已刷新 ${results.length} 个成员`);
    } finally {
      workspaceState.teamRefreshing = false;
      renderWorkspacePanel();
    }
  };
  const workspaceToggleTeamServer = async (enabled) => {
    let data = await workspaceReadAll(),
      teamSettings = {
        ...data.teamSettings,
        enabled: !!enabled,
      },
      result;
    if (enabled) {
      result = await window.wanjuanDesktop?.workspaceTeamStart?.({
        ...teamSettings,
        templates: data.publishedTemplates,
      });
      if (!result?.ok) {
        workspaceToast(`团队空间开启失败：${result?.error || "端口可能被占用或被防火墙拦截"}`);
        teamSettings.enabled = false;
      }
    } else {
      result = await window.wanjuanDesktop?.workspaceTeamStop?.();
    }
    await workspaceStorageSet({ workspaceTeamSettings: teamSettings });
    workspaceState.status = result?.status || null;
    renderWorkspacePanel();
  };
  const workspacePublishTemplate = async (template) => {
    let data = await workspaceReadAll(),
      normalized = workspaceNormalizeTemplate(template),
      nextPublished = [normalized, ...data.publishedTemplates.filter((item) => item.id !== normalized.id)];
    await workspaceStorageSet({ workspacePublishedTemplates: nextPublished });
    await workspaceSyncPublishedTemplates(nextPublished);
    if (data.teamSettings.enabled) {
      await workspaceEnsureTeamService({
        ...data,
        publishedTemplates: nextPublished,
      });
    }
    workspaceToast(data.teamSettings.enabled ? "已发布到团队空间" : "已加入团队发布列表，开启团队空间后可被成员拉取");
    renderWorkspacePanel();
  };
  const workspaceAddMember = async () => {
    let raw = workspaceState.teamMemberAddress || "";
    if (!raw.trim()) return;
    let data = await workspaceReadAll(),
      address = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `http://${raw.trim()}`,
      members = Array.isArray(data.teamSettings.members) ? data.teamSettings.members : [];
    if (!members.some((member) => (typeof member === "string" ? member : member.address) === address)) {
      members.push({ address, name: "" });
    }
    workspaceState.teamMemberAddress = "";
    await workspaceStorageSet({
      workspaceTeamSettings: {
        ...data.teamSettings,
        members,
      }
    });
    workspaceRefreshTeamMembers();
  };

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
    baseUrl: String(Object.prototype.hasOwnProperty.call(value || {}, "baseUrl") ? value?.baseUrl : TIANJI_DEFAULT_BASE_URL).replace(/\s+/g, "").replace(/\/+$/, ""),
    syncSource: value?.syncSource === TIANJI_SYNC_SOURCE_MANUAL ? TIANJI_SYNC_SOURCE_MANUAL : TIANJI_SYNC_SOURCE_JIXIN,
    sassId: String(value?.sassId || "1").trim() || "1",
    platform: String(value?.platform || "web").trim() || "web",
    generateAudio: value?.generateAudio !== false,
    watermark: value?.watermark === true
  });

  const tianjiNormalizeApiBaseUrl = (value) =>
    String(value || "").replace(/\s+/g, "").replace(/\/+$/, "");

  const tianjiIsJixinApiConfig = (config) =>
    config?.id === "jixin-default" ||
    tianjiNormalizeApiBaseUrl(config?.url) === tianjiNormalizeApiBaseUrl(TIANJI_DEFAULT_BASE_URL);

  const tianjiBuildSyncedConfigFromJixin = (currentConfig = {}, jixinConfig = null, { force = false } = {}) => {
    const jixinBaseUrl = tianjiNormalizeApiBaseUrl(jixinConfig?.url || TIANJI_DEFAULT_BASE_URL) || TIANJI_DEFAULT_BASE_URL;
    const rawCurrentBaseUrl = tianjiNormalizeApiBaseUrl(currentConfig?.baseUrl || "");
    const hasExplicitSyncSource = Object.prototype.hasOwnProperty.call(currentConfig || {}, "syncSource");
    if (!force && !hasExplicitSyncSource && rawCurrentBaseUrl && rawCurrentBaseUrl !== TIANJI_DEFAULT_BASE_URL && rawCurrentBaseUrl !== jixinBaseUrl) {
      return tianjiMarkManualConfig(currentConfig);
    }
    const current = tianjiNormalizeConfig(currentConfig || {});
    if (!force && current.syncSource === TIANJI_SYNC_SOURCE_MANUAL) return current;
    return tianjiNormalizeConfig({
      ...current,
      baseUrl: jixinBaseUrl,
      token: String(jixinConfig?.key || "").trim(),
      syncSource: TIANJI_SYNC_SOURCE_JIXIN
    });
  };

  const tianjiMarkManualConfig = (config = {}) =>
    tianjiNormalizeConfig({
      ...(config && typeof config === "object" ? config : {}),
      syncSource: TIANJI_SYNC_SOURCE_MANUAL
    });

  const tianjiGetSyncedConfigFromJixin = async (options = {}) => {
    const stored = await tianjiStorageGet(["tianjiSeedanceConfig", "apiConfigs"]);
    const currentConfig = tianjiNormalizeConfig(stored.tianjiSeedanceConfig || {});
    const jixinConfig = (Array.isArray(stored.apiConfigs) ? stored.apiConfigs : []).find(tianjiIsJixinApiConfig);
    if (!jixinConfig) return currentConfig;
    const nextConfig = tianjiBuildSyncedConfigFromJixin(currentConfig, jixinConfig, options);
    if (JSON.stringify(currentConfig) !== JSON.stringify(nextConfig)) {
      await tianjiStorageSet({ tianjiSeedanceConfig: nextConfig });
    }
    return nextConfig;
  };

  const tianjiApplyConfigToPanel = (panel, config) => {
    if (!panel) return;
    const nextConfig = tianjiNormalizeConfig(config || {});
    const fields = {
      baseUrl: nextConfig.baseUrl,
      token: nextConfig.token || "",
      sassId: nextConfig.sassId,
      platform: nextConfig.platform
    };
    Object.entries(fields).forEach(([field, value]) => {
      const input = panel.querySelector(`[data-tianji-field='${field}']`);
      if (input && input.value !== value) input.value = value;
    });
    const audioInput = panel.querySelector("[data-tianji-field='generateAudio']");
    const watermarkInput = panel.querySelector("[data-tianji-field='watermark']");
    if (audioInput) audioInput.checked = nextConfig.generateAudio !== false;
    if (watermarkInput) watermarkInput.checked = nextConfig.watermark === true;
  };

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

  const tianjiEnsureGroups = async (panel, preferredType = "AIGC") => {
    const targetKey = preferredType === "LivenessFace" ? "LivenessFace" : "AIGC";
    const currentGroups = {
      LivenessFace: panel?.querySelector("[data-tianji-field='liveGroupId']")?.value || tianjiGroupsState.LivenessFace || "",
      AIGC: panel?.querySelector("[data-tianji-field='aigcGroupId']")?.value || tianjiGroupsState.AIGC || ""
    };
    if (currentGroups[targetKey]) return currentGroups;
    const nextGroups = await tianjiSyncGroups(panel, preferredType);
    if (!nextGroups[targetKey]) throw new Error(`天玑未返回${preferredType === "LivenessFace" ? "真人" : "虚拟"}人像组 ID，请确认极鑫令牌权限后重试`);
    return nextGroups;
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
    const config = tianjiMarkManualConfig({
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

  const tianjiMergePagedAssets = (existing = [], incoming = [], pageNumber = 1) => {
    const pageSize = TIANJI_ASSET_PAGE_SIZE;
    const next = Array.isArray(existing) ? existing.slice() : [];
    const normalizedIncoming = tianjiMergeLocalAssets(incoming);
    normalizedIncoming.forEach((item, index) => {
      next[(Math.max(1, pageNumber) - 1) * pageSize + index] = item;
    });
    return next.filter(Boolean);
  };

  const tianjiLoadAssetPage = async (panel, type, pageNumber = 1) => {
    await tianjiSaveConfigFromPanel(panel);
    const normalizedType = type === "LivenessFace" ? "LivenessFace" : "AIGC";
    const groupId =
      panel.querySelector(`[data-tianji-field='${normalizedType === "LivenessFace" ? "liveGroupId" : "aigcGroupId"}']`)?.value ||
      tianjiGroupsState[normalizedType] ||
      "";
    if (!groupId) return [];
    const result = await tianjiRequest(tianjiSettingsState, "/api/cut/model/get-list-assets", {
      params: {
        group_ids: groupId,
        group_type: normalizedType,
        statuses: "Active",
        PageNumber: String(Math.max(1, pageNumber)),
        PageSize: String(TIANJI_ASSET_PAGE_SIZE),
        SortBy: "CreateTime",
        SortOrder: "Desc"
      }
    });
    const items = tianjiFindArray(result);
    tianjiAssetsState = {
      ...tianjiAssetsState,
      [normalizedType]: tianjiMergePagedAssets(tianjiAssetsState[normalizedType], items, pageNumber)
    };
    tianjiAssetPageEndState = {
      ...tianjiAssetPageEndState,
      [normalizedType]: items.length < TIANJI_ASSET_PAGE_SIZE
    };
    await tianjiStorageSet({ tianjiSeedanceAssets: tianjiAssetsState });
    return items;
  };

  const tianjiRenderAssetList = (panel) => {
    const target = panel.querySelector("[data-tianji-assets]");
    if (!target) return;
    const pageSize = TIANJI_ASSET_PAGE_SIZE;
    const renderGroup = (title, type) => {
      const assets = Array.isArray(tianjiAssetsState[type]) ? tianjiAssetsState[type] : [];
      const totalPages = Math.max(1, Math.ceil(assets.length / pageSize));
      const currentPage = Math.min(Math.max(Number(tianjiAssetPagesState[type] || 1), 1), totalPages);
      tianjiAssetPagesState[type] = currentPage;
      const pageAssets = assets.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      const canTryNextPage = pageAssets.length === pageSize && tianjiAssetPageEndState[type] !== true;
      const body = assets.length
        ? pageAssets.map((item) => {
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
      const pageControls = assets.length > pageSize || canTryNextPage
        ? `<div class="wanjuan-tianji-pager" data-tianji-pager="${type}">
            <button type="button" data-tianji-page="${type}" data-tianji-page-dir="-1" ${currentPage <= 1 ? "disabled" : ""}>上一页</button>
            <span>${currentPage} / ${currentPage >= totalPages && canTryNextPage ? "?" : totalPages}</span>
            <button type="button" data-tianji-page="${type}" data-tianji-page-dir="1" ${currentPage >= totalPages && !canTryNextPage ? "disabled" : ""}>下一页</button>
          </div>`
        : ``;
      return `<section><div class="wanjuan-tianji-subtitle-row"><div class="wanjuan-tianji-subtitle">${title} · ${assets.length} 个</div>${pageControls}</div><div class="wanjuan-tianji-grid">${body}</div></section>`;
    };
    target.innerHTML = renderGroup("虚拟人像", "AIGC") + renderGroup("真人人像", "LivenessFace");
    target.querySelectorAll("[data-tianji-page]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const type = button.getAttribute("data-tianji-page");
        const dir = Number(button.getAttribute("data-tianji-page-dir") || 0);
        if (!type || !dir) return;
        const assets = Array.isArray(tianjiAssetsState[type]) ? tianjiAssetsState[type] : [];
        const totalPages = Math.max(1, Math.ceil(assets.length / pageSize));
        const currentPage = Math.min(Math.max(Number(tianjiAssetPagesState[type] || 1), 1), totalPages);
        const nextPage = Math.max(currentPage + dir, 1);
        if (dir > 0 && nextPage > totalPages) {
          const loaded = await tianjiLoadAssetPage(panel, type, nextPage);
          if (!loaded.length) {
            tianjiAssetPageEndState = {
              ...tianjiAssetPageEndState,
              [type]: true
            };
            tianjiRenderAssetList(panel);
            return;
          }
        }
        const nextAssets = Array.isArray(tianjiAssetsState[type]) ? tianjiAssetsState[type] : [];
        const nextTotalPages = Math.max(1, Math.ceil(nextAssets.length / pageSize));
        tianjiAssetPagesState[type] = Math.min(Math.max(nextPage, 1), nextTotalPages);
        tianjiRenderAssetList(panel);
      });
    });
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
    const load = async (groupType, groupId, pageNumber = 1) => {
      if (!groupId) return { items: [], raw: null, summary: "缺少 group_id" };
      const result = await tianjiRequest(tianjiSettingsState, "/api/cut/model/get-list-assets", {
        params: {
          group_ids: groupId,
          group_type: groupType,
          statuses: "Active",
          PageNumber: String(Math.max(1, pageNumber)),
          PageSize: String(TIANJI_ASSET_PAGE_SIZE),
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
        const loaded = await load(groupType, primaryGroupId, 1);
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
    tianjiAssetPagesState = { LivenessFace: 1, AIGC: 1 };
    tianjiAssetPageEndState = {
      LivenessFace: loadedLive.length < TIANJI_ASSET_PAGE_SIZE,
      AIGC: loadedAigc.length < TIANJI_ASSET_PAGE_SIZE
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
    const stored = await tianjiStorageGet(["tianjiSeedanceAssets", "tianjiSeedanceGroups", "tianjiSeedanceSettingsMode"]);
    tianjiSettingsState = await tianjiGetSyncedConfigFromJixin();
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
      .wanjuan-tianji-settings-card{display:block!important;width:100%;height:auto!important;max-height:min(620px,calc(100vh - 260px));margin-top:12px;background:color-mix(in srgb,var(--wj-surface,#1a1a1a) 88%,var(--wj-bg,#121212) 12%);border:1px solid color-mix(in srgb,var(--wj-border,#333) 76%,transparent);border-radius:10px;overflow:auto;color:var(--wj-text,#d1d5db)}
      .wanjuan-tianji-settings-card *{box-sizing:border-box}
      .wanjuan-tianji-settings-card[hidden]{display:none!important}
      .wanjuan-tianji-settings-host{display:grid;gap:12px;min-width:0}
      .wanjuan-seedance-settings-card.wanjuan-tianji-mode-active .wanjuan-settings-card-body > :not(.wanjuan-tianji-mode-row):not(.wanjuan-tianji-settings-host){display:none!important}
      .wanjuan-seedance-settings-card.wanjuan-tianji-mode-active .wanjuan-tianji-settings-card{margin-top:0}
      .wanjuan-tianji-mode-row{display:flex!important;align-items:center;justify-content:space-between;gap:12px;border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:8px;background:color-mix(in srgb,var(--wj-surface-2,#121212) 78%,var(--wj-bg,#0f0f0f) 22%);padding:10px 12px}
      .wanjuan-tianji-mode-row-title{font-size:12px;font-weight:650;color:var(--wj-text,#d1d5db);line-height:1.25}
      .wanjuan-tianji-mode-row-help{font-size:11px;color:var(--wj-muted,#6b7280);margin-top:3px;line-height:1.35}
      .wanjuan-tianji-mode-host{display:flex;align-items:center;justify-content:flex-end;margin-left:0;vertical-align:middle}
      .wanjuan-tianji-mode-locked-field{display:block;min-width:0}
      .wanjuan-tianji-mode-readonly{display:flex;align-items:center;min-height:40px;line-height:1.35;border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:8px;background:color-mix(in srgb,var(--wj-surface-2,#121212) 82%,var(--wj-bg,#0f0f0f) 18%);color:var(--wj-text,#d1d5db);font-size:13px;font-weight:400;padding:9px 12px;box-shadow:none}
      .wanjuan-tianji-mode-switch{display:inline-flex;align-items:center;gap:3px;padding:3px;border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:9px;background:color-mix(in srgb,var(--wj-surface-2,#121212) 84%,var(--wj-bg,#0f0f0f) 16%);box-shadow:0 1px 0 rgba(255,255,255,.04) inset}
      .wanjuan-tianji-mode-switch button{height:26px;min-width:64px;padding:0 12px!important;border:1px solid transparent!important;border-radius:7px!important;background:transparent!important;color:var(--wj-muted,#9ca3af)!important;font-size:11px!important;font-weight:600!important;transition:background .14s ease,border-color .14s ease,color .14s ease,box-shadow .14s ease,transform .14s ease}
      .wanjuan-tianji-mode-switch button:not(.is-active):not([aria-pressed="true"]):hover{background:color-mix(in srgb,var(--wj-surface-3,#2a2a2a) 88%,var(--wj-accent,#60a5fa) 12%)!important;color:var(--wj-text,#d1d5db)!important}
      .wanjuan-tianji-mode-switch button:focus-visible{outline:2px solid color-mix(in srgb,var(--wj-accent,#60a5fa) 70%,#fff 30%)!important;outline-offset:2px!important}
      .wanjuan-tianji-body{padding:12px;display:grid!important;gap:14px;min-width:0}
      .wanjuan-tianji-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;min-width:0}
      .wanjuan-tianji-settings-card label{display:grid;gap:6px;min-width:0;font-size:11px;color:var(--wj-muted,#6b7280)}
      .wanjuan-tianji-settings-card input,.wanjuan-tianji-settings-card textarea,.wanjuan-tianji-settings-card select{width:100%;min-width:0;max-width:100%;background:color-mix(in srgb,var(--wj-surface-2,#121212) 82%,var(--wj-bg,#0f0f0f) 18%);border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);border-radius:8px;color:var(--wj-text,#e5e7eb);padding:9px 10px;font-size:12px;outline:none}
      .wanjuan-tianji-settings-card input:focus,.wanjuan-tianji-settings-card textarea:focus,.wanjuan-tianji-settings-card select:focus{border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 68%,var(--wj-border,#333))}
      .wanjuan-tianji-secret-field{position:relative;display:block;min-width:0}
      .wanjuan-tianji-secret-field input{padding-right:56px}
      .wanjuan-tianji-secret-toggle{position:absolute;right:6px;bottom:6px;height:26px;min-width:44px;padding:0 8px!important;border-radius:6px!important;font-size:10px!important;line-height:1!important}
      .wanjuan-tianji-settings-card textarea{min-height:76px;resize:vertical}
      .wanjuan-tianji-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .wanjuan-tianji-settings-card button{border:1px solid color-mix(in srgb,var(--wj-border,#333) 72%,transparent);background:color-mix(in srgb,var(--wj-surface-3,#222) 86%,transparent);color:var(--wj-text,#d1d5db);border-radius:7px;padding:7px 10px;font-size:11px;cursor:pointer}
      .wanjuan-tianji-settings-card button:hover{background:color-mix(in srgb,var(--wj-accent,#60a5fa) 10%,var(--wj-surface-3,#2a2a2a))}
      .wanjuan-tianji-mode-switch button.is-active,.wanjuan-tianji-mode-switch button[aria-pressed="true"]{background:var(--wj-accent,#60a5fa)!important;border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 88%,var(--wj-text,#fff) 12%)!important;color:var(--wj-on-accent,#fff)!important;font-weight:750!important;text-shadow:none!important;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 22%,transparent),0 0 0 1px color-mix(in srgb,var(--wj-accent,#60a5fa) 34%,transparent),0 6px 14px color-mix(in srgb,var(--wj-accent,#60a5fa) 26%,transparent)!important}
      .wanjuan-tianji-mode-switch button.is-active::before,.wanjuan-tianji-mode-switch button[aria-pressed="true"]::before{content:"✓";display:inline-block;margin-right:4px;font-size:10px;font-weight:900;line-height:1;color:currentColor}
      .wanjuan-tianji-primary{background:color-mix(in srgb,var(--wj-accent,#2563eb) 76%,var(--wj-surface-3,#222))!important;border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 80%,var(--wj-border,#333))!important;color:var(--wj-text,#fff)!important}
      .wanjuan-tianji-subtitle-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;margin:8px 0}
      .wanjuan-tianji-subtitle{font-size:12px;font-weight:700;color:var(--wj-text,#e5e7eb);margin:8px 0}
      .wanjuan-tianji-subtitle-row .wanjuan-tianji-subtitle{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wanjuan-tianji-pager{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;color:var(--wj-muted,#9ca3af);font-size:10px;line-height:1}
      .wanjuan-tianji-pager span{min-width:38px;text-align:center;font-variant-numeric:tabular-nums}
      .wanjuan-tianji-pager button{height:24px!important;min-width:46px!important;padding:0 7px!important;border-radius:6px!important;font-size:10px!important}
      .wanjuan-tianji-pager button:disabled{opacity:.42;cursor:not-allowed}
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
          <button data-tianji-action="syncJixin">同步极鑫配置</button>
          <button class="wanjuan-tianji-primary" data-tianji-action="save">保存</button>
          <span data-tianji-status-top style="font-size:11px;color:var(--wj-muted,#9ca3af);align-self:center"></span>
        </div>
        <div class="wanjuan-tianji-row">
          <label>接口地址<input data-tianji-field="baseUrl" value="${tianjiSettingsState.baseUrl}"></label>
          <label>Authorization Token<span class="wanjuan-tianji-secret-field"><input data-tianji-field="token" type="password" value="${tianjiEscapeHtml(tianjiSettingsState.token || "")}"><button type="button" class="wanjuan-tianji-secret-toggle" data-tianji-toggle-secret aria-pressed="false">显示</button></span></label>
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
          <label>上传类型<select data-tianji-upload-type><option value="AIGC">虚拟人像</option><option value="LivenessFace">真人人像</option></select></label>
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
        button.removeAttribute("style");
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
    const refreshPanelConfigFromJixin = async () => {
      tianjiSettingsState = await tianjiGetSyncedConfigFromJixin();
      tianjiApplyConfigToPanel(panel, tianjiSettingsState);
    };
    if (tianjiSettingsStorageListener) {
      window.chrome?.storage?.onChanged?.removeListener?.(tianjiSettingsStorageListener);
      tianjiSettingsStorageListener = null;
    }
    const handleTianjiStorageChange = (changes, areaName) => {
      if (areaName !== "local") return;
      if (changes?.apiConfigs || changes?.tianjiSeedanceConfig) {
        refreshPanelConfigFromJixin().catch((error) => console.warn("Tianji config storage sync failed", error));
      }
    };
    tianjiSettingsStorageListener = handleTianjiStorageChange;
    window.chrome?.storage?.onChanged?.addListener?.(tianjiSettingsStorageListener);
    panel.addEventListener("click", async (event) => {
      const secretToggle = event.target?.closest?.("[data-tianji-toggle-secret]");
      if (secretToggle) {
        event.preventDefault();
        event.stopPropagation();
        const tokenInput = panel.querySelector("[data-tianji-field='token']");
        const isVisible = tokenInput?.type === "text";
        if (tokenInput) tokenInput.type = isVisible ? "password" : "text";
        secretToggle.textContent = isVisible ? "显示" : "隐藏";
        secretToggle.setAttribute("aria-pressed", isVisible ? "false" : "true");
        return;
      }
      const action = event.target?.getAttribute?.("data-tianji-action");
      if (!action) return;
      try {
        status("处理中...");
        if (action === "syncJixin") {
          tianjiSettingsState = await tianjiGetSyncedConfigFromJixin({ force: true });
          tianjiApplyConfigToPanel(panel, tianjiSettingsState);
          status("已同步极鑫配置");
          return;
        }
        if (action !== "save") {
          tianjiSettingsState = await tianjiGetSyncedConfigFromJixin();
          tianjiApplyConfigToPanel(panel, tianjiSettingsState);
        }
        if (action === "save") await tianjiSaveConfigFromPanel(panel);
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
          const type = panel.querySelector("[data-tianji-upload-type]")?.value || "AIGC";
          const name = panel.querySelector("[data-tianji-upload-name]")?.value || file.name || "人像素材";
          status("正在获取人像组 ID...");
          await tianjiEnsureGroups(panel, type);
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
            reader.readAsDataURL(file);
          });
          status("正在上传公网图片...");
          const uploaded = await ipcRenderer.invoke("wanjuan:upload-public-media", {
            url: dataUrl,
            kind: "image",
            filename: `tianji-portrait-${Date.now()}`
          });
          if (!uploaded?.ok || !uploaded.url) throw new Error(uploaded?.error || "图片公网链接上传失败");
          status("正在提交天玑人像审核...");
          const uploadResult = await tianjiRequest(tianjiSettingsState, type === "AIGC" ? "/api/cut/model/upload-VirtralPortrait" : "/api/cut/model/upload-Portrait", {
            params: { image_url: uploaded.url, name }
          });
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

  const ensureWorkspaceStyle = () => {
    const existingStyle = document.getElementById("wanjuan-workspace-style");
    if (existingStyle) {
      document.head.appendChild(existingStyle);
      return;
    }
    const style = document.createElement("style");
    style.id = "wanjuan-workspace-style";
    style.textContent = `
      html.wanjuan-workspace-open .wanjuan-workspace-page{display:flex}
      html.wanjuan-workspace-open .wanjuan-app-nav-tab:not(.wanjuan-workspace-nav-tab){filter:saturate(.76);opacity:.72;color:var(--wanjuan-nav-text,#b6beca)!important}
      html.wanjuan-workspace-open .wanjuan-app-nav-tab:not(.wanjuan-workspace-nav-tab)::after{opacity:0!important;transform:translateX(-50%) scaleX(.16)!important}
      html.wanjuan-workspace-open .wanjuan-app-nav-tab:not(.wanjuan-workspace-nav-tab).wanjuan-app-nav-tab-active{color:var(--wanjuan-nav-text,#b6beca)!important}
      html.wanjuan-workspace-open .wanjuan-workspace-nav-tab{opacity:1!important;color:var(--wanjuan-nav-text-active,#f8fafc)!important}
      .wanjuan-workspace-page{position:absolute;inset:0;z-index:18;display:none;flex-direction:column;background:var(--wj-bg,#101214);color:var(--wj-text,#e5e7eb)}
      .wanjuan-workspace-header{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:8px 18px;border-bottom:1px solid var(--wj-border,#2b2f36);background:var(--wj-surface,#171a1f)}
      .wanjuan-workspace-title{font-size:16px;font-weight:800;color:var(--wj-text,#f8fafc)}
      .wanjuan-workspace-subtitle{font-size:11px;color:var(--wj-muted,#8b949e);margin-top:2px}
      .wanjuan-workspace-network-warning{margin-top:3px;font-size:10px;line-height:1.35;color:#f87171;max-width:min(760px,68vw)}
      .wanjuan-workspace-header-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
      .wanjuan-workspace-close-button{width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--wj-border,#303640);border-radius:8px;background:var(--wj-surface-2,#111419);color:var(--wj-muted,#cbd5e1);font-size:18px;line-height:1;cursor:pointer}
      .wanjuan-workspace-close-button:hover{border-color:color-mix(in srgb,var(--wj-accent,#3b82f6) 44%,var(--wj-border,#4b5563));background:color-mix(in srgb,var(--wj-surface-3,#252b35) 84%,var(--wj-accent,#3b82f6) 16%);color:var(--wj-text,#fff)}
      .wanjuan-workspace-tabs,.wanjuan-workspace-sections,.wanjuan-workspace-segment{display:inline-flex;align-items:center;gap:4px;padding:4px;border:1px solid var(--wj-border,#303640);border-radius:10px;background:var(--wj-surface-2,#111419)}
      .wanjuan-workspace-tabs button,.wanjuan-workspace-sections button,.wanjuan-workspace-segment button{height:30px;border:0;border-radius:7px;padding:0 12px;background:transparent;color:var(--wj-muted,#9ca3af);font-size:12px;font-weight:700;cursor:pointer}
      .wanjuan-workspace-tabs button.is-active,.wanjuan-workspace-sections button.is-active,.wanjuan-workspace-segment button.is-active{background:var(--wj-accent,#2563eb)!important;color:var(--wj-on-accent,var(--wanjuan-theme-on-primary,#fff))!important}
      .wanjuan-workspace-body{min-height:0;flex:1;display:grid;grid-template-columns:230px minmax(0,1fr);overflow:hidden}
      .wanjuan-workspace-sidebar{border-right:1px solid var(--wj-border,#2b2f36);background:var(--wj-surface-2,#14171c);padding:14px;display:flex;flex-direction:column;gap:12px;overflow:auto}
      .wanjuan-workspace-group-list{display:grid;grid-template-columns:1fr;gap:8px;width:100%;align-items:stretch}
      .wanjuan-workspace-content{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
      .wanjuan-workspace-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--wj-border,#252a31);background:var(--wj-surface-2,#111419)}
      .wanjuan-workspace-toolbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:0 0 auto;min-width:0}
      .wanjuan-workspace-search{height:34px;min-width:220px;max-width:420px;flex:1;border:1px solid var(--wj-border,#303640);border-radius:8px;background:var(--wj-surface,#171a1f);color:var(--wj-text,#e5e7eb);padding:0 11px;font-size:12px;outline:none}
      .wanjuan-workspace-search:focus{border-color:var(--wj-accent,#3b82f6)}
      .wanjuan-workspace-button{height:32px;min-width:0;border:1px solid var(--wj-border,#303640);border-radius:8px;background:var(--wj-surface-3,#1d222a);color:var(--wj-text,#d1d5db);padding:0 11px;font-size:12px;font-weight:700;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wanjuan-workspace-button:hover{border-color:color-mix(in srgb,var(--wj-accent,#3b82f6) 40%,var(--wj-border,#4b5563));background:color-mix(in srgb,var(--wj-surface-3,#252b35) 84%,var(--wj-accent,#3b82f6) 16%);color:var(--wj-text,#fff)}
      .wanjuan-workspace-button.primary{background:var(--wj-accent,#2563eb)!important;border-color:color-mix(in srgb,var(--wj-accent,#3b82f6) 78%,#fff 22%)!important;color:var(--wj-on-accent,var(--wanjuan-theme-on-primary,#fff))!important}
      .wanjuan-workspace-button.danger:hover{border-color:#ef4444;color:#fecaca}
      .wanjuan-workspace-list{min-height:0;flex:1;overflow:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));align-content:start;gap:12px}
      .wanjuan-workspace-list.wanjuan-workspace-function-list{grid-template-columns:repeat(auto-fill,minmax(300px,1fr));grid-auto-rows:max-content;align-content:start;align-items:start;gap:12px;overflow-y:auto;padding-bottom:24px}
      .wanjuan-workspace-card{border:1px solid var(--wj-border,#2c323b);border-radius:10px;background:var(--wj-surface,#171a1f);overflow:hidden;display:grid;grid-template-columns:minmax(112px,32%) minmax(0,1fr);min-width:0}
      .wanjuan-workspace-function-card{border:1px solid var(--wj-border,#2c323b);border-radius:10px;background:var(--wj-surface,#171a1f);overflow:hidden;display:flex;flex-direction:column;min-width:0;min-height:270px;height:auto;align-self:start;padding:12px;gap:10px}
      .wanjuan-workspace-function-card input[data-function-field='title']{height:36px;font-weight:750}
      .wanjuan-workspace-function-card textarea{height:128px!important;min-height:128px!important;max-height:220px;line-height:1.55;resize:vertical;flex:0 0 auto}
      .wanjuan-workspace-function-card .wanjuan-workspace-segment{width:100%;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding:4px}
      .wanjuan-workspace-function-card .wanjuan-workspace-segment button{height:32px;min-width:0;padding:0 6px;white-space:normal;line-height:1.12;overflow:hidden}
      .wanjuan-workspace-function-card-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
      .wanjuan-workspace-function-enabled{display:inline-flex;align-items:center;gap:7px;min-width:0;color:var(--wj-muted,#9ca3af);font-size:12px;line-height:1}
      .wanjuan-workspace-function-enabled input{width:14px!important;height:14px!important;min-width:14px;padding:0;accent-color:var(--wj-accent,#3b82f6)}
      .wanjuan-workspace-function-card-footer .wanjuan-workspace-button{width:76px;flex:0 0 auto}
      .wanjuan-workspace-card-media{aspect-ratio:9/16;width:100%;min-height:188px;background:color-mix(in srgb,var(--wj-bg,#0b0d10) 92%,#000 8%);display:grid;place-items:center;color:var(--wj-muted,#5f6b7a);font-size:12px;overflow:hidden;border-right:1px solid var(--wj-border,#2c323b)}
      .wanjuan-workspace-card-media img,.wanjuan-workspace-card-media video{width:100%;height:100%;object-fit:contain;background:#05070a}
      .wanjuan-workspace-card-media video{display:block}
      .wanjuan-workspace-card-body{padding:12px;display:grid;gap:8px;align-content:start;min-width:0}
      .wanjuan-workspace-card-title{font-size:13px;font-weight:800;color:var(--wj-text,#f3f4f6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wanjuan-workspace-card-meta{font-size:10px;color:var(--wj-muted,#7d8794);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wanjuan-workspace-card-prompt{font-size:12px;line-height:1.55;color:color-mix(in srgb,var(--wj-text,#cbd5e1) 82%,var(--wj-muted,#7d8794));display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:0}
      .wanjuan-workspace-card-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
      .wanjuan-workspace-group{width:100%;min-height:36px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--wj-border,#2b3038);border-radius:8px;background:var(--wj-surface,#171a1f);padding:8px 9px;font-size:12px;color:var(--wj-text,#d1d5db);cursor:pointer;text-align:left}
      .wanjuan-workspace-group span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wanjuan-workspace-group span:last-child{flex:0 0 auto}
      .wanjuan-workspace-group small{min-width:0;flex:1;color:var(--wj-muted,#7d8794);font-size:10px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
      .wanjuan-workspace-group-main{min-width:0;display:flex;align-items:center;gap:8px;flex:1}
      .wanjuan-workspace-group-count{flex:0 0 auto;color:var(--wj-muted,#9ca3af);font-size:11px;font-weight:750}
      .wanjuan-workspace-group-actions{display:flex;align-items:center;gap:4px;flex:0 0 auto}
      .wanjuan-workspace-group-action{width:24px;height:24px;display:grid;place-items:center;border:1px solid var(--wj-border,#303640);border-radius:6px;background:var(--wj-surface-2,#111419);color:var(--wj-muted,#cbd5e1);cursor:pointer;padding:0}
      .wanjuan-workspace-group-action svg{width:13px;height:13px;display:block;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
      .wanjuan-workspace-group-action:hover{border-color:color-mix(in srgb,var(--wj-accent,#3b82f6) 42%,var(--wj-border,#4b5563));background:color-mix(in srgb,var(--wj-surface-3,#252b35) 84%,var(--wj-accent,#3b82f6) 16%);color:var(--wj-text,#fff)}
      .wanjuan-workspace-group-action.danger:hover{border-color:#ef4444;color:#fecaca;background:color-mix(in srgb,#ef4444 13%,var(--wj-surface-3,#252b35))}
      .wanjuan-workspace-group.is-active{border-color:var(--wj-accent,#3b82f6);background:color-mix(in srgb,var(--wj-accent,#3b82f6) 18%,var(--wj-surface,#171a1f));color:var(--wj-text,#dbeafe)}
      .wanjuan-workspace-group.is-online{border-color:color-mix(in srgb,#22c55e 48%,var(--wj-border,#2b3038));background:color-mix(in srgb,#22c55e 10%,var(--wj-surface,#171a1f))}
      .wanjuan-workspace-group.is-error{border-color:color-mix(in srgb,#ef4444 44%,var(--wj-border,#2b3038));background:color-mix(in srgb,#ef4444 9%,var(--wj-surface,#171a1f))}
      .wanjuan-workspace-group.is-online small{color:#86efac}
      .wanjuan-workspace-group.is-error small{color:#fecaca}
      .wanjuan-workspace-member{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 8px;border:1px solid var(--wj-border,#2b3038);border-radius:8px;background:var(--wj-surface,#171a1f);padding:8px 9px;font-size:12px;color:var(--wj-text,#d1d5db);cursor:pointer;text-align:left}
      .wanjuan-workspace-member strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:750;color:inherit}
      .wanjuan-workspace-member .wanjuan-workspace-member-remove{grid-column:2;grid-row:1;align-self:start;font-size:11px;color:var(--wj-muted,#9ca3af)}
      .wanjuan-workspace-member .wanjuan-workspace-member-status{grid-column:1/-1;font-size:10px;line-height:1.45;color:var(--wj-muted,#8b95a3);overflow-wrap:anywhere}
      .wanjuan-workspace-member .wanjuan-workspace-member-detail{grid-column:1/-1;display:grid;gap:2px;margin-top:2px;font-size:10px;line-height:1.45;color:color-mix(in srgb,var(--wj-muted,#9ca3af) 88%,var(--wj-text,#e5e7eb));overflow-wrap:anywhere}
      .wanjuan-workspace-member.is-online{border-color:color-mix(in srgb,#22c55e 48%,var(--wj-border,#2b3038));background:color-mix(in srgb,#22c55e 10%,var(--wj-surface,#171a1f))}
      .wanjuan-workspace-member.is-online .wanjuan-workspace-member-status{color:#86efac}
      .wanjuan-workspace-member.is-error{border-color:color-mix(in srgb,#ef4444 44%,var(--wj-border,#2b3038));background:color-mix(in srgb,#ef4444 9%,var(--wj-surface,#171a1f))}
      .wanjuan-workspace-member.is-error .wanjuan-workspace-member-status{color:#fecaca}
      .wanjuan-workspace-member.is-error .wanjuan-workspace-member-detail{color:color-mix(in srgb,#fecaca 86%,var(--wj-muted,#9ca3af))}
      .wanjuan-workspace-empty{grid-column:1/-1;border:1px dashed var(--wj-border,#374151);border-radius:12px;padding:34px;text-align:center;color:var(--wj-muted,#7d8794);font-size:13px}
      .wanjuan-workspace-form{display:grid;gap:9px;padding:12px;border:1px solid var(--wj-border,#2c323b);border-radius:10px;background:var(--wj-surface,#171a1f)}
      .wanjuan-workspace-field-label{display:grid;gap:5px;min-width:0;font-size:11px;font-weight:700;color:var(--wj-muted,#9ca3af)}
      .wanjuan-workspace-field-help{font-size:10px;line-height:1.45;color:var(--wj-muted,#7d8794);margin-top:-2px}
      .wanjuan-workspace-form input,.wanjuan-workspace-form textarea,.wanjuan-workspace-form select,.wanjuan-workspace-card input,.wanjuan-workspace-card textarea,.wanjuan-workspace-card select{width:100%;min-width:0;border:1px solid var(--wj-border,#303640);border-radius:8px;background:var(--wj-surface-2,#111419);color:var(--wj-text,#e5e7eb);padding:9px 10px;font-size:12px;outline:none}
      .wanjuan-workspace-form textarea,.wanjuan-workspace-card textarea{min-height:92px;resize:vertical}
      .wanjuan-workspace-team-status{font-size:11px;color:var(--wj-muted,#9ca3af);line-height:1.6;border:1px solid var(--wj-border,#2c323b);border-radius:10px;background:var(--wj-surface,#171a1f);padding:10px;overflow-wrap:anywhere}
      .wanjuan-workspace-team-status strong{display:block;color:var(--wj-text,#e5e7eb);font-weight:800;margin:2px 0}
      .wanjuan-workspace-team-status small{display:block;color:var(--wj-muted,#7d8794);line-height:1.5;margin-top:4px}
      .wanjuan-workspace-team-url-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;margin:3px 0}
      .wanjuan-workspace-team-url-row strong{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wanjuan-workspace-copy-url{height:26px;border:1px solid var(--wj-border,#303640);border-radius:7px;background:var(--wj-surface-3,#1d222a);color:var(--wj-text,#d1d5db);padding:0 8px;font-size:11px;font-weight:750;cursor:pointer}
      .wanjuan-workspace-copy-url:hover{border-color:color-mix(in srgb,var(--wj-accent,#3b82f6) 44%,var(--wj-border,#4b5563));background:color-mix(in srgb,var(--wj-surface-3,#252b35) 84%,var(--wj-accent,#3b82f6) 16%);color:var(--wj-text,#fff)}
      .wanjuan-workspace-toast{position:fixed;right:18px;bottom:22px;z-index:2147483600;background:var(--wj-surface-2,#111827);color:var(--wj-text,#fff);border:1px solid var(--wj-border,#374151);border-radius:10px;padding:10px 13px;font-size:12px;box-shadow:var(--wj-shadow-popover,0 18px 50px rgba(0,0,0,.42))}
      html.wanjuan-workspace-open .wanjuan-workspace-page .wanjuan-workspace-tabs button.is-active,
      html.wanjuan-workspace-open .wanjuan-workspace-page .wanjuan-workspace-sections button.is-active,
      html.wanjuan-workspace-open .wanjuan-workspace-page .wanjuan-workspace-segment button.is-active,
      html.wanjuan-workspace-open .wanjuan-workspace-page .wanjuan-workspace-button.primary{
        background:var(--wj-accent,#2563eb)!important;
        background-color:var(--wj-accent,#2563eb)!important;
        border-color:color-mix(in srgb,var(--wj-accent,#3b82f6) 78%,#fff 22%)!important;
        color:var(--wj-on-accent,var(--wanjuan-theme-on-primary,#fff))!important;
      }
      .wanjuan-node-popover-option:not(.wanjuan-node-popover-option-active):hover,
      .wanjuan-node-popover-option:not(.wanjuan-node-popover-option-active):focus-visible{background:color-mix(in srgb,var(--wj-surface-3,#2a2a2a) 86%,var(--wj-accent,#60a5fa) 14%)!important;color:var(--wj-text,#f3f4f6)!important;border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 34%,var(--wj-border,#333))!important;box-shadow:none!important}
      .wanjuan-node-popover-option-active,
      .wanjuan-node-popover-option-active:hover,
      .wanjuan-node-popover-option-active:focus-visible{background:var(--wj-accent,#2563eb)!important;background-color:var(--wj-accent,#2563eb)!important;color:var(--wj-on-accent,#fff)!important;border-color:color-mix(in srgb,var(--wj-accent,#60a5fa) 78%,#fff 22%)!important;box-shadow:none!important}
      .wanjuan-settings-save-button{background:var(--wj-accent,#2563eb)!important;background-color:var(--wj-accent,#2563eb)!important;background-image:none!important;color:var(--wj-on-accent,#fff)!important;box-shadow:0 10px 28px color-mix(in srgb,var(--wj-accent,#2563eb) 24%,transparent)!important}
      .wanjuan-settings-save-button:hover,
      .wanjuan-settings-save-button:focus-visible{background:color-mix(in srgb,var(--wj-accent,#2563eb) 86%,#fff 14%)!important;background-color:color-mix(in srgb,var(--wj-accent,#2563eb) 86%,#fff 14%)!important;background-image:none!important;color:var(--wj-on-accent,#fff)!important;box-shadow:0 10px 28px color-mix(in srgb,var(--wj-accent,#2563eb) 30%,transparent)!important}
      @media(max-width:900px){.wanjuan-workspace-body{grid-template-columns:1fr}.wanjuan-workspace-sidebar{display:none}.wanjuan-workspace-toolbar{flex-wrap:wrap}.wanjuan-workspace-search{max-width:none}.wanjuan-workspace-toolbar-actions{width:100%;justify-content:flex-start}.wanjuan-workspace-toolbar-actions .wanjuan-workspace-button{flex:0 0 auto}}
      @media(max-width:560px){.wanjuan-workspace-header{padding:8px 12px}.wanjuan-workspace-subtitle{display:none}.wanjuan-workspace-network-warning{max-width:calc(100vw - 132px)}.wanjuan-workspace-list{grid-template-columns:1fr}.wanjuan-workspace-card{grid-template-columns:104px minmax(0,1fr)}.wanjuan-workspace-card-media{min-height:184px}.wanjuan-workspace-card-actions{grid-template-columns:1fr}.wanjuan-workspace-function-card .wanjuan-workspace-segment{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  };

  const renderWorkspaceGroups = (groups, templates) => {
    const counts = new Map();
    templates.forEach((template) => counts.set(template.groupId || "", (counts.get(template.groupId || "") || 0) + 1));
    return [
      `<button class="wanjuan-workspace-group ${workspaceState.selectedGroupId === "" ? "is-active" : ""}" data-workspace-group=""><span>全部模板</span><span>${templates.length}</span></button>`,
      `<button class="wanjuan-workspace-group ${workspaceState.selectedGroupId === "__ungrouped" ? "is-active" : ""}" data-workspace-group="__ungrouped"><span>未分组</span><span>${counts.get("") || 0}</span></button>`,
      ...groups.map((group) => `
        <div class="wanjuan-workspace-group ${workspaceState.selectedGroupId === group.id ? "is-active" : ""}" data-workspace-group="${workspaceEscapeHtml(group.id)}" role="button" tabindex="0">
          <span class="wanjuan-workspace-group-main"><span>${workspaceEscapeHtml(group.name)}</span><span class="wanjuan-workspace-group-count">${counts.get(group.id) || 0}</span></span>
          <span class="wanjuan-workspace-group-actions">
            <button type="button" class="wanjuan-workspace-group-action" data-workspace-group-action="rename" data-workspace-group-id="${workspaceEscapeHtml(group.id)}" title="重命名分组" aria-label="重命名分组"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            <button type="button" class="wanjuan-workspace-group-action danger" data-workspace-group-action="delete" data-workspace-group-id="${workspaceEscapeHtml(group.id)}" title="删除分组" aria-label="删除分组"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg></button>
          </span>
        </div>
      `)
    ].join("");
  };

  const renderWorkspaceTemplateCard = (template, options = {}) => {
    const sourceName = options.memberName || template.memberName || template.sourceMemberName || "";
    const groups = Array.isArray(options.groups) ? options.groups : [];
    const isLocalTeamTemplate = options.team && template.sourceMemberAddress === "local";
    const groupSelect = options.team ? "" : `
      <select data-workspace-template-group title="模板分组">
        <option value="" ${template.groupId ? "" : "selected"}>未分组</option>
        ${groups.map((group) => `<option value="${workspaceEscapeHtml(group.id)}" ${template.groupId === group.id ? "selected" : ""}>${workspaceEscapeHtml(group.name)}</option>`).join("")}
      </select>
    `;
    const media = template.resultUrl ?
      `<video src="${workspaceEscapeHtml(template.resultUrl)}" ${template.thumbnailUrl ? `poster="${workspaceEscapeHtml(template.thumbnailUrl)}"` : ""} controls playsinline preload="metadata"></video>` :
      template.thumbnailUrl ?
        `<img src="${workspaceEscapeHtml(template.thumbnailUrl)}" alt="">` :
        `<span>无结果预览</span>`;
    return `
      <article class="wanjuan-workspace-card" data-template-id="${workspaceEscapeHtml(template.id)}">
        <div class="wanjuan-workspace-card-media">${media}</div>
        <div class="wanjuan-workspace-card-body">
          <div class="wanjuan-workspace-card-title" title="${workspaceEscapeHtml(template.title)}">${workspaceEscapeHtml(template.title)}</div>
          <div class="wanjuan-workspace-card-meta">${workspaceEscapeHtml([sourceName, template.modelName || template.sourceProvider, workspaceDateLabel(template.updatedAt)].filter(Boolean).join(" · "))}</div>
          <div class="wanjuan-workspace-card-prompt">${workspaceEscapeHtml(template.prompt)}</div>
          ${groupSelect}
          <div class="wanjuan-workspace-card-actions">
            ${options.team ? `<button class="wanjuan-workspace-button primary" data-workspace-action="use-team-template">使用</button>${isLocalTeamTemplate ? `<button class="wanjuan-workspace-button danger" data-workspace-action="delete-team-template">删除</button>` : `<button class="wanjuan-workspace-button" data-workspace-action="copy-team-template">存到个人</button>`}` : `<button class="wanjuan-workspace-button primary" data-workspace-action="use-template">使用</button><button class="wanjuan-workspace-button" data-workspace-action="publish-template">发到团队</button>`}
            <button class="wanjuan-workspace-button" data-workspace-action="copy-prompt">复制提示词</button>
            ${options.team ? "" : `<button class="wanjuan-workspace-button danger" data-workspace-action="delete-template">删除</button>`}
          </div>
        </div>
      </article>
    `;
  };

  const renderWorkspaceFunctionTypeSegment = (type = "all") => {
    const normalizedType = String(type || "all");
    return `
      <div class="wanjuan-workspace-segment" data-function-field="type" role="group" aria-label="功能提示词类型">
        ${[
          ["all", "通用"],
          ["text", "文本"],
          ["image", "图片"],
          ["video", "视频"],
        ].map(([value, label]) => `<button type="button" data-function-type="${value}" class="${normalizedType === value ? "is-active" : ""}">${label}</button>`).join("")}
      </div>
    `;
  };

  const renderWorkspacePanel = async () => {
    const page = document.querySelector(".wanjuan-workspace-page");
    if (!page) return;
    const renderSeq = ++workspaceRenderSeq;
    const activeElement = document.activeElement;
    const activeWorkspaceField = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement ?
      activeElement.getAttribute("data-workspace-field") || "" :
      "";
    const activeSelectionStart = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement ?
      activeElement.selectionStart :
      null;
    const activeSelectionEnd = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement ?
      activeElement.selectionEnd :
      null;
    const data = await workspaceReadAll();
    const restoredStatus = workspaceState.activeSpace === "team" ? await workspaceEnsureTeamService(data) : null;
    const statusResult = restoredStatus ? { ok: true, status: restoredStatus } : await Promise.resolve(window.wanjuanDesktop?.workspaceTeamStatus?.()).catch(() => null);
    if (renderSeq !== workspaceRenderSeq) return;
    workspaceState.status = statusResult?.status || workspaceState.status;
    const query = workspaceState.query.trim().toLowerCase();
    const filterTemplates = (templates) => templates.filter((template) => {
      if (workspaceState.selectedGroupId === "__ungrouped" && template.groupId) return false;
      if (workspaceState.selectedGroupId && workspaceState.selectedGroupId !== "__ungrouped" && template.groupId !== workspaceState.selectedGroupId) return false;
      if (!query) return true;
      return `${template.title} ${template.prompt} ${template.modelName}`.toLowerCase().includes(query);
    });
    const filterFunctionPrompts = (prompts) => prompts
      .map((prompt, index) => ({ prompt, index }))
      .filter(({ prompt }) => !query || `${prompt.title || ""} ${prompt.prompt || ""} ${prompt.type || ""}`.toLowerCase().includes(query));
    const personalTemplates = filterTemplates(data.templates);
    const functionPrompts = filterFunctionPrompts(data.presetPrompts);
    const localTeamTemplates = data.publishedTemplates.map((template) => ({
      ...template,
      memberName: data.teamSettings.memberName || "本机",
      sourceMemberAddress: "local",
    }));
    const remoteTeamTemplates = workspaceState.teamResults.flatMap((result) =>
      (result.templates || []).map((template) => ({
        ...template,
        memberName: result.manifest?.memberName || result.name || result.address,
        sourceMemberAddress: result.address,
      }))
    );
    const teamTemplates = [...localTeamTemplates, ...remoteTeamTemplates]
      .filter((template) => !query || `${template.title} ${template.prompt} ${template.modelName} ${template.memberName}`.toLowerCase().includes(query));
    const teamUrls = workspaceState.status?.urls || [];
    const allTeamUrls = workspaceState.status?.allUrls || teamUrls;
    const preferredUrl = workspaceState.status?.preferredUrl || teamUrls[0] || "";
    const otherTeamUrls = allTeamUrls.filter((url) => url && url !== preferredUrl);
    const teamStatusHtml = data.teamSettings.enabled && workspaceState.status?.running ?
      `
        已开启，其他成员优先添加：
        <div class="wanjuan-workspace-team-url-row">
          <strong title="${workspaceEscapeHtml(preferredUrl || `端口 ${workspaceState.status.port}`)}">${workspaceEscapeHtml(preferredUrl || `端口 ${workspaceState.status.port}`)}</strong>
          ${preferredUrl ? `<button type="button" class="wanjuan-workspace-copy-url" data-workspace-action="copy-team-url">复制</button>` : ""}
        </div>
        <small>当前共享模板：${data.publishedTemplates.length} 个。可在另一台电脑浏览器打开此地址检查是否连通。</small>
        ${otherTeamUrls.length ? `<small>其他可用地址：${workspaceEscapeHtml(otherTeamUrls.join("，"))}</small>` : ""}
        <small>如果推荐地址连不上，让对方改用同一 Wi-Fi/网线网段里的另一个 192.168/10/172 地址。</small>
      ` :
      `未开启。Windows 首次开启如无法访问，请允许防火墙访问当前端口。${workspaceState.teamServiceError ? `<small>错误：${workspaceEscapeHtml(workspaceState.teamServiceError)}</small>` : ""}`;
    const teamMemberStatusHtml = (data.teamSettings.members || []).map((member) => {
      const address = typeof member === "string" ? member : member.address;
      const result = (workspaceState.teamResults || []).find((item) =>
        item.address === address ||
        item.inputAddress === address ||
        item.address === String(address || "").replace(/\/$/, "") ||
        item.inputAddress === String(address || "").replace(/\/$/, "")
      );
      const statusText = result ? (result.ok ? `${(result.templates || []).length} 个模板` : `连接失败：${result.error || "未知错误"}`) : "未刷新";
      const diagnostics = Array.isArray(result?.diagnostics) ? result.diagnostics.filter(Boolean).slice(0, 3) : [];
      const detailLines = result && !result.ok ? [
        result.detail || result.endpoint || "",
        result.errorCode ? `系统错误码：${result.errorCode}` : "",
        ...diagnostics,
      ].filter(Boolean) : [];
      const detailHtml = detailLines.length ?
        `<div class="wanjuan-workspace-member-detail">${detailLines.map((line) => `<span>${workspaceEscapeHtml(line)}</span>`).join("")}</div>` :
        "";
      return `
        <button class="wanjuan-workspace-member ${result?.ok ? "is-online" : result ? "is-error" : ""}" data-workspace-member="${workspaceEscapeHtml(address)}">
          <strong>${workspaceEscapeHtml(address)}</strong>
          <span class="wanjuan-workspace-member-remove">移除</span>
          <span class="wanjuan-workspace-member-status">${workspaceEscapeHtml(statusText)}</span>
          ${detailHtml}
        </button>
      `;
    }).join("");
    page.innerHTML = `
      <div class="wanjuan-workspace-header">
        <div>
          <div class="wanjuan-workspace-title">工作空间</div>
          <div class="wanjuan-workspace-subtitle">个人提示词资产和局域网团队模板共享</div>
          <div class="wanjuan-workspace-network-warning">更换网络环境（如更换Wi-Fi频段，更换有线网，开启VPN等情况）需要关闭团队空间后关闭软件再重新开启软件与团队空间，重新复制更换后的局域网端口。</div>
        </div>
        <div class="wanjuan-workspace-header-actions">
          <div class="wanjuan-workspace-tabs">
            <button data-workspace-space="personal" class="${workspaceState.activeSpace === "personal" ? "is-active" : ""}">个人空间</button>
            <button data-workspace-space="team" class="${workspaceState.activeSpace === "team" ? "is-active" : ""}">团队空间</button>
          </div>
          <button type="button" class="wanjuan-workspace-close-button" data-workspace-action="close" title="关闭工作空间" aria-label="关闭工作空间">×</button>
        </div>
      </div>
      <div class="wanjuan-workspace-body">
        <aside class="wanjuan-workspace-sidebar">
          ${workspaceState.activeSpace === "personal" ? `
            <div class="wanjuan-workspace-sections">
              <button data-workspace-section="templates" class="${workspaceState.activeSection === "templates" ? "is-active" : ""}">提示词模板</button>
              <button data-workspace-section="functionPrompts" class="${workspaceState.activeSection === "functionPrompts" ? "is-active" : ""}">功能提示词</button>
            </div>
            ${workspaceState.activeSection === "templates" ? `
              <button class="wanjuan-workspace-button primary" data-workspace-action="save-selected-node">保存选中节点</button>
              <button class="wanjuan-workspace-button" data-workspace-action="new-group">新建分组</button>
              <div class="wanjuan-workspace-group-list">${renderWorkspaceGroups(data.groups, data.templates)}</div>
            ` : `<button class="wanjuan-workspace-button primary" data-workspace-action="add-function-prompt">新增功能提示词</button>`}
          ` : `
            <div class="wanjuan-workspace-team-status">${teamStatusHtml}</div>
            <button class="wanjuan-workspace-button ${data.teamSettings.enabled ? "" : "primary"}" data-workspace-action="${data.teamSettings.enabled ? "stop-team" : "start-team"}">${data.teamSettings.enabled ? "关闭团队空间" : "开启团队空间"}</button>
            <div class="wanjuan-workspace-form">
              <label class="wanjuan-workspace-field-label">我的团队昵称<input data-workspace-field="memberName" value="${workspaceEscapeHtml(data.teamSettings.memberName || "")}" placeholder="例如：设计一号机"></label>
              <label class="wanjuan-workspace-field-label">团队空间端口<input data-workspace-field="teamPort" value="${workspaceEscapeHtml(data.teamSettings.port || 39218)}" placeholder="39218" inputmode="numeric"></label>
              <div class="wanjuan-workspace-field-help">这是本机对外共享团队空间使用的端口；其他电脑共享时可使用各自设置的端口。</div>
              <button class="wanjuan-workspace-button" data-workspace-action="save-team-settings">保存团队设置</button>
            </div>
            <div class="wanjuan-workspace-form">
              <input data-workspace-field="memberAddress" value="${workspaceEscapeHtml(workspaceState.teamMemberAddress)}" placeholder="成员地址，如 192.168.1.8:39218">
              <button class="wanjuan-workspace-button primary" data-workspace-action="add-member">添加成员</button>
              <button class="wanjuan-workspace-button" data-workspace-action="refresh-team">${workspaceState.teamRefreshing ? "刷新中" : "刷新团队"}</button>
            </div>
            <div class="wanjuan-workspace-group-list">${teamMemberStatusHtml}</div>
          `}
        </aside>
        <main class="wanjuan-workspace-content">
          <div class="wanjuan-workspace-toolbar">
            <input class="wanjuan-workspace-search" data-workspace-field="query" value="${workspaceEscapeHtml(workspaceState.query)}" placeholder="搜索标题、提示词、模型">
            <div class="wanjuan-workspace-toolbar-actions">
              ${workspaceState.activeSpace === "personal" && workspaceState.activeSection === "functionPrompts" ? `<button class="wanjuan-workspace-button primary" data-workspace-action="add-function-prompt">新增功能提示词</button>` : ""}
              <button class="wanjuan-workspace-button" data-workspace-action="close">返回</button>
            </div>
          </div>
          ${workspaceState.activeSpace === "personal" && workspaceState.activeSection === "functionPrompts" ? `
            <div class="wanjuan-workspace-list wanjuan-workspace-function-list">
              ${functionPrompts.length ? functionPrompts.map(({ prompt, index }) => `
                <article class="wanjuan-workspace-function-card" data-function-prompt-index="${index}">
                  <input data-function-field="title" value="${workspaceEscapeHtml(prompt.title || "")}" placeholder="标题">
                  ${renderWorkspaceFunctionTypeSegment(prompt.type)}
                  <textarea data-function-field="prompt" placeholder="提示词内容">${workspaceEscapeHtml(prompt.prompt || "")}</textarea>
                  <div class="wanjuan-workspace-function-card-footer">
                    <label class="wanjuan-workspace-function-enabled"><input type="checkbox" data-function-field="enabled" ${prompt.enabled !== false ? "checked" : ""}>启用</label>
                    <button class="wanjuan-workspace-button danger" data-workspace-action="delete-function-prompt">删除</button>
                  </div>
                </article>
              `).join("") : `<div class="wanjuan-workspace-empty">${query ? "没有匹配的功能提示词" : "暂无功能提示词"}</div>`}
            </div>
          ` : `
            <div class="wanjuan-workspace-list">
              ${workspaceState.activeSpace === "team" ?
                (teamTemplates.length ? teamTemplates.map((template) => renderWorkspaceTemplateCard(template, { team: true, memberName: template.memberName })).join("") : `<div class="wanjuan-workspace-empty">暂无团队模板。先添加成员地址并刷新，或让本机发布模板。</div>`) :
                (personalTemplates.length ? personalTemplates.map((template) => renderWorkspaceTemplateCard(template, { groups: data.groups })).join("") : `<div class="wanjuan-workspace-empty">暂无提示词模板。可以从画布选中生成完成的即梦节点后点击“保存选中节点”。</div>`)
              }
            </div>
          `}
        </main>
      </div>
    `;
    if (activeWorkspaceField) {
      const nextActive = page.querySelector(`[data-workspace-field='${activeWorkspaceField}']`);
      if (nextActive instanceof HTMLInputElement || nextActive instanceof HTMLTextAreaElement || nextActive instanceof HTMLSelectElement) {
        nextActive.focus();
        if (
          activeSelectionStart != null &&
          activeSelectionEnd != null &&
          (nextActive instanceof HTMLInputElement || nextActive instanceof HTMLTextAreaElement)
        ) {
          nextActive.setSelectionRange(activeSelectionStart, activeSelectionEnd);
        }
      }
    }
  };

  const bindWorkspacePanelEvents = () => {
    if (workspacePanelInstalled) return;
    workspacePanelInstalled = true;

    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const nativeNavTab = target.closest(".wanjuan-app-nav-tab:not(.wanjuan-workspace-nav-tab)");
      if (nativeNavTab) {
        document.documentElement.classList.remove("wanjuan-workspace-open");
        document.querySelector(".wanjuan-workspace-nav-tab")?.classList.remove("wanjuan-app-nav-tab-active");
      }

      const page = target.closest(".wanjuan-workspace-page");
      if (!page) return;

      const functionTypeButton = target.closest("[data-function-type]");
      if (functionTypeButton) {
        const index = Number(functionTypeButton.closest("[data-function-prompt-index]")?.getAttribute("data-function-prompt-index"));
        if (!Number.isInteger(index)) return;
        const data = await workspaceReadAll();
        const nextPrompts = data.presetPrompts.map((prompt, itemIndex) =>
          itemIndex === index ? { ...prompt, type: functionTypeButton.getAttribute("data-function-type") || "all" } : prompt
        );
        await workspaceStorageSet({ presetPrompts: nextPrompts });
        await renderWorkspacePanel();
        return;
      }

      const spaceButton = target.closest("[data-workspace-space]");
      if (spaceButton) {
        workspaceState.activeSpace = spaceButton.getAttribute("data-workspace-space") || "personal";
        if (workspaceState.activeSpace === "team") workspaceState.activeSection = "templates";
        await renderWorkspacePanel();
        return;
      }

      const sectionButton = target.closest("[data-workspace-section]");
      if (sectionButton) {
        workspaceState.activeSection = sectionButton.getAttribute("data-workspace-section") || "templates";
        await renderWorkspacePanel();
        return;
      }

      const groupActionButton = target.closest("[data-workspace-group-action]");
      if (groupActionButton) {
        const groupId = groupActionButton.getAttribute("data-workspace-group-id") || "";
        const groupAction = groupActionButton.getAttribute("data-workspace-group-action") || "";
        if (!groupId || !groupAction) return;
        const data = await workspaceReadAll();
        const group = data.groups.find((item) => item.id === groupId);
        if (!group) return;
        if (groupAction === "rename") {
          const name = await window.wanjuanDesktop?.showInputDialog?.({
            title: "重命名分组",
            message: "输入新的分组名称",
            defaultValue: group.name || "未命名分组",
          });
          const nextName = String(name || "").trim();
          if (!nextName) return;
          await workspaceStorageSet({
            workspacePromptTemplateGroups: data.groups.map((item) =>
              item.id === groupId ? { ...item, name: nextName, updatedAt: Date.now() } : item
            ),
          });
          workspaceToast("分组已重命名");
          await renderWorkspacePanel();
          return;
        }
        if (groupAction === "delete") {
          const templateCount = data.templates.filter((template) => template.groupId === groupId).length;
          const confirmed = window.confirm(`删除分组“${group.name}”？${templateCount ? `\n该分组下 ${templateCount} 个模板会移到“未分组”。` : ""}`);
          if (!confirmed) return;
          const updatedAt = Date.now();
          const nextTemplates = data.templates.map((template) =>
            template.groupId === groupId ? { ...template, groupId: "", updatedAt } : template
          );
          const nextPublishedTemplates = data.publishedTemplates.map((template) =>
            template.groupId === groupId ? { ...template, groupId: "", updatedAt } : template
          );
          await workspaceStorageSet({
            workspacePromptTemplateGroups: data.groups.filter((item) => item.id !== groupId),
            workspacePromptTemplates: nextTemplates,
            workspacePublishedTemplates: nextPublishedTemplates,
          });
          await workspaceSyncPublishedTemplates(nextPublishedTemplates);
          if (workspaceState.selectedGroupId === groupId) workspaceState.selectedGroupId = "";
          workspaceToast("分组已删除");
          await renderWorkspacePanel();
          return;
        }
      }

      const groupButton = target.closest("[data-workspace-group]");
      if (groupButton) {
        workspaceState.selectedGroupId = groupButton.getAttribute("data-workspace-group") || "";
        await renderWorkspacePanel();
        return;
      }

      const memberButton = target.closest("[data-workspace-member]");
      if (memberButton) {
        const address = memberButton.getAttribute("data-workspace-member") || "";
        const data = await workspaceReadAll();
        await workspaceStorageSet({
          workspaceTeamSettings: {
            ...data.teamSettings,
            members: (data.teamSettings.members || []).filter((member) => (typeof member === "string" ? member : member.address) !== address),
          }
        });
        workspaceState.teamResults = (workspaceState.teamResults || []).filter((result) => result.address !== address);
        await renderWorkspacePanel();
        return;
      }

      const actionButton = target.closest("[data-workspace-action]");
      if (!actionButton) return;
      const action = actionButton.getAttribute("data-workspace-action") || "";
      const card = actionButton.closest("[data-template-id]");
      const templateId = card?.getAttribute("data-template-id") || "";
      const data = await workspaceReadAll();
      const personalTemplate = data.templates.find((item) => item.id === templateId);
      const teamTemplate = workspaceFindTeamTemplate(templateId);
      const localPublishedTemplate = data.publishedTemplates.find((item) => item.id === templateId);
      const selectedTemplate = workspaceState.activeSpace === "team" ? (teamTemplate || localPublishedTemplate) : personalTemplate;

      if (action === "close") {
        workspaceOpenCanvas();
        return;
      }
      if (action === "save-selected-node") {
        workspaceOpenCanvas();
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("wanjuan:workspace-save-node-template"));
        }, 120);
        return;
      }
      if (action === "new-group") {
        const name = await window.wanjuanDesktop?.showInputDialog?.({
          title: "新建分组",
          message: "输入提示词模板分组名称",
          defaultValue: "新分组",
        });
        if (!String(name || "").trim()) return;
        await workspaceStorageSet({
          workspacePromptTemplateGroups: [
            workspaceNormalizeGroup({ name: String(name).trim() }),
            ...data.groups,
          ],
        });
        await renderWorkspacePanel();
        return;
      }
      if (action === "add-function-prompt") {
        await workspaceStorageSet({
          presetPrompts: [
            ...data.presetPrompts,
            { title: "新功能提示词", prompt: "", type: "all", enabled: true },
          ],
        });
        await renderWorkspacePanel();
        return;
      }
      if (action === "delete-function-prompt") {
        const index = Number(actionButton.closest("[data-function-prompt-index]")?.getAttribute("data-function-prompt-index"));
        if (!Number.isInteger(index)) return;
        await workspaceStorageSet({ presetPrompts: data.presetPrompts.filter((_, itemIndex) => itemIndex !== index) });
        await renderWorkspacePanel();
        return;
      }
      if (action === "delete-template" && personalTemplate) {
        await workspaceStorageSet({
          workspacePromptTemplates: data.templates.filter((item) => item.id !== personalTemplate.id),
          workspacePublishedTemplates: data.publishedTemplates.filter((item) => item.id !== personalTemplate.id),
        });
        await workspaceSyncPublishedTemplates(data.publishedTemplates.filter((item) => item.id !== personalTemplate.id));
        workspaceToast("已删除模板");
        await renderWorkspacePanel();
        return;
      }
      if (action === "publish-template" && personalTemplate) {
        await workspacePublishTemplate(personalTemplate);
        return;
      }
      if (action === "delete-team-template" && localPublishedTemplate) {
        const nextPublished = data.publishedTemplates.filter((item) => item.id !== localPublishedTemplate.id);
        await workspaceStorageSet({ workspacePublishedTemplates: nextPublished });
        await workspaceSyncPublishedTemplates(nextPublished);
        workspaceToast("已从团队空间删除");
        await renderWorkspacePanel();
        return;
      }
      if ((action === "use-template" || action === "use-team-template") && selectedTemplate) {
        workspaceUseTemplate(selectedTemplate);
        return;
      }
      if (action === "copy-team-template" && teamTemplate) {
        await workspaceSaveTemplate({
          ...teamTemplate,
          id: workspaceId("workspace-template"),
          groupId: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        workspaceToast("已存到个人空间");
        workspaceState.activeSpace = "personal";
        await renderWorkspacePanel();
        return;
      }
      if (action === "copy-prompt" && selectedTemplate) {
        await workspaceCopyText(selectedTemplate.prompt);
        return;
      }
      if (action === "copy-team-url") {
        const url = workspaceState.status?.preferredUrl || workspaceState.status?.urls?.[0] || "";
        await workspaceCopyText(url);
        return;
      }
      if (action === "start-team" || action === "stop-team") {
        await workspaceToggleTeamServer(action === "start-team");
        return;
      }
      if (action === "save-team-settings") {
        const memberName = page.querySelector("[data-workspace-field='memberName']")?.value || "";
        const teamPort = page.querySelector("[data-workspace-field='teamPort']")?.value || 39218;
        const nextSettings = {
          ...data.teamSettings,
          memberName: String(memberName).trim(),
          port: Math.max(1024, Math.min(65535, Math.round(Number(teamPort) || 39218))),
        };
        await workspaceStorageSet({ workspaceTeamSettings: nextSettings });
        if (nextSettings.enabled) await workspaceToggleTeamServer(true);
        else await renderWorkspacePanel();
        workspaceToast("团队设置已保存");
        return;
      }
      if (action === "add-member") {
        await workspaceAddMember();
        return;
      }
      if (action === "refresh-team") {
        await workspaceRefreshTeamMembers();
      }
    }, true);

    document.addEventListener("input", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
      if (!target.closest(".wanjuan-workspace-page")) return;

      const workspaceField = target.getAttribute("data-workspace-field");
      if (workspaceField === "query") {
        workspaceState.query = target.value;
        workspaceScheduleRender();
        return;
      }
      if (workspaceField === "memberAddress") {
        workspaceState.teamMemberAddress = target.value;
        return;
      }

      const functionField = target.getAttribute("data-function-field");
      if (!functionField) return;
      const index = Number(target.closest("[data-function-prompt-index]")?.getAttribute("data-function-prompt-index"));
      if (!Number.isInteger(index)) return;
      const data = await workspaceReadAll();
      const nextPrompts = data.presetPrompts.map((prompt, itemIndex) => {
        if (itemIndex !== index) return prompt;
        return {
          ...prompt,
          [functionField]: functionField === "enabled" && target instanceof HTMLInputElement ? target.checked : target.value,
        };
      });
      await workspaceStorageSet({ presetPrompts: nextPrompts });
    }, true);

    document.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
      if (!target.closest(".wanjuan-workspace-page")) return;
      if (target.hasAttribute("data-workspace-template-group")) {
        const templateId = target.closest("[data-template-id]")?.getAttribute("data-template-id") || "";
        if (!templateId) return;
        const data = await workspaceReadAll();
        const updatedAt = Date.now();
        const nextTemplates = data.templates.map((template) =>
          template.id === templateId ? { ...template, groupId: target.value || "", updatedAt } : template
        );
        const nextPublished = data.publishedTemplates.map((template) =>
          template.id === templateId ? { ...template, groupId: target.value || "", updatedAt } : template
        );
        await workspaceStorageSet({
          workspacePromptTemplates: nextTemplates,
          workspacePublishedTemplates: nextPublished,
        });
        await workspaceSyncPublishedTemplates(nextPublished);
        await renderWorkspacePanel();
        return;
      }
      if (!target.hasAttribute("data-function-field")) return;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }, true);

    window.addEventListener("wanjuan:workspace-template-captured", async (event) => {
      const template = event?.detail?.template;
      if (!template) return;
      await workspaceSaveTemplate(template);
      workspaceState.activeSpace = "personal";
      workspaceState.activeSection = "templates";
      document.documentElement.classList.add("wanjuan-workspace-open");
      installWorkspacePanel();
      await renderWorkspacePanel();
      workspaceToast("已保存到工作空间");
    });

    window.addEventListener("wanjuan:workspace-open", async () => {
      installWorkspacePanel();
      document.documentElement.classList.add("wanjuan-workspace-open");
      document.querySelector(".wanjuan-workspace-nav-tab")?.classList.add("wanjuan-app-nav-tab-active");
      await renderWorkspacePanel();
    });
  };

  const installWorkspacePanel = () => {
    ensureWorkspaceStyle();
    bindWorkspacePanelEvents();
    const nav = document.querySelector(".wanjuan-app-top-nav");
    if (!(nav instanceof HTMLElement)) return false;

    const contentRoot = nav.nextElementSibling;
    if (!(contentRoot instanceof HTMLElement)) return false;
    if (getComputedStyle(contentRoot).position === "static") contentRoot.style.position = "relative";
    if (!contentRoot.querySelector(".wanjuan-workspace-page")) {
      const page = document.createElement("section");
      page.className = "wanjuan-workspace-page";
      contentRoot.appendChild(page);
    }
    const page = contentRoot.querySelector(".wanjuan-workspace-page");
    if (document.documentElement.classList.contains("wanjuan-workspace-open")) {
      const button = nav.querySelector(".wanjuan-workspace-nav-tab");
      button?.classList.add("wanjuan-app-nav-tab-active");
      if (!page?.hasChildNodes?.()) renderWorkspacePanel();
    }
    return true;
  };

  const runOnce = () => {
    installDesktopUiStateStyle();
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
    installWorkspacePanel();
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
    }, 1200);
  };
  const mo = new MutationObserver((mutations) => {
    const onlyWorkspaceMutation = mutations.length > 0 && mutations.every((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (target?.closest?.(".wanjuan-workspace-page, .wanjuan-workspace-nav-tab, #wanjuan-workspace-style")) return true;
      return Array.from(mutation.addedNodes || []).every((node) =>
        node instanceof Element &&
        node.closest?.(".wanjuan-workspace-page, .wanjuan-workspace-nav-tab, #wanjuan-workspace-style")
      );
    });
    if (onlyWorkspaceMutation) return;
    queueDesktopPatchRefresh();
  });
  mo.observe(document.documentElement, { subtree: true, childList: true });

  let seedreamIconPatchQueued = false;
  const seedreamIconObserver = new MutationObserver((mutations) => {
    if (mutations.length && mutations.every((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      return target?.closest?.(".wanjuan-workspace-page");
    })) return;
    if (seedreamIconPatchQueued) return;
    seedreamIconPatchQueued = true;
    window.setTimeout(() => {
      seedreamIconPatchQueued = false;
      installSeedreamOfficialIcons();
    }, 800);
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
var { dataUrlFromBlobUrl, extensionFromMime, localPathFromFileUrl, saveProjectName } = require("./media-utils.cjs");
var { ensureProjectSafetyAutoBackupStarted, installProjectSafetyBackupCenter, prewarmProjectSafetyCenter } = require("./safety-center.cjs");
var { getDesktopStorageItems, getPerformanceSettings, normalizePerformanceProfileKey, persistPerformanceProfile, setDesktopStorageItems } = require("./storage.cjs");
