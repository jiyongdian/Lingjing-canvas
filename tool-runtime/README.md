Bundled extension tool runtimes can be placed here before packaging.

Product policy:
- Bundle Deface with the regular app whenever a platform build is available.
- Keep Qwen-TTS out of the regular app package; distribute it as an official
  optional offline tool pack because its Python/Torch/model footprint is large.

Release gate:
- Run `npm run prepare:bundled-deface` on each native release platform.
- Run `npm run verify:bundled-deface` on the same platform before packaging.
- macOS and Windows Deface runtimes are platform-specific. Do not build or
  verify the Windows runtime on macOS, or the macOS runtime on Windows.

Supported lookup folders:
- `tool-runtime/darwin-arm64`
- `tool-runtime/darwin-x64`
- `tool-runtime/win32-x64`
- `tool-runtime/win32-ia32`

Each folder may contain executables directly or under `bin/`, for example:
- `bin/uv`
- `bin/python3.12`
- `bin/ffmpeg`
- `bin/deface`
- `bin/realesrgan-ncnn-vulkan`

Deface can also be bundled as a prepared venv, for example:
- `deface/venv/bin/deface`
- `deface/venv/Scripts/deface.exe`

The preparation script writes a wrapper at `bin/deface` on macOS so the app can
resolve Deface through the same bundled runtime path as other command-line tools.

When a bundled runtime is absent, the app falls back to managed per-user
downloads under the app user data directory, then to system commands.
