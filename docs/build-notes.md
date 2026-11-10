# Building ROS2WASM from source

The browser runtime contains upstream ROS 2 code. It is not a renamed Rust module or
a downloaded talker/listener demo. The Dockerfile cross-compiles pinned sources from
`ros2_wasm/vendor.lock.json`, then links the project's small `browser_navigation` package.

## Toolchains and stages

- Rust 1.96.0 builds the portable navigation core for WASM and the native reference.
- Emscripten 3.1.45 matches the ROS2WASM builder's documented toolchain version.
- ROS source branches were Humble; exact immutable commits are recorded in the lock.
- `browser-ros-deps` builds rcl, middleware, introspection and standard message packages.
- `browser-ros` adds only the project adapter and collected license/notice texts.
- `web-build` combines these artifacts with the Rust module and UI; nginx serves `dist/`.

Dependency compilation uses ordinary Docker layers. The final build does not reuse a
mutable cross-revision object cache, so changing an upstream source pin cannot silently
reuse objects built from an older tree. The first build takes several minutes; UI and
adapter changes reuse the dependency image layer.

Both the ROS and Rust WASM outputs are browser-portable; the verified Docker builder
platform is Linux x86_64. Browser execution does not depend on the builder's architecture.

## Small source/build fixes

All transformations are explicit in `ros2_wasm/scripts/patch-sources.py`:

1. **rcutils strerror_r:** Emscripten exposes the XSI signature even with `_GNU_SOURCE`.
   Exclude Emscripten from the glibc-specific branch. This follows the same issue addressed
   by the upstream ROS2WASM builder's rcutils patch without changing other platforms.
2. **Unused native link dependencies:** rmw_wasm_cpp's CMake lists BZip2, SQLite3, zlib
   and libffi even though its source does not use them. Remove those declarations rather
   than linking host ELF libraries into WASM. YAML/introspection dependencies remain.
3. **Missing YAML declaration:** wasm_cpp includes yaml-cpp in its roslibjs source but
   does not explicitly find/link/export it. Add yaml_cpp_vendor and yaml-cpp dependencies
   in the correct export order so downstream configuration finds the cross-built library.

The build selects `rcl_logging_noop` and excludes the unrelated native spdlog backend.
It also excludes the upstream `test_msgs` test-only package; production tests are disabled
for the cross-build. These exclusions do not remove nodes, publications, subscriptions,
message serialization or the middleware implementation used by the application.

## Static and cooperative execution

The application links message introspection handles directly and disables runtime RMW
selection by having one installed RMW implementation. No runtime `dlopen` of ROS libraries
is required. Emscripten emits the JS runtime plus `ros_navigation.wasm`; the module stays
alive after main initializes the nodes. ROS calls use non-blocking explicit publish/take
processing, so the app requires neither Asyncify nor pthread/SharedArrayBuffer support.

The Rust engine is a separate WASM instance. Emscripten host imports call its scalar ABI;
this avoids unverified assumptions about directly linking a Rust ROS client into the
Emscripten-built ROS stack. Actual ROS subscription handlers own those calls.

## Distribution and licensing

The lock lists each upstream URL and commit. During Docker packaging,
`collect-licenses.py` copies upstream license/notice files, vendor library notices, and
Emscripten runtime notices into static `licenses/`, along with the source lock and summary.
Project code remains MIT; this does not relicense upstream ROS components.

## Primary implementation references

- [ROS2WASM middleware and support table](https://github.com/ros2wasm/rmw_wasm)
- [Upstream build action/toolchain](https://github.com/ros2wasm/ros2wasm-builder)
- [ROS2WASM local context delivery](https://github.com/ros2wasm/rmw_wasm/blob/a8e824af1c9d8683bc5ba5b6cbd210ddd8947dc9/wasm_cpp/src/context.cpp)
- [ROS 2 Humble rcl](https://github.com/ros2/rcl/tree/humble/rcl)
- [ROS message introspection conversion](https://github.com/osrf/dynamic_message_introspection)

The source/build checks and Chrome behavior tests establish this repository's feasibility;
upstream demos alone are not treated as proof that this particular combination works.
