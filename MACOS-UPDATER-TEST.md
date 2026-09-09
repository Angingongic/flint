# macOS installed-app acceptance test

Status: build, metadata, public download URLs and updater signatures verified; interactive installation/restart and profile preservation NOT yet tested on a Mac. This Windows session has no connected interactive Mac. Do not count GitHub's successful macOS packaging as a completed updater acceptance test.

Use the compatible 0.1.1 baseline from GitHub Actions run 34298568311, artifact `Flint-macos-latest-3`. It contains the new updater key and production endpoint. The original 0.1.0 Mac build has the old key/placeholder endpoint and cannot serve as this test baseline.

1. On a Mac, back up the existing Flint application data and install the 0.1.1 baseline. Keep the same application identifier and data directory. Do not delete app data. Baseline download: https://github.com/Angingongic/flint/actions/runs/34298568311
2. Confirm Settings reports 0.1.1. Record the library, image attachments, review counts, saved sessions, test history, theme and display name. Save a backup. For a checksum comparison, close Flint and use a read-only SQLite snapshot; hash each table's ordered rows and every file in its media directory. Reopen Flint.
3. Check for updates. Confirm the live feed offers 0.1.2 with meaningful notes. Click Update Flint and observe download completion. A successful Tauri plugin download verifies the matching updater signature.
4. Confirm no restart occurs during download. Use Later and confirm study/editing still works. Finish and save, then explicitly choose Restart now. Do not bypass Gatekeeper warnings blindly; ad-hoc builds are not notarized for public distribution.
5. After restart, confirm Settings reports 0.1.2. Compare all recorded SQLite tables, media file hashes and preferences. Check that the pre-update recovery archive and preferences JSON exist under app-data `update-backups`.
6. Check again and confirm “You're up to date.” Test offline launch and automatic checks OFF without blocking app startup.

Repeat on Apple Silicon and Intel to claim runtime verification for both. The published universal archive is https://github.com/Angingongic/flint/releases/download/v0.1.2/Flint_universal.app.tar.gz and the release is https://github.com/Angingongic/flint/releases/tag/v0.1.2.

Record machine architecture, old/new Settings versions, detection, signature/download, install/relaunch, SQLite comparison, media comparison, preferences, and any Gatekeeper prompt. Leave each unperformed check marked NOT TESTED.
