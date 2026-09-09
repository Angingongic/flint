# Releasing Flint

Only a pushed stable version tag publishes an update. Main pushes run ordinary CI only.

## Release procedure

1. Start from a clean main branch. Run `npm run release:prepare -- patch` (minor = backward-compatible features; major = breaking changes; patch = fixes).
2. Replace the TODO in `RELEASE_NOTES.md` with concise user-facing notes. Keep its version heading. Never use generated commit noise as release notes.
3. Run `npm run release:check`, `npm test`, `npm run lint`, `npm run build`, and `cargo test --locked --manifest-path src-tauri/Cargo.toml`.
4. Commit the five synchronized version files and release notes, then push main and the exact tag reported by the helper:

```sh
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json RELEASE_NOTES.md
git commit -m "Release Flint VERSION"
git tag -a vVERSION -m "Flint VERSION"
git push origin main
git push origin vVERSION
```

Replace VERSION with the new version. Do not use plain `npm version`: it does not synchronize Cargo/Tauri. Do not force-move published tags. The legacy `publish-update` command now only prepares a version; it does not silently push.

## Credentials and transport

Required repository secret: `TAURI_SIGNING_PRIVATE_KEY`. Optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: absent/empty means an unencrypted key. Release preparation fails clearly without the key. The public key is embedded in `src-tauri/tauri.conf.json`; the private key must never enter source, artifacts or logs. Back it up securely. A new key requires a new baseline installer for old clients.

Production feed: https://github.com/Angingongic/flint/releases/latest/download/latest.json

The repository/releases must be publicly downloadable. Never embed GitHub tokens in Flint. HTTPS and Tauri's mandatory signature verification stay enabled.

Apple signing is separate and optional: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` if protected, `APPLE_SIGNING_IDENTITY`; notarization additionally uses `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID`. Without these, Mac releases are ad-hoc signed and NOT NOTARIZED; Gatekeeper warnings remain. Windows artifacts are not Authenticode publisher-signed; SmartScreen warnings may remain. Neither requires buying a certificate to use Tauri update signatures. Existing Tauri Windows signing configuration can be added later without changing the updater protocol.

## What the workflow does

The tag must match package.json, npm lock, Cargo.toml, Cargo.lock and Tauri configuration. The release starts as a draft. Both windows-latest and macos-latest test/build/sign through the official Tauri action. Mac builds are universal (Apple Silicon + Intel). Uploads are serialized to prevent races while the official action merges latest.json. Only after both succeed and metadata validation passes is the release published as latest.

Expected assets: Windows x64 NSIS `.exe` and MSI `.msi`, detached `.sig` files; universal macOS `.dmg`, `.app.tar.gz` and matching `.sig`; `latest.json`. The Mac tar contains Flint.app. Windows updater metadata prefers NSIS. darwin-aarch64 and darwin-x86_64 point to the universal archive. Validation rejects missing assets, mismatched versions, incorrect URLs or metadata signatures differing from uploaded signatures. It does not replace cryptographic verification by the installed Tauri plugin.

Inspect Actions > Release Flint, then Releases > the tag. Confirm all platform jobs and publication passed. Open the HTTPS feed without signing in; verify version and platform entries. Failed builds leave a draft and do not replace the last good public updater feed. Fix failures in a new commit/tag or delete a failed unpublished draft/tag deliberately; do not overwrite a shipped version.

## Real two-version acceptance test (not a build-only test)

The original 0.1.0 installer has a placeholder endpoint and a different public key. Install a new baseline with the production endpoint/key first; it cannot bootstrap itself through that old feed.

On Windows x64 and on Mac (test Apple Silicon and Intel if both are claimed):

1. Install the baseline release. Create a uniquely named set, attach images, save a study session and set a non-default preference. Export a backup and record the installed Settings version.
2. Publish a higher patch release with the same updater public key and app identifier.
3. Launch the older baseline. Confirm the app opens immediately, then announces the actual higher version and clean notes. Also test manual Check for updates.
4. Click Update Flint. Confirm progress completes and no installation/restart occurs yet. A successful plugin download verifies the signature; a bad signature must prevent installation.
5. While editing or studying, confirm Restart now is disabled. Finish/save normally, then explicitly click Restart now. A recovery SQLite/media archive and preference JSON are saved under the app-data `update-backups` directory before installation.
6. Confirm Flint restarts into the higher Settings version. Confirm the unique set, card images, review/session data and preferences survived. Test manual check now reports current.
7. Test offline launch, Later, and automatic checks OFF. None should block opening or force a restart.

GitHub packaging and mocked UI tests alone DO NOT prove installed-app replacement/restart or preservation of an actual profile. Record old/new versions, OS/architecture, result and data checks for each real run. Mac native runtime testing requires a Mac; GitHub's macOS build does not prove Gatekeeper or interactive update behavior.

Recovery backups are retained without automatic deletion. Preferences are saved separately as JSON for manual recovery; ordinary updates leave the existing app-data directory untouched. If backup creation fails, Flint refuses installation. Do not delete app data when reinstalling a baseline.
