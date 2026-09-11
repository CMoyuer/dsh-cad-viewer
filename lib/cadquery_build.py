# -*- coding: utf-8 -*-
"""
cadquery_build.py — run a CadQuery script and emit a three-cad-viewer "Shape"
JSON (cad-format) to stdout. Used by the dsh-cad-viewer `build_3dmodel` tool.

Usage:
    python cadquery_build.py <script.py> [tol]

The script.py must define `model` (a cq.Workplane / cq.Shape / anything with a
`.tessellate(tol)` method returning (verts, tris)). On success a single JSON
doc is printed to stdout. On failure a JSON `{"ok":false,"error":...}` is
printed and exit code is non-zero.

Load order caveat: importing cadquery after `vtkmodules.vtkCommonDataModel` avoids
an OCCT/VTK DLL conflict on some Windows hosts, so the VTK import stays first.
VTK itself is NOT required (CadQuery does not depend on it): only the plugin's VTP
export needs it, so a missing VTK is tolerated here.
"""
import sys
import json
import math

# Bypass the OCCT(OCP)/VTK DLL-load conflict by loading the VTK common module
# first — but only when VTK is installed, since CadQuery works fine without it.
try:
    import vtkmodules.vtkCommonDataModel  # noqa: F401
except Exception:  # ImportError, or a broken VTK install: cadquery is next anyway
    pass
try:
    import cadquery as cq  # noqa: F401
except Exception as _cq_error:  # noqa: BLE001 - reported as JSON, never a traceback
    # The caller (build_3dmodel) reports this to the agent, so the message must
    # carry the remedy rather than a stack trace.
    print(
        json.dumps(
            {
                "ok": False,
                "error": "CadQuery 不可用（解释器：%s）：%s。安装：`\"%s\" -m pip install cadquery vtk`"
                "（cadquery 2.4 的 exporters 在导入期会 import vtkmodules，而官方依赖表未声明 vtk），"
                "然后把插件配置 cadqueryPython 指向这个解释器。"
                % (sys.executable, _cq_error, sys.executable)
            }
        )
    )
    sys.exit(4)


def _norm(v):
    l = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    return l if l > 1e-9 else 1.0


def build_shape(model, tol, name, color):
    """tessellate `model` and build a three-cad-viewer Shape dict."""
    solid = model if hasattr(model, "tessellate") else (model.val() if hasattr(model, "val") else None)
    if solid is None:
        raise TypeError("model is not tessellatable; pass a CadQuery Workplane/Shape")
    verts, tris = solid.tessellate(tol)

    v = []
    for p in verts:
        v.extend([float(p.x), float(p.y), float(p.z)])

    # Per-vertex smooth normals by accumulating face normals.
    nrm = [0.0] * len(v)
    for t in tris:
        a, b, c = int(t[0]), int(t[1]), int(t[2])
        ax, ay, az = v[a * 3], v[a * 3 + 1], v[a * 3 + 2]
        bx, by, bz = v[b * 3], v[b * 3 + 1], v[b * 3 + 2]
        cx, cy, cz = v[c * 3], v[c * 3 + 1], v[c * 3 + 2]
        ux, uy, uz = bx - ax, by - ay, bz - az
        wx, wy, wz = cx - ax, cy - ay, cz - az
        nx = uy * wz - uz * wy
        ny = uz * wx - ux * wz
        nz = ux * wy - uy * wx
        L = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        nx, ny, nz = nx / L, ny / L, nz / L
        for idx in (a, b, c):
            nrm[idx * 3] += nx
            nrm[idx * 3 + 1] += ny
            nrm[idx * 3 + 2] += nz

    normals = []
    for i in range(0, len(nrm), 3):
        n = _norm((nrm[i], nrm[i + 1], nrm[i + 2]))
        normals.append(round(nrm[i] / n, 6))
        normals.append(round(nrm[i + 1] / n, 6))
        normals.append(round(nrm[i + 2] / n, 6))

    # Boundary edges (triangle edges shared by exactly one face).
    edge_count = {}
    for t in tris:
        for (i, j) in ((int(t[0]), int(t[1])), (int(t[1]), int(t[2])), (int(t[2]), int(t[0]))):
            key = (i, j) if i < j else (j, i)
            edge_count[key] = edge_count.get(key, 0) + 1
    edges = []
    edge_list = []
    for (i, j), cnt in edge_count.items():
        if cnt == 1:
            edges.extend([round(v[i * 3], 6), round(v[i * 3 + 1], 6), round(v[i * 3 + 2], 6),
                          round(v[j * 3], 6), round(v[j * 3 + 1], 6), round(v[j * 3 + 2], 6)])
            edge_list.append((i, j))

    triangles = []
    for t in tris:
        triangles.extend([int(t[0]), int(t[1]), int(t[2])])

    face_cnt = len(tris)
    edge_cnt = len(edge_list)

    shape = {
        "vertices": [round(x, 6) for x in v],
        "triangles": triangles,
        "normals": normals,
        "edges": edges,
        "obj_vertices": [round(x, 6) for x in v],
        "face_types": [0] * face_cnt,
        "edge_types": [0] * edge_cnt,
        "triangles_per_face": [1] * face_cnt,
        "segments_per_edge": [1] * edge_cnt,
    }

    _xs = v[0::3]
    _ys = v[1::3]
    _zs = v[2::3]
    bb = {
        "xmin": round(min(_xs), 6), "xmax": round(max(_xs), 6),
        "ymin": round(min(_ys), 6), "ymax": round(max(_ys), 6),
        "zmin": round(min(_zs), 6), "zmax": round(max(_zs), 6),
    } if _xs else None

    return shape, bb


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: cadquery_build.py <script.py> [tol]"}))
        return 2
    script_path = sys.argv[1]
    tol = float(sys.argv[2]) if len(sys.argv) > 2 else 0.1

    ns = {}
    try:
        with open(script_path, "r", encoding="utf-8") as f:
            script = f.read()
        exec(compile(script, script_path, "exec"), ns)
    except Exception as e:
        print(json.dumps({"ok": False, "error": "script error: %s" % e}))
        return 3

    model = ns.get("model")
    if model is None:
        print(json.dumps({"ok": False, "error": "script must define `model` (a CadQuery Workplane/Shape)"}))
        return 4

    # Optional per-part metadata the script may expose.
    name = str(ns.get("name") or "Part")
    color = str(ns.get("color") or "#e8b024")

    try:
        shape, bb = build_shape(model, tol, name, color)
    except Exception as e:
        print(json.dumps({"ok": False, "error": "tessellate error: %s" % e}))
        return 5

    xmin = bb["xmin"] if bb else -0.5
    xmax = bb["xmax"] if bb else 0.5
    ymin = bb["ymin"] if bb else -0.5
    ymax = bb["ymax"] if bb else 0.5
    zmin = bb["zmin"] if bb else -0.5
    zmax = bb["zmax"] if bb else 0.5

    part = {
        "id": "/Group/%s" % name,
        "type": "shapes",
        "subtype": "solid",
        "name": name,
        "shape": shape,
        "state": [1, 1],
        "color": color,
        "alpha": 1.0,
        "texture": None,
        "loc": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]],
        "renderback": False,
        "accuracy": None,
        "bb": bb,
    }
    doc = {
        "version": 3,
        "parts": [part],
        "loc": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]],
        "name": "Group",
        "id": "/Group",
        "normal_len": 0,
        "bb": {"xmin": xmin, "xmax": xmax, "ymin": ymin, "ymax": ymax, "zmin": zmin, "zmax": zmax},
    }
    print(json.dumps({"ok": True, "model": doc}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
