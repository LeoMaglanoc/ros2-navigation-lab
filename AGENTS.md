# Contributor instructions

## Purpose and scope
Build a small, understandable robotics portfolio project: one robot on a fixed 2D map,
A* planning, path following, and replacement goals while moving. Actual ROS 2 nodes
must execute inside the browser using ROS2WASM. Rust owns planning/control; a thin
C++ ROS layer owns typed publishers/subscribers. A separate native ROS demo is not
a substitute for this browser requirement. Keep the interface minimal and usable on
laptops, phones in portrait, and phones in landscape.

Do not add SLAM, obstacle editing, Nav2, 3D, multi-robot behavior, a backend service,
a dashboard, or a remote browser-to-robot connection without an explicit scope change.

## Explain the engineering
The owner is learning ROS 2 and must be able to explain this project to another engineer.
For consequential changes, explain:
1. The concrete problem and the changed behavior.
2. Where each component executes and which component owns state.
3. Why the chosen approach is appropriate, its main alternative, and its limitations.
4. What observable evidence supports correctness.
Update README.md and docs/architecture.md when behavior, ownership, frames, units,
QoS, or interfaces change. Add a short architecture decision in docs/decisions.md
for consequential choices. Keep PLAN.md honest about completed and outstanding work.
Prefer executable examples and small teach-back exercises over unexplained terminology.

## Architecture invariants
- crates/nav-core is the only planner/controller/simulator implementation. Do not
  reimplement navigation in JavaScript or Python.
- Browser mode MUST run real rcl nodes and rmw_wasm_cpp, compiled to WebAssembly.
  Goal delivery and observable state must pass through actual ROS publish/take calls.
  Do not substitute a JavaScript topic bus, ROS-shaped objects, or cosmetic ROS nodes.
- Keep Rust navigation reusable. Thin C++ ROS glue is allowed and required by the
  selected ROS2WASM toolchain; browser-native Rust ROS bindings are not assumed.
- ROS2WASM has experimental limitations. Do not claim action, parameter, QoS, DDS
  interoperability or graph-discovery support without executable evidence.
- All browser calls are serialized. The browser-local transport is not a physical
  robot connection or a remote ROS network.
- The earlier rclpy Docker adapter is a native reference, not the browser runtime.
- Only the latest accepted reachable goal owns motion. A rejected/unreachable request
  leaves the current goal untouched. No stale callback may cancel a newer goal.
- Coordinate convention: metres, radians, right-handed map frame, +x right, +y up.
  Canvas flips y only at the rendering/input boundary.
- Motion uses fixed 20 ms ticks. The controller turns in place before translating.
- Collision constraints apply to the robot disc plus clearance margin, not its centre alone.
- The scalar ABI and its JSON snapshot are versioned together in this repository.
  A snapshot pointer is borrowed until the next snapshot call; read/copy it immediately.

## Workflow and evidence
Use the pinned toolchain, committed lockfiles, and Docker targets. Never commit
credentials, build output, node_modules, ROS install trees, or test traces.
Read the implementation and primary upstream references before asserting compatibility.
Clearly label any untested platform or command; never substitute a mock for a ROS test
and call it integrated. No extra approval is required for routine reversible local work.

For core changes run cargo fmt --all -- --check, cargo clippy --workspace --all-targets
-- -D warnings, cargo test --locked --workspace, npm run build, and npm run test:parity.
For UI changes run the Playwright suite against Chrome, inspect screenshots, and verify
all three layouts. For browser ROS changes build the browser-ros/web Docker targets and verify actual
rmw_wasm_cpp typed delivery plus the real-subscription removal test in Chrome. For
native-reference changes build the ros Docker target and run the real DDS/action test. Keep tests independent where possible: uniform-cost search
is the A* reference, native/WASM parity checks the runtime boundary, ROS graph messages
check the adapter, and browser pointer/touch tests check the public interaction.

Before release, verify the GitHub Pages deployment and run the browser acceptance tests
against its actual public subpath. Report actual results and remaining limits.

## Redesign release gate
Before replacing the public demo, prove two actual ROS nodes exchange a typed message
in Chrome through rmw_wasm_cpp. Then prove disabling goal subscription processing
prevents navigation; ROS must participate in behavior. Keep the current deployment
available until the ROS2WASM replacement passes laptop/portrait/landscape tests.
