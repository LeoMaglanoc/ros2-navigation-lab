> Historical v1 record, superseded by the ROS2WASM redesign. This does not describe the current browser architecture.

# Navigation Lab

A small robot, a fixed map, and your next destination. Click or tap open space and the
robot plans a route with A*. Change your mind while it moves: a new valid goal replaces
the route immediately.

**[Try the live demo](https://leonardo-maglanoc.com/ros2-navigation-lab/)** ·
[Architecture](v1-architecture.md) · [Learn ROS 2](../native-reference.md) ·
[Project plan](v1-plan.md) · [Verification](v1-verification.md)

Rust implements the planner, controller, and simulator. The website runs that code as
WebAssembly, entirely on your device. A real ROS 2 application uses the **same core**
as a native library through a small Python adapter.

> The public website is a standalone simulation. It does not run ROS 2 middleware or
> connect to a robot. The Docker ROS 2 application below publishes real ROS messages
> and provides a real navigation action. This is a teaching project, not Nav2.

## Use the demo

- Tap or click open space to set a goal; tap elsewhere to replace it during motion.
- Goals snap to 0.4 m cell centres. Walls and their light clearance bands are blocked.
- Pause holds the robot; Resume continues. Reset returns it to its starting pose.
- Keyboard: focus the map, use arrow keys to select a cell, then Enter to navigate.
- An invalid or unreachable destination leaves the current route unchanged.

The interface adapts to laptop, phone portrait, and phone landscape. The map preserves
its world proportions when the available screen is short. Expand **How it works** for
a short explanation without crowding the demo.

## Quick start with Docker

Prerequisites: Git, Docker Engine/Desktop, and Docker Compose v2. No host Rust, Node,
or ROS installation is needed to run either application. The first build downloads
Rust and ROS images and takes longer than subsequent builds.

```bash
git clone https://github.com/LeoMaglanoc/ros2-navigation-lab.git
cd ros2-navigation-lab
docker compose up --build -d web
```

Open [localhost:8080](http://localhost:8080). Stop with `docker compose down`.

### Run real ROS 2

```bash
docker compose --profile ros up --build -d ros
docker compose logs -f ros
```

The ROS container is separate from the website: opening the page does not connect it
to this node. Commands below run inside the same container so DDS discovery works
without host-network or platform-specific multicast configuration.

In another terminal:

```bash
# See the actual node and its interfaces.
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 node list'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 node info /navigation_server'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 action list -t'

# Send a goal in metres, in the map frame. Ctrl+C stops this CLI client, not the robot.
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 action send_goal /navigate_2d navigation_interfaces/action/Navigate2D "{x: 7.0, y: 2.6}" --feedback'
```

While that command runs, send a different goal from another terminal:

```bash
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 action send_goal /navigate_2d navigation_interfaces/action/Navigate2D "{x: 2.6, y: 3.0}" --feedback'
```

The first action ends with `ABORTED` and a superseded explanation; the second owns
motion and eventually succeeds. ROS actions have no separate “preempted” terminal
status. Cancellation is also implemented and exercised by the integration test.

Inspect telemetry:

```bash
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 topic echo /odom --once'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 topic echo /cmd_vel --once'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 topic echo /map --qos-durability transient_local --once'
docker compose exec ros bash -lc 'source /workspace/install/setup.bash; ros2 run tf2_ros tf2_echo map base_link'
```

Here `/cmd_vel` reports the simulator's actual velocity; it is not a motor-driver input.
There is no fabricated `/scan`, localization, sensor noise, or physical robot driver.
See the [interface table](v1-architecture.md#ros-interfaces) for rates, types, and QoS.

Stop the ROS application with `docker compose --profile ros down`.

### Run the real ROS acceptance test

This starts its own server, so use a separate isolated container rather than a running
interactive server's network namespace:

```bash
docker build --target ros -t ros2-navigation-lab:ros .
docker run --rm -e ROS_DOMAIN_ID=43 ros2-navigation-lab:ros python3 /workspace/tests/ros_integration.py
```

It observes actual DDS messages and verifies rejected goals, replacement, unreachable
goals, cancellation, final success, frames, map contents, and velocity bounds.

## How the pieces fit

```mermaid
flowchart LR
  click[Browser click / tap] --> wasm[Rust core as WASM]
  wasm --> canvas[Canvas robot + route]
  cli[ROS action client] --> ros[Python ROS 2 adapter]
  ros --> native[Same Rust core as native library]
  native --> ros
  ros --> graph[map / plan / odom / cmd_vel / tf]
```

The core searches a 30 × 20 grid using four-connected A* and a Manhattan heuristic.
A circular robot turns in place and follows cardinal segments at bounded speed.
A fixed 50 Hz simulation makes the native and browser execution comparable.

ROS 2 adds communication and action lifecycle management around that logic. A single
node is sufficient because this simulator has one state owner; splitting every function
into a separate node would add distributed-state problems without helping this MVP.
[Read the decisions and alternatives](../decisions.md).

## Local development without Docker

Prerequisites: rustup, Node.js 22, and Python 3. The pinned Rust toolchain and WASM
target are selected by `rust-toolchain.toml`.

```bash
npm ci
cargo test --locked --workspace
npm run build
npm run test:parity
python3 -m http.server 8080 --directory dist
```

In another terminal, test against that server in Google Chrome:

```bash
npx playwright install --with-deps chrome
BASE_URL=http://127.0.0.1:8080 npm test
```

`npm test` without `BASE_URL` starts a temporary Python server on port 4173.
Playwright's three projects use **Google Chrome**, including mobile viewport/touch
emulation. These checks do not replace tests on physical iOS/Android devices.

For native ROS development on Ubuntu 24.04 with ROS 2 Jazzy installed, see
[the learning guide](../native-reference.md#native-development-without-docker).

## Repository guide

| Path | Responsibility |
| --- | --- |
| `crates/nav-core/` | Grid, obstacle clearance, A*, controller, simulation, scalar ABI |
| `web/` | Plain HTML/CSS/JS, input conversion, rendering; no duplicated navigation logic |
| `ros2_ws/src/navigation_interfaces/` | `Navigate2D.action` definition |
| `ros2_ws/src/navigation_lab/` | ROS 2 adapter and launch file |
| `tests/` | Native/WASM parity, Chrome acceptance, real ROS integration |
| `Dockerfile`, `compose.yaml` | Reproducible web and ROS environments |
| `docs/` | Architecture, decisions, learning exercises, verification evidence |
| `AGENTS.md`, `PLAN.md` | Contribution rules and detailed implementation plan |

## Deployment

GitHub Actions tests the core and Chrome UI, builds/tests the ROS Docker image, uploads
the static `dist/` artifact, and deploys it to GitHub Pages on `main`. PRs run checks
without deployment. All web assets use relative URLs, so the repository subpath works.

To set up a fork: enable **Settings → Pages → Source → GitHub Actions**, update the
repository/demo links in the HTML and README, then push to `main`. No secret, router,
WebSocket server, or ROS installation is required for the public demo.

## Limits

This intentionally small example has a fixed known map, perfect simulated pose,
conservative grid clearance, no dynamics or acceleration model, and no final heading
constraint. Shortest means shortest grid route, not fastest trajectory. The browser
pauses simulation while its tab is hidden and caps catch-up after long stalls. The
native ROS timer advances one 20 ms step per callback; this is not a real-time system.
There is no live synchronization between the two runtimes.

Tested configurations and reproducible checks are recorded in
[docs/verification.md](v1-verification.md). Licensed under [MIT](../../LICENSE).
