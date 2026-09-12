# Flint 0.1.7

## Interaction & UI Cleanup

- Real pointer-based Library dragging: reorder sets and folders together, reorder inside folders, move sets in/out, and confirm set-to-set grouping. Manual order persists independently of automatic sorts.
- Shared right-click and three-dot actions with cursor/button anchoring and viewport collision handling.
- Matching boards now count as one question, adapt to requested counts, and contain 3–6 pairs. Pointer-follow dragging keeps all answers visible, with keyboard movement and controlled scrolling.
- Cohesive Library/folder controls collapse on downward scrolling and return on upward scrolling.
- Integrated Front/Back swap, an obvious title input, focused single-card editing with Save/Cancel/Undo, and visible starred-card states.
- Interactive cover upload/paste/presets, accurate Flint Originals attribution, and targeted image-drop feedback.
- Learn and Flashcards have scoped starred-only settings. Learn accent tolerance moves out of global Settings while preserving Unicode grading.
- Intentional text selection uses orange; draggable objects and UI chrome no longer select accidentally.

Existing image/audio storage, .flint sharing, Trash, backups, study history, and updater architecture are preserved. No database migration or new media formats.

Windows installers are not Authenticode-signed; SmartScreen may warn. The universal macOS build is ad-hoc signed and not notarized; Gatekeeper restrictions remain. Updater signatures use the existing release key.
