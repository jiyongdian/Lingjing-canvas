# 万卷灵境

万卷灵境是一款面向 AI 创作流程的桌面画布应用。它把文本、图像、视频、音频、音乐、智能体和项目资料放进同一个本地工作台，让创作者可以用节点、素材和任务记录组织完整的生成链路。

适用平台：

- macOS Apple Silicon，arm64
- Windows x64
- Windows x86 / ia32

[下载最新版](../../releases/latest)

![灵境画布](docs/screenshots/01-canvas.png)

## 项目定位

万卷灵境不是单一模型客户端，而是一套本地桌面创作工作台。它重点解决三类问题：

- **流程可视化**：把提示词、参考图、生成结果、后处理节点放在同一张画布中，生成结果可以继续作为下游节点输入。
- **素材可复用**：统一管理图片、视频、音频、文本等素材，减少反复下载、复制、丢链接和找文件的时间。
- **配置可迁移**：把模型服务、上传通道、项目备份、智能体知识和本地工具集中管理，方便长期项目迭代。

## 代表功能

- **节点式灵境画布**：支持文本、图片、视频、音频、音乐等创作节点，适合搭建多步骤 AI 工作流。
- **资源库**：集中查看生成和导入素材，支持类型筛选、来源筛选、收藏、复制、下载和复用。
- **任务清单**：统一追踪异步生成任务，支持结果刷新、拉回节点和失败排查。
- **智能体工作台**：创建带角色设定、模型绑定和知识资料的智能体，用于提示词整理、创意推演和内容生成。
- **模型与 API 配置**：通过配置管家维护 Base URL、Key、模型列表和协议映射，适配不同中转站和模型服务。
- **即梦 / Seedance 工作流**：支持参考图、参考视频、天玑人像素材和视频生成链路。
- **项目与备份**：支持项目切换、分组、导入导出、备份中心和跨设备迁移。
- **桌面增强**：提供本地媒体库、自动下载、性能档位、主题外观和外部媒体处理工具。

## 界面预览

### 灵境画布

把参考素材、生成节点和结果节点连成一张可编辑的创作流程图。适合做多轮图像修改、产品图生成、视频链路和复杂提示词实验。

![灵境画布](docs/screenshots/01-canvas.png)

### 资源库

统一管理生成结果和导入素材，按图片、视频、音频、文本等类型筛选，方便把已有素材重新送回画布节点。

![资源库](docs/screenshots/02-resources.png)

### 智能体

为不同任务创建专属智能体，绑定模型、角色定位和知识资料，用对话方式整理项目目标、风格要求和提示词草稿。

![智能体](docs/screenshots/03-agents.png)

### 外观与通用设置

集中调整主题、语言、个性化描述和基础体验选项，让桌面工作台更贴近自己的创作习惯。

![外观与通用设置](docs/screenshots/04-settings.png)

### 模型与 API 配置

统一维护供应商、Base URL、密钥、模型列表和协议配置。配置管家可以帮助整理不同模型类型的调用方式。

![模型与 API 配置](docs/screenshots/05-config-butler.png)

### 项目与备份

导出和导入设置参数、画布项目和智能体配置；备份中心会记录项目状态，适合长期项目和跨设备迁移。

![项目与备份](docs/screenshots/06-data-backup.png)

## 安装

打开 [Releases](../../releases/latest)，按平台下载对应文件：

- macOS Apple Silicon：`wanjuan-lingjing-1.2.10.dmg`
- macOS 免安装压缩包：`wanjuan-lingjing-1.2.10-arm64-mac.zip`
- Windows 通用安装器：`wanjuan-lingjing-setup-1.2.10.exe`
- Windows x64：`wanjuan-lingjing-setup-1.2.10-x64.exe`
- Windows x86 / ia32：`wanjuan-lingjing-setup-1.2.10-ia32.exe`

macOS 首次打开如果遇到安全提示，可以右键点击应用图标，选择「打开」。

Windows 首次运行如果出现 SmartScreen 提示，请确认来源为本仓库 Release 后再继续。

## 从源码运行

需要 Node.js 与 npm。

```bash
npm install
npm start
```

## 构建安装包

```bash
# macOS 当前架构
npm run build

# Windows x64 + x86
npm run build:win

# 单独构建 Windows x64
npm run build:win:x64

# 单独构建 Windows x86 / ia32
npm run build:win:x86
```

构建产物会输出到 `release/` 目录。

## 数据与隐私

万卷灵境会在本机保存项目、配置、任务记录和媒体素材。仓库不会包含用户数据、运行日志、API Key、媒体库文件或本地存储数据库。

请在提交代码或发布版本前确认以下内容没有被加入 Git：

- `.env`、密钥、证书、API Token
- `~/Library/Application Support` 下的运行数据
- `~/Downloads` 下的媒体库和导出素材
- 构建产物、调试日志、临时截图

## 技术栈

- Electron
- React
- Vite
- TypeScript
- Zustand
- XYFlow

## 更新记录

完整更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## 反馈

欢迎通过 Issues 反馈问题、记录复现步骤或提出功能建议。描述问题时，请尽量说明应用版本、平台、节点类型、模型服务、是否使用本地媒体库，以及相关错误提示。

## 备注

此仓库基于一毛画布 dist 浏览器插件二次开发，原插件内付费功能均未修改。当前二次开发的实现途径是重新构建桌面应用，稳定性不等同于原插件。需要特定特价模型与长期稳定维护版本的用户，可前往一毛官网查看：[一毛画布官方说明](https://test-cyfyd24zfbua.feishu.cn/wiki/JrwVweiryijlX3kZKx5cGvgnnCE)。

此仓库的主要目的，是支持使用者更自由地配置自定义中转站模型。
