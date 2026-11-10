"""Small documented cross-compilation fixes; never replace the ROS/RMW implementation."""
from pathlib import Path
root = Path('/ros-wasm/src')
# rmw_wasm lists native libraries that no source file uses. Do not link host ELF libs
# into WebAssembly. Its actual YAML dependency remains dynmsg/yaml-cpp.
p = root/'ros2wasm/rmw_wasm/rmw_wasm_cpp/CMakeLists.txt'
s = p.read_text()
for line in ['find_package(BZip2 REQUIRED)\n','find_package(SQLite3 REQUIRED)\n',
             'find_package(ZLIB REQUIRED)\n','find_package(PkgConfig REQUIRED)\n',
             'pkg_check_modules(libffi REQUIRED libffi)\n','  ${libffi_LINK_LIBRARIES}\n',
             '  ${SQLite3_LIBRARIES}\n','  BZip2::BZip2\n','  ZLIB::ZLIB\n']:
    assert line in s, line
    s=s.replace(line,'')
p.write_text(s)
# Emscripten uses the XSI strerror_r signature even with _GNU_SOURCE.
p=root/'ros2/rcutils/src/strerror.c'
s=p.read_text()
s=s.replace('#elif defined(_GNU_SOURCE)', '#elif !defined(__EMSCRIPTEN__) && defined(_GNU_SOURCE)')
p.write_text(s)
# Upstream wasm_cpp includes yaml-cpp from roslibjs.cpp but doesn't find/link it.
p=root/'ros2wasm/rmw_wasm/wasm_cpp/CMakeLists.txt'
s=p.read_text().replace('find_package(yaml_cpp_vendor REQUIRED)',
    'find_package(yaml_cpp_vendor REQUIRED)\nfind_package(yaml-cpp REQUIRED)')
s=s.replace('wasm_link_options(wasm_cpp)',
    'wasm_link_options(wasm_cpp)\ntarget_link_libraries(wasm_cpp yaml-cpp)\nament_export_dependencies(yaml_cpp_vendor yaml-cpp)')
p.write_text(s)
