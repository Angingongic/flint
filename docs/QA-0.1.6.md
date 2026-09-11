# Flint 0.1.6 validation

Scope: Library & Study Polish, originally requested as 0.1.5 in the brief. Version 0.1.5 had already shipped as Flint 0.1.4a; user approved 0.1.6 instead.

## Automated checks

- 106 frontend tests in 11 files, including 12 focused polish tests.
- 12 Node CI/release tests, separate from Vitest discovery.
- 18 Rust tests, including persisted set pin/folder metadata after reopening SQLite and existing media sharing/backup coverage.
- TypeScript, cargo check, Rust formatting, release/version validation, production frontend build.
- Local NSIS and MSI packaging supported and exercised without requiring a local updater key.

## Browser smoke test

Checked existing synthetic browser QA data only, not the installed application's SQLite database. Verified right-click opens the existing set menu, Front/Back swap and Undo work, Insert exposes only Image/Audio, and menu presentation in dark/light themes. Corrected narrow Insert summary and clipped dropdown discovered visually.

Pointer reorder, keyboard movement, root/folder moves, folder creation confirmation, independent folder/set ordering, remount persistence, pins/colors, starred scope and media choices are covered by automated UI tests. Physical touch/trackpad hardware and a native macOS interactive session were not tested locally.

## Persistence and release boundaries

- No database schema migration or updater redesign/key change.
- Set pins use existing SQLite set metadata. Manual order, folder pins/colors and selected sort use installation-local flint-library-layout-v1 storage. Existing updater preference backup includes this flint-prefixed key.
- Filtered Learn sessions retain original card/deck IDs and use existing card-ID-based session keys. Original all-card progress is not overwritten by a smaller starred session.
- Existing .flint image/audio sharing, Trash and Undo retained. Library layout is a local preference, not part of a shared set package.
- Windows remains without Authenticode signing. macOS remains ad-hoc signed/not notarized unless Apple credentials are configured. Updater signatures remain GitHub Actions' responsibility.
- Local results do not establish GitHub packaging/publication success or an installed macOS updater test. Consult the v0.1.6 workflow run for release status.
