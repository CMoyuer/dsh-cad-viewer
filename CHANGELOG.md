# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-09-11

First public release.

### Added

- **"3D模型" tab** in the dsh conversation view (`conversation.view` slot, `id: "model"`, `order: 21`), registered by the client half with the locale-aware label `3D Model` / `3D模型`.
- **Model library**: folder-scoped grid with nested folders, breadcrumbs and a *返回上一级* card, library-wide search, per-card `⋯` menu (rename / move / delete), double-click rename, drag & drop with a touch long-press path, blank-space context menu (new folder / refresh). Deleting a folder moves its models and child folders up instead of deleting them.
- **Workbench**: one closable tab per model, mounting the upstream three-cad-viewer UI (toolbar, navigation tree, canvas) with a pure-CSS responsive layout and a `ResizeObserver` re-fit; left/right button rotate, middle button pan, wheel zoom.
- **Inline model cards** at the message tail (`conversation.chat.turnTail`) for turns that called a model tool, with collapse, *全屏* (open as a workbench tab) and retry on load failure.
- **Chinese localisation** of the hard-coded English three-cad-viewer UI (labels, tooltips, help table, select options), applied by walking the rendered DOM.
- **`add_3dmodel`** tool: persist a three-cad-viewer `Shape` (cad-format JSON) in the server-side model library and render it as an inline card.
- **`build_3dmodel`** tool: run a CadQuery script through `lib/cadquery_build.py`, tessellate the solid into a `Shape` (smooth per-vertex normals, boundary edges, bounding box) and persist it.
- **Server-side model store**: one JSON file per model plus `folders.meta.json` under `dataDir` (default `<plugin>/data`), shared by every device on the same dsh instance — no IndexedDB, no external service.
- **Content fingerprint** (`h`, SHA-256 over the canonicalised `Shape`) so the same geometry under the same title updates the existing entry instead of creating a duplicate, with a retry loop for concurrent saves and an in-place upgrade pass for entries written by older builds.
- **HTTP API**: `/tcv/<file>` for the vendored three-cad-viewer assets, and `/3dmodel/api/items` (list / create / read / patch / delete) plus `/3dmodel/api/items/folders` (list / create / patch / delete).
- **Vendored three-cad-viewer bundle** in `assets/`, so the plugin is self-contained and needs no build step.
- MIT `LICENSE`, `.gitignore` (excludes `node_modules/`, the `data/` model library and backups), and this changelog.

[Unreleased]: https://github.com/CMoyuer/dsh-3dmodel-viewer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CMoyuer/dsh-3dmodel-viewer/releases/tag/v0.1.0
