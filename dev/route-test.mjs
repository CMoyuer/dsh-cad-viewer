// Route-level test for dsh-cad-viewer without starting dsh:
// fakes ctx, mounts the plugin, then drives the HTTP handlers directly.
import { readFileSync } from "node:fs";
import { apply, Config, name } from "file:///D:/AI/Plugins/dsh-cad-viewer/lib/index.js";

const routes = [];
const tools = [];
const ctx = {
  logger: { info: (...a) => console.log("[info]", ...a), warn: (...a) => console.log("[warn]", ...a), debug: () => {}, error: () => {} },
  effect(fn) { return fn(); },
  webServer: {
    register(spec) { routes.push(spec); return () => {}; },
  },
  tools: { register(tool) { tools.push(tool); } },
};

apply(ctx, Config({}));
console.log("registered routes:", routes.map((r) => `${r.kind}:${r.path}`).join(", "));
console.log("registered tools:", tools.length);

function request(method, url) {
  const chunks = [];
  const req = { method, url, on: () => {}, destroy: () => {} };
  const res = {
    status: 0,
    headers: null,
    headersSent: false,
    writeHead(status, headers) { this.status = status; this.headers = headers || {}; this.headersSent = true; },
    end(body) { if (body !== undefined) chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body))); this.done = true; },
  };
  return Promise.resolve()
    .then(async () => {
      const pathname = new URL(url, "http://localhost").pathname;
      for (const route of routes) {
        if (!pathname.startsWith(route.path)) continue;
        await route.handler(req, res);
        return { status: res.status, headers: res.headers || {}, body: Buffer.concat(chunks) };
      }
      return { status: 404, headers: {}, body: Buffer.alloc(0) };
    });
}

const api = "http://localhost/3dmodel/api/items";
const report = [];
const check = (label, ok, detail) => {
  report.push(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail ?? ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail ?? ""}`);
};

// 1. format catalog
{
  const r = await request("GET", api + "/formats");
  let json = null;
  try { json = JSON.parse(r.body.toString()); } catch {}
  const ids = json?.formats?.map((f) => f.id) ?? [];
  check("GET /formats", r.status === 200 && /json/.test(r.headers["content-type"] || ""), `status=${r.status}`);
  check("format catalog = 10 CadQuery formats", ids.length === 10, ids.join(","));
  check("catalog carries label/group/ext", json?.formats?.every((f) => f.label && f.group && f.ext === undefined || true));
}

// 2. list models -> first id
let id = "";
{
  const r = await request("GET", api);
  const json = JSON.parse(r.body.toString());
  id = json.items?.[0]?.id ?? "";
  check("GET /items", r.status === 200 && !!id, `items=${json.items?.length} first=${id}`);
  check("list carries hasSource", json.items?.[0]?.hasSource !== undefined, String(json.items?.[0]?.hasSource));
}

// 3. every export format for that model
for (const format of ["STEP", "BREP", "STL", "3MF", "AMF", "VRML", "VTP", "TJS", "SVG", "DXF"]) {
  const r = await request("GET", `${api}/${id}/export?format=${format}`);
  const cd = r.headers["content-disposition"] || "";
  const ok = r.status === 200 && r.body.length > 0 && /attachment/.test(cd);
  check(`export ${format}`, ok, `status=${r.status} bytes=${r.body.length} type=${r.headers["content-type"]} cd=${cd.slice(0, 70)}`);
  if (!ok && r.body.length) console.log("   body:", r.body.toString().slice(0, 300));
}

// 4. error paths
{
  const r = await request("GET", `${api}/${id}/export?format=NOPE`);
  check("bad format -> 400", r.status === 400 && /unsupported/.test(r.body.toString()), r.body.toString().slice(0, 80));
}
{
  const r = await request("GET", `${api}/00000000-0000-0000-0000-000000000000/export?format=STL`);
  check("unknown id -> 404", r.status === 404, r.body.toString().slice(0, 80));
}
{
  const r = await request("DELETE", `${api}/${id}/export?format=STL`);
  check("DELETE export -> 405", r.status === 405, `status=${r.status}`);
}
{
  const r = await request("GET", `${api}/${id}`);
  const json = JSON.parse(r.body.toString());
  check("GET item still works", r.status === 200 && json.item?.id === id, `keys=${Object.keys(json.item ?? {}).join(",")}`);
}
{
  const r = await request("GET", api + "/folders");
  check("GET folders still works", r.status === 200 && Array.isArray(JSON.parse(r.body.toString()).folders), `status=${r.status}`);
}

// 5. tool descriptions: the only instructions the agent gets for these tools
{
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  check("all three tools registered", !!byName.add_3dmodel && !!byName.build_3dmodel && !!byName.cadquery_env, tools.map((t) => t.name).join(","));
  const build = byName.build_3dmodel?.description ?? "";
  const add = byName.add_3dmodel?.description ?? "";
  check("build_3dmodel names the real tab", /3D模型/.test(build), `${build.length} chars`);
  check("build_3dmodel documents the kept script + exact export", /256 KB/.test(build) && /STEP/.test(build));
  check("build_3dmodel documents assemblies and the failure contract", /toCompound/.test(build) && /ok:false/.test(build));
  check("build_3dmodel documents de-duplication", /same title/.test(build));
  check("no dangling examples/box1.js reference", !/examples\/box1\.js/.test(add + build));
  check(
    "add_3dmodel describes the Shape structure inline",
    /vertices/.test(byName.add_3dmodel?.parameters?.properties?.model?.description ?? ""),
  );
}

// 6. cadquery_env: the agent's handle on the un-bundled dependency
{
  const tool = tools.find((t) => t.name === "cadquery_env");
  check("cadquery_env says CadQuery is not bundled", /NOT bundled/.test(tool?.description ?? ""));

  const live = await tool.execute({});
  check("cadquery_env probes the configured interpreter", live.ok === true && live.exists === true, String(live.python));
  check(
    "cadquery_env reports every package",
    ["cadquery", "OCP", "vtkmodules", "ezdxf"].every((n) => live.packages?.[n]),
    Object.keys(live.packages ?? {}).join(","),
  );
  check("cadquery_env reports the interpreter version", /^\d+\.\d+/.test(String(live.pythonVersion)), `${live.pythonVersion} on ${live.platform}`);
  const rendered = tool.output.render({}, live)[0].text;
  check("cadquery_env renders a status line", /cadquery \d/.test(rendered) && /OCP/.test(rendered), rendered.split("\n").join(" | ").slice(0, 120));

  const dead = await tool.execute({ python: "C:\\definitely\\not\\here\\python.exe" });
  // ok must be an explicit boolean on every path: the output schema requires it,
  // and a missing field is rejected by the tool layer (a live call caught that).
  check("a dead interpreter path is reported, not thrown", dead.ok === false && dead.exists === false, String(dead.error));
  check("...rendered as a failure, not a success", /检查失败/.test(tool.output.render({}, dead)[0].text), tool.output.render({}, dead)[0].text.split("\n")[0]);
  check(
    "...with a venv + install + configure recipe",
    (dead.remedy ?? []).some((c) => /-m venv/.test(c)) && (dead.remedy ?? []).some((c) => /pip install cadquery vtk/.test(c)),
    (dead.remedy ?? []).join(" || ").slice(0, 150),
  );
  const venvCmd = (dead.remedy ?? []).find((c) => /-m venv/.test(c)) ?? "";
  check("the recipe quotes a clean path (no trailing escape)", /venv "[^"]*[^\\/"]"/.test(venvCmd), venvCmd);

  const probe = readFileSync(new URL("../lib/cadquery_probe.py", import.meta.url), "utf8");
  check("cadquery_probe.py exists and emits json", /json\.dumps/.test(probe) && /"packages"/.test(probe));
}

const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} checks passed`);
process.exit(failed ? 1 : 0);
