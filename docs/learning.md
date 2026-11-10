# Learn the system by observing it

Start with the Docker commands in the README. Each exercise connects a ROS concept to
something you can see, then asks you to explain it without relying on a memorized term.

## 1. Find the node

Run `ros2 node list` and `ros2 node info /navigation_server` inside the ROS container.
A node is a participant with interfaces and responsibilities, not a synonym for a class
or a single function. This node owns the simulated world and exposes navigation.

**Expected evidence:** one navigation node, its action server, and publishers for map,
path, odometry, velocity, and TF. Other temporary CLI nodes may appear while inspecting.

**Explain:** why can one node contain both a planner and controller? When would splitting
out a hardware driver become useful?

## 2. Distinguish topics, services, and actions

Topics carry streams or retained data. A service handles a request and response. An
action tracks a longer operation with a goal, feedback, terminal result, and cancellation.
Navigation fits the latter because completion takes time and users change their goals.

```bash
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 action info /navigate_2d'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 interface show navigation_interfaces/action/Navigate2D'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 topic list --include-hidden-topics'
```

Read `ros2_ws/src/navigation_interfaces/action/Navigate2D.action`. Its three sections
are goal, result, and feedback. Compare those fields with `server.py`.

**Explain:** why is sending a destination once different from publishing instantaneous
velocity continuously? Why is an action more useful than a bare goal topic here?

## 3. Replace a goal while moving

Use the two send-goal commands in the README. Watch feedback from the first terminal,
then send the second goal before the first finishes.

**Expected evidence:** the first result is aborted with “Superseded”, the new goal owns
motion, and the old result callback cannot clear the new route. In the browser, the goal
marker and remaining route change immediately. A request for `(10.6,6.2)` is geometrically
free but disconnected; it fails while preserving the previous goal.

**Explain:** acceptance, reachability, preemption policy, and cancellation are separate
choices. Why should an unreachable replacement preserve the existing valid route?

For executable cancellation and assertions, read `tests/ros_integration.py`, particularly
`cancel_goal_async()`. Ctrl+C on a CLI feedback client does not reliably cancel the robot.

## 4. Inspect pose and frames

Read one `/odom` message and run `tf2_echo map base_link`. Compare the position with the
core snapshot conventions. Quaternions use `z = sin(yaw/2), w = cos(yaw/2)` for planar yaw.

**Expected evidence:** pose and TF agree; the parent is `map`, child is `base_link`.

**Explain:** why does screen y point down while world y points up? Why is this ideal
simulator's `/odom` not evidence of a localization algorithm? Why is there no separate
`odom` frame or fake laser topic?

## 5. Discover QoS by joining late

The map is published once. Start a transient-local map subscriber after the server starts:

```bash
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 topic echo /map --qos-durability transient_local --once'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 topic info /map --verbose'
```

**Expected evidence:** the late subscriber gets the retained map. Volatile telemetry is
useful for recent data but does not promise historical messages. Reliability, durability,
and queue depth are different policies.

**Explain:** why retain the map/path but stream odometry? Why does “reliable” alone not
mean a late subscriber receives a message published before it existed?

## 6. Derive the planner

Trace `Grid::plan` in Rust. Mark the open queue, g-costs, parents, heuristic, stale-entry
check and reconstruction. On a four-neighbor grid, moving one cell changes Manhattan
distance by at most one; it cannot overestimate the minimum number of cardinal steps.

Draw a small map on paper, run the search, and compare it with uniform-cost BFS.
Read the independent oracle in the Rust tests. It deliberately avoids the production
neighbor helper. One-cell corridors can be free for a point but blocked for this robot.

**Explain:** what exactly is optimal? Why is the shortest grid route not necessarily
fastest once turns consume time? Why does robot radius change which goals are valid?

## 7. Trace one click end to end

1. `app.js` converts a pointer through the map's scale/letterbox to world metres.
2. `nav_goal` validates and snaps the destination, then runs Rust A*.
3. A successful transaction replaces the route and increments `goal_id`.
4. Fixed ticks turn and translate the robot along its waypoints.
5. A snapshot drives drawing and the status text.
6. In native ROS mode, the same tick updates `/odom`, `/cmd_vel`, and TF instead.
7. Arrival completes the action or updates browser status.

**Explain:** which part is navigation logic, which is middleware, which is UI, and which
part does GitHub Pages host?

## Native development

On Ubuntu 24.04 with ROS 2 Jazzy, its Python development tools, `colcon`, `rosdep`, and
Rust installed, the equivalent build is:

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

The package's setup.py installs the native library into its share directory. For rapid
Rust iteration, `NAV_CORE_LIBRARY` can override that path with an absolute `.so` path.
The native host recipe is provided for development; the verified reference environment
is the Docker image, not every possible host ROS installation.

## Interview teach-back

You should be able to explain in two minutes:
- Why Rust/WASM does not automatically mean browser-native ROS 2.
- How the same engine is reused without duplicating planning in Python/JS.
- Why the heuristic is admissible and what the collision model guarantees.
- How a moving robot accepts a new goal without an old result taking control.
- Which topics/actions exist, their types/units, and why each is needed.
- Why there is one node, why the map uses transient-local QoS, and what TF expresses.
- Which tests provide independent evidence and which assumptions remain simplified.
