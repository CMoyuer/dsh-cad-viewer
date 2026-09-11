# Third-party notices

This project is MIT licensed — see [LICENSE](LICENSE). The components below are
either redistributed with it or called by it; their own terms govern them.

## Redistributed

- **[three-cad-viewer](https://github.com/bernhard-42/three-cad-viewer)** — MIT, © Bernhard Walter.
  A prebuilt ESM bundle is vendored in `assets/` so the plugin is self-contained
  and needs no build step; the server half serves it from there. The upstream code
  is unmodified — everything this plugin adds lives in `lib/client.js`.
- **[three.js](https://github.com/mrdoob/three.js)** — MIT, © 2010-2026 Three.js Authors (r184).
  Embedded in the three-cad-viewer bundle above.

Exact files, upstream versions and update instructions: [`assets/README.md`](assets/README.md).

## Called, not redistributed

- **[CadQuery](https://github.com/CadQuery/cadquery)** — Apache License 2.0, © 2015 Parametric Products Intellectual Holdings, LLC.
  Used by the `build_3dmodel` tool and by every export path (`lib/cadquery_build.py`,
  `lib/cadquery_export.py`). CadQuery is **not** bundled: the plugin runs the
  interpreter named by the `cadqueryPython` setting, so it uses the copy installed
  in your own environment.
  - **cadquery-ocp** — Apache-2.0, CadQuery's Python bindings to Open CASCADE
    Technology; **OCCT** itself is LGPL-2.1 with an exception.
  - **ezdxf** — MIT, © 2020 Manfred Moitzi (DXF writer).
  - **VTK** — BSD, © Ken Martin / Will Schroeder / Bill Lorensen (VTP writer). VTK is
    missing from CadQuery's dependency metadata, yet `cadquery.occ_impl.exporters`
    imports it at module level, so `pip install cadquery vtk` is what makes
    `import cadquery` work at all.

All names and trademarks belong to their respective owners. This plugin is not
affiliated with, or endorsed by, any of the projects listed above.
