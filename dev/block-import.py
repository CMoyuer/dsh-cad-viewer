# -*- coding: utf-8 -*-
"""Run one of the plugin's CadQuery scripts with a package blocked.

    python block-import.py <module-to-block> <script.py> [args…]

Used to prove the documented promise that a plain `pip install cadquery` is
enough (no VTK) and that a missing CadQuery reports an actionable error instead
of a traceback.
"""
import json
import runpy
import sys


class Blocker:
    def __init__(self, blocked):
        self.blocked = blocked

    def find_spec(self, name, path=None, target=None):
        if name == self.blocked or name.startswith(self.blocked + "."):
            raise ImportError("%s is not installed (simulated by block-import.py)" % name)
        return None


if len(sys.argv) < 3:
    print(json.dumps({"ok": False, "error": "usage: block-import.py <module> <script.py> [args…]"}))
    sys.exit(2)

blocked = sys.argv[1]
script = sys.argv[2]
sys.meta_path.insert(0, Blocker(blocked))
sys.argv = sys.argv[2:]
runpy.run_path(script, run_name="__main__")
