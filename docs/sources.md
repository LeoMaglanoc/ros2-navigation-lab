# Primary sources and executable evidence

Reviewed 2026-11-10. Immutable source commits used by the actual browser build are
recorded in `ros2_wasm/vendor.lock.json`; source URLs alone are not feasibility proof.

- [ROS2WASM](https://ros2wasm.dev/): project and demonstrations of browser-executed ROS.
- [rmw_wasm upstream](https://github.com/ros2wasm/rmw_wasm): actual middleware source and support table. Publishers/subscribers/services are listed; actions, parameters and QoS are not supported.
- [Pinned local-delivery context](https://github.com/ros2wasm/rmw_wasm/blob/a8e824af1c9d8683bc5ba5b6cbd210ddd8947dc9/wasm_cpp/src/context.cpp): the in-module subscriber routing this design uses without a remote server.
- [ROS2WASM builder](https://github.com/ros2wasm/ros2wasm-builder): Emscripten 3.1.45 build settings and rcutils portability precedent. We use a project Docker build with explicit source pins and patches, not this older workflow unmodified.
- [ROS 2 rcl source](https://github.com/ros2/rcl/tree/humble/rcl): actual node, publisher, subscription and message-processing foundation compiled into the browser.
- [Common ROS interfaces](https://github.com/ros2/common_interfaces/tree/humble): real Pose2D/Twist/Path/Odometry/OccupancyGrid message definitions and generated introspection.
- [Dynamic message introspection](https://github.com/osrf/dynamic_message_introspection): YAML/message conversion used by the middleware.
- [Rust WASM target](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html): target used by the separate Rust algorithm module, not evidence of Rust ROS bindings in the browser.
- [ROS action design](https://design.ros2.org/articles/actions.html): useful for the optional native reference, explicitly not claimed by this browser middleware.
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): static artifact deployment under the portfolio project subpath.

The selected architecture was tested by building upstream ROS sources in Docker, observing
live rcl node handles and real typed delivery in Chrome, and removing/recreating the actual
goal subscription to verify that ROS participates in behavior. See verification.md.

The separate [Zenoh WASM demonstration](https://www.tobiasfischer.info/ros2-emscripten-zenoh-demo/)
is another genuine browser-ROS approach, but its communicating demos require a router.
This project instead uses ROS2WASM's in-module local transport and does not inherit that
infrastructure requirement or claim compatibility with that different stack.
