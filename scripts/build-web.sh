#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --locked --release --target wasm32-unknown-unknown
if [ -z "${NAVIGATION_ROS_ARTIFACTS:-}" ]; then
  bash scripts/build-browser-ros.sh
  NAVIGATION_ROS_ARTIFACTS="$PWD/.ros2wasm-build"
fi
mkdir -p dist
cp web/index.html web/app.js web/ros-runtime.js web/style.css web/favicon.svg dist/
cp target/wasm32-unknown-unknown/release/nav_core.wasm dist/
cp "$NAVIGATION_ROS_ARTIFACTS/ros_navigation.js" "$NAVIGATION_ROS_ARTIFACTS/ros_navigation.wasm" dist/
cp -R "$NAVIGATION_ROS_ARTIFACTS/licenses" dist/
touch dist/.nojekyll
