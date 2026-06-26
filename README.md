# 万卷灵境 Lingjing Canvas

<div align="center">

![万卷灵境](docs/screenshots/01-canvas.png)

**面向 AI 创作流程的桌面画布应用**

[![版本](https://img.shields.io/badge/版本-1.3.3-blue.svg)](https://github.com/Guan-XX003/Lingjing-canvas/releases)
[![平台](https://img.shields.io/badge/平台-macOS%20|%20Windows-lightgrey.svg)](#安装)
[![许可](https://img.shields.io/badge/许可-Private-red.svg)](LICENSE)

[下载最新版](../../releases/latest) · [功能介绍](#代表功能) · [快速开始](#从源码运行) · [更新记录](CHANGELOG.md)

</div>

---

## ✨ 项目简介

万卷灵境是一款强大的本地桌面 AI 创作工作台，专为现代 AI 创作者设计。它将文本、图像、视频、音频、智能体和项目资料整合到一个统一的画布环境中，让你轻松构建、管理和优化完整的 AI 生成链路。

### 🎯 核心价值

- **🎨 流程可视化** — 把提示词、参考素材、生成结果和后处理节点连成可编辑的创作流程图
- **📦 素材可复用** — 统一管理所有媒体资源，告别反复下载、复制和找文件的困扰
- **⚙️ 配置可迁移** — 集中管理模型服务、API 配置、智能体知识和本地工具，便于长期项目维护
- **👥 团队协作** — 1.3.0+ 全新工作区功能，支持团队项目分享和协作
- **🔧 离线工具包** — 内置扩展工具安装管理，支持本地媒体处理和增强功能

### 💎 适用场景

- AI 图像/视频生成与编辑工作流
- 多模型创作实验与提示词迭代
- 创意项目的素材管理与组织
- 智能体辅助的内容策划与生成
- 团队协作的 AI 创作项目管理

---

## 🚀 代表功能

### 📐 节点式灵境画布
基于 XYFlow 的可视化编辑器，支持文本、图片、视频、音频、音乐等多种创作节点，轻松搭建复杂的多步骤 AI 工作流。

![灵境画布](docs/screenshots/01-canvas.png)

### 📚 资源库
集中查看和管理所有生成与导入的素材，支持类型筛选、来源筛选、收藏、下载和一键复用到画布。

![资源库](docs/screenshots/02-resources.png)

### 🤖 智能体工作台
为不同任务创建专属 AI 智能体，绑定特定模型、角色设定和知识库，通过对话整理创意、优化提示词。

![智能体](docs/screenshots/03-agents.png)

### ✅ 任务清单
统一追踪所有异步生成任务，实时查看进度、刷新结果、处理失败任务，保持创作流程井然有序。

### 👥 工作区协作 `v1.3.0 新增`
团队项目管理功能，支持：
- 创建和管理团队工作区
- 项目分享与协作
- 成员权限管理
- 跨设备同步

### 🛠️ 离线工具包 `v1.3.0 新增`
内置扩展工具安装器，支持：
- ffmpeg 视频处理
- Qwen-TTS 本地语音合成
- Real-ESRGAN 图像增强
- Deface 人脸模糊处理
- 一键安装，跨平台支持

### ⚙️ 模型与 API 配置
通过配置管家维护 Base URL、API Key、模型列表和协议映射，灵活适配各类中转站和模型服务。

![模型配置](docs/screenshots/05-config-butler.png)

### 🎬 即梦 / Seedance 工作流
完整的视频生成链路，支持：
- 参考图/参考视频上传
- 天玑（Tianji）人像素材库
- 多种上传通道（临时链接、火山引擎 TOS、七牛等）
- 视频生成任务追踪

### 💾 项目与备份
支持项目切换、分组管理、导入导出、备份中心和跨设备迁移，保障长期项目的数据安全。

![项目备份](docs/screenshots/06-data-backup.png)

### 🎨 外观与主题
自定义主题、语言（简体中文、繁体中文、English）、个性化描述和界面设置。

![设置界面](docs/screenshots/04-settings.png)

---

## 📥 安装

### 支持平台

| 平台 | 架构 | 下载 |
|------|------|------|
| macOS | Apple Silicon (arm64) | [万卷灵境-1.3.3-arm64.dmg](../../releases/latest) |
| Windows | x64 | [万卷灵境-1.3.3-x64.exe](../../releases/latest) |

### 安装说明

**macOS:**
1. 下载 `.dmg` 文件
2. 双击打开，拖动到应用程序文件夹
3. 首次打开如遇安全提示，右键点击应用图标选择「打开」

**Windows:**
1. 下载对应架构的 `.exe` 安装器
2. 运行安装程序，按提示完成安装
3. 如遇 SmartScreen 提示，确认来源后继续

---

## 🛠️ 从源码运行

### 环境要求
- Node.js 16+
- npm 或 pnpm

### 开发运行

```bash
# 克隆仓库
git clone https://github.com/Guan-XX003/Lingjing-canvas.git
cd Lingjing-canvas

# 安装依赖
npm install

# 启动开发模式
npm start

# 或者启动开发服务器
npm run start:dev

# 调试模式
npm run debug
```

### 构建安装包

```bash
# 构建当前平台
npm run build

# 构建 Windows 全架构（x64 + x86）
npm run build:win

# 单独构建 Windows x64
npm run build:win:x64

# 单独构建 Windows x86
npm run build:win:x86
```

构建产物输出到 `release/` 目录。

---

## 🏗️ 技术栈

| 技术 | 用途 |
|------|------|
| [Electron](https://www.electronjs.org/) | 跨平台桌面应用框架 |
| [React 19](https://react.dev/) | UI 框架 |
| [Vite](https://vitejs.dev/) | 构建工具 |
| [TypeScript](https://www.typescriptlang.org/) | 类型安全 |
| [Zustand](https://zustand-demo.pmnd.rs/) | 状态管理 |
| [XYFlow](https://reactflow.dev/) | 节点画布引擎 |
| [GSAP](https://greensock.com/gsap/) | 动画库 |
| [Lucide](https://lucide.dev/) | 图标库 |

---

## 📋 更新记录

### 最新版本：v1.3.3（2026-06-26）

- 🎨 优化石墨灰主题控件配色、边界和选中态
- 🌐 新增内置语言包运行时，覆盖更多后渲染界面
- 🛠️ 完善 Deface 官方离线运行时打包与校验流程
- 💡 优化工作空间和功能提示词卡片布局

### v1.3.2（2026-06-24）
- 🎨 增强画布渲染性能和交互体验
- 🔧 改进天玑配置同步机制
- 🐛 修复多个稳定性问题

### v1.3.1（2026-06-23）
- 👥 完善工作区团队协作功能
- 🔧 优化天玑 API 调用逻辑
- 🐛 修复工作区项目加载问题

### v1.3.0（2026-06-22）
- ✨ **重大更新**：全新工作区和团队协作功能
- 🛠️ 新增离线工具包管理系统
- 🎨 优化启动主题和界面体验
- 📦 增强扩展工具安装器

[查看完整更新记录 →](CHANGELOG.md)

---

## 🔒 数据与隐私

万卷灵境在本地保存所有项目数据、配置、任务记录和媒体素材，**不会上传任何用户数据到云端**。

### 数据存储位置
- **macOS**: `~/Library/Application Support/wanjuan-lingjing/`
- **Windows**: `%APPDATA%/wanjuan-lingjing/`

### 安全提示
- 所有 API Key 仅存储在本地
- 媒体文件默认保存在用户指定的本地目录
- 项目备份支持加密导出

---

## 💬 反馈与支持

遇到问题或有功能建议？欢迎通过以下方式联系：

- 📝 [提交 Issue](../../issues)
- 💡 [功能建议](../../discussions)
- 📧 邮件反馈

**提交问题时请说明：**
- 应用版本
- 操作系统和版本
- 问题复现步骤
- 相关错误提示截图

---

## 📜 许可与声明

此项目基于 [一毛画布](https://test-cyfyd24zfbua.feishu.cn/wiki/JrwVweiryijlX3kZKx5cGvgnnCE) 浏览器插件二次开发。原插件的付费功能在本项目中保持不变。

**本项目主要目的：**
- 提供桌面版本的更好使用体验
- 支持自定义中转站和模型配置
- 方便本地化和扩展功能

需要官方稳定版本和商业支持的用户，请访问 [一毛画布官网](https://test-cyfyd24zfbua.feishu.cn/wiki/JrwVweiryijlX3kZKx5cGvgnnCE)。

---

## ⭐ Star History

如果这个项目对你有帮助，欢迎给个 Star ⭐️

---

<div align="center">

**Made with ❤️ for AI Creators**

[返回顶部](#万卷灵境-lingjing-canvas)

</div>
