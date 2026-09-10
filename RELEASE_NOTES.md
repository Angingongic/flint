# Flint 0.1.5

## Flint 0.1.4a — UX completion pass

This release is displayed as **Flint 0.1.4a**. Its internal version is **0.1.5**, which correctly updates the already-published 0.1.4; 0.1.4-a.1 would be a downgrade.

- A matching board is one question throughout navigation, progress and scoring. Drag entire answers with mouse or touch, or use arrow keys. Compact numbered rows show placement results after submission.
- Folders are inline Library cards. Open a folder to see its sets, drag sets between folders or back to Library, and rename/delete folders with confirmation.
- Home is a focused resume dashboard; the redundant Study and Commands navigation items are removed. Keyboard help lives in Settings; Ctrl/Cmd+K still opens the palette.
- Image-only and audio-only card sides are supported. Attach MP3, M4A, WAV or OGG audio with a styled, keyboard-accessible player, no autoplay, single-player playback and navigation cleanup. Codec support depends on the operating system; MP3 and PCM WAV are recommended.
- Audio persists through save/reload, portable sets and full backups. Audio-containing .flint files use format v2 and require this release; existing v1 files remain readable.
- Trash offers confirmed permanent removal, alongside Restore and the seven-day/five-set retention rules. Associated unshared media is cleaned up.
- Refine Learn action spacing, matching density, folder tiles, audio players, image-only layouts and small-window accessibility.

Schema migration 7 adds nullable front/back audio references without changing existing card IDs, images or history. Updater keys and endpoints are unchanged.

macOS packages remain ad-hoc signed and not notarized. Windows installers have no publisher signature. Gatekeeper/SmartScreen warnings may appear.
