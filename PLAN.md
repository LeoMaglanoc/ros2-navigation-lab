# Navigation Lab — detailed project plan

This document records the implemented MVP, its rationale, milestone acceptance gates,
and release procedure. It remains useful as an implementation map rather than a wishlist.
See docs/verification.md for actual execution evidence and limits.

## 1. Outcome and non-goals

Deliver a public GitHub repository and a GitHub Pages demo. Visitors on laptop or phone
can choose a destination on a 2D obstacle map, see the A* route, and watch a mobile robot
follow it. New valid goals can replace the route during motion or pause. The same Rust
engine must run in an actual ROS 2 application with documented, observable interfaces.
The owner should be able to explain the architecture and reproduce its behavior.

Acceptance is behavioral: a visually plausible animation is insufficient. The planner
must match an independent optimal-cost reference; motion must respect footprint/velocity
constraints; old goals must not regain ownership; native and WASM results must agree;
ROS messages/actions must actually execute; and the deployed subpath must work in Chrome.

No obstacle editing, SLAM, Nav2 integration, sensors, real hardware, remote service,
3D graphics, route smoothing, or multiple robots. Do not silently grow this list.

## 2. Feasibility decision before dependent work

### Question
Can the chosen Rust crate run without host imports in a static browser and also be
called by an actual ROS 2 node? Does sharing the code preserve deterministic behavior?

### Raw evidence
Inspect Rust target support, upstream versioned rclpy action source, actual message and
action definitions, and browser-ROS projects. See docs/sources.md. Do not infer Rust
middleware support from a C++ or Python WASM demonstration.

### Bounded experiment
Budget: one initial implementation session, limited to a native/WASM crate, scalar ABI,
a minimal native caller, and a tiny browser caller. No middleware porting.

1. Compile the core to `wasm32-unknown-unknown` and a Linux `cdylib` with Rust 1.96.0.
2. Assert the WASM module has zero imports, instantiate it, and call reset/goal/tick.
3. Replay the same movement/replacement sequence in native Rust and WASM.
4. Compare complete snapshots with `1e-10` numeric tolerance.
5. In a Jazzy Docker container load `.so` through ctypes and expose a real action.

**Success:** both builds execute, snapshots agree, and real action/topic observers see
results. **Fallback:** preserve the static Rust demo and isolate an explicitly documented
ROS integration blocker. Do not label an unimplemented ROS package as integrated.

**Decision:** shared core, standalone browser, native rclpy adapter (ADR 001/002).
This experiment passed locally. Browser-native ROS is not part of the selected design;
its Rust compatibility is not claimed or a prerequisite.

## 3. Runtime and repository design

Read docs/architecture.md for the diagrams and interface contract. Ownership:

| Component | Owns | Must not own |
| --- | --- | --- |
| Rust `Grid` | Raw occupancy, inflated mask, indexing, A* | UI or middleware |
| Rust `Engine` | Pose, route, goal ID, controller, fixed ticks | Browser time or ROS callbacks |
| Browser adapter | Coordinate conversion, clock accumulator, drawing, controls | Search/controller algorithm |
| ROS adapter | Action lifecycle, single-thread scheduling, message conversion | Search/controller algorithm |
| Docker/CI | Toolchains, checks, static deployment | Runtime robot state |

Paths: `crates/nav-core/src/lib.rs`, `web/`, `ros2_ws/src/navigation_interfaces/`,
`ros2_ws/src/navigation_lab/`, `tests/`, `scripts/`, `.github/workflows/` and `docs/`.

The ABI uses reset, goal, tick, pause, cancel, snapshot pointer, and snapshot length.
Keep scalar argument types and copy snapshot bytes before another snapshot call. Only
one engine exists per loaded module/process. Multiple robots would need a different API.

## 4. Mathematical and behavioral specification

### Map and planner
- 30 × 20 cells, 0.4 m each, with border walls and fixed interior rectangular obstacles.
- Metres and radians, map origin bottom left, row-major occupancy, right-handed axes.
- Robot radius 0.18 m plus 0.03 m margin. Derive blocked cells from distance to occupied
  rectangles; do not treat the robot as a point.
- Four cardinal neighbors, unit edge cost, Manhattan heuristic, deterministic queue ties.
- Reject out-of-map, nonfinite, or blocked goals. Return no-route for disconnected goals.
- Return the start and goal cell centres in the route. A* optimality applies to cardinal
  grid length; include return-to-centre distance separately in displayed route length.

### Motion and scheduling
- Fixed 20 ms integration; v ≤ 0.9 m/s, |ω| ≤ 3 rad/s.
- Rotate in place, then translate toward the current waypoint; clip the final step.
- Replanning begins with the current cell centre, even during a segment. Brief backtracking
  is acceptable; jumping to a new cell or cutting a corner is not.
- Skip coincident waypoints; declare arrival at the final centre; final yaw is unconstrained.
- Browser renders with animation frames but advances fixed ticks. Cap long deltas and
  discard hidden-tab time. ROS advances one tick per timer callback.

### Goal ownership and state
- Valid reachable goals replace path/goal/waypoint atomically and increment goal ID.
- Invalid or unreachable requests leave the previous goal and its motion untouched.
- No asynchronous planner tasks exist in the MVP, so no stale plan can arrive later.
- Idle → moving → arrived; cancellation stops and clears the route. Pause is orthogonal.
- Pause accepts goal changes but does not resume. Reset clears all state/metrics.
- ROS validation rejects invalid/blocked goals; reachable acceptance preempts the prior
  action by aborting it with a superseded result. Disconnected goals abort themselves.
- Old action execution coroutines return their own results without touching the engine.

### One click trace
Pointer → letterbox-aware world conversion → scalar `nav_goal` → validation/snap →
A* → atomic route replacement → fixed ticks → controller → pose snapshot → canvas/status.
In native ROS mode the analogous action request enters the same core; ticks publish
odom/velocity/TF and complete the action on arrival.

## 5. Milestones and implementation gates

### M0 — Repository and evidence
Deliver AGENTS.md, this plan, source references, architecture decisions and explicit scope.
Choose the runtime boundary before building UI-dependent infrastructure.
**Gate:** owner can identify what is genuinely ROS and where every component executes.
**Learning:** middleware, simulation, and algorithm reuse are different concerns.

### M1 — Core and independent planner checks
Implement map geometry, inflation, coordinate conversion, cardinal A*, route reconstruction,
engine state, turn/translate controller, replacement, pause/cancel, and scalar ABI.
**Commands:** `cargo fmt --all -- --check`; `cargo clippy --locked --workspace --all-targets -- -D warnings`;
`cargo test --locked --workspace`.
**Gate:** 400 seeded small-map cases agree with independent uniform-cost search;
reconstructed paths are cardinal and unblocked; footprint/speed tests pass; invalid
requests preserve the state; rapid replacements never restore an old goal.
**Learning:** admissibility, independent oracles, configuration-space obstacles.

### M2 — Runtime feasibility and parity
Compile both outputs, copy WASM into static assets, and run native/WASM trace comparison.
**Commands:** `npm ci`; `npm run build`; `npm run test:parity`.
**Gate:** zero WASM imports and matching snapshots after movement and replacement.
**Learning:** WASM is an execution target, not automatically a middleware runtime.

### M3 — Minimal responsive UI
Implement one map, status, Pause/Resume and Reset. Show robot, route, goal, occupied and
clearance cells. Provide touch and keyboard goal setting. Put learning content in details.
Handle engine-load failure with readable text rather than a blank canvas.
**Gate:** controls and complete map visible in the three reference viewports, square world
geometry retained, no horizontal overflow, goal updates work during movement and pause.
**Learning:** input/display transforms must share the exact same scale and offsets.

### M4 — Genuine ROS 2 adapter
Generate custom Navigate2D action, load native Rust library through ctypes, implement one
navigation_server with cooperative action futures and a single-thread executor.
Publish `/map`, `/plan`, `/odom`, `/cmd_vel`, `/tf`; document types/rates/QoS/frames in
architecture.md. Provide a launch file. Do not add fictitious scan/localization nodes.
**Commands:** `docker build --target ros -t ros2-navigation-lab:ros .`;
`docker run --rm -e ROS_DOMAIN_ID=43 ros2-navigation-lab:ros python3 /workspace/tests/ros_integration.py`.
**Gate:** real DDS/action evidence for rejection, feedback, replacement, no-route preservation,
cancellation, final success and telemetry. No mock can satisfy this milestone.
**Learning:** topics vs actions, goal state transitions, QoS and TF.

### M5 — Docker and Chrome acceptance
Provide multi-stage web and ROS Docker targets plus Compose profiles. Serve the static
WASM from nginx, without local build dependencies on the user's machine.
**Commands:** `docker compose up --build -d web`; `BASE_URL=http://127.0.0.1:8080 npm test`.
**Gate:** Chrome tests pass on laptop 1365×900, portrait 390×844, landscape 844×390.
Pointer/touch goals, rejection, replacement, pause/replacement/resume, arrival, reset,
keyboard input, orientation resizing and learning disclosure are exercised.
Inspect screenshots as well as DOM assertions. These are emulated phone tests, not
physical-device certification.
**Learning:** a responsive layout and a correct robot state machine need separate evidence.

### M6 — Documentation and reproducibility
README: live link, honest runtime explanation, Docker quickstart, ROS commands, verification,
repository map, limits, deployment. Learning guide: runnable exercises with expected
observations and teach-back questions. Decisions: considered alternatives and tradeoffs.
**Gate:** a developer starting from a clean checkout can build/run without undocumented
host ROS dependencies. Explain how CLI interruption differs from action cancellation.
**Learning:** understanding is demonstrated by tracing a request and interpreting evidence.

### M7 — Public repository and Pages release
Create public `LeoMaglanoc/ros2-navigation-lab`, initialize main, commit source/lockfiles/docs,
push, configure Pages source as Actions, and run the workflow. CI runs web/core/Chrome
and ROS Docker checks before deployment. Verify the actual public repository subpath.
**Gate:** successful Actions deployment, HTTP 200 for page and WASM, Chrome acceptance
against `https://leonardo-maglanoc.com/ros2-navigation-lab/`, clean local Git state.
Do not report the live demo as working merely because a push succeeded.

## 6. Verification matrix

| Risk | Independent/observable evidence |
| --- | --- |
| A* wrong cost or unreachable result | Separate uniform-cost BFS, 400 seeded maps |
| Route cuts through walls | Reconstructed adjacency checks and footprint clearance tests |
| Robot exceeds bounds or jumps | Tick-by-tick displacement/angular bounds and exact waypoint clipping |
| Old goal takes over | Rapid Rust replacement test and real action supersession test |
| Paused robot moves | Browser clock-controlled pose equality and core pause test |
| WASM differs from native | Same trace, independently executed binaries, snapshot comparison |
| ROS package only exists on paper | Built Jazzy image and actual DDS/action acceptance script |
| Mobile input or resize wrong | Chrome touch projects and resize-preserves-goal assertions |
| Static deployment path wrong | Tests against public GitHub Pages subpath |
| Docs overstate capability | Runtime disclosure and explicit tested/untested configuration record |

## 7. Maintenance and scope discipline

Commit source, tests, lockfiles and documentation; ignore generated artifacts. Keep the
pinned Rust compiler aligned with Docker and Actions. Use Jazzy on Ubuntu 24.04 as the
ROS reference environment. Dependency tags may evolve; lockfiles pin Rust/JS packages,
while base-image digests for the verified run are recorded separately.

A change to motion geometry, concurrency, frames or QoS needs an updated explanation
and relevant independent checks. Do not rerun unrelated checks endlessly, but do not
ship a change that invalidates a previously tested assumption. Keep the UI small.

## 8. Completion record

All milestones M0–M7 are complete for the bounded MVP. Source, lockfiles, Docker targets,
ROS packages, tests and learning docs are pushed to the public repository. GitHub Actions
run 42827862368 passed and deployed release source `957f918`. The live HTTPS subpath
passed all nine Chrome acceptance tests. See docs/verification.md for configuration,
commands, evidence links, and the limits of the phone emulation/ROS simulation claims.
