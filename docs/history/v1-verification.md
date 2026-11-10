> Historical v1 record, superseded by the ROS2WASM redesign. This does not describe the current browser architecture.

# Verification record

Initial reference run: **2026-11-10**, Linux x86_64, Google Chrome, Docker Engine 28.1.1,
Compose 2.35.1, Rust 1.96.0, Node 22.22.0, Playwright 1.58.2. Phone tests use Chrome's
mobile viewport/touch emulation, not physical devices.

## Executed locally

| Check | Result / evidence |
| --- | --- |
| `cargo fmt --all -- --check` | Pass |
| `cargo clippy --locked --workspace --all-targets -- -D warnings` | Pass |
| `cargo test --locked --workspace` | 6 tests pass, including 400 seeded A*/uniform-cost comparisons |
| Exact continuous edge clearance | Every allowed demo-map cardinal edge checked against every occupied rectangle using exact interval distance |
| Motion | Full routes checked for disc clearance, displacement bounds, turn-rate bounds and arrival |
| Goal ownership | Invalid/no-route state preservation, 100 rapid replacements, pause/cancel/same-cell behavior |
| `npm run build` | WASM/static build passes; module about 60 KiB |
| `npm run test:parity` | No WASM imports; native/WASM snapshots agree within 1e-10 after movement and replacement |
| `npm test` | 9/9 Chrome tests pass with the local static server |
| `docker compose up --build -d web` | Builds and serves the real static website from nginx |
| `BASE_URL=http://127.0.0.1:8080 npm test` | 9/9 Chrome tests pass against Docker nginx |
| `docker build --target ros -t ros2-navigation-lab:ros .` | Native Rust + generated ROS action + Python adapter build successfully |
| `docker run --rm -e ROS_DOMAIN_ID=43 ros2-navigation-lab:ros python3 /workspace/tests/ros_integration.py` | Real DDS/action acceptance test passes |

The ROS test observes `/map`, `/plan`, `/odom`, `/cmd_vel`, and `/tf`; checks invalid and
blocked admission, old-goal abortion on replacement, unreachable-goal isolation,
cancellation and zero motion, final success, frames, map contents and velocity bounds.
It starts a real server process and does not mock rclpy or replace ROS communication.

Chrome tests cover laptop 1365×900, portrait 390×844, and landscape 844×390. Each layout
exercises navigation, replacement while moving, rejected goals, pause, replacement while
paused, resume, arrival, reset, keyboard input, orientation resizing, visible map/controls,
no horizontal overflow, and the truthful runtime disclosure. Screenshots are written to
`test-results/` (ignored locally, uploaded by CI).

The initial browser test allowed real time to progress between automated steps; on a
busy run the robot arrived before Pause was pressed. Tests now pause the browser clock
between explicit simulation advances. This makes ownership/pause assertions repeatable.

## Deployment

Release source: `957f918453a1a2aa0a0791b4923980f7ee56a6b1`.
[GitHub Actions run 42827862368](https://github.com/LeoMaglanoc/ros2-navigation-lab/actions/runs/42827862368)
completed successfully: web checks, real ROS Docker checks, and Pages deployment.

Public verification on 2026-11-10:
- [Live demo](https://leonardo-maglanoc.com/ros2-navigation-lab/) returns HTTP 200 over HTTPS.
- `nav_core.wasm` returns HTTP 200 with `application/wasm`, size 59,644 bytes.
- The default `leomaglanoc.github.io` project URL redirects to the portfolio domain.
- `BASE_URL=https://leonardo-maglanoc.com/ros2-navigation-lab/ npm test`: **9/9 pass**
  in Google Chrome against the actual deployed site, including touch and orientation tests.
- Screenshots for laptop, portrait, and landscape were inspected. Extra layout spot checks
  at 320×568, 667×375, 640×360, and 1920×1080 kept controls visible without horizontal overflow.

Pages inherits the account's existing custom domain; HTTPS is enforced for this new
project. No custom backend or change to the portfolio's root-site source was required.
Subsequent documentation-only commits do not trigger redeployment.

## Reproduce

Follow README.md for Docker startup, then run the commands in the table. To verify a
public deployment, set `BASE_URL=https://leonardo-maglanoc.com/ros2-navigation-lab/` before
`npm test`. The suite then loads the deployed WASM at the repository subpath.

Reference base image digests resolved during the first Docker build:
- Rust 1.96.0 bookworm: `sha256:5e2214abe154fe26e39f64488952e5c991eeed1d6d6da7cc8381ae83927f0cfc`
- ROS Jazzy ros-base: `sha256:8eed0a4669bbf43ee331878a4c39bd8ebddea8e3312a58b4fae8edb14526b617`
- nginx 1.28 alpine: `sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236`

Docker tags can receive updates; these digests identify the observed reference run.
Rust and JavaScript dependencies are pinned in committed lockfiles.

## Limits of the evidence

No physical robot, hardware safety, physical phone, Safari, Firefox, performance under
large maps, browser-native ROS, or live browser-to-ROS connection is claimed. Native
host installation instructions have not been independently tested outside Docker.
The CLI browser-use attachment was unavailable on this machine; acceptance testing
instead used Playwright's installed Google Chrome channel directly. That is actual
Chrome execution, separate from the user's existing profile.
