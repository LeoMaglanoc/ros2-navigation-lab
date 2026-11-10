"""Scalar C ABI adapter. All calls must be serialized (single ROS executor thread)."""
import ctypes
import json
import os
from pathlib import Path
from ament_index_python.packages import get_package_share_directory

class Core:
    def __init__(self):
        default = Path(get_package_share_directory('navigation_lab')) / 'lib/libnav_core.so'
        self.lib = ctypes.CDLL(os.environ.get('NAV_CORE_LIBRARY', str(default)))
        self.lib.nav_reset.argtypes = []
        self.lib.nav_reset.restype = None
        self.lib.nav_goal.argtypes = [ctypes.c_double, ctypes.c_double]
        self.lib.nav_goal.restype = ctypes.c_uint32
        for name in ('nav_tick', 'nav_cancel'):
            getattr(self.lib, name).argtypes = []
            getattr(self.lib, name).restype = None
        self.lib.nav_snapshot.argtypes = []
        self.lib.nav_snapshot.restype = ctypes.c_char_p
        self.lib.nav_reset()

    def snapshot(self):
        return json.loads(self.lib.nav_snapshot())

    def goal(self, x, y):
        return self.lib.nav_goal(x, y)

    def tick(self):
        self.lib.nav_tick()

    def cancel(self):
        self.lib.nav_cancel()
