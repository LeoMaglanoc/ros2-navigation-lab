# Contributor instructions

## Purpose and scope
Build a small, understandable robotics portfolio project: one robot on a fixed 2D map,
A* planning, path following, and replacement goals while moving. Rust owns navigation;
WebAssembly makes it available on a static website; a native ROS 2 adapter teaches real
nodes, actions, topics, QoS, and transforms. Keep the interface minimal and usable on
laptops, phones in portrait, and phones in landscape.

Do not add SLAM, obstacle editing, Nav2, 3D, multi-robot behavior, a backend service,
a dashboard, or a live browser connection without an explicit scope change.

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
- Browser mode is a simulation using Rust/WASM. It is NOT a ROS 2 middleware runtime,
  a ROS node, or a connection to physical hardware. Maintain this disclosure in the UI.
- ROS mode is a real rclpy node using the native build of the same Rust crate.
- ROS 2 calls into the ABI are serialized on one executor thread. Do not introduce
  a multithreaded executor without reviewing the entire snapshot and goal transaction.
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
all three layouts. For ROS changes build the ros Docker target and run the real
DDS/action acceptance test. Keep tests independent where possible: uniform-cost search
is the A* reference, native/WASM parity checks the runtime boundary, ROS graph messages
check the adapter, and browser pointer/touch tests check the public interaction.

Before release, verify the GitHub Pages deployment and run the browser acceptance tests
against its actual public subpath. Report actual results and remaining limits.
