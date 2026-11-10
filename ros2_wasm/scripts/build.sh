#!/usr/bin/env bash
set -euo pipefail
cd /ros-wasm
# Static libraries are linked into one module; no dlopen, pthreads, or server required.
if [ -f install/local_setup.bash ]; then
  set +u
  source install/local_setup.bash
  set -u
fi
if [ "$#" -eq 0 ]; then set -- --packages-up-to browser_navigation; fi
colcon build --merge-install "$@" \
  --executor sequential --packages-ignore rcl_logging_spdlog test_msgs --event-handlers console_direct+ \
  --cmake-args \
  -DCMAKE_TOOLCHAIN_FILE=/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake \
  -DBUILD_TESTING=OFF -DBUILD_SHARED_LIBS=OFF -DCMAKE_BUILD_TYPE=MinSizeRel \
  -DCMAKE_C_FLAGS=-fexceptions -DCMAKE_CXX_FLAGS=-fexceptions \
  -DCMAKE_FIND_ROOT_PATH_MODE_PACKAGE=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DFORCE_BUILD_VENDOR_PKG=ON -DRMW_IMPLEMENTATION=rmw_wasm_cpp \
  -DRCL_LOGGING_IMPLEMENTATION=rcl_logging_noop \
  -DTRACETOOLS_DISABLED=ON -DPython3_EXECUTABLE=/usr/bin/python3 \
  -DPYTHON_EXECUTABLE=/usr/bin/python3 -DTHIRDPARTY=ON
