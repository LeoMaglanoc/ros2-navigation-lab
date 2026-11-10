# One Rust builder supplies the browser and the real ROS 2 application.
FROM rust:1.96.0-bookworm AS core
WORKDIR /src
COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN rustup target add wasm32-unknown-unknown && cargo test --locked --workspace \
    && cargo build --locked --release && cargo build --locked --release --target wasm32-unknown-unknown

FROM core AS web-build
COPY web ./web
COPY scripts/build-web.sh ./scripts/build-web.sh
RUN bash scripts/build-web.sh

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
