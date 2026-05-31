// 主进程运行期共享状态：静态服务器 baseUrl（用于 IPC 来源校验与窗口加载）。
// 由 index.cjs 在静态服务器就绪后写入，ipc.cjs / window.cjs 读取。
let desktopBaseUrl = null;

function getDesktopBaseUrl() {
  return desktopBaseUrl;
}

function setDesktopBaseUrl(url) {
  desktopBaseUrl = url;
  return desktopBaseUrl;
}

module.exports = { getDesktopBaseUrl, setDesktopBaseUrl };
