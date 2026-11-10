# ROS2WASM verification record

Date: 2026-11-10. Reference host: Linux x86_64, Docker Engine 28.1.1/Compose 2.35.1,
Rust 1.96.0, Node 22.22.0, Playwright 1.58.2, installed Google Chrome channel.
Phone tests emulate viewport/touch behavior; no physical phone certification is claimed.

## Actual browser ROS evidence

The ROS runtime was built from pinned upstream source with Emscripten 3.1.45. It loads
in Chrome and reports `rmw_wasm_cpp` through `rmw_get_implementation_identifier()` and
`browser_ui`, `navigator` through live rcl node handles. It receives a typed 600-cell map,
a Path after a valid goal, moving Odometry, Twist and ROS String state messages.

All **15 Chrome tests pass** locally, covering five tests in each layout:
- Laptop: 1365×900.
- Phone portrait: 390×844, touch emulation.
- Phone landscape: 844×390, touch emulation.

The original navigation/pause/reset/keyboard/resize checks now execute through the actual
ROS runtime. Additional checks assert real middleware identity, node names and typed
publication/reception counters. A negative test destroys the real goal subscription with
`rcl_subscription_fini`: a valid click publishes but cannot navigate. Recreating the
subscription restores navigation. This excludes a direct UI-to-Rust goal bypass.

The ROS binary is approximately 671 KiB and the generated loader approximately 58 KiB;
the separate Rust algorithm module is approximately 59 KiB. This is browser-local ROS
communication without a router or server, not a claim of complete native ROS support.

## Independent algorithm evidence retained

The Rust algorithm did not change in the redesign. Its six tests include 400 seeded A*
comparisons against a separate uniform-cost BFS, reconstructed-route validity, exact
continuous swept-disc clearance for all legal grid edges, motion speed/turn bounds,
invalid-goal state preservation, 100 rapid replacements, pause/cancel and same-cell arrival.
Native/WASM parity independently compares snapshots after movement and replacement.
Those tests prove algorithm behavior; they do not substitute for the browser ROS checks.

## Packaging and deployment

The final multi-stage Docker build completed successfully from a fresh ROS dependency
build, without relying on prototype binaries or mutable cross-revision object caches.
`BASE_URL=http://127.0.0.1:8080 npm test` passed **15/15** against nginx serving that build.
Laptop, portrait and landscape screenshots were inspected.

The test clock is frozen on the blank page before application loading. This fixes a
harness race where a relative 100 ms pause deadline could elapse during busy startup.
Simulation advances only when a test explicitly advances the clock.

All release gates passed. [GitHub Actions run 42836467264](https://github.com/LeoMaglanoc/ros2-navigation-lab/actions/runs/42836467264)
rebuilt source commit `1b390ffa7de93f302b67aa75b11fc5d194681a8a`, passed core/parity,
15 Chrome checks and native-reference DDS/action tests, then deployed successfully.

On the actual [public HTTPS site](https://leonardo-maglanoc.com/ros2-navigation-lab/),
`BASE_URL=https://leonardo-maglanoc.com/ros2-navigation-lab/ npm test` passed **15/15**
(33.8 s), including the real middleware/node/typed-delivery assertions and subscription
removal/restoration test in laptop, portrait and landscape projects.

The deployed ROS WASM returns HTTP 200 with `application/wasm` and size 686,498 bytes.
The upstream license/notice directory is also served successfully. The expanded learning
panel was inspected in portrait and has seven topic rows without horizontal overflow.
Entry scripts/styles use the v2 release query to avoid mixing old cached JS with the new
runtime. The README's fresh live link also bypasses a cached v1 document.

Historical v1 evidence is archived under docs/history/. Subsequent documentation-only
commits do not change the deployed application or rerun the build.

## Reproduce

```bash
cargo test --locked --workspace
npm run build
npm run test:parity
npm test
docker compose up --build -d web
BASE_URL=http://127.0.0.1:8080 npm test
BASE_URL=https://leonardo-maglanoc.com/ros2-navigation-lab/ npm test
```

The source lock and build-notes.md document the upstream commits and portability patches.
License/notice texts are included alongside the static runtime in `licenses/`.

## Limits

No production DDS interoperability, browser actions/parameters/QoS, host ROS CLI discovery,
physical robot, physical iOS/Android test, Safari/Firefox test, real-time scheduling,
large-map benchmark, or Rust ROS client-library port is claimed. The separate native
Jazzy/rclpy adapter has its own action/QoS/TF evidence; these are not browser capabilities.

Browser proof comes from Playwright controlling actual Google Chrome, separately from the
user's existing profile. No JavaScript ROS mock or downloaded upstream demo binary is used.
