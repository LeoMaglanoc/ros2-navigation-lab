"""Fetch upstream sources at exact commits; no native ROS installation is used."""
import concurrent.futures
import io
import json
from pathlib import Path
import tarfile
import urllib.request

root = Path('/ros-wasm/src')
lock = json.loads(Path('/config/vendor.lock.json').read_text())
def fetch(item):
    name, source = item
    repo = source['url'].removeprefix('https://github.com/').removesuffix('.git')
    url = f"https://codeload.github.com/{repo}/tar.gz/{source['commit']}"
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    target = root / name
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        # Strip the archive's one enclosing directory. All sources are pinned upstreams.
        for member in archive.getmembers():
            member.name = '/'.join(member.name.split('/')[1:])
            if member.name:
                archive.extract(member, target)
    print(f"Fetched {name} @ {source['commit']}", flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    list(pool.map(fetch, lock.items()))
