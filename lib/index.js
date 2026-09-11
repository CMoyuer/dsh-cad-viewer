/**
 * dsh-cad-viewer — embed three-cad-viewer as a "模型" tab plus inline cards.
 *
 * Server half. Everything is self-contained:
 *
 *   GET  /tcv/<file>            -> static three-cad-viewer bundle from this
 *                                  plugin's `assets/` dir (esm.min.js, css, d.ts).
 *   GET  /3dmodel/api/items     -> list model metadata (query: session,
 *                                  workspace, onlySession).
 *   POST /3dmodel/api/items     -> persist a model (body carries the Shape JSON).
 *   GET  /3dmodel/api/items/formats -> every export format CadQuery can write.
 *   GET  /3dmodel/api/items/:id -> load one full model (incl. Shape JSON).
 *   GET  /3dmodel/api/items/:id/export?format=STEP -> download that model in one
 *                                  of those formats (CadQuery runs in
 *                                  `cadqueryPython`; see cadquery_export.py).
 *   PATCH  /3dmodel/api/items/:id -> rename / move a model.
 *   DELETE /3dmodel/api/items/:id -> delete one model.
 *
 * Models are stored as JSON files on the server disk (dataDir), so history is
 * shared across every device/terminal hitting the same dsh service — no
 * IndexedDB, no external service.
 *
 * Tool:
 *   add_3dmodel(model, title?, height?) -> persist + ack so the client can
 *   render the model in the "模型" tab and as an inline card. Re-adding the same
 *   geometry under the same title updates the existing entry instead of creating
 *   a duplicate.
 */
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFile, writeFile, mkdir, stat, readdir, unlink } from "node:fs/promises";
import { extname, join, normalize, resolve, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

/** Stable Cordis plugin name. */
export const name = "cad-viewer";

/** Services this plugin needs before mounting. */
export const inject = ["webServer", "tools"];

export const Config = z.object({
  /** Static asset URL prefix for the three-cad-viewer bundle. */
  assetPrefix: z.string().default("/tcv"),
  /** API URL prefix for the model store. */
  apiPrefix: z.string().default("/3dmodel"),
  /** Directory for stored models. When empty, <plugin>/data. */
  dataDir: z.string().default(""),
  /** Max URL tail length. */
  maxUrlLength: z.number().min(32).max(4096).default(2048),
  /** Max JSON request body bytes. */
  maxBodyBytes: z.number().min(1024).max(64 * 1024 * 1024).default(32 * 1024 * 1024),
  /** Python interpreter with CadQuery installed (used by build_3dmodel). */
  cadqueryPython: z.string().default("D:\\AI\\3DModels\\.venv\\Scripts\\python.exe"),
  /** Tessellation tolerance for CadQuery -> mesh. */
  cadqueryTolerance: z.number().min(0.001).max(10).default(0.1),
  /** Max milliseconds one export may take (large mesh -> STEP/BREP is slow). */
  cadqueryExportTimeout: z.number().min(1000).max(3600000).default(300000),
});

/**
 * Every file format CadQuery 2.x can write, in menu order. `id` is the CadQuery
 * export type (also the `?format=` value), `ext` the download extension and
 * `group` the submenu section. Kept server-side so the client menu never drifts
 * from what cadquery_export.py can actually produce.
 */
const EXPORT_FORMATS = [
  { id: "STEP", ext: ".step", label: "STEP", desc: "AP214 实体，通用 CAD 交换", group: "精确几何", mime: "application/step" },
  { id: "BREP", ext: ".brep", label: "BREP", desc: "OCCT 原生 B-Rep", group: "精确几何", mime: "application/octet-stream" },
  { id: "STL", ext: ".stl", label: "STL", desc: "二进制三角网格，3D 打印", group: "网格", mime: "model/stl" },
  { id: "3MF", ext: ".3mf", label: "3MF", desc: "3D 制造格式", group: "网格", mime: "model/3mf" },
  { id: "AMF", ext: ".amf", label: "AMF", desc: "增材制造格式", group: "网格", mime: "application/x-amf" },
  { id: "VRML", ext: ".wrl", label: "VRML", desc: "虚拟现实建模语言", group: "网格", mime: "model/vrml" },
  { id: "VTP", ext: ".vtp", label: "VTP", desc: "VTK XML PolyData", group: "网格", mime: "application/vnd.vtk.polydata+xml" },
  { id: "TJS", ext: ".json", label: "TJS", desc: "three.js JSON 网格", group: "网格", mime: "application/json" },
  { id: "SVG", ext: ".svg", label: "SVG", desc: "二维投影图纸", group: "二维图纸", mime: "image/svg+xml" },
  { id: "DXF", ext: ".dxf", label: "DXF", desc: "二维图纸，CAD 交换", group: "二维图纸", mime: "image/vnd.dxf" },
];

/** Longest CadQuery source we keep alongside a model (for exact exports). */
const MAX_SOURCE_BYTES = 256 * 1024;

/** A download filename that no filesystem will reject. */
function downloadName(title, ext) {
  const base = str(title).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim().slice(0, 120) || "model";
  return base.toLowerCase().endsWith(ext) ? base : base + ext;
}

/** MIME for static assets. */
function staticMime(ext) {
  switch (ext) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".woff":
      return "font/woff";
    case ".ttf":
      return "font/ttf";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

/** True when `candidate` is inside (or equal to) the normalized `rootDir`. */
function withinRoot(rootDir, candidate) {
  const root = normalize(resolve(rootDir));
  const target = normalize(candidate);
  if (target === root) return true;
  return target.startsWith(root + sep);
}

/** Read a JSON request body with a size cap. */
function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    let tooBig = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooBig = true;
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (tooBig) {
        reject(new Error("body too large"));
        return;
      }
      try {
        resolve(data.trim().length > 0 ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/** Extract query params. */
function queryOf(req) {
  try {
    return new URL(req.url ?? "/", "http://localhost").searchParams;
  } catch {
    return null;
  }
}

/** Coerce to safe string. */
function str(v) {
  return v === null || v === undefined ? "" : String(v);
}

export function apply(ctx, config) {
  const assetPrefix = (config.assetPrefix || "/tcv").replace(/\/+$/, "") || "/tcv";
  const apiPrefix = (config.apiPrefix || "/3dmodel").replace(/\/+$/, "") || "/3dmodel";
  const assetDir = resolve(dirname(fileURLToPath(import.meta.url)), "../assets");
  const maxBodyBytes = config.maxBodyBytes;

  // Shared model-store api, used by both the HTTP routes and the tool.
  const store = {
    dataDir: "",
    async init() {
      if (store.dataDir) return;
      // Stable location beside the plugin. (cwd and the first workspace both
      // change between launches, which previously made stored models invisible.)
      const dataDir = config.dataDir || resolve(dirname(fileURLToPath(import.meta.url)), "../data");
      store.dataDir = dataDir;
      await mkdir(dataDir, { recursive: true }).catch(() => {});
      await store.cleanupTmp();
      await store.rehashAll();
    },
    /** Remove orphaned *.json.tmp files left behind by an interrupted write. */
    async cleanupTmp() {
      try {
        const names = await readdir(store.dataDir);
        const done = new Set(names.filter((n) => n.endsWith(".json")));
        for (const n of names) {
          if (!n.endsWith(".json.tmp")) continue;
          if (done.has(n.slice(0, -".tmp".length))) {
            await unlink(join(store.dataDir, n)).catch(() => {});
          }
        }
      } catch {
        /* ignore */
      }
    },
    /**
     * Upgrade stored fingerprints to the current normalisation (older entries
     * hashed the raw key order, which made identical models look different).
     */
    async rehashAll() {
      try {
        for (const id of await store.listIds()) {
          const item = await store.readItem(id);
          if (!item) continue;
          const h = store.contentHash(item.model);
          if (h && item.h !== h) await store.writeItem({ ...item, h });
        }
      } catch {
        /* ignore */
      }
    },

    // ---- folders (a flat list, stored beside the models) --------------------
    /** NOTE: must NOT end in `.json`, or listIds() would treat it as a model. */
    foldersFile() {
      return join(store.dataDir, "folders.meta.json");
    },
    async readFolders() {
      try {
        const data = JSON.parse(await readFile(store.foldersFile(), "utf8"));
        return Array.isArray(data?.folders) ? data.folders : [];
      } catch {
        return [];
      }
    },
    async writeFolders(folders) {
      const clean = (Array.isArray(folders) ? folders : [])
        .filter((f) => f && typeof f.id === "string" && /^[0-9a-f-]{6,}$/i.test(f.id))
        .map((f) => ({
          id: f.id,
          name: str(f.name) || "新建文件夹",
          parent: str(f.parent),
          createdAt: typeof f.createdAt === "number" ? f.createdAt : Date.now(),
        }));
      await writeFile(store.foldersFile(), JSON.stringify({ version: 2, folders: clean }), "utf8");
      return clean;
    },
    /** @param parent - id of the containing folder ("" = root), nested folders allowed. */
    async createFolder(name, parent = "") {
      const folders = await store.readFolders();
      const known = new Set(folders.map((f) => f.id));
      const parentId = str(parent) && known.has(str(parent)) ? str(parent) : "";
      const folder = { id: randomUUID(), name: str(name) || "新建文件夹", parent: parentId, createdAt: Date.now() };
      folders.push(folder);
      await store.writeFolders(folders);
      return folder;
    },
    /**
     * Remove a folder; never delete content — its models and child folders are
     * moved up to the removed folder's parent.
     */
    async deleteFolder(id) {
      const all = await store.readFolders();
      const target = all.find((f) => f.id === id);
      const up = target ? str(target.parent) : "";
      const folders = all
        .filter((f) => f.id !== id)
        .map((f) => (str(f.parent) === id ? { ...f, parent: up } : f));
      await store.writeFolders(folders);
      for (const mid of await store.listIds()) {
        const item = await store.readItem(mid);
        if (item && item.folder === id) await store.writeItem({ ...item, folder: up });
      }
      return true;
    },
    /** True when `maybeAncestor` is `id` or one of its ancestors (cycle guard). */
    async folderDescendsFrom(maybeAncestor, id) {
      let cursor = str(id);
      const all = await store.readFolders();
      for (let hops = 0; hops < 64 && cursor; hops++) {
        if (cursor === maybeAncestor) return true;
        const hit = all.find((f) => f.id === cursor);
        cursor = hit ? str(hit.parent) : "";
      }
      return false;
    },
    itemPath(id) {
      return join(store.dataDir, `${id}.json`);
    },
    async readItem(id) {
      try {
        return JSON.parse(await readFile(store.itemPath(id), "utf8"));
      } catch {
        return null;
      }
    },
    async writeItem(item) {
      await writeFile(store.itemPath(item.id), JSON.stringify(item), "utf8");
    },
    async listIds() {
      try {
        return (await readdir(store.dataDir))
          .filter((f) => f.endsWith(".json") && !f.endsWith(".meta.json"))
          .map((f) => f.slice(0, -".json".length));
      } catch {
        return [];
      }
    },
    /**
     * Content fingerprint of a model, so re-adding the same geometry under the
     * same title updates the existing entry instead of duplicating it.
     * (`model` may arrive with different key order / a different parts[].name, so
     * normalise the part identity away before hashing.)
     */
    contentHash(model) {
      try {
        const clone = JSON.parse(JSON.stringify(model ?? null));
        for (const part of Array.isArray(clone?.parts) ? clone.parts : []) {
          if (part && typeof part === "object") {
            delete part.name;
            delete part.id;
          }
        }
        // Canonical form: sort object keys recursively, so two models that only
        // differ in key order (or in parts[].name/id) hash the same.
        const canonical = (value) => {
          if (Array.isArray(value)) return value.map(canonical);
          if (value && typeof value === "object") {
            const out = {};
            for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
            return out;
          }
          return value;
        };
        return createHash("sha256").update(JSON.stringify(canonical(clone))).digest("hex");
      } catch {
        return "";
      }
    },
    async save(model, meta = {}) {
      await store.init();
      const title = str(meta.title) || "";
      // Keep the CadQuery source when there is one: re-running it exports exact
      // geometry (STEP/BREP/DXF) instead of a mesh reconstruction.
      const source = str(meta.script).slice(0, MAX_SOURCE_BYTES);
      const hash = store.contentHash(model);
      // Same geometry + same title = the same library entry. Retry a few times so
      // two concurrent saves converge on a single file instead of duplicating.
      for (let attempt = 0; attempt < 5; attempt++) {
        if (hash) {
          const ids = await store.listIds();
          for (const id of ids) {
            const existing = await store.readItem(id);
            if (!existing) continue;
            const existingHash = existing.h ?? store.contentHash(existing.model);
            if (existingHash === hash && (existing.title || "") === title) {
              await store.writeItem({
                ...existing,
                h: existingHash,
                createdAt: existing.createdAt ?? Date.now(),
                ...(source ? { script: source } : {}),
              });
              return existing;
            }
          }
        }
        const item = {
          id: randomUUID(),
          name: str(meta.name) || "model",
          title,
          createdAt: Date.now(),
          sessionId: str(meta.sessionId),
          workspace: str(meta.workspace),
          folder: str(meta.folder),
          source: str(meta.source) || "add_3dmodel",
          height: typeof meta.height === "number" ? meta.height : null,
          model,
          ...(source ? { script: source } : {}),
          ...(hash ? { h: hash } : {}),
        };
        await store.writeItem(item);
        // Another save may have raced past the scan above; if so keep the entry
        // that is already in the store and drop ours.
        let clash = false;
        if (hash) {
          for (const id of await store.listIds()) {
            if (id === item.id) continue;
            const other = await store.readItem(id);
            if (!other) continue;
            const otherHash = other.h ?? store.contentHash(other.model);
            if (otherHash === hash && (other.title || "") === title) clash = true;
          }
        }
        if (!clash) return item;
        await unlink(store.itemPath(item.id)).catch(() => {});
      }
      return null;
    },
  };

  // ---- CadQuery bridge: script -> mesh (build) and model -> file (export) ---
  const run = promisify(execFile);
  const cadScriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "cadquery_build.py");
  const cadExportPath = resolve(dirname(fileURLToPath(import.meta.url)), "cadquery_export.py");
  const cadqueryPython = () => config.cadqueryPython || "D:\\AI\\3DModels\\.venv\\Scripts\\python.exe";

  /**
   * Download one stored model in one of CadQuery's formats. cadquery_export.py
   * does the work: a model that kept its CadQuery source is rebuilt and exported
   * exactly, a mesh-only entry is reconstructed from the stored triangles.
   */
  async function exportItem(id, req, res) {
    const fail = (status, message) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: message }));
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      res.end("method not allowed\n");
      return;
    }
    const format = (queryOf(req)?.get("format") ?? "").trim().toUpperCase();
    const spec = EXPORT_FORMATS.find((f) => f.id === format);
    if (!spec) {
      fail(400, `unsupported format: ${format || "(missing)"}`);
      return;
    }
    const item = await store.readItem(id);
    if (!item) {
      fail(404, "not found");
      return;
    }

    const token = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const outPath = join(tmpdir(), `dsh-model-export-${token}${spec.ext}`);
    const temporary = [];
    try {
      const args = [
        cadExportPath,
        "--format", spec.id,
        "--out", outPath,
        "--tolerance", String(config.cadqueryTolerance ?? 0.1),
      ];
      const source = str(item.script);
      if (source.trim()) {
        const scriptPath = join(tmpdir(), `dsh-model-src-${token}.py`);
        await writeFile(scriptPath, source, "utf8");
        temporary.push(scriptPath);
        args.push("--script", scriptPath);
      } else if (item.model) {
        const modelPath = join(tmpdir(), `dsh-model-mesh-${token}.json`);
        await writeFile(modelPath, JSON.stringify(item.model), "utf8");
        temporary.push(modelPath);
        args.push("--model", modelPath);
      } else {
        fail(400, "这个模型没有可导出的几何数据");
        return;
      }

      let stdout = "";
      try {
        ({ stdout } = await run(cadqueryPython(), args, {
          maxBuffer: 8 * 1024 * 1024,
          timeout: config.cadqueryExportTimeout,
        }));
      } catch (err) {
        // The script reports machine-readable failures on stdout, a crash leaves
        // node's own message — surface whichever detail we actually have.
        const line = String(err?.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
        let detail = line || String(err?.message ?? err);
        try {
          detail = JSON.parse(line).error || detail;
        } catch {
          /* not JSON: keep the raw line */
        }
        ctx.logger.warn(`dsh-cad-viewer: export ${spec.id} failed: ${detail}`);
        fail(500, detail || "导出失败");
        return;
      }

      let reported = {};
      try {
        reported = JSON.parse(stdout.trim().split("\n").filter(Boolean).pop() ?? "{}");
      } catch {
        /* fall through to the generic error below */
      }
      if (!reported.ok) {
        fail(500, reported.error || "导出失败");
        return;
      }

      const bytes = await readFile(outPath);
      const name = downloadName(item.title || item.name || "model", spec.ext);
      res.writeHead(200, {
        "content-type": spec.mime,
        "content-length": bytes.length,
        "cache-control": "no-store",
        // `filename` stays ASCII for old clients, `filename*` carries the real
        // (often Chinese) title.
        "content-disposition":
          `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; ` +
          `filename*=UTF-8''${encodeURIComponent(name)}`,
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
      ctx.logger.info(
        `dsh-cad-viewer: exported ${id} as ${spec.id} ` +
          `(${bytes.length} bytes, ${reported.mode || "?"}${reported.note ? `, ${reported.note}` : ""})`,
      );
    } catch (err) {
      ctx.logger.warn(`dsh-cad-viewer: export error: ${err?.message ?? err}`);
      if (!res.headersSent) fail(500, err?.message ?? String(err));
      else res.end();
    } finally {
      await Promise.all([outPath, ...temporary].map((p) => unlink(p).catch(() => {})));
    }
  }

  ctx.effect(() => {
    store.init().catch(() => {});

    // ---- Static three-cad-viewer bundle route:  /tcv/<file> --------------
    const unrouteStatic = ctx.webServer.register({
      kind: "prefix",
      path: assetPrefix,
      handler: async (req, res) => {
        try {
          if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
            res.end("method not allowed\n");
            return;
          }
          const rawUrl = req.url ?? "/";
          if (rawUrl.length > config.maxUrlLength) {
            res.writeHead(414, { "content-type": "text/plain; charset=utf-8" });
            res.end("uri too long\n");
            return;
          }
          const u = new URL(rawUrl, "http://localhost");
          let tail = decodeURIComponent(u.pathname.slice(assetPrefix.length));
          tail = tail.replace(/^[/\\]+/, "").replace(/\\/g, "/");
          if (!tail || tail.includes("\0")) {
            res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
            res.end("bad request\n");
            return;
          }
          const target = withinRoot(assetDir, join(assetDir, tail)) ? join(assetDir, tail) : null;
          if (target === null) {
            res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
            res.end("forbidden\n");
            return;
          }
          let info;
          try {
            info = await stat(target);
          } catch {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            res.end("not found\n");
            return;
          }
          if (!info.isFile()) {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            res.end("not found\n");
            return;
          }
          const contentType = staticMime(extname(target));
          const isHtml = /\.html?$/.test(target);
          res.writeHead(200, {
            "content-type": contentType,
            "content-length": info.size,
            "cache-control": isHtml ? "no-store" : "public, max-age=3600",
          });
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          res.end(await readFile(target));
        } catch (err) {
          ctx.logger.warn(`dsh-cad-viewer: static error: ${err?.message ?? err}`);
          if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          res.end("internal error\n");
        }
      },
    });

    // ---- Model store API route:  /3dmodel/api/items[ /:id ] -------------
    const apiBase = `${apiPrefix}/api/items`;
    const unrouteApi = ctx.webServer.register({
      kind: "prefix",
      path: apiBase,
      handler: async (req, res) => {
        try {
          const u = new URL(req.url ?? "/", "http://localhost");
          const pathname = u.pathname.replace(/\/+$/, "") || apiBase;
          const isCollection = pathname === apiBase;
          const isFolders = pathname === apiBase + "/folders" || pathname.startsWith(apiBase + "/folders/");
          const isFormats = pathname === apiBase + "/formats";
          const isItem = !isFolders && !isFormats && pathname.startsWith(apiBase + "/");

          if (!isCollection && !isItem && !isFolders && !isFormats) {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            res.end("not found\n");
            return;
          }

          // ---- Export formats: GET list (the card menu is built from this) --
          if (isFormats) {
            if (req.method !== "GET" && req.method !== "HEAD") {
              res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
              res.end("method not allowed\n");
              return;
            }
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({
              ok: true,
              formats: EXPORT_FORMATS.map((f) => ({
                id: f.id,
                ext: f.ext,
                label: f.label,
                desc: f.desc,
                group: f.group,
              })),
            }));
            return;
          }

          // ---- Folders: GET list / POST create / PATCH rename / DELETE -----
          if (isFolders) {
            const tail = pathname.slice((apiBase + "/folders").length).replace(/^\/+/, "");
            const folderId = tail ? decodeURIComponent(tail.split("/")[0]) : "";
            if (tail && (!/^[0-9a-f-]{6,}$/i.test(folderId) || tail.includes("/"))) {
              res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ ok: false, error: "bad folder id" }));
              return;
            }
            if (req.method === "GET" && !folderId) {
              const folders = await store.readFolders();
              res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ ok: true, folders }));
              return;
            }
            if (req.method === "POST" && !folderId) {
              const body = (await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {};
              const folder = await store.createFolder(body.name, body.parent);
              res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ ok: true, folder }));
              return;
            }
            if (req.method === "PATCH" && folderId) {
              const body = (await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {};
              const folders = await store.readFolders();
              const hit = folders.find((f) => f.id === folderId);
              if (!hit) {
                res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: "not found" }));
                return;
              }
              if (typeof body.name === "string" && body.name.trim()) hit.name = body.name.trim().slice(0, 120);
              if (typeof body.parent === "string") {
                const parent = body.parent;
                const valid = parent === "" || folders.some((f) => f.id === parent);
                // a folder may not be moved into itself or into its own descendant
                const cyclic = parent !== "" && (parent === folderId || (await store.folderDescendsFrom(folderId, parent)));
                if (valid && !cyclic) hit.parent = cyclic || !valid ? str(hit.parent) : parent;
              }
              await store.writeFolders(folders);
              res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ ok: true, folder: hit }));
              return;
            }
            if (req.method === "DELETE" && folderId) {
              await store.deleteFolder(folderId);
              res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ ok: true }));
              return;
            }
            res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
            res.end("method not allowed\n");
            return;
          }

          // ---- Collection: GET list / POST save -------------------------
          if (isCollection) {
            if (req.method === "GET") {
              const q = queryOf(req);
              const session = q?.get("session") ?? "";
              const workspace = q?.get("workspace") ?? "";
              const onlySession = (q?.get("onlySession") ?? "") === "1";
              let items = [];
              for (const id of await store.listIds()) {
                const item = await store.readItem(id);
                if (item) items.push(item);
              }
              items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
              if (onlySession && session) items = items.filter((it) => str(it.sessionId) === session);
              else if (workspace) items = items.filter((it) => str(it.workspace) === workspace);
              const meta = items.map((it) => ({
                id: it.id,
                name: it.name,
                title: it.title,
                createdAt: it.createdAt,
                sessionId: it.sessionId,
                workspace: it.workspace,
                folder: str(it.folder),
                source: it.source,
                height: it.height,
                // True when the CadQuery source is stored, i.e. exports are exact
                // geometry rather than a reconstruction from the mesh.
                hasSource: str(it.script).trim().length > 0,
              }));
              res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ items: meta, total: meta.length }));
              return;
            }
            if (req.method === "POST") {
              const body = await readJsonBody(req, maxBodyBytes);
              const model = body.model ?? null;
              if (model === null) {
                res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: "model is required" }));
                return;
              }
              const item = await store.save(model, body);
              ctx.logger.info(`dsh-cad-viewer: saved model ${item.id}`);
              res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ ok: true, id: item.id, name: item.name, title: item.title, createdAt: item.createdAt }));
              return;
            }
            res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
            res.end("method not allowed\n");
            return;
          }

          // ---- Item: GET :id [ /export ] / PATCH :id / DELETE :id --------
          const tail = pathname.slice(apiBase.length + 1).split("/").filter(Boolean);
          const id = decodeURIComponent(tail[0] || "");
          const action = (tail[1] || "").toLowerCase();
          if (!id || id.includes("..") || id.includes("/") || id.includes("\\") || !/^[0-9a-f-]+$/i.test(id)) {
            res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
            res.end("bad id\n");
            return;
          }
          if (action && action !== "export") {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            res.end("not found\n");
            return;
          }
          if (action === "export") {
            await exportItem(id, req, res);
            return;
          }
          if (req.method === "GET") {
            const item = await store.readItem(id);
            if (!item) {
              res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ ok: false, error: "not found" }));
              return;
            }
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true, item }));
            return;
          }
          if (req.method === "PATCH") {
            const item = await store.readItem(id);
            if (!item) {
              res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ ok: false, error: "not found" }));
              return;
            }
            const body = (await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {};
            const next = { ...item };
            if (typeof body.title === "string") next.title = body.title.trim().slice(0, 200);
            if (typeof body.name === "string" && body.name.trim()) next.name = body.name.trim().slice(0, 200);
            if (typeof body.folder === "string") next.folder = body.folder;
            await store.writeItem(next);
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true, id: next.id, title: next.title, folder: next.folder }));
            return;
          }
          if (req.method === "DELETE") {
            await unlink(store.itemPath(id)).catch(() => {});
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
          res.end("method not allowed\n");
        } catch (err) {
          ctx.logger.warn(`dsh-cad-viewer: api error: ${err?.message ?? err}`);
          if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          res.end("internal error\n");
        }
      },
    });

    return () => {
      unrouteStatic();
      unrouteApi();
    };
  }, name);

  /**
   * Render for the two "save a model" tools. Kept in one place because a failed
   * save must not read as success: the render used to key off `title` alone, so
   * an error reply (which carries no title) still displayed "3D 模型已入库。".
   */
  const renderSaved = (_args, value) => {
    if (!value || value.ok === false) {
      return [{ type: "text", text: `生成失败：${(value && value.error) || "未知错误"}` }];
    }
    return [{ type: "text", text: value.title ? `模型「${value.title}」已入库。` : "3D 模型已入库。" }];
  };

  // ---- add_3dmodel tool ----------------------------------------------------
  ctx.tools.register(
    defineTool({
      name: "add_3dmodel",
      description:
        "Add a 3D model to the model library ('3D模型' tab) and show it as an inline card. " +
        "Pass the model as three-cad-viewer 'Shape' JSON (cad-format: version, parts[], " +
        "each part has shape:{vertices,triangles,normals,edges}). The model is persisted " +
        "server-side so it is shared across devices; adding the same geometry with the same " +
        "title updates the existing library entry instead of creating a duplicate. " +
        "For models defined as CadQuery code use build_3dmodel instead.",
      parameters: {
        model: {
          type: "object",
          required: true,
          additionalProperties: true,
          description:
            "The three-cad-viewer Shape JSON (cad-format): {version:3, parts:[{name, " +
            "shape:{vertices:[x,y,z,…], triangles:[i,j,k,…], normals:[…], edges:[…]}, " +
            "color?, alpha?}]}. vertices/triangles/normals/edges are FLAT number arrays " +
            "(triangles are vertex indices in triples), so no example file is needed.",
        },
        title: {
          type: "string",
          description: "Optional short title for the model.",
        },
        height: {
          type: "number",
          description: "Optional canvas height in px for the inline card.",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean", required: true },
            id: { type: "string" },
            title: { type: "string" },
            error: { type: "string" },
          },
        },
        render: renderSaved,
      },
      async execute(args) {
        const body = args ?? {};
        const model = body.model;
        if (model === null || model === undefined) {
          return { ok: false, error: "model is required" };
        }
        try {
          const item = await store.save(model, body);
          if (!item) return { ok: false, error: "model store is unavailable" };
          return { ok: true, id: item.id, ...(item.title ? { title: item.title } : {}) };
        } catch (err) {
          ctx.logger.warn(`dsh-cad-viewer: add_3dmodel persist error: ${err?.message ?? err}`);
          return { ok: false, error: err?.message ?? String(err) };
        }
      },
    }),
  );

  // ---- CadQuery build_3dmodel tool ----------------------------------------
  async function buildCadModel(script, tol) {
    const tmpFile = join(tmpdir(), `dsh-model-${Date.now()}-${randomUUID().slice(0, 8)}.py`);
    await writeFile(tmpFile, script, "utf8");
    try {
      const { stdout } = await run(cadqueryPython(), [cadScriptPath, tmpFile, String(tol ?? 0.1)], {
        maxBuffer: 64 * 1024 * 1024,
        timeout: 60000,
      });
      const line = stdout.trim().split("\n").pop();
      return JSON.parse(line);
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  }

  ctx.tools.register(
    defineTool({
      name: "build_3dmodel",
      description:
        "Generate a 3D model from a CadQuery script, tessellate it and add it to the " +
        "'3D模型' model library (shown as an inline card in this conversation). The script " +
        "must `import cadquery as cq` and assign `model` — a cq.Workplane / cq.Shape, i.e. " +
        "anything with .tessellate(); an assembly has to be converted first " +
        "(`model = assy.toCompound()`). Units are CadQuery's own (typically mm). The script " +
        "is stored with the entry (up to 256 KB), so the entry can later be exported from " +
        "the model library to every format CadQuery writes (STEP, BREP, STL, 3MF, AMF, " +
        "VRML, VTP, TJS, SVG, DXF) as exact geometry. Saving the same geometry under the " +
        "same title updates the existing entry instead of creating a duplicate. A script " +
        "that fails, or that never assigns `model`, returns {ok:false, error}.",
      parameters: {
        script: {
          type: "string",
          required: true,
          description:
            "A CadQuery Python script. It must `import cadquery as cq` and assign `model` " +
            "(a cq.Workplane / cq.Shape with .tessellate(); convert an assembly yourself, " +
            "e.g. `model = assy.toCompound()`), and may set module-level `name` (part name, " +
            "default Part) and `color` (hex, default #e8b024). One build may take up to 60 s " +
            "and its stdout is capped at 64 MB.",
        },
        title: {
          type: "string",
          description:
            "Optional short title for the generated model; it is part of the de-duplication key.",
        },
        tolerance: {
          type: "number",
          description:
            "Optional tessellation tolerance (default: the plugin's cadqueryTolerance, 0.1).",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean", required: true },
            id: { type: "string" },
            title: { type: "string" },
            error: { type: "string" },
          },
        },
        render: renderSaved,
      },
      async execute(args) {
        const body = args ?? {};
        const script = body.script;
        if (typeof script !== "string" || script.trim().length === 0) {
          return { ok: false, error: "script is required" };
        }
        try {
          const built = await buildCadModel(script, body.tolerance ?? config.cadqueryTolerance ?? 0.1);
          if (!built || !built.ok || !built.model) {
            return { ok: false, error: (built && built.error) || "CadQuery build failed" };
          }
          const title = body.title ? String(body.title) : "";
          // Keeping the source lets the export menu produce exact geometry
          // (STEP/BREP/DXF) instead of a reconstruction from the mesh.
          const item = await store.save(built.model, {
            name: "model",
            title,
            source: "build_3dmodel",
            script,
          });
          if (!item) return { ok: false, error: "model store is unavailable" };
          return { ok: true, id: item.id, ...(item.title ? { title: item.title } : {}) };
        } catch (err) {
          ctx.logger.warn(`dsh-cad-viewer: build_3dmodel error: ${err?.message ?? err}`);
          return { ok: false, error: err?.message ?? String(err) };
        }
      },
    }),
  );

  // ---- cadquery_env tool ---------------------------------------------------
  // CadQuery is not bundled: the plugin drives whatever interpreter the
  // cadqueryPython setting points at. This tool tells the agent what that
  // interpreter is missing (and the exact command to fix it), so installing and
  // verifying the dependency is an agent job rather than a guess.
  const cadProbePath = resolve(dirname(fileURLToPath(import.meta.url)), "cadquery_probe.py");
  /** Package name -> the pip requirement that provides it. */
  const PIP_FOR = { cadquery: "cadquery", OCP: "cadquery", vtkmodules: "vtk", ezdxf: "ezdxf" };

  const renderEnv = (_args, value) => {
    if (!value || value.ok === false) {
      const lines = [`CadQuery 环境检查失败：${(value && value.error) || "未知错误"}`];
      for (const cmd of (value && value.remedy) || []) lines.push(`→ ${cmd}`);
      return [{ type: "text", text: lines.join("\n") }];
    }
    const show = (name, label) => {
      const p = value.packages?.[name];
      if (!p) return `${label} ?`;
      if (p.import_error) return `${label} ✗ (${p.import_error})`;
      return p.installed ? `${label} ${p.version || "✓"}` : `${label} ✗ 未安装`;
    };
    const lines = [
      `解释器：${value.python}${value.exists === false ? "（不存在）" : `（Python ${value.pythonVersion}）`}`,
      [show("cadquery", "cadquery"), show("OCP", "OCP"), show("vtkmodules", "VTK"), show("ezdxf", "ezdxf")].join(" · "),
    ];
    if (value.importable) lines.push("建模与导出可用。");
    for (const cmd of value.remedy || []) lines.push(`→ ${cmd}`);
    return [{ type: "text", text: lines.join("\n") }];
  };

  ctx.tools.register(
    defineTool({
      name: "cadquery_env",
      description:
        "Check the CadQuery environment that build_3dmodel and the export routes need — CadQuery is " +
        "NOT bundled with this plugin, it drives the interpreter named by the cadqueryPython setting. " +
        "Reports whether that interpreter exists, its Python version, and whether cadquery, OCP (the " +
        "Open CASCADE bindings), vtkmodules and ezdxf import, together with the exact pip command that " +
        "fixes what is missing. Read-only: it installs nothing itself, so the agent runs the command it " +
        "returns (and sets/restarts after moving cadqueryPython). Call it when a build or an export " +
        "fails with an import error, and once more afterwards to confirm.",
      parameters: {
        python: {
          type: "string",
          description:
            "Optional interpreter to probe instead of the configured cadqueryPython (e.g. a venv the " +
            "agent just created). Pass a path to an executable.",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean", required: true },
            error: { type: "string" },
            python: { type: "string" },
            exists: { type: "boolean" },
            pythonVersion: { type: "string" },
            platform: { type: "string" },
            importable: { type: "boolean" },
            packages: { type: "object", additionalProperties: true },
            missing: { type: "array", items: { type: "string" } },
            remedy: { type: "array", items: { type: "string" } },
            notes: { type: "array", items: { type: "string" } },
          },
        },
        render: renderEnv,
      },
      async execute(args) {
        const py = str(args?.python).trim() || cadqueryPython();
        const exists = await stat(py).then(
          (info) => info.isFile(),
          () => false,
        );
        const full = {
          // ok === false means the probe itself could not run (dead interpreter,
          // spawn failure, unparsable output); a *missing package* is still ok:true
          // with `missing` / `remedy` filled in. The output schema requires `ok`,
          // so every return path below sets it.
          ok: true,
          python: py,
          exists,
          pythonVersion: "",
          platform: "",
          importable: false,
          packages: {},
          missing: ["cadquery", "OCP", "vtkmodules", "ezdxf"],
          remedy: [],
          notes: [],
        };
        if (!exists) {
          // The configured interpreter is a dead path (or none was configured):
          // hand the agent the exact setup sequence instead of a spawn error.
          // `dir` is the interpreter's parent — trailing separators removed, so the
          // quoted path in the printed command stays copy-pasteable.
          const dir = (py.replace(/[\\/]+[^\\/]*$/, "") || py).replace(/[\\/]+$/, "");
          full.ok = false;
          full.error = `解释器不存在：${py}`;
          full.remedy = [
            `python -m venv "${dir}"`,
            `"${py}" -m pip install --upgrade pip`,
            `"${py}" -m pip install cadquery vtk`,
            `然后把 profile 的 cordis.patch.yml 里 cadqueryPython 设为 "${py}"（见 README「CadQuery 安装」），并重启 dsh web。`,
          ];
          return full;
        }

        let stdout = "";
        try {
          ({ stdout } = await run(py, [cadProbePath], { maxBuffer: 4 * 1024 * 1024, timeout: 120000 }));
        } catch (err) {
          const line = String(err?.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
          full.ok = false;
          full.error = line || String(err?.message ?? err);
          full.remedy = [`"${py}" -m pip install cadquery vtk`, `然后再次调用 cadquery_env 确认。`];
          ctx.logger.warn(`dsh-cad-viewer: cadquery_env failed: ${full.error}`);
          return full;
        }

        let probed = {};
        try {
          probed = JSON.parse(stdout.trim().split("\n").filter(Boolean).pop() ?? "{}");
        } catch {
          full.ok = false;
          full.error = "探测脚本没有返回 JSON";
          return full;
        }
        const packages = probed.packages ?? {};
        const missing = [];
        for (const name of ["cadquery", "OCP", "vtkmodules", "ezdxf"]) {
          const p = packages[name] ?? {};
          if (!p.installed || p.import_error) missing.push(name);
        }
        const cadErr = String(packages.cadquery?.import_error ?? "");
        // cadquery 2.4 imports vtkmodules at import time without declaring it, so
        // "cadquery installed but not importable" is usually just a missing vtk —
        // the requirement list already covers that, the note explains why.
        const requirements = Array.from(new Set(missing.map((n) => PIP_FOR[n]).filter(Boolean)));
        const notes = [...(probed.notes ?? [])];
        if (cadErr.includes("vtkmodules") && !missing.includes("vtkmodules")) {
          notes.push("cadquery 报的导入错误与 vtkmodules 有关，但 vtk 本身可导入：多半是 OCCT/VTK 的 DLL 冲突。");
        }
        return {
          ok: true,
          python: probed.python || py,
          exists: true,
          pythonVersion: probed.version || "",
          platform: probed.platform || "",
          importable: !!probed.importable && missing.length === 0,
          packages,
          missing,
          remedy: requirements.length ? [`"${py}" -m pip install ${requirements.join(" ")}`] : [],
          notes,
        };
      },
    }),
  );
}

export default { name, inject, Config, apply };
