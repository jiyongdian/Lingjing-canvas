# 万卷灵境离线工具包规范

离线工具包用于把 Qwen-TTS、Real-ESRGAN 等体积较大的本地工具预先打包好，再由主软件导入到应用数据目录。主软件保持轻量，工具包按平台和架构单独分发。

正式发布策略：

- Deface 随常规 App 安装包内置，作为“视频人脸打码”的基础能力。
- Qwen-TTS 作为官方可选离线工具包分发，不放进常规 App 安装包，避免默认安装体积过大。
- Real-ESRGAN 继续作为可选离线工具包或在线安装能力。

## 文件形式

App 支持导入：

- 一个工具包文件夹
- 一个 `.zip` 工具包

zip 可以直接包含 manifest，也可以只有一个顶层目录，manifest 放在该顶层目录内。

## Manifest

工具包根目录必须包含 `wanjuan-toolpack.json`：

```json
{
  "protocol": "wanjuan-toolpack",
  "name": "万卷灵境本地工具包 macOS arm64",
  "version": "2026.06.22",
  "platform": "darwin",
  "arch": "arm64",
  "runtimePython": "runtime/python/cpython-3.12.13-macos-aarch64-none",
  "runtimeBin": "runtime/bin",
  "tools": [
    {
      "id": "qwen-tts",
      "name": "Qwen-TTS",
      "version": "0.1.1",
      "source": "tools/qwen-tts"
    },
    {
      "id": "real-esrgan",
      "name": "Real-ESRGAN NCNN Vulkan",
      "version": "0.2.5.0",
      "source": "tools/real-esrgan-ncnn-vulkan"
    }
  ]
}
```

`platform` 支持 `darwin`、`win32`。`arch` 支持 `arm64`、`x64`、`ia32`。也可以写成数组字段 `platforms` / `arches`。

## 目录结构

推荐结构：

```text
wanjuan-toolpack-mac-arm64/
  wanjuan-toolpack.json
  runtime/
    python/
      cpython-3.12.13-macos-aarch64-none/
        bin/
          python3.12
    bin/
      ffmpeg
      ffprobe
      uv
  tools/
    qwen-tts/
      venv/
        bin/
          python
      qtts/
        qtts.py
    real-esrgan-ncnn-vulkan/
      realesrgan-ncnn-vulkan
      models/
```

Windows 包对应结构：

```text
wanjuan-toolpack-win-x64/
  wanjuan-toolpack.json
  runtime/
    python/
      cpython-3.12.13-windows-x86_64-none/
        python.exe
    bin/
      ffmpeg.exe
      ffprobe.exe
      uv.exe
  tools/
    qwen-tts/
      venv/
        Scripts/
          python.exe
      qtts/
        qtts.py
    real-esrgan-ncnn-vulkan/
      realesrgan-ncnn-vulkan.exe
      models/
```

## 导入目标

导入后 App 会复制到用户数据目录：

- `qwen-tts` -> `extension-tools/qwen-tts`
- `real-esrgan` -> `extension-tools/real-esrgan-ncnn-vulkan`
- `runtimeBin` -> `extension-tools/bin/<platform>-<arch>`
- `runtimePython` -> `extension-tools/python/<runtime-folder>`

macOS 导入时 App 会自动给常见脚本和可执行文件补 `755` 权限。如果工具包带 `runtimePython`，App 还会重写已导入 venv 的 `pyvenv.cfg`、Python symlink 和 console script shebang，避免 venv 继续指向打包机器上的绝对路径。

## 制作建议

- 工具包应在干净系统或虚拟机里预构建并验证。
- 不要把 Win 和 Mac 混在一个包里，按平台架构拆分。
- Qwen-TTS 的 venv 和模型体积较大，必须单独版本化，不要放进常规 App 安装包。
- Deface 默认随 App 内置；只有需要修复或替换 Deface 时，才制作包含 `deface` 条目的离线工具包。
- 每次发布工具包前，先在同平台空白机器上导入并点击“检测状态”确认通过。
