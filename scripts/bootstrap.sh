#!/usr/bin/env bash
set -euo pipefail
echo "Flint bootstrap: $(uname -s)"
if ! command -v node >/dev/null; then
  if command -v brew >/dev/null; then brew install node; else echo 'Install Homebrew from https://brew.sh, then rerun.'; exit 1; fi
fi
if ! command -v cargo >/dev/null; then
  echo 'Rustup will download the official Rust toolchain.'
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
if [[ "$(uname -s)" == "Darwin" ]]; then
  xcode-select -p >/dev/null 2>&1 || { echo 'Installing Apple command-line build tools; approve the OS dialog, then rerun.'; xcode-select --install; exit 1; }
fi
npm install
npm run lint
npm test
(cd src-tauri && cargo test && cargo check)
echo 'SUCCESS: dependencies installed; frontend and native checks passed.'
