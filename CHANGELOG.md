# Changelog

## 1.2.18-2 - 2026-06-18

- Fixed downstream nodes missing upstream reference images/videos after switching global unified API configs.
- Normalized local file, `file://`, and Windows/UNC media paths before reference media is passed to downstream image, video, and multimodal text requests.
- Made model-level protocol bindings take priority over unified API format overrides so reference field mappings such as `image` and `input_reference` are preserved.
- Normalized Config Butler generated global API configs with automatic protocol format defaults.
- Published supplemental macOS and Windows release packages for 1.2.18-2.

## 1.2.17 - 2026-06-17

- Added a copy action for user messages in the Agents chat view.
- Fixed Windows extension-tool installation failures caused by PowerShell `Expand-Archive` argument binding.
- Reused the corrected archive extraction path for uv, Qwen-TTS source archives, ffmpeg, and Real-ESRGAN packages.
- Updated Qwen-TTS runtime dependency pins to satisfy `qwen-tts==0.1.1`.
- Published macOS and Windows release packages for 1.2.17.

## 1.2.16 - 2026-06-17

- Improved extension tool installation with bundled/portable runtime lookup and managed per-user tool installs.
- Added cross-platform fallback installers for uv/Python, ffmpeg, Qwen-TTS, Deface, and Real-ESRGAN where possible.
- Added extension install logs to help diagnose missing dependency or environment failures on macOS and Windows.
- Published macOS and Windows release packages for 1.2.16.

## 1.2.15 - 2026-06-17

- Fixed imported external asset paths becoming invalid on Windows.
- Added the first-run default unified API config named Jixin with `https://newapi.guancn.uk` and an empty token.
- Removed the Recommended Relay module below Current Version.
- Published macOS and Windows release packages for 1.2.15.

## 1.2.14 - 2026-06-15

- Added the One-stop Center in model services with an embedded browser entry for the configured relay portal.
- Added a Recommended Relay section under Current Version so relay URLs are discoverable without shipping them as active default model/API configuration.
- Removed bundled default model/API presets from the visible configuration defaults while preserving manual setup through the configuration manager.
- Added a show/hide toggle for the Jimeng Tianji Authorization Token field.
- Published macOS and Windows x86 release packages for 1.2.14.

## 1.2.13 - 2026-06-11

- Fixed Jimeng/Seedance video nodes sometimes showing the first generated result after a later generation completed.
- Cleared stale local project media bindings when video generation starts, completes, or is refreshed from the task list.
- Made project reopen and global task recovery treat the latest completed video task as authoritative instead of reviving older local media bindings.
- Synced the fix into the macOS app build and updated the desktop package version to 1.2.13.

## 1.2.12 - 2026-06-10

- Fixed Jimeng/Tianji video nodes reopening with stale earlier results after multiple generations on the same node.
- Made completed Tianji, Seedance, Tongyi, and generic video task refreshes write the latest result directly back to the source node.
- Fixed async image task refreshes so recovered image URLs update the canvas node, not only the task list and resource library.
- Added background recovery for pending async image and Suno/audio tasks after reopening the app.
- Added a refresh action inside the Tianji portrait-library picker so newly uploaded portrait assets can be pulled into the node picker without visiting Settings.

## 1.2.11 - 2026-06-09

- Fixed video generation nodes reopening with expired cloud URLs even when completed results had already been saved into the local resource library.
- Made completed task-list refreshes prefer local resource-library copies instead of overwriting nodes back to remote result URLs.
- Corrected missing local media detection so stale paths from older machines are no longer treated as valid files.
- Published a supplemental macOS release package on top of the 1.2.10 release line.

## 1.2.10 - 2026-06-08

- Added Windows release packaging for x64 and x86/ia32 alongside the macOS arm64 build.
- Published GitHub Release assets with macOS and Windows installers plus auto-update metadata.
- Updated the desktop package version and in-app version display to 1.2.10.
- Refreshed the public README and product screenshots for the cross-platform release.

## 1.2.9 - 2026-06-06

- Improved large-canvas rendering responsiveness with lighter visible-node rendering, canvas interaction load shedding, media lazy handling, and throttled progress updates.
- Improved the asset picker UI with clearer selected filter states, roomier layout, default-collapsed mini preview behavior, and better video/audio resource previews.
- Fixed generated video and face-blur video download handling so completed media follows the same save path as other generated results.
- Polished project and settings details: removed storage-status suffixes from project names, added spacing around Backup Center, and kept Backup Center mounted natively in the settings surface.
- Restored the Jimeng node menu icon to the same blue sparkle visual used by the node title.

## 1.2.8 - 2026-06-03

- Added working Simplified Chinese, Traditional Chinese, and English language packs for the core app shell, Personalization settings, and the Assets panel.
- Fixed video editor toolbar clicks so Export Duplicate and layout buttons are no longer intercepted by drag/pan regions.
- Polished the Assets panel filter controls and added invalid-asset cleanup.
- Fixed Seedance/Jimeng node reference upload mode selection so per-node choices no longer snap back to the global default.
- Tianji Seedance reference media uploads now honor the selected node upload channel: temporary public link, Volcengine TOS, custom public host, or Qiniu S3.

## 1.2.7 - 2026-06-03

- Fixed image nodes falling back to the browser's broken-image text when thumbnails or remote image URLs expire.
- Added a Tianji portrait placeholder in Settings when signed portrait preview links are no longer accessible.
- Made Tianji portrait references store a portable preview for the canvas while keeping the portrait asset ID for generation.
- Persist newly generated resources to the local media library when possible, so future resource cards are less dependent on temporary remote URLs.
- Hardened generated-resource persistence against duplicate entries and late async updates overwriting user resource state.
- Patched Qwen-TTS status checks on macOS so the local tool script is normalized before probing availability.
- Refreshed the repository README and package description for a cleaner public project presentation.

## 1.2.6 - 2026-06-01

- Fixed Suno music tasks being marked completed before an audio URL was available.
- Added remote Suno task refresh through `/suno/fetch/{task_id}` so completed audio can be synchronized back to the node.
- Fixed music task records writing the wrong `nodeId`, which prevented task-list refresh from updating the source node.
- Fixed same-node Tianji/Seedance reruns so older completed tasks and previews no longer mirror the new task's running state.
- Improved the resources panel source filters with an all-sources view and clearer generated/external behavior.
- Made favorite models the node-side preferred default without reordering Settings model lists.
