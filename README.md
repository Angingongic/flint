# Flint

Flint is a fast, offline-first desktop study app for Windows and macOS. It uses React, TypeScript, and Tauri, with a deliberately compact, keyboard-friendly interface and no required account.

## Development

Requirements: Node 22+, Rust stable, and the [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/).

Run `npm run bootstrap` on Windows, or `bash scripts/bootstrap.sh` on macOS. The bootstrap detects and provisions Node, Rust/Cargo, platform build tools, npm packages, then runs frontend and Rust verification. OS installers may show their normal approval prompts.

```sh
npm install          # install build-time dependencies
npm run dev          # run the browser UI with hot reload
npm test             # run answer-matching and import tests
npm run build        # type-check and make a production frontend
npm run tauri dev    # run the native desktop app
npm run tauri build  # create the platform installer
```

The installed app is self-contained and does not depend on this repository or a development server. Windows builds produce an NSIS installer; macOS builds produce `.app` and `.dmg` artifacts.

## Data and privacy

Installed builds store decks, cards, scheduling data, reviews, tags, folders, import history, and preferences in a bundled SQLite database under the OS application-data directory. The schema uses stable UUIDs, WAL transactions, indexes, and numbered migrations. Browser development retains a localStorage fallback. No analytics are included and no study content is transmitted.

## Signed updates and releases

See [RELEASING.md](RELEASING.md) for the exact procedure and installed-app acceptance test. `npm run release:prepare -- patch` synchronizes all version files; edit the release notes, verify, commit and explicitly push the matching version tag. Main pushes only run CI. Tagged releases are staged as drafts and published only after both platform builds and updater metadata validation pass.

The production HTTPS endpoint and public updater key are configured. The private key is supplied through GitHub Actions Secrets and never committed. Apple notarization and Windows publisher signing are separate from mandatory Tauri updater signatures.

## Troubleshooting

- Missing `cargo`: install Rust with rustup, then reopen the terminal.
- Windows packaging errors: install Visual Studio Build Tools with Desktop development with C++ and WebView2.
- macOS signing/notarization: add Apple certificate and notarization secrets to the release workflow before public distribution.
- Updater unavailable: verify the HTTPS endpoint, public key, GitHub release assets, and version increase. Flint continues running the existing installation if an update fails.

## Status

The native build includes SQLite persistence, deterministic spaced repetition, due/weak scheduling data, `.flintbackup` creation/restore, local PDF/DOCX/TXT extraction with preview, and signed updater controls. Automatic pre-update backup rotation, per-set backup export, richer document-to-card generation, and a fully automated installed-app independence smoke test remain future hardening work.
