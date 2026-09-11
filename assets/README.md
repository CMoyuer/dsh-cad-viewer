# Vendored assets

This directory holds a **prebuilt** copy of the [three-cad-viewer](https://github.com/bernhard-42/three-cad-viewer) web bundle. It is committed on purpose: the plugin is self-contained (no build step, no runtime npm dependency on the viewer), and the server half serves these files from here.

| File | Purpose |
|---|---|
| `three-cad-viewer.esm.min.js` | Minified ESM build, loaded by the client half with a dynamic `import()` from `/tcv/three-cad-viewer.esm.min.js`. |
| `three-cad-viewer.css` | The viewer's stylesheet, injected as a `<link rel="stylesheet">` on first use. |
| `index.d.ts` | TypeScript declarations shipped with the upstream build, kept for reference. |

## Provenance and license

- Upstream project: <https://github.com/bernhard-42/three-cad-viewer> — **MIT**, © Bernhard Walter.
- The bundle embeds **three.js** (<https://github.com/mrdoob/three.js>), **MIT**, © 2010-2026 Three.js Authors (`three` r184 per the bundle's own version marker and the license header it carries).
- The upstream code is **unmodified**. Everything this plugin adds — localisation, layout, hidden *Pin as PNG* button, camera bindings, the tab and the inline card — lives in `lib/client.js`.

## Updating the bundle

1. Fetch a release of the upstream package (e.g. `npm pack three-cad-viewer`).
2. Copy `dist/three-cad-viewer.esm.min.js`, `dist/three-cad-viewer.css` and `dist/index.d.ts` from the package into this directory.
3. Reload the GUI and re-check the workbench (toolbar, navigation tree, clipping, measurement) — `lib/client.js` translates the viewer's UI by matching the English strings it renders, so an upstream change to those strings needs a matching update there.
