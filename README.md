# dsh-cad-viewer

把 **3D 模型库**和完整的 CAD 查看器嵌入 [dsh](https://github.com/deepseek-ai/deepseek-harness) Web GUI：会话区多出一个 **「3D模型」tab**，agent 用 **CadQuery** 建好的模型直接落进库里，可在线查看、导出成 10 种 CAD / 网格 / 图纸格式。

[![npm](https://img.shields.io/npm/v/dsh-cad-viewer)](https://www.npmjs.com/package/dsh-cad-viewer)
[![npm downloads](https://img.shields.io/npm/dm/dsh-cad-viewer)](https://www.npmjs.com/package/dsh-cad-viewer)
[![License](https://img.shields.io/github/license/CMoyuer/dsh-cad-viewer)](LICENSE)
![Platform](https://img.shields.io/badge/platform-dsh%20web-3b82f6)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![AI-generated](https://img.shields.io/badge/AI-generated-blueviolet)

[npm 包页](https://www.npmjs.com/package/dsh-cad-viewer) · [更新日志](CHANGELOG.md) · [AI 生成声明](#ai-生成声明) · [MIT 许可证](LICENSE)

## 截图

![「3D模型」tab：模型库、卡片菜单，以及列出全部 10 种格式的导出子菜单](https://raw.githubusercontent.com/CMoyuer/dsh-cad-viewer/main/docs/images/model-library.png)

**模型库** —— tab 的默认视图。文件夹、全库搜索、拖拽移动；卡片菜单里有重命名 / 移动到… / 导出 / 删除。图中子菜单头部显示「仅有网格 · 由三角网格重建几何」，因为该条目由 `add_3dmodel` 创建（没有保存 CadQuery 源码）；`build_3dmodel` 的条目会显示「已保存 CadQuery 源码 · 导出为精确几何」。

![工作台：查看器工具栏、导航树与 3D 画布](https://raw.githubusercontent.com/CMoyuer/dsh-cad-viewer/main/docs/images/workbench.png)

**工作台** —— 每个模型一个标签页，挂载上游 [three-cad-viewer](https://github.com/bernhard-42/three-cad-viewer) 的完整界面（工具栏 / 导航树 / 画布），文案已中文化，工具栏上多了 **导出** 按钮（在 `?` 之前）。

## 这个插件是什么

- **模型库** —— 文件夹、全库搜索、拖拽移动、重命名 / 移动 / 删除，以及 10 种格式**导出**。
- **工作台** —— 为库中任意模型挂载 three-cad-viewer 完整界面；左 / 右键旋转、中键平移、滚轮缩放。
- **对话内嵌卡片** —— 调用过模型工具的那条消息末尾出现可折叠卡片，*全屏* 即以工作台打开同一模型。
- **三个 agent 工具** —— `add_3dmodel`（存 `Shape` JSON）、`build_3dmodel`（跑 CadQuery 脚本）、`cadquery_env`（探测 CadQuery 环境）。
- **服务端存储** —— 一个条目一个 JSON 文件，同一 dsh 实例下所有设备看到同一份库；不用 IndexedDB、不依赖外部服务、没有构建步骤。

## 安装

三条路等价，装完都要做[启用与验证](#启用与验证)。

### 从 npm 安装（推荐）

```bash
dsh plugin --profile web add dsh-cad-viewer
```

包页 <https://www.npmjs.com/package/dsh-cad-viewer>。tarball 与仓库源码一致，只含运行所需的文件——`lib/`、`assets/`、`docs/`、`cordis.patch.yml`、`CHANGELOG.md`、`THIRD-PARTY-NOTICES.md`，加上 npm 必含的 `package.json` / `README.md` / `LICENSE`；`dev/` 与 `screenshots.json` 不随包分发。

### 从 GitHub 或本地目录安装

```bash
dsh plugin --profile web add github:CMoyuer/dsh-cad-viewer

git clone https://github.com/CMoyuer/dsh-cad-viewer.git
cd dsh-cad-viewer && pnpm install
dsh plugin --profile web add .
```

`dsh plugin add` 会在 profile 目录里执行 pnpm，再按**实际安装结果**校正 `dsh.profile.bundles`——声明了 `dsh.bundle` 的包自动进插件层，不用手工编辑。插件目录不在 profile 下时请用绝对路径。

### 启用与验证

服务端插件只在启动时加载，**改完要重启 `dsh web`**。

```bash
dsh --profile web --dump-config    # 组合树里应出现 id: cad-viewer
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:3080/3dmodel/api/items
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:3080/tcv/three-cad-viewer.esm.min.js
```

期望 `200 application/json; charset=utf-8` 与 `200 text/javascript; charset=utf-8`。**路由缺失时不是 404**——SPA fallback 会返回 `200 text/html`，所以要看 content-type，不能只看状态码。之后刷新 GUI，打开 **3D模型** tab（在「画廊」之后）。

## 用法

### 模型库

agent 生成的模型会立刻出现（按创建时间排序）；点卡片即在工作台打开。

| 操作 | 方式 |
|---|---|
| 打开模型 | 点击卡片 |
| 重命名 | 双击名称，或 `⋯` → 重命名 |
| 移动 | 拖到目标文件夹（或「返回上一级」），或 `⋯` → 移动到… |
| 导出 | `⋯` → 悬停「导出」（右键卡片后悬停或点击同样可以），再选格式 |
| 删除 | `⋯` → 删除 |
| 新建文件夹 | 在模型库面板空白处右键 → 新建文件夹（右键卡片会自动收起它） |
| 搜索 | 搜索框（全库） |
| 返回上一层 | 「返回上一级」卡片，或把卡片拖到它上面 |

右键卡片时菜单在鼠标位置弹出。删除文件夹**不会删除内容**：其中的模型与子文件夹上移一层。

### 导出

同一个格式子菜单出现在两处：模型库卡片的 `⋯` → 导出，以及工作台工具栏的 **导出** 按钮（在 `?` 之前）。

| 分组 | 格式 |
|---|---|
| 精确几何 | `STEP` `.step`、`BREP` `.brep` |
| 网格 | `STL` `.stl`、`3MF` `.3mf`、`AMF` `.amf`、`VRML` `.wrl`、`VTP` `.vtp`、`TJS` `.json` |
| 二维图纸 | `SVG` `.svg`、`DXF` `.dxf` |

导出什么，取决于该条目有没有保存 CadQuery 源码（子菜单顶部会写明是哪种）：

- **保存过源码的条目**（`build_3dmodel` 创建）：重跑脚本再交给 CadQuery 自己的 exporter，STEP / BREP 是真正的实体，文件也小。
- **只有网格的条目**（`add_3dmodel` 创建，或旧版本入库）：由三角网格重建。`STEP` / `BREP` 把每个三角面做成平面片再缝合成壳——CAD 能打开，但表面是面片化的，文件也大（约 1 万面 → 约 20 MB）；网格格式则与查看器里看到的三角形完全一致。`SVG` 用「轮廓 + 特征边」投影（对三角面汤做隐藏线消除要几分钟，因此不做）。

导出在服务端串行执行，界面有进度对话框（可点「后台继续」，下载仍会完成）。单次上限由 `cadqueryExportTimeout` 控制（默认 5 分钟）。

### 工作台与内嵌卡片

每个模型一个标签页，`×` 关闭并回到模型库。查看器的工具栏与导航树与上游一致，区别是：*Pin as PNG* 按钮被移除、文案中文化、多一个 **导出** 按钮。

某轮对话调用过模型工具时，消息末尾出现可折叠卡片：左侧标题，*收起* 折叠，*全屏* 在工作台打开同一模型；加载失败会显示重试入口。删除库里的条目不会清空已经渲染出来的卡片。

## Agent 工具

| 工具 | 作用 |
|---|---|
| `add_3dmodel` | 把 three-cad-viewer `Shape`（cad-format JSON）存入模型库，并在消息末尾渲染内嵌卡片。 |
| `build_3dmodel` | 运行 CadQuery 脚本，tessellate 后入库，并**保存脚本**（上限 256 KB）以便日后导出精确几何。 |
| `cadquery_env` | 只读探测 CadQuery 环境（解释器是否在、四个包能否导入），并给出补齐缺口的准确命令。 |

```jsonc
// add_3dmodel：model 是 { version, parts[] }，每个 part 带 shape:{ vertices, triangles, normals, edges }
{ "model": { /* … */ }, "title": "Bracket", "height": 320 }

// build_3dmodel：脚本必须 import cadquery as cq 并给 model 赋值
{ "script": "import cadquery as cq\nmodel = cq.Workplane('XY').box(20, 20, 10)", "title": "Box", "tolerance": 0.1 }
```

- **去重键是「几何 + 标题」**：相同几何 + 相同标题再存一次只会更新原条目，不会多出第二条。
- `build_3dmodel` 的 `model` 必须是带 `.tessellate()` 的 `cq.Workplane` / `cq.Shape`；装配体请先 `model = assy.toCompound()`。脚本报错或没有赋值时返回 `{ "ok": false, "error": … }`，不会入库一个空模型。
- 单位就是 CadQuery 的单位（通常 mm），插件不做换算；单次构建超时 60 秒。

## 环境要求

| | |
|---|---|
| dsh | 可用的 dsh 安装，且已初始化 `web` profile（`dsh web`）；开发环境为 `@deepseek-ai/dsh` 0.1.5-rc.1。 |
| Node.js | ≥ 20（开发环境 Node 24）。 |
| pnpm | 需在 `PATH`：`dsh plugin` 本质是 pnpm 的转发器。 |
| CadQuery | **仅 `build_3dmodel` 与导出需要**，且只装在运行 `dsh web` 的那台机器上。`add_3dmodel` 与模型库浏览不需要。 |

插件没有构建步骤，也没有 `prepare` 脚本，因此从 git 安装不需要在 pnpm 的 `allowBuilds` 里放行任何构建。

### CadQuery 安装（可以让 agent 做）

CadQuery 以 Apache-2.0 发布、**不随本插件分发**：插件通过 `cadqueryPython` 配置项调用**你机器上已安装的**那一份。对 agent 说「装一下 CadQuery / 我要能导出 STEP」，它会按下面这个流程做完。

1. **探测**：调用 `cadquery_env`（只读）。它返回解释器路径与 Python 版本、`cadquery` / `OCP` / `vtkmodules` / `ezdxf` 各自能否导入、缺哪些、以及**应该跑的确切命令**。手工等价物：`<python> lib/cadquery_probe.py`。
2. **安装**：

   ```bash
   # Windows
   python -m venv D:\AI\3DModels\.venv
   "D:\AI\3DModels\.venv\Scripts\python.exe" -m pip install --upgrade pip
   "D:\AI\3DModels\.venv\Scripts\python.exe" -m pip install cadquery vtk

   # Linux / macOS
   python3 -m venv ~/cq-venv
   ~/cq-venv/bin/python -m pip install --upgrade pip
   ~/cq-venv/bin/python -m pip install cadquery vtk
   ```

   网速慢或被墙时加镜像：`-i https://pypi.tuna.tsinghua.edu.cn/simple`。请**一次装上两个包**——VTK 并不在 `cadquery` 的依赖声明里，但 `cadquery 2.4.0` 的 `occ_impl.exporters` 在导入期就会 `import vtkmodules`，缺了它连 `import cadquery` 都过不去，建模与**全部**导出都会不可用。
3. **指向它**：把解释器路径写进 profile 的 `cordis.patch.yml`（按插件 id 覆盖配置）。路径含空格时保留单引号：

   ```yaml
   - id: cad-viewer
     config:
       cadqueryPython: 'D:\AI\3DModels\.venv\Scripts\python.exe'
   ```
4. **重启** `dsh web`（配置只在启动时读取），再调用一次 `cadquery_env` 复验，应显示四个包都有版本。

| | |
|---|---|
| Python | ≥ 3.8；开发与验证环境为 Python 3.12 + cadquery 2.4.0 + cadquery-ocp 7.7.2 + VTK 9.7.0 + ezdxf 1.4.4。 |
| 轮子平台 | `cadquery-ocp` 提供 Windows / Linux / macOS(arm64) 轮子；没有匹配轮子的平台改用 conda（`mamba install -c conda-forge cadquery`），再把 `cadqueryPython` 指过去。 |
| 磁盘与时间 | `cadquery-ocp` 与 `vtk` 都是数百 MB 级轮子，首次安装请留出时间与空间。 |

一句话验证：`"<python>" -c "import cadquery, vtkmodules, ezdxf; print(cadquery.__version__)"`。

## 配置项

通过 dsh 配置树（schemastery）配置，一般写在 profile 的 `cordis.patch.yml` 里。

| 字段 | 默认值 | 说明 |
|---|---|---|
| `apiPrefix` | `/3dmodel` | 模型存储 API 前缀。 |
| `assetPrefix` | `/tcv` | three-cad-viewer 静态资源前缀。 |
| `dataDir` | `<插件目录>/data` | 模型存储目录。**不要让两个 dsh 实例并发写同一个目录**。 |
| `cadqueryPython` | `D:\AI\3DModels\.venv\Scripts\python.exe` | 装好 CadQuery 的解释器，供 `build_3dmodel` 与导出使用；**请改成你机器上的路径**。 |
| `cadqueryTolerance` | `0.1` | 默认 tessellation 容差（网格导出也用它）。 |
| `cadqueryExportTimeout` | `300000` | 单次导出最长毫秒数（5 分钟）。 |
| `maxBodyBytes` | `33554432` | JSON 请求体上限（32 MB）。 |
| `maxUrlLength` | `2048` | 静态资源路由接受的 URL 最大长度。 |

`apiPrefix` / `assetPrefix` 同时硬编码在随包分发的 `lib/client.js` 里，改前缀必须一并改它。

## HTTP API

路由注册在 dsh web server 上，默认前缀 `/3dmodel` 与 `/tcv`。

| 方法 | 路由 | 说明 |
|---|---|---|
| `GET`/`HEAD` | `/tcv/<file>` | 返回插件 `assets/` 中的文件；拒绝路径穿越。 |
| `GET` | `/3dmodel/api/items` | 列出元数据。查询参数 `session`、`workspace`、`onlySession=1`；每条带 `hasSource`（是否保存了 CadQuery 源码）。 |
| `POST` | `/3dmodel/api/items` | 保存模型：`{ model, title?, name?, sessionId?, workspace?, folder?, height?, script? }`。 |
| `GET` | `/3dmodel/api/items/:id` | 读取完整条目（含 `Shape` JSON 与可能的 `script`）。 |
| `PATCH` | `/3dmodel/api/items/:id` | 更新 `title` / `name` / `folder`。 |
| `DELETE` | `/3dmodel/api/items/:id` | 删除单个条目。 |
| `GET` | `/3dmodel/api/items/formats` | 可导出格式列表（`{ id, ext, label, desc, group }`）。客户端菜单由此生成，因此不会与导出器实际支持的能力脱节。 |
| `GET`/`HEAD` | `/3dmodel/api/items/:id/export?format=STEP` | 导出为附件下载（文件名取自标题，含 RFC 5987 `filename*` 以便中文标题正确落地）。未知格式 `400`、条目不存在 `404`、方法不对 `405`、导出失败 `500`。 |
| `GET` | `/3dmodel/api/items/folders` | 列出全部文件夹。 |
| `POST` | `/3dmodel/api/items/folders` | 新建文件夹：`{ name, parent? }`（`""` 表示根目录）。 |
| `PATCH` | `/3dmodel/api/items/folders/:id` | 重命名和 / 或改父级；把文件夹移入自身或子孙会被拒绝。 |
| `DELETE` | `/3dmodel/api/items/folders/:id` | 删除文件夹，其中的模型与子文件夹上移一层。 |

响应统一为 `application/json; charset=utf-8`，API 错误同样是 JSON（`{ ok: false, error: … }`）；只有静态资源路由与少数协议层拒绝返回纯文本（`400 bad id`、`405`、`414`，以及 `/tcv/<file>` 的 `403` / `404`）。id 必须是 UUID 形式。

## 数据与存储

- 一个模型一个文件：`<dataDir>/<uuid>.json`；文件夹表单独存在 `<dataDir>/folders.meta.json`。
- 条目带内容指纹 `h`（对规范化后的 `Shape` JSON 取 SHA-256，忽略 `parts[].name` / `id`）：**相同几何 + 相同标题**再存一次只会更新原条目。启动时会重算指纹，旧版本写入的条目被就地升级；启动时也会清理写入中断遗留的 `*.json.tmp`。
- 写入直接落到最终文件（**没有原子 rename**）。**重要数据请自行备份 `<dataDir>`**；仓库的 `.gitignore` 排除它，正因为它属于用户数据。

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 看不到 **3D模型** tab | 客户端半未加载，或插件不在 `dsh.profile.bundles` 中。查 `dsh --profile web --dump-config` 与浏览器控制台。 |
| `/3dmodel/api/items` 返回 `200 text/html` | 插件未挂载，拿到的是 SPA fallback；看启动日志里的加载错误。 |
| 查看器一片空白 | `/tcv/three-cad-viewer.esm.min.js` 路由失败（看 content-type），或浏览器拦了动态 `import()`。面板内会显示 `three-cad-viewer 加载失败: …`。 |
| `build_3dmodel` 或导出立即失败 | `cadqueryPython` 指的解释器没有装 CadQuery；改指向装好的 venv。 |
| Windows 上报 DLL / import 错误 | `lib/cadquery_build.py` 规避的 OCCT/VTK 冲突——确认该文件的 import 顺序没被改动。 |
| 保存模型返回 `500` | 请求体超过 `maxBodyBytes`，或 `dataDir` 不可写。 |
| 导出很慢或超时 | 只有网格的条目导出 STEP / BREP 要把每个三角面缝成 B-Rep（约 1 万面数秒，更多会到几十秒）。调大 `cadqueryExportTimeout`，或改用网格格式，或让模型由 `build_3dmodel` 生成（有源码后走精确几何，快得多）。 |
| 改了代码没反应 | `lib/index.js`、`lib/cadquery_build.py` 要重启 `dsh web`；`lib/cadquery_export.py` 每次导出重新起进程，改完立即生效；`lib/client.js` 刷新页面即可。 |
| 改 `cadqueryPython` 不生效 | 忘了重启 `dsh web`（配置只在启动时读）。 |
| 插件换目录后模型库空了 | `dataDir` 默认是 `<插件目录>/data`；把旧的 `data/` 拷过去，或把 `dataDir` 指过去。 |

## 开发

没有打包器，也没有编译步骤。

```bash
node dev/route-test.mjs           # 伪 ctx 挂载插件，跑通路由与 10 种格式的真实导出
node dev/client-render-test.mjs   # 伪 React/DOM 渲染客户端，跑通 菜单 -> 导出 -> 下载
powershell -File dev/restart-verify.ps1   # 预检 + 重启 + 健康检查 + 失败自动回滚
```

`restart-verify.ps1` 会杀掉正在运行的 dsh（因此也会杀掉正在跑它的 agent 会话），必须以**分离进程**启动，否则它会终止自己；结果写在 `dev/restart-log.log`：

```powershell
Invoke-CimMethod -ClassName Win32_Process -MethodName Create `
  -Arguments @{ CommandLine = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File <插件绝对路径>\dev\restart-verify.ps1' }
```

它的健康检查除了两条基础路由，还会真实下载 STL / STEP / SVG / DXF / 3MF / VTP 各一份并检查字节数与响应头；任何一项失败就写禁用 patch 并重启，保证 GUI 可用。

改代码时守住几条：`inject` 必须列出 `apply` 中访问的**每一个** `ctx.*` 服务（`webServer`、`tools`），漏写会抛 `cannot get property "X" without inject` 并让整棵树加载失败；在 `ctx.effect` 中注册的路由必须返回 disposer。

### 目录结构

```
lib/       服务端 index.js、客户端 client.js、三个 CadQuery Python 脚本
dev/       开发用测试与安全重启脚本（不参与运行时）
assets/    随插件分发的 three-cad-viewer 构建产物（见 assets/README.md）
docs/      README 用到的截图
```

`cordis.patch.yml` 把插件插入为 `cad-viewer`；服务端加载 `lib/index.js`，注册一个静态资源前缀路由与一个模型 API 前缀路由，并在 `ctx.tools` 上注册三个工具；客户端注册 `conversation.view`（`id: "model"`、`order: 21`）承载 tab、注册 `conversation.chat.turnTail` 承载内嵌卡片，并用普通 `fetch` 访问 API。

## AI 生成声明

本仓库的代码与文档由 AI 编程助手生成，维护者负责提出需求、审阅改动并决定是否发布。每项功能改动都记在 [CHANGELOG](CHANGELOG.md) 里，主要路径有可独立运行的验证脚本（见[开发](#开发)）；但请自行判断它是否适合你的使用场景。

## 第三方声明

完整声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)（随 npm 包分发）。要点：

- [three-cad-viewer](https://github.com/bernhard-42/three-cad-viewer)（MIT，© Bernhard Walter）的预构建产物随插件分发在 `assets/`，其中内嵌 **three.js**（MIT，© Three.js Authors，r184）；上游代码未做修改。
- [CadQuery](https://github.com/CadQuery/cadquery)（Apache-2.0，© 2015 Parametric Products Intellectual Holdings, LLC）**不随本插件分发**，由 `cadqueryPython` 指定的解释器提供；导出路径还会间接用到 cadquery-ocp / OCCT、**ezdxf**（MIT）与 **VTK**（BSD）。
- 各名称与商标归各自所有者；本插件与上述项目无从属关系，也未获得其背书。

## 许可证

[MIT](LICENSE) © 2026 CMoyuer
