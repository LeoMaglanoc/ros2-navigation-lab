# Primary sources and compatibility evidence

Reviewed 2026-11-10. These sources informed the decisions; only local executable checks
establish that this repository's selected combination works.

- [Rust wasm32-unknown-unknown target](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html): supported target and restrictions. The actual crate builds with Rust 1.96.0; the WASM parity test asserts zero imports.
- [ROS 2 action design](https://design.ros2.org/articles/actions.html): goal, feedback, cancel and result semantics; no distinct preempted terminal state.
- [Jazzy rclpy action server source](https://github.com/ros2/rclpy/blob/jazzy/rclpy/rclpy/action/server.py): accepted callbacks, execution, futures and terminal transitions. This is the versioned implementation behind the adapter's lifecycle.
- [Jazzy action server example](https://github.com/ros2/examples/blob/jazzy/rclpy/actions/minimal_action_server/examples_rclpy_minimal_action_server/server.py): upstream action API example. Our cooperative implementation avoids its demonstration sleep.
- [Jazzy OccupancyGrid.msg](https://github.com/ros2/common_interfaces/blob/jazzy/nav_msgs/msg/OccupancyGrid.msg): row-major indexing and metadata. Our occupancy convention is explicitly 0/100.
- [ROS 2 QoS design](https://design.ros2.org/articles/qos.html): reliability and durability reasoning. Exact publisher profiles are in server.py.
- [ROS2WASM](https://ros2wasm.dev/): browser ROS research with Humble as its primary documented target; not evidence that this Rust crate or rclrs compiles against its middleware.
- [ROS 2 Emscripten/Zenoh demonstration](https://www.tobiasfischer.info/ros2-emscripten-zenoh-demo/): actual C++/Python ROS browser execution, with a router required for its communicating demos. Does not establish the requested Rust/browser combination.
- [ros2-rust upstream](https://github.com/ros2-rust/ros2_rust): native Rust ROS bindings considered but not used; we do not claim rclrs compatibility.
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): upload/deploy artifact workflow for a static project site.

The docs.ros.org tutorial pages returned an access-denied page during research, so the
versioned upstream implementation and raw message definitions were inspected instead.
No browser-native ROS experiment was required after selecting the shared-core architecture;
its feasibility remains unclaimed, rather than being incorrectly marked proven.
