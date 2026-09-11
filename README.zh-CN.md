# dsh-model-viewer

把 **3D 模型库**和完整的 CAD 查看器嵌入 [dsh](https://github.com/deepseek-ai/deepseek-harness) Web GUI，作为会话区的 **「3D模型」tab**；同时注册两个工具，让 agent 用 **CadQuery** 建模并直接入库。

[![License](https://img.shields.io/github/license/CMoyuer/dsh-3dmodel-viewer)](LICENSE)
[![Stars](https://img.shields.io/github/stars/CMoyuer/dsh-3dmodel-viewer)](https://github.com/CMoyuer/dsh-3dmodel-viewer/stargazers)
[![Issues](https://img.shields.io/github/issues/CMoyuer/dsh-3dmodel-viewer)](https://github.com/CMoyuer/dsh-3dmodel-viewer/issues)
![Platform](https://img.shields.io/badge/platform-dsh%20web-3b82f6)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)

[English](README.md) · [更新日志](CHANGELOG.md) · [MIT 许可证](LICENSE)

> GitHub 仓库名是 `dsh-3dmodel-viewer`；npm 包名与 dsh 插件 id 都是 `dsh-model-viewer`。

---

## 目录

- [功能概览](#功能概览)
- [特性](#特性)
- [环境要求](#环境要求)
- [安装](#安装)
- [使用](#使用)
- [Agent 工具](#agent-工具)
- [CadQuery 建模](#cadquery-建模)
- [CadQuery 安装（由 agent 执行）](#cadquery-安装由-agent-执行)
- [HTTP API](#http-api)
- [配置项](#配置项)
- [数据与存储](#数据与存储)
- [目录结构](#目录结构)
- [开发](#开发)
- [常见问题](#常见问题)
- [第三方声明](#第三方声明)
- [许可证](#许可证)

## 功能概览

插件在 dsh 会话区新增一个 **3D模型** tab，里面有：

- **模型库** —— 文件夹、全库搜索、拖拽移动、重命名 / 移动 / 删除 / **导出**（CadQuery 支持的全部 10 种格式）；
- **工作台** —— 为模型库中任意模型挂载上游 [three-cad-viewer](https://github.com/bernhard-42/three-cad-viewer) 的完整界面（工具栏 + 导航树 + 画布）。

模型以「一个条目一个 JSON 文件」的形式存放在 dsh 服务端磁盘上，因此**同一 dsh 实例下的任何设备、任何浏览器看到的都是同一份模型库**：不用 IndexedDB，不依赖外部服务，也没有构建步骤（three-cad-viewer 构建产物随插件 `assets/` 一起分发，由插件自己托管）。

注册给 agent 的三个工具：

| 工具 | 作用 |
|---|---|
| `add_3dmodel` | 把一段 three-cad-viewer `Shape`（cad-format JSON）存入模型库，并在消息尾部渲染内嵌卡片。 |
| `build_3dmodel` | 运行 CadQuery 脚本，tessellate 后入库。 |
| `cadquery_env` | 只读探测 CadQuery 环境（解释器是否在、cadquery/OCP/VTK/ezdxf 是否能导入），并给出补齐缺口的准确命令。CadQuery 不随插件分发，安装由 agent 按它执行（见 [CadQuery 安装](#cadquery-安装由-agent-执行)）。 |

## 特性

**模型库（tab 的默认视图）**

- 文件夹导航：点击文件夹卡片即把网格限定到该文件夹，文件夹可自由嵌套。进入文件夹后顶部会显示位置条（如 `零件 /`），网格里的 *返回上一级* 卡片用于回到上一层。
- 全库搜索（占位符 `搜索模型、文件夹…`）：命中的模型会显示其所在文件夹路径，进入文件夹会自动退出搜索。
- 文件夹卡片与模型卡片组成自适应网格，空目录有空状态提示。
- 每张卡片的 `⋯` 菜单（右键卡片等效）：**重命名 / 移动到… / 导出 ▸ / 删除**；**右键时菜单在鼠标位置弹出**（再次右键会跟着鼠标移动，超出视口会自动收回边界内），点 `⋯` 则贴在按钮下方（下方放不下时翻到上方）。菜单在滚动网格、点击别处或按 Esc 时关闭；双击卡片名称可原地重命名。
- **导出**子菜单：鼠标移到「导出」上即弹出（触屏点一下同样弹出），列出 CadQuery 能写出的全部格式（STEP / BREP / STL / 3MF / AMF / VRML / VTP / TJS / SVG / DXF），按「精确几何 / 网格 / 二维图纸」分组；子菜单顶部会说明该条目是**精确几何**（保存过 CadQuery 源码）还是**由三角网格重建**。详见[导出](#导出)。
- 「移动到…」会把网格切进选择模式（提示条显示 `把「…」移动到：`）：点一个文件夹卡片或「返回上一级」作为目标，或点「取消」。
- 拖拽移动模型与文件夹：鼠标走 HTML5 拖拽事件；触屏设备长按开始拖拽（带浮动副本），*返回上一级* 同时是「上移一层」的放置目标。
- 网格空白处右键：**新建文件夹 / 刷新**。这个菜单只在**模型库面板范围内**出现，并会被夹在面板内（不会盖到 tab 条或工作台上）；面板之外、以及搜索框等输入控件上右键不拦截，仍旧使用浏览器自己的菜单。右键卡片时它会自动收起（卡片菜单与空白菜单互斥）。
- 删除文件夹**不会删除内容**：其中的模型与子文件夹会上移到被删文件夹的父级。

**工作台**

- 每打开一个模型就新增一个标签，每个标签可单独关闭（`×`）；标签条与模型库共用一个区域。
- three-cad-viewer 完整原生界面：工具栏（视图、剖切、测量、材质、环境、斑马纹……）、左侧导航树、大画布。
- 左键 / 右键旋转、中键平移、滚轮缩放。
- 布局为纯 CSS（flex + `100%`），不与查看器的内联尺寸打架；尺寸变化只用 `ResizeObserver` 重新贴合视图。
- 上游工具栏的 *Pin as PNG*（截图固定）按钮被隐藏——这个面板用于查看模型，不用于导出截图。
- 工具栏上多了一个 **导出** 图标按钮，位置在帮助（`?`）按钮之前（模型导出改用它）：它用的是查看器自己的按钮结构（`tcv_tooltip` + `tcv_button_frame` + `tcv_btn`），因此尺寸、悬停高亮、tooltip 与其它按钮完全一致，只有图标是本插件画的——一枚「箭头入托盘」的图标，配色沿用查看器的 `#444` 描边 + `rgb(83,160,227)` 蓝。点开的格式子菜单与模型库卡片上的**完全一致**，导出的是当前标签页里打开的那个模型。查看器重建工具栏后会重新插回原位；按钮让工具栏换行时画布会重新贴合。
- 查看器硬编码的英文界面（标签、tooltip、帮助表、`<select>` 选项）在运行时遍历 DOM 翻译成中文。
- tab 挂载期间隐藏 dsh 的列宽拖拽手柄，避免透过画布误抓。

**对话内嵌卡片**

- 某轮对话调用过 `add_3dmodel` 或 `build_3dmodel` 时，该消息尾部出现可折叠的模型卡片（`conversation.chat.turnTail`）：左侧标题、右侧 *收起*。
- 卡片上的 *全屏* 会在 **3D模型** tab 里以工作台打开同一模型；若 tab 尚未挂载，请求会排队并在挂载后消费。
- 加载失败时显示重试入口，不会一直停在「准备中」。

**多语言**

- tab 标题跟随 dsh 语言：英文环境显示 `3D Model`，其余显示 `3D模型`。
- tab 与卡片内的其他文案均为中文。

## 环境要求

| | |
|---|---|
| dsh | 可用的 dsh 安装，且已初始化 `web` profile（`dsh web`）；开发环境为 `@deepseek-ai/dsh` 0.1.5-rc.1。 |
| Node.js | 20 或更高（开发环境为 Node 24）。 |
| pnpm | 需在 `PATH` 中：`dsh plugin` 本质是 pnpm 的转发器。 |
| CadQuery | **仅 `build_3dmodel` 与导出需要**：一个装好 `cadquery` 的 Python 环境。`add_3dmodel` 无额外依赖。CadQuery 以 Apache-2.0 发布、**不随本插件分发**，安装由 agent 执行——见 [CadQuery 安装](#cadquery-安装由-agent-执行) 与[第三方声明](#第三方声明)。 |

本插件没有构建步骤，也没有 `prepare` 脚本，因此从 git 安装不需要在 pnpm 的 `allowBuilds` 里放行任何构建。

## 安装

### 从 GitHub 安装

```bash
dsh plugin --profile web add github:CMoyuer/dsh-3dmodel-viewer
```

### 从本地目录安装

```bash
git clone https://github.com/CMoyuer/dsh-3dmodel-viewer.git
cd dsh-3dmodel-viewer
pnpm install          # 插件从自己的 node_modules 解析依赖
dsh plugin --profile web add .
```

`dsh plugin add` 会在 profile 目录里执行 pnpm，然后按**实际安装结果**校正 `dsh.profile.bundles`——声明了 `dsh.bundle` 的包会自动加入插件层，**无需手工编辑**。插件目录若不在 profile 下，请使用绝对路径（或像上面这样在插件目录里执行命令）。

### 启用与验证

服务端插件只在启动时加载，改完需要**重启 dsh web**。随后确认两条路由返回的是插件自己的 content-type：

```bash
dsh --profile web --dump-config                       # 组合树中应出现 id: model-viewer
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:3080/3dmodel/api/items
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:3080/tcv/three-cad-viewer.esm.min.js
```

期望结果：`200 application/json; charset=utf-8` 与 `200 text/javascript; charset=utf-8`。路由缺失时**不是 404**——dsh 的 SPA fallback 会返回 `200 text/html`，所以务必看 content-type，而不是只看状态码。

然后刷新 GUI，打开 **3D模型** tab（位于「画廊」tab 之后）。

## 使用

### 模型库

打开 tab 即为模型库。agent 通过 `add_3dmodel` / `build_3dmodel` 生成的模型会立刻出现在这里（按创建时间排序）。点击卡片即在工作台新标签中打开该模型。

| 操作 | 方式 |
|---|---|
| 打开模型 | 点击卡片 |
| 重命名 | 双击名称，或 `⋯` → 重命名 |
| 移动 | 把卡片拖到目标文件夹（或「返回上一级」），或 `⋯` → 移动到… |
| 导出 | `⋯` → 把鼠标移到「导出」上（或右键卡片后悬停 / 点击），再选格式 |
| 删除 | `⋯` → 删除 |
| 新建文件夹 | 在模型库面板空白处右键 → 新建文件夹（右键卡片会自动收起这个菜单） |
| 搜索 | 使用搜索框（搜索整个模型库） |
| 返回上一层 | 点击「返回上一级」卡片，或把卡片拖到它上面 |

### 导出

右键模型卡片（或点卡片上的 `⋯`），把鼠标移到 **导出** 上，子菜单即出现在菜单**右侧**并与「导出」对齐（右侧空间不足时自动翻到左侧）；触屏点一下「导出」同样弹出，而且**父菜单保持打开**，随时可以回到重命名 / 移动到… / 删除。鼠标移到菜单里的其它选项或移出菜单范围，子菜单立即隐藏（跨到子菜单上去时不会闪），按 Esc、点别处也会收起。选一个格式即开始下载（此时两层菜单一起收起），文件名取自条目标题，扩展名随格式。

**同一个导出入口也在工作台里**：查看器工具栏上的 **导出** 图标按钮（位于 `?` 帮助按钮之前）弹出的是同一个格式子菜单（列表完全一致），导出的就是该标签页里打开的模型；再点一次按钮可以关掉子菜单。

| 分组 | 格式 | 说明 |
|---|---|---|
| 精确几何 | `STEP` `.step` | AP214 实体，通用 CAD 交换格式 |
| 精确几何 | `BREP` `.brep` | OCCT 原生 B-Rep |
| 网格 | `STL` `.stl` | 二进制三角网格，3D 打印 |
| 网格 | `3MF` `.3mf` | 3D 制造格式 |
| 网格 | `AMF` `.amf` | 增材制造格式 |
| 网格 | `VRML` `.wrl` | 虚拟现实建模语言 |
| 网格 | `VTP` `.vtp` | VTK XML PolyData |
| 网格 | `TJS` `.json` | three.js JSON 网格 |
| 二维图纸 | `SVG` `.svg` | 二维投影图纸 |
| 二维图纸 | `DXF` `.dxf` | 二维图纸，CAD 交换 |

导出由 `lib/cadquery_export.py` 在服务端用 `cadqueryPython` 指定的解释器完成，几何来源取决于条目：

- **保存过 CadQuery 源码的条目**（`build_3dmodel` 创建）——重新执行脚本，再交给 CadQuery 自己的 exporter。STEP/BREP 是真正的实体（体积、圆柱面都正确），文件也小。子菜单顶部显示 *已保存 CadQuery 源码 · 导出为精确几何*。
- **只有网格的条目**（`add_3dmodel` 创建，或旧版本入库的）——由存储的三角网格重建，子菜单顶部显示 *仅有网格 · 由三角网格重建几何*：
  - `STEP` / `BREP`：每个三角面做成一个平面片，缝合成壳（闭合时成为实体）。能被 CAD 打开，但**表面是面片化的**，文件也大（约 1 万个三角面 → 20 MB 左右 STEP）。
  - `STL` / `3MF` / `AMF` / `VRML` / `VTP` / `TJS`：把网格挂到 OCCT 面上直接交给 CadQuery 的 exporter，因此导出结果与查看器里看到的三角形完全一致。
  - `DXF`：由这些平面片生成二维投影。
  - `SVG`：由**轮廓 + 特征边**投影而成（不做隐藏线消除——对三角面汤做 HLR 会非常慢，约 1 万个面已经要几分钟），因此网格条目的 SVG 没有虚线隐藏线。

导出在服务端串行执行：一次一个请求，界面会显示进度对话框（可点「后台继续」关掉，下载仍会完成）。约 1 万个三角面的网格导出 STEP/BREP 需要数秒，更大的模型请留出时间；服务端单次导出上限由 `cadqueryExportTimeout`（默认 5 分钟）控制。

### 工作台

每个打开的模型对应顶部标签条里的一个标签，点 `×` 关闭并回到模型库。画布铺满面板；查看器自身的工具栏与导航树与上游完全一致，区别只有：*Pin as PNG* 按钮被移除、界面文案为中文、工具栏上多了一个 **导出** 图标按钮（在 `?` 帮助按钮之前，风格与查看器其它按钮一致；格式列表与模型库卡片相同，导出当前这个模型）。

### 内嵌卡片

只要某轮对话调用了模型工具，该消息末尾就会出现对应卡片：左侧标题，*收起* 折叠，*全屏* 以工作台打开。卡片优先直接渲染工具调用参数里携带的几何；没有几何时才回源查询条目（先按 id，再按标题，最后取最新条目），几秒内查不到会显示 *重试*。因此在模型库删除条目不会清空已经渲染出来的卡片，但没有内联几何的卡片在重新加载时可能回退到别的条目或加载失败。

## Agent 工具

### `add_3dmodel`

```jsonc
{
  "model":  { /* three-cad-viewer Shape JSON，必填 */ },
  "title":  "Bracket",   // 可选；参与去重键
  "height": 320           // 可选；内嵌卡片画布高度（px）
}
```

`model` 是一份 [three-cad-viewer `Shape`](https://github.com/bernhard-42/three-cad-viewer) 文档：`{ version, parts[] }`，每个 part 带 `shape: { vertices, triangles, normals, edges, … }` 以及可选的 `name`、`color`、`alpha`。**相同几何 + 相同标题**再次调用只会更新原条目，不会重复入库（见[数据与存储](#数据与存储)）。

### `build_3dmodel`

```jsonc
{
  "script":    "import cadquery as cq\nmodel = cq.Workplane('XY').box(20, 20, 10)",  // 必填
  "title":     "Box 20×20×10",  // 可选
  "tolerance": 0.1              // 可选，tessellation 容差
}
```

脚本会写入临时文件并用配置的 CadQuery 解释器执行；生成的实体被 tessellate 成 `Shape`（逐顶点平滑法线、边界边、包围盒）后入库。脚本报错或没有给 `model` 赋值时返回 `{ "ok": false, "error": … }`——失败会如实报告为失败，而不是入库一个空模型。CadQuery 由 [CadQuery 项目](https://github.com/CadQuery/cadquery)开发并以 Apache-2.0 发布，本插件不随包分发它（见[第三方声明](#第三方声明)）。

几点值得知道的行为：

- **脚本会被保存进条目**（`script`，上限 256 KB）。因此这类条目在模型库里右键 **导出 ▸** 时能重跑脚本、输出**精确几何**（CadQuery 支持的全部 10 种格式，STEP/BREP 是真正的实体）；列表元数据里的 `hasSource` 就是它。详见[导出](#导出)。
- **单位就是 CadQuery 的单位**（通常是 mm），插件不做换算；尺寸写在模型里，标题里的 `mm` 只是文字。
- **去重键是「几何 + 标题」**：相同几何 + 相同标题再次调用只会更新原条目（并刷新保存的源码），不会产生第二条。
- **单个实体**：`model` 必须是带 `.tessellate()` 的 `cq.Workplane` / `cq.Shape`。装配体需要先转换，例如 `model = assy.toCompound()`；直接赋一个 `cq.Assembly` 会返回 `{ "ok": false, "error": "tessellate error: …" }`。

## CadQuery 建模

`build_3dmodel` 的脚本就是普通 Python，要求：

- `import cadquery as cq` 并给 **`model`** 赋值——`cq.Workplane` 或 `cq.Shape`（任何带 `.tessellate(tol)` 的对象）；装配体请先转换：`model = assy.toCompound()`；
- 可选模块级 `name`（零件名，默认 `Part`）与 `color`（十六进制，默认 `#e8b024`）；
- 单位就是 CadQuery 单位（通常 mm），插件不做换算。

```python
import cadquery as cq

name = "Bracket"
color = "#3b82f6"

model = (
    cq.Workplane("XY")
    .box(40, 20, 6)
    .faces(">Z")
    .workplane()
    .hole(6)
)
```

细节：

- 解释器由 `cadqueryPython` 指定（默认 `D:\AI\3DModels\.venv\Scripts\python.exe`，**请改成你机器上的路径**）；执行器是 `lib/cadquery_build.py`。
- 两个脚本都在 `import cadquery` **之前**先 `import vtkmodules.vtkCommonDataModel`，用于规避 Windows 上 OCCT/VTK 的 DLL 加载冲突；该导入是**容错**的——它不会掩盖真正的错误，VTK 或 CadQuery 缺了什么都会由 CadQuery 的导入错误如实报出来（见下一节）。
- 单次构建超时 60 秒，stdout 上限 64 MB，大装配体请注意容差设置。
- 生成的文档走与 `add_3dmodel` 相同的存储路径，因此会同时出现在模型库与内嵌卡片中。
- 没装 CadQuery 时，`build_3dmodel` 与导出都会返回带**安装命令**的错误，而不是堆栈——照它执行即可（细节见 [CadQuery 安装](#cadquery-安装由-agent-执行)）。

## CadQuery 安装（由 agent 执行）

CadQuery **不随本插件分发**：`build_3dmodel` 与全部导出都是通过 `cadqueryPython` 配置项去调用**你机器上已安装的** CadQuery。所以你不需要自己研究安装——直接对 agent 说「装一下 CadQuery / 我要能导出 STEP」，它会按下面的流程做完。

### agent 会执行的流程

1. **探测**：调用 `cadquery_env` 工具（只读，注册在本插件上）。它返回解释器路径与 Python 版本、`cadquery` / `OCP` / `vtkmodules` / `ezdxf` 各自能否导入、缺哪些、以及**应该跑的确切命令**。手工等价物是 `<python> lib/cadquery_probe.py`。
2. **安装**：在终端执行它给出的命令，典型是

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

   网速慢或被墙时加镜像：`-i https://pypi.tuna.tsinghua.edu.cn/simple`。
3. **指向它**：把解释器路径写进 profile 的 `cordis.patch.yml`（按插件 id 覆盖配置）：

   ```yaml
   - id: model-viewer
     config:
       cadqueryPython: 'D:\AI\3DModels\.venv\Scripts\python.exe'
   ```

   路径含空格时保留单引号；Windows 路径里的反斜杠在 YAML 单引号内是字面量，无需转义。
4. **重启**：服务端配置只在启动时读取，所以要重启 `dsh web`（`dev/restart-verify.ps1` 会做预检 + 健康检查 + 失败自动回滚）。
5. **复验**：再调用一次 `cadquery_env`，应显示四个包都有版本且「建模与导出可用」；或直接导出一次 STEP 收尾。

### 为什么是 `pip install cadquery vtk` 两个包

**VTK 不是 cadquery 的声明依赖，但缺了它连 `import cadquery` 都过不去**：`cadquery 2.4.0` 的 `cadquery/occ_impl/exporters/__init__.py` 在模块顶层就 `from .vtk import exportVTP`，而 `exporters/vtk.py` 第一行是 `from vtkmodules.vtkIOXML import vtkXMLPolyDataWriter`；但 PyPI 上 `cadquery 2.4.0` 的 `requires_dist` 里没有 vtk。结果是：只 `pip install cadquery` 的环境里 `import cadquery` 直接失败，建模与**全部**导出都不可用。所以请一次装上两个包（`pip install cadquery vtk`）：CadQuery 能导入，且 **VTP** 导出（唯一在导出阶段直接调用 VTK 的格式）可用。`cadquery_env` 会把这种「cadquery 装了但导入失败、根因是缺 vtk」的情形直接点出来。

### 版本与平台要求

| | |
|---|---|
| Python | ≥ 3.8（`cadquery 2.4.0` 的 `requires-python`）。开发与验证环境为 **Python 3.12 + cadquery 2.4.0 + cadquery-ocp 7.7.2 + VTK 9.7.0 + ezdxf 1.4.4**。 |
| 轮子平台 | `cadquery-ocp` 提供 Windows / Linux / macOS(arm64) 轮子。没有匹配轮子的平台（例如很老的 glibc）改用 conda：`mamba install -c conda-forge cadquery`，再把 `cadqueryPython` 指向该环境的 python。 |
| 装在哪台机器 | **只有运行 `dsh web` 的那台**需要装；浏览器端、其它设备都不需要（模型库与导出都在服务端完成）。 |
| 磁盘/时间 | `cadquery-ocp` 与 `vtk` 都是数百 MB 级的轮子，首次安装请留出时间和空间。 |

### 验证与排错

- 一句话验证：`"<python>" -c "import cadquery, vtkmodules, ezdxf; print(cadquery.__version__)"`（能打印版本即通过）。
- 结构化验证：`"<python>" lib/cadquery_probe.py`，或直接调用 `cadquery_env` 工具。
- 报 `ImportError: vtkmodules…` / 各种 DLL 加载错误：先确认 `<python> -c "import vtkmodules.vtkCommonDataModel"` 单独能过；两个插件脚本已经按「先 VTK 后 cadquery」的顺序导入以规避 Windows 上的 OCCT/VTK 冲突，并且这一步是**容错**的（失败不会掩盖真正的错误，CadQuery 的导入错误会被如实报出来）。
- 导出时提示 `VTP 导出需要 VTK`：该解释器的 `vtkmodules` 不可用，`<python> -m pip install vtk`（注意缺 VTK 时 CadQuery 也导入不了，通常是同一个根因）。
- 改了 `cadqueryPython` 不生效：忘了重启 `dsh web`（配置只在启动时读）。
- 报「解释器不存在」：`cadqueryPython` 指到了不存在的路径——`cadquery_env` 会直接给出建 venv + 安装 + 配置 + 重启的完整序列。

## HTTP API

所有路由注册在 dsh web server 上；`apiPrefix` 默认 `/3dmodel`，`assetPrefix` 默认 `/tcv`。

### 静态资源

| 方法 | 路由 | 说明 |
|---|---|---|
| `GET`/`HEAD` | `/tcv/<file>` | 返回插件 `assets/` 中的文件（three-cad-viewer ESM 构建、CSS、类型声明）。拒绝路径穿越；受 `maxUrlLength` 限制。 |

### 模型

| 方法 | 路由 | 说明 |
|---|---|---|
| `GET` | `/3dmodel/api/items` | 列出模型元数据。查询参数：`session=<id>`、`workspace=<path>`、`onlySession=1`。`onlySession=1` 且有 `session` 时按会话过滤；否则非空 `workspace` 按工作区过滤。每条元数据带 `hasSource`（是否保存了 CadQuery 源码）。 |
| `POST` | `/3dmodel/api/items` | 保存模型。Body：`{ model, title?, name?, sessionId?, workspace?, folder?, height?, script? }`，返回 `{ ok, id, name, title, createdAt }`。`script` 会被保留（上限 256 KB），供导出时重建精确几何。 |
| `GET` | `/3dmodel/api/items/:id` | 读取单个完整条目（含 `Shape` JSON 与可能的 `script`）。 |
| `PATCH` | `/3dmodel/api/items/:id` | 更新 `title`、`name` 和/或 `folder`。 |
| `DELETE` | `/3dmodel/api/items/:id` | 删除单个条目。 |

### 导出

| 方法 | 路由 | 说明 |
|---|---|---|
| `GET` | `/3dmodel/api/items/formats` | 列出可导出的格式（`{ id, ext, label, desc, group }`）。客户端菜单由此生成，因此菜单不会与 `cadquery_export.py` 实际支持的能力脱节。 |
| `GET`/`HEAD` | `/3dmodel/api/items/:id/export?format=STEP` | 导出该条目并以附件下载（`content-disposition: attachment`，文件名取自标题，含 RFC 5987 的 `filename*` 以便中文标题正确落地）。`format` 取 `formats` 里的 `id`；未知格式返回 `400`，条目不存在返回 `404`，方法不对返回 `405`，导出器报错返回 `500`（JSON：`{ ok: false, error: … }`）。 |

### 文件夹

| 方法 | 路由 | 说明 |
|---|---|---|
| `GET` | `/3dmodel/api/items/folders` | 列出全部文件夹（`{ id, name, parent, createdAt }`）。 |
| `POST` | `/3dmodel/api/items/folders` | 新建文件夹：`{ name, parent? }`（`""` 表示根目录）。 |
| `PATCH` | `/3dmodel/api/items/folders/:id` | 重命名（`name`）和/或改父级（`parent`）。把文件夹移入自身或其子孙会被拒绝。 |
| `DELETE` | `/3dmodel/api/items/folders/:id` | 删除文件夹；其中的模型与子文件夹上移一层。 |

说明：

- 请求体受 `maxBodyBytes` 限制（默认 32 MB）；id 必须是 UUID 形式。
- 响应统一为 `application/json; charset=utf-8`，API 错误同样是 JSON（`{ ok: false, error: … }`，配 `400`/`404`）。只有静态资源路由和少数协议层拒绝返回纯文本：`400 bad id`、`405 method not allowed`、`414 uri too long`，以及 `/tcv/<file>` 的 `403`/`404`。
- 随插件分发的 Web 客户端使用**默认前缀**（`/3dmodel`、`/tcv`），路径是硬编码的。因此修改 `apiPrefix`/`assetPrefix` 时必须同时改 `lib/client.js`。

## 配置项

通过 dsh 配置树（schemastery）配置，例如写在 profile 的 `cordis.patch.yml` 中：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `assetPrefix` | `/tcv` | three-cad-viewer 静态资源前缀。 |
| `apiPrefix` | `/3dmodel` | 模型存储 API 前缀。 |
| `dataDir` | `<插件目录>/data` | 模型存储目录。**不要让两个 dsh 实例并发写同一个目录**。 |
| `maxUrlLength` | `2048` | 静态资源路由接受的 URL 最大长度。 |
| `maxBodyBytes` | `33554432`（32 MB） | JSON 请求体上限。 |
| `cadqueryPython` | `D:\AI\3DModels\.venv\Scripts\python.exe` | 装好 CadQuery 的 Python 解释器，供 `build_3dmodel` 与模型导出使用；请改成你机器上的路径。 |
| `cadqueryTolerance` | `0.1` | 默认 tessellation 容差（也用于导出网格格式）。 |
| `cadqueryExportTimeout` | `300000`（5 分钟） | 单次导出的最长执行时间（毫秒）。大网格导出 STEP/BREP 可能很慢，可按需调大。 |

## 数据与存储

- 每个模型一个文件：`<dataDir>/<uuid>.json`；文件夹列表单独存在 `<dataDir>/folders.meta.json`。
- `build_3dmodel` 创建的条目会额外保存一份 `script`（CadQuery 源码，上限 256 KB），导出时据此重建精确几何；`add_3dmodel` 的条目没有它，导出只能基于网格。
- 条目带内容指纹 `h`：对 `Shape` JSON 做规范化（递归排序键、丢弃 `parts[].name`/`id`）后取 SHA-256。相同几何 + 相同标题的保存会返回既有条目而不再新建；期间会重试若干次，使并发保存收敛到同一个文件。指纹只看几何，因此同几何同标题重新入库会顺带刷新 `script`。
- 启动时会重算指纹，旧版本写入的条目会被就地升级。
- 启动时会清理写入中断遗留的 `*.json.tmp`。
- 写入直接落到最终文件（没有原子 rename）。**若模型库对你重要，请自行备份 `<dataDir>`**；本仓库的 `.gitignore` 排除该目录，正因为它属于用户数据。

删除模型只删除该条目本身：对话中已渲染的卡片仍保留其几何，`dataDir` 之外的内容不受影响。

## 目录结构

```
dsh-model-viewer/
├── lib/
│   ├── index.js            # 服务端：/tcv + /3dmodel 路由、三个工具、导出下载
│   ├── client.js           # 客户端：3D模型 tab（模型库/工作台）+ 内嵌模型卡片 + 导出子菜单与工具栏按钮
│   ├── cadquery_build.py   # CadQuery 脚本 -> three-cad-viewer Shape JSON
│   ├── cadquery_export.py  # 模型 -> CadQuery 支持的全部导出格式
│   └── cadquery_probe.py   # 探测解释器里的 cadquery/OCP/VTK/ezdxf（cadquery_env 工具用它）
├── dev/                    # 开发用脚本（不参与运行时）
│   ├── route-test.mjs      # 服务端路由级测试（伪 ctx，真跑 CadQuery 导出与 cadquery_env）
│   ├── client-render-test.mjs  # 客户端渲染测试（伪 React/DOM，跑通菜单->导出->下载）
│   ├── make-icon-preview.mjs   # 把工具栏导出图标与查看器原生图标并排渲染，便于比对风格
│   ├── make-toolbar-layout.mjs # 用真实查看器 + 真实插件 CSS 量工具栏盒模型与分隔线间距（无头浏览器）
│   ├── dump-css.mjs        # 从客户端 bundle 里导出插件注入的 CSS（上面那个脚本用它）
│   ├── block-import.py     # 屏蔽某个包后再跑插件脚本，用于验证「没装 VTK / 没装 CadQuery」的行为
│   └── restart-verify.ps1  # 安全重启 + 健康检查 + 失败回滚（日志 restart-log.log）
├── assets/                # 随插件分发的 three-cad-viewer 构建产物（见 assets/README.md）
│   ├── three-cad-viewer.esm.min.js
│   ├── three-cad-viewer.css
│   └── index.d.ts
├── cordis.patch.yml       # bundle patch：插入 `id: model-viewer`
├── package.json           # type: module；dsh.bundle.patch + dsh.client.web
├── README.md              # 英文文档
├── README.zh-CN.md        # 中文文档
├── CHANGELOG.md
├── LICENSE
├── .gitignore             # 排除 node_modules/、模型库 data/ 与备份目录
└── .gitattributes         # LF 行尾；不对随包分发的构建产物做 diff
```

两半如何衔接：

- `cordis.patch.yml` 把插件插入为 `model-viewer`；dsh 在服务端加载 `lib/index.js`，并因为 `dsh.client.platform` 为 `web`，把 `lib/client.js` 作为 `window.__ModuleLoader__` 模块（客户端 id `dsh-model-viewer`）加载进浏览器。
- 服务端注册一个静态资源前缀路由与一个模型 API 前缀路由，并在 `ctx.tools` 上注册两个工具。
- 客户端注册 `conversation.view` slot（`id: "model"`、`order: 21`）承载 tab，注册 `conversation.chat.turnTail` slot 承载内嵌卡片，并用普通 `fetch` 访问 API。

## 开发

没有打包器，也没有编译步骤。

- **服务端改动**（`lib/index.js`、`lib/cadquery_build.py`）必须**重启 `dsh web`** 才生效；web-app 配置禁用了 HMR，改动不会被热加载。`lib/cadquery_export.py` 是**例外**：它每次导出都被重新启动为独立进程，改完立即生效。
- **客户端改动**（`lib/client.js`）由浏览器在页面加载时读取——刷新 GUI 即可。`lib/client.js` 是一个预先打包好的 `window.__ModuleLoader__` 模块（独立文件，不是 npm 包），直接编辑它就是预期的工作方式。

`dev/` 下有三个可以独立运行的验证脚本：

```bash
node dev/route-test.mjs           # 伪 ctx 挂载插件，跑通 /formats 与 10 种格式的真实导出
node dev/client-render-test.mjs   # 伪 React/DOM 渲染客户端，跑通 菜单 -> 导出 -> 下载
powershell -File dev/restart-verify.ps1   # 预检 + 重启 + 健康检查 + 失败自动回滚
```

`restart-verify.ps1` 会杀掉正在运行的 dsh（因此也会杀掉正在跑它的 agent 会话），所以它必须**以分离进程启动**，结果写在 `dev/restart-log.log`：

```powershell
Invoke-CimMethod -ClassName Win32_Process -MethodName Create `
  -Arguments @{ CommandLine = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\AI\Plugins\dsh-model-viewer\dev\restart-verify.ps1' }
```

它的健康检查除了两条基础路由，还会真实下载 STL / STEP / SVG / DXF / 3MF / VTP 各一份并检查字节数与响应头；任何一项失败就写禁用 patch 并重启（`RESULT=plugin-rolled-back`），保证 GUI 可用。

安全重启流程——插件加载时抛错会让整个插件树失败、GUI 掉线：

1. **预检**：先用一个小的 ESM 脚本单独 import 插件，校验 `name`、`inject`、以及 `Config` 能否解析；确认通过后再动正在运行的 dsh。
2. **停旧**：结束正在运行的 dsh web 进程，等待端口（默认 `3080`）释放。
3. **启新**：以独立进程启动，stdout/stderr 落盘。重启 helper 必须位于 dsh 进程树之外，否则杀 dsh 会连带终止 helper 自己。
4. **健康检查**：用[安装](#启用与验证)里的两条 `curl` 探测——注意检查 **content-type**，因为未知路径会被 SPA fallback 以 `200 text/html` 返回。
5. **失败回滚**：写一份禁用 patch 并用它重启，

   ```yaml
   - id: model-viewer
     disabled: true
   ```

   ```bash
   dsh --profile web --patch disable.yml --dump-config   # 确认插件已摘除
   ```

   然后读取启动日志尾部，报告真正的报错。

改代码时需要守住的几条：

- `inject` 必须列出 `apply` 中访问的**每一个** `ctx.*` 服务（`webServer`、`tools`）；漏写会抛 `cannot get property "X" without inject`，并让整棵树加载失败。
- `schemastery` 的对象字段默认可选，没有 `.optional()` 方法；默认值用 `.default()` 表达。
- 在 `ctx.effect` 中注册的路由必须返回 disposer（本插件返回一个同时注销两条路由的闭包）。

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 看不到 **3D模型** tab | 客户端半未加载，或插件不在 `dsh.profile.bundles` 中。检查 `dsh --profile web --dump-config` 与浏览器控制台。 |
| `/3dmodel/api/items` 返回 `200 text/html` | 插件未挂载，拿到的是 SPA fallback。看启动日志里的加载错误。 |
| 查看器一片空白 | `/tcv/three-cad-viewer.esm.min.js` 路由失败（看 content-type），或浏览器拦截了动态 `import()`。加载失败时面板内会显示 `three-cad-viewer 加载失败: …`。 |
| `build_3dmodel` 立即失败 | `cadqueryPython` 指向的解释器没有装 CadQuery；改指向装好 `cadquery` 的 venv。 |
| `build_3dmodel` 在 Windows 上报 DLL/import 错误 | `lib/cadquery_build.py` 所规避的 OCCT/VTK 冲突——确认该文件的 import 顺序没有被改动。 |
| 保存模型返回 `500` | 请求体超过 `maxBodyBytes`，或 `dataDir` 不可写。 |
| 导出返回 `500 ✗ CadQuery …` | `cadqueryPython` 指向的解释器没有装 CadQuery（导出与 `build_3dmodel` 共用它）。 |
| 导出很慢或超时 | 只有网格的条目导出 STEP/BREP 需要把每个三角面缝合成 B-Rep，约 1 万个面要数秒、面更多的会到几十秒；调大 `cadqueryExportTimeout`，或改用网格格式（STL/3MF），或让模型由 `build_3dmodel` 生成（保存源码后导出走精确几何，快得多）。 |
| 导出的 STEP 在 CAD 里是一堆三角面片 | 该条目只有网格（没有源码），STEP/BREP 是由三角面重建的。用 CadQuery 脚本重建并入库即可得到真实曲面。 |
| 网格条目的 SVG 没有虚线（隐藏线） | 对三角面汤做隐藏线消除（HLR）代价极高，因此网格条目改用「轮廓 + 特征边」投影；带源码的条目仍然是 CadQuery 的完整 HLR 图纸。 |
| 选完格式后浏览器没有下载 | 导出对话框里会显示原因（例如 CadQuery 解释器路径不对）。也可直接访问 `/3dmodel/api/items/<id>/export?format=STEP` 看服务端返回的 JSON 错误。 |
| 同一个模型出现两条 | 去重键是**几何 + 标题**；标题不同（或网格不同）的条目会被视为不同的模型。 |
| 插件换目录后模型库空了 | `dataDir` 默认是 `<插件目录>/data`；插件装到别的路径就会得到一个空库。把旧的 `data/` 拷过去，或把 `dataDir` 指向它。 |
| 日志出现 `cannot get property "…" without inject` | 使用了某个 `ctx` 服务但没有写进 `inject`。 |
| 改了 `lib/index.js` 没反应 | 没有重启 `dsh web`。 |

## 第三方声明

- **[three-cad-viewer](https://github.com/bernhard-42/three-cad-viewer)** —— MIT，© Bernhard Walter。`assets/` 中的 ESM 构建为随插件分发的预构建产物，使插件自包含、无需构建步骤；其中内嵌 **three.js**（MIT，© Three.js Authors，r184）。详见 [`assets/README.md`](assets/README.md)。
- 上游查看器未做修改；本地化、布局、隐藏截图按钮、鼠标按键绑定等集成逻辑全部位于 `lib/client.js`。
- **[CadQuery](https://github.com/CadQuery/cadquery)** —— Apache License 2.0，© 2015 Parametric Products Intellectual Holdings, LLC。用于 `build_3dmodel` 工具与模型库/工作台的导出功能：脚本 `lib/cadquery_build.py`（建模 → 网格）与 `lib/cadquery_export.py`（模型 → STEP/BREP/STL/3MF/AMF/VRML/VTP/TJS/SVG/DXF）只调用它的公开 API。
  - **CadQuery 不随本插件分发**：插件通过 `cadqueryPython` 配置项指定的 Python 解释器调用**你自己环境里已安装的** CadQuery（开发环境为 Python 3.12 + `cadquery` 2.4.0 + `cadquery-ocp` 7.7.2 + VTK 9.7.0 + `ezdxf` 1.4.4）。未安装时 `build_3dmodel` 与导出会返回带安装命令的错误，`add_3dmodel` 与模型库浏览不受影响。安装步骤见 [CadQuery 安装](#cadquery-安装由-agent-执行)。
  - 经由 CadQuery 间接使用、并在导出路径上实际被调用的组件：**cadquery-ocp**（Apache-2.0，CadQuery 对 Open CASCADE Technology 的 Python 绑定；**OCCT** 本身为 LGPL-2.1 含例外条款）、**ezdxf**（MIT，© 2020 Manfred Moitzi，用于写出 DXF）、**VTK**（BSD，© Ken Martin / Will Schroeder / Bill Lorensen，用于写出 VTP）。
    - 注意：**VTK 并未出现在 cadquery 的依赖声明里**，但 `cadquery 2.4.0` 的 `occ_impl/exporters` 在导入期就会 `import vtkmodules`，所以实际上必须一并安装（`pip install cadquery vtk`）。
  - 各名称、商标与版权归各自所有者；本插件与 CadQuery 项目无从属关系，也未获得其背书。

## 许可证

[MIT](LICENSE) © 2026 CMoyuer
