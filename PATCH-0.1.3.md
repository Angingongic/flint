# Flint 0.1.3 implementation

## Included

- Portable `.flint` set export/import, validated media, conflict preview, fresh IDs, remapped stars, native file association and queued open-file handling. Text export and `.flintbackup` remain separate.
- Reusable matching columns with independent shuffling, keyboard navigation, one-to-one editable pairs, deferred/instant feedback and per-pair saved results.
- Session-wide Unicode character palettes and caret/selection insertion.
- Persisted Ignore accents preference shared by written grading; strictness remains separate.
- Canonical-answer feedback for accepted accent/spelling variations.
- Explicit Learn “I don't know” outcome, stronger mistake signal, recognition-before-recall reinforcement, and a three-skip limit per card per session.
- Fresh Learn sessions after completion, with previous session snapshots and long-term card/review data retained.

## Architecture and schema

Existing React study/session components and native SQLite transactions remain in use. Schema version stays at 5; optional Learn fields are backward compatible. Completed Learn states are archived under historical session keys before replacing the active sequence. The updater endpoint, keys and release workflow are unchanged.

The two added Rust dependencies are Tauri's single-instance plugin (Windows open-file routing to an existing app) and the raster-only `image` decoder (validate corrupt/untrusted portable media with size limits). See [FLINT-SET-FORMAT.md](FLINT-SET-FORMAT.md) for the format and threat-boundary details.

Principal files: `src/PortableSet.tsx`, `src-tauri/src/portable.rs`, `src/Matching.tsx`, `src/TestView.tsx`, `src/test-engine.ts`, `src/AnswerInput.tsx`, `src/lib.ts`, `src/learn-engine.ts`, `src/Study.tsx`, `src/App.tsx`, `src/native.ts`, `src/LibraryView.tsx`, and Tauri bundle configuration.

## Verification

- 75 frontend tests passed, including 15 new grading, palette, lifecycle, pairing and preview tests. Existing dropdown navigation test was updated to assert focus inside the matching board; existing tests were retained.
- 12 Node CI/build/release tests passed.
- TypeScript, production frontend build and release version checks passed.
- 12 Rust tests passed, covering archive round trips, real PNG/WebP bytes, duplicate imports, SQLite reopening, metadata/star preservation, malformed/corrupt data and media, unsafe paths, atomic export replacement and failed-import cleanup.
- Windows NSIS packaging succeeded with the final image-decoding validation. The generated installer includes the `.flint` Open With registration.
- Manual browser QA verified pair reassignment and no correctness leakage before submission. A deliberately mixed three-card test scored 33%, preserved its result and displayed the actual correct pairing for both errors.

## Remaining verification / distribution

The local Windows NSIS package is built without updater-signature generation; production signing remains enabled in the checked-in release configuration. This patch does not install itself, push a tag or publish a GitHub release. The installed user library has not been used for testing.

Installed Windows/macOS double-click association tests and macOS packaging/runtime tests remain unverified here. The existing GitHub Actions Windows/universal-macOS matrix remains in place. macOS builds are ad-hoc/non-notarized without Apple credentials; Windows has no publisher signature, so Gatekeeper/SmartScreen warnings remain possible.
