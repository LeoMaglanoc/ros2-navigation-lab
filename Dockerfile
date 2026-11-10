# Rust algorithms plus actual ROS2WASM browser nodes; native ROS remains optional.
FROM rust:1.96.0-bookworm AS core
WORKDIR /src
COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN rustup target add wasm32-unknown-unknown && cargo test --locked --workspace \
    && cargo build --locked --release && cargo build --locked --release --target wasm32-unknown-unknown

FROM emscripten/emsdk:3.1.45 AS ros-wasm-toolchain
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    python3-pip python3-setuptools python3-yaml python3-numpy python3-dev \
    git cmake libyaml-dev pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir colcon-common-extensions empy==3.3.4 lark catkin_pkg
WORKDIR /ros-wasm
COPY ros2_wasm/vendor.lock.json /config/vendor.lock.json
COPY ros2_wasm/scripts/fetch-sources.py ros2_wasm/scripts/patch-sources.py /config/
RUN python3 /config/fetch-sources.py && python3 /config/patch-sources.py
COPY ros2_wasm/scripts/build.sh /config/build.sh
COPY ros2_wasm/scripts/collect-licenses.py /config/collect-licenses.py

FROM ros-wasm-toolchain AS browser-ros-deps
RUN bash /config/build.sh --packages-up-to rcl rmw_wasm_cpp std_msgs geometry_msgs nav_msgs

FROM browser-ros-deps AS browser-ros
COPY ros2_wasm/src /ros-wasm/src/project
RUN bash /config/build.sh --packages-select browser_navigation && python3 /config/collect-licenses.py

FROM core AS web-build
COPY web ./web
COPY scripts/build-web.sh ./scripts/build-web.sh
COPY --from=browser-ros /ros-wasm/build/browser_navigation/ros_navigation.js /ros-wasm/build/browser_navigation/ros_navigation.wasm /src/.ros2wasm-build/
COPY --from=browser-ros /ros-wasm/notices /src/.ros2wasm-build/licenses
RUN NAVIGATION_ROS_ARTIFACTS=/src/.ros2wasm-build bash scripts/build-web.sh

FROM nginx:1.28-alpine AS web
COPY --from=web-build /src/dist /usr/share/nginx/html
EXPOSE 80

FROM ros:jazzy-ros-base AS ros
WORKDIR /workspace
COPY ros2_ws/src ./src
COPY --from=core /src/target/release/libnav_core.so /workspace/src/navigation_lab/lib/libnav_core.so
RUN . /opt/ros/jazzy/setup.sh && colcon build --event-handlers console_direct+
COPY scripts/ros-entrypoint.sh /ros-entrypoint.sh
COPY tests/ros_integration.py /workspace/tests/ros_integration.py
RUN chmod +x /ros-entrypoint.sh
ENTRYPOINT ["/ros-entrypoint.sh"]
CMD ["ros2", "launch", "navigation_lab", "navigation.launch.py"]
