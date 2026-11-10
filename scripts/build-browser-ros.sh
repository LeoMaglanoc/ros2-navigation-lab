#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker build --target browser-ros -t ros2-navigation-lab:browser-ros .
artifacts_container=$(docker create ros2-navigation-lab:browser-ros true)
trap 'docker rm -f "$artifacts_container" >/dev/null' EXIT
mkdir -p .ros2wasm-build/licenses
docker cp "$artifacts_container:/ros-wasm/build/browser_navigation/ros_navigation.js" .ros2wasm-build/
docker cp "$artifacts_container:/ros-wasm/build/browser_navigation/ros_navigation.wasm" .ros2wasm-build/
docker cp "$artifacts_container:/ros-wasm/notices/." .ros2wasm-build/licenses/
