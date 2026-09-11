// Builds dev/toolbar-layout.html: the real three-cad-viewer (bundle + CSS) mounted
// inside the real plugin CSS, plus a measurement script. The page prints a RESULT
// line so a headless browser can report the toolbar's box model:
//
//   node dev/make-toolbar-layout.mjs
//   chrome --headless=new --dump-dom --virtual-time-budget=8000 dev/toolbar-layout.html
//
// It measures the space above the toolbar's buttons against the space below them,
// which is what "the gap under the toolbar is bigger than the gap above it" means.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const viewerCss = readFileSync(new URL("../assets/three-cad-viewer.css", import.meta.url), "utf8");
// the plugin's own stylesheet, dumped from the bundle so it cannot drift
execFileSync(process.execPath, [`${here}dump-css.mjs`, `${here}client.css`], { stdio: "inherit" });
const pluginCss = readFileSync(`${here}client.css`, "utf8");
const bundle = new URL("../assets/three-cad-viewer.esm.min.js", import.meta.url).href;

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>${viewerCss}</style>
    <style>${pluginCss}</style>
    <style>body{margin:0;background:#fff;font:12px/1.4 monospace}
      #panel{width:900px;height:420px}
      #out{white-space:pre-wrap;padding:4px 6px}
    </style>
  </head>
  <body>
    <div data-dmv class="dsh-mv-page" id="panel" data-theme="light">
      <div class="dmv-content dmv-content-lib" style="display:flex;flex-direction:column;gap:6px;flex:1;min-height:0">
        <div class="dmv-center" id="host" style="flex:1;min-height:0"></div>
      </div>
    </div>
    <pre id="out">pending</pre>
    <script type="module">
      import { Display, Viewer } from ${JSON.stringify(bundle)};
      const host = document.getElementById("host");
      const options = {
        measureTools: true, selectTool: true, explodeTool: true, zscaleTool: true, zebraTool: true,
        studioTool: true, tools: true, glass: false, pinning: true,
        cadWidth: Math.max(240, 900 - 220), height: Math.max(240, 420 - 44), treeWidth: 220, theme: "browser",
      };
      try {
        const display = new Display(host, options);
        new Viewer(display, options, () => {});
        const round = (v) => Math.round(v * 10) / 10;
        const bar = host.querySelector(".tcv_cad_toolbar");
        const btn = bar && bar.querySelector(".tcv_btn");
        const body = host.querySelector(".tcv_cad_body");
        const box = (el) => { const r = el && el.getBoundingClientRect(); return r ? { top: round(r.top), bottom: round(r.bottom), h: round(r.height) } : null; };
        const cs = getComputedStyle(bar);
        const barBox = box(bar);
        const btnBox = box(btn);
        const bodyBox = box(body);
        // The shape-filter pill lives in .tcv_filter_menu at the top of .tcv_cad_view;
        // the toolbar's old bottom padding existed to keep it clear of the toolbar.
        const pillBox = box(host.querySelector(".tcv_filter_menu")) || box(host.querySelector(".tcv_shape_filter"));
        const bodyStyle = body ? getComputedStyle(body) : null;
        const result = {
          ok: true,
          toolbar: barBox,
          firstButton: btnBox,
          toolbarPadding: cs.padding,
          toolbarMargin: cs.margin,
          gapAbove: round(btnBox.top - barBox.top),
          gapBelow: round(barBox.bottom - btnBox.bottom),
          toolbarToBody: bodyBox ? round(bodyBox.top - barBox.bottom) : null,
          filterPill: pillBox,
          pillBelowToolbar: pillBox ? round(pillBox.top - barBox.bottom) : null,
          bodyOverflow: bodyStyle ? bodyStyle.overflow : null,
          // Vertical separators: the gap from the line to the group on its left
          // against the gap to the group on its right (they should be equal).
          separators: (() => {
            const out = [];
            for (const sep of host.querySelectorAll(".tcv_separator")) {
              const r = sep.getBoundingClientRect();
              const prev = sep.previousElementSibling && sep.previousElementSibling.getBoundingClientRect();
              const next = sep.nextElementSibling && sep.nextElementSibling.getBoundingClientRect();
              const cs = getComputedStyle(sep);
              out.push({
                gapLeft: prev ? round(r.left - prev.right) : null,
                gapRight: next ? round(next.left - (r.left + 1)) : null,
                boxWidth: round(r.width),
                height: round(r.height),
                top: round(r.top - barBox.top),
                margin: cs.margin,
                padding: cs.padding,
              });
            }
            return out;
          })(),
          // Who actually styles the toolbar? Walk every stylesheet.
          rules: (() => {
            const hits = [];
            for (let s = 0; s < document.styleSheets.length; s++) {
              let rules = null;
              try { rules = document.styleSheets[s].cssRules; } catch (err) { hits.push("sheet " + s + ": unreadable"); continue; }
              for (const rule of rules) {
                if (!rule.selectorText || rule.selectorText.indexOf("tcv_cad_toolbar") < 0) continue;
                if (!/padding|margin/.test(rule.style.cssText)) continue;
                hits.push("sheet " + s + " " + rule.selectorText + " { " + rule.style.cssText + " }");
              }
            }
            return hits;
          })(),
        };
        document.getElementById("out").textContent = "RESULT " + JSON.stringify(result);
        document.title = "ready";
      } catch (err) {
        document.getElementById("out").textContent = "RESULT " + JSON.stringify({ ok: false, error: String(err && err.message || err) });
      }
    </script>
  </body>
</html>
`;

writeFileSync(`${here}toolbar-layout.html`, html, "utf8");
console.log("wrote toolbar-layout.html (viewer CSS + plugin CSS inlined)");
