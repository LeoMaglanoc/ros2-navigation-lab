# Architecture decisions

## ADR 001 — Share a Rust core; keep ROS native (accepted)

**Problem:** provide a server-free GitHub Pages demo and teach actual ROS 2 without
turning a small navigation project into a middleware-porting research effort.

**Decision:** compile the same crate to WASM for the browser and a native Linux library
for a real Python ROS 2 node. Prove matching snapshots at the runtime boundary.

**Alternatives:** browser-native ROS via ROS2WASM; a remote ROS service connected by
WebSocket; a purely browser simulation with no ROS application.

**Why:** the first requires proving compatibility of Rust, a ROS client library, WASM
and middleware together. Existing C++/Python browser projects do not establish this
combination. A remote service adds hosting and availability requirements for visitors.
The chosen boundary keeps Rust substantive and the public demo static while giving ROS
learning its own executable, tested application.

**Cost:** the browser is not a ROS node and cannot demonstrate live ROS transport.
The UI and docs disclose this. Adding live connectivity is outside the MVP.

## ADR 002 — rclpy adapter and scalar C ABI (accepted)

Use rclpy for communication and an ordinary native Rust library for navigation. Do not
claim to use rclrs. A Rust ROS client is a reasonable alternative for a native-only
project, but it would add generated binding/build dependencies without improving this
small core's portability. The owner still learns genuine actions, nodes, messages, QoS,
launching and CLI diagnosis. Python contains no planner or controller.

A handful of scalar exports plus a copied JSON snapshot avoids Rust struct-layout
assumptions and a generated JS binding toolchain. Serialization is acceptable for 600
cells; it would be reconsidered for large maps or sensors. Calls and snapshots must be
serialized; the pointer lifetime is documented in the core and adapters.

## ADR 003 — Cardinal A* and turn-then-drive (accepted)

Four-connected A* with unit edge costs and Manhattan heuristic is easy to derive, verify,
and explain. A finite disc robot needs inflated obstacles. Cardinal segments and exact
waypoint clipping avoid diagonal corner collisions and overshoot. A* gives shortest grid
length, not minimum time with turning costs. No smoothing, dynamics or final orientation
is promised. Differential-drive velocity semantics are retained without a wheel model.

## ADR 004 — One ROS state owner (accepted)

Use one `navigation_server` node with logical planning/control/simulation functions.
Multiple nodes are useful when hardware drivers, localization, and control have separate
rates and lifecycles; here they would introduce state synchronization without separate
systems. A single-thread executor and cooperative futures make latest-valid-goal
ownership inspectable and deterministic. No blocking sleeps are permitted in callbacks.

## ADR 005 — Plain web UI and Docker environments (accepted)

Canvas and plain HTML/CSS/JavaScript are enough for one map and two controls. No framework
is required. Keep the map, status, Pause, and Reset visible on three target layouts;
learning details are collapsible. Docker multi-stage targets build both runtimes from
the same source and run nginx or ROS separately. GitHub Pages receives only static files.
