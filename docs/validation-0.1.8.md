# Flint 0.1.8 validation

Local checks on September 13, 2026:

- 137 frontend tests passed; 13 separate Node CI/release tests passed.
- 22 Rust tests passed; cargo check and TypeScript lint passed.
- Production frontend build and release-version validation passed.
- Windows NSIS and MSI packaging succeeded without a local updater private key.
- Real-pointer browser QA verified folder nesting, three-level navigation, intentional set-on-set grouping, edge reordering, automatic switch to Custom, reload persistence, and preservation of Custom ordering when switching automatic sorts.

Production-app manual QA was interrupted by the user. The complete manual multimedia/recording, Match movement, ancestor-exit animation, and installed-app checklist has **not** been completed. The user subsequently explicitly requested pushing and publishing. Automated success is not a claim that those manual checks passed.

The release workflow retains separate Windows and universal macOS jobs and validates updater platform URLs/signatures against uploaded assets before publication. Windows Authenticode signing and macOS notarization are not configured by default. Actual GitHub packaging/publication results must be checked in the release run.
