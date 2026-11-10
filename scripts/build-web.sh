#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --locked --release --target wasm32-unknown-unknown
mkdir -p dist
cp web/index.html web/app.js web/style.css web/favicon.svg dist/
cp target/wasm32-unknown-unknown/release/nav_core.wasm dist/
touch dist/.nojekyll
