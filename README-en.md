# Command Overlay v1.3

Double-click `Start.cmd`. Requires Node.js 24+, FFmpeg/FFprobe, and Edge or Chrome. The existing parent translation project’s FFmpeg is detected automatically. On another PC, install FFmpeg/FFprobe in `tools` (including required DLLs) or on PATH. These runtimes are not bundled with this source folder.

1. Select your trimmed original video. Its path is linked directly without making a video copy. Relink it after moving or renaming the original.
2. Select up to three party members; save multiple party favorites. The starter catalog contains 62 agents. Add other agents using **Add portrait** and your own name/image.
3. Watch the video and record commands. Tap for a normal input; hold for a Hold label. Paused recording supports the label; adjust the hold end frame manually.
4. Select an event on the right to edit its custom text, Hold flag, timing, or delete it. Scrubbing does not change the edit selection.
5. Save your `.zzzoverlay` project and export. The latest work autosaves and restores on restart; source video bytes are not embedded in the project.

Space: play/pause. Arrows: one frame. 1/2/3: party member. A/S/D: basic/dodge/parry-switch. W/E/Q/Z: EX/special/ultimate/chain. Delete: delete selected. Ctrl+Z / Ctrl+Shift+Z: undo/redo. Text fields do not trigger command shortcuts. Change keys and Hold threshold in settings.

Up to three consecutive actions for the same agent group automatically. Splitting before the second or third action preserves later rows. Splitting at a row leader is disabled. Explicit merging requires the same agent and at most three combined actions. Delete, split and merge support undo.

For heavy videos, create a lightweight 720p playback preview. Source timing and final overlay dimensions stay unchanged. Conversion takes time initially.

Default export: cropped transparent ProRes 4444 MOV. A 3840×2160 source starts at 1024×512, expanding for longer text. Duration and selected FPS match the source timeline. Disable cropping for a full-source-resolution transparent frame. Alternatively export a PNG sequence and import `frames` using the FPS in `timing.json`.

Put the overlay above the source and align their start points in FilmCraft/EffectCraft. `timing.json` records top-left placement in source pixels. Center-based editors use `(x + width/2, y + height/2)`. Exported labels are baked in; edit the project to change them.

Verified with a 4K sample: recording, delete/undo, preview, autosave, MOV and PNG; MOV alpha, ProRes 4444, size and frame count. Import inside FilmCraft/EffectCraft has not yet been verified directly. Original command icons are 48×48; increasing export size cannot add original detail. See [ASSETS.md](ASSETS.md). All processing stays on this PC. Close the launch window to stop.

## v1.1 update

Added the default circular portraits for Phoenix, Velina and Remielle. Older projects gain these catalog entries while keeping their party, text and events. Rows now slide and fade, and active icon emphasis transitions smoothly (180 ms by default). Preview, MOV and PNG share the same source-time animation. Disable it or set 0–500 ms in Appearance / shortcuts. Seeking backward restores the same animation frame.

## v1.2 update

Original videos are linked directly. Only local connection metadata and requested 720p previews go in `data/uploads`; project files exclude the source path. Repeated selection reuses the connection. In Appearance / shortcuts, **Delete all 720p previews** removes this app's previews and switches active playback back to the original, preserving the original and event records.

Preview height fits the window so transport, timeline and input keys stay visible; the right pane scrolls independently. Connections default to `→`. Select the second or third action in a row to change only its incoming connection to `+`. Row leaders have no connector. Switch events offer white/yellow icons; choose the default for new switch inputs in settings. The yellow HUD original is 88×86, with different outer ring gaps from the reference. Hold end frame records release timing; currently only the Hold label is drawn, without duration-driven animation.

Playback volume and mute controls are beside the transport buttons and persist across restarts.

## v1.3 update

All 62 live Version 3.3 agents now have circular portraits and names in Korean, Simplified Chinese, Japanese, and English. The language selector has a globe icon. Use **Check for updates** at the bottom and **Install update** to install a newer release and restart. Finish export and preview jobs first. Personal projects, source videos, settings, and outputs are preserved; previous program files are backed up in `runtime/update-backup-*`.

First install on Windows: download the release ZIP, extract it, prepare [Node.js](https://nodejs.org/) 24+ and [FFmpeg](https://ffmpeg.org/download.html), then launch `Start.cmd`.
