"""Ship upstream license/notice texts with the compiled static ROS distribution."""
import json
import shutil
from pathlib import Path
root=Path('/ros-wasm/src')
out=Path('/ros-wasm/notices')
out.mkdir(parents=True,exist_ok=True)
lock=json.loads(Path('/config/vendor.lock.json').read_text())
lines=['# ROS2WASM runtime notices\n',
       'ROS 2, rmw_wasm_cpp and dynamic_message_introspection are upstream projects.\n'
       'This distribution includes a thin adapter and the documented build patches.\n']
for name,source in lock.items():
    lines.append(f"- {name}: {source['url']} at {source['commit']}")
    base=root/name
    for path in base.rglob('*'):
        if path.is_file() and path.name.upper().startswith(('LICENSE','NOTICE','COPYING')):
            target=out/name/path.relative_to(base)
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(path,target)
for name in ['yaml_cpp_vendor','libyaml_vendor']:
    base=Path('/ros-wasm/build')/name
    for path in base.rglob('*'):
        if path.is_file() and path.name.upper().startswith(('LICENSE','NOTICE','COPYING')):
            target=out/'vendor'/name/path.relative_to(base)
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(path,target)
for relative in ['LICENSE', 'system/lib/libcxx/LICENSE.TXT',
                 'system/lib/libcxxabi/LICENSE.TXT', 'system/lib/libc/musl/COPYRIGHT']:
    path=Path('/emsdk/upstream/emscripten')/relative
    if path.is_file():
        target=out/'emscripten'/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(path,target)
(out/'NOTICE.md').write_text('\n'.join(lines)+'\n')
shutil.copyfile('/config/vendor.lock.json',out/'vendor.lock.json')
