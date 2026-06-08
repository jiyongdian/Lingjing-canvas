// 集中解析 Electron 主进程对象，供各模块共享引用。
// 保留原始的 electron/main → electron 回退逻辑。
let app, BrowserWindow, shell, ipcMain, dialog, net, Menu;
try {
  ({ app, BrowserWindow, shell, ipcMain, dialog, net, Menu } = require("electron/main"));
} catch {
  ({ app, BrowserWindow, shell, ipcMain, dialog, net, Menu } = require("electron"));
}
if (!net) {
  try {
    ({ net } = require("electron"));
  } catch {}
}

module.exports = { app, BrowserWindow, shell, ipcMain, dialog, net, Menu };
