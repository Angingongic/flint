# Build Flint with GitHub Actions

`.github/workflows/build.yml` builds on `windows-latest` and `macos-latest` when main is pushed, or through Actions > Build Flint installers > Run workflow. It does not publish releases. The existing tag-triggered `.github/workflows/release.yml` is unchanged.

## First push from PowerShell

Install GitHub CLI if absent (`winget install --id GitHub.cli -e`), then reopen PowerShell. Git must also be installed. Run:

```powershell
Set-Location 'C:\Users\Redux\Documents\Codex\2026-08-25\cal'
gh auth login
git init -b main
git add .github .gitignore scripts src src-tauri public package.json package-lock.json index.html tsconfig.json vite.config.ts README.md GITHUB-BUILD.md
git diff --cached --stat
git commit -m "Prepare Flint desktop builds"
gh repo create flint --private --source=. --remote=origin --push
```

If Git requests an author identity, set your own `git config user.name "YOUR NAME"` and `git config user.email "YOUR EMAIL"`, then retry the commit. Review staged files before committing. Outputs, scratch work, dependency folders, build artifacts and common credential files are ignored.

The push automatically triggers BOTH platform builds. No tag or secrets are needed. To rerun later:

```powershell
gh workflow run build.yml --ref main
gh run list --workflow build.yml
```

For an existing empty GitHub repository, replace `gh repo create ...` with these commands, substituting the real owner and repository:

```powershell
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Do not overwrite an existing repository with unrelated history. If git is already initialized, skip `git init`; push the intended source to main without force-pushing.

## Outputs

Open the completed run in GitHub Actions and download its `Flint-macos-latest-...` artifact. It contains a universal `.dmg` and `Flint-universal.app.tar.gz`. Extract the tar archive to get `Flint.app` with executable permissions preserved. The universal app targets Apple Silicon and Intel. The Windows artifact contains NSIS `.exe` and `.msi` installers.

macOS runners already include Xcode, clang and the native WebKit SDK. The workflow verifies them and installs both Apple Rust targets. No Homebrew Tauri libraries are required for this project; SQLite is bundled. Both jobs install npm dependencies, run TypeScript/frontend/Rust tests, build the frontend and package Tauri.

## Secrets

None are required for the first build.

Optional updater artifact signing:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only if the key is password-protected

Optional Apple Developer ID signing:
- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12` including private key
- `APPLE_CERTIFICATE_PASSWORD`: its export password, if set
- `APPLE_SIGNING_IDENTITY`: full Developer ID Application identity

For notarization, additionally:
- `APPLE_ID`: Apple account email
- `APPLE_PASSWORD`: Apple app-specific password, not the normal account password
- `APPLE_TEAM_ID`: Apple Developer team ID

No custom GitHub token or keychain-password secret is needed for this artifact-only workflow. Credentials are passed only to the build subprocess, not written into artifacts. Missing/incomplete Apple credential groups fall back to ad-hoc signing or skip notarization. Invalid supplied credentials can fail the build; they are not silently ignored.

## Distribution status

Without Apple credentials, the Mac output is ad-hoc signed and NOT NOTARIZED FOR PUBLIC DISTRIBUTION. Gatekeeper can block downloaded copies. `BUILD-STATUS.txt` and the job summary label this explicitly. Apple signing and updater signing are independent. Updater signatures alone do not notarize an app.

With updater secrets, Tauri creates updater archives/signatures alongside installers. This workflow does not publish an update feed. Before distributing updates, the app's updater public key must match the private key and the existing OWNER placeholder endpoint must be replaced with the real release endpoint.

The workflow has not run remotely until the source is pushed. No Mac runtime testing or successful DMG build is claimed before that run completes.

References: https://v2.tauri.app/distribute/sign/macos/ and https://v2.tauri.app/plugin/updater/
