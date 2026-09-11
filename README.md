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

- a **model library** — folders, library-wide search, drag & drop, rename/move/delete;
- a **workbench** — the upstream [three-cad-viewer](https://github.com/bernhard-42/three-cad-viewer) UI (toolbar, navigation tree, canvas) mounted for any model in the library.

Models are stored as one JSON file per entry on the dsh server, so the same library appears on **every device and browser** that opens the same dsh instance. There is no IndexedDB, no external service and no build step: the three-cad-viewer bundle is vendored in `assets/` and served by the plugin itself.

Two tools are registered for the agent:

| Tool | Purpose |
|---|---|
| `add_3dmodel` | Persist a three-cad-viewer `Shape` (cad-format JSON) and show it as an inline card. |
| `build_3dmodel` | Run a CadQuery script, tessellate the solid, persist the result. |

## Features

**Model library (the tab's default view)**

- Folder navigation: clicking a folder card scopes the grid to that folder, and folders nest freely. While inside a folder a small location strip shows its name (e.g. `零件 /`) and the *返回上一级* card in the grid goes one level up.
- Library-wide search (placeholder `搜索模型、文件夹…`): a hit inside a folder shows the folder path on the card, and opening it leaves search.
- Folder cards and model cards in a responsive grid; the empty state explains how to get content in.
- Per-card `⋯` menu (right-clicking the card does the same): **重命名 / 移动到… / 删除**. Double-clicking a card name renames it in place.
- 移动到… switches the grid into pick mode (a hint bar reads `把「…」移动到：`) — click a folder card or 返回上一级 as the destination, or 取消.
- Drag & drop to move models and folders. Mouse drag uses the HTML5 drag events; on touch devices a long press starts a drag with a floating copy, and *返回上一级* doubles as a drop target to move something up one level.
- Right-click on blank space: **新建文件夹 / 刷新**.
- Deleting a folder never deletes content: its models and child folders move up to the deleted folder's parent.

**Workbench**

- One tab per opened model; every tab can be closed individually (`×`). The active tab and the library share one tab strip.
- Full upstream three-cad-viewer UI: toolbar (view, clipping, measurement, materials, environment, zebra, …), left navigation tree and canvas.
- Rotate with the left or right mouse button, pan with the middle button, zoom with the wheel.
- The layout is pure CSS (flex + `100%`), with no JS size listeners fighting the viewer; a `ResizeObserver` only re-fits the CAD view.
- The upstream *Pin as PNG* toolbar button is hidden — this panel is for viewing models, not exporting screenshots.
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
| CadQuery | **Only for `build_3dmodel`.** A Python environment with `cadquery` (and its `OCP` bindings) installed. `add_3dmodel` needs nothing extra. |

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
| Delete | `⋯` → 删除 |
| New folder | Right-click blank space → 新建文件夹 |
| Search | Type in the search field (searches the whole library) |
| Go up one level | The 返回上一级 card, or drag a card onto it |

### Workbench

Each opened model becomes a tab in the strip at the top; the `×` on a tab closes it and returns to the library. The canvas fills the panel; the viewer's own toolbar and navigation tree behave exactly as upstream, except that the *Pin as PNG* button is removed and the UI text is Chinese.

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

The script is written to a temp file and executed with the configured CadQuery interpreter; the resulting solid is tessellated into a `Shape` (smooth per-vertex normals, boundary edges, bounding box) and stored. A script that fails, or that never assigns `model`, returns `{ "ok": false, "error": … }` — the build is reported as a failure, not as an empty model.

## CadQuery modeling

A `build_3dmodel` script is plain Python. Requirements:

- `import cadquery as cq` and assign **`model`** — a `cq.Workplane` or `cq.Shape` (anything with `.tessellate(tol)`).
- Optional module-level `name` (part name, default `Part`) and `color` (hex, default `#e8b024`).

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
- `lib/cadquery_build.py` imports `vtkmodules.vtkCommonDataModel` **before** `cadquery`. This works around an OCCT/VTK DLL-load conflict seen on Windows hosts; **do not reorder those imports**.
- Build timeout is 60 s per invocation and stdout is capped at 64 MB, so keep tessellation tolerance sane for large assemblies.
- The generated document is written to the model store through the same path as `add_3dmodel`, so it appears in the library and as an inline card.

## HTTP API

All routes are registered on the dsh web server. `apiPrefix` defaults to `/3dmodel` and `assetPrefix` to `/tcv`.

### Assets

| Method | Route | Description |
|---|---|---|
| `GET`/`HEAD` | `/tcv/<file>` | Serve a file from the plugin's `assets/` (the three-cad-viewer ESM bundle, CSS, type definitions). Path traversal is rejected; `maxUrlLength` applies. |

### Models

| Method | Route | Description |
|---|---|---|
| `GET` | `/3dmodel/api/items` | List model metadata. Query: `session=<id>`, `workspace=<path>`, `onlySession=1`. With `onlySession=1` and a `session`, the list is filtered to that session; otherwise a non-empty `workspace` filters by workspace. |
| `POST` | `/3dmodel/api/items` | Store a model. Body: `{ model, title?, name?, sessionId?, workspace?, folder?, height? }`. Returns `{ ok, id, name, title, createdAt }`. |
| `GET` | `/3dmodel/api/items/:id` | Fetch one full entry, including the `Shape` JSON. |
| `PATCH` | `/3dmodel/api/items/:id` | Update `title`, `name` and/or `folder`. |
| `DELETE` | `/3dmodel/api/items/:id` | Delete one entry. |

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
| `cadqueryPython` | `D:\AI\3DModels\.venv\Scripts\python.exe` | Python interpreter with CadQuery, used by `build_3dmodel`. Change this for your machine. |
| `cadqueryTolerance` | `0.1` | Default tessellation tolerance. |

## Data and storage

- One file per model: `<dataDir>/<uuid>.json`, plus `<dataDir>/folders.meta.json` for the folder list.
- Entries carry a **content fingerprint** `h`: the `Shape` JSON is canonicalised (recursively sorted keys, `parts[].name`/`id` dropped) and hashed with SHA-256. Saving the same geometry under the same title returns the existing entry instead of adding a duplicate; the scan is retried a few times so two concurrent saves converge on one file.
- Fingerprints are recomputed at startup, so entries written by an older version are upgraded in place.
- Leftover `*.json.tmp` files from an interrupted write are cleaned up at startup.
- Writes go directly to the final path — there is no atomic rename. **Back up `<dataDir>` if the library matters to you**; the folder is git-ignored in this repository precisely because it is user data.

Deleting a model removes that entry and nothing else: cards already rendered in the conversation keep their geometry, and nothing outside `dataDir` is touched.

## Project layout

```
dsh-model-viewer/
├── lib/
│   ├── index.js           # server half: /tcv + /3dmodel routes, add_3dmodel + build_3dmodel tools
│   ├── client.js          # client half: 3D模型 tab (library/workbench) + inline model card
│   └── cadquery_build.py  # CadQuery script -> three-cad-viewer Shape JSON
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

- **Server changes** (`lib/index.js`, `lib/cadquery_build.py`) need a **restart of `dsh web`**; the web app runs with HMR disabled, so a change is not picked up live.
- **Client changes** (`lib/client.js`) are loaded by the browser at page load — reload the GUI. `lib/client.js` is a pre-bundled `window.__ModuleLoader__` module (its own file, not an npm package), so editing it directly is the intended workflow.

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
| The same model appears twice | De-duplication keys on **geometry + title**; two entries with different titles (or different meshes) are intentionally distinct. |
| The library is empty after moving the plugin | `dataDir` defaults to `<plugin>/data`; installing the plugin under a different path starts a fresh, empty library. Copy the old `data/` across, or point `dataDir` at it. |
| `cannot get property "…" without inject` in the log | A `ctx` service is used but not declared in `inject`. |
| Changes to `lib/index.js` have no effect | `dsh web` was not restarted. |

## Third-party notices

- **[three-cad-viewer](https://github.com/bernhard-42/three-cad-viewer)** — MIT, © Bernhard Walter. The prebuilt ESM bundle in `assets/` is vendored so the plugin is self-contained and needs no build step; it embeds **three.js** (MIT, © Three.js Authors, r184). See [`assets/README.md`](assets/README.md).
- The upstream viewer is used unmodified; the integration (localisation, layout, hidden screenshot button, camera bindings) lives entirely in `lib/client.js`.

## License

[MIT](LICENSE) © 2026 CMoyuer
