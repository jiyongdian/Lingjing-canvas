# Win x64 离线工具包制作要求

目标产物：`万卷灵境本地工具包-win-x64.zip`

这个工具包用于新版万卷灵境 App 的“设置 > 本地工具 > 导入离线工具包”。本包只做 Deface 和 Qwen-TTS，暂不包含 Real-ESRGAN。

## 目标平台

- Windows x64
- Python 3.12 x64
- 工具包 manifest 必须写：
  - `platform`: `win32`
  - `arch`: `x64`

## 目录结构

最终 zip 内应包含一个顶层目录：

```text
万卷灵境本地工具包-win-x64/
  wanjuan-toolpack.json
  runtime/
    python/
      cpython-3.12.x-windows-x86_64-none/
        python.exe
        ...
  tools/
    deface/
      venv/
        Scripts/
          python.exe
          deface.exe
    qwen-tts/
      venv/
        Scripts/
          python.exe
      qtts/
        qtts.py
```

`runtime/python/...` 是便携 Python runtime。推荐用 `uv python install 3.12` 后复制 uv 的 Python runtime 目录。App 导入时会把它复制到应用数据目录，并重写 venv 的 `pyvenv.cfg`。

## Manifest

`wanjuan-toolpack.json` 内容示例：

```json
{
  "protocol": "wanjuan-toolpack",
  "name": "万卷灵境本地工具包 Windows x64",
  "version": "2026.06.22",
  "platform": "win32",
  "arch": "x64",
  "runtimePython": "runtime/python/cpython-3.12.x-windows-x86_64-none",
  "tools": [
    {
      "id": "deface",
      "name": "Deface",
      "version": "1.5.0",
      "source": "tools/deface"
    },
    {
      "id": "qwen-tts",
      "name": "Qwen-TTS",
      "version": "0.1.1",
      "source": "tools/qwen-tts"
    }
  ],
  "notes": "Windows x64 离线工具包，包含 Deface 和 Qwen-TTS，不包含 Real-ESRGAN。"
}
```

实际 `runtimePython` 路径要和工具包里的目录名一致。

## 推荐制作步骤

在 Windows x64 机器上操作。

1. 准备目录：

```powershell
$Pack = "$env:USERPROFILE\Desktop\万卷灵境本地工具包-win-x64"
Remove-Item $Pack -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$Pack\tools\deface", "$Pack\tools\qwen-tts", "$Pack\runtime\python" | Out-Null
```

2. 准备 Python 3.12 runtime，推荐用 uv：

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
uv python install 3.12
uv python dir
```

复制 `uv python dir` 下对应的 `cpython-3.12.x-windows-x86_64-none` 目录到：

```text
%USERPROFILE%\Desktop\万卷灵境本地工具包-win-x64\runtime\python\
```

3. 构建 Deface：

```powershell
$Python = "<Python 3.12 runtime>\python.exe"
& $Python -m venv "$Pack\tools\deface\venv"
& "$Pack\tools\deface\venv\Scripts\python.exe" -m pip install --upgrade pip setuptools wheel
& "$Pack\tools\deface\venv\Scripts\python.exe" -m pip install "deface==1.5.0"
& "$Pack\tools\deface\venv\Scripts\deface.exe" --version
```

4. 构建 Qwen-TTS：

```powershell
& $Python -m venv "$Pack\tools\qwen-tts\venv"
& "$Pack\tools\qwen-tts\venv\Scripts\python.exe" -m pip install --upgrade pip setuptools wheel
& "$Pack\tools\qwen-tts\venv\Scripts\python.exe" -m pip install --no-deps "qwen-tts==0.1.1"
& "$Pack\tools\qwen-tts\venv\Scripts\python.exe" -m pip install `
  "transformers==4.57.3" `
  "accelerate==1.12.0" `
  "gradio" `
  "librosa" `
  "soundfile>=0.12.1" `
  "sox" `
  "onnxruntime" `
  "einops" `
  "click>=8.0.0" `
  "pydub>=0.25.1"
& "$Pack\tools\qwen-tts\venv\Scripts\python.exe" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
```

5. 放入 qtts 源码：

```powershell
git clone https://github.com/daliusd/qtts.git "$Pack\tools\qwen-tts\qtts"
& "$Pack\tools\qwen-tts\venv\Scripts\python.exe" "$Pack\tools\qwen-tts\qtts\qtts.py" --help
```

如果没有 git，可以下载 `https://github.com/daliusd/qtts/archive/refs/heads/main.zip`，解压后把包含 `qtts.py` 的目录改名为 `qtts`。

6. 写入 `wanjuan-toolpack.json`。

7. 压缩：

```powershell
$Zip = "$env:USERPROFILE\Desktop\万卷灵境本地工具包-win-x64.zip"
Remove-Item $Zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $Pack -DestinationPath $Zip -Force
```

## 验证标准

制作完成后必须验证：

1. zip 内只有一个顶层目录 `万卷灵境本地工具包-win-x64`。
2. 顶层目录存在 `wanjuan-toolpack.json`。
3. `tools\deface\venv\Scripts\deface.exe --version` 输出版本。
4. `tools\qwen-tts\venv\Scripts\python.exe tools\qwen-tts\qtts\qtts.py --help` 能正常输出 Usage。
5. 安装新版 Win x64 万卷灵境，进入“设置 > 本地工具”，点击“导入离线工具包”，选择 zip。
6. 导入后点击 Deface / Qwen-TTS 的“检测状态”，都应显示“已安装”。

## 注意事项

- 不要在 Mac 上制作 Win 包，Python venv 和 wheel 都是平台相关的。
- 不要把 Real-ESRGAN 放入此版本工具包。
- 不要把工具包路径写成绝对路径，manifest 里的 `source` 和 `runtimePython` 必须是相对路径。
- 如果 Qwen-TTS 安装体积很大是正常的，最终 zip 可能数百 MB 到数 GB。
