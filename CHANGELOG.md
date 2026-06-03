# Changelog

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
