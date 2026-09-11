# -*- coding: utf-8 -*-
"""
cadquery_probe.py — report what the CadQuery environment of an interpreter has.

    python cadquery_probe.py

Prints one JSON document on stdout:

    {
      "ok": true,
      "python": "D:\\\\venv\\\\Scripts\\\\python.exe",
      "version": "3.12.10",
      "platform": "win32",
      "packages": {
        "cadquery":  {"installed": true, "version": "2.4.0"},
        "OCP":       {"installed": true, "version": "7.7.2"},
        "vtkmodules":{"installed": true, "version": "9.7.0"},
        "ezdxf":     {"installed": true, "version": "1.4.4"}
      },
      "importable": true,
      "notes": ["..."]
    }

`installed` means the distribution can be found; `import_error` is filled in when
it is present but cannot be imported (a broken wheel, or — the case that matters
here — cadquery 2.4 needing `vtkmodules`, which its own dependency list omits).

Used by the `cadquery_env` tool: the agent runs it (directly or through the tool)
to see what is missing, installs it, and probes again.
"""
import importlib
import importlib.util
import json
import sys


def probe(module):
    """Is `module` importable, and which version does it report?"""
    try:
        spec = importlib.util.find_spec(module)
    except Exception as exc:  # a broken parent package, a namespace oddity, …
        return {"installed": False, "note": "find_spec failed: %s" % exc}
    if spec is None:
        return {"installed": False}
    try:
        mod = importlib.import_module(module)
    except Exception as exc:  # noqa: BLE001 - reported, not raised
        return {"installed": True, "import_error": "%s: %s" % (type(exc).__name__, exc)}
    version = getattr(mod, "__version__", None)
    info = {"installed": True}
    if version:
        info["version"] = str(version)
    return info


def main():
    packages = {name: probe(name) for name in ("cadquery", "OCP", "vtkmodules", "ezdxf")}
    notes = []

    cq = packages["cadquery"]
    vtk = packages["vtkmodules"]
    if cq.get("import_error") and "vtkmodules" in str(cq["import_error"]) and not vtk.get("installed"):
        notes.append(
            "cadquery 已安装但导入失败，原因正是缺少 vtk——cadquery 2.4 的 "
            "occ_impl/exporters 在导入期就会 import vtkmodules，而官方依赖表里没有 vtk。"
            "补装 `vtk` 即可。"
        )
    if cq.get("installed") and cq.get("import_error"):
        notes.append("cadquery 已安装但无法导入，导出与 build_3dmodel 都不可用。")
    if not cq.get("installed"):
        notes.append("没有找到 cadquery，导出与 build_3dmodel 都不可用。")
    if cq.get("installed") and not vtk.get("installed"):
        notes.append(
            "没有找到 vtk：cadquery 2.4 在导入期就会用 vtkmodules，所以没有它建模和全部导出都会失败"
            "（官方依赖表却没声明 vtk）。"
        )
    if vtk.get("installed") and not vtk.get("import_error"):
        notes.append("vtkmodules 存在时，插件脚本会先导入它再导入 cadquery，以规避 Windows 上的 OCCT/VTK DLL 冲突。")

    payload = {
        "ok": True,
        "python": sys.executable,
        "version": sys.version.split()[0],
        "implementation": sys.implementation.name,
        "platform": sys.platform,
        "packages": packages,
        "importable": bool(cq.get("installed") and not cq.get("import_error")),
        "notes": notes,
    }
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    sys.exit(main())
