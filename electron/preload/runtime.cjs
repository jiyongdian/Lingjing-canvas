// 预加载层运行时基础：Electron 桥接对象与 Node 模块、上下文隔离标志。
// 所有预加载域模块从这里取 contextBridge/ipcRenderer/shell 等共享引用。
const { contextBridge, ipcRenderer, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const PRELOAD_CONTEXT_ISOLATED =
  typeof process !== "undefined" &&
  process.contextIsolated === true;

module.exports = {
  contextBridge,
  ipcRenderer,
  shell,
  fs,
  os,
  path,
  execFile,
  execFileAsync,
  PRELOAD_CONTEXT_ISOLATED,
};
