Bundled extension tool runtimes can be placed here before packaging.

Supported lookup folders:
- `tool-runtime/darwin-arm64`
- `tool-runtime/darwin-x64`
- `tool-runtime/win32-x64`
- `tool-runtime/win32-ia32`

Each folder may contain executables directly or under `bin/`, for example:
- `bin/uv`
- `bin/python3.12`
- `bin/ffmpeg`
- `bin/realesrgan-ncnn-vulkan`

When a bundled runtime is absent, the app falls back to managed per-user
downloads under the app user data directory, then to system commands.
