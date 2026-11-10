# Optional native ROS 2 reference

This is a separate Jazzy/rclpy application using the same Rust navigation engine as a
native Linux library. It is retained for native CLI/action/QoS/TF exercises. It is **not**
the runtime behind the ROS2WASM browser application and does not share its live state.

## Start and inspect

```bash
docker compose --profile ros up --build -d ros
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 node info /navigation_server'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 action list -t'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 interface show navigation_interfaces/action/Navigate2D'
```

Send a goal; while it moves, send the second command in another terminal:

```bash
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 action send_goal /navigate_2d navigation_interfaces/action/Navigate2D "{x: 7.0, y: 2.6}" --feedback'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 action send_goal /navigate_2d navigation_interfaces/action/Navigate2D "{x: 2.6, y: 3.0}" --feedback'
```

A reachable replacement aborts the previous action with a superseded message. ROS 2
has no distinct preempted terminal state. Unreachable goals abort themselves and preserve
the previous motion. Cancellation stops and clears the route; arrival succeeds.
Ctrl+C stops the CLI client and should not be treated as a reliable cancellation request.

Observe telemetry and late-subscriber map delivery:

```bash
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 topic echo /odom --once'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 topic echo /map --qos-durability transient_local --once'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 topic info /map --verbose'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 run tf2_ros tf2_echo map base_link'
```

The map/path use reliable transient-local depth 1. Odom/cmd_vel stream at 50 Hz with
reliable volatile depth 10. TF is `map → base_link`; pose is ideal ground truth rather
than noisy odometry. `/cmd_vel` reports simulator velocity and is not a driver input.

**Learning:** compare topics with the custom action's goal/feedback/result/cancel flow;
explain durability versus reliability; explain the transform and its units. These are
native DDS/rclpy features and are not claimed for browser-local rmw_wasm_cpp.

## Integration test

Use a fresh isolated container so the test's server is not mixed with the interactive one:

```bash
docker build --target ros -t ros2-navigation-lab:ros .
docker run --rm -e ROS_DOMAIN_ID=43 ros2-navigation-lab:ros python3 /workspace/tests/ros_integration.py
```

The script starts a real server and checks actual DDS messages/actions, rejection,
supersession, unreachable-goal preservation, cancellation, final success and telemetry.
Stop interactive containers with `docker compose --profile ros down`.

## Native development without Docker

On Ubuntu 24.04 with ROS 2 Jazzy, colcon, rosdep and Rust installed:

```bash
source /opt/ros/jazzy/setup.bash
cargo build --locked --release
mkdir -p ros2_ws/src/navigation_lab/lib
cp target/release/libnav_core.so ros2_ws/src/navigation_lab/lib/
cd ros2_ws
rosdep install --from-paths src --ignore-src -r -y
colcon build
source install/setup.bash
ros2 launch navigation_lab navigation.launch.py
```

`NAV_CORE_LIBRARY` can override the `.so` path for iterative development. This host recipe
is documented but the verified reference environment is Docker, not every host ROS setup.
The [historical v1 architecture](history/v1-architecture.md) describes this reference;
the current main architecture describes actual browser ROS execution.
