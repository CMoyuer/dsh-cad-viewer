// Tool-level test for dsh-cad-viewer without starting dsh: fakes ctx, mounts the
// plugin against a THROWAWAY dataDir, then drives the agent tools directly.
// The real <plugin>/data library is never touched.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { apply, Config } from "../lib/index.js";

const dataDir = await mkdtemp(join(tmpdir(), "dsh-cad-viewer-tool-test-"));

const routes = [];
const tools = [];
const ctx = {
  logger: { info: () => {}, warn: (...a) => console.log("[warn]", ...a), debug: () => {}, error: () => {} },
  effect(fn) { return fn(); },
  webServer: { register(spec) { routes.push(spec); return () => {}; } },
  tools: { register(tool) { tools.push(tool); } },
};
apply(ctx, Config({ dataDir }));

const tool = (n) => tools.find((t) => t.name === n);

function request(method, url, body) {
  const chunks = [];
  const req = new Readable({ read() {} });
  req.method = method;
  req.url = url;
  if (body !== undefined) req.push(Buffer.from(JSON.stringify(body)));
  req.push(null);
  const res = {
    status: 0,
    headers: null,
    headersSent: false,
    writeHead(status, headers) { this.status = status; this.headers = headers || {}; this.headersSent = true; },
    end(payload) { if (payload !== undefined) chunks.push(Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload))); },
  };
  return Promise.resolve().then(async () => {
    const pathname = new URL(url, "http://localhost").pathname;
    for (const route of routes) {
      if (!pathname.startsWith(route.path)) continue;
      await route.handler(req, res);
      return { status: res.status, headers: res.headers || {}, body: Buffer.concat(chunks) };
    }
    return { status: 404, headers: {}, body: Buffer.alloc(0) };
  });
}

/** Minimal cad-format Shape: one triangle, offset so two models are never identical. */
const shape = (dx = 0) => ({
  version: 3,
  parts: [
    {
      name: "Part",
      shape: {
        vertices: [0, 0, 0, 1 + dx, 0, 0, 0, 1, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        edges: [],
      },
    },
  ],
});

const api = "http://localhost/3dmodel/api/items";
const report = [];
const check = (label, ok, detail) => {
  report.push(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail ?? ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail ?? ""}`);
};
const countFiles = async () =>
  (await readdir(dataDir)).filter((f) => f.endsWith(".json") && !f.endsWith(".meta.json")).length;

// 1. registration + descriptions (the only instructions the agent gets)
{
  const names = tools.map((t) => t.name);
  check(
    "five tools registered",
    ["add_3dmodel", "build_3dmodel", "cadquery_env", "list_3dmodels", "delete_3dmodel"].every((n) => names.includes(n)),
    names.join(","),
  );
  const list = tool("list_3dmodels");
  const del = tool("delete_3dmodel");
  check("list_3dmodels is read-only and points at the tab", /3D模型/.test(list.description) && /Read-only/.test(list.description));
  check("list_3dmodels says ids are for delete_3dmodel", /delete_3dmodel/.test(list.description));
  check("list_3dmodels documents its filters", ["query", "folder", "limit"].every((p) => list.parameters.properties[p]));
  check("delete_3dmodel warns there is no undo", /no undo/.test(del.description));
  check("delete_3dmodel explains the ambiguous-title contract", /deletes NOTHING/.test(del.description) && /candidates/.test(del.description));
  check("delete_3dmodel documents all:true", /all/.test(del.parameters.properties.all.description));
  // Editing an entry is the user's call, and the tool description is the only
  // place the agent can learn that re-storing under the same title is NOT a
  // replace (de-duplication keys on geometry + title).
  check(
    "both store tools ask replace-or-copy before editing a stored model",
    ["add_3dmodel", "build_3dmodel"].every((n) => /ASK FIRST/.test(tool(n).description) && /separate copy/.test(tool(n).description)),
  );
  check(
    "the replace contract names the safe order and the tool that finishes it",
    /modified model first/i.test(tool("add_3dmodel").description) && /delete_3dmodel/.test(tool("build_3dmodel").description),
    `add=${tool("add_3dmodel").description.length} chars`,
  );
  check("delete_3dmodel calls itself the second half of a replace", /second half of a replace/.test(del.description));
}

// 2. empty library
{
  const list = tool("list_3dmodels");
  const empty = await list.execute({});
  check("empty library: ok with total 0", empty.ok === true && empty.total === 0 && (empty.items ?? []).length === 0);
  check("empty library render says so", /还没有任何条目/.test(list.output.render({}, empty)[0].text));
}

// 3. seed three entries (two share a title)
const seeded = {};
{
  const add = tool("add_3dmodel");
  seeded.gearA = await add.execute({ model: shape(0), title: "齿轮" });
  seeded.bracket = await add.execute({ model: shape(5), title: "支架" });
  seeded.gearB = await add.execute({ model: shape(9), title: "齿轮" });
  check(
    "three entries stored",
    seeded.gearA.ok && seeded.bracket.ok && seeded.gearB.ok && new Set([seeded.gearA.id, seeded.bracket.id, seeded.gearB.id]).size === 3,
    [seeded.gearA.id, seeded.bracket.id, seeded.gearB.id].join(" "),
  );
}

// 4. listing the whole library
{
  const list = tool("list_3dmodels");
  const all = await list.execute({});
  check("list returns every entry", all.ok === true && all.total === 3 && all.matched === 3 && all.shown === 3, `total=${all.total} matched=${all.matched}`);
  check(
    "each row carries id, counts and an ISO timestamp",
    all.items.every((it) => it.id && it.parts === 1 && it.triangles === 1 && /^\d{4}-\d{2}-\d{2}T/.test(it.createdAt)),
    JSON.stringify(all.items[0]),
  );
  check("mesh-only entries are marked hasSource:false", all.items.every((it) => it.hasSource === false));
  check("entries are oldest first", all.items[0].createdAt <= all.items[2].createdAt, `${all.items[0].createdAt} .. ${all.items[2].createdAt}`);
  const rendered = list.output.render({}, all)[0].text;
  check("render names every entry with its id", all.items.every((it) => rendered.includes(it.id)) && /仅有网格/.test(rendered), rendered.split("\n")[0]);
}

// 5. query filter
{
  const list = tool("list_3dmodels");
  const hit = await list.execute({ query: "齿轮" });
  check("query filters by title", hit.ok === true && hit.matched === 2 && hit.total === 3, `matched=${hit.matched}`);
  const miss = await list.execute({ query: "没有这个模型" });
  check("no match is not an error", miss.ok === true && miss.matched === 0 && (miss.items ?? []).length === 0);
  check("no-match render mentions the filter", /没有匹配/.test(list.output.render({}, miss)[0].text));
}

// 6. folder filter (folders are created/moved through the HTTP routes)
{
  const created = await request("POST", `${api}/folders`, { name: "零件" });
  const folder = JSON.parse(created.body.toString()).folder;
  const moved = await request("PATCH", `${api}/${seeded.bracket.id}`, { folder: folder.id });
  check("HTTP folder create + move work", created.status === 200 && moved.status === 200, `folder=${folder?.id}`);

  const list = tool("list_3dmodels");
  const inFolder = await list.execute({ folder: "零件" });
  check("folder filter matches by name", inFolder.matched === 1 && inFolder.items[0].id === seeded.bracket.id, `matched=${inFolder.matched}`);
  check("folder path is resolved on the row", inFolder.items[0].folderPath === "零件", JSON.stringify(inFolder.items[0].folderPath));
  const byId = await list.execute({ folder: folder.id });
  check("folder filter matches by id too", byId.matched === 1 && byId.items[0].id === seeded.bracket.id);
  const root = await list.execute({ folder: "/" });
  check("'/' selects the unfiled root entries", root.matched === 2, `matched=${root.matched}`);
  const withFolders = await list.execute({});
  check(
    "the folder list carries path and count",
    withFolders.folders.some((f) => f.name === "零件" && f.path === "零件" && f.count === 1),
    JSON.stringify(withFolders.folders),
  );
  check("render lists the folders", /文件夹：零件/.test(list.output.render({}, withFolders)[0].text));
}

// 7. limit
{
  const list = tool("list_3dmodels");
  const limited = await list.execute({ limit: 1 });
  check("limit caps the rows but not matched", limited.shown === 1 && limited.matched === 3 && limited.items.length === 1);
  check("render says the list was truncated", /只列出前 1 个/.test(list.output.render({}, limited)[0].text));
}

// 8. the HTTP list keeps its original contract
{
  const r = await request("GET", api);
  const json = JSON.parse(r.body.toString());
  check(
    "HTTP list still returns its original fields",
    r.status === 200 &&
      json.items.length === 3 &&
      json.items.every((it) => it.id && "title" in it && "sessionId" in it && "workspace" in it && "folder" in it && "hasSource" in it),
    Object.keys(json.items[0] ?? {}).join(","),
  );
  check("tool-only fields do not leak into HTTP", json.items.every((it) => !("folderPath" in it) && !("triangles" in it)));
}

// 9. delete: refusals
{
  const del = tool("delete_3dmodel");
  const noArgs = await del.execute({});
  check("delete without a selector refuses", noArgs.ok === false && /id 或 title/.test(noArgs.error ?? ""), String(noArgs.error));
  check("...rendered as a failure", /删除失败/.test(del.output.render({}, noArgs)[0].text));

  const missing = await del.execute({ id: "00000000-0000-0000-0000-000000000000" });
  check("unknown id refuses", missing.ok === false && /没有 id/.test(missing.error ?? ""), String(missing.error));

  const ambiguous = await del.execute({ title: "齿轮" });
  check("an ambiguous title deletes nothing", ambiguous.ok === false && (ambiguous.candidates ?? []).length === 2, String(ambiguous.error));
  check("...and the library is untouched", (await countFiles()) === 3, `files=${await countFiles()}`);
  const ambiguousRender = del.output.render({}, ambiguous)[0].text;
  check("...render lists the candidate ids", /删除失败/.test(ambiguousRender) && ambiguous.candidates.every((c) => ambiguousRender.includes(c.id)), ambiguousRender.split("\n")[0]);

  const mismatch = await del.execute({ id: seeded.bracket.id, title: "齿轮" });
  check("id + mismatching title refuses", mismatch.ok === false && /不一致/.test(mismatch.error ?? ""), String(mismatch.error));
  check("...and deletes nothing", (await countFiles()) === 3);
}

// 10. delete by id
{
  const del = tool("delete_3dmodel");
  const one = await del.execute({ id: seeded.bracket.id });
  check("delete by id removes exactly that entry", one.ok === true && one.deletedCount === 1 && one.deleted[0].id === seeded.bracket.id, JSON.stringify(one.deleted));
  check("...its file is gone", !(await readdir(dataDir)).includes(`${seeded.bracket.id}.json`));
  check("...render confirms with the id", new RegExp(`已从模型库删除 1 个模型.*${seeded.bracket.id}`).test(del.output.render({}, one)[0].text), del.output.render({}, one)[0].text);
  const list = tool("list_3dmodels");
  const after = await list.execute({});
  check("...the library went from 3 to 2", after.total === 2 && after.ok === true);
  check("...the folder itself survived", after.folders.length === 1 && after.folders[0].name === "零件" && after.folders[0].count === 0, JSON.stringify(after.folders));
}

// 11. delete by title, all matches
{
  const del = tool("delete_3dmodel");
  const both = await del.execute({ title: "齿轮", all: true });
  check("all:true deletes every exact title match", both.ok === true && both.deletedCount === 2, JSON.stringify(both.deleted?.map((d) => d.id)));
  check("nothing is left on disk", (await countFiles()) === 0, `files=${await countFiles()}`);
  const list = tool("list_3dmodels");
  const after = await list.execute({});
  check("library reports empty again", after.ok === true && after.total === 0);
}

// 12. a title that only differs in case/spacing still matches
{
  const add = tool("add_3dmodel");
  const del = tool("delete_3dmodel");
  const saved = await add.execute({ model: shape(21), title: "Bracket" });
  const spaced = await del.execute({ title: "  bracket  " });
  check("title matching ignores case and surrounding spaces", spaced.ok === true && spaced.deletedCount === 1 && spaced.deleted[0].id === saved.id, String(spaced.error));
  check("...and the entry is gone", (await countFiles()) === 0);
}

await rm(dataDir, { recursive: true, force: true });

const failed = report.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${report.length - failed}/${report.length} checks passed`);
process.exit(failed ? 1 : 0);
