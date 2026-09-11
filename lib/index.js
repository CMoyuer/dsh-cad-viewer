/**
 * dsh-model-viewer — embed three-cad-viewer as a "模型" tab plus inline cards.
 *
 * Server half. Everything is self-contained:
 *
 *   GET  /tcv/<file>            -> static three-cad-viewer bundle from this
 *                                  plugin's `assets/` dir (esm.min.js, css, d.ts).
 *   GET  /3dmodel/api/items     -> list model metadata (query: session,
 *                                  workspace, onlySession).
 *   POST /3dmodel/api/items     -> persist a model (body carries the Shape JSON).
 *   GET  /3dmodel/api/items/:id -> load one full model (incl. Shape JSON).
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
export const name = "model-viewer";

/** Services this plugin needs before mounting. */
export const inject = ["webServer", "tools"];

export const Config = z.object({
  /** Static asset URL prefix for the three-cad-viewer bundle. */
  assetPrefix: z.string().default("/tcv"),
  /** API URL prefix for the model store. */
  apiPrefix: z.string().default("/3dmodel"),
  /** Directory for stored models. When empty, first workspace path (.dsh-model-viewer). */
  dataDir: z.string().default(""),
  /** Max URL tail length. */
  maxUrlLength: z.number().min(32).max(4096).default(2048),
  /** Max JSON request body bytes. */
  maxBodyBytes: z.number().min(1024).max(64 * 1024 * 1024).default(32 * 1024 * 1024),
  /** Python interpreter with CadQuery installed (used by build_3dmodel). */
  cadqueryPython: z.string().default("D:\\AI\\3DModels\\.venv\\Scripts\\python.exe"),
  /** Tessellation tolerance for CadQuery -> mesh. */
  cadqueryTolerance: z.number().min(0.001).max(10).default(0.1),
});

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
              await store.writeItem({ ...existing, h: existingHash, createdAt: existing.createdAt ?? Date.now() });
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
          ctx.logger.warn(`dsh-model-viewer: static error: ${err?.message ?? err}`);
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
          const isItem = !isFolders && pathname.startsWith(apiBase + "/");

          if (!isCollection && !isItem && !isFolders) {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            res.end("not found\n");
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
              ctx.logger.info(`dsh-model-viewer: saved model ${item.id}`);
              res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ ok: true, id: item.id, name: item.name, title: item.title, createdAt: item.createdAt }));
              return;
            }
            res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
            res.end("method not allowed\n");
            return;
          }

          // ---- Item: GET :id / PATCH :id (rename / move) / DELETE :id ----
          const id = decodeURIComponent(pathname.slice(apiBase.length + 1).split("/")[0] || "");
          if (!id || id.includes("..") || id.includes("/") || id.includes("\\") || !/^[0-9a-f-]+$/i.test(id)) {
            res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
            res.end("bad id\n");
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
          ctx.logger.warn(`dsh-model-viewer: api error: ${err?.message ?? err}`);
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
            "The three-cad-viewer Shape JSON (cad-format). See the examples/box1.js shape for the exact structure.",
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
          ctx.logger.warn(`dsh-model-viewer: add_3dmodel persist error: ${err?.message ?? err}`);
          return { ok: false, error: err?.message ?? String(err) };
        }
      },
    }),
  );

  // ---- CadQuery build_3dmodel tool ----------------------------------------
  const run = promisify(execFile);
  const cadScriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "cadquery_build.py");
  async function buildCadModel(script, tol) {
    const tmpFile = join(tmpdir(), `dsh-model-${Date.now()}-${randomUUID().slice(0, 8)}.py`);
    await writeFile(tmpFile, script, "utf8");
    try {
      const py = config.cadqueryPython || "D:\\AI\\3DModels\\.venv\\Scripts\\python.exe";
      const { stdout } = await run(py, [cadScriptPath, tmpFile, String(tol ?? 0.1)], {
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
        "Generate a 3D model from a CadQuery script and add it to the '模型' library. " +
        "The script must define a variable `model` as a CadQuery Workplane/Shape (e.g. " +
        "`model = cq.Workplane('XY').box(2,2,2)`). The mesh is tessellated into a " +
        "three-cad-viewer Shape and persisted server-side (shared across devices).",
      parameters: {
        script: {
          type: "string",
          required: true,
          description:
            "A CadQuery Python script. It must `import cadquery as cq` and define `model` " +
            "(a cq.Workplane / cq.Shape). Optional: `name` (part name) and `color` (hex).",
        },
        title: {
          type: "string",
          description: "Optional short title for the generated model.",
        },
        tolerance: {
          type: "number",
          description: "Optional tessellation tolerance (default 0.1).",
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
          const item = await store.save(built.model, { name: "model", title, source: "build_3dmodel" });
          if (!item) return { ok: false, error: "model store is unavailable" };
          return { ok: true, id: item.id, ...(item.title ? { title: item.title } : {}) };
        } catch (err) {
          ctx.logger.warn(`dsh-model-viewer: build_3dmodel error: ${err?.message ?? err}`);
          return { ok: false, error: err?.message ?? String(err) };
        }
      },
    }),
  );
}

export default { name, inject, Config, apply };
