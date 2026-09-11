// Client-half render test for dsh-cad-viewer — no browser involved.
//
// The bundle is a `window.__ModuleLoader__.load({ factory })` script, so it is
// evaluated with a fake window/document and a minimal React (createElement +
// useState/useRef/useEffect). The hook state is kept between "renders" so the
// card menu -> 导出 submenu -> download chain can actually be driven:
//
//   render -> open the ⋯ menu -> click 导出 -> click STEP -> inspect the URL,
//   the dialog and the anchor the browser would download through.
import { readFileSync } from "node:fs";

const results = [];
const check = (label, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
};

// ---------------------------------------------------------------------------
// fake React: element objects, hook cells kept per render
// ---------------------------------------------------------------------------
const cells = [];
let cursor = 0;
const effects = [];
const react = {
  createElement(type, props, ...children) {
    const flat = [];
    const push = (c) => {
      if (Array.isArray(c)) c.forEach(push);
      else if (c !== null && c !== undefined && c !== false && c !== true) flat.push(c);
    };
    push(children);
    return { type, props: props || {}, children: flat };
  },
  useState(init) {
    const i = cursor++;
    if (!(i in cells)) cells[i] = typeof init === "function" ? init() : init;
    return [cells[i], (v) => { cells[i] = typeof v === "function" ? v(cells[i]) : v; }];
  },
  useRef(init) {
    const i = cursor++;
    if (!(i in cells)) cells[i] = { current: init };
    return cells[i];
  },
  useEffect(fn) { effects.push(fn); },
  useMemo(fn) { return fn(); },
  useCallback(fn) { return fn; },
};

// ---------------------------------------------------------------------------
// fake DOM / window
// ---------------------------------------------------------------------------
const fetchCalls = [];
let exportStatus = 200;

function jsonResponse(data) {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => data };
}
const FORMATS = {
  formats: [
    { id: "STEP", ext: ".step", label: "STEP", desc: "AP214 实体", group: "精确几何" },
    { id: "BREP", ext: ".brep", label: "BREP", desc: "OCCT B-Rep", group: "精确几何" },
    { id: "STL", ext: ".stl", label: "STL", desc: "三角网格", group: "网格" },
    { id: "3MF", ext: ".3mf", label: "3MF", desc: "3D 制造", group: "网格" },
    { id: "AMF", ext: ".amf", label: "AMF", desc: "增材制造", group: "网格" },
    { id: "VRML", ext: ".wrl", label: "VRML", desc: "虚拟现实", group: "网格" },
    { id: "VTP", ext: ".vtp", label: "VTP", desc: "VTK PolyData", group: "网格" },
    { id: "TJS", ext: ".json", label: "TJS", desc: "three.js 网格", group: "网格" },
    { id: "SVG", ext: ".svg", label: "SVG", desc: "二维投影", group: "二维图纸" },
    { id: "DXF", ext: ".dxf", label: "DXF", desc: "二维图纸", group: "二维图纸" },
  ],
};
const MODELS = { items: [{ id: "m1", title: "测试模型", createdAt: 1, folder: "", hasSource: true }] };

function fakeFetch(url) {
  fetchCalls.push(String(url));
  if (String(url).includes("/export")) {
    if (exportStatus !== 200) {
      return Promise.resolve({
        ok: false, status: exportStatus,
        headers: { get: () => null },
        json: async () => ({ ok: false, error: "CadQuery 未安装" }),
      });
    }
    return Promise.resolve({
      ok: true, status: 200,
      headers: {
        get: (h) => (String(h).toLowerCase() === "content-disposition"
          ? "attachment; filename=\"test.step\"; filename*=UTF-8''%E6%B5%8B%E8%AF%95.step"
          : null),
      },
      blob: async () => ({ size: 123, type: "application/step" }),
    });
  }
  if (String(url).includes("/formats")) return Promise.resolve(jsonResponse(FORMATS));
  if (String(url).includes("/folders")) return Promise.resolve(jsonResponse({ folders: [] }));
  return Promise.resolve(jsonResponse(MODELS));
}

const appended = [];
// the model-library panel the blank-space menu is confined to
const PANEL = { left: 290, top: 100, right: 1432, bottom: 880 };
const listeners = new Map();
const styles = [];
const panelNode = { getBoundingClientRect: () => PANEL };
const fakeDoc = {
  head: { appendChild(node) { styles.push(node); } },
  body: {
    classList: { add() {}, remove() {} },
    appendChild(node) { appended.push(node); },
    removeChild() {},
  },
  querySelector(sel) {
    if (sel === ".dsh-mv-page") return { nodeType: 1, classList: { contains: () => false } };
    if (String(sel).includes("dmv-content-lib")) return panelNode;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    const list = listeners.get(type) || [];
    const at = list.indexOf(fn);
    if (at >= 0) list.splice(at, 1);
  },
  createElement(tag) {
    return {
      tagName: String(tag).toUpperCase(),
      style: {}, dataset: {}, children: [],
      __listeners: {},
      classList: { add() {}, remove() {}, contains: () => false },
      setAttribute(name, value) { this[name] = value; },
      getAttribute(name) { return this[name] === undefined ? null : this[name]; },
      addEventListener(type, fn) { (this.__listeners[type] = this.__listeners[type] || []).push(fn); },
      removeEventListener() {},
      appendChild(node) { if (this.children.indexOf(node) < 0) this.children.push(node); node.parentNode = this; return node; },
      removeChild() {}, remove() {},
      click() { this.clicked = true; },
    };
  },
};
/** Fire a document-level contextmenu the way the plugin's capture listener sees it. */
function fireContextMenu(x, y, target) {
  const event = {
    clientX: x,
    clientY: y,
    target: target || { classList: { contains: () => false }, parentElement: null },
    defaultPrevented: false,
    preventDefault() { event.defaultPrevented = true; },
    stopPropagation() {},
  };
  // The fake React re-runs every effect on each render, so several handlers pile
  // up; React itself would keep only the newest one.
  const list = listeners.get("contextmenu") || [];
  if (list.length) list[list.length - 1](event);
  return event;
}

globalThis.window = {
  __ModuleLoader__: { load: (def) => { captured = def; } },
  fetch: fakeFetch,
  addEventListener() {}, removeEventListener() {},
  innerWidth: 1440, innerHeight: 900,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
};
globalThis.document = fakeDoc;
globalThis.URL.createObjectURL = (blob) => { lastObjectUrl = "blob:fake-" + (blob && blob.size); return lastObjectUrl; };
globalThis.URL.revokeObjectURL = () => {};
let lastObjectUrl = null;
let captured = null;

// ---------------------------------------------------------------------------
// load the bundle
// ---------------------------------------------------------------------------
const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
new Function("window", "document", "URL", "CustomEvent", "MutationObserver", "ResizeObserver", "requestAnimationFrame", source)(
  globalThis.window, fakeDoc, globalThis.URL, class CustomEvent {}, undefined, undefined, undefined,
);
check("bundle registers itself", !!captured && captured.id === "dsh-cad-viewer", captured && captured.id);

const mod = captured.factory((spec) => {
  if (spec === "react") return react;
  return {}; // dsh-client-runtime / dsh-client-locale are unused at render time
});
const ModelViewTab = mod.ModelViewTab;
check("ModelViewTab exported", typeof ModelViewTab === "function");

// ---------------------------------------------------------------------------
// viewer toolbar button (injected into three-cad-viewer's own toolbar)
// ---------------------------------------------------------------------------
{
  /** A toolbar whose only sibling is the viewer's help button. */
  const makeBar = () => {
    const bar = {
      className: "tcv_cad_toolbar",
      children: [],
      lastChild: null,
      querySelector(sel) {
        const want = sel.replace(".", "");
        if (want === "dmv-toolbar-export") return bar.children.find((c) => String(c.className).includes("dmv-toolbar-export")) || null;
        if (want === "tcv_button_help") {
          const help = bar.children.find((c) => c.__help);
          return help ? help.children[0] : null;
        }
        return null;
      },
      appendChild(node) {
        const at = bar.children.indexOf(node);
        if (at >= 0) bar.children.splice(at, 1);
        bar.children.push(node);
        node.parentNode = bar;
        bar.lastChild = bar.children[bar.children.length - 1];
        return node;
      },
      insertBefore(node, ref) {
        const at = bar.children.indexOf(ref);
        if (at < 0) return bar.appendChild(node);
        const from = bar.children.indexOf(node);
        if (from >= 0) bar.children.splice(from, 1);
        bar.children.splice(bar.children.indexOf(ref), 0, node);
        node.parentNode = bar;
        bar.lastChild = bar.children[bar.children.length - 1];
        return node;
      },
    };
    // the viewer's help button, in its own .tcv_tooltip wrapper
    const helpInput = { className: "tcv_reset tcv_btn tcv_button_help" };
    const helpWrap = {
      className: "tcv_tooltip",
      __help: true,
      children: [helpInput],
    };
    helpInput.closest = (sel) => (sel === ".tcv_tooltip" ? helpWrap : null);
    bar.appendChild(helpWrap);
    return bar;
  };

  const bar = makeBar();
  const container = { querySelector: (sel) => (sel === ".tcv_cad_toolbar" ? bar : null) };
  let clickedWith = null;
  const tip = mod.ensureToolbarExportButton(container, (el) => { clickedWith = el; });
  const input = tip && tip.children[0] && tip.children[0].children[0];
  check("导出 button injected into the viewer toolbar", !!tip && String(tip.className).includes("dmv-toolbar-export"), tip && tip.className);
  check(
    "it uses the viewer's own button markup",
    !!input && input.className === "tcv_reset tcv_btn tcv_button_export" && tip.children[0].className === "tcv_button_frame",
    input && input.className,
  );
  check("the icon is our own background image", styles.some((s) => /\.tcv_button_export\{background-image:url\("data:image\/svg\+xml/.test(s.textContent || "")), "tcv_button_export -> CSS background-image");
  check("it carries the viewer tooltip", !!tip && /CadQuery/.test(tip.getAttribute("data-tooltip") || ""), tip && tip.getAttribute("data-tooltip"));

  const helpWrap = bar.children.find((c) => c.__help);
  check("it sits just before the help button", bar.children.indexOf(tip) === bar.children.indexOf(helpWrap) - 1, `order=${bar.children.map((c) => c.className).join(" | ")}`);
  check("injection is idempotent", mod.ensureToolbarExportButton(container, () => {}) === tip && bar.children.filter((c) => String(c.className).includes("dmv-toolbar-export")).length === 1);

  tip.__listeners.click[0]({ preventDefault() {}, stopPropagation() {} });
  check("clicking it asks for an export", clickedWith === tip);

  // the viewer re-renders the toolbar and help ends up after our button: the
  // next pass moves the button back in front of it
  bar.appendChild(tip);
  check("order can drift (help after the button)", bar.children.indexOf(tip) > bar.children.indexOf(helpWrap));
  mod.ensureToolbarExportButton(container, () => {});
  check(
    "a later pass re-places it before help",
    bar.children.indexOf(tip) === bar.children.indexOf(helpWrap) - 1 && bar.children.length === 2,
    `order=${bar.children.map((c) => c.className).join(" | ")}`,
  );

  // a fully rebuilt toolbar (our button dropped with the old nodes)
  const fresh = makeBar();
  const created = mod.ensureToolbarExportButton({ querySelector: () => fresh }, () => {});
  const freshHelp = fresh.children.find((c) => c.__help);
  check(
    "a rebuilt toolbar gets a fresh button before help",
    !!created && created !== tip && fresh.children.indexOf(created) === fresh.children.indexOf(freshHelp) - 1,
    `order=${fresh.children.map((c) => c.className).join(" | ")}`,
  );

  // no toolbar (inline card) and no handler: nothing is injected
  check("no toolbar => no button", mod.ensureToolbarExportButton({ querySelector: () => null }, () => {}) === null);
  check("no handler => no button", mod.ensureToolbarExportButton({ querySelector: () => makeBar() }, null) === null);
}

// ---------------------------------------------------------------------------
// render helpers
// ---------------------------------------------------------------------------
const props = { sessionId: "s1", useSessions: true, useWorkspaces: true, ctx: null };
/** Call the function components in the tree, so class-name lookups reach the DOM. */
function deepRender(node) {
  if (Array.isArray(node)) return node.map(deepRender);
  if (!node || typeof node !== "object") return node;
  if (typeof node.type === "function") return deepRender(node.type(node.props));
  return Object.assign({}, node, { children: (node.children || []).map(deepRender) });
}
function render() {
  cursor = 0;
  const tree = deepRender(ModelViewTab(props));
  while (effects.length) {
    const fn = effects.shift();
    const cleanup = fn();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  }
  return tree;
}
const cleanups = [];
function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return; }
  visit(node);
  (node.children || []).forEach((n) => walk(n, visit));
}
function findAll(tree, pred) {
  const out = [];
  walk(tree, (node) => { if (node.type !== undefined && pred(node)) out.push(node); });
  return out;
}
const byClass = (cls) => (node) => typeof node.props.className === "string" && node.props.className.split(/\s+/).includes(cls);
const click = (node, extra) => node.props.onClick(Object.assign({ stopPropagation() {}, preventDefault() {} }, extra));
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// drive the UI
// ---------------------------------------------------------------------------
let tree = render();
await tick();
tree = render();

const menuBtn = findAll(tree, byClass("dmv-menu-btn"))[0];
check("card ⋯ button exists", !!menuBtn);

// ---- the card menu is anchored by how it was opened ----------------------
const modelCardNode = (t) =>
  findAll(t, (n) => n.props.className === "dmv-card")[0];
const rightClick = (node, x, y) =>
  node.props.onContextMenu({ clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} });
const cardMenu = (t) => findAll(t, byClass("dmv-menu-fixed"))[0];
const menuXY = (node) => [Number(String(node.props.style.left).replace("px", "")), Number(String(node.props.style.top).replace("px", ""))];

rightClick(modelCardNode(tree), 1000, 300);
tree = render();
let menu = cardMenu(tree);
check("right-click opens the card menu", !!menu);
check("menu sits at the pointer", !!menu && menuXY(menu).join(",") === "1000,300", menu && menuXY(menu).join(","));

rightClick(modelCardNode(tree), 1430, 890);
tree = render();
menu = cardMenu(tree);
check("a second right-click moves the menu", !!menu);
check("menu is clamped into the viewport", !!menu && menuXY(menu).join(",") === "1300,760", menu && menuXY(menu).join(","));

// a click on blank grid space closes it (that is the grid's own onClick)
findAll(tree, byClass("dmv-grid"))[0].props.onClick();
check("clicking elsewhere closes it", !cardMenu(render()));

// a tap on ⋯ anchors the menu to the button instead
tree = render();
click(findAll(tree, byClass("dmv-menu-btn"))[0], {
  currentTarget: { getBoundingClientRect: () => ({ left: 900, top: 400, right: 924, bottom: 422 }) },
});
tree = render();
menu = cardMenu(tree);
check("⋯ button anchors the menu below itself", !!menu && menuXY(menu).join(",") === "896,426", menu && menuXY(menu).join(","));

const exportItem = findAll(tree, byClass("dmv-menu-sub"))[0];
check("导出 menu item exists", !!exportItem, exportItem && JSON.stringify(exportItem.children.filter((c) => typeof c === "string")));

const fakeMenuNode = {
  closest: (sel) => (sel === ".dmv-menu" ? { getBoundingClientRect: () => ({ left: 1200, top: 600, right: 1300, bottom: 660 }) } : null),
  getBoundingClientRect: () => ({ left: 1200, top: 600, right: 1300, bottom: 660 }),
};

// ---- blank-space menu: confined to the library panel, and exclusive with the
// ---- card menu (right-clicking a card must hide it) ----------------------
const blankMenu = (t) =>
  findAll(t, (n) => typeof n.props.className === "string" &&
    n.props.className.includes("dmv-menu-page") &&
    !n.props.className.includes("dmv-export-menu"))[0];
const blankXY = (node) => [Number(String(node.props.style.left).replace("px", "")), Number(String(node.props.style.top).replace("px", ""))];

const ev = fireContextMenu(600, 400);
tree = render();
check("blank right-click opens the blank menu", !!blankMenu(tree));
check("blank menu sits at the pointer", !!blankMenu(tree) && blankXY(blankMenu(tree)).join(",") === "600,400", blankMenu(tree) && blankXY(blankMenu(tree)).join(","));
check("the click is consumed", ev.defaultPrevented === true);

// near the panel's bottom-right corner (inside it, but with no room for the menu)
fireContextMenu(1420, 870);
tree = render();
check("blank menu is clamped into the library panel", !!blankMenu(tree) && blankXY(blankMenu(tree)).join(",") === `${PANEL.right - 144},${PANEL.bottom - 80}`, blankMenu(tree) && blankXY(blankMenu(tree)).join(","));

// the card menu replaces it
rightClick(modelCardNode(tree), 800, 350);
tree = render();
check("right-clicking a card hides the blank menu", !blankMenu(tree));
check("...and opens the card menu", !!cardMenu(tree));

// outside the library panel / on a field: nothing happens, browser menu kept
const outside = fireContextMenu(100, 50);
check("right-click outside the library panel does nothing", outside.defaultPrevented === false);
const field = fireContextMenu(600, 400, { classList: { contains: () => false }, parentElement: null, closest: () => ({ tagName: "INPUT" }) });
check("right-click in a field keeps the browser menu", field.defaultPrevented === false);

// rebuild the open card menu for the export flow below
tree = render();
findAll(tree, byClass("dmv-grid"))[0].props.onClick();
tree = render();
click(findAll(tree, byClass("dmv-menu-btn"))[0], {
  currentTarget: { getBoundingClientRect: () => ({ left: 900, top: 400, right: 924, bottom: 422 }) },
});
tree = render();
check("card menu open again for the export flow", !!cardMenu(tree));

// hovering 导出 opens the flyout and KEEPS the card menu open, so the pointer
// can travel from the row into the flyout
const leftAnchor = { closest: () => null, getBoundingClientRect: () => ({ left: 300, top: 600, right: 400, bottom: 660 }) };
const byText = (text) => (node) =>
  typeof node.props.className === "string" &&
  node.props.className.includes("dmv-menu-item") &&
  node.children.indexOf(text) >= 0;
const hoverExport = () => findAll(tree, byClass("dmv-menu-sub"))[0].props.onMouseEnter({ currentTarget: leftAnchor, stopPropagation() {} });

hoverExport();
tree = render();
let flyoutOnHover = findAll(tree, byClass("dmv-export-menu"))[0];
check("hover opens the export flyout", !!flyoutOnHover);
check("hover keeps the card menu open", findAll(tree, byClass("dmv-menu-sub")).length === 1);
// room on the right (400 + 4 + 232 < 1440) -> the default side
check("flyout opens on the RIGHT by default", !!flyoutOnHover && Number(String(flyoutOnHover.props.style.left).replace("px", "")) === 404, flyoutOnHover && flyoutOnHover.props.style.left);

// entering any other entry (重命名 / 移动到… / 删除) hides it right away
findAll(tree, byText("重命名"))[0].props.onMouseEnter();
tree = render();
check("entering another entry hides the flyout", !findAll(tree, byClass("dmv-export-menu")).length);
check("the card menu itself stays open", !!findAll(tree, byText("移动到…")).length);

// an anchor near the right edge has no room -> flip to the left
findAll(tree, byClass("dmv-menu-sub"))[0].props.onMouseEnter({ currentTarget: fakeMenuNode, stopPropagation() {} });
tree = render();
flyoutOnHover = findAll(tree, byClass("dmv-export-menu"))[0];
check("flips left when the right side is full", !!flyoutOnHover && Number(String(flyoutOnHover.props.style.left).replace("px", "")) === 1200 - 4 - 232, flyoutOnHover && flyoutOnHover.props.style.left);
// the row anchor (600-6 = 594) would push a 380px-tall flyout past the 900px
// fake viewport, so the first paint is clamped and stays fully visible
check("first paint stays inside the viewport", !!flyoutOnHover && flyoutOnHover.props.style.top === "512px", flyoutOnHover && flyoutOnHover.props.style.top);

// leaving the menu area closes it after the grace period
findAll(tree, byClass("dmv-menu"))[0].props.onMouseLeave();
check("flyout still open during the grace period", !!findAll(render(), byClass("dmv-export-menu"))[0]);
await new Promise((r) => setTimeout(r, 400));
tree = render();
check("leaving the menu closes the flyout", !findAll(tree, byClass("dmv-export-menu")).length);

// a tap (no hover) opens it through onClick — and the card menu must STAY open,
// otherwise a touch user has no way back to 重命名 / 移动到… / 删除
click(findAll(tree, byClass("dmv-menu-sub"))[0], { currentTarget: fakeMenuNode });
tree = render();
check("tap opens the export flyout", !!findAll(tree, byClass("dmv-export-menu"))[0]);
check("tap keeps the card menu open", !!findAll(tree, byText("重命名")).length && !!findAll(tree, byText("删除")).length);
check("formats endpoint requested", fetchCalls.some((u) => u.includes("/items/formats")), fetchCalls.join(" | "));

let flyout = findAll(tree, byClass("dmv-export-menu"))[0];
check("loading state shows the flyout", !!flyout);
await tick();
tree = render();
flyout = findAll(tree, byClass("dmv-export-menu"))[0];
check("export flyout rendered", !!flyout);
const items = flyout ? findAll(flyout, byClass("dmv-export-item")) : [];
check("flyout lists all 10 formats", items.length === 10, `items=${items.length}`);
const groups = flyout ? findAll(flyout, byClass("dmv-export-group")) : [];
check("formats grouped in 3 sections", groups.length === 3, groups.map((g) => g.children[0]).join(","));
const note = flyout ? findAll(flyout, byClass("dmv-export-note"))[0] : null;
check("source-aware hint shown", !!note && /精确几何/.test(String(note.children[0])), note && String(note.children[0]));

const stepItem = items.find((n) => findAll(n, byClass("dmv-export-label"))[0]?.children[0] === "STEP");
check("STEP row present", !!stepItem);
click(stepItem);
tree = render();
const busy = findAll(tree, byClass("dmv-dialog-title"))[0];
check("busy dialog shown", !!busy && String(busy.children[0]) === "正在导出…", busy && String(busy.children[0]));
check("export URL is /export?format=STEP", fetchCalls.some((u) => u === "/3dmodel/api/items/m1/export?format=STEP"), fetchCalls.filter((u) => u.includes("export")).join(" | "));

await tick();
tree = render();
const title = findAll(tree, byClass("dmv-dialog-title"))[0];
check("done dialog shown", !!title && String(title.children[0]) === "导出完成", title && String(title.children[0]));
const anchor = appended[appended.length - 1];
check("download anchor uses the server filename", !!anchor && anchor.download === "测试.step", anchor && anchor.download);
check("anchor points at the blob url", !!anchor && anchor.href === lastObjectUrl, anchor && anchor.href);
check("anchor was clicked", !!anchor && anchor.clicked === true);

// failure path: reopen the flyout and export a format the server rejects
exportStatus = 500;
const menuBtn2 = findAll(tree, byClass("dmv-menu-btn"))[0];
check("card ⋯ button still reachable", !!menuBtn2);
click(menuBtn2);
tree = render();
click(findAll(tree, byClass("dmv-menu-sub"))[0], { currentTarget: fakeMenuNode });
tree = render();
await tick();
tree = render();
const flyout3 = findAll(tree, byClass("dmv-export-menu"))[0];
const stlItem = findAll(flyout3, byClass("dmv-export-item")).find((n) => findAll(n, byClass("dmv-export-label"))[0]?.children[0] === "STL");
click(stlItem);
tree = render();
await tick();
tree = render();
const errTitle = findAll(tree, byClass("dmv-dialog-title"))[0];
check("failure dialog shown", !!errTitle && String(errTitle.children[0]) === "导出失败", errTitle && String(errTitle.children[0]));
const errText = findAll(tree, byClass("dmv-dialog-text")).map((n) => String(n.children[0])).join(" ");
check("failure message surfaces the server error", /CadQuery 未安装/.test(errText), errText);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
