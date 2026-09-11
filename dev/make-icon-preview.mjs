// Builds dev/icon-preview.html: three-cad-viewer's own toolbar icons next to the
// injected 导出 icon, all with the viewer's real CSS variables and .tcv_btn sizing.
// Usage: node dev/make-icon-preview.mjs   (then screenshot the HTML with headless Chrome)
import { readFileSync, writeFileSync } from "node:fs";

const css = readFileSync(new URL("../assets/three-cad-viewer.css", import.meta.url), "utf8");
const names = ["select", "properties", "distance", "pin", "help", "reset", "front"];
const vars = [];
for (const n of names) {
  const m = new RegExp(`--tcv-icon-${n}:\\s*(url\\("[^"]+"\\))`).exec(css);
  if (m) vars.push(`  --tcv-icon-${n}: ${m[1]};`);
}
// The 导出 icon is read straight out of lib/client.js, so this preview can never
// drift from the icon the plugin actually injects.
const client = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const iconMatch = /\.tcv_button_export\{background-image:url\(\\?"([^"]+?)\\?"\)/.exec(client);
if (!iconMatch) throw new Error("could not find .tcv_button_export in lib/client.js");
const exportIcon = `url("${iconMatch[1].replace(/\\+$/, "")}")`;

// Same order as the real toolbar: the viewer's action icons, then our export
// button (it is injected just before help), then help / reset / front.
const cells = ["select", "properties", "distance", "pin", null, "help", "reset", "front"]
  .map((n) =>
    n === null
      ? `      <span class="frame"><input type="button" class="tcv_reset tcv_btn tcv_button_export" /></span>`
      : `      <span class="frame"><input type="button" class="tcv_reset tcv_btn tcv_button_${n}" /></span>`,
  )
  .join("\n");

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
${vars.join("\n")}
        --dmv-icon-export: ${exportIcon};
      }
      body { margin: 0; background: #ffffff; }
      .row { display: flex; align-items: center; padding: 4px 6px; }
      /* copied verbatim from three-cad-viewer.css */
      .tcv_btn { width: 30px; height: 30px; border: 0px; display: inline-block; vertical-align: middle;
        background-color: transparent; background-repeat: no-repeat; background-position: center; padding: 0px; }
      .frame { width: fit-content; height: fit-content; display: inline-block; border: 1px solid transparent;
        margin-left: 1px; margin-right: 1px; }
${names.map((n) => `      .tcv_button_${n} { background-image: var(--tcv-icon-${n}); }`).join("\n")}
      .tcv_button_export { background-image: var(--dmv-icon-export); }
    </style>
  </head>
  <body>
    <div class="row">
${cells}
    </div>
  </body>
</html>
`;

writeFileSync(new URL("./icon-preview.html", import.meta.url), html, "utf8");
console.log(`wrote icon-preview.html with ${names.length} viewer icons + our export icon`);
