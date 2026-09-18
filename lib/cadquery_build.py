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


def _face_groups(shape, tri_total):
    """One entry per B-Rep face: (geometry type, triangle count).

    The viewer's cad-format expects `face_types` and `triangles_per_face` to hold
    ONE entry per B-Rep face. It strides through `triangles` with those counts
    (`_faceTriangleIndices` advances by `3 * triangles_per_face[i]`) and reports
    node counts from their length. Emitting one entry per TRIANGLE instead
    declares every triangle a face of its own, so a tessellated part reads as a
    pile of triangles rather than a solid face: face picking/highlight lands on a
    single triangle and the reported face count is the triangle count.
    """
    try:
        from OCP.BRep import BRep_Tool
        from OCP.BRepAdaptor import BRepAdaptor_Surface
        from OCP.TopLoc import TopLoc_Location
    except Exception:  # noqa: BLE001 - no OCP: keep the old single-group behaviour
        return [0], [tri_total]

    types, counts = [], []
    try:
        for f in shape.Faces():
            tri = BRep_Tool.Triangulation_s(f.wrapped, TopLoc_Location())
            counts.append(tri.NbTriangles() if tri is not None else 0)
            try:
                # Geom_Surface has no GetType() in OCP; the BRep adaptor does and
                # reports the GeomAbs_SurfaceType the cad-format expects
                # (0=plane, 1=cylinder, 2=cone, 3=sphere, 4=torus, ...).
                types.append(int(BRepAdaptor_Surface(f.wrapped).GetType()))
            except Exception:  # noqa: BLE001
                types.append(0)
    except Exception:  # noqa: BLE001
        return [0], [tri_total]

    # The face order has to line up with the merged tessellation. If it does not,
    # a single group is far better than counts that would mis-index `triangles`.
    if not counts or sum(counts) != tri_total:
        return [0], [tri_total]
    return types, counts


def _edge_groups(shape, tol):
    """One entry per B-Rep edge: (curve type, polyline points).

    `segments_per_edge` / `edge_types` also carry ONE entry per B-Rep edge: the
    viewer slices `edges` with them (`_edgeSegments` advances 6 *
    segments_per_edge[i] floats at a time) and reports the edge count from their
    length. One entry per SEGMENT would make every little line its own "edge":
    picking an edge would select a single segment, and a circle discretised into
    126 pieces would be reported as 126 edges instead of one.

    Edges come from the real B-Rep curves (adaptively sampled to `tol`), which
    also gives a straight line just its two endpoints instead of a triangle-edge
    soup.
    """
    try:
        from OCP.BRepAdaptor import BRepAdaptor_Curve
        from OCP.GCPnts import GCPnts_QuasiUniformDeflection
    except Exception:  # noqa: BLE001 - no OCP: caller falls back
        return None

    out = []
    try:
        for e in shape.Edges():
            try:
                adaptor = BRepAdaptor_Curve(e.wrapped)
                disc = GCPnts_QuasiUniformDeflection(adaptor, max(float(tol), 1e-4))
                if not disc.IsDone() or disc.NbPoints() < 2:
                    continue
                pts = [disc.Value(i) for i in range(1, disc.NbPoints() + 1)]
                out.append((int(adaptor.GetType()), pts))
            except Exception:  # noqa: BLE001 - skip an edge we cannot sample
                continue
    except Exception:  # noqa: BLE001
        return None
    return out or None


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

    # Both groupings must carry ONE entry per B-Rep face / edge, never one per
    # triangle or per line segment (see _face_groups / _edge_groups).
    face_types, triangles_per_face = _face_groups(solid, face_cnt)
    edge_group = _edge_groups(solid, tol)
    if edge_group:
        edges = []
        edge_types = []
        segments_per_edge = []
        for etype, pts in edge_group:
            segments_per_edge.append(len(pts) - 1)
            edge_types.append(etype)
            for k in range(len(pts) - 1):
                p, q = pts[k], pts[k + 1]
                edges.extend([round(p.X(), 6), round(p.Y(), 6), round(p.Z(), 6),
                              round(q.X(), 6), round(q.Y(), 6), round(q.Z(), 6)])
        edge_cnt = len(edge_types)
    else:
        edge_types = [0] * edge_cnt
        segments_per_edge = [1] * edge_cnt

    shape = {
        "vertices": [round(x, 6) for x in v],
        "triangles": triangles,
        "normals": normals,
        "edges": edges,
        "obj_vertices": [round(x, 6) for x in v],
        "face_types": face_types,
        "edge_types": edge_types,
        "triangles_per_face": triangles_per_face,
        "segments_per_edge": segments_per_edge,
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


def _color_hex(c, fallback):
    """cq.Color -> "#rrggbb", falling back when it is not a usable colour."""
    try:
        r, g, b = c.toTuple()[:3]
        return "#%02x%02x%02x" % (
            max(0, min(255, int(round(r * 255)))),
            max(0, min(255, int(round(g * 255)))),
            max(0, min(255, int(round(b * 255)))),
        )
    except Exception:  # noqa: BLE001
        return fallback


def _node_shape(node):
    """The located Shape held by one cq.Assembly node (None for a bare group)."""
    obj = getattr(node, "obj", None)
    if obj is None:
        return None
    shp = obj.val() if hasattr(obj, "val") else obj
    loc = getattr(node, "loc", None)
    if loc is not None and hasattr(shp, "located"):
        try:
            shp = shp.located(loc)
        except Exception:  # noqa: BLE001
            pass
    return shp


def _walk_assembly(node, color, out):
    shp = _node_shape(node)
    if shp is not None:
        c = getattr(node, "color", None)
        if c is not None:
            color = _color_hex(c, color)
        out.append((str(getattr(node, "name", None) or "Part"), shp, color))
    for child in getattr(node, "children", None) or []:
        _walk_assembly(child, color, out)
    return out


def _parts_from_assembly(ns, default_color):
    """Recover the part list from a cq.Assembly left in the script namespace.

    The documented way to build a model is `model = assy.toCompound()`, but
    toCompound() merges everything into one shape and drops the per-part names
    and colours — so a script written that way would land in the library as a
    single tree node even though it is a real assembly. The Assembly object is
    still in the namespace, so read the parts back out of it.
    """
    asm = None
    for key in ("assy", "assembly", "asm", "a"):
        if type(ns.get(key)).__name__ == "Assembly":
            asm = ns[key]
            break
    if asm is None:
        for v in list(ns.values()):
            if type(v).__name__ == "Assembly":
                asm = v
                break
    if asm is None:
        return None
    out = _walk_assembly(asm, default_color, [])
    # A single part needs no special handling; keep the plain `model` path.
    return out if len(out) > 1 else None


def _parts_from_solids(model, default_color):
    """Last resort: split a multi-solid Compound into one part per solid."""
    try:
        shape = model.val() if hasattr(model, "val") else model
        sols = list(shape.Solids())
    except Exception:  # noqa: BLE001
        return None
    if len(sols) < 2:
        return None
    return [("Part_%d" % (i + 1), s, default_color) for i, s in enumerate(sols)]


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
    parts_spec = ns.get("parts")

    # Optional per-part metadata the script may expose.
    name = str(ns.get("name") or "Part")
    color = str(ns.get("color") or "#e8b024")

    # A script that only assigns `model = assy.toCompound()` — the documented
    # way — would otherwise collapse into one tree node, because toCompound()
    # drops the per-part names and colours. Recover them from the Assembly still
    # sitting in the namespace, or from the solids of the compound.
    if not parts_spec and model is not None:
        parts_spec = (_parts_from_assembly(ns, color)
                      or _parts_from_solids(model, color))

    if model is None and not parts_spec:
        print(json.dumps({"ok": False, "error": "script must define `model` (a CadQuery Workplane/Shape)"}))
        return 4

    # Multi-part output: the script may expose `parts` as an ordered list of
    # (name, shape, color) tuples (or {"name","shape","color"} dicts). Each entry
    # becomes its own node in the viewer's model tree, instead of one merged
    # `model`. `model` is still honoured independently, so the stored script can
    # keep exporting exact geometry (STEP/BREP/DXF) from a single compound.
    if parts_spec:
        try:
            doc_parts = []
            seen = {}
            xmin = ymin = zmin = float("inf")
            xmax = ymax = zmax = float("-inf")
            for i, item in enumerate(parts_spec):
                if isinstance(item, dict):
                    p_name = str(item.get("name") or ("Part%d" % (i + 1)))
                    p_shape = item.get("shape")
                    p_color = str(item.get("color") or color)
                else:
                    item = list(item)
                    p_name = str(item[0]) if len(item) > 0 else ("Part%d" % (i + 1))
                    p_shape = item[1] if len(item) > 1 else None
                    p_color = str(item[2]) if len(item) > 2 else color
                if p_shape is None:
                    continue
                # The viewer builds its model tree from part NAME
                # ("/<model>/<name>") but resolves the mesh in
                # nestedGroup.groups by part ID, so the two must agree exactly
                # or the tree's show/hide toggle looks up a key that is not
                # there and silently returns (nothing happens on click).
                # Names must be unique as well: two parts sharing one would
                # collapse into a single tree node.
                dup = seen.get(p_name, 0)
                seen[p_name] = dup + 1
                if dup:
                    p_name = "%s_%d" % (p_name, dup + 1)
                geo, p_bb = build_shape(p_shape, tol, p_name, p_color)
                doc_parts.append({
                    "id": "/Group/%s" % p_name,
                    "type": "shapes",
                    "subtype": "solid",
                    "name": p_name,
                    "shape": geo,
                    "state": [1, 1],
                    "color": p_color,
                    "alpha": 1.0,
                    "texture": None,
                    "loc": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]],
                    "renderback": False,
                    "accuracy": None,
                    "bb": p_bb,
                })
                if p_bb:
                    xmin = min(xmin, p_bb["xmin"])
                    xmax = max(xmax, p_bb["xmax"])
                    ymin = min(ymin, p_bb["ymin"])
                    ymax = max(ymax, p_bb["ymax"])
                    zmin = min(zmin, p_bb["zmin"])
                    zmax = max(zmax, p_bb["zmax"])
            if not doc_parts:
                raise ValueError("`parts` produced no tessellatable shape")
            if xmin == float("inf"):
                xmin, xmax, ymin, ymax, zmin, zmax = -0.5, 0.5, -0.5, 0.5, -0.5, 0.5
            doc = {
                "version": 3,
                "parts": doc_parts,
                "loc": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]],
                "name": "Group",
                "id": "/Group",
                "normal_len": 0,
                "bb": {"xmin": xmin, "xmax": xmax, "ymin": ymin,
                       "ymax": ymax, "zmin": zmin, "zmax": zmax},
            }
            print(json.dumps({"ok": True, "model": doc}))
            return 0
        except Exception as e:
            print(json.dumps({"ok": False, "error": "multi-part build error: %s" % e}))
            return 6

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
