# Flint 0.1.4

- Matching tests now use randomized multi-pair groups, never singleton matches, with fixed prompts, draggable answers, keyboard reordering and per-row grading.
- Crop and reposition card images, with state-backed undo for text, attachments, stars, card order, deletion and bulk additions.
- Review normalized and high-confidence near duplicates during creation, text/document import and .flint import. Keep both, replace or skip explicitly.
- Add a command palette, shortcut reference and Learn number-key answer selection.
- Drag sets together to create folders, move sets into/out of folders, and rename or delete folders with confirmation.
- Trash keeps at most five sets for seven days. Permanent deletion removes related records and unshared tracked media.
- Fix dark Library dropdown colors, remove the Due library tab while preserving scheduling, and use the Windows GUI subsystem for release builds.

Database migration 6 adds persisted card order and media-cleanup bookkeeping. The updater endpoint and signing key are unchanged.

macOS builds remain ad-hoc signed and not notarized. Windows installers have no publisher signature; Gatekeeper/SmartScreen warnings may appear.
