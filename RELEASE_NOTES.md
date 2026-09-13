# Flint 0.1.8

## Multimedia and Library polish
- Animated GIFs stay animated on either card side. Local MP4/WebM video and direct audio recording join the Insert menu.
- Flashcards and Learn manage visible-side playback; Test media starts only when Play is pressed.
- Shared Flint sets preserve supported multimedia with versioned package validation and a subtle .flint source badge.
- Nested Library folders support ancestor navigation, recursive rename/move and cycle prevention. New Set follows the current folder.
- Drag previews distinguish reorder edges from containment centers, with shared restrained movement feedback and Custom sorting.
- Library storage includes database and media, including files retained for Undo.
- Redo extends existing editing history; number keys select valid visible multiple-choice answers.

Video/audio codec support depends on the operating system. Multimedia attachments are limited to 25 MiB each; portable packages retain the existing 100 MiB total limit. New multimedia packages require Flint 0.1.8 or later.

Windows installers are not Authenticode-signed (SmartScreen may warn). macOS builds are ad-hoc signed unless Apple credentials are configured and are not notarized by default. Updater signing remains configured in GitHub Actions.
