# -*- coding: utf-8 -*-
"""
cadquery_export.py — export a stored dsh-model-viewer model to every file format
CadQuery can write: STEP, BREP, STL, 3MF, AMF, VRML, VTP, TJS, SVG, DXF.

Two sources are supported:

  * ``--script <file.py>``  re-run the CadQuery script that produced the model and
    hand the result to CadQuery's own exporters (exact geometry; used when the
    library entry kept its source, i.e. models created by ``build_3dmodel``).
  * ``--model <model.json>``  rebuild the geometry from the stored
    three-cad-viewer "Shape" mesh (vertices + triangles). Only a mesh is stored
    for such an entry, so each exporter gets the best input that mesh allows:

      STEP / BREP   every triangle becomes a planar OCCT face, the faces are
                    sewn into a shell (a solid when it closes) — real B-Rep
                    geometry, so the result opens as a faceted solid in CAD.
      STL/3MF/AMF/  the mesh is attached to a faceless OCCT face as a
      VRML/VTP/TJS  Poly_Triangulation and handed to CadQuery's exporters, which
                    keeps the exact triangles shown in the viewer (and is orders
                    of magnitude faster than re-meshing the B-Rep above).
      DXF           CadQuery's DXF writer over the planar faces (2D projection).
      SVG           a projected drawing: CadQuery's own SVG export is a hidden
                    line removal pass, which is impractical on a triangle soup
                    (minutes for ~10k faces), so the drawing is assembled from
                    the mesh's silhouette + sharp edges with the same SVG
                    template CadQuery uses (no hidden lines).

Usage:
    python cadquery_export.py --format STEP --out out.step --model model.json
    python cadquery_export.py --format STEP --out out.step --script part.py

A single JSON document is printed to stdout:
    {"ok": true, "format": "STEP", "out": "...", "bytes": 1234, "mode": "mesh"}
    {"ok": false, "error": "..."}
The process exit code is 0 on success, non-zero otherwise.

Load order caveat: importing cadquery after ``vtkmodules.vtkCommonDataModel``
avoids an OCCT/VTK DLL conflict on some Windows hosts, so the VTK import stays
first. VTK is NOT a CadQuery dependency: only the VTP export needs it, so the
other nine formats keep working when VTK is missing.
"""
import argparse
import json
import math
import os
import sys

# Bypass the OCCT(OCP)/VTK DLL-load conflict by loading the VTK common module
# first — but only when VTK is installed, since nine of the ten formats don't
# need it and CadQuery does not depend on it.
try:
    import vtkmodules.vtkCommonDataModel  # noqa: F401
except Exception:  # ImportError, or a broken VTK install: cadquery is next anyway
    pass
try:
    import cadquery as cq  # noqa: F401
    from cadquery.occ_impl import exporters as cqex
except Exception as _cq_error:  # noqa: BLE001 - reported as JSON, never a traceback
    # A traceback here would only reach the server log; the caller (and through it
    # the export dialog / the agent) needs the install instruction instead.
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

from OCP.BRep import BRep_Builder
from OCP.BRepBuilderAPI import (
    BRepBuilderAPI_MakeFace,
    BRepBuilderAPI_MakePolygon,
    BRepBuilderAPI_MakeSolid,
    BRepBuilderAPI_Sewing,
)
from OCP.HLRAlgo import HLRAlgo_Projector
from OCP.Poly import Poly_Triangulation, Poly_Triangle
from OCP.TopAbs import TopAbs_SHELL
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS, TopoDS_Compound, TopoDS_Face
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt, gp_Pnt2d

#: Every format CadQuery 2.x can write, with the file extension used for the
#: download and the exporter strategy that fits a stored mesh.
#:   brep    -> planar faces, sewn (real B-Rep)
#:   mesh    -> Poly_Triangulation handed to the CadQuery exporter
#:   drawing -> 2D output
FORMATS = {
    "STEP": (".step", "brep"),
    "BREP": (".brep", "brep"),
    "STL": (".stl", "mesh"),
    "3MF": (".3mf", "mesh"),
    "AMF": (".amf", "mesh"),
    "VRML": (".wrl", "mesh"),
    "VTP": (".vtp", "mesh"),
    "TJS": (".json", "mesh"),
    "DXF": (".dxf", "drawing"),
    "SVG": (".svg", "drawing"),
}


def _fail(message):
    print(json.dumps({"ok": False, "error": str(message)}))
    return 1


# ---------------------------------------------------------------------------
# stored model -> vertices in model space
# ---------------------------------------------------------------------------
def _parts_of(doc):
    """Accept the stored item ({..., model: {...}}) or the model document."""
    if isinstance(doc, dict) and isinstance(doc.get("model"), dict):
        doc = doc["model"]
    parts = (doc or {}).get("parts") if isinstance(doc, dict) else None
    return [p for p in (parts or []) if isinstance(p, dict)]


def _mesh_of(part):
    shape = part.get("shape")
    if not isinstance(shape, dict):
        return [], []
    verts = shape.get("vertices") or []
    tris = shape.get("triangles") or []
    return verts, tris


def _rotated(q, v):
    """Rotate vector `v` by the (x,y,z,w) quaternion `q`."""
    x, y, z, w = q
    norm = math.sqrt(x * x + y * y + z * z + w * w)
    if norm < 1e-12:
        return v
    x, y, z, w = x / norm, y / norm, z / norm, w / norm
    vx, vy, vz = v
    # v' = v + 2w(q x v) + 2q x (q x v)
    tx = 2.0 * (y * vz - z * vy)
    ty = 2.0 * (z * vx - x * vz)
    tz = 2.0 * (x * vy - y * vx)
    return (
        vx + w * tx + (y * tz - z * ty),
        vy + w * ty + (z * tx - x * tz),
        vz + w * tz + (x * ty - y * tx),
    )


def _part_vertices(part):
    """Triangle vertices of one part, with the part's own placement baked in."""
    verts, _ = _mesh_of(part)
    loc = part.get("loc")
    pos = (0.0, 0.0, 0.0)
    quat = None
    if isinstance(loc, (list, tuple)) and len(loc) == 2:
        if isinstance(loc[0], (list, tuple)) and len(loc[0]) == 3:
            pos = tuple(float(v) for v in loc[0])
        if isinstance(loc[1], (list, tuple)) and len(loc[1]) == 4:
            quat = tuple(float(v) for v in loc[1])
    out = []
    for i in range(0, len(verts) - 2, 3):
        p = (float(verts[i]), float(verts[i + 1]), float(verts[i + 2]))
        if quat:
            p = _rotated(quat, p)
        out.append((p[0] + pos[0], p[1] + pos[1], p[2] + pos[2]))
    return out


# ---------------------------------------------------------------------------
# mesh -> planar faces (real B-Rep, for STEP / BREP / DXF)
# ---------------------------------------------------------------------------
def _faces_from_parts(parts):
    """One planar OCCT face per triangle; degenerate/out-of-range ones skipped."""
    faces = []
    skipped = 0
    for part in parts:
        verts = _part_vertices(part)
        _, tris = _mesh_of(part)
        count = len(verts)
        # `triangles` is a FLAT index array (i0,i1,i2, i0,i1,i2, …).
        for start in range(0, len(tris) - 2, 3):
            try:
                i, j, k = int(tris[start]), int(tris[start + 1]), int(tris[start + 2])
            except (TypeError, ValueError, IndexError):
                skipped += 1
                continue
            if max(i, j, k) >= count or len({i, j, k}) < 3:
                skipped += 1
                continue
            p = [gp_Pnt(*verts[a]) for a in (i, j, k)]
            if (
                p[0].Distance(p[1]) < 1e-12
                or p[1].Distance(p[2]) < 1e-12
                or p[0].Distance(p[2]) < 1e-12
            ):
                skipped += 1
                continue
            poly = BRepBuilderAPI_MakePolygon(p[0], p[1], p[2], True)
            if not poly.IsDone():
                skipped += 1
                continue
            mk = BRepBuilderAPI_MakeFace(poly.Wire())
            if not mk.IsDone():
                skipped += 1
                continue
            faces.append(mk.Face())
    return faces, skipped


def _compound(faces):
    builder = BRep_Builder()
    comp = TopoDS_Compound()
    builder.MakeCompound(comp)
    for face in faces:
        builder.Add(comp, face)
    return comp


def _sew(compound, tolerance):
    """Stitch the triangles into a shell (or a compound of shells)."""
    sewing = BRepBuilderAPI_Sewing(tolerance, True, True, True, False)
    sewing.Add(compound)
    sewing.Perform()
    return sewing.SewedShape(), sewing.NbFreeEdges()


def _solidify(shape):
    """Turn every closed shell of `shape` into a solid (CAD prefers real solids).

    Only called when the sew found no free edges, i.e. every shell is closed;
    an open shell would produce an invalid solid instead.
    """
    shells = []
    explorer = TopExp_Explorer(shape, TopAbs_SHELL)
    while explorer.More():
        shells.append(TopoDS.Shell_s(explorer.Current()))
        explorer.Next()
    if not shells:
        return shape
    builder = BRep_Builder()
    out = TopoDS_Compound()
    builder.MakeCompound(out)
    for shell in shells:
        try:
            mk = BRepBuilderAPI_MakeSolid(shell)
            builder.Add(out, mk.Solid() if mk.IsDone() else shell)
        except Exception:
            builder.Add(out, shell)
    return out


def brep_shape_from_parts(parts, stitch=True):
    faces, skipped = _faces_from_parts(parts)
    if not faces:
        raise RuntimeError("模型里没有可导出的三角面（mesh 为空或顶点索引无效）")
    info = {"faces": len(faces), "skipped": skipped, "free_edges": None}
    comp = _compound(faces)
    if not stitch:
        return cq.Shape.cast(comp), info
    xs, ys, zs = [], [], []
    for part in parts:
        for p in _part_vertices(part):
            xs.append(p[0])
            ys.append(p[1])
            zs.append(p[2])
    if not xs:
        return cq.Shape.cast(comp), info
    diagonal = math.sqrt((max(xs) - min(xs)) ** 2 + (max(ys) - min(ys)) ** 2 + (max(zs) - min(zs)) ** 2) or 1.0
    sewed, free = _sew(comp, max(1e-9, diagonal * 1e-7))
    info["free_edges"] = int(free)
    return cq.Shape.cast(_solidify(sewed) if free == 0 else sewed), info


# ---------------------------------------------------------------------------
# mesh -> Poly_Triangulation faces (fast, exact triangles, for the mesh formats)
# ---------------------------------------------------------------------------
def mesh_shape_from_parts(parts):
    builder = BRep_Builder()
    comp = TopoDS_Compound()
    builder.MakeCompound(comp)
    total = 0
    for part in parts:
        verts = _part_vertices(part)
        _, tris = _mesh_of(part)
        index = []
        for start in range(0, len(tris) - 2, 3):
            try:
                tri = (int(tris[start]), int(tris[start + 1]), int(tris[start + 2]))
            except (TypeError, ValueError, IndexError):
                continue
            if max(tri) >= len(verts) or len(set(tri)) < 3:
                continue
            index.append(tri)
        if not index:
            continue
        tri = Poly_Triangulation(len(verts), len(index), False)
        for i, p in enumerate(verts):
            tri.SetNode(i + 1, gp_Pnt(*p))
        cell = Poly_Triangle()
        for k, (a, b, c) in enumerate(index):
            cell.Set(a + 1, b + 1, c + 1)
            tri.SetTriangle(k + 1, cell)
        face = TopoDS_Face()
        builder.MakeFace(face, tri)
        builder.Add(comp, face)
        total += len(index)
    if total == 0:
        raise RuntimeError("模型里没有可导出的三角面（mesh 为空或顶点索引无效）")
    return cq.Shape.cast(comp), {"triangles": total}


# ---------------------------------------------------------------------------
# projected drawing (SVG) — silhouette + sharp edges, no hidden line removal
# ---------------------------------------------------------------------------
def projected_svg(parts, options=None):
    from cadquery.occ_impl.exporters import svg as svgmod

    opts = {
        "width": 900,
        "height": 700,
        "marginLeft": 20,
        "marginTop": 20,
        "projectionDir": (-1.75, 1.1, 5),
        "strokeWidth": -1.0,
        "strokeColor": (0, 0, 0),
        "sharpAngle": 20.0,
    }
    if options:
        opts.update(options)

    ax = gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(*opts["projectionDir"]))
    projector = HLRAlgo_Projector(ax)
    view = ax.Direction()
    view = (view.X(), view.Y(), view.Z())
    cos_sharp = math.cos(math.radians(float(opts["sharpAngle"])))

    # key = (part, i, j) with i < j -> triangle normals sharing that edge
    part_verts = [_part_vertices(part) for part in parts]
    edges = {}
    for pi, part in enumerate(parts):
        verts = part_verts[pi]
        _, tris = _mesh_of(part)
        for start in range(0, len(tris) - 2, 3):
            try:
                a, b, c = int(tris[start]), int(tris[start + 1]), int(tris[start + 2])
            except (TypeError, ValueError, IndexError):
                continue
            if max(a, b, c) >= len(verts) or len({a, b, c}) < 3:
                continue
            p0, p1, p2 = verts[a], verts[b], verts[c]
            ux, uy, uz = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
            wx, wy, wz = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
            nx, ny, nz = (uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx)
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            if length < 1e-15:
                continue
            normal = (nx / length, ny / length, nz / length)
            for i, j in ((a, b), (b, c), (c, a)):
                key = (pi, i, j) if i < j else (pi, j, i)
                edges.setdefault(key, []).append(normal)

    segments = []
    flat = gp_Pnt2d()
    for (pi, i, j), normals in edges.items():
        keep = len(normals) == 1  # open boundary of the mesh
        if not keep and len(normals) >= 2:
            n1, n2 = normals[0], normals[1]
            f1 = n1[0] * view[0] + n1[1] * view[1] + n1[2] * view[2]
            f2 = n2[0] * view[0] + n2[1] * view[1] + n2[2] * view[2]
            if f1 * f2 <= 0.0:  # silhouette
                keep = True
            elif n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < cos_sharp:  # sharp
                keep = True
        if not keep:
            continue
        verts = part_verts[pi]
        points = []
        for idx in (i, j):
            p = verts[idx]
            projector.Project(gp_Pnt(*p), flat)
            points.append((flat.X(), flat.Y()))
        segments.append((points[0][0], points[0][1], points[1][0], points[1][1]))

    if not segments:
        raise RuntimeError("投影没有产生任何可见轮廓")

    xs = [v for seg in segments for v in (seg[0], seg[2])]
    ys = [v for seg in segments for v in (seg[1], seg[3])]
    xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
    width = float(opts["width"])
    height = float(opts["height"])
    margin_left = float(opts["marginLeft"])
    margin_top = float(opts["marginTop"])
    xlen = max(xmax - xmin, 1e-9)
    ylen = max(ymax - ymin, 1e-9)
    unit_scale = min(width / xlen * 0.75, height / ylen * 0.75)
    stroke_width = float(opts["strokeWidth"])
    if stroke_width < 0:
        stroke_width = 1.0 / unit_scale
    x_translate = (0 - xmin) + margin_left / unit_scale
    y_translate = (0 - ymax) - margin_top / unit_scale
    visible = "\t\t\t<!-- projected from the stored triangle mesh (no hidden lines) -->\n"
    for x1, y1, x2, y2 in segments:
        visible += svgmod.PATHTEMPLATE % "M{:.6g},{:.6g} L{:.6g},{:.6g}".format(x1, y1, x2, y2)
    axes = ""
    if opts.get("showAxes") and tuple(opts["projectionDir"]) == (-1.75, 1.1, 5):
        axes = svgmod.AXES_TEMPLATE % {
            "unitScale": str(unit_scale),
            "textboxY": str(height - 30),
            "uom": "mm",
        }
    return svgmod.SVG_TEMPLATE % {
        "unitScale": str(unit_scale),
        "strokeWidth": str(stroke_width),
        "strokeColor": ",".join(str(x) for x in opts["strokeColor"]),
        "hiddenColor": "160,160,160",
        "hiddenContent": "",
        "visibleContent": visible,
        "xTranslate": str(x_translate),
        "yTranslate": str(y_translate),
        "width": str(width),
        "height": str(height),
        "textboxY": str(height - 30),
        "uom": "mm",
        "axesIndicator": axes,
    }


# ---------------------------------------------------------------------------
# VTP — CadQuery's exporter goes through the OCC/VTK bridge (IVtkOCC_ShapeMesher),
# which returns an empty polydata on this host (even for a plain box), i.e. an
# empty .vtp file. The bridge is used whenever it produces something; otherwise
# the triangles are written with the same VTK writer CadQuery itself uses.
# ---------------------------------------------------------------------------
def _vtk_error():
    return RuntimeError(
        "VTP 导出需要 VTK，但当前解释器里 `vtkmodules` 不可用。安装："
        "`\"%s\" -m pip install vtk`（注意：缺 VTK 时 cadquery 本身也无法导入）。" % sys.executable
    )


def _write_vtp_polydata(points, faces, out, donor=None):
    """Write points/faces as VTK XML PolyData; `donor` optionally adds normals."""
    try:
        from vtkmodules.vtkCommonCore import vtkPoints
        from vtkmodules.vtkCommonDataModel import vtkCellArray, vtkPolyData
        from vtkmodules.vtkIOXML import vtkXMLPolyDataWriter
    except Exception as exc:  # noqa: BLE001 - reported to the caller as JSON
        raise _vtk_error() from exc

    vtk_points = vtkPoints()
    for p in points:
        vtk_points.InsertNextPoint(p[0], p[1], p[2])
    if vtk_points.GetNumberOfPoints() == 0:
        raise RuntimeError("模型里没有可导出的三角面（mesh 为空或顶点索引无效）")
    polys = vtkCellArray()
    for a, b, c in faces:
        polys.InsertNextCell(3)
        for idx in (a, b, c):
            polys.InsertCellPoint(idx)

    polydata = vtkPolyData()
    polydata.SetPoints(vtk_points)
    polydata.SetPolys(polys)
    if donor is not None:
        polydata.GetPointData().ShallowCopy(donor.GetPointData())
        polydata.GetCellData().ShallowCopy(donor.GetCellData())
    writer = vtkXMLPolyDataWriter()
    writer.SetFileName(out)
    writer.SetInputData(polydata)
    if not writer.Write():
        raise RuntimeError("VTP 写入失败")


def _write_vtp_bridge(polydata, out):
    try:
        from vtkmodules.vtkIOXML import vtkXMLPolyDataWriter
    except Exception as exc:  # noqa: BLE001
        raise _vtk_error() from exc

    writer = vtkXMLPolyDataWriter()
    writer.SetFileName(out)
    writer.SetInputData(polydata)
    if not writer.Write():
        raise RuntimeError("VTP 写入失败")


def mesh_arrays(parts):
    """Flatten every part into (points, faces) for the VTP writer."""
    points = []
    faces = []
    for part in parts:
        verts = _part_vertices(part)
        _, tris = _mesh_of(part)
        offset = len(points)
        points.extend(verts)
        for start in range(0, len(tris) - 2, 3):
            try:
                a, b, c = int(tris[start]), int(tris[start + 1]), int(tris[start + 2])
            except (TypeError, ValueError, IndexError):
                continue
            if max(a, b, c) >= len(verts) or len({a, b, c}) < 3:
                continue
            faces.append((offset + a, offset + b, offset + c))
    return points, faces


def write_vtp(parts, out, donor=None):
    points, faces = mesh_arrays(parts)
    _write_vtp_polydata(points, faces, out, donor)


def vtp_from_shape(model, out, tolerance, angular_tolerance):
    """VTP for a real CadQuery object (script mode); returns the path it took."""
    if isinstance(model, cq.Assembly):
        raise RuntimeError("VTP 不支持装配体导出，请改用 STL / VRML")
    target = cqex.toCompound(model) if isinstance(model, cq.Workplane) else model
    donor = vtp_polydata_of(target, tolerance, angular_tolerance)
    if donor is not None and donor.GetNumberOfPoints() > 0:
        _write_vtp_bridge(donor, out)
        return "cadquery"
    verts, tris = target.tessellate(tolerance, angular_tolerance)
    points = [(v.x, v.y, v.z) for v in verts]
    faces = [(int(t[0]), int(t[1]), int(t[2])) for t in tris]
    _write_vtp_polydata(points, faces, out, donor)
    return "vtk"


def vtp_polydata_of(shape, tolerance, angular_tolerance):
    """CadQuery's OCC->VTK bridge; returns an empty polydata on this host."""
    try:
        return shape.toVtkPolyData(tolerance, angular_tolerance)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# exporters
# ---------------------------------------------------------------------------
def export_brep_shape(shape, fmt, out, tolerance, angular_tolerance):
    if fmt == "BREP":
        if not shape.exportBrep(out):
            raise RuntimeError("BREP 导出失败")
    elif fmt == "STEP":
        shape.exportStep(out)
    elif fmt == "DXF":
        # The DXF writer consumes Workplanes (it walks their edges in 2D).
        cqex.exportDXF(cq.Workplane("XY", obj=shape), out)
    else:
        cqex.export(shape, out, exportType=fmt, tolerance=tolerance, angularTolerance=angular_tolerance)


def export_from_script(script_path, fmt, out, tolerance, angular_tolerance):
    namespace = {}
    with open(script_path, "r", encoding="utf-8-sig") as handle:
        source = handle.read()
    exec(compile(source, script_path, "exec"), namespace)
    model = namespace.get("model")
    if model is None:
        raise RuntimeError("CadQuery 脚本里没有定义 `model`")

    if isinstance(model, cq.Assembly):
        if fmt == "STEP":
            if not cqex.assembly.exportAssembly(model, out):
                raise RuntimeError("装配体 STEP 导出失败")
        elif not model.export(out, exportType=fmt, tolerance=tolerance, angularTolerance=angular_tolerance):
            raise RuntimeError("%s 不支持装配体导出" % fmt)
        return "assembly"

    if fmt == "BREP":
        solid = model.val() if hasattr(model, "val") else model
        if not solid.exportBrep(out):
            raise RuntimeError("BREP 导出失败")
        return "script"
    if fmt == "VTP":
        return "script+" + vtp_from_shape(model, out, tolerance, angular_tolerance)
    if fmt == "DXF" and not isinstance(model, cq.Workplane):
        cqex.exportDXF(cq.Workplane("XY", obj=model), out)
        return "script"
    cqex.export(model, out, exportType=fmt, tolerance=tolerance, angularTolerance=angular_tolerance)
    return "script"


def export_from_mesh(parts, fmt, out, tolerance, angular_tolerance):
    kind = FORMATS[fmt][1]
    if kind == "mesh":
        shape, info = mesh_shape_from_parts(parts)
        if fmt == "VTP":
            polydata = vtp_polydata_of(shape, tolerance, angular_tolerance)
            if polydata is not None and polydata.GetNumberOfPoints() > 0:
                _write_vtp_bridge(polydata, out)
            else:
                write_vtp(parts, out, polydata)
                info["note"] = "CadQuery 的 OCC→VTK 通道返回空网格，已直接用 VTK 写出三角网格"
        else:
            cqex.export(shape, out, exportType=fmt, tolerance=tolerance, angularTolerance=angular_tolerance)
        return info
    if fmt == "SVG":
        with open(out, "w", encoding="utf-8") as handle:
            handle.write(projected_svg(parts))
        return {}
    # STEP / BREP (real B-Rep) and DXF (2D projection of those faces)
    shape, info = brep_shape_from_parts(parts, stitch=(fmt != "DXF"))
    export_brep_shape(shape, fmt, out, tolerance, angular_tolerance)
    return info


def main():
    parser = argparse.ArgumentParser(description="Export a dsh-model-viewer model via CadQuery")
    parser.add_argument("--format", required=True, choices=sorted(FORMATS.keys()))
    parser.add_argument("--out", required=True)
    parser.add_argument("--model", help="stored model JSON (mesh) to export")
    parser.add_argument("--script", help="CadQuery script that defines `model`")
    parser.add_argument("--tolerance", type=float, default=0.1)
    parser.add_argument("--angular-tolerance", type=float, default=0.1)
    args = parser.parse_args()

    fmt = args.format.upper()
    if not args.model and not args.script:
        return _fail("either --model or --script is required")

    try:
        extra = {}
        if args.script:
            mode = export_from_script(
                args.script, fmt, args.out, args.tolerance, args.angular_tolerance
            )
        else:
            # utf-8-sig: tolerate a BOM, some editors add one to a hand-made file.
            with open(args.model, "r", encoding="utf-8-sig") as handle:
                doc = json.load(handle)
            parts = _parts_of(doc)
            if not parts:
                raise RuntimeError("模型里没有任何部件（parts 为空）")
            extra = export_from_mesh(parts, fmt, args.out, args.tolerance, args.angular_tolerance)
            mode = "mesh"
    except Exception as exc:  # noqa: BLE001 - reported to the caller as JSON
        return _fail("%s: %s" % (type(exc).__name__, exc))

    if not os.path.exists(args.out):
        return _fail("导出器没有写出文件")
    payload = {
        "ok": True,
        "format": fmt,
        "out": args.out,
        "bytes": os.path.getsize(args.out),
        "mode": mode,
    }
    payload.update(extra)
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    sys.exit(main())
