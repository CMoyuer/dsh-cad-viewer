# dsh-model-viewer

A 3D model library and a full CAD viewer, embedded in the [dsh](https://github.com/deepseek-ai/deepseek-harness) web GUI as a **"3D模型"** tab — plus two agent tools that build geometry with **CadQuery** and drop it straight into the library.

[![License](https://img.shields.io/github/license/CMoyuer/dsh-3dmodel-viewer)](LICENSE)
[![Stars](https://img.shields.io/github/stars/CMoyuer/dsh-3dmodel-viewer)](https://github.com/CMoyuer/dsh-3dmodel-viewer/stargazers)
[![Issues](https://img.shields.io/github/issues/CMoyuer/dsh-3dmodel-viewer)](https://github.com/CMoyuer/dsh-3dmodel-viewer/issues)
![Platform](https://img.shields.io/badge/platform-dsh%20web-3b82f6)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)

[中文文档](README.zh-CN.md) · [Changelog](CHANGELOG.md) · [MIT License](LICENSE)

> The GitHub repository is `dsh-3dmodel-viewer`; the npm package and the dsh plugin id are both `dsh-model-viewer`.

---

## Table of contents

- [What it does](#what-it-does)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Using the plugin](#using-the-plugin)
- [Agent tools](#agent-tools)
- [CadQuery modeling](#cadquery-modeling)
- [Installing CadQuery (the agent does it)](#installing-cadquery-the-agent-does-it)
- [HTTP API](#http-api)
- [Configuration](#configuration)
- [Data and storage](#data-and-storage)
- [Project layout](#project-layout)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Third-party notices](#third-party-notices)
- [License](#license)

## What it does

The plugin adds a **3D模型** tab to the dsh conversation view. The tab holds:

- a **model library** — folders, library-wide search, drag & drop, rename/move/delete, and **export** in all 10 formats CadQuery can write;
- a **workbench** — the upstream [three-cad-viewer](https://github.com/bernhard-42/three-cad-viewer) UI (toolbar, navigation tree, canvas) mounted for any model in the library.

Models are stored as one JSON file per entry on the dsh server, so the same library appears on **every device and browser** that opens the same dsh instance. There is no IndexedDB, no external service and no build step: the three-cad-viewer bundle is vendored in `assets/` and served by the plugin itself.

Three tools are registered for the agent:

| Tool | Purpose |
|---|---|
| `add_3dmodel` | Persist a three-cad-viewer `Shape` (cad-format JSON) and show it as an inline card. |
| `build_3dmodel` | Run a CadQuery script, tessellate the solid, persist the result. |
| `cadquery_env` | Read-only probe of the CadQuery environment (is the interpreter there, do cadquery / OCP / VTK / ezdxf import) plus the exact command that fixes what is missing. CadQuery is not bundled, so installing it is the agent's job — see [Installing CadQuery](#installing-cadquery-the-agent-does-it). |

## Features

**Model library (the tab's default view)**

- Folder navigation: clicking a folder card scopes the grid to that folder, and folders nest freely. While inside a folder a small location strip shows its name (e.g. `零件 /`) and the *返回上一级* card in the grid goes one level up.
- Library-wide search (placeholder `搜索模型、文件夹…`): a hit inside a folder shows the folder path on the card, and opening it leaves search.
- Folder cards and model cards in a responsive grid; the empty state explains how to get content in.
- Per-card `⋯` menu (right-clicking the card opens the same menu): **重命名 / 移动到… / 导出 ▸ / 删除**. A **right-click opens it at the pointer** (another right-click moves it there; it is clamped into the viewport), while the `⋯` button anchors it under the button — above it when there is no room below. It closes on scrolling the grid, a click elsewhere, or Esc. Double-clicking a card name renames it in place.
- The **导出** submenu opens on hover (a tap works too, for touch), listing every format CadQuery can write (STEP / BREP / STL / 3MF / AMF / VRML / VTP / TJS / SVG / DXF) grouped as *精确几何 / 网格 / 二维图纸*; its header states whether the entry exports **exact geometry** (its CadQuery source was kept) or is **rebuilt from the triangle mesh**. See [Export](#export).
- 移动到… switches the grid into pick mode (a hint bar reads `把「…」移动到：`) — click a folder card or 返回上一级 as the destination, or 取消.
- Drag & drop to move models and folders. Mouse drag uses the HTML5 drag events; on touch devices a long press starts a drag with a floating copy, and *返回上一级* doubles as a drop target to move something up one level.
- Right-click on blank space: **新建文件夹 / 刷新**. That menu only appears **inside the model-library panel** and is clamped to it (it never spills over the tab strip or the workbench); right-clicking outside the panel, or on a field such as the search box, is left to the browser's own menu. Right-clicking a card dismisses it, since a card menu and the blank-space menu never show at once.
- Deleting a folder never deletes content: its models and child folders move up to the deleted folder's parent.

**Workbench**

- One tab per opened model; every tab can be closed individually (`×`). The active tab and the library share one tab strip.
- Full upstream three-cad-viewer UI: toolbar (view, clipping, measurement, materials, environment, zebra, …), left navigation tree and canvas.
- Rotate with the left or right mouse button, pan with the middle button, zoom with the wheel.
- The layout is pure CSS (flex + `100%`), with no JS size listeners fighting the viewer; a `ResizeObserver` only re-fits the CAD view.
- The upstream *Pin as PNG* toolbar button is hidden — this panel is for viewing models, not exporting screenshots.
- An **导出** icon button sits just before the help (`?`) button (it is what replaces *Pin as PNG* for exporting models). It reuses the viewer's own button structure (`tcv_tooltip` + `tcv_button_frame` + `tcv_btn`), so its size, hover highlight and tooltip match the other buttons exactly; only the icon is ours — a download arrow into a tray, drawn in the viewer's palette (`#444` outlines, `rgb(83,160,227)` blue). It opens the **exact same** format submenu the library cards use, exporting the model open in that tab. It is re-placed in front of help if the viewer rebuilds its toolbar, and the CAD view re-fits when it wraps the toolbar onto a second row.
- The viewer's hard-coded English UI (labels, tooltips, help table, `<select>` options) is translated to Chinese at runtime by walking the rendered DOM.
- While the tab is mounted, dsh's column-width drag handles are hidden so they cannot be grabbed through the canvas.

**Inline cards in the conversation**

- A message whose turn called `add_3dmodel` or `build_3dmodel` gets a collapsible model card at its tail (`conversation.chat.turnTail`), with the title on the left and *收起* on the right.
- The card's *全屏* button opens the same model as a workbench tab in the **3D模型** tab; if the tab is not mounted yet the request is queued and consumed on mount.
- A failed load shows a retry action instead of hanging on "preparing".

**Localisation**

- The tab label follows the dsh locale: `3D Model` when the active locale is English, `3D模型` otherwise.
- All other UI text in the tab and cards is Chinese.

## Requirements

| | |
|---|---|
| dsh | A working dsh install with the `web` profile (`dsh web`) — developed against `@deepseek-ai/dsh` 0.1.5-rc.1. |
| Node.js | 20 or newer (developed on Node 24). |
| pnpm | On `PATH`: `dsh plugin` is a thin pnpm forwarder. |
| CadQuery | **Only for `build_3dmodel` and for exporting.** A Python environment with `cadquery` installed. `add_3dmodel` needs nothing extra. CadQuery is Apache-2.0 and is **not bundled** — the agent installs it, see [Installing CadQuery](#installing-cadquery-the-agent-does-it) and the [third-party notices](#third-party-notices). |

There is no build step and no `prepare` script, so installing from git needs no pnpm `allowBuilds` entry.

## Installation

### From GitHub

```bash
dsh plugin --profile web add github:CMoyuer/dsh-3dmodel-viewer
```

### From a local checkout

```bash
git clone https://github.com/CMoyuer/dsh-3dmodel-viewer.git
cd dsh-3dmodel-viewer
pnpm install          # the plugin resolves its own deps from its own node_modules
dsh plugin --profile web add .
```

`dsh plugin add` runs pnpm inside the profile directory and then reconciles `dsh.profile.bundles` against what is actually installed, so a package that declares `dsh.bundle` joins the layer stack **automatically** — there is nothing to edit by hand. Use an absolute path (or run the command from the checkout, as above) if the plugin lives outside the profile.

### Enable and verify

Restart dsh web (server-side plugins are only loaded at boot), then check that both routes answer with the plugin's own content type:

```bash
dsh --profile web --dump-config                       # the tree should contain id: model-viewer
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:3080/3dmodel/api/items
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:3080/tcv/three-cad-viewer.esm.min.js
```

Expected: `200 application/json; charset=utf-8` and `200 text/javascript; charset=utf-8`. A missing route is **not** a 404 — dsh's SPA fallback answers `200 text/html`, so always check the content type.

Then reload the GUI and open the **3D模型** tab (it sits directly after the gallery tab).

## Using the plugin

### Model library

Open the tab; the library is the default view. Models created by the agent (`add_3dmodel`, `build_3dmodel`) appear here immediately, ordered by creation time. Click a card to open that model in a new workbench tab.

| Action | How |
|---|---|
| Open a model | Click its card |
| Rename | Double-click the name, or `⋯` → 重命名 |
| Move | Drag the card onto a folder (or 返回上一级), or `⋯` → 移动到… |
| Export | `⋯` → hover 导出 (or right-click the card and hover / tap it), then pick a format |
| Delete | `⋯` → 删除 |
| New folder | Right-click blank space inside the library panel → 新建文件夹 (right-clicking a card dismisses it) |
| Search | Type in the search field (searches the whole library) |
| Go up one level | The 返回上一级 card, or drag a card onto it |

### Export

Right-click a model card (or use its `⋯` menu) and hover **导出**: the submenu appears to the **right** of the card menu, aligned with the 导出 row (flipping to the left when the right side has no room). On touch devices a tap opens it instead, and either way the **card menu stays open**, so 重命名 / 移动到… / 删除 remain reachable. Moving onto any other menu entry or leaving the menu area hides the submenu immediately — crossing over to the flyout itself does not flicker — and so do Esc and a click elsewhere. Picking a format starts the download and closes both menus, named after the entry's title.

**The same export entry lives in the workbench**: the **导出** icon button before the `?` help button opens the identical format submenu for the model in that tab (clicking the button again closes it).

| Group | Format | Notes |
|---|---|---|
| Exact geometry | `STEP` `.step` | AP214 solid, the common CAD exchange format |
| Exact geometry | `BREP` `.brep` | Native OCCT B-Rep |
| Mesh | `STL` `.stl` | Binary triangle mesh, 3D printing |
| Mesh | `3MF` `.3mf` | 3D manufacturing format |
| Mesh | `AMF` `.amf` | Additive manufacturing format |
| Mesh | `VRML` `.wrl` | Virtual Reality Modeling Language |
| Mesh | `VTP` `.vtp` | VTK XML PolyData |
| Mesh | `TJS` `.json` | three.js JSON mesh |
| Drawings | `SVG` `.svg` | Projected 2D drawing |
| Drawings | `DXF` `.dxf` | 2D drawing, CAD exchange |

The export runs server-side in `lib/cadquery_export.py` with the interpreter from `cadqueryPython`. What the file contains depends on the entry:

- **Entries that kept their CadQuery source** (created by `build_3dmodel`): the script is re-run and handed to CadQuery's own exporters, so STEP/BREP are real solids (correct volume, real cylindrical faces) and small. The submenu header reads *已保存 CadQuery 源码 · 导出为精确几何*.
- **Mesh-only entries** (created by `add_3dmodel`, or stored by an older build): the stored triangles are reconstructed, and the header reads *仅有网格 · 由三角网格重建几何*:
  - `STEP` / `BREP`: each triangle becomes a planar face and the faces are sewn into a shell (a solid when it closes). CAD systems open it, but the surface is **faceted** and the file is large (≈10k triangles → a ~20 MB STEP).
  - `STL` / `3MF` / `AMF` / `VRML` / `VTP` / `TJS`: the mesh is attached to OCCT faces and given to CadQuery's exporters, so the file carries exactly the triangles shown in the viewer.
  - `DXF`: a 2D projection of those planar faces.
  - `SVG`: projected **silhouette + feature edges** (no hidden-line removal — HLR over a triangle soup is impractically slow, minutes for ~10k faces), so a mesh-only SVG has no dashed hidden lines.

Exports run one at a time on the server; the UI shows a progress dialog you can dismiss with *后台继续* while the download still completes. A ~10k-triangle mesh takes a few seconds for STEP/BREP, and the server caps one export at `cadqueryExportTimeout` (5 minutes by default).

### Workbench

Each opened model becomes a tab in the strip at the top; the `×` on a tab closes it and returns to the library. The canvas fills the panel; the viewer's own toolbar and navigation tree behave exactly as upstream, except that the *Pin as PNG* button is removed, the UI text is Chinese, and an **导出** icon button sits before the `?` help button (styled like the viewer's own buttons; same format list as the library cards, exporting the model in that tab).

### Inline card

Whenever a turn calls one of the model tools, the model also shows up as a card at the end of that message: the title on the left, *收起* to collapse it, *全屏* to open it as a workbench tab. The card renders the geometry carried by the tool call when it has it, and otherwise fetches the entry from the store (by id, then by title, then the newest entry), showing *重试* if nothing loads within a few seconds. Deleting an entry from the library therefore does not blank out a card that has already rendered, but a card without inline geometry can fall back to a different entry or fail on reload.

## Agent tools

### `add_3dmodel`

```jsonc
{
  "model":  { /* three-cad-viewer Shape JSON — required */ },
  "title":  "Bracket",   // optional; part of the de-duplication key
  "height": 320           // optional; inline card canvas height in px
}
```

The `model` value is a [three-cad-viewer `Shape`](https://github.com/bernhard-42/three-cad-viewer) document: `{ version, parts[] }`, where each part carries `shape: { vertices, triangles, normals, edges, … }` plus optional `name`, `color`, `alpha`. Adding the same geometry under the same title **updates the existing entry** instead of creating a duplicate (see [Data and storage](#data-and-storage)).

### `build_3dmodel`

```jsonc
{
  "script":    "import cadquery as cq\nmodel = cq.Workplane('XY').box(20, 20, 10)",  // required
  "title":     "Box 20×20×10",  // optional
  "tolerance": 0.1              // optional tessellation tolerance
}
```

The script is written to a temp file and executed with the configured CadQuery interpreter; the resulting solid is tessellated into a `Shape` (smooth per-vertex normals, boundary edges, bounding box) and stored. A script that fails, or that never assigns `model`, returns `{ "ok": false, "error": … }` — the build is reported as a failure, not as an empty model. CadQuery is developed by the [CadQuery project](https://github.com/CadQuery/cadquery) and released under Apache-2.0; this plugin does not bundle it (see [Third-party notices](#third-party-notices)).

Behaviour worth knowing:

- **The script is kept with the entry** (`script`, capped at 256 KB). Such an entry can therefore be exported from the model library via **导出 ▸** by re-running the script, which yields **exact geometry** in every format CadQuery writes (STEP/BREP as real solids); `hasSource` in the list metadata is that flag. See [Export](#export).
- **Units are CadQuery's own** (typically mm) — the plugin never converts; a `mm` in a title is just text.
- **The de-duplication key is geometry + title**: the same geometry under the same title updates the existing entry (and refreshes the stored source) instead of adding a second one.
- **One solid**: `model` must be a `cq.Workplane` / `cq.Shape`, i.e. anything with `.tessellate()`. An assembly has to be converted first, e.g. `model = assy.toCompound()`; assigning a `cq.Assembly` returns `{ "ok": false, "error": "tessellate error: …" }`.

## CadQuery modeling

A `build_3dmodel` script is plain Python. Requirements:

- `import cadquery as cq` and assign **`model`** — a `cq.Workplane` or `cq.Shape` (anything with `.tessellate(tol)`); convert an assembly first with `model = assy.toCompound()`.
- Optional module-level `name` (part name, default `Part`) and `color` (hex, default `#e8b024`).
- Units are CadQuery's own (typically mm); the plugin does not convert.

```python
import cadquery as cq

name = "Bracket"
color = "#3b82f6"

model = (
    cq.Workplane("XY")
    .box(40, 20, 6)
    .faces(">Z")
    .workplane()
    .hole(6)
)
```

Details:

- The interpreter comes from `cadqueryPython` (default `D:\AI\3DModels\.venv\Scripts\python.exe` — **change it** for your machine); the runner is `lib/cadquery_build.py`.
- Both scripts import `vtkmodules.vtkCommonDataModel` **before** `cadquery` to dodge the OCCT/VTK DLL-load conflict seen on Windows. That import is **tolerant**: a missing VTK does not fail there (CadQuery itself reports it — see the next section).
- Build timeout is 60 s per invocation and stdout is capped at 64 MB, so keep the tessellation tolerance sane for large assemblies.
- The generated document is written to the model store through the same path as `add_3dmodel`, so it appears in the library and as an inline card.
- With no CadQuery installed, `build_3dmodel` and every export return an error that **carries the install command** instead of a stack trace — run what it says (details in [Installing CadQuery](#installing-cadquery-the-agent-does-it)).

## Installing CadQuery (the agent does it)

CadQuery is **not bundled** with this plugin: `build_3dmodel` and every export drive the CadQuery **you** have installed, through the interpreter named by `cadqueryPython`. You do not have to work out the install yourself — just tell the agent *"install CadQuery"* / *"I want to be able to export STEP"* and it runs the procedure below.

### What the agent does

1. **Probe** with the `cadquery_env` tool (read-only, registered by this plugin). It reports the interpreter path and Python version, whether `cadquery` / `OCP` / `vtkmodules` / `ezdxf` import, which ones are missing, and **the exact commands to run**. The manual equivalent is `<python> lib/cadquery_probe.py`.
2. **Install** by running those commands, typically:

   ```bash
   # Windows
   python -m venv D:\AI\3DModels\.venv
   "D:\AI\3DModels\.venv\Scripts\python.exe" -m pip install --upgrade pip
   "D:\AI\3DModels\.venv\Scripts\python.exe" -m pip install cadquery vtk

   # Linux / macOS
   python3 -m venv ~/cq-venv
   ~/cq-venv/bin/python -m pip install --upgrade pip
   ~/cq-venv/bin/python -m pip install cadquery vtk
   ```

3. **Point the plugin at it** in the profile's `cordis.patch.yml` (an id-targeted config override):

   ```yaml
   - id: model-viewer
     config:
       cadqueryPython: 'D:\AI\3DModels\.venv\Scripts\python.exe'
   ```

   Keep the single quotes if the path has spaces; backslashes are literal inside YAML single quotes.
4. **Restart** `dsh web` — server config is read at boot only (`dev/restart-verify.ps1` preflights, health-checks and rolls back on failure).
5. **Re-verify** with `cadquery_env` (all four packages should show a version and "建模与导出可用"), or simply export a STEP.

### Why `pip install cadquery vtk` and not just cadquery

**VTK is not a declared cadquery dependency, but without it `import cadquery` does not even succeed.** In `cadquery 2.4.0`, `cadquery/occ_impl/exporters/__init__.py` does `from .vtk import exportVTP` at module level, and `exporters/vtk.py` starts with `from vtkmodules.vtkIOXML import vtkXMLPolyDataWriter` — while PyPI's `requires_dist` for `cadquery 2.4.0` lists no `vtk`. So in an environment with only `pip install cadquery`, `import cadquery` fails outright and neither modeling nor **any** export works. Install both at once (`pip install cadquery vtk`): CadQuery then imports, and the **VTP** export (the only format that calls VTK during export) works too. `cadquery_env` calls this case out explicitly ("cadquery installed but not importable, cause: vtk").

### Versions and platforms

| | |
|---|---|
| Python | ≥ 3.8 (cadquery 2.4.0's `requires-python`). Developed and verified on **Python 3.12 + cadquery 2.4.0 + cadquery-ocp 7.7.2 + VTK 9.7.0 + ezdxf 1.4.4**. |
| Wheels | `cadquery-ocp` ships Windows / Linux / macOS(arm64) wheels. On a platform without a matching wheel (e.g. a very old glibc) use conda: `mamba install -c conda-forge cadquery`, then point `cadqueryPython` at that environment's python. |
| Where | Only on the machine running `dsh web`. Browsers and other devices need nothing — the library and every export happen server-side. |
| Size | `cadquery-ocp` and `vtk` are several-hundred-MB wheels; budget time and disk for the first install. |

### Verify and troubleshoot

- One-liner: `"<python>" -c "import cadquery, vtkmodules, ezdxf; print(cadquery.__version__)"` (printing a version means it works).
- Structured: `"<python>" lib/cadquery_probe.py`, or call the `cadquery_env` tool.
- `ImportError: vtkmodules…` or any DLL-load error: first check `<python> -c "import vtkmodules.vtkCommonDataModel"` on its own; both plugin scripts already import VTK before CadQuery to dodge the OCCT/VTK conflict on Windows, and that step is **tolerant** (it cannot mask the real error — CadQuery's own import error is reported as-is).
- Export says `VTP 导出需要 VTK`: that interpreter's `vtkmodules` is unusable — `<python> -m pip install vtk` (and remember CadQuery itself cannot import without VTK, so it is usually the same root cause).
- A changed `cadqueryPython` has no effect: `dsh web` was not restarted (config is read at boot).
- "interpreter does not exist": `cadqueryPython` points at a dead path — `cadquery_env` returns the whole venv-create → install → configure → restart sequence for it.

## HTTP API

All routes are registered on the dsh web server. `apiPrefix` defaults to `/3dmodel` and `assetPrefix` to `/tcv`.

### Assets

| Method | Route | Description |
|---|---|---|
| `GET`/`HEAD` | `/tcv/<file>` | Serve a file from the plugin's `assets/` (the three-cad-viewer ESM bundle, CSS, type definitions). Path traversal is rejected; `maxUrlLength` applies. |

### Models

| Method | Route | Description |
|---|---|---|
| `GET` | `/3dmodel/api/items` | List model metadata. Query: `session=<id>`, `workspace=<path>`, `onlySession=1`. With `onlySession=1` and a `session`, the list is filtered to that session; otherwise a non-empty `workspace` filters by workspace. Each row carries `hasSource` (whether the CadQuery source was kept). |
| `POST` | `/3dmodel/api/items` | Store a model. Body: `{ model, title?, name?, sessionId?, workspace?, folder?, height?, script? }`. Returns `{ ok, id, name, title, createdAt }`. `script` is kept (capped at 256 KB) so exports can rebuild exact geometry. |
| `GET` | `/3dmodel/api/items/:id` | Fetch one full entry, including the `Shape` JSON and, when present, `script`. |
| `PATCH` | `/3dmodel/api/items/:id` | Update `title`, `name` and/or `folder`. |
| `DELETE` | `/3dmodel/api/items/:id` | Delete one entry. |

### Export

| Method | Route | Description |
|---|---|---|
| `GET` | `/3dmodel/api/items/formats` | List the exportable formats (`{ id, ext, label, desc, group }`). The client menu is built from this, so it cannot drift from what `cadquery_export.py` supports. |
| `GET`/`HEAD` | `/3dmodel/api/items/:id/export?format=STEP` | Export one entry as a download (`content-disposition: attachment`, filename from the title, with an RFC 5987 `filename*` so non-ASCII titles survive). `format` is an `id` from `formats`; an unknown format is `400`, a missing entry `404`, a wrong method `405`, and an exporter failure `500` (JSON: `{ ok: false, error: … }`). |

### Folders

| Method | Route | Description |
|---|---|---|
| `GET` | `/3dmodel/api/items/folders` | List all folders (`{ id, name, parent, createdAt }`). |
| `POST` | `/3dmodel/api/items/folders` | Create a folder: `{ name, parent? }` (`""` = root). |
| `PATCH` | `/3dmodel/api/items/folders/:id` | Rename (`name`) and/or re-parent (`parent`). Moving a folder into itself or into one of its descendants is refused. |
| `DELETE` | `/3dmodel/api/items/folders/:id` | Delete a folder; its models and child folders move up one level. |

Notes:

- Request bodies are capped at `maxBodyBytes` (32 MB by default); ids must look like a UUID.
- Responses are JSON with `content-type: application/json; charset=utf-8`, API errors included (`{ ok: false, error: … }` with `400`/`404`). The asset route and a few protocol-level rejections answer in plain text instead: `400 bad id`, `405 method not allowed`, `414 uri too long`, and `403`/`404` on `/tcv/<file>`.
- The bundled web client calls the **default** prefixes (`/3dmodel`, `/tcv`) with hard-coded paths. Changing `apiPrefix`/`assetPrefix` therefore requires editing `lib/client.js` as well.

## Configuration

Configured through the dsh config tree (schemastery), e.g. in the profile's `cordis.patch.yml`:

| Field | Default | Description |
|---|---|---|
| `assetPrefix` | `/tcv` | URL prefix for the bundled three-cad-viewer assets. |
| `apiPrefix` | `/3dmodel` | URL prefix for the model store API. |
| `dataDir` | `<plugin>/data` | Directory holding the stored models. Must **not** be shared between two dsh instances writing concurrently. |
| `maxUrlLength` | `2048` | Maximum URL length accepted by the asset route. |
| `maxBodyBytes` | `33554432` (32 MB) | Maximum JSON request body size. |
| `cadqueryPython` | `D:\AI\3DModels\.venv\Scripts\python.exe` | Python interpreter with CadQuery, used by `build_3dmodel` and by the export route. Change this for your machine. |
| `cadqueryTolerance` | `0.1` | Default tessellation tolerance (also used by the mesh exports). |
| `cadqueryExportTimeout` | `300000` (5 min) | Maximum runtime of a single export, in milliseconds. Raise it for very large meshes. |

## Data and storage

- One file per model: `<dataDir>/<uuid>.json`, plus `<dataDir>/folders.meta.json` for the folder list.
- Entries created by `build_3dmodel` also keep their `script` (the CadQuery source, capped at 256 KB) so an export can rebuild exact geometry; `add_3dmodel` entries have none and export from the mesh.
- Entries carry a **content fingerprint** `h`: the `Shape` JSON is canonicalised (recursively sorted keys, `parts[].name`/`id` dropped) and hashed with SHA-256. Saving the same geometry under the same title returns the existing entry instead of adding a duplicate; the scan is retried a few times so two concurrent saves converge on one file. Only geometry is fingerprinted, so re-adding the same geometry and title also refreshes `script`.
- Fingerprints are recomputed at startup, so entries written by an older version are upgraded in place.
- Leftover `*.json.tmp` files from an interrupted write are cleaned up at startup.
- Writes go directly to the final path — there is no atomic rename. **Back up `<dataDir>` if the library matters to you**; the folder is git-ignored in this repository precisely because it is user data.

Deleting a model removes that entry and nothing else: cards already rendered in the conversation keep their geometry, and nothing outside `dataDir` is touched.

## Project layout

```
dsh-model-viewer/
├── lib/
│   ├── index.js            # server half: /tcv + /3dmodel routes, three tools, export download
│   ├── client.js           # client half: 3D模型 tab (library/workbench), inline card, export submenu + toolbar button
│   ├── cadquery_build.py   # CadQuery script -> three-cad-viewer Shape JSON
│   ├── cadquery_export.py  # model -> every format CadQuery can write
│   └── cadquery_probe.py   # reports cadquery/OCP/VTK/ezdxf of an interpreter (used by cadquery_env)
├── dev/                    # development-only scripts (not used at runtime)
│   ├── route-test.mjs      # route-level test: fake ctx, real CadQuery exports and cadquery_env calls
│   ├── client-render-test.mjs  # client render test: fake React/DOM, menu -> export -> download
│   ├── make-icon-preview.mjs   # renders the toolbar export icon next to the viewer's own icons
│   ├── make-toolbar-layout.mjs # measures the toolbar box model and divider gaps (headless browser)
│   ├── dump-css.mjs        # dumps the CSS the client bundle injects (used by the script above)
│   ├── block-import.py     # blocks a package to prove the no-VTK / no-CadQuery behaviour
│   └── restart-verify.ps1  # safe restart + health checks + rollback (logs to restart-log.log)
├── assets/                # vendored prebuilt three-cad-viewer bundle (see assets/README.md)
│   ├── three-cad-viewer.esm.min.js
│   ├── three-cad-viewer.css
│   └── index.d.ts
├── cordis.patch.yml       # bundle patch: inserts `id: model-viewer`
├── package.json           # type: module; dsh.bundle.patch + dsh.client.web
├── README.md              # English documentation
├── README.zh-CN.md        # Chinese documentation
├── CHANGELOG.md
├── LICENSE
├── .gitignore             # excludes node_modules/, the data/ library and backups
└── .gitattributes         # LF line endings; the vendored bundle is not diffed
```

How the halves connect:

- `cordis.patch.yml` inserts the plugin as `model-viewer`; dsh loads `lib/index.js` on the server and, because `dsh.client.platform` is `web`, loads `lib/client.js` into the browser as a `window.__ModuleLoader__` module (client id `dsh-model-viewer`).
- The server registers a prefix route for the assets and one for the model API, and registers both tools on `ctx.tools`.
- The client registers a `conversation.view` slot (`id: "model"`, `order: 21`) for the tab and a `conversation.chat.turnTail` slot for the inline card, and talks to the API with plain `fetch`.

## Development

There is no bundler and no compile step.

- **Server changes** (`lib/index.js`, `lib/cadquery_build.py`) need a **restart of `dsh web`**; the web app runs with HMR disabled, so a change is not picked up live. `lib/cadquery_export.py` is the exception: it is started as a fresh process per export, so edits take effect immediately.
- **Client changes** (`lib/client.js`) are loaded by the browser at page load — reload the GUI. `lib/client.js` is a pre-bundled `window.__ModuleLoader__` module (its own file, not an npm package), so editing it directly is the intended workflow.

Three scripts under `dev/` verify the plugin on their own:

```bash
node dev/route-test.mjs           # mounts the plugin on a fake ctx, drives /formats and all 10 real exports
node dev/client-render-test.mjs   # renders the client with fake React/DOM, drives menu -> export -> download
powershell -File dev/restart-verify.ps1   # preflight + restart + health checks + rollback
```

`restart-verify.ps1` kills the running dsh — and therefore the agent session that launched it — so start it **detached**; it appends everything it learns to `dev/restart-log.log`:

```powershell
Invoke-CimMethod -ClassName Win32_Process -MethodName Create `
  -Arguments @{ CommandLine = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\AI\Plugins\dsh-model-viewer\dev\restart-verify.ps1' }
```

Besides the two base routes, its health check really downloads an STL / STEP / SVG / DXF / 3MF / VTP and asserts the byte count and headers; if anything fails it writes a disable patch and restarts (`RESULT=plugin-rolled-back`) so the GUI stays up.

Safe restart procedure — a plugin that throws during load takes the whole tree down and the GUI with it:

1. **Preflight** the plugin in isolation: import it in a small ESM script and check `name`, `inject` and that `Config` parses. Do this **before** touching the running dsh.
2. **Stop** the running dsh web process and wait for the port (default `3080`) to be released.
3. **Start** it again detached, with stdout/stderr redirected to a log file. The restart helper must live outside the dsh process tree, otherwise stopping dsh kills the helper too.
4. **Health-check** with the two `curl` probes from [Installation](#enable-and-verify) — check the **content type**, since the SPA fallback returns `200 text/html` for unknown paths.
5. **If the plugin fails to load**, roll back: write a disable patch and restart with it,

   ```yaml
   - id: model-viewer
     disabled: true
   ```

   ```bash
   dsh --profile web --patch disable.yml --dump-config   # confirm the plugin is gone
   ```

   Then read the tail of the startup log to report the actual error.

Keeping the plugin honest while changing it:

- `inject` must list **every** `ctx.*` service used in `apply` (`webServer`, `tools`); a missing entry throws `cannot get property "X" without inject` and fails the whole load.
- `schemastery` object fields are optional by default — there is no `.optional()`; express defaults with `.default()`.
- Routes registered inside `ctx.effect` must return a disposer (the plugin returns one closure that unregisters both routes).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| No **3D模型** tab | The client half did not load, or the plugin is not in `dsh.profile.bundles`. Check `dsh --profile web --dump-config` and the browser console. |
| `/3dmodel/api/items` returns `200 text/html` | The plugin is not mounted; you are seeing the SPA fallback. Check the startup log for a load error. |
| Viewer stays blank | The `/tcv/three-cad-viewer.esm.min.js` route failed (check its content type) or the browser blocked the dynamic `import()`. A load failure renders a `three-cad-viewer 加载失败: …` message in the panel. |
| `build_3dmodel` fails immediately | `cadqueryPython` points at an interpreter without CadQuery. Point it at a venv that has `cadquery` installed. |
| `build_3dmodel` fails with a DLL/import error on Windows | The OCCT/VTK conflict `lib/cadquery_build.py` guards against — make sure the import order in that file was not changed. |
| Saving a model returns `500` | Body larger than `maxBodyBytes`, or `dataDir` is not writable. |
| Export returns `500` with a CadQuery error | `cadqueryPython` points at an interpreter without CadQuery (the export route shares it with `build_3dmodel`). |
| An export is slow or times out | A mesh-only entry exporting STEP/BREP has to sew every triangle into a B-Rep (seconds for ~10k faces, longer beyond); raise `cadqueryExportTimeout`, use a mesh format (STL/3MF), or create the model with `build_3dmodel` so the source is kept and the export becomes exact and fast. |
| The exported STEP opens as a pile of triangles | The entry is mesh-only, so STEP/BREP were rebuilt from its triangles. Rebuild the model from a CadQuery script to get real surfaces. |
| A mesh-only SVG has no dashed hidden lines | Hidden-line removal over a triangle soup is impractically slow, so mesh-only entries use a silhouette + feature-edge projection; entries with source still get CadQuery's full HLR drawing. |
| Picking a format downloads nothing | The export dialog shows the reason (e.g. a wrong CadQuery interpreter path). You can also open `/3dmodel/api/items/<id>/export?format=STEP` directly to read the server's JSON error. |
| The same model appears twice | De-duplication keys on **geometry + title**; two entries with different titles (or different meshes) are intentionally distinct. |
| The library is empty after moving the plugin | `dataDir` defaults to `<plugin>/data`; installing the plugin under a different path starts a fresh, empty library. Copy the old `data/` across, or point `dataDir` at it. |
| `cannot get property "…" without inject` in the log | A `ctx` service is used but not declared in `inject`. |
| Changes to `lib/index.js` have no effect | `dsh web` was not restarted. |

## Third-party notices

- **[three-cad-viewer](https://github.com/bernhard-42/three-cad-viewer)** — MIT, © Bernhard Walter. The prebuilt ESM bundle in `assets/` is vendored so the plugin is self-contained and needs no build step; it embeds **three.js** (MIT, © Three.js Authors, r184). See [`assets/README.md`](assets/README.md).
- The upstream viewer is used unmodified; the integration (localisation, layout, hidden screenshot button, camera bindings) lives entirely in `lib/client.js`.
- **[CadQuery](https://github.com/CadQuery/cadquery)** — Apache License 2.0, © 2015 Parametric Products Intellectual Holdings, LLC. It powers the `build_3dmodel` tool and every export (model library and workbench): `lib/cadquery_build.py` (script → mesh) and `lib/cadquery_export.py` (model → STEP/BREP/STL/3MF/AMF/VRML/VTP/TJS/SVG/DXF) call nothing but its public API.
  - **CadQuery is not vendored or bundled.** The plugin invokes the interpreter you configure in `cadqueryPython`, i.e. the CadQuery **you** installed (the development environment runs Python 3.12 + `cadquery` 2.4.0 + `cadquery-ocp` 7.7.2 + VTK 9.7.0 + `ezdxf` 1.4.4). Without it, `build_3dmodel` and the export routes return an error carrying the install command; `add_3dmodel` and browsing the library keep working. Install steps: [Installing CadQuery](#installing-cadquery-the-agent-does-it).
  - Components reached through CadQuery and actually exercised by the export paths: **cadquery-ocp** (Apache-2.0, CadQuery's Python bindings to Open CASCADE Technology; **OCCT** itself is LGPL-2.1 with an exception), **ezdxf** (MIT, © 2020 Manfred Moitzi, DXF output) and **VTK** (BSD, © Ken Martin, Will Schroeder, Bill Lorensen, VTP output).
    - Note: **VTK is not in cadquery's dependency list**, yet `cadquery 2.4.0`'s `occ_impl/exporters` imports `vtkmodules` at import time, so it has to be installed alongside (`pip install cadquery vtk`).
  - All names and trademarks belong to their respective owners; this plugin is not affiliated with, or endorsed by, the CadQuery project.

## License

[MIT](LICENSE) © 2026 CMoyuer
