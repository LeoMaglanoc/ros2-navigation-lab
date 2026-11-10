# Learn ROS 2 through the browser

Start with the live demo or `docker compose up --build -d web`. You do not need a native
ROS installation to observe this application's real browser-executed ROS nodes.

## 1. Find the real nodes

Expand **How it works**. The application reports `browser_ui → navigator` and
`rmw_wasm_cpp`. These names are read from initialized `rcl_node_t` handles. The middleware
identity comes from `rmw_get_implementation_identifier()`.

Read `ros2_wasm/src/browser_navigation/src/navigation.cpp`, starting at `main()`.
Find the two `rcl_node_init` calls and each topic's publisher/subscriber initialization.
A node is a participant with responsibilities/interfaces, not a synonym for a process.
Two nodes can share one process/context; here they share one WASM instance.

**Explain:** which node handles visitor requests, which invokes the planner, and why do
neither a WASM filename nor a ROS-looking UI alone prove that ROS is executing?

## 2. Follow a destination through a topic

Reset, note `/goal_pose`'s counts, then click a reachable destination. Both published and
received counts increase. `/plan` gains a new route; `/state` and `/odom` update as it moves.

Follow the source:
1. `app.js` converts pointer coordinates and calls the browser runtime adapter.
2. `ros_goal` constructs a real `geometry_msgs::msg::Pose2D` and calls `rcl_publish`.
3. `process_goals` takes it through `rcl_take` in the navigator.
4. Only that handler calls the Rust engine's goal function.
5. Rust computes the route; the navigator publishes a Path and rendering state.
6. The UI's actual ROS subscriber receives state; the canvas reads that received snapshot.

The topic counters observe the adapter's publish/take operations. They are not DDS
acknowledgments, timing guarantees, or fabricated JavaScript topic traffic.

**Explain:** what does ROS contribute here? What does Rust contribute? Why should moving
A* into JavaScript not be necessary to change the renderer?

## 3. Distinguish delivery from acceptance

Send a new valid goal while the robot moves. The route changes immediately. Now tap a wall
or the disconnected centre at approximately `(10.6,6.2)` metres.

**Expected evidence:** the goal topic still carries the request, but the UI reports the
validation/no-route outcome, the existing route is preserved, and `/plan` is not replaced.
A topic delivered a message; the application decided whether to act on it.

Pause, send another valid goal, and Resume. The robot holds while paused and later follows
the newest valid route. Read Rust `Engine::set_goal` for the transaction that prevents
failed requests from clearing an active route.

**Explain:** why are message delivery, goal reachability and motion ownership separate
concerns? What prevents an old goal's callback from taking control later in this design?

## 4. Prove that ROS is required

The automated Chrome suite removes an actual subscription using `rcl_subscription_fini`.
For a manual experiment, open the page with `?test=1`, Reset, and use the developer console:

```js
navigationLab.getRosGraph()
navigationLab.setGoalSubscription(false)
```

Click a reachable destination. Its publication count increases, its received count does
not, and navigation stays idle. Restore the real subscription:

```js
navigationLab.setGoalSubscription(true)
```

A new click now navigates. The missing subscription is not simulated by changing the
canvas. The C++ fault hook destroys/recreates the rcl subscription. Removing it does not
implicitly cancel a previously active route, which is why this exercise starts with Reset.

The fault hook is exposed to the test harness only on `?test=1`; read-only diagnostics
remain available on the normal page. See the browser test for reproducible assertions.

**Explain:** why is this stronger evidence than displaying a ROS badge or publishing
unused telemetry alongside an unrelated animation?

## 5. Read message types, frames and units

Inspect the topic table and [interface contract](architecture.md#interfaces).
- Pose2D carries a destination x/y in metres; this application fixes its frame as `map`.
- Path is a list of stamped cell-centre poses; it is a route rather than a velocity stream.
- Odometry carries pose plus twist; here pose is perfect simulated ground truth.
- Twist reports body-forward speed in m/s and yaw rate in rad/s.
- OccupancyGrid describes raw walls; the planner separately inflates them for robot size.

All world geometry uses +x right and +y up. Canvas y points down, so the UI flips it at
the input/rendering boundary. The robot rotates counterclockwise for positive yaw; the
planar quaternion uses `z=sin(yaw/2), w=cos(yaw/2)`.

Timestamps derive from simulation ticks and reset to zero. There is no independent
localization estimate, browser TF broadcaster, laser sensor or physical driver.

**Explain:** why is a point's collision-free route not automatically safe for a robot
disc? Why is `/cmd_vel` in this demo an observation, rather than a motor-driver input?

## 6. Understand rcl, client libraries and middleware

`rcl` is the shared ROS client-library foundation. Ordinary native applications commonly
use higher-level `rclcpp` or `rclpy` and an executor. This thin browser adapter uses rcl
explicitly so initialization, message ownership and non-blocking processing remain small
and visible. `rmw` is the middleware boundary; `rmw_wasm_cpp` provides this browser-local
implementation and typed introspection/YAML conversion.

Two real ROS nodes exchange messages locally inside one WASM instance. That does not
mean a host `ros2 topic list` can discover them over DDS. ROS2WASM's published support
table excludes actions, parameters and QoS; this project does not claim those features.

For production native navigation, an action can represent goal, feedback, result and
cancellation. Here goal/control/state topics provide a small explicit application
protocol because the selected browser middleware does not support ROS actions.

**Explain:** why is this still actual ROS code, and why is it also not a full native ROS
installation in a browser? Why would claiming Nav2 compatibility be misleading?

## 7. Derive A* and its independent checks

Read `Grid::plan` in Rust. Identify g-costs, the open queue, parent pointers, the Manhattan
heuristic, stale-entry removal and route reconstruction. Every step costs one and moves
cardinally; Manhattan distance cannot overestimate the remaining number of such steps.

The tests compare A* with a separate uniform-cost BFS on 400 seeded maps. With equal
edge costs, BFS is an independent shortest-cost reference. Its adjacency code does not
reuse the production helper. Separate tests check exact continuous swept-disc clearance
on every allowed edge and verify turn/translation bounds and latest-goal ownership.

**Explain:** why is a shortest grid route not necessarily the fastest path when turns
consume time? What would need to change before adding diagonals or smoothing?

## 8. Reproduce the build and execution boundary

`npm run build` compiles Rust and asks Docker to build upstream ROS sources at exact
commits. Inspect `vendor.lock.json`, `patch-sources.py`, and the Docker stages. Inspect
the built `ros_navigation.wasm` beside `nav_core.wasm`: the first owns ROS communication,
the second navigation algorithms. Their memories are separate; copied JSON and scalar
calls connect them.

Run `npm test` for actual Google Chrome execution. Run the same suite against the public
URL to verify GitHub Pages can load and execute the runtime under the project subpath.

**Explain:** what does Docker do during the build, and why does a visitor not need Docker?
Why did native/WASM parity alone fail to establish browser ROS execution in v1?

## Teach-back checklist

In two minutes, explain the two nodes, a goal's publication and subscription, the Rust
algorithm boundary, the returned state subscription, the independent tests, and the
middleware's limits. Point to the exact source calls and observed evidence for each.

For optional CLI/action/QoS/TF exercises outside the browser, use the separate
[native ROS reference](native-reference.md). Those capabilities belong to that native
application and do not extend the browser middleware's support.
