// 项目安全备份中心 UI：在数据管理面板中注入备份中心，渲染快照列表、恢复入口与定时备份控制。
const { PROJECT_SAFETY_INTERVAL_OPTIONS, PROJECT_SAFETY_RUNTIME_ENABLED, PROJECT_SAFETY_SCHEDULER_TICK_MS } = require("./constants.cjs");

// 模块级状态：自动备份调度是否已启动（源 preload.cjs 行 106）。
let projectSafetyAutoBackupStarted = false;

// 备份中心数据缓存：避免每次打开"数据管理"都重走"占位骨架 → 异步加载 → 完全体"的两段式切换（视觉割裂感）。
// 有缓存时直接渲染完全体（秒开），后台再静默刷新一次保证数据新鲜。
let lastProjectSafetyInfo = null;
let projectSafetyPrewarmStarted = false;
let projectSafetyPrewarmPromise = null;

// 启动后预热一次备份中心数据，使用户首次打开数据管理即可秒开完全体。
function prewarmProjectSafetyCenter() {
  if (projectSafetyPrewarmStarted) return projectSafetyPrewarmPromise;
  projectSafetyPrewarmStarted = true;
  projectSafetyPrewarmPromise = getCurrentProjectSafetyInfo()
    .then((info) => { lastProjectSafetyInfo = info; return info; })
    .catch((error) => { console.warn("project safety prewarm skipped", error); return null; });
  return projectSafetyPrewarmPromise;
}

function ensureProjectSafetyAutoBackupStarted() {
  if (!PROJECT_SAFETY_RUNTIME_ENABLED) return;
  if (projectSafetyAutoBackupStarted) return;
  projectSafetyAutoBackupStarted = true;
  window.setTimeout(() => {
    maybeRunProjectSafetyAutoBackup().catch((error) => console.warn("project safety initial backup skipped", error));
  }, 30000);
  window.setInterval(() => {
    maybeRunProjectSafetyAutoBackup().catch((error) => console.warn("project safety interval backup skipped", error));
  }, PROJECT_SAFETY_SCHEDULER_TICK_MS);
}

function escapeProjectSafetyHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatProjectSafetyTime(value) {
  if (!value) return "尚未执行";
  try {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return String(value);
  }
}

function renderProjectSafetyCenter(panel, info) {
  const snapshots = Array.isArray(info?.snapshots) ? info.snapshots : [];
  const config = info?.config || {};
  const intervalOptions = Array.isArray(info?.intervalOptions) ? info.intervalOptions : PROJECT_SAFETY_INTERVAL_OPTIONS;
  const snapshotRows = snapshots.length
    ? snapshots.map((snapshot) => {
      const summary = snapshot.summary || {};
      return `
        <button type="button" data-snapshot-id="${snapshot.id}" class="wj-safety-row">
          <span class="wj-safety-row-main">
            <strong>${escapeProjectSafetyHtml(snapshot.projectName || snapshot.projectId)}</strong>
            <span>${escapeProjectSafetyHtml(formatProjectSafetyTime(snapshot.createdAt))}</span>
          </span>
          <span class="wj-safety-row-meta">${summary.nodes || 0} 节点 / ${summary.edges || 0} 连线 · ${escapeProjectSafetyHtml(snapshot.reason || "snapshot")}</span>
        </button>`;
    }).join("")
    : `<div class="wj-safety-empty">当前项目暂时没有安全快照。保存一次项目后会自动生成。</div>`;
  const optionHtml = (selectedValue) => intervalOptions.map((option) =>
    `<option value="${option.value}" ${Number(selectedValue) === option.value ? "selected" : ""}>${escapeProjectSafetyHtml(option.label)}</option>`
  ).join("");
  panel.innerHTML = `
    <style>
      #wanjuan-project-safety-center {
        --wj-safety-panel-bg: #242a32;
        --wj-safety-section-bg: #2a313a;
        --wj-safety-inset-bg: #303844;
        --wj-safety-header-bg: linear-gradient(180deg, rgba(43,49,58,0.96), rgba(34,40,48,0.92));
        --wj-safety-border: #39424d;
        --wj-safety-muted-border: #313942;
        --wj-safety-text: #eef3f7;
        --wj-safety-secondary: #b6c2cc;
        --wj-safety-muted: #84919d;
        --wj-safety-button-bg: #303844;
        --wj-safety-button-border: #48525f;
        --wj-safety-button-text: #c2ccd6;
        --wj-safety-primary-bg: rgba(138,180,248,0.12);
        --wj-safety-primary-border: rgba(138,180,248,0.34);
        --wj-safety-primary-text: #c9dcff;
        --wj-safety-primary-hover-bg: rgba(138,180,248,0.18);
        --wj-safety-row-hover: #303844;
        --wj-safety-shadow: 0 14px 38px rgba(0,0,0,0.22);
        box-sizing: border-box;
        color: var(--wj-safety-text);
        display: block;
        margin: 0;
        width: 100%;
        min-height: 360px;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
      }
      html.theme-dark #wanjuan-project-safety-center {
        --wj-safety-panel-bg: #0f1319;
        --wj-safety-section-bg: #141920;
        --wj-safety-inset-bg: #0f1318;
        --wj-safety-header-bg: linear-gradient(180deg, rgba(15,20,37,0.98), rgba(11,16,32,0.94));
        --wj-safety-border: #272c35;
        --wj-safety-muted-border: #20242c;
        --wj-safety-text: #f3f7fb;
        --wj-safety-secondary: #9ba8b4;
        --wj-safety-muted: #6b7280;
        --wj-safety-button-bg: #0f1318;
        --wj-safety-button-border: #2f3641;
        --wj-safety-button-text: #9ca3af;
        --wj-safety-primary-bg: rgba(138,180,248,0.12);
        --wj-safety-primary-border: rgba(138,180,248,0.30);
        --wj-safety-primary-text: #c9dcff;
        --wj-safety-primary-hover-bg: rgba(138,180,248,0.18);
        --wj-safety-row-hover: #181f29;
        --wj-safety-shadow: 0 16px 42px rgba(0,0,0,0.34);
      }
      html:is(.theme-light, .theme-warm-light, .theme-mist-blue, .theme-chrome-blue, .theme-chrome-rose, .theme-chrome-sand, .theme-chrome-teal, .theme-sage-green) #wanjuan-project-safety-center {
        --wj-safety-shadow: 0 14px 34px rgba(70, 88, 76, 0.14);
      }
      html.theme-light #wanjuan-project-safety-center {
        --wj-safety-panel-bg: #f5fafb;
        --wj-safety-section-bg: #f7fbfc;
        --wj-safety-inset-bg: #edf5f7;
        --wj-safety-header-bg: linear-gradient(180deg, rgba(248,252,253,0.98), rgba(236,244,247,0.95));
        --wj-safety-border: #b9c9d1;
        --wj-safety-muted-border: #ced9df;
        --wj-safety-text: #243843;
        --wj-safety-secondary: #607884;
        --wj-safety-muted: #7b919b;
        --wj-safety-button-bg: #edf5f7;
        --wj-safety-button-border: #b8c7cf;
        --wj-safety-button-text: #47626e;
        --wj-safety-primary-bg: rgba(108,140,163,0.10);
        --wj-safety-primary-border: rgba(108,140,163,0.24);
        --wj-safety-primary-text: #4f697b;
        --wj-safety-primary-hover-bg: rgba(108,140,163,0.16);
        --wj-safety-row-hover: #eef5f7;
      }
      html.theme-warm-light #wanjuan-project-safety-center {
        --wj-safety-panel-bg: #fbf7f1;
        --wj-safety-section-bg: #fcf7f0;
        --wj-safety-inset-bg: #f3eadf;
        --wj-safety-header-bg: linear-gradient(180deg, rgba(255,252,248,0.98), rgba(247,239,230,0.95));
        --wj-safety-border: #d8c8b8;
        --wj-safety-muted-border: #e5d7ca;
        --wj-safety-text: #4b3a2b;
        --wj-safety-secondary: #7f6857;
        --wj-safety-muted: #9a8473;
        --wj-safety-button-bg: #f3eadf;
        --wj-safety-button-border: #d8c7b5;
        --wj-safety-button-text: #765f4f;
        --wj-safety-primary-bg: rgba(186,141,90,0.10);
        --wj-safety-primary-border: rgba(186,141,90,0.24);
        --wj-safety-primary-text: #946845;
        --wj-safety-primary-hover-bg: rgba(186,141,90,0.16);
        --wj-safety-row-hover: #f7efe4;
      }
      html.theme-mist-blue #wanjuan-project-safety-center {
        --wj-safety-panel-bg: #f5f9fd;
        --wj-safety-section-bg: #f8fbfe;
        --wj-safety-inset-bg: #edf4fa;
        --wj-safety-header-bg: linear-gradient(180deg, rgba(251,253,255,0.98), rgba(237,244,251,0.95));
        --wj-safety-border: #bfd0e1;
        --wj-safety-muted-border: #d4e0ea;
        --wj-safety-text: #25384b;
        --wj-safety-secondary: #61788d;
        --wj-safety-muted: #7f93a5;
        --wj-safety-button-bg: #edf4fa;
        --wj-safety-button-border: #bfd0e1;
        --wj-safety-button-text: #50687d;
        --wj-safety-primary-bg: rgba(97,128,168,0.10);
        --wj-safety-primary-border: rgba(97,128,168,0.24);
        --wj-safety-primary-text: #4a6b92;
        --wj-safety-primary-hover-bg: rgba(97,128,168,0.16);
        --wj-safety-row-hover: #edf4fb;
      }
      html.theme-chrome-blue #wanjuan-project-safety-center {
        --wj-safety-panel-bg: #f5f9ff;
        --wj-safety-section-bg: #f8fbff;
        --wj-safety-inset-bg: #edf3ff;
        --wj-safety-header-bg: linear-gradient(180deg, rgba(251,253,255,0.98), rgba(233,242,255,0.95));
        --wj-safety-border: #b9cfee;
        --wj-safety-muted-border: #d0dff3;
        --wj-safety-text: #223754;
        --wj-safety-secondary: #5b7494;
        --wj-safety-muted: #7a90ab;
        --wj-safety-button-bg: #edf3ff;
        --wj-safety-button-border: #bfd0ea;
        --wj-safety-button-text: #48658a;
        --wj-safety-primary-bg: rgba(71,128,221,0.10);
        --wj-safety-primary-border: rgba(71,128,221,0.24);
        --wj-safety-primary-text: #3a67bb;
        --wj-safety-primary-hover-bg: rgba(71,128,221,0.16);
        --wj-safety-row-hover: #eef5ff;
      }
      html.theme-chrome-rose #wanjuan-project-safety-center {
        --wj-safety-panel-bg: #fff8fa;
        --wj-safety-section-bg: #fff9fb;
        --wj-safety-inset-bg: #fff0f4;
        --wj-safety-header-bg: linear-gradient(180deg, rgba(255,254,255,0.98), rgba(252,237,243,0.95));
        --wj-safety-border: #e8c4d1;
        --wj-safety-muted-border: #f1d7df;
        --wj-safety-text: #4f2f3c;
        --wj-safety-secondary: #856271;
        --wj-safety-muted: #a07c89;
        --wj-safety-button-bg: #fff0f4;
        --wj-safety-button-border: #e8c7d2;
        --wj-safety-button-text: #855865;
        --wj-safety-primary-bg: rgba(210,109,145,0.10);
        --wj-safety-primary-border: rgba(210,109,145,0.24);
        --wj-safety-primary-text: #be547a;
        --wj-safety-primary-hover-bg: rgba(210,109,145,0.16);
        --wj-safety-row-hover: #fff1f5;
      }
      html.theme-chrome-sand #wanjuan-project-safety-center {
        --wj-safety-panel-bg: #fbf8f2;
        --wj-safety-section-bg: #fcf8f2;
        --wj-safety-inset-bg: #f4ede4;
        --wj-safety-header-bg: linear-gradient(180deg, rgba(255,253,250,0.98), rgba(245,238,228,0.95));
        --wj-safety-border: #dbcdbd;
        --wj-safety-muted-border: #e8ddd0;
        --wj-safety-text: #4c4132;
        --wj-safety-secondary: #80715f;
        --wj-safety-muted: #9a8a76;
        --wj-safety-button-bg: #f4ede4;
        --wj-safety-button-border: #dbcebf;
        --wj-safety-button-text: #756756;
        --wj-safety-primary-bg: rgba(188,153,106,0.10);
        --wj-safety-primary-border: rgba(188,153,106,0.24);
        --wj-safety-primary-text: #907149;
        --wj-safety-primary-hover-bg: rgba(188,153,106,0.16);
        --wj-safety-row-hover: #f6f0e7;
      }
      html.theme-chrome-teal #wanjuan-project-safety-center {
        --wj-safety-panel-bg: #f4fbf8;
        --wj-safety-section-bg: #f7fcfa;
        --wj-safety-inset-bg: #ecf6f2;
        --wj-safety-header-bg: linear-gradient(180deg, rgba(251,254,253,0.98), rgba(234,245,241,0.95));
        --wj-safety-border: #bddbcf;
        --wj-safety-muted-border: #d2e7df;
        --wj-safety-text: #23443d;
        --wj-safety-secondary: #5d8178;
        --wj-safety-muted: #7b9a92;
        --wj-safety-button-bg: #ecf6f2;
        --wj-safety-button-border: #bedace;
        --wj-safety-button-text: #4f746d;
        --wj-safety-primary-bg: rgba(70,165,142,0.10);
        --wj-safety-primary-border: rgba(70,165,142,0.24);
        --wj-safety-primary-text: #2f8d77;
        --wj-safety-primary-hover-bg: rgba(70,165,142,0.16);
        --wj-safety-row-hover: #eef8f5;
      }
      html.theme-sage-green #wanjuan-project-safety-center {
        --wj-safety-panel-bg: #f7fbf7;
        --wj-safety-section-bg: #f8fbf8;
        --wj-safety-inset-bg: #eef5ee;
        --wj-safety-header-bg: linear-gradient(180deg, rgba(252,254,252,0.98), rgba(238,246,238,0.95));
        --wj-safety-border: #c5d8c6;
        --wj-safety-muted-border: #d8e5d8;
        --wj-safety-text: #294133;
        --wj-safety-secondary: #667d6f;
        --wj-safety-muted: #819389;
        --wj-safety-button-bg: #eef5ee;
        --wj-safety-button-border: #c7d7c7;
        --wj-safety-button-text: #5a7061;
        --wj-safety-primary-bg: rgba(99,149,112,0.10);
        --wj-safety-primary-border: rgba(99,149,112,0.24);
        --wj-safety-primary-text: #4f7e59;
        --wj-safety-primary-hover-bg: rgba(99,149,112,0.16);
        --wj-safety-row-hover: #eff6ef;
      }
      #wanjuan-project-safety-center {
        --wj-safety-panel-bg: color-mix(in srgb, var(--wj-surface) 92%, var(--wj-bg) 8%);
        --wj-safety-section-bg: color-mix(in srgb, var(--wj-surface-2) 86%, var(--wj-surface) 14%);
        --wj-safety-inset-bg: color-mix(in srgb, var(--wj-surface-2) 76%, var(--wj-bg) 24%);
        --wj-safety-header-bg: color-mix(in srgb, var(--wj-surface-2) 82%, var(--wj-surface) 18%);
        --wj-safety-border: color-mix(in srgb, var(--wj-border) 86%, transparent);
        --wj-safety-muted-border: color-mix(in srgb, var(--wj-border) 74%, transparent);
        --wj-safety-text: var(--wj-text);
        --wj-safety-secondary: color-mix(in srgb, var(--wj-text) 70%, var(--wj-muted) 30%);
        --wj-safety-muted: var(--wj-muted);
        --wj-safety-button-bg: color-mix(in srgb, var(--wj-surface-2) 84%, var(--wj-surface) 16%);
        --wj-safety-button-border: color-mix(in srgb, var(--wj-border) 82%, transparent);
        --wj-safety-button-text: var(--wj-text);
        --wj-safety-primary-bg: color-mix(in srgb, var(--wj-accent) 16%, var(--wj-surface-2) 84%);
        --wj-safety-primary-border: color-mix(in srgb, var(--wj-accent) 46%, var(--wj-border) 54%);
        --wj-safety-primary-text: color-mix(in srgb, var(--wj-accent) 74%, var(--wj-text) 26%);
        --wj-safety-primary-hover-bg: color-mix(in srgb, var(--wj-accent) 22%, var(--wj-surface-2) 78%);
        --wj-safety-row-hover: color-mix(in srgb, var(--wj-accent) 10%, var(--wj-surface-2) 90%);
        --wj-safety-shadow: 0 8px 22px color-mix(in srgb, var(--wanjuan-theme-shadow, rgba(0, 0, 0, 0.22)) 28%, transparent);
      }
      .wj-safety-panel { overflow: hidden; border: 1px solid var(--wj-safety-border); background: var(--wj-safety-panel-bg); color: var(--wj-safety-text); box-shadow: var(--wj-safety-shadow); border-radius: 8px; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 12px; letter-spacing: 0; }
      .wj-safety-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 18px; border-bottom: 1px solid var(--wj-safety-muted-border); background: var(--wj-safety-header-bg); }
      .wj-safety-title { color: var(--wj-safety-text); font-size: 14px; font-weight: 650; line-height: 1.35; }
      .wj-safety-action { min-height: 30px; border: 1px solid var(--wj-safety-button-border); background: var(--wj-safety-button-bg); color: var(--wj-safety-button-text); border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-weight: 600; line-height: 1.2; white-space: nowrap; transition: background .16s ease, border-color .16s ease, color .16s ease, transform .16s ease, box-shadow .16s ease; }
      .wj-safety-action:hover { background: var(--wj-safety-row-hover); border-color: var(--wj-safety-primary-border); }
      .wj-safety-action:focus-visible { outline: 2px solid color-mix(in srgb, var(--wj-safety-primary-text) 72%, #ffffff 28%); outline-offset: 2px; }
      .wj-safety-action:active { transform: translateY(1px); }
      .wj-safety-action.primary { background: var(--wj-safety-primary-bg); border-color: var(--wj-safety-primary-border); color: var(--wj-safety-primary-text); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }
      .wj-safety-action.primary:hover { background: var(--wj-safety-primary-hover-bg); color: var(--wj-safety-primary-text); }
      .wj-safety-switch { position: relative; width: 92px; height: 34px; min-width: 92px; padding: 0; border: 1px solid var(--wj-safety-button-border); border-radius: 999px; background: var(--wj-safety-button-bg); color: var(--wj-safety-button-text); cursor: pointer; font-size: 12px; font-weight: 700; line-height: 1; white-space: nowrap; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); transition: background .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease; overflow: hidden; }
      .wj-safety-switch:hover { border-color: var(--wj-safety-primary-border); background: var(--wj-safety-row-hover); }
      .wj-safety-switch:focus-visible { outline: 2px solid color-mix(in srgb, var(--wj-safety-primary-text) 72%, #ffffff 28%); outline-offset: 2px; }
      .wj-safety-switch-label { position: relative; z-index: 1; display: block; padding: 0 28px 0 0; text-align: center; line-height: 32px; transition: padding .16s ease, color .16s ease; }
      .wj-safety-switch-knob { position: absolute; left: 4px; top: 4px; width: 24px; height: 24px; border-radius: 999px; background: color-mix(in srgb, var(--wj-safety-text) 88%, var(--wj-safety-section-bg) 12%); box-shadow: 0 2px 8px color-mix(in srgb, var(--wanjuan-theme-shadow, rgba(0,0,0,0.22)) 48%, transparent); transition: transform .16s cubic-bezier(.2,.8,.2,1), background .16s ease, box-shadow .16s ease; }
      .wj-safety-switch.is-on { border-color: color-mix(in srgb, var(--wj-safety-primary-text) 45%, var(--wj-safety-button-border) 55%); background: color-mix(in srgb, var(--wj-safety-primary-bg) 74%, var(--wj-safety-section-bg) 26%); color: var(--wj-safety-primary-text); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 5px color-mix(in srgb, var(--wj-safety-primary-text) 12%, transparent); }
      .wj-safety-switch.is-on .wj-safety-switch-knob { transform: translateX(58px); background: color-mix(in srgb, var(--wj-safety-text) 94%, var(--wj-safety-panel-bg) 6%); }
      .wj-safety-switch.is-on .wj-safety-switch-label { padding: 0 26px 0 0; }
      .wj-safety-switch.is-off .wj-safety-switch-label { padding: 0 0 0 26px; }
      .wj-safety-switch:active .wj-safety-switch-knob { transform: scale(.96); }
      .wj-safety-switch.is-on:active .wj-safety-switch-knob { transform: translateX(58px) scale(.96); }
      .wj-safety-body { padding: 16px 18px; overflow: auto; }
      .wj-safety-current { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
      .wj-safety-stat { border: 1px solid var(--wj-safety-muted-border); background: var(--wj-safety-section-bg); border-radius: 6px; padding: 10px; }
      .wj-safety-stat span { display: block; font-size: 11px; color: var(--wj-safety-muted); margin-bottom: 5px; }
      .wj-safety-stat strong { color: var(--wj-safety-text); font-size: 16px; font-weight: 650; line-height: 1.25; }
      .wj-safety-config { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
      .wj-safety-field { border: 1px solid var(--wj-safety-muted-border); background: var(--wj-safety-section-bg); border-radius: 6px; padding: 10px; }
      .wj-safety-field label { display: block; color: var(--wj-safety-secondary); font-size: 11px; font-weight: 500; line-height: 1.35; margin-bottom: 7px; }
      .wj-safety-field select { width: 100%; height: 31px; border-radius: 6px; border: 1px solid var(--wj-safety-button-border); background: var(--wj-safety-inset-bg) !important; color: var(--wj-safety-text) !important; -webkit-text-fill-color: var(--wj-safety-text) !important; padding: 0 8px; font-size: 13px; font-weight: 500; outline: none; }
      .wj-safety-field select:focus { border-color: var(--wj-safety-primary-border); box-shadow: 0 0 0 2px color-mix(in srgb, var(--wj-safety-primary-text) 16%, transparent); }
      .wj-safety-pathgroup { display: grid; gap: 7px; margin-bottom: 14px; }
      .wj-safety-pathbox { display: flex; gap: 8px; align-items: center; }
      .wj-safety-pathlabel { width: 72px; flex: 0 0 72px; color: var(--wj-safety-muted); font-size: 11px; line-height: 1.35; }
      .wj-safety-pathbox code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 1px solid var(--wj-safety-muted-border); background: var(--wj-safety-section-bg); border-radius: 6px; padding: 7px 10px; color: var(--wj-safety-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.35; }
      .wj-safety-list { display: grid; align-content: start; gap: 8px; min-height: 148px; max-height: min(31vh, 320px); overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y; padding-right: 4px; scrollbar-gutter: stable; }
      .wj-safety-list::-webkit-scrollbar { width: 9px; }
      .wj-safety-list::-webkit-scrollbar-track { background: transparent; }
      .wj-safety-list::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--wj-safety-primary-text) 34%, transparent); border: 2px solid transparent; border-radius: 999px; background-clip: content-box; }
      .wj-safety-row { width: 100%; text-align: left; border: 1px solid var(--wj-safety-muted-border); background: var(--wj-safety-section-bg); color: var(--wj-safety-text); border-radius: 6px; padding: 10px 12px; cursor: pointer; }
      .wj-safety-row:hover { border-color: var(--wj-safety-primary-border); background: var(--wj-safety-row-hover); }
      .wj-safety-row-main { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; line-height: 1.35; }
      .wj-safety-row-main strong { font-weight: 650; }
      .wj-safety-row-main span { color: var(--wj-safety-secondary); font-size: 12px; font-weight: 500; }
      .wj-safety-row-meta, .wj-safety-empty, .wj-safety-path { display: block; margin-top: 5px; color: var(--wj-safety-muted); font-size: 11px; line-height: 1.4; }
      .wj-safety-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 18px; border-top: 1px solid var(--wj-safety-muted-border); background: color-mix(in srgb, var(--wj-safety-panel-bg) 88%, transparent); }
      @media (max-width: 720px) { .wj-safety-config, .wj-safety-current { grid-template-columns: 1fr; } .wj-safety-pathbox { flex-direction: column; align-items: stretch; } .wj-safety-pathlabel { width: auto; flex-basis: auto; } }
    </style>
      <section class="wj-safety-panel" aria-label="备份中心">
        <header class="wj-safety-head">
          <div>
            <div class="wj-safety-title">备份中心</div>
            <div class="wj-safety-path">${escapeProjectSafetyHtml(info.projectName || info.projectId)} · 自动备份${config.enabled === false ? "已关闭" : "已开启"}</div>
          </div>
          <button type="button" class="wj-safety-switch ${config.enabled === false ? "is-off" : "is-on"}" role="switch" aria-checked="${config.enabled === false ? "false" : "true"}" data-toggle-auto>
            <span class="wj-safety-switch-label">${config.enabled === false ? "已关闭" : "已开启"}</span>
            <span class="wj-safety-switch-knob" aria-hidden="true"></span>
          </button>
        </header>
        <div class="wj-safety-body">
          <div class="wj-safety-current">
            <div class="wj-safety-stat"><span>当前节点</span><strong>${info.summary?.nodes || 0}</strong></div>
            <div class="wj-safety-stat"><span>当前连线</span><strong>${info.summary?.edges || 0}</strong></div>
            <div class="wj-safety-stat"><span>安全快照</span><strong>${snapshots.length}</strong></div>
          </div>
          <div class="wj-safety-config">
            <div class="wj-safety-field">
              <label>当前使用项目备份时间</label>
              <select data-current-interval>${optionHtml(config.currentIntervalMs)}</select>
            </div>
            <div class="wj-safety-field">
              <label>全项目备份时间</label>
              <select data-all-interval>${optionHtml(config.allIntervalMs)}</select>
            </div>
          </div>
          <div class="wj-safety-pathgroup">
            <div class="wj-safety-pathbox">
              <span class="wj-safety-pathlabel">备份地址</span>
              <code title="${escapeProjectSafetyHtml(info.backupRoot || "")}">${escapeProjectSafetyHtml(info.backupRoot || "")}</code>
              <button type="button" class="wj-safety-action" data-choose-folder>选择备份地址</button>
            </div>
            <div class="wj-safety-pathbox">
              <span class="wj-safety-pathlabel">安全快照</span>
              <code title="${escapeProjectSafetyHtml(info.snapshotRoot || "")}">${escapeProjectSafetyHtml(info.snapshotRoot || "")}</code>
            </div>
          </div>
          <div class="wj-safety-list">${snapshotRows}</div>
        </div>
        <footer class="wj-safety-foot">
          <span class="wj-safety-path">最近当前项目备份：${escapeProjectSafetyHtml(formatProjectSafetyTime(info.autoBackup?.lastCurrentBackupAt))}；全项目备份：${escapeProjectSafetyHtml(formatProjectSafetyTime(info.autoBackup?.lastAllBackupAt))}</span>
          <button type="button" class="wj-safety-action" data-run-backup>立即备份</button>
        </footer>
      </section>
    `;
}

function bindProjectSafetyListScroll(panel) {
  const list = panel.querySelector(".wj-safety-list");
  if (!(list instanceof HTMLElement) || list.dataset.scrollBound === "true") return;
  list.dataset.scrollBound = "true";

  const canScrollDelta = (deltaY) => {
    if (list.scrollHeight <= list.clientHeight + 1) return false;
    if (deltaY < 0 && list.scrollTop <= 0) return false;
    if (deltaY > 0 && list.scrollTop + list.clientHeight >= list.scrollHeight - 1) return false;
    return true;
  };

  list.addEventListener("wheel", (event) => {
    if (!canScrollDelta(event.deltaY)) return;
    event.preventDefault();
    event.stopPropagation();
    list.scrollTop += event.deltaY;
  }, { passive: false });

  let lastTouchY = 0;
  list.addEventListener("touchstart", (event) => {
    lastTouchY = event.touches?.[0]?.clientY || 0;
  }, { passive: true });
  list.addEventListener("touchmove", (event) => {
    const nextY = event.touches?.[0]?.clientY || 0;
    const deltaY = lastTouchY - nextY;
    lastTouchY = nextY;
    if (!canScrollDelta(deltaY)) return;
    event.preventDefault();
    event.stopPropagation();
    list.scrollTop += deltaY;
  }, { passive: false });
}

// 用一份 info 渲染备份中心并绑定全部交互事件。fade=true 时做一次淡入（仅用于从占位骨架切到完全体的场景）。
function applyProjectSafetyInfo(panel, info, { fade = false } = {}) {
  lastProjectSafetyInfo = info;
  renderProjectSafetyCenter(panel, info);
  // 仅在确有占位→完全体切换时做一次淡入，软化大块突变割裂感。直接用缓存秒开完全体时不需要淡入。
  try {
    if (fade && panel instanceof HTMLElement && panel.dataset.wjFadedIn !== "true") {
      panel.dataset.wjFadedIn = "true";
      const content = panel.firstElementChild;
      if (content instanceof HTMLElement) {
        content.style.opacity = "0";
        content.style.transition = "opacity .28s ease";
        requestAnimationFrame(() => { content.style.opacity = "1"; });
      }
    }
  } catch {}
  bindProjectSafetyListScroll(panel);
  panel.querySelector("[data-toggle-auto]")?.addEventListener("click", async () => {
    await setProjectSafetyConfig({ enabled: info.config?.enabled === false });
    await refreshProjectSafetyCenter(panel);
  });
  panel.querySelector("[data-current-interval]")?.addEventListener("change", async (event) => {
    await setProjectSafetyConfig({ currentIntervalMs: Number(event.currentTarget.value) });
    await refreshProjectSafetyCenter(panel);
  });
  panel.querySelector("[data-all-interval]")?.addEventListener("change", async (event) => {
    await setProjectSafetyConfig({ allIntervalMs: Number(event.currentTarget.value) });
    await refreshProjectSafetyCenter(panel);
  });
  panel.querySelector("[data-choose-folder]")?.addEventListener("click", async () => {
    const result = await window.wanjuanDesktop?.chooseDownloadDirectory?.({
      title: "选择自动备份保存位置"
    });
    if (!result?.ok || !result.path) return;
    await setProjectSafetyConfig({ backupRoot: result.path });
    await mirrorProjectSafetySnapshotsToFiles().catch((error) => console.warn("project safety snapshot mirror after folder change skipped", error));
    await refreshProjectSafetyCenter(panel);
  });
  panel.querySelector("[data-run-backup]")?.addEventListener("click", async () => {
    await maybeRunProjectSafetyAutoBackup({ force: true });
    await mirrorProjectSafetySnapshotsToFiles().catch((error) => console.warn("project safety snapshot mirror after backup skipped", error));
    await refreshProjectSafetyCenter(panel);
    window.alert("已完成当前项目、全项目轻量备份，并同步安全快照到备份地址。");
  });
  for (const button of panel.querySelectorAll("[data-snapshot-id]")) {
    button.addEventListener("click", async () => {
      const snapshotId = button.getAttribute("data-snapshot-id");
      const confirmed = window.confirm("将把该快照恢复为一个新项目，并切换到恢复项目。继续吗？");
      if (!confirmed) return;
      const result = await restoreProjectSafetySnapshot(snapshotId, { restoreAsNew: true });
      if (!result?.ok) {
        window.alert(result?.error || "恢复失败");
        return;
      }
      window.alert(`已恢复为新项目：${result.projectName}。应用将刷新以加载恢复项目。`);
      window.location.reload();
    });
  }
}

async function refreshProjectSafetyCenter(panel, options = {}) {
  const info = await getCurrentProjectSafetyInfo();
  applyProjectSafetyInfo(panel, info, options);
}

function findSmallestElementContainingText(text) {
  const elements = Array.from(document.querySelectorAll("main *, [role='dialog'] *, section *, div *"));
  return elements
    .filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return (element.textContent || "").includes(text);
    })
    .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0] || null;
}

function findDataManagementContentPanel() {
  const dataTitle = findSmallestElementContainingText("数据管理");
  const candidates = [
    dataTitle?.closest("section"),
    dataTitle?.closest("article"),
    dataTitle?.closest("div"),
    findSmallestElementContainingText("导出勾选项")?.closest("section"),
    findSmallestElementContainingText("导出勾选项")?.closest("div"),
    findSmallestElementContainingText("导入备份")?.closest("section"),
    findSmallestElementContainingText("导入备份")?.closest("div")
  ].filter((element) => element instanceof HTMLElement);

  return candidates
    .filter((element) => {
      const text = element.innerText || element.textContent || "";
      return text.includes("数据管理") && text.includes("导入备份");
    })
    .sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return (rectB.width * rectB.height) - (rectA.width * rectA.height);
    })[0] || null;
}

function getVisibleElementArea(element) {
  if (!(element instanceof HTMLElement)) return 0;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return 0;
  return rect.width * rect.height;
}

function elementContainsAllText(element, texts) {
  if (!(element instanceof HTMLElement)) return false;
  const text = element.innerText || element.textContent || "";
  return texts.every((item) => text.includes(item));
}

function findSmallestVisibleAncestorContainingTexts(seed, texts) {
  if (!(seed instanceof HTMLElement)) return null;
  const candidates = [];
  let element = seed;
  while (element && element !== document.body && element !== document.documentElement) {
    if (
      element instanceof HTMLElement &&
      getVisibleElementArea(element) > 0 &&
      elementContainsAllText(element, texts)
    ) {
      candidates.push(element);
    }
    element = element.parentElement;
  }
  return candidates.sort((a, b) => getVisibleElementArea(a) - getVisibleElementArea(b))[0] || null;
}

function findProjectSafetyBackupCenterInsertion() {
  const importTitle = findSmallestElementContainingText("导入备份");
  const importModule =
    findSmallestVisibleAncestorContainingTexts(importTitle, ["导入备份", "选择并识别备份文件"]) ||
    findSmallestVisibleAncestorContainingTexts(importTitle, ["导入备份"]);
  if (importModule?.parentElement) {
    return { mode: "after", element: importModule };
  }

  const dataPanel = findDataManagementContentPanel();
  if (dataPanel) return { mode: "append", element: dataPanel };

  const fallbackAnchor =
    findSmallestElementContainingText("导入备份")?.closest("section, article, div") ||
    findSmallestElementContainingText("选择并识别备份文件")?.closest("section, article, div");
  if (fallbackAnchor?.parentElement) {
    return { mode: "after", element: fallbackAnchor };
  }
  return null;
}

function findDataManagementSettingsCard() {
  const dataTitle = findSmallestElementContainingText("数据管理");
  const candidates = [
    dataTitle?.closest(".wanjuan-settings-card"),
    findSmallestElementContainingText("导出勾选项")?.closest(".wanjuan-settings-card"),
    findSmallestElementContainingText("导入备份")?.closest(".wanjuan-settings-card"),
    findDataManagementContentPanel()?.closest(".wanjuan-settings-card")
  ].filter((element) => element instanceof HTMLElement);
  return candidates.find((element) => {
    const text = element.innerText || element.textContent || "";
    return text.includes("数据管理") && text.includes("导入备份");
  }) || null;
}

function renderProjectSafetyCenterLoading(panel) {
  panel.innerHTML = `
    <section class="wj-safety-panel" aria-label="备份中心" aria-busy="true">
      <header class="wj-safety-head">
        <div>
          <div class="wj-safety-title">备份中心</div>
          <div class="wj-safety-path">正在同步自动备份与安全快照</div>
        </div>
        <button type="button" class="wj-safety-switch is-off" disabled>
          <span class="wj-safety-switch-label">同步中</span>
          <span class="wj-safety-switch-knob" aria-hidden="true"></span>
        </button>
      </header>
      <div class="wj-safety-body">
        <div class="wj-safety-current">
          <div class="wj-safety-stat"><span>当前节点</span><strong>--</strong></div>
          <div class="wj-safety-stat"><span>当前连线</span><strong>--</strong></div>
          <div class="wj-safety-stat"><span>安全快照</span><strong>--</strong></div>
        </div>
        <div class="wj-safety-config">
          <div class="wj-safety-field"><label>当前使用项目备份时间</label><div class="wj-safety-skeleton-line"></div></div>
          <div class="wj-safety-field"><label>全项目备份时间</label><div class="wj-safety-skeleton-line"></div></div>
        </div>
        <div class="wj-safety-list">
          <div class="wj-safety-empty">备份中心正在加载...</div>
        </div>
      </div>
      <footer class="wj-safety-foot">
        <span class="wj-safety-path">加载完成前不会改变模块高度</span>
        <button type="button" class="wj-safety-action" disabled>立即备份</button>
      </footer>
    </section>
  `;
}

function isProjectSafetyCenterAlreadyPlaced(panel, insertion) {
  if (!(panel instanceof HTMLElement) || !insertion?.element) return false;
  if (panel.dataset.nativeHost === "true") return true;
  if (insertion.mode === "append") return panel.parentElement === insertion.element;
  return panel.parentElement === insertion.element.parentElement &&
    insertion.element.nextElementSibling === panel;
}

function installProjectSafetyBackupCenter() {
  const dataCard = findDataManagementSettingsCard();
  if (!(dataCard instanceof HTMLElement)) return;

  const nativePlaceholder = document.getElementById("wanjuan-project-safety-center");
  if (nativePlaceholder instanceof HTMLElement && dataCard.contains(nativePlaceholder)) {
    nativePlaceholder.id = "wanjuan-project-safety-center-native-placeholder";
    nativePlaceholder.dataset.supersededByIndependent = "true";
    nativePlaceholder.style.display = "none";
  }

  let existing = document.getElementById("wanjuan-project-safety-center");
  const panel = existing instanceof HTMLElement ? existing : document.createElement("div");
  panel.id = "wanjuan-project-safety-center";
  panel.classList.add("wanjuan-project-safety-center-module");
  panel.dataset.nativeHost = "true";

  if (panel.parentElement !== dataCard.parentElement || panel.previousElementSibling !== dataCard) {
    dataCard.insertAdjacentElement("afterend", panel);
  }

  if (panel.dataset.boundByPreload !== "true") {
    panel.dataset.boundByPreload = "true";
    if (lastProjectSafetyInfo) {
      // 已有缓存：直接同步渲染完全体（秒开，无"同步中"占位骨架，无割裂感），随后后台静默刷新保证数据新鲜。
      try {
        applyProjectSafetyInfo(panel, lastProjectSafetyInfo);
      } catch (error) {
        console.warn("project safety center cached render failed", error);
      }
      refreshProjectSafetyCenter(panel).catch((error) => {
        console.warn("project safety center background refresh skipped", error);
      });
    } else {
      // 无缓存（极早期打开）：显示占位骨架并异步加载，完成后淡入软化切换。同时启动预热缓存以惠及下次打开。
      renderProjectSafetyCenterLoading(panel);
      prewarmProjectSafetyCenter();
      refreshProjectSafetyCenter(panel, { fade: true }).catch((error) => {
        console.error("project safety center failed", error);
        panel.innerHTML = `<div style="margin:16px 0;padding:12px;border:1px solid currentColor;border-radius:8px;color:inherit;background:transparent;">备份中心加载失败：${escapeProjectSafetyHtml(error?.message || error)}</div>`;
      });
    }
  }
}

// Desktop runtime patches:
// - Provide a minimal `chrome.*` shim so the web bundle doesn't think it's in a non-extension environment.
// - Auto-click the desktop entry button when it appears.

module.exports = {
  ensureProjectSafetyAutoBackupStarted,
  prewarmProjectSafetyCenter,
  escapeProjectSafetyHtml,
  formatProjectSafetyTime,
  renderProjectSafetyCenter,
  bindProjectSafetyListScroll,
  applyProjectSafetyInfo,
  refreshProjectSafetyCenter,
  findSmallestElementContainingText,
  findDataManagementContentPanel,
  getVisibleElementArea,
  elementContainsAllText,
  findSmallestVisibleAncestorContainingTexts,
  findProjectSafetyBackupCenterInsertion,
  findDataManagementSettingsCard,
  renderProjectSafetyCenterLoading,
  isProjectSafetyCenterAlreadyPlaced,
  installProjectSafetyBackupCenter,
};

// 跨模块依赖（late-require，规避循环依赖）
var {
  getCurrentProjectSafetyInfo,
  maybeRunProjectSafetyAutoBackup,
  mirrorProjectSafetySnapshotsToFiles,
  restoreProjectSafetySnapshot,
  setProjectSafetyConfig,
} = require("./project-safety.cjs");
