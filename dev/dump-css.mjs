// Extracts the stylesheet the client half injects, without a browser: the bundle
// is evaluated against a fake DOM and the <style> node it appends is read back.
//
//   node dev/dump-css.mjs <out.css>
//
// Used by dev/make-toolbar-layout.mjs, so the layout check measures the *real*
// plugin CSS rather than a copy that can drift.
import { readFileSync, writeFileSync } from "node:fs";

const styles = [];
const element = () => ({
  dataset: {},
  style: {},
  classList: { add() {}, remove() {}, contains: () => false },
  setAttribute() {},
  getAttribute: () => null,
  appendChild() {},
  removeChild() {},
});

globalThis.window = { __ModuleLoader__: { load() {} }, addEventListener() {}, removeEventListener() {} };
globalThis.document = {
  head: { appendChild: (node) => styles.push(node) },
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: element,
  addEventListener() {},
  removeEventListener() {},
};

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
let def = null;
globalThis.window.__ModuleLoader__.load = (d) => {
  def = d;
};
new Function("window", "document", source)(globalThis.window, globalThis.document);
if (!def) throw new Error("the bundle did not register itself");

// The CSS is injected while the factory body runs, so the factory has to be
// called (with a stub for the two modules it requires).
def.factory((spec) => (spec === "react" ? { createElement: () => ({}), useState: () => [null, () => {}], useRef: () => ({ current: null }), useEffect() {} } : {}));

const css = styles.map((s) => s.textContent || "").join("\n");
if (!css.includes(".tcv_cad_toolbar")) throw new Error("no plugin CSS was captured");
writeFileSync(process.argv[2] ?? new URL("./client.css", import.meta.url), css, "utf8");
console.log(`wrote ${css.length} bytes of plugin CSS`);
