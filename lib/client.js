window.__ModuleLoader__.load({
	id: "dsh-model-viewer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		// ---------------------------------------------------------------------
		// Fallback model (three-cad-viewer "Shape" JSON, a unit cube) so the
		// viewer always has something to show on first open.
		// ---------------------------------------------------------------------
		var DEFAULT_MODEL = {
			version: 3,
			parts: [
				{
					id: "/Group/Box",
					type: "shapes",
					subtype: "solid",
					name: "Box",
					shape: {
						vertices: [
							-0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5,
							0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
							-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
							-0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
						],
						triangles: [
							1, 2, 0, 1, 3, 2, 5, 4, 6, 5, 6, 7, 11, 8, 9, 11, 10, 8, 15, 13, 12,
							15, 12, 14, 19, 16, 17, 19, 18, 16, 23, 21, 20, 23, 20, 22,
						],
						normals: [
							-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
							1, 0, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, 0,
							0, 1, 0, 0, 1, 0, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1,
							0, 0, 1, 0, 0, 1, 0, 0, 1,
						],
						edges: [
							-0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5,
							-0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5,
							0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5,
							0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5,
						],
						obj_vertices: [
							-0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
							0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,
						],
					},
					state: [1, 1],
					color: "#e8b024",
					alpha: 1.0,
					texture: null,
					loc: [[-0.0, -0.0, 0.0], [0.0, 0.0, 0.0, 1.0]],
					renderback: false,
					accuracy: null,
					bb: null,
				},
			],
			loc: [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]],
			name: "Group",
			id: "/Group",
			normal_len: 0,
			bb: { xmin: -0.5, xmax: 0.5, ymin: -0.5, ymax: 0.5, zmin: -0.5, zmax: 0.5 },
		};

		// ---------------------------------------------------------------------
		// Server-side model store API (shared across devices).
		// ---------------------------------------------------------------------
		function listModels(query) {
			return window
				.fetch("/3dmodel/api/items?" + new URLSearchParams(query || {}).toString())
				.then((r) => (r.ok ? r.json() : { items: [] }))
				.catch(() => ({ items: [] }));
		}
		function getModel(id) {
			return window
				.fetch("/3dmodel/api/items/" + encodeURIComponent(id))
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null);
		}
		function deleteModel(id) {
			return window
				.fetch("/3dmodel/api/items/" + encodeURIComponent(id), { method: "DELETE" })
				.then((r) => r.ok)
				.catch(() => false);
		}
		/** Rename a model and/or move it into a folder (empty string = root). */
		function patchModel(id, patch) {
			return window
				.fetch("/3dmodel/api/items/" + encodeURIComponent(id), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(patch || {}),
				})
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null);
		}
		function listFolders() {
			return window
				.fetch("/3dmodel/api/items/folders")
				.then((r) => (r.ok ? r.json() : { folders: [] }))
				.catch(() => ({ folders: [] }));
		}
		function createFolder(name, parent) {
			return window
				.fetch("/3dmodel/api/items/folders", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: name || "新建文件夹", parent: parent || "" }),
				})
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null);
		}
		/** Rename a folder and/or move it into another folder ("" = root). */
		function renameFolder(id, name) {
			return window
				.fetch("/3dmodel/api/items/folders/" + encodeURIComponent(id), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name }),
				})
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null);
		}
		function moveFolder(id, parent) {
			return window
				.fetch("/3dmodel/api/items/folders/" + encodeURIComponent(id), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ parent: parent || "" }),
				})
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null);
		}
		/** True when `id` is `maybeAncestor` itself or sits below it (drop guard). */
		function folderIsWithin(id, maybeAncestor, folders) {
			var cursor = String(id || "");
			for (var i = 0; i < 64 && cursor; i++) {
				if (cursor === maybeAncestor) return true;
				var hit = (folders || []).filter(function (f) { return f.id === cursor; })[0];
				cursor = hit ? String(hit.parent || "") : "";
			}
			return false;
		}
		/** Delete a folder; its models and child folders move up, never deleted. */
		function deleteFolder(id) {
			return window
				.fetch("/3dmodel/api/items/folders/" + encodeURIComponent(id), { method: "DELETE" })
				.then((r) => r.ok)
				.catch(() => false);
		}

		// ---------------------------------------------------------------------
		// Export (card context menu). The format catalog comes from the server so
		// the menu can never drift from what cadquery_export.py can produce;
		// FALLBACK_EXPORT_FORMATS keeps the menu usable if that call fails.
		// ---------------------------------------------------------------------
		var FALLBACK_EXPORT_FORMATS = [
			{ id: "STEP", ext: ".step", label: "STEP", desc: "AP214 实体，通用 CAD 交换", group: "精确几何" },
			{ id: "BREP", ext: ".brep", label: "BREP", desc: "OCCT 原生 B-Rep", group: "精确几何" },
			{ id: "STL", ext: ".stl", label: "STL", desc: "二进制三角网格，3D 打印", group: "网格" },
			{ id: "3MF", ext: ".3mf", label: "3MF", desc: "3D 制造格式", group: "网格" },
			{ id: "AMF", ext: ".amf", label: "AMF", desc: "增材制造格式", group: "网格" },
			{ id: "VRML", ext: ".wrl", label: "VRML", desc: "虚拟现实建模语言", group: "网格" },
			{ id: "VTP", ext: ".vtp", label: "VTP", desc: "VTK XML PolyData", group: "网格" },
			{ id: "TJS", ext: ".json", label: "TJS", desc: "three.js JSON 网格", group: "网格" },
			{ id: "SVG", ext: ".svg", label: "SVG", desc: "二维投影图纸", group: "二维图纸" },
			{ id: "DXF", ext: ".dxf", label: "DXF", desc: "二维图纸，CAD 交换", group: "二维图纸" },
		];
		var exportFormatsPromise = null;
		/** Every format CadQuery can write (cached for the page's lifetime). */
		function listExportFormats() {
			if (exportFormatsPromise === null) {
				exportFormatsPromise = window
					.fetch("/3dmodel/api/items/formats")
					.then(function (r) { return r.ok ? r.json() : null; })
					.then(function (res) {
						var formats = res && res.formats;
						return Array.isArray(formats) && formats.length ? formats : FALLBACK_EXPORT_FORMATS;
					})
					.catch(function () { return FALLBACK_EXPORT_FORMATS; });
			}
			return exportFormatsPromise;
		}
		/** Download URL of one model in one format. */
		function exportUrl(id, format) {
			return "/3dmodel/api/items/" + encodeURIComponent(id) + "/export?format=" + encodeURIComponent(format);
		}
		/** Filename the server picked (RFC 5987 filename* first, then filename). */
		function filenameOf(res, fallback) {
			try {
				var cd = res.headers.get("content-disposition") || "";
				var star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
				if (star) return decodeURIComponent(star[1].trim());
				var plain = /filename="([^"]+)"/i.exec(cd);
				if (plain) return plain[1];
			} catch (e) {}
			return fallback;
		}

		// ---------------------------------------------------------------------
		// three-cad-viewer lazy loader (served bundle, self-hosted).
		// ---------------------------------------------------------------------
		var viewerPromise = null;
		function loadThreeCadViewer() {
			if (viewerPromise) return viewerPromise;
			if (typeof document !== "undefined") {
				if (document.querySelector("link[href='/tcv/three-cad-viewer.css']") === null) {
					var link = document.createElement("link");
					link.rel = "stylesheet";
					link.href = "/tcv/three-cad-viewer.css";
					document.head.appendChild(link);
				}
			}
			viewerPromise = import(/* @vite-ignore */ "/tcv/three-cad-viewer.esm.min.js");
			return viewerPromise;
		}

		// ---------------------------------------------------------------------
		// Chinese localization for the three-cad-viewer UI. Its labels, tooltips,
		// help table and <select> options are hard-coded English, so they are
		// translated by walking the rendered DOM (idempotent — safe to re-run).
		// ---------------------------------------------------------------------
		var L10N = {
			"Tree": "树", "Clip": "裁剪", "Zebra": "斑马纹", "Material": "材质", "Studio": "工作室",
			"Tools": "工具", "Info": "信息",
			"All": "全部", "Vertex": "顶点", "Edge": "边", "Face": "面", "Solid": "实体",
			"B/W": "黑白", "Gray": "灰度", "Colors": "彩色", "Reflection": "反射", "Normal": "法向",
			"Ambient Light": "环境光", "Direct Light": "平行光", "Metalness": "金属度", "Roughness": "粗糙度",
			"Stripe Count": "条纹数量", "Stripe Opacity": "条纹不透明度", "Direction": "方向",
			"Environment": "环境贴图", "Env Intensity": "环境强度", "Env Rotation": "环境旋转",
			"Use 4K maps": "使用 4K 贴图", "Background": "背景", "Tone Mapping": "色调映射", "Exposure": "曝光",
			"Shadow Intensity": "阴影强度", "Shadow Softness": "阴影柔和度", "AO Intensity": "环境光遮蔽强度",
			"Texture Mapping": "纹理映射",
			"Procedural Studio": "程序化工作室", "Soft Light": "柔光", "High Contrast Studio": "高对比工作室",
			"Bright Neutral": "明亮中性", "Clean Softbox": "干净柔光箱", "Spotlit Setup": "聚光布光",
			"Controlled Light": "可控光照", "Hard Contrast Light": "强对比光",
			"Urban Overcast": "城市阴天", "Outdoor Warm": "户外暖光", "Neutral Industrial": "中性工业",
			"San Giuseppe Bridge": "圣朱塞佩桥",
			"Transparent": "透明", "Gradient Grey": "灰色渐变", "Gradient Dark Grey": "深灰渐变",
			"Solid White": "纯白", "Solid Grey": "纯灰", "Solid Dark Grey": "深灰",
			"PBR Neutral": "PBR 中性", "ACES Filmic": "ACES 电影", "Linear (none)": "线性（无）",
			"Triplanar": "三平面", "Parametric UV": "参数化 UV",
			"Mouse Navigation": "鼠标导航", "Mouse Selection": "鼠标选择", "CAD Object Tree": "CAD 对象树",
			"Measure Mode": "测量模式",
			"Rotate": "旋转", "Rotate up / down": "上下旋转", "Rotate left / right": "左右旋转",
			"Pan": "平移", "Zoom": "缩放", "Pick element": "拾取元素", "Isolate element": "隔离元素",
			"Hide element": "隐藏元素", "Hide other elements": "隐藏其它元素", "Set camera target": "设为相机目标",
			"Click on navigation tree label": "点击导航树标签",
			"(Shows axis-aligned bounding box, AABB)": "（显示轴对齐包围盒 AABB）",
			"Collapse single leafs": "折叠单叶子", "Expand root only": "仅展开根节点",
			"Collapse all nodes": "折叠全部节点", "Expand all nodes": "展开全部节点",
			"Select 1. (and 2.) object": "选择第 1（和第 2）个对象",
			"Use center instead of min distance": "用中心代替最小距离",
			"Filter object types": "过滤对象类型",
			"Unselect last object": "取消选择最后对象", "Unselect all objects": "取消选择全部对象",
			"<left mouse button>": "<鼠标左键>",
			"<mouse wheel> or <middle mouse button>": "<滚轮> 或 <鼠标中键>",
			"Distance": "距离", "Properties": "属性", "Shape": "形状",
			"Material Editor": "材质编辑器",
			"Control material for CAD view, values in %": "控制 CAD 视图材质，数值单位为 %",
			"Intersection": "交集", "Planes": "平面", "Use object color caps": "使用对象颜色封盖",
			"Reset": "重置", "Scale": "缩放", "Clip": "裁剪",
		};
		var L10N_TIP = {
			"Collpase nodes with a single leaf": "折叠只有一个叶子的节点",
			"Expand root node only": "仅展开根节点",
			"Collpase tree": "折叠树", "Expand tree": "展开树",
			"Reset to default clip planes": "重置为默认裁剪平面",
			"Reset to original values": "重置为原始值",
			"Reset to default zebra settings": "重置为默认斑马纹设置",
			"Reset to original material": "重置为原始材质", "Close": "关闭",
			"Edit material of selected object": "编辑所选对象的材质",
			"Set red clipping plane to view direction": "红色裁剪平面朝向视图方向",
			"Set green clipping plane to view direction": "绿色裁剪平面朝向视图方向",
			"Set blue clipping plane to view direction": "蓝色裁剪平面朝向视图方向",
			"Use intersection clipping": "使用交集裁剪", "Show clipping planes": "显示裁剪平面",
			"Use object color caps instead of RGB": "裁剪封盖使用对象颜色",
			"Select stripe color scheme": "选择条纹配色", "Select stripe mapping": "选择条纹映射",
			"Download 4K environment maps (sharper reflections, slower)": "下载 4K 环境贴图（更清晰但更慢）",
			"HDR environment map for lighting and reflections": "用于光照与反射的 HDR 环境贴图",
			"Brightness of the environment lighting": "环境光照亮度",
			"Rotate the environment map around the vertical axis": "绕竖直轴旋转环境贴图",
			"Scene background style": "场景背景样式",
			"Tone mapping algorithm for HDR to display conversion": "HDR 转显示的色调映射算法",
			"Overall brightness of the rendered image": "渲染图像的整体亮度",
			"Darkness of directional shadows on the floor and between objects": "地面与物体间方向阴影的深度",
			"Blur amount for shadow edges (sharp to soft)": "阴影边缘模糊程度",
			"Play animation": "播放动画", "Pause animation": "暂停动画", "Stop and reset animation": "停止并重置动画",
			// Toolbar button tooltips (the " › key" shortcut suffix is kept as-is).
			"Show axes": "显示坐标轴", "Show axes at origin": "在原点显示坐标轴",
			"Show grid": "显示网格", "Show grid xy": "显示 XY 网格",
			"Use perspective camera": "使用透视相机",
			"Show transparent faces": "显示透明面", "Show black edges": "显示黑色边线",
			"Explode shapes": "爆炸视图", "Z-scale": "Z 轴缩放",
			"Measure distance between shapes": "测量形状间距",
			"Show shape properties": "显示形状属性",
			"Copy shape IDs to clipboard": "复制形状 ID",
			"Reset view": "重置视图", "Resize object": "调整对象尺寸",
			"Switch to iso view": "切换到等轴测视图", "Switch to front view": "切换到前视图",
			"Switch to back view": "切换到后视图", "Switch to top view": "切换到顶视图",
			"Switch to bottom view": "切换到底视图", "Switch to left view": "切换到左视图",
			"Switch to right view": "切换到右视图",
			"Pin viewer as png": "将视图固定为 PNG", "Help": "帮助",
			"Toggle axes": "切换坐标轴", "Toggle grid": "切换网格",
			"Select element": "选择元素", "Reset camera": "重置相机",
			// Remaining tooltips (keys copied verbatim from the rendered UI).
			"Show axes at origin (0,0,0)": "在原点显示坐标轴",
			"Show grid xz": "显示 XZ 网格", "Show grid yz": "显示 YZ 网格",
			"Navigation Tree": "导航树", "Clipping Tool": "裁剪工具",
			"Zebra Tool": "斑马纹工具", "Material Selection": "材质选择",
			"Studio Mode": "工作室模式", "Reset to default values": "重置为默认值",
			"4K switching is only available for built-in Poly Haven presets": "仅内置 Poly Haven 预设支持 4K 切换",
			"Screen-space ambient occlusion — darkens crevices and contact areas": "屏幕空间环境光遮蔽（加深缝隙与接触处）",
			"How textures are projected onto surfaces without UV coordinates": "无 UV 坐标时纹理的投影方式",
			// Studio environment-map preset descriptions (file names kept as-is).
			"Poly Haven: studio_small_08.hdr (soft light, neutral, backlight)": "Poly Haven: studio_small_08.hdr（柔光、中性、背光）",
			"Poly Haven: studio_small_03.hdr (high-contrast, softbox + ceiling lamp, crisp)": "Poly Haven: studio_small_03.hdr（高对比、柔光箱+顶灯、清晰）",
			"Poly Haven: white_studio_05.hdr (white, product, bright, neutral lighting)": "Poly Haven: white_studio_05.hdr（白色、产品、明亮、中性光）",
			"Poly Haven: white_studio_03.hdr (white, softbox, reflection, clean)": "Poly Haven: white_studio_03.hdr（白色、柔光箱、反射、干净）",
			"Poly Haven: photo_studio_01.hdr (lighting setup, spotlights)": "Poly Haven: photo_studio_01.hdr（布光、聚光灯）",
			"Poly Haven: studio_small_09.hdr (product lighting, controlled, soft reflections)": "Poly Haven: studio_small_09.hdr（产品布光、可控、柔和反射）",
			"Poly Haven: cyclorama_hard_light.hdr (cyclorama, hard light, contrast)": "Poly Haven: cyclorama_hard_light.hdr（天幕、硬光、高对比）",
			"Poly Haven: canary_wharf.hdr (urban, city, overcast)": "Poly Haven: canary_wharf.hdr（城市、阴天）",
			"Poly Haven: kiara_1_dawn.hdr (dawn, warm, nature, sunrise)": "Poly Haven: kiara_1_dawn.hdr（黎明、暖调、自然、日出）",
			"Poly Haven: empty_warehouse_01.hdr (warehouse, neutral, big space)": "Poly Haven: empty_warehouse_01.hdr（仓库、中性、大空间）",
			"Poly Haven: san_giuseppe_bridge.hdr (bridge, outdoor, GPUOpen reference)": "Poly Haven: san_giuseppe_bridge.hdr（桥、户外、GPUOpen 参考）",
		};
		function localizeViewer(root) {
			if (!root) return;
			try {
				var walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */, null);
				var node;
				var queue = [];
				while ((node = walker.nextNode())) {
					var raw = node.nodeValue;
					var s = raw ? raw.trim() : "";
					if (!s) continue;
					if (L10N[s]) { queue.push([node, raw.replace(s, L10N[s])]); continue; }
					// Clip sliders: N1/N2/N3 -> X/Y/Z labels.
					if (/^N1\b/.test(s)) queue.push([node, raw.replace("N1", "X")]);
					else if (/^N2\b/.test(s)) queue.push([node, raw.replace("N2", "Y")]);
					else if (/^N3\b/.test(s)) queue.push([node, raw.replace("N3", "Z")]);
				}
				for (var i = 0; i < queue.length; i++) queue[i][0].nodeValue = queue[i][1];
				// Clip slider labels: show only the axis name (X / Y / Z).
				var planeSel = [".tcv_lbl_norm_plane1", ".tcv_lbl_norm_plane2", ".tcv_lbl_norm_plane3"];
				var axes = ["X", "Y", "Z"];
				for (var k = 0; k < 3; k++) {
					var pl = root.querySelector(planeSel[k]);
					if (!pl) continue;
					if ((pl.textContent || "").trim() !== axes[k]) pl.textContent = axes[k];
				}
				root.querySelectorAll("input[type=button],input[type=submit]").forEach(function (el) {
					if (L10N[el.value]) el.value = L10N[el.value];
				});
				// Tooltips may carry a shortcut suffix (e.g. "Reset view › R");
				// translate the base text and keep the suffix.
				var tipOf = function (v) {
					if (!v) return null;
					var parts = String(v).split(" › ");
					var base = parts[0];
					if (!L10N_TIP[base]) return null;
					return L10N_TIP[base] + (parts.length > 1 ? " › " + parts.slice(1).join(" › ") : "");
				};
				root.querySelectorAll("[data-tooltip]").forEach(function (el) {
					var t = tipOf(el.getAttribute("data-tooltip"));
					if (t) el.setAttribute("data-tooltip", t);
				});
				root.querySelectorAll("[title]").forEach(function (el) {
					var d = el.getAttribute("title");
					var t = tipOf(d);
					if (t) el.setAttribute("title", t);
					else if (L10N[d]) el.setAttribute("title", L10N[d]);
				});
			} catch (e) {}
		}

		/**
		 * The measure / select tools commit on mouseup, but only for the object the
		 * pointer hovers: three-cad-viewer paints that from its pointermove handler
		 * (handleIdHover → lastObject) and commitSelection then toggles it. A touch tap
		 * delivers no pointermove at all, so a tap is replayed in the order it expects:
		 *   pointermove at the tap point → next frame → mousedown/mouseup
		 *
		 * Clicking an object that is ALREADY picked is a second problem: the viewer reads
		 * that as "start over" and drops the whole picked pair, so a two-point
		 * measurement cannot be edited (pick A, pick B, click A → both gone, and the next
		 * pick begins a new measurement). Such a click is intercepted instead and only
		 * that one point is removed, which leaves the other in place so the next pick
		 * pairs with it.
		 */
		function installTapPick(root, viewer) {
			try {
				if (!root || typeof navigator === "undefined" || !viewer) return;
				var canvas = root.querySelector("canvas");
				if (!canvas || canvas.__dmvTapPick) return;
				canvas.__dmvTapPick = true;

				/**
				 * The object under a client point, as the viewer's own picker sees it.
				 * The shape filter has to be honoured: with it set to "face", an
				 * unfiltered pick can hand back the solid, whose id does not match the
				 * face stored in the tool's point list — and then the point can never be
				 * recognised, let alone removed.
				 */
				var idUnder = function (x, y) {
					try {
						var ctl = viewer.pickingController;
						var idp = ctl && ctl.host && ctl.host.idPicker;
						if (!idp) return null;
						var r = canvas.getBoundingClientRect();
						var opts = {};
						try {
							var menu = viewer.display && viewer.display.shapeFilterDropDownMenu;
							var filter = menu && menu.currentFilter;
							if (filter && filter.length) {
								var topo = filter.filter(function (v) { return v !== null && v !== undefined; });
								if (topo.length) opts.topoFilter = topo;
							}
						} catch (e1) {}
						var res = idp.pickAt(x - r.left, y - r.top, opts);
						var id = res && res.info && res.info.id;
						return id === undefined || id === null ? null : id;
					} catch (e) {
						return null;
					}
				};
				/**
				 * Make the viewer preselect whatever is under the point, right now.
				 * Its own hover path (handleHover) skips this while the camera controls
				 * are busy — which is exactly the case at the moment a touch is released,
				 * so nothing would ever be committed and taps would select nothing.
				 */
				var preselectAt = function (x, y) {
					try {
						var ctl = viewer.pickingController;
						if (!ctl) return;
						if (typeof ctl.onIdHoverMove === "function") ctl.onIdHoverMove({ clientX: x, clientY: y });
						if (typeof ctl.handleIdHover === "function") ctl.handleIdHover();
					} catch (e) {}
				};

				/**
				 * Wipe every trace of the highlight for one object. Clearing the selected
				 * bit alone is not enough: a face is usually hovered at the same moment
				 * (state 3), and dropping to "hover only" leaves it lit on screen — and the
				 * render loop would keep it that way because the pointer is still there.
				 */
				var clearHighlight = function (id) {
					try {
						var nested = viewer.rendered && viewer.rendered.nestedGroup;
						var h = nested && nested.highlight;
						if (h) {
							if (typeof h.setSelected === "function") h.setSelected(Number(id), false);
							if (typeof h.setHover === "function") h.setHover(null);
						}
						var pc = viewer.pickingController;
						if (pc) {
							if (typeof pc.onIdHoverLeave === "function") pc.onIdHoverLeave();
							pc.lastObject = null;
						}
						try { viewer.update(true, false); } catch (e2) {}
					} catch (e) {}
				};

				/** True while one of the viewer's tools (distance / properties / select) is on. */
				var toolActive = function () {
					try {
						var t = viewer.cadTools;
						return !!(t && t.enabledTool !== null && t.enabledTool !== undefined);
					} catch (e) {
						return false;
					}
				};

				/**
				 * A measurement holds two points, and that is the cap: once both are picked,
				 * a click on a third face is simply ignored here, so nothing is added and —
				 * more importantly — the viewer never gets the chance to interpret it as
				 * "start over" and wipe the pair. Tapping one of the two picked faces still
				 * removes it, which is the way to make room.
				 */
				var pairIsFull = function () {
					try {
						var dm = viewer.cadTools && viewer.cadTools.distanceMeasurement;
						return !!(dm && dm.contextEnabled && dm.selectedShapes && dm.selectedShapes.length >= 2);
					} catch (e) {
						return false;
					}
				};

				/**
				 * The picked point under a client point, when that object is part of the
				 * pair. Look only — nothing is changed yet.
				 */
				var pickedIdAt = function (x, y) {
					try {
						var tools = viewer.cadTools;
						var dm = tools && tools.distanceMeasurement;
						if (!dm || !dm.contextEnabled || !dm.selectedShapes || !dm.selectedShapes.length) return null;
						var id = idUnder(x, y);
						if (id === null) return null;
						var nested = viewer.rendered && viewer.rendered.nestedGroup;
						var h = nested && nested.highlight;
						if (!h || typeof h.isSelected !== "function" || !h.isSelected(id)) return null;
						for (var i = 0; i < dm.selectedShapes.length; i++) {
							var s = dm.selectedShapes[i];
							if (s && s.info && String(s.info.id) === String(id)) return id;
						}
						return null;
					} catch (e) {
						return null;
					}
				};
				/** Remove exactly that point from the pair and let the tool redraw. */
				var dropPicked = function (id) {
					try {
						var dm = viewer.cadTools && viewer.cadTools.distanceMeasurement;
						if (!dm || !dm.selectedShapes) return false;
						var arr = dm.selectedShapes;
						var hit = false;
						for (var i = arr.length - 1; i >= 0; i--) {
							var s = arr[i];
							if (s && s.info && String(s.info.id) === String(id)) {
								arr.splice(i, 1);
								hit = true;
							}
						}
						if (!hit) return false;
						clearHighlight(id);
						try { if (typeof dm._hideMeasurement === "function") dm._hideMeasurement(); } catch (e2) {}
						try { if (typeof dm._updateMeasurement === "function") dm._updateMeasurement(); } catch (e3) {}
						try { viewer.update(true, false); } catch (e4) {}
						return true;
					} catch (e) {
						return false;
					}
				};

				/**
				 * Mouse: a click is judged on RELEASE, and only when the pointer barely
				 * moved. Acting on the press instead would silently drop a point whenever
				 * an orbit happens to start on an already-picked face — and the release
				 * still has to be kept from the viewer, whose mouseup commits the hovered
				 * object and would put the point straight back.
				 */
				/**
				 * Mouse — the version that works on a desktop, kept deliberately minimal.
				 *
				 * Everything is left to the viewer, with ONE exception: clicking a face that
				 * is already part of a measurement is taken over, because the viewer reads
				 * that as "start over" and drops the whole pair. It is judged on release and
				 * only when the pointer barely moved, so an orbit that happens to start on a
				 * picked face keeps it.
				 */
				// After a tap the browser emits a synthetic mousedown/mouseup pair of its own.
				// Those must not be treated as a second click.
				var syntheticUntil = 0;
				var mDownX = 0, mDownY = 0, mDownAt = 0, mDownPicked = null;
				canvas.addEventListener("mousedown", function (e) {
					if (e.button !== 0) { mDownPicked = null; return; }
					// No tool: the viewer is left entirely alone, exactly as on a desktop.
					if (!toolActive()) { mDownPicked = null; return; }
					if (Date.now() < syntheticUntil) {
						mDownPicked = null;
						e.preventDefault();
						e.stopPropagation();
						return;
					}
					mDownX = e.clientX;
					mDownY = e.clientY;
					mDownAt = Date.now();
					// Asked before the hover slot is refreshed: refreshing can release the
					// very object we are inspecting.
					mDownPicked = pickedIdAt(e.clientX, e.clientY);
					preselectAt(e.clientX, e.clientY);
				}, true);
				canvas.addEventListener("mouseup", function (e) {
					if (Date.now() < syntheticUntil) {
						mDownPicked = null;
						e.preventDefault();
						e.stopPropagation();
						return;
					}
					var id = mDownPicked;
					mDownPicked = null;
					if (id === null || e.button !== 0) return;
					var moved = Math.abs(e.clientX - mDownX) + Math.abs(e.clientY - mDownY);
					if (moved > 5 || Date.now() - mDownAt > 600) return; // that was an orbit, not a click
					if (id !== null) {
						// Clicking a picked face: that one point goes.
						if (dropPicked(id)) {
							e.preventDefault();
							e.stopPropagation();
						}
						return;
					}
					// Both points already picked: a third is not accepted, and the viewer must
					// not see the click either (it would wipe the pair and start over).
					if (pairIsFull()) {
						e.preventDefault();
						e.stopPropagation();
					}
				}, true);

				if (!navigator.maxTouchPoints) return;
				var downAt = 0, downX = 0, downY = 0;
				canvas.addEventListener("touchstart", function (e) {
					if (!e.touches || e.touches.length !== 1) { downAt = 0; return; }
					downAt = Date.now();
					downX = e.touches[0].clientX;
					downY = e.touches[0].clientY;
				}, { passive: true });
				/**
				 * Touch — the same minimal arrangement, with one touch-only problem solved.
				 *
				 * The viewer commits whatever is in its hover slot, and a tap never puts
				 * anything there, so the object under the finger is preselected here and the
				 * browser's own synthetic click then does the committing — exactly the path a
				 * mouse takes. Nothing is replayed and nothing else is committed, because a
				 * synthetic pair on top of the browser's own would commit twice and a tap
				 * would select and deselect itself.
				 */
				canvas.addEventListener("touchend", function (e) {
					if (!downAt) return;
					var dur = Date.now() - downAt;
					downAt = 0;
					var t = e.changedTouches && e.changedTouches[0];
					if (!t || dur > 250) return;
					// A finger wanders more than a mouse: allow 24px before calling it a drag.
					if (Math.abs(t.clientX - downX) > 24 || Math.abs(t.clientY - downY) > 24) return;
					// No tool: nothing to do here — the browser's own synthetic click drives
					// the viewer, which is what keeps a plain selection working and single.
					if (!toolActive()) return;
					var x = t.clientX, y = t.clientY;
					var hitId = pickedIdAt(x, y);
					if (hitId === null && pairIsFull()) {
						// Both points are taken: this tap changes nothing, and the synthetic
						// click that follows must not reach the viewer either.
						syntheticUntil = Date.now() + 800;
						return;
					}
					preselectAt(x, y);
					if (hitId !== null && dropPicked(hitId)) {
						// A tap on a picked face: that one point is gone, and the synthetic
						// click that follows must be kept away or the viewer puts it back.
						syntheticUntil = Date.now() + 800;
						return;
					}
					/**
					 * Otherwise the browser's synthetic click does the work. If this build
					 * never sends one, nothing would land — so the tool's own list is checked
					 * once, late enough that the synthetic click has certainly passed, and a
					 * single commit is made only when the count really did not change.
					 */
					var dm = viewer.cadTools && viewer.cadTools.distanceMeasurement;
					var before = dm && dm.selectedShapes ? dm.selectedShapes.length : -1;
					if (before < 0) return;
					setTimeout(function () {
						try {
							if (dm.selectedShapes.length !== before) return; // it landed
							var ctl = viewer.pickingController;
							if (ctl && typeof ctl.commitSelection === "function") {
								preselectAt(x, y);
								ctl.commitSelection(false);
							}
						} catch (e) {}
					}, 150);
				}, { passive: true });
			} catch (e) {}
		}

		/**
		 * three-cad-viewer paints its highlight from a shader texture, with the colours in
		 * uniforms: uHighlightSelectedColor (#53a0e3 by default) and uHighlightHoverColor
		 * (#89b9e3). Both are blue, so on a blue part (our own default is #3b9eff) neither
		 * stands out.
		 *
		 * The selected colour is pushed to the complementary hue of the model, which
		 * contrasts with the part whatever colour it is. The hover colour is deliberately
		 * NOT a lighter version of it: the two states must never be confused, because a
		 * face that is merely hovered is not selected. It becomes a near-neutral light
		 * grey instead, which reads as "under the cursor" on any part colour.
		 */
		function modelHue(model) {
			try {
				var parts = (model && model.parts) || [];
				for (var i = 0; i < parts.length; i++) {
					var c = parts[i].color;
					if (typeof c === "number") {
						var r = ((c >> 16) & 255) / 255;
						var g = ((c >> 8) & 255) / 255;
						var b = (c & 255) / 255;
						var max = Math.max(r, g, b);
						var min = Math.min(r, g, b);
						var d = max - min;
						if (d < 0.06) continue; // grey: carries no usable hue
						var h;
						if (max === r) h = ((g - b) / d) % 6;
						else if (max === g) h = (b - r) / d + 2;
						else h = (r - g) / d + 4;
						h = h / 6;
						if (h < 0) h += 1;
						return h;
					}
				}
			} catch (e) {}
			return 0.58; // roughly the blue of our own default parts
		}
		function applyHighlightColors(viewer, model) {
			try {
				var nested = viewer && viewer.rendered && viewer.rendered.nestedGroup;
				var u = nested && nested.highlight && nested.highlight.uniforms;
				if (!u) return;
				var hue = (modelHue(model) + 0.5) % 1; // complementary
				var sel = u.uHighlightSelectedColor && u.uHighlightSelectedColor.value;
				var hov = u.uHighlightHoverColor && u.uHighlightHoverColor.value;
				if (sel && typeof sel.setHSL === "function") sel.setHSL(hue, 1.0, 0.5);
				// Barely-tinted light grey: readable as "under the cursor" on any part, and
				// impossible to mistake for the saturated selected colour.
				if (hov && typeof hov.setHSL === "function") hov.setHSL(hue, 0.18, 0.78);
			} catch (e) {}
		}

		// ---------------------------------------------------------------------
		// Mount a three-cad-viewer instance into `host` and render `model`.
		// Returns a dispose() function.
		// ---------------------------------------------------------------------
		/**
		 * Put the export button just before three-cad-viewer's help button, i.e. at
		 * the end of its action buttons (where the user asked for it).
		 */
		function placeToolbarExportButton(bar, node) {
			var help = typeof bar.querySelector === "function" ? bar.querySelector(".tcv_button_help") : null;
			var helpItem = help && help.closest ? help.closest(".tcv_tooltip") : null;
			if (helpItem && helpItem.parentNode === bar) {
				if (node.nextSibling !== helpItem) bar.insertBefore(node, helpItem);
				return;
			}
			if (node.parentNode !== bar || node !== bar.lastChild) bar.appendChild(node);
		}

		/**
		 * Append the 导出 button to a mounted viewer's toolbar, so exporting sits
		 * with three-cad-viewer's own controls. Idempotent: the viewer re-renders
		 * its toolbar and the mutation observer calls this again, so an existing
		 * button is re-placed instead of duplicated.
		 *
		 * The markup mirrors the viewer's own buttons
		 * (`span.tcv_tooltip[data-tooltip] > span.tcv_button_frame > input.tcv_btn`)
		 * so it inherits their size, hover highlight and tooltip; only the icon
		 * (a download arrow into a tray, drawn in the viewer's palette) is ours.
		 *
		 * Returns the wrapper node, or null when there is no toolbar (e.g. in a card).
		 */
		function ensureToolbarExportButton(container, onExport) {
			if (!container || typeof container.querySelector !== "function" || typeof onExport !== "function") return null;
			var bar = container.querySelector(".tcv_cad_toolbar");
			if (!bar || typeof bar.appendChild !== "function") return null;
			var existing = typeof bar.querySelector === "function" ? bar.querySelector(".dmv-toolbar-export") : null;
			if (existing) {
				placeToolbarExportButton(bar, existing);
				return existing;
			}
			var label = "导出模型（CadQuery 支持的全部格式）";
			var tip = document.createElement("span");
			tip.className = "tcv_tooltip dmv-toolbar-export";
			tip.setAttribute("data-tooltip", label);
			tip.setAttribute("data-base-tooltip", label);
			var frame = document.createElement("span");
			frame.className = "tcv_button_frame";
			var input = document.createElement("input");
			input.type = "button";
			input.className = "tcv_reset tcv_btn tcv_button_export";
			frame.appendChild(input);
			tip.appendChild(frame);
			tip.addEventListener("click", function (ev) {
				try {
					if (ev && ev.preventDefault) ev.preventDefault();
					if (ev && ev.stopPropagation) ev.stopPropagation();
					onExport(tip);
				} catch (e) {}
			});
			placeToolbarExportButton(bar, tip);
			// Freshly created (as opposed to re-placed): the caller may want to
			// re-fit the CAD view, since the button can wrap the toolbar.
			tip.__dmvNew = true;
			return tip;
		}

		function mountViewer(host, model, width, height, handlers) {
			var w = width || host.clientWidth || 800;
			var h = height || 480;
			// Inline card mode: the card shows the model only, so the viewer's toolbar
			// and navigation column are hidden and the canvas gets the whole box.
			var cardMode = false;
			try {
				cardMode = !!(host.closest && host.closest(".dmv-inline-body"));
			} catch (e) {}
			return loadThreeCadViewer()
				.then(function (m) {
					var Display = m.Display;
					var Viewer = m.Viewer;
					host.innerHTML = "";
					var container = document.createElement("div");
					container.style.width = "100%";
					container.style.height = "100%";
					container.style.overflow = "hidden";
					host.appendChild(container);

					var displayOptions = {
						measureTools: true,
						selectTool: true,
						explodeTool: true,
						zscaleTool: true,
						zebraTool: true,
						studioTool: true,
						tools: true,
						glass: false,
						pinning: true,
						cadWidth: Math.max(240, w - 220),
						height: Math.max(240, h - 44),
						treeWidth: 220,
						theme: "browser",
					};
					var display = new Display(container, displayOptions);
					var viewer = new Viewer(display, displayOptions, function () {});
					var renderOptions = {
						ambientIntensity: 1.0,
						directIntensity: 1.1,
						metalness: 0.3,
						roughness: 0.65,
						edgeColor: 0x707070,
						defaultOpacity: 0.5,
						normalLen: 0,
					};
					var viewerOptions = {
						ortho: true,
						ticks: 5,
						control: "orbit",
						up: "Z",
						rotateSpeed: 1.0,
						zoomSpeed: 1.0,
						panSpeed: 1.0,
						// Clip sliders map to X / Y / Z axes with the directions the
						// user asked for: X and Z negative, Y positive.
						clipNormal0: [-1, 0, 0],
						clipNormal1: [0, 1, 0],
						clipNormal2: [0, 0, -1],
					};
					viewer.render(model, renderOptions, viewerOptions);
					applyHighlightColors(viewer, model);
					// Only the workbench: an inline card has no tools, and the extra
					// preselection there would only highlight a face on every tap.
					if (!cardMode) installTapPick(container, viewer);
					// Fit the CAD view to the container: measure the real toolbar
					// height / navigation width and call three-cad-viewer's
					// resizeCadView (the only API that re-lays-out + resizes canvas).
					var applyFit = function () {
						try {
							var tb = container.querySelector(".tcv_cad_toolbar");
							var tbH = tb ? tb.offsetHeight : 44;
							if (tb) {
								// offsetHeight excludes the gap kept under the toolbar, so
								// add its margins back in to get the outer height.
								try {
									var tcs = window.getComputedStyle(tb);
									tbH += (parseFloat(tcs.marginTop) || 0) + (parseFloat(tcs.marginBottom) || 0);
								} catch (e) {}
							}
							// Fixed navigation width: reading nav.offsetWidth here fed the
							// measured value back into resizeCadView, so the tree grew on
							// every resize (each pass added the previous width again).
							var navW = 300;
							// .tcv_cad_view has a 6px left padding (the gap between the
							// navigation column and the canvas) and no right padding, so the
							// canvas ends on the same line as the toolbar's 6px right padding.
							var cw = Math.max(240, (host.clientWidth || w) - navW - 6);
							var ch = Math.max(240, (host.clientHeight || h) - tbH);
							if (cardMode) {
								// Card: no toolbar / tree column at all — the canvas owns the
								// full box. Enforce it inline so the hidden chrome cannot
								// reserve layout space (toolbar padding/margins still count
								// towards its offsetHeight).
								try {
									if (tb) tb.style.display = "none";
									var nav = container.querySelector(".tcv_cad_navigation");
									if (nav) nav.style.display = "none";
								} catch (e) {}
								navW = 0;
								cw = Math.max(80, host.clientWidth || w);
								ch = Math.max(80, host.clientHeight || h);
							}
							// Left column: top Tree takes 2/3 of the height (roughly +1/3
							// over the default half); Info gets the rest automatically
							// (three-cad-viewer uses height - treeHeight - 4).
							var treeH = Math.max(120, Math.round(ch * 2 / 3));
							try {
								if (viewer && viewer.state && typeof viewer.state.set === "function") {
									viewer.state.set("treeHeight", treeH);
								}
							} catch (e) {}
							if (viewer && typeof viewer.resizeCadView === "function") {
								viewer.resizeCadView(cw, navW, ch);
							} else if (display && typeof display.resizeCadView === "function") {
								display.resizeCadView(cw, navW, ch);
							} else if (display && typeof display.resize === "function") {
								display.resize(cw, ch);
							}
							// three-cad-viewer's panels use content-box + a 1px border,
							// so they ended up 2px wider than their container (the tree
							// was overlapped by the canvas, the toolbar stuck out). Pin
							// the inline box model after every resize.
							try {
								var fixBox = function (el) {
									if (!el) return;
									el.style.boxSizing = "border-box";
									el.style.maxWidth = "100%";
									el.style.marginLeft = "0";
									el.style.marginRight = "0";
								};
								fixBox(container.querySelector(".tcv_cad_tree"));
								fixBox(container.querySelector(".tcv_cad_info"));
								fixBox(container.querySelector(".tcv_cad_info_wrapper"));
								fixBox(container.querySelector(".tcv_cad_toolbar"));
							} catch (e) {}
							// A resize can rebuild the highlight material, so re-apply.
							applyHighlightColors(viewer, model);
						} catch (e) {}
					};
					applyFit();
					// Translate the viewer UI and keep re-translating dynamic text.
					localizeViewer(container);
					// Drop the toolbar's "Pin as PNG" button (the screenshot pin) —
					// this panel is for viewing models, not exporting screenshots.
					var hidePinAsPng = function () {
						var tips = container.querySelectorAll("[data-tooltip]");
						for (var i = 0; i < tips.length; i++) {
							var t = tips[i].getAttribute("data-tooltip") || "";
							if (t.indexOf("PNG") < 0) continue;
							if (t.indexOf("固定") < 0 && t.toLowerCase().indexOf("pin") < 0) continue;
							var btn = tips[i];
							if (btn.style.display !== "none") btn.style.display = "none";
						}
					};
					hidePinAsPng();
					// Export button, appended to three-cad-viewer's own toolbar so it
					// sits with the viewer controls. It opens the very same format
					// flyout the library cards use, i.e. identical format list and one
					// shared download path. The toolbar is re-rendered by the viewer
					// (and the button would be dropped with it), so this runs again
					// from the mutation observer below.
					var ensureExportButton = function () {
						if (cardMode) return;
						var btn = ensureToolbarExportButton(container, handlers && handlers.onExport);
						// The button can wrap the toolbar onto a second row, which moves
						// the canvas: re-fit once, right after it was created.
						if (btn && btn.__dmvNew) {
							btn.__dmvNew = false;
							applyFit();
						}
					};
					ensureExportButton();
					var mo = null;
					try {
						mo = new MutationObserver(function () {
							localizeViewer(container);
							hidePinAsPng();
							ensureExportButton();
						});
						mo.observe(container, { childList: true, subtree: true, characterData: true });
					} catch (e) {}
					// LEFT=ROTATE(0), MIDDLE=PAN(2), RIGHT=ROTATE(0).
					// In a card the middle button is disabled (no panning); rotating and
					// the wheel zoom stay available.
					try {
						var ctl = viewer.rendered && viewer.rendered.controls;
						var inner = ctl && ctl.controls;
						if (inner && inner.mouseButtons) {
							inner.mouseButtons = cardMode ? { LEFT: 0, MIDDLE: null, RIGHT: 0 } : { LEFT: 0, MIDDLE: 2, RIGHT: 0 };
						}
					} catch (e) {}
					return {
						dispose: function () {
							try {
								if (mo) mo.disconnect();
							} catch (e) {}
							try {
								if (viewer && typeof viewer.dispose === "function") viewer.dispose();
								else if (display && typeof display.dispose === "function") display.dispose();
							} catch (e) {}
							try {
								host.innerHTML = "";
							} catch (e) {}
						},
						resize: function () {
							applyFit();
						},
					};
				})
				.catch(function (err) {
					var el = document.createElement("div");
					el.className = "dmv-err";
					el.textContent = "three-cad-viewer 加载失败: " + (err && err.message ? err.message : String(err));
					host.appendChild(el);
					return { dispose: function () {}, resize: function () {} };
				});
		}

		// ---------------------------------------------------------------------
		// Model stats for the left info pane.
		// ---------------------------------------------------------------------
		function summarize(model) {
			var parts = [];
			var vertices = 0;
			var triangles = 0;
			var color = null;
			(model && model.parts ? model.parts : []).forEach(function (p) {
				var s = p && p.shape;
				parts.push(s ? (p.name || p.id || "part") : null);
				if (s) {
					vertices += (s.vertices ? s.vertices.length / 3 : 0);
					triangles += (s.triangles ? s.triangles.length / 3 : 0);
				}
				if (!color && p.color) color = p.color;
			});
			var bb = (model && model.bb) || null;
			return { parts: parts.filter(Boolean), vertices: vertices, triangles: triangles, color: color, bb: bb };
		}

		// ---------------------------------------------------------------------
		// Viewer canvas component.
		// ---------------------------------------------------------------------
		function ModelViewerCanvas(props) {
			var model = props.model;
			var hostRef = react.useRef(null);
			var apiRef = react.useRef(null);
			// The viewer mounts once per model and injects a toolbar button whose
			// handler must stay current (the workbench item can be replaced), so the
			// button calls through this ref instead of a captured closure.
			var exportRef = react.useRef(null);
			exportRef.current = typeof props.onExport === "function" ? props.onExport : null;
			react.useEffect(function () {
				var host = hostRef.current;
				if (!host) return;
				var cancel = false;
				apiRef.current = null;
				mountViewer(host, model, host.clientWidth, host.clientHeight, {
					onExport: function (anchorEl) {
						var fn = exportRef.current;
						if (fn) return fn(anchorEl);
						return undefined;
					},
				}).then(function (api) {
					if (cancel) {
						api.dispose();
						return;
					}
					apiRef.current = api;
				});
				return function () {
					cancel = true;
					if (apiRef.current) {
						try {
							apiRef.current.dispose();
						} catch (e) {}
						apiRef.current = null;
					}
				};
			}, [model]);

			// Re-fit the CAD view when the container size changes. three-cad-viewer
			// needs an explicit canvas size (WebGL), so this single observer calls
			// its own resizeCadView — keeps the model undistorted.
			react.useEffect(function () {
				var host = hostRef.current;
				if (!host) return;
				var onResize = function () {
					if (apiRef.current && typeof apiRef.current.resize === "function") {
						try { apiRef.current.resize(); } catch (e) {}
					}
				};
				if (typeof ResizeObserver !== "undefined") {
					var ro = new ResizeObserver(onResize);
					ro.observe(host);
					return function () { ro.disconnect(); };
				}
				window.addEventListener("resize", onResize);
				return function () { window.removeEventListener("resize", onResize); };
			}, []);

			return react.createElement("div", {
				ref: hostRef,
				className: "dmv-canvas",
				style: { width: "100%", height: "100%", overflow: "hidden" },
			});
		}

		// ---------------------------------------------------------------------
		// CSS (dsh-style: --dsw-* variables, light/dark aware).
		// ---------------------------------------------------------------------
		var CSS = [
			"[data-dmv]{display:flex;flex-direction:column;min-height:0;font-family:system-ui,Segoe UI,Arial;}",
			"[data-dmv] .dmv-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));flex-wrap:wrap;}",
			"[data-dmv] .dmv-bar-title{font:600 14px/1.2 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));border-radius:8px;overflow:hidden;}",
			"[data-dmv] .dmv-seg button{background:transparent;border:0;color:var(--dsw-alias-label-secondary,#676d74);padding:6px 14px;font:500 13px/1 system-ui,Segoe UI,Arial;cursor:pointer;}",
			"[data-dmv] .dmv-seg button.on{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-input{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.25));border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));border-radius:8px;padding:6px 10px;color:var(--dsw-alias-label-primary,#1f2328);font:13px/1 system-ui,Segoe UI,Arial;outline:none;}",
			"[data-dmv] .dmv-toggle{display:inline-flex;align-items:center;gap:6px;font:13px/1 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);cursor:pointer;}",
			"[data-dmv] .dmv-body{display:flex;flex:1;min-height:0;}",
			"[data-dmv] .dmv-grid{flex:1;padding:6px 0 6px 6px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;align-content:start;overflow:auto;position:relative;}",
			// right-click affordance, drawn under the cards
			"[data-dmv] .dmv-grid::after{content:'右键空白处可新建文件夹';position:absolute;right:8px;bottom:4px;font:11px/1.6 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);opacity:.5;pointer-events:none;}",
			// The library content keeps a 6px left inset only: dsh's scroller already
			// reserves ~10px on the right (scrollbar-gutter), so the cards run to that
			// reserved strip — the same right edge the workbench uses.
			"[data-dmv] .dmv-content-lib{padding:0;box-sizing:border-box;}",
			// The library toolbar is a single search field, kept 32px tall.
			"[data-dmv] .dmv-search{height:32px!important;box-sizing:border-box!important;}",
			"[data-dmv] .dmv-card{border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.04));padding:10px;cursor:pointer;transition:border-color .15s,box-shadow .15s;}",
			"[data-dmv] .dmv-card:hover{border-color:var(--dsw-alias-border-strong,rgba(128,128,128,.5));box-shadow:0 2px 8px rgba(0,0,0,.12);}",
			// Touch devices: a long press must start a drag, not a text selection or the
			// iOS callout menu. touch-action is deliberately left at its default: the
			// browser needs it to recognise a long-press drag (Chrome does drag from
			// touch), and leaving it alone also keeps native list scrolling.
			"[data-dmv] .dmv-card{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;}",
			// On-screen report for a drag the browser interrupted (see showDragReport).
			".dmv-dragreport{position:fixed;left:8px;bottom:8px;z-index:95;max-width:min(94vw,460px);padding:8px 10px;border-radius:8px;background:rgba(20,20,22,.94);color:#f2f4f7;border:1px solid rgba(255,255,255,.22);box-shadow:0 10px 24px rgba(0,0,0,.4);font:11px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;cursor:pointer;}",
			// ...except inside the rename field, which must stay selectable/editable.
			"[data-dmv] .dmv-card input,[data-dmv] .dmv-card textarea{-webkit-user-select:text;user-select:text;}",
			// While dragging, the source card is hidden but keeps its slot. opacity (not
			// visibility/display) matters: hiding the element the touch started on makes
			// the browser silently kill the whole touch sequence, and it aborts a native
			// drag as well.
			"[data-dmv] .dmv-drag-src{opacity:0;}",
			// The floating card lives on <body>, outside the [data-dmv] subtree, so it
			// carries its own wrapper with the attribute (every card rule is written as
			// "[data-dmv] .dmv-card …", i.e. the attribute has to sit on an ancestor).
			".dmv-ghost{position:fixed;left:0;top:0;z-index:90;pointer-events:none;opacity:.92;will-change:transform;transform:translate3d(0,0,0);}",
			".dmv-ghost .dmv-card{box-shadow:0 12px 28px rgba(0,0,0,.3);cursor:grabbing;}",
			".dmv-ghost .dmv-card:hover{border-color:var(--dsw-alias-border-subtle,rgba(128,128,128,.2));box-shadow:0 12px 28px rgba(0,0,0,.3);}",
			// "移动到…" mode: a banner explains the click, and every legal destination
			// card gets a visible affordance (the alternative to dragging on tablets).
			"[data-dmv] .dmv-pickbar{display:flex;align-items:center;gap:8px;margin:0 0 0 6px;padding:6px 10px;border:1px dashed var(--dsw-alias-accent,#3b82f6);border-radius:8px;background:var(--dsw-alias-accent-soft,rgba(59,130,246,.10));font:12px/1.6 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-pickbar-hint{flex:1;min-width:0;color:var(--dsw-alias-label-secondary,#676d74);}",
			"[data-dmv] .dmv-picking .dmv-card-folder,[data-dmv] .dmv-picking .dmv-card-up{cursor:copy;}",
			"[data-dmv] .dmv-picking .dmv-card-folder:hover,[data-dmv] .dmv-picking .dmv-card-up:hover{outline:2px solid var(--dsw-alias-accent,#3b82f6);outline-offset:-2px;}",
			"[data-dmv] .dmv-card .dmv-thumb{height:110px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.05));border-radius:8px;margin-bottom:8px;overflow:hidden;}",
			"[data-dmv] .dmv-card .dmv-name{font:600 13px/1.2 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-primary,#1f2328);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
			"[data-dmv] .dmv-card .dmv-meta{font:11px/1.3 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);margin-top:4px;}",
			"[data-dmv] .dmv-empty{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--dsw-alias-label-secondary,#676d74);font:14px/1.6 system-ui,Segoe UI,Arial;padding:24px;}",
			"[data-dmv] .dmv-workbench{display:flex;flex:1;min-height:0;}",
			"[data-dmv] .dmv-info{width:220px;flex-shrink:0;border-right:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));padding:14px;overflow:auto;}",
			"[data-dmv] .dmv-info h4{margin:0 0 8px;font:600 12px/1.2 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);text-transform:uppercase;letter-spacing:.04em;}",
			"[data-dmv] .dmv-info .dmv-kv{display:flex;justify-content:space-between;gap:8px;font:13px/1.6 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-info .dmv-kv span:first-child{color:var(--dsw-alias-label-secondary,#676d74);}",
			"[data-dmv] .dmv-center{flex:1;min-width:0;min-height:0;position:relative;overflow:hidden;}",
			// three-cad-viewer drives its camera and its picking through pointer events
			// (three.js OrbitControls), which require touch-action:none on the element —
			// its own stylesheet sets none. Without it a tablet hands the touch to the
			// browser as a scroll/zoom gesture and cancels it (pointercancel), so the
			// measure tool can select nothing. Only the workbench opts out: the same rule
			// inside an inline card would stop the conversation from scrolling.
			"[data-dmv] .dmv-workbench .tcv_cad_view,[data-dmv] .dmv-workbench .tcv_cad_view *{touch-action:none;}",
			"[data-dmv] .dmv-right{width:320px;flex-shrink:0;border-left:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));display:flex;flex-direction:column;min-height:0;}",
			"[data-dmv] .dmv-ai-title{padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));font:600 13px/1.2 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-ai-msgs{flex:1;overflow:auto;padding:10px 14px;display:flex;flex-direction:column;gap:8px;}",
			"[data-dmv] .dmv-ai-msg{max-width:92%;padding:7px 10px;border-radius:10px;font:13px/1.5 system-ui,Segoe UI,Arial;white-space:pre-wrap;word-break:break-word;}",
			"[data-dmv] .dmv-ai-msg.user{align-self:flex-end;background:var(--dsw-alias-accent-soft,rgba(59,130,246,.18));color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-ai-msg.assistant{align-self:flex-start;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.25));color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-ai-msg.warn{align-self:center;background:transparent;color:var(--dsw-alias-label-secondary,#676d74);font-size:12px;}",
			"[data-dmv] .dmv-ai-input{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));}",
			"[data-dmv] .dmv-ai-input input{flex:1;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.25));border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));border-radius:8px;padding:8px 10px;color:var(--dsw-alias-label-primary,#1f2328);font:13px/1 system-ui,Segoe UI,Arial;outline:none;}",
			"[data-dmv] .dmv-ai-input button{border:0;border-radius:8px;background:var(--dsw-alias-accent,#3b82f6);color:#fff;padding:8px 14px;font:500 13px/1 system-ui,Segoe UI,Arial;cursor:pointer;}",
			"[data-dmv] .dmv-ai-input button:disabled{opacity:.5;cursor:default;}",
			"[data-dmv] .dmv-err{font:12px/1.4 system-ui,Segoe UI,Arial;color:#c22;padding:4px 10px;}",
			"[data-dmv].dmv-inline{width:100%;}",
			// Inline card shown at the tail of a turn that called add_3dmodel.
			"[data-dmv].dmv-inline{border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));border-radius:10px;margin:8px 0;overflow:hidden;background:var(--dsw-alias-bg-layer-1,transparent);}",
			"[data-dmv] .dmv-inline-head{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;user-select:none;font:600 13px/1.2 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-inline-head:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08));}",
			"[data-dmv] .dmv-inline-caret{font-size:10px;color:var(--dsw-alias-label-secondary,#676d74);transition:transform .15s;}",
			"[data-dmv] .dmv-inline-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			"[data-dmv] .dmv-inline-hint{font:400 11px/1 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);}",
			// 4:3 by width, but never taller than half the viewport.
			"[data-dmv] .dmv-inline-body{position:relative;border-top:0;overflow:hidden;width:100%;height:min(75vw, 50vh);}",
			"[data-dmv].dmv-inline .dmv-inline-body{border-top:0;overflow:hidden;}",
			"[data-dmv] .dmv-inline-body .tcv_cad_viewer{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;}",
			"[data-dmv] .dmv-inline-fs{position:absolute;right:6px;bottom:6px;z-index:6;width:28px;height:28px;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.35));border-radius:6px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.35));color:var(--dsw-alias-label-primary,#fff);font:14px/1 system-ui,Segoe UI,Arial;cursor:pointer;opacity:.7;transition:opacity .15s,background .15s;}",
			"[data-dmv] .dmv-inline-fs:hover{opacity:1;background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.55));}",
			"[data-dmv] .dmv-inline-body.dmv-inline-err{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:90px;font:12px/1.4 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);}",
			"[data-dmv] .dmv-inline-retry{padding:2px 10px;border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.3));border-radius:6px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#676d74);font:12px/1.6 system-ui,Segoe UI,Arial;cursor:pointer;}",
			"[data-dmv] .dmv-inline-retry:hover{background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.2));color:var(--dsw-alias-label-primary,#1f2328);}",
			// ---- folder cards, ⋯ menu, drag & drop, breadcrumbs -------------------
			"[data-dmv] .dmv-card{position:relative;cursor:grab;}",
			"[data-dmv] .dmv-card:active{cursor:grabbing;}",
			"[data-dmv] .dmv-card-folder{border-style:dashed;}",
			"[data-dmv] .dmv-thumb-folder{background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.1));}",
			// ".." entry of a file manager: the first card inside a folder.
			"[data-dmv] .dmv-card-up{cursor:pointer;border-style:solid;border-color:var(--dsw-alias-border-subtle,rgba(128,128,128,.25));background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06));}",
			"[data-dmv] .dmv-card-up:hover{background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.14));}",
			"[data-dmv] .dmv-card-up .dmv-thumb-folder{font-size:26px;line-height:1;}",
			"[data-dmv] .dmv-card-up .dmv-name{font-weight:600;}",
			"[data-dmv] .dmv-up-hint{position:absolute;right:8px;top:8px;font:11px/1.6 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);opacity:0;transition:opacity .12s;}",
			"[data-dmv] .dmv-card-up:hover .dmv-up-hint{opacity:.75;}",
			// While a drag hovers the up-card, spell out where the drop lands.
			"[data-dmv] .dmv-card-up.dmv-drop-over .dmv-up-hint{opacity:1;color:var(--dsw-alias-accent,#3b82f6);}",
			"[data-dmv] .dmv-kind{position:absolute;left:8px;top:8px;font-size:12px;opacity:.75;}",
			"[data-dmv] .dmv-folder-open{position:absolute;right:8px;top:8px;font:11px/1.6 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);opacity:0;}",
			"[data-dmv] .dmv-card-folder:hover .dmv-folder-open{opacity:.8;}",
			"[data-dmv] .dmv-menu-wrap{position:absolute;right:6px;bottom:6px;}",
			"[data-dmv] .dmv-menu-btn{width:24px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#676d74);font:14px/1 system-ui;cursor:pointer;opacity:.55;transition:opacity .12s,background .12s;}",
			"[data-dmv] .dmv-card:hover .dmv-menu-btn{opacity:1;border-color:var(--dsw-alias-border-subtle,rgba(128,128,128,.3));background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12));}",
			"[data-dmv] .dmv-menu-btn:hover{background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.2));color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-menu{position:absolute;right:0;bottom:28px;z-index:30;min-width:104px;padding:4px;border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.3));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 8px 24px rgba(0,0,0,.22);}",
			"[data-dmv] .dmv-menu-item{display:block;width:100%;text-align:left;padding:5px 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#1f2328);font:12px/1.6 system-ui,Segoe UI,Arial;cursor:pointer;}",
			"[data-dmv] .dmv-menu-item:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.14));}",
			"[data-dmv] .dmv-menu-danger{color:#c22;}",
			"[data-dmv] .dmv-menu-sub{display:flex;align-items:center;justify-content:space-between;gap:12px;}",
			// Submenu arrow: a CSS triangle rather than a "▸" glyph, so it is centred
			// on the row (the glyph sits off the optical centre and is tiny at 12px).
			"[data-dmv] .dmv-menu-caret{flex:0 0 auto;width:0;height:0;border-left:6px solid currentColor;border-top:5px solid transparent;border-bottom:5px solid transparent;opacity:.75;margin-left:auto;}",
			"[data-dmv] .dmv-menu-sub:hover .dmv-menu-caret{opacity:1;}",
			// ---- export flyout (page-level, fixed, so the scrolling grid cannot clip it)
			"[data-dmv] .dmv-export-menu{width:232px;min-width:232px;max-width:232px;max-height:calc(100vh - 16px);overflow:auto;padding:4px;z-index:45;}",
			"[data-dmv] .dmv-export-head{font:600 12px/1.4 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-primary,#1f2328);padding:4px 10px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			"[data-dmv] .dmv-export-note{font:11px/1.5 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);padding:0 10px 4px;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));margin-bottom:4px;}",
			"[data-dmv] .dmv-export-group{font:600 10px/1.6 system-ui,Segoe UI,Arial;letter-spacing:.06em;color:var(--dsw-alias-label-secondary,#676d74);opacity:.8;padding:6px 10px 2px;}",
			"[data-dmv] .dmv-export-item{display:flex;flex-direction:column;gap:1px;}",
			"[data-dmv] .dmv-export-row{display:flex;align-items:baseline;gap:8px;width:100%;}",
			"[data-dmv] .dmv-export-label{font-weight:600;font-size:12px;}",
			"[data-dmv] .dmv-export-ext{margin-left:auto;font:11px/1.4 ui-monospace,Consolas,monospace;color:var(--dsw-alias-label-secondary,#676d74);opacity:.85;}",
			"[data-dmv] .dmv-export-desc{font:11px/1.4 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);opacity:.8;white-space:normal;}",
			"[data-dmv] .dmv-export-loading{padding:8px 10px;font:11px/1.5 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);}",
			"[data-dmv] .dmv-menu-item:disabled{opacity:.4;cursor:default;}",
			"[data-dmv] .dmv-menu-item:disabled:hover{background:transparent;}",
			// Blank-space menu: fixed to the viewport at the pointer, sized by content
			// (inside the grid it would have become a grid item and been stretched).
			"[data-dmv] .dmv-menu-page{position:fixed;right:auto;bottom:auto;z-index:40;width:max-content;min-width:132px;max-width:220px;}",
			// Card menu: also viewport-fixed, so a right-click can open it at the
			// pointer (and the scrolling grid cannot clip it). Left/top come inline.
			"[data-dmv] .dmv-menu-fixed{position:fixed;right:auto;bottom:auto;z-index:40;width:max-content;min-width:112px;max-width:220px;}",
			"[data-dmv] .dmv-grid-menu{position:fixed;z-index:40;}",
			"[data-dmv] .dmv-hint{font:11px/1.6 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);opacity:.7;}",
			"[data-dmv] .dmv-drop-over{outline:2px dashed var(--dsw-alias-accent,#3b82f6);outline-offset:-2px;background:var(--dsw-alias-accent-soft,rgba(59,130,246,.12));}",
			"[data-dmv] .dmv-loc{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;}",
			"[data-dmv] .dmv-loc-name{font:12px/1.6 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			// ---- library organisation: selection, rename, dialog -----------------
			"[data-dmv] .dmv-btn{padding:2px 10px;border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.3));border-radius:6px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#676d74);font:12px/1.7 system-ui,Segoe UI,Arial;cursor:pointer;}",
			"[data-dmv] .dmv-btn:hover{background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.2));color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-btn:disabled{opacity:.45;cursor:default;}",
			"[data-dmv] .dmv-btn-danger{color:#c22;border-color:rgba(204,34,34,.45);}",
			"[data-dmv] .dmv-card-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:6px;}",
			"[data-dmv] .dmv-card-act{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#676d74);font:13px/1 system-ui;cursor:pointer;padding:2px 4px;border-radius:4px;}",
			"[data-dmv] .dmv-card-act:hover{background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.2));color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-card-act-danger:hover{color:#c22;}",
			"[data-dmv] .dmv-rename{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.25));border:1px solid var(--dsw-alias-accent,#3b82f6);border-radius:6px;padding:4px 6px;color:var(--dsw-alias-label-primary,#1f2328);font:600 13px/1.3 system-ui,Segoe UI,Arial;outline:none;}",
			"[data-dmv] .dmv-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);}",
			"[data-dmv] .dmv-dialog{min-width:260px;max-width:min(420px,90vw);padding:14px 16px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.25));box-shadow:0 12px 32px rgba(0,0,0,.25);}",
			"[data-dmv] .dmv-dialog-title{font:600 14px/1.4 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-dialog-text{margin-top:6px;font:12px/1.6 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);word-break:break-word;}",
			"[data-dmv] .dmv-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;}",
			// inline card = model only: strip the viewer's own chrome and let the
			// canvas fill the whole body (the toolbar's offsetHeight is ignored in
			// card mode by applyFit, see mountViewer).
			"[data-dmv] .dmv-inline-body .tcv_cad_toolbar,[data-dmv] .dmv-inline-body .tcv_cad_navigation,[data-dmv] .dmv-inline-body .tcv_cad_info,[data-dmv] .dmv-inline-body .tcv_cad_info_wrapper,[data-dmv] .dmv-inline-body .tcv_cad_inset,[data-dmv] .dmv-inline-body .tcv_tick_size,[data-dmv] .dmv-inline-body .tcv_shape_filter,[data-dmv] .dmv-inline-body .tcv_filter_menu,[data-dmv] .dmv-inline-body .tcv_status,[data-dmv] .dmv-inline-body .tcv_cad_zscale,[data-dmv] .dmv-inline-body .tcv_zscale_slider,[data-dmv] .dmv-inline-body .tcv_clip_slider,[data-dmv] .dmv-inline-body .tcv_cad_clip_container,[data-dmv] .dmv-inline-body .tcv_cad_animation{display:none!important;}",
			"[data-dmv] .dmv-inline-body .tcv_cad_view{padding:0!important;overflow:hidden!important;}",
			// Card chrome: the bar carries the model title (left) and a collapse
			// button (right); the full-screen icon floats over the canvas corner.
			"[data-dmv] .dmv-inline-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));}",
			"[data-dmv] .dmv-inline-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 13px/1.4 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-inline-toggle{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;padding:2px 4px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#676d74);font:12px/1.6 system-ui,Segoe UI,Arial;cursor:pointer;}",
			"[data-dmv] .dmv-inline-toggle:hover{color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-inline-btn{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.3));border-radius:6px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#676d74);font:12px/1.6 system-ui,Segoe UI,Arial;cursor:pointer;}",
			"[data-dmv] .dmv-inline-btn:hover{background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.2));color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-inline-spacer{flex:1;}",
			"[data-dmv] .dmv-inline-foot{padding:4px 12px;border-top:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));font:11px/1.4 system-ui,Segoe UI,Arial;color:var(--dsw-alias-label-secondary,#676d74);}",
			"[data-dmv] .dsh-mv-page{width:100%;height:100%;display:flex;flex-direction:column;min-height:0;}",
			"[data-dmv] .dmv-subtabs{display:flex;gap:2px;padding:0 10px;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));}",
			"[data-dmv] .dmv-subtab{display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#676d74);font:500 13px/1.2 system-ui,Segoe UI,Arial;cursor:pointer;position:relative;}",
			"[data-dmv] .dmv-subtab-close{opacity:.55;font-size:13px;line-height:1;padding:0 3px;border-radius:4px;}",
			"[data-dmv] .dmv-subtab-close:hover{opacity:1;background:rgba(128,128,128,.22);}",
			"[data-dmv] .dmv-subtab.on{color:var(--dsw-alias-label-primary,#1f2328);}",
			"[data-dmv] .dmv-subtab.on::after{content:'';position:absolute;left:10px;right:10px;bottom:-1px;height:2px;background:var(--dsw-alias-accent,#3b82f6);border-radius:2px;}",
			"[data-dmv] .dmv-filters{display:flex;align-items:center;gap:6px;padding:6px 0 0 6px;flex-wrap:wrap;}",
			"[data-dmv] .dmv-search{flex:1;min-width:160px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.25));border:1px solid var(--dsw-alias-border-subtle,rgba(128,128,128,.2));border-radius:8px;padding:6px 12px;color:var(--dsw-alias-label-primary,#1f2328);font:13px/1 system-ui,Segoe UI,Arial;outline:none;}",
			"[data-conversation-scroll]:has(.dsh-mv-page) [data-composer-seat]{display:none!important;}",
			".dsh-mv-active [data-width-handle]{display:none!important;}",
			".dsh-mv-active [class*='widthHandle']{display:none!important;}",
			// Responsive layout. three-cad-viewer writes inline pixel sizes onto its
			// own DOM, so max-width/max-height (which win over inline width/height)
			// are used to keep every layer inside its parent; the panel follows the
			// viewport in pure CSS (no JS size listener).
			"[data-dmv].dsh-mv-page{min-height:0;display:flex;flex-direction:column;width:100%;height:calc(100vh - 76px);max-height:calc(100vh - 76px);}",
			// NOTE: dsh's conversation scroller reserves a scrollbar gutter
			// (scrollbar-gutter: stable + margin-right), so a full-width page always
			// stops ~16px short of the window edge. Widening the page or moving it out of
			// the scroller causes a horizontal scrollbar / sidebar-offset problems, so
			// the page simply fills its container; the 6px insets live on the inner
			// layers below.
			"[data-dmv].dsh-mv-page{width:100%!important;max-width:100%!important;padding:0;box-sizing:border-box;overflow:hidden!important;}",
			"[data-dmv] .dmv-subtabs{flex:0 0 auto;position:relative;z-index:5;background:var(--dsw-alias-bg-layer-1,transparent);}",
			"[data-dmv] .dmv-workbench{flex:1 1 auto;min-height:0;overflow:hidden;display:flex;}",
			"[data-dmv] .dmv-center{flex:1 1 auto;min-width:0;min-height:0;overflow:hidden;position:relative;padding:6px 0 6px 6px;box-sizing:border-box;}",
			"[data-dmv] .dmv-canvas{width:100%;height:100%;max-width:100%;max-height:100%;overflow:hidden;}",
			"[data-dmv] .tcv_cad_viewer{width:100%!important;max-width:100%!important;height:100%!important;max-height:100%!important;min-height:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;--dmv-row-gap:6px;}",
			// The toolbar keeps a 6px gap above the CAD body (--dmv-row-gap) and carries
			// the same 6px right inset as the canvas, so the toolbar, the canvas and the
			// "All ▾" pill end on one line. Vertical padding stays 0: the buttons' own
			// frame already gives them 2px top and bottom, so the row reads symmetric —
			// an extra padding-bottom here made the gap below the icons 8px against 2px
			// above (measured in a headless browser, see dev/make-toolbar-layout.mjs).
			"[data-dmv] .tcv_cad_toolbar{width:auto!important;max-width:100%!important;display:flex!important;flex-wrap:wrap!important;height:auto!important;min-height:0!important;overflow:visible!important;padding:0 6px!important;gap:0!important;box-sizing:border-box!important;margin:0 0 var(--dmv-row-gap,6px) 0!important;flex:0 0 auto!important;}",
			// three-cad-viewer panels carry a 1px border with content-box sizing,
			// which made them 2px wider than their container (tree overlapped by
			// the canvas, toolbar sticking out). Count the border into the width.
			"[data-dmv] .tcv_cad_tree,[data-dmv] .tcv_cad_info,[data-dmv] .tcv_cad_info_wrapper{box-sizing:border-box!important;max-width:100%!important;}",
			"[data-dmv] .tcv_cad_toolbar > *{margin:0!important;min-width:0!important;}",
			// ...but the viewer spaces its group dividers with a one-sided rule
			// (`.tcv_separator{margin-left:6px;padding-right:5px}`), and the reset
			// above killed the margin — measured 0px to the group on the left against
			// 5px on the right. Zero the horizontal padding and give the line equal
			// margins instead, so it sits centred between the two groups.
			"[data-dmv] .tcv_cad_toolbar .tcv_separator{margin:0 6px!important;padding-left:0!important;padding-right:0!important;}",
			"[data-dmv] .tcv_cad_toolbar button,[data-dmv] .tcv_cad_toolbar input{padding-left:1px!important;padding-right:1px!important;min-width:0!important;}",
			// 导出 button injected into the viewer toolbar (see
			// ensureToolbarExportButton): an icon button built exactly like the
			// viewer's own, so only this background image is ours. Drawn in the same
			// palette as the viewer icons (#444 outlines, rgb(83,160,227) accents)
			// and on the same 26x26 canvas: an arrow into a tray.
			"[data-dmv] .tcv_button_export{background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 -26 26 26'%3E%3Cpath d='M4.2,-3.8L4.2,-10.4L21.8,-10.4L21.8,-3.8' fill='none' stroke='%23444' stroke-width='1.15' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M11.65,-22.4L14.35,-22.4L14.35,-14.6L17.7,-14.6L13,-9.4L8.3,-14.6L11.65,-14.6Z' fill='rgb(83%2C160%2C227)' stroke='%23444' stroke-width='0.95' stroke-linejoin='round'/%3E%3C/svg%3E\");}",
			// The shape filter (全部/顶点/边/面/实体 — the "All ▾" pill) is absolutely
			// positioned at top:-3px inside .tcv_filter_menu, which lives at the top
			// of .tcv_cad_view (overflow:hidden). That pushed 3px of the pill above
			// the view's top edge, so it was clipped. Keep it fully inside, and pull
			// its right edge out by the view's 6px padding so it lines up with the
			// canvas edge and the toolbar's right border.
			"[data-dmv] .tcv_shape_filter{top:1px!important;right:0!important;}",
			"[data-dmv] .tcv_cad_body{flex:1 1 auto!important;width:100%!important;max-width:100%!important;min-width:0!important;min-height:0!important;max-height:100%!important;display:flex!important;flex-direction:row!important;overflow:hidden!important;margin:0!important;}",
			// Keep the inner layers flush with their container (a 2px margin made
			// the top/bottom gaps differ from the left/right ones).
			"[data-dmv] .tcv_cad_navigation,[data-dmv] .tcv_cad_view,[data-dmv] .tcv_cad_tree,[data-dmv] .tcv_cad_info_wrapper,[data-dmv] .tcv_cad_info{margin:0!important;}",
			"[data-dmv] .tcv_cad_navigation{flex:0 0 300px!important;width:300px!important;min-width:300px!important;max-width:300px!important;align-self:stretch!important;height:100%!important;min-height:0!important;display:flex!important;flex-direction:column!important;gap:4px!important;overflow:hidden!important;}",
			"[data-dmv] .tcv_cad_view{flex:1 1 auto!important;width:auto!important;max-width:100%!important;min-width:0!important;min-height:0!important;max-height:100%!important;overflow:hidden!important;position:relative;margin:0!important;padding:0 0 0 6px!important;box-sizing:border-box!important;}",
			"[data-dmv] .tcv_cad_tree{margin-bottom:0!important;}",
			// The tree's expand arrow is a text glyph ("▸") in a fixed 16x16 box, so its
			// ink sat below the optical centre of the 24px shape icons and of the row
			// label. Drop the fixed size (the glyph sizes the marker itself) and lift the
			// ink by the 1.5px measured offset so the row reads vertically centred.
			"[data-dmv] .tv-nav-marker{width:auto!important;height:auto!important;position:relative!important;top:-1.5px!important;}",
			"[data-dmv] .tcv_cad_info_wrapper{margin-top:0!important;}",
			// Same 6px corner radius as the navigation tree / info cards (.tcv_round),
			// so the canvas reads as one more rounded panel. overflow:clip keeps the
			// WebGL surface inside the rounded corners.
			"[data-dmv] .tcv_cad_viewer canvas,[data-dmv] .tcv_cad_body canvas{max-width:100%!important;max-height:100%!important;display:block!important;border-radius:6px!important;overflow:clip!important;}",
		].join("");
		var CSS_ID = "dsh-model-viewer/root.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") === null) {
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-model-viewer";
			tag.dataset.pluginCss = CSS_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		function fmtDate(ts) {
			if (!ts) return "—";
			var d = new Date(ts);
			return d.toLocaleString();
		}

		// ---------------------------------------------------------------------
		// AI panel (workbench right column). Sends the prompt to the dsh agent
		// via the client connection service, with error fallback.
		// ---------------------------------------------------------------------
		function AiPanel(props) {
			var ctx = props.ctx;
			var contextInfo = props.contextInfo;
			var [messages, setMessages] = react.useState([]);
			var [input, setInput] = react.useState("");
			var [busy, setBusy] = react.useState(false);

			function send(text) {
				if (!text.trim()) return;
				var next = messages.concat([{ role: "user", text: text }]);
				setMessages(next);
				setInput("");
				setBusy(true);
				var conn = null;
				try {
					conn = ctx.get("connection");
				} catch (e) {}
				var sent = false;
				try {
					if (conn && typeof conn.send === "function") {
						var payload = { message: text, context: contextInfo || "" };
						if (typeof conn.send === "object" || conn.send && conn.send.length) {
							// no-op guard; used below
						}
						conn.send(payload);
						sent = true;
					} else if (conn && typeof conn.emit === "function") {
						conn.emit("user/message", { text: text, context: contextInfo || "" });
						sent = true;
					}
				} catch (e) {
					sent = false;
				}
				setBusy(false);
				var reply = sent
					? { role: "assistant", text: "已发送给 AI（回复将出现在主对话区）。" }
					: { role: "warn", text: "AI 对话需要 dsh 会话通道可用；请在主对话区向 agent 提问。" };
				setMessages(next.concat([reply]));
			}

			var sampleQs = ["这个模型的包围盒是多少？", "有几个零件？", "描述一下模型结构"];
			return react.createElement(
				"div",
				{ className: "dmv-right" },
				react.createElement("div", { className: "dmv-ai-title" }, "AI 对话"),
				react.createElement(
					"div",
					{ className: "dmv-ai-msgs" },
					messages.length === 0
						? react.createElement("div", { className: "dmv-ai-msg warn" }, "在上方查看模型，并可在这里向 AI 提问。")
						: messages.map(function (m, i) {
								return react.createElement("div", { className: "dmv-ai-msg " + m.role, key: i }, m.text);
							}),
				),
				react.createElement(
					"div",
					null,
					sampleQs.map(function (q) {
						return react.createElement(
							"button",
							{ key: q, className: "dmv-seg", style: { margin: "0 6px 6px 14px", cursor: "pointer" }, onClick: function () { send(q); } },
							q,
						);
					}),
				),
				react.createElement(
					"div",
					{ className: "dmv-ai-input" },
					react.createElement("input", {
						value: input,
						placeholder: "向 AI 提问…",
						onChange: function (e) { setInput(e.target.value); },
						onKeyDown: function (e) { if (e.key === "Enter" && !busy) send(input); },
					}),
					react.createElement("button", { onClick: function () { send(input); }, disabled: busy }, busy ? "…" : "发送"),
				),
			);
		}

		// ---------------------------------------------------------------------
		// Model library view (folder-scoped grid + library-wide search).
		// ---------------------------------------------------------------------
		// Gallery-style library view: one toolbar row (location + search) above a
		// grid of folder cards and model cards.
		function ModelLibrary(props) {
			var models = props.models;
			var onOpen = props.onOpen;
			var onDelete = props.onDelete;
			var search = props.search;
			var setSearch = props.setSearch;
			var folders = props.folders || [];
			var curFolder = props.curFolder || "";
			var renamingId = props.renamingId;
			var setRenamingId = props.setRenamingId;
			var commitRename = props.commitRename;
			var commitFolderRename = props.commitFolderRename;
			var level = props.level || "";
			var onBack = props.onBack;
			var levelName = props.levelName || "文件夹";
			var onEnterFolder = props.onEnterFolder;
			var onAddFolder = props.onAddFolder;
			var onMenu = props.onMenu;
			var openMenu = props.openMenu;
			var onDragOverCard = props.onDragOverCard;
			var onDragLeaveCard = props.onDragLeaveCard;
			var onDropCard = props.onDropCard;
			var canDrop = props.canDrop;
			var startDelete = props.startDelete;
			var removeFolder = props.removeFolder;
			var blankMenu = props.blankMenu || null;
			var onBlankMenu = props.onBlankMenu;
			var onCardPress = props.onCardPress;
			// "移动到…" mode (the reliable alternative to dragging on touch devices).
			var moveAsk = props.moveAsk || null;
			var onMove = props.onMove;
			var onCancelMove = props.onCancelMove;

			var q = String(search || "").trim().toLowerCase();
			// Search is library-wide: a model that lives inside a folder must be
			// findable from anywhere, and folders match by name as well.
			var searching = q.length > 0;
			var visibleFolders = folders;
			var filtered;
			if (searching) {
				visibleFolders = (folders || []).filter(function (f) {
					return String(f.name || "").toLowerCase().indexOf(q) >= 0;
				});
				filtered = (models || []).filter(function (m) {
					return String(m.title || m.name || "").toLowerCase().indexOf(q) >= 0;
				});
			} else {
				// File-manager scoping: a folder shows its own models, the root shows only
				// the unfiled ones (models that live in a folder must NOT appear there).
				filtered = (models || []).filter(function (m) { return String(m.folder || "") === String(curFolder || ""); });
			}
			filtered = filtered.slice().sort(function (a, b) {
				return (b.createdAt || 0) - (a.createdAt || 0);
			});

			// Where a model lives ("零件 / 子夹"), shown on the card while searching so a
			// hit found outside the current folder is still locatable.
			var folderPathOf = function (id) {
				var names = [];
				var cur = String(id || "");
				var guard = 0;
				while (cur && guard++ < 64) {
					var hit = (folders || []).filter(function (f) { return f.id === cur; })[0];
					if (!hit) break;
					names.unshift(hit.name || "文件夹");
					cur = String(hit.parent || "");
				}
				return names.join(" / ");
			};

			// Opening a folder from a search hit leaves the search: the user asked to
			// look inside that folder, not to keep staring at the result list.
			var enterFolderFromCard = function (f) {
				if (searching && setSearch) setSearch("");
				if (onEnterFolder) onEnterFolder(f);
			};

			return react.createElement(
				"div",
				{ style: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } },
				react.createElement(
					"div",
					{ className: "dmv-filters" },
					level && !searching
						? react.createElement(
								"span",
								{ className: "dmv-loc" },
								// The "返回上一级" card inside the grid is the only way back now.
								react.createElement("span", { className: "dmv-loc-name" }, levelName + " /"),
							)
						: null,
					react.createElement("input", {
						className: "dmv-search",
						placeholder: "搜索模型、文件夹…",
						value: search || "",
						onChange: function (e) { if (setSearch) setSearch(e.target.value); },
					}),
				),
				moveAsk
					? react.createElement(
							"div",
							{ className: "dmv-pickbar" },
							react.createElement("span", null, "把「" + (moveAsk.name || "项目") + "」移动到："),
							react.createElement("span", { className: "dmv-pickbar-hint" }, "点一个文件夹卡片，或点「返回上一级」"),
							react.createElement(
								"button",
								{ type: "button", className: "dmv-btn", onClick: function () { if (onCancelMove) onCancelMove(); } },
								"取消",
							),
						)
					: null,
				react.createElement(ModelGrid, {
					models: filtered,
					searching: searching,
					folderPathOf: folderPathOf,
					onOpen: onOpen,
					onDelete: onDelete,
					folders: visibleFolders,
					renamingId: renamingId,
					setRenamingId: setRenamingId,
					commitRename: commitRename,
					commitFolderRename: props.commitFolderRename,
					level: props.level || "",
					onBack: onBack,
					parentName: props.parentName || "",
					upTarget: props.upTarget || "",
					// full list (unfiltered) so folder cards can count correctly
					allModels: models,
					onEnterFolder: enterFolderFromCard,
					onMenu: props.onMenu,
					openMenu: props.openMenu,
					onDragOverCard: props.onDragOverCard,
					onDragLeaveCard: props.onDragLeaveCard,
					onDropCard: props.onDropCard,
					onCardPress: onCardPress,
					canDrop: props.canDrop,
					picking: !!props.picking,
					onPickTarget: props.onPickTarget,
					onCancelMove: onCancelMove,
					onMove: onMove,
					onExport: props.onExport,
					onExportHold: props.onExportHold,
					onExportRelease: props.onExportRelease,
					onExportHide: props.onExportHide,
					startDelete: props.startDelete,
					removeFolder: props.removeFolder,
					blankMenu: props.blankMenu,
					onBlankMenu: props.onBlankMenu,
					onNewFolder: props.onNewFolder,
				}),
			);
		}

		// The grid part of the library: folder cards first, then model cards.
		function ModelGrid(props) {
			var models = props.models;
			var onOpen = props.onOpen;
			var onDelete = props.onDelete;
			var folders = props.folders || [];
			// Counting must look at every model, not only the ones visible in this
			// folder, otherwise a folder card always claims "0 个模型".
			var allModels = props.allModels || models;
			var onBack = props.onBack;
			var parentName = props.parentName || "";
			// Folder that "返回上一级" points at ("" === the root), used as a drop target
			// so a card can be dragged onto it to move the item up one level.
			var upTarget = props.upTarget || "";
			// Resolves a folder id to its path ("零件 / 子夹"); used to label search hits.
			var folderPathOf = props.folderPathOf;
			var renamingId = props.renamingId;
			var setRenamingId = props.setRenamingId;
			var commitRename = props.commitRename;
			var commitFolderRename = props.commitFolderRename;
			var level = props.level || "";
			var onEnterFolder = props.onEnterFolder;
			var onMenu = props.onMenu;
			var openMenu = props.openMenu;
			var onDragOverCard = props.onDragOverCard;
			var onDragLeaveCard = props.onDragLeaveCard;
			var onDropCard = props.onDropCard;
			var canDrop = props.canDrop;
			var startDelete = props.startDelete;
			var removeFolder = props.removeFolder;
			var blankMenu = props.blankMenu || null;
			var onBlankMenu = props.onBlankMenu;
			var onNewFolder = props.onNewFolder;
			// Press-and-hold on a card: the tab turns it into a drag (touch devices have
			// no HTML5 drag and drop), so the grid only reports the press + payload.
			var onCardPress = props.onCardPress;
			// "移动到…": while picking, a folder card (or the up card) is a destination.
			var picking = !!props.picking;
			var onPickTarget = props.onPickTarget;
			var onCancelMove = props.onCancelMove;
			var onMove = props.onMove;
			// Opens the export submenu (the page-level one, see ModelViewTab).
			var onExport = props.onExport;
			// Keep / drop the flyout's auto-close timer while the pointer is on the
			// card menu, and hide it outright when another entry is entered.
			var onExportHold = props.onExportHold;
			var onExportRelease = props.onExportRelease;
			var onExportHide = props.onExportHide;

			// While searching the grid shows library-wide hits: the folder list already
			// holds only the matches, so it is used as-is instead of being scoped to a
			// level, and the "返回上一级" card is dropped (the results are not "here").
			var searching = !!props.searching;
			var here = searching
				? (folders || []).slice()
				: (folders || []).filter(function (f) { return String(f.parent || "") === String(level || ""); });
			var modelIds = (models || []).map(function (m) { return m.id; });
			var hasContent = here.length > 0 || modelIds.length > 0;

			if (!hasContent && !level && !searching) {
				// Only the root may collapse into the empty state: inside a folder the
				// grid must still render so the "返回上一级" card stays reachable.
				return react.createElement("div", { className: "dmv-empty" }, "当前没有任何 3D 模型。尝试对我说：帮我生成一个 1m³ 的立方体");
			}

			function folderCard(f) {
				var childFolders = (folders || []).filter(function (x) { return String(x.parent || "") === f.id; }).length;
				var childModels = (allModels || []).filter(function (m) { return String(m.folder || "") === f.id; }).length;
				var menuAt = openMenu && openMenu.id === f.id ? openMenu : null;
				return react.createElement(
					"div",
					{
						key: "folder:" + f.id,
						className: "dmv-card dmv-card-folder",
						draggable: true,
						title: "拖拽可移动到其它文件夹",
						// Touch drop target (see onCardPress in ModelViewTab).
						"data-dmv-folder": f.id,
						onTouchStart: function (e) { if (onCardPress) onCardPress(e, { type: "folder", id: f.id }); },
						onClick: function (e) {
							if (e && e.stopPropagation) e.stopPropagation();
							// In "移动到…" mode a card click picks the destination instead.
							if (picking && onPickTarget) { onPickTarget(f.id); return; }
							if (onEnterFolder) onEnterFolder(f);
						},
						onContextMenu: function (e) {
							e.preventDefault();
							e.stopPropagation();
							// Right-click (re)opens the menu at the pointer — a second
							// right-click moves it rather than closing it, the way a
							// context menu normally behaves.
							if (onMenu) onMenu(f.id, { pointer: { x: e.clientX, y: e.clientY } });
						},
						onDragStart: function (e) {
							try {
								e.dataTransfer.setData("text/plain", JSON.stringify({ type: "folder", id: f.id }));
								e.dataTransfer.effectAllowed = "move";
							} catch (err) {}
						},
						onDragOver: function (e) { if (onDragOverCard) onDragOverCard(e, true, f.id); },
						onDragLeave: function () { if (onDragLeaveCard) onDragLeaveCard(); },
						onDrop: function (e) { e.stopPropagation(); if (onDropCard) onDropCard(e, f.id); },
					},
					react.createElement("span", { className: "dmv-kind" }, "📁"),
					react.createElement("div", { className: "dmv-thumb dmv-thumb-folder" }, react.createElement("span", { style: { fontSize: 26 } }, "📁")),
					renamingId === f.id
						? react.createElement("input", {
								className: "dmv-rename",
								defaultValue: f.name || "新建文件夹",
								autoFocus: true,
								onClick: function (e) { e.stopPropagation(); },
								onKeyDown: function (e) {
									if (e.key === "Enter") commitFolderRename && commitFolderRename(f.id, e.target.value);
									else if (e.key === "Escape") setRenamingId && setRenamingId(null);
								},
								onBlur: function (e) { commitFolderRename && commitFolderRename(f.id, e.target.value); },
							})
						: react.createElement("div", { className: "dmv-name", title: "双击可重命名" , onDoubleClick: function (e) { e.stopPropagation(); if (setRenamingId) setRenamingId(f.id); } }, f.name || "新建文件夹"),
					react.createElement("div", { className: "dmv-meta" }, childFolders + " 个文件夹 · " + childModels + " 个模型"),
					react.createElement("span", { className: "dmv-folder-open" }, "打开"),
					react.createElement(
						"div",
						{ className: "dmv-menu-wrap" },
						react.createElement(
							"button",
							{
								type: "button",
								className: "dmv-menu-btn",
								title: "更多",
								onClick: function (e) {
									e.stopPropagation();
									if (!onMenu) return;
									if (menuAt) { onMenu(null); return; }
									// Anchored to the button (a tap has no pointer position).
									var rect = e.currentTarget && e.currentTarget.getBoundingClientRect
										? e.currentTarget.getBoundingClientRect()
										: null;
									onMenu(f.id, { button: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null });
								},
							},
							"⋯",
						),
						menuAt
							? react.createElement(
									"div",
									{
										className: "dmv-menu dmv-menu-fixed",
										style: { left: menuAt.x + "px", top: menuAt.y + "px" },
										onClick: function (e) { e.stopPropagation(); },
									},
									react.createElement(
										"button",
										{ type: "button", className: "dmv-menu-item", onClick: function () { if (onMenu) onMenu(null); if (setRenamingId) setRenamingId(f.id); } },
										"重命名",
									),
									react.createElement(
										"button",
										{ type: "button", className: "dmv-menu-item", onClick: function () { if (onMenu) onMenu(null); if (onMove) onMove({ type: "folder", id: f.id, name: f.name || "文件夹" }); } },
										"移动到…",
									),
									react.createElement(
										"button",
										{
											type: "button",
											className: "dmv-menu-item dmv-menu-danger",
											onClick: function () { if (onMenu) onMenu(null); if (startDelete) startDelete([f.id]); else if (removeFolder) removeFolder(f.id); },
										},
										"删除",
									),
								)
							: null,
					),
				);
			}

			function modelCard(m) {
				var menuAt = openMenu && openMenu.id === m.id ? openMenu : null;
				return react.createElement(
					"div",
					{
						key: m.id,
						className: "dmv-card",
						draggable: true,
						onTouchStart: function (e) { if (onCardPress) onCardPress(e, { type: "model", id: m.id }); },
						onClick: function () { onOpen && onOpen(m); },
						onContextMenu: function (e) {
							e.preventDefault();
							e.stopPropagation();
							// Right-click (re)opens the menu at the pointer — a second
							// right-click moves it rather than closing it, the way a
							// context menu normally behaves.
							if (onMenu) onMenu(m.id, { pointer: { x: e.clientX, y: e.clientY } });
						},
						onDragStart: function (e) {
							try {
								e.dataTransfer.setData("text/plain", JSON.stringify({ type: "model", id: m.id }));
								e.dataTransfer.effectAllowed = "move";
							} catch (err) {}
						},
					},
					react.createElement("div", { className: "dmv-thumb" }, react.createElement("span", { style: { fontSize: 28 } }, "🧊")),
					renamingId === m.id
						? react.createElement("input", {
								className: "dmv-rename",
								defaultValue: m.title || m.name || "模型",
								autoFocus: true,
								onClick: function (e) { e.stopPropagation(); },
								onKeyDown: function (e) {
									if (e.key === "Enter") commitRename && commitRename(m.id, e.target.value);
									else if (e.key === "Escape") setRenamingId && setRenamingId(null);
								},
								onBlur: function (e) { commitRename && commitRename(m.id, e.target.value); },
							})
						: react.createElement("div", { className: "dmv-name", title: "双击可重命名", onDoubleClick: function (e) { e.stopPropagation(); if (setRenamingId) setRenamingId(m.id); } }, m.title || m.name || "模型"),
					react.createElement("div", { className: "dmv-meta" }, searching
						? ((folderPathOf && folderPathOf(m.folder)) || "根目录")
						: fmtDate(m.createdAt)),
					react.createElement(
						"div",
						{ className: "dmv-menu-wrap" },
								react.createElement(
									"button",
									{
										type: "button",
										className: "dmv-menu-btn",
										title: "更多（右键卡片同效）",
										onClick: function (e) {
											e.stopPropagation();
											if (!onMenu) return;
											if (menuAt) { onMenu(null); return; }
											// Anchored to the button (a tap has no pointer position).
											var rect = e.currentTarget && e.currentTarget.getBoundingClientRect
												? e.currentTarget.getBoundingClientRect()
												: null;
											onMenu(m.id, { button: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null });
										},
									},
									"⋯",
								),
								menuAt
									? react.createElement(
											"div",
											{
												className: "dmv-menu dmv-menu-fixed",
												style: { left: menuAt.x + "px", top: menuAt.y + "px" },
												onClick: function (e) { e.stopPropagation(); },
												// Entering the menu cancels the flyout's close timer,
												// leaving the whole menu arms it; see ModelViewTab.
												onMouseEnter: function () { if (onExportHold) onExportHold(); },
												onMouseLeave: function () { if (onExportRelease) onExportRelease(); },
											},
											react.createElement(
												"button",
												{
													type: "button",
													className: "dmv-menu-item",
													// Only 导出 keeps the flyout alive: moving onto any other
													// entry hides it right away.
													onMouseEnter: function () { if (onExportHide) onExportHide(); },
													onClick: function () { if (onMenu) onMenu(null); if (setRenamingId) setRenamingId(m.id); },
												},
												"重命名",
											),
											react.createElement(
												"button",
												{
													type: "button",
													className: "dmv-menu-item",
													onMouseEnter: function () { if (onExportHide) onExportHide(); },
													onClick: function () { if (onMenu) onMenu(null); if (onMove) onMove({ type: "model", id: m.id, name: m.title || m.name || "模型" }); },
												},
												"移动到…",
											),
											react.createElement(
												"button",
												{
													type: "button",
													className: "dmv-menu-item dmv-menu-sub",
													title: "导出为 CAD / 网格 / 图纸文件（CadQuery 支持的全部格式）",
													// Pointer devices open the flyout on hover, a tap opens it
													// on click; either way the card menu stays open.
													onMouseEnter: function (e) {
														if (onExport) onExport(m, e && e.currentTarget, "hover");
													},
													// Leaving this row starts the close grace period, which
													// entering the flyout (just across the gap) cancels.
													onMouseLeave: function () { if (onExportRelease) onExportRelease(); },
													onClick: function (e) {
														e.stopPropagation();
														if (onExport) onExport(m, e && e.currentTarget, "click");
													},
												},
												react.createElement("span", null, "导出"),
												react.createElement("span", { className: "dmv-menu-caret", "aria-hidden": "true" }),
											),
											react.createElement(
												"button",
												{
													type: "button",
													className: "dmv-menu-item dmv-menu-danger",
													onMouseEnter: function () { if (onExportHide) onExportHide(); },
													onClick: function () { if (onMenu) onMenu(null); if (onDelete) onDelete(m); },
												},
												"删除",
											),
										)
									: null,
					),
				);
			}

			return react.createElement(
				"div",
				{
					className: picking ? "dmv-grid dmv-picking" : "dmv-grid",
					onClick: function () {
						if (onBlankMenu) onBlankMenu(null);
						if (onMenu) onMenu(null);
						if (picking && onCancelMove) onCancelMove();
					},
					// The menus are viewport-fixed, so scrolling the grid would leave
					// them floating away from their card: close them instead.
					onScroll: function () {
						if (onBlankMenu) onBlankMenu(null);
						if (onMenu) onMenu(null);
					},
				},
				level && !searching
					? react.createElement(
							"div",
							{
								key: "up",
								className: "dmv-card dmv-card-up",
								title: parentName ? "返回上一级：" + parentName + "（也可把卡片拖到这里上移一层）" : "返回上一级（也可把卡片拖到这里上移一层）",
								"data-dmv-folder": upTarget,
								onClick: function (e) {
									if (e && e.stopPropagation) e.stopPropagation();
									if (picking && onPickTarget) { onPickTarget(upTarget); return; }
									if (onBack) onBack();
								},
								onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); },
								onDragOver: function (e) { if (onDragOverCard) onDragOverCard(e, true, upTarget); },
								onDragLeave: function () { if (onDragLeaveCard) onDragLeaveCard(); },
								onDrop: function (e) { e.stopPropagation(); if (onDropCard) onDropCard(e, upTarget); },
							},
							react.createElement("div", { className: "dmv-thumb dmv-thumb-folder" }, react.createElement("span", { style: { fontSize: 26 } }, "↩")),
							react.createElement("div", { className: "dmv-name" }, "返回上一级"),
							react.createElement("div", { className: "dmv-meta" }, parentName || "上级目录"),
							react.createElement("span", { className: "dmv-up-hint" }, "拖到这里上移一层"),
						)
					: null,
				here.map(folderCard),
				(modelIds.length ? models : []).map(modelCard),
				searching && !hasContent
					? react.createElement("div", { key: "no-hit", className: "dmv-hint" }, "没有找到匹配的模型或文件夹。")
					: null,
				!searching && level && !hasContent
					? react.createElement("div", { key: "empty-hint", className: "dmv-hint" }, "这个文件夹是空的，可以把卡片拖进来。")
					: null,
			);
		}

		// ---------------------------------------------------------------------
		// Workbench view: left info / center viewer / right AI dialog.
		// ---------------------------------------------------------------------
		function WorkbenchView(props) {
			var item = props.item; // {id, name, title, model, ...}
			var model = item && item.model ? item.model : DEFAULT_MODEL;
			return react.createElement(
				"div",
				{ className: "dmv-workbench" },
				react.createElement(
					"div",
					{ className: "dmv-center" },
					// The toolbar's 导出 button opens the shared format flyout for this
					// item (see ModelViewTab.exportWorkbench).
					react.createElement(ModelViewerCanvas, { model: model, onExport: props.onExport }),
				),
			);
		}

		function bytes(bb) {
			if (!bb) return "";
			return [Math.round((bb.xmax - bb.xmin) * 100) / 100, Math.round((bb.ymax - bb.ymin) * 100) / 100, Math.round((bb.zmax - bb.zmin) * 100) / 100].join("×");
		}

		// ---------------------------------------------------------------------
		// Model tab: 模型库 / 工作台 switch.
		// ---------------------------------------------------------------------
		function ModelViewTab(props) {
			var locale = props.locale;
			var sessionId = props.sessionId;
			var useSessions = props.useSessions;
			var useWorkspaces = props.useWorkspaces;
			var ctx = props.ctx;
			var [views, setViews] = react.useState([]); // opened workbenches: [{key, item}]
			var [active, setActive] = react.useState("library");
			// Which view is showing, readable from the global listeners: those are
			// registered once, so a plain closure would keep the first render's value.
			var activeRef = react.useRef(active);
			activeRef.current = active;
			var [items, setItems] = react.useState([]);
			var [search, setSearch] = react.useState("");
			// The workbench is fixed to the viewport (see the page CSS rule), so it needs
			// the sidebar's right edge to know where to start. Track it so collapsing the
			// sidebar keeps the panel aligned.
			var [left, setLeft] = react.useState(286);
			react.useEffect(function () {
				var measure = function () {
					try {
						var page = document.querySelector(".dsh-mv-page");
						if (!page) return;
						// Nearest scrollable ancestor (dsh's conversation scroller) starts
						// right after the sidebar, so its left edge + 6px is our offset.
						var node = page.parentElement;
						var left = 0;
						for (var i = 0; i < 6 && node; i++) {
							var w = node.getBoundingClientRect().width;
							if (w > 300) { left = node.getBoundingClientRect().left; break; }
							node = node.parentElement;
						}
						var v = Math.round(left + 6);
						if (v > 0 && v < 900) setLeft(v);
					} catch (e) {}
				};
				measure();
				var ro = null;
				if (typeof ResizeObserver !== "undefined") {
					try {
						ro = new ResizeObserver(measure);
						ro.observe(document.body);
					} catch (e) {}
				}
				window.addEventListener("resize", measure);
				return function () {
					window.removeEventListener("resize", measure);
					if (ro) ro.disconnect();
				};
			}, []);

			var refresh = function () {
				listModels({}).then(function (res) {
					setItems(res.items || []);
				});
			};

			// ---- library organisation: folders, renames, navigation ----------
			var [folders, setFolders] = react.useState([]);
			var [askDelete, setAskDelete] = react.useState(null); // array of ids pending confirmation
			var [renamingId, setRenamingId] = react.useState(null);
			var [renamingFolder, setRenamingFolder] = react.useState(null);
			// Card menu (model or folder): {id, x, y} — a viewport-fixed menu, so the
			// anchor is chosen by how it was opened (pointer position for a
			// right-click, the ⋯ button for a tap).
			var [openMenu, setOpenMenu] = react.useState(null);
			var [blankMenu, setBlankMenu] = react.useState(null); // {x,y} of the blank-space menu
			// Export submenu of a model card: {id,title,hasSource,x,y,formats}.
			// Rendered at the page root (position:fixed) because the grid scrolls
			// and would clip an absolutely positioned flyout.
			var [exportMenu, setExportMenu] = react.useState(null);
			// Progress / result dialog of one export run.
			var [exportJob, setExportJob] = react.useState(null); // {title,format,state,message}
			/** Estimated card-menu box, used to keep it inside the viewport. */
			var MENU_W = 132;
			var MENU_H = 132;
			/**
			 * Where the card menu goes. `anchor` is either
			 * `{ pointer: {x,y} }` (right-click) or `{ button: rect }` (⋯ button,
			 * which opens below itself and above it when there is no room below);
			 * the result is clamped into the viewport.
			 */
			var menuPlacement = function (anchor) {
				var vw = window.innerWidth || 1024;
				var vh = window.innerHeight || 768;
				var x = 24;
				var y = 80;
				if (anchor && anchor.pointer) {
					x = anchor.pointer.x;
					y = anchor.pointer.y;
				} else if (anchor && anchor.button) {
					var rect = anchor.button;
					x = rect.left - 4;
					y = rect.bottom + 4;
					if (y + MENU_H > vh - 8) y = Math.max(8, rect.top - 4 - MENU_H);
				}
				return {
					x: Math.round(Math.max(8, Math.min(x, vw - MENU_W - 8))),
					y: Math.round(Math.max(8, Math.min(y, vh - MENU_H - 8))),
				};
			};
			/** Card menu opens/closes through here so the export flyout follows. */
			var toggleMenu = function (id, anchor) {
				// Keep the flyout only when it belongs to the menu being opened.
				setExportMenu(function (cur) { return cur && cur.id === id ? cur : null; });
				if (!id) {
					setOpenMenu(null);
					return;
				}
				// A card menu replaces the blank-space menu: right-clicking a card
				// after right-clicking blank space must not leave both on screen.
				setBlankMenu(null);
				var at = menuPlacement(anchor);
				setOpenMenu({ id: id, x: at.x, y: at.y });
			};
			// "移动到…": a click-driven move that works on every device, including the
			// touch devices where dragging is unreliable.
			var [moveAsk, setMoveAsk] = react.useState(null); // {type, id, name}
			/** Navigation path is the single source of truth for "where am I". */
			var [path, setPath] = react.useState([]); // [{id,name}] — [] = root
			var folderById = function (id) {
				return (folders || []).filter(function (f) { return f.id === id; })[0] || null;
			};
			var curFolder = path.length ? path[path.length - 1].id : "";
			var curLevel = curFolder;
			/**
			 * Ancestor chain of a folder, root first. Entering a folder from a search
			 * result (which may live anywhere in the tree) must still set the correct
			 * parents, otherwise "返回上一级" would point at the wrong level.
			 */
			var pathChainFor = function (id) {
				var chain = [];
				var cur = String(id || "");
				var guard = 0;
				while (cur && guard++ < 64) {
					var hit = (folders || []).filter(function (f) { return f.id === cur; })[0];
					if (!hit) break;
					chain.unshift({ id: hit.id, name: hit.name || "文件夹" });
					cur = String(hit.parent || "");
				}
				return chain;
			};
			var enterFolder = function (f) {
				if (!f || !f.id) return;
				var chain = pathChainFor(f.id);
				setPath(chain.length ? chain : [{ id: f.id, name: f.name || "文件夹" }]);
				setOpenMenu(null);
				setBlankMenu(null);
			};
			/** Back one level (equivalent to the ".." entry of a file manager). */
			var goBack = function () {
				setPath(function (p) { return (p || []).slice(0, Math.max(0, (p || []).length - 1)); });
				setOpenMenu(null);
				setBlankMenu(null);
			};
			// Right-click on blank space inside the model library opens a page-level
			// menu whose entries are 新建文件夹 / 刷新 (cards keep their own menu).
			react.useEffect(function () {
				var onCtx = function (e) {
					if (!document.querySelector(".dsh-mv-page")) return;
					// The workbench is a 3D canvas: no menu of ours belongs there, and the
					// browser's own menu is not wanted either, so the event is just eaten.
					if (activeRef.current !== "library") {
						e.preventDefault();
						e.stopPropagation();
						return;
					}
					// A press-and-hold on a card is the start of a touch drag, not a
					// context menu: swallow the menu the long press would have opened.
					// (The refs below are declared in the touch-drag block further down.)
					var draggingCard = touchDrag.current;
					var blockedUntil = touchCtxBlockUntil.current;
					if (draggingCard || Date.now() < (blockedUntil || 0)) {
						e.preventDefault();
						e.stopPropagation();
						return;
					}
					var el = e.target;
					// a card (or anything inside one) has its own menu — leave it alone,
					// and so does any of our open menus (the export flyout lives at the
					// page root, outside the grid).
					for (var i = 0; i < 4 && el; i++) {
						if (el.classList && (el.classList.contains("dmv-card") || el.classList.contains("dmv-menu"))) return;
						el = el.parentElement;
					}
					// Fields keep the browser's own menu (paste, spell check, …).
					try {
						if (e.target && e.target.closest && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
					} catch (err) {}
					// The menu belongs to the model library panel: outside it (the tab
					// strip, the toolbar, the page padding) nothing happens at all.
					var panel = document.querySelector(".dsh-mv-page .dmv-content-lib");
					if (!panel || !panel.getBoundingClientRect) return;
					var bounds = panel.getBoundingClientRect();
					var inside =
						e.clientX >= bounds.left &&
						e.clientX <= bounds.right &&
						e.clientY >= bounds.top &&
						e.clientY <= bounds.bottom;
					if (!inside) return;
					e.preventDefault();
					// Anchor at the pointer, clamped into the library panel so the menu
					// can never spill over the tab strip or the workbench edge.
					var w = 140;
					var h = 76;
					var x = Math.max(bounds.left + 4, Math.min(e.clientX, bounds.right - w - 4));
					var y = Math.max(bounds.top + 4, Math.min(e.clientY, bounds.bottom - h - 4));
					setBlankMenu({ x: Math.round(x), y: Math.round(y) });
					setOpenMenu(null);
					setExportMenu(null);
				};
				document.addEventListener("contextmenu", onCtx, true);
				return function () { document.removeEventListener("contextmenu", onCtx, true); };
			}, []);
			var isFolderId = function (id) {
				return (folders || []).some(function (f) { return f.id === id; });
			};
			var refreshFolders = function () {
				listFolders().then(function (res) { setFolders(res.folders || []); });
			};
			var refreshAll = function () {
				Promise.all([listModels({}), listFolders()]).then(function (out) {
					setItems(out[0].items || []);
					setFolders(out[1].folders || []);
				});
			};
			react.useEffect(function () { refreshAll(); }, [sessionId]);

			// ---- export (card context menu -> 导出 ▸) ------------------------
			// Auto-close timer of the flyout: hovering the 导出 row or the flyout
			// itself cancels it, leaving the menu area arms it.
			var exportCloseTimer = react.useRef(null);
			// The flyout element, measured to place it on the 导出 row.
			var exportMenuRef = react.useRef(null);
			var cancelExportClose = function () {
				if (exportCloseTimer.current) {
					clearTimeout(exportCloseTimer.current);
					exportCloseTimer.current = null;
				}
			};
			var scheduleExportClose = function () {
				cancelExportClose();
				// Long enough to cross the 4px gap between the 导出 row and the
				// flyout, short enough that leaving the row feels immediate.
				exportCloseTimer.current = setTimeout(function () {
					exportCloseTimer.current = null;
					setExportMenu(null);
				}, 220);
			};
			/** Hide the flyout right away (another menu entry was entered). */
			var hideExportMenu = function () {
				cancelExportClose();
				setExportMenu(null);
			};
			react.useEffect(function () {
				return function () { cancelExportClose(); };
			}, []);

			/**
			 * Show the export flyout for a model.
			 *
			 * Pointer devices get it on hover, a tap gets it on click — in both
			 * cases the card menu behind it stays open (nothing overlaps, and a tap
			 * needs the menu to stay reachable while the flyout is up).
			 *
			 * `anchorEl` is the row/button it hangs off: the 导出 entry of a card
			 * menu, or the viewer toolbar's 导出 button. The flyout opens to the
			 * RIGHT of the anchor's menu (or of the anchor itself), level with it,
			 * and flips to the left when the right side has no room for it.
			 */
			var openExportMenu = function (m, anchorEl, mode) {
				if (!m || !m.id) return;
				// Clicking the same anchor again closes the flyout (hover never does:
				// the pointer returning to the 导出 row must keep it open).
				if (mode === "click" && exportMenu && exportMenu.id === m.id && exportMenu.anchor === anchorEl) {
					hideExportMenu();
					return;
				}
				cancelExportClose();
				var row = null;
				var menu = null;
				try {
					var node = anchorEl;
					if (node && node.getBoundingClientRect) row = node.getBoundingClientRect();
					var host = node && node.closest ? node.closest(".dmv-menu") : null;
					if (host) menu = host.getBoundingClientRect();
				} catch (err) {}
				var anchor = menu || row;
				var width = 232;
				var height = 380;
				var gap = 4;
				var vw = window.innerWidth || 1024;
				var vh = window.innerHeight || 768;
				var x = anchor ? anchor.right + gap : 8;
				if (x + width > vw - 8) {
					// No room on the right: flip to the left, then keep it on screen.
					x = anchor ? anchor.left - gap - width : Math.max(8, vw - width - 8);
					x = Math.max(8, Math.min(x, vw - width - 8));
				}
				// Line the flyout up with the 导出 row rather than the menu's top.
				var y = row ? row.top - 6 : anchor ? anchor.top : 80;
				if (y + height > vh - 8) y = Math.max(8, vh - 8 - height);
				setExportMenu({
					id: m.id,
					title: m.title || m.name || "模型",
					hasSource: !!m.hasSource,
					x: Math.round(x),
					y: Math.round(y),
					// Where it was opened from (a second click there closes it), plus
					// where it would like to sit; the effect below re-clamps once the
					// real height is known.
					anchor: anchorEl || null,
					anchorTop: Math.round(row ? row.top - 6 : y),
					formats: null,
				});
				listExportFormats().then(function (formats) {
					// Only fill in the flyout that is still asking for this model.
					setExportMenu(function (cur) {
						if (!cur || cur.id !== m.id) return cur;
						return Object.assign({}, cur, { formats: formats });
					});
				});
			};

			// The estimate above only has to keep the first paint inside the
			// viewport; once the flyout is in the DOM its real height places it
			// exactly on the 导出 row.
			react.useEffect(function () {
				if (!exportMenu) return;
				var node = exportMenuRef.current;
				var height = node && node.offsetHeight;
				if (!height) return;
				var vh = window.innerHeight || 768;
				var want = Math.max(8, Math.min(exportMenu.anchorTop || 8, vh - 8 - height));
				if (Math.abs(want - exportMenu.y) < 2) return;
				setExportMenu(function (cur) {
					return cur && cur.id === exportMenu.id ? Object.assign({}, cur, { y: want }) : cur;
				});
			}, [exportMenu]);

			/** Fetch one export from the server and hand the file to the browser. */
			var runExport = function (m, format) {
				var title = (m && (m.title || m.name)) || "模型";
				setExportMenu(null);
				// The export is under way: the card menu has done its job.
				setOpenMenu(null);
				setExportJob({ title: title, format: format, state: "busy" });
				window
					.fetch(exportUrl(m.id, format.id))
					.then(function (res) {
						if (!res.ok) {
							return res
								.json()
								.catch(function () { return null; })
								.then(function (body) {
									throw new Error((body && body.error) || "导出失败（HTTP " + res.status + "）");
								});
						}
						var name = filenameOf(res, (m.title || m.name || "model") + (format.ext || ""));
						return res.blob().then(function (blob) { return { blob: blob, name: name }; });
					})
					.then(function (out) {
						var url = URL.createObjectURL(out.blob);
						var a = document.createElement("a");
						a.href = url;
						a.download = out.name;
						a.style.display = "none";
						document.body.appendChild(a);
						a.click();
						// Give the browser time to start the download before revoking.
						setTimeout(function () {
							URL.revokeObjectURL(url);
							if (a.parentNode) a.parentNode.removeChild(a);
						}, 10000);
						setExportJob({ title: title, format: format, state: "done", message: out.name });
					})
					.catch(function (err) {
						setExportJob({
							title: title,
							format: format,
							state: "error",
							message: String((err && err.message) || err),
						});
					});
			};

			// Esc closes the export flyout.
			react.useEffect(function () {
				if (!exportMenu) return undefined;
				var onKey = function (e) { if (e.key === "Escape") setExportMenu(null); };
				document.addEventListener("keydown", onKey);
				return function () { document.removeEventListener("keydown", onKey); };
			}, [exportMenu]);

			// ...and so does a press anywhere outside it (a menu it was opened from
			// keeps its own click handling, which re-opens or repositions the flyout).
			react.useEffect(function () {
				if (!exportMenu) return undefined;
				var onDown = function (e) {
					var el = e.target;
					for (var i = 0; i < 6 && el; i++) {
						if (
							el.classList &&
							(el.classList.contains("dmv-export-menu") ||
								el.classList.contains("dmv-menu") ||
								// the viewer toolbar button toggles it on click
								el.classList.contains("dmv-toolbar-export"))
						) {
							return;
						}
						el = el.parentElement;
					}
					setExportMenu(null);
				};
				document.addEventListener("mousedown", onDown, true);
				return function () { document.removeEventListener("mousedown", onDown, true); };
			}, [exportMenu]);

			/** Ask before deleting: every delete path goes through this dialog. */
			var startDelete = function (ids) {
				var list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
				if (list.length) setAskDelete(list);
			};
			var doDelete = function (ids) {
				var list = Array.isArray(ids) ? ids : [ids];
				Promise.all(list.map(function (id) { return deleteModel(id); })).then(function () {
					setAskDelete(null);
					refresh();
				});
			};
			var commitRename = function (id, name) {
				var next = String(name || "").trim();
				setRenamingId(null);
				var current = (items || []).filter(function (m) { return m.id === id; })[0];
				if (!next || !current || (current.title || current.name || "") === next) return;
				patchModel(id, { title: next }).then(function () { refresh(); });
			};
			var addFolder = function (parentId) {
				createFolder("新建文件夹", parentId || "").then(function (res) {
					refreshFolders();
					var folder = res && res.folder;
					if (folder) {
						// created here, so stay here and let its card be renamed in place
						setRenamingId(folder.id);
					}
				});
			};
			var commitFolderRename = function (id, name) {
				var next = String(name || "").trim();
				setRenamingFolder(null);
				setRenamingId(null);
				var current = (folders || []).filter(function (f) { return f.id === id; })[0];
				if (!next || !current || current.name === next) return;
				renameFolder(id, next).then(function () { refreshFolders(); });
			};
			var removeFolder = function (id) {
				deleteFolder(id).then(function () {
					// if we were inside it, step out to its parent
					setPath(function (p) {
						var arr = p || [];
						return arr.some(function (x) { return x.id === id; }) ? arr.slice(0, arr.length - 1) : arr;
					});
					refreshAll();
				});
			};
			/** Drag & drop: models move between folders, folders nest (cycles refused). */
			var dragOverRef = null;
			var clearDragOver = function () {
				try {
					if (dragOverRef) dragOverRef.classList.remove("dmv-drop-over");
				} catch (e) {}
				dragOverRef = null;
			};
			var readDrag = function (e) {
				try {
					return JSON.parse(e.dataTransfer.getData("text/plain") || "null");
				} catch (err) {
					return null;
				}
			};
			/** A drop is only legal on a folder (or the "up" card) and never into itself. */
			var canDropOn = function (drag, targetFolder) {
				if (!drag || !drag.id) return false;
				if (drag.type !== "folder") return true;
				if (drag.id === targetFolder) return false;
				return !(targetFolder && folderIsWithin(targetFolder, drag.id, folders));
			};
			var moveItems = function (ids, folderId) {
				Promise.all((ids || []).map(function (id) { return patchModel(id, { folder: folderId || "" }); })).then(function () {
					refresh();
				});
			};
			/** Single move path shared by the mouse drop and the touch drag. */
			var applyMove = function (payload, targetFolder) {
				var target = String(targetFolder || "");
				if (!payload || !payload.id) return;
				if (!canDropOn(payload, target)) return;
				if (payload.type === "folder") {
					moveFolder(payload.id, target).then(function () { refreshFolders(); });
					return;
				}
				moveItems([payload.id], target);
			};
			var handleDrop = function (e, targetFolder) {
				var payload = readDrag(e);
				clearDragOver();
				applyMove(payload, targetFolder);
			};
			/** Destination picked in "移动到…" mode. */
			var pickTarget = function (targetFolder) {
				var pending = moveAsk;
				setMoveAsk(null);
				if (!pending) return;
				applyMove({ type: pending.type, id: pending.id }, targetFolder);
			};
			var dragOverTarget = function (e, isFolder, folderId) {
				if (!isFolder) return;
				e.preventDefault();
				try {
					e.dataTransfer.dropEffect = "move";
				} catch (err) {}
				var node = e.currentTarget;
				if (dragOverRef && dragOverRef !== node) dragOverRef.classList.remove("dmv-drop-over");
				dragOverRef = node;
				try {
					node.classList.add("dmv-drop-over");
				} catch (err) {}
			};

			// ---- touch drag ------------------------------------------------------
			// A touch device whose browser can start a drag from a long press (Android
			// Chrome, iOS Safari, …) needs none of this: the browser starts the drag at
			// ~500ms, we hand it our own card as the drag image, and it keeps that card
			// under the finger by itself. The hold below is therefore deliberately
			// LONGER than the browser's own long press, so the native drag always wins on
			// such a device. This path only takes over where no native touch drag exists.
			var HOLD_MS = 600;
			var touchDrag = react.useRef(null); // {drag, node, startX, startY, x, y, active, timer}
			var touchOverNode = react.useRef(null);
			var touchCtxBlockUntil = react.useRef(0);
			var touchClickBlockUntil = react.useRef(0);
			var ghostNode = null;
			var ghostTimer = null;
			// Trace of the last touch drag. Only used to explain a drag that the browser
			// interrupted: the report is shown on screen (the device we need this from
			// has no devtools), so the failing device can tell us what it received.
			var trace = { list: [], t0: 0, moves: 0, activated: false, sawEnd: false, sawCancel: false, native: false, label: "" };
			var traceEvent = function (name, detail) {
				try {
					if (trace.list.length > 20) return;
					trace.list.push(name + (detail ? "(" + detail + ")" : "") + " +" + (Date.now() - trace.t0) + "ms");
				} catch (e) {}
			};
			var traceReset = function (label) {
				trace = { list: [], t0: Date.now(), moves: 0, activated: false, sawEnd: false, sawCancel: false, native: false, label: label || "" };
			};

			/** Remove the floating card. */
			var dropGhost = function () {
				try {
					if (ghostNode && ghostNode.parentNode) ghostNode.parentNode.removeChild(ghostNode);
				} catch (e) {}
				ghostNode = null;
			};
			/**
			 * A safety net: if a browser drops the end of a drag on the floor (no
			 * touchend, no dragend — which is how a floating card could get stuck on a
			 * tablet), it is removed anyway once the drag has been idle for a while.
			 */
			var armGhostWatchdog = function () {
				if (ghostTimer) clearTimeout(ghostTimer);
				ghostTimer = setTimeout(function () {
					ghostTimer = null;
					traceEvent("watchdog");
					finishDrag();
				}, 2500);
			};
			/** Keep the floating card centred on the pointer. */
			var moveGhost = function (x, y) {
				if (!ghostNode) return;
				try {
					var w = ghostNode.offsetWidth || 120;
					var h = ghostNode.offsetHeight || 34;
					ghostNode.style.transform = "translate3d(" + Math.round(x - w / 2) + "px," + Math.round(y - h / 2) + "px,0)";
					armGhostWatchdog();
				} catch (e) {}
			};
			/**
			 * The floating card is a full copy of the card being dragged (thumbnail,
			 * name, meta), not a reduced chip. The clone sits inside a [data-dmv]
			 * wrapper because every card rule is written as "[data-dmv] .dmv-card …",
			 * i.e. the attribute must be on an ancestor. Returns the detached element.
			 */
			var buildGhostEl = function (node) {
				try {
					if (!node || typeof document === "undefined") return null;
					var rect = node.getBoundingClientRect();
					var wrap = document.createElement("div");
					wrap.className = "dmv-ghost";
					wrap.setAttribute("data-dmv", "");
					var card = node.cloneNode(true);
					card.classList.remove("dmv-drag-src", "dmv-drop-over", "dmv-card-up");
					// An open ⋯ menu / a rename field must not travel with the copy.
					var strip = card.querySelectorAll(".dmv-menu-wrap, .dmv-menu, .dmv-rename, .dmv-folder-open, .dmv-up-hint");
					for (var i = 0; i < strip.length; i++) {
						if (strip[i].parentNode) strip[i].parentNode.removeChild(strip[i]);
					}
					// The copy is free-floating: drop any inline placement the source had
					// and pin it to the exact size the card occupies in the grid.
					card.style.position = "";
					card.style.left = "";
					card.style.top = "";
					card.style.right = "";
					card.style.bottom = "";
					card.style.margin = "0";
					card.style.boxSizing = "border-box";
					card.style.width = rect.width + "px";
					card.style.height = rect.height + "px";
					wrap.appendChild(card);
					// Size the wrapper explicitly: a fixed-position element with only
					// left/top would otherwise shrink-to-fit against the viewport, and the
					// floating card would not sit centred under the pointer.
					wrap.style.width = rect.width + "px";
					wrap.style.height = rect.height + "px";
					return wrap;
				} catch (e) {
					return null;
				}
			};
			/** Track the floating card ourselves (touch drag: we own the coordinates). */
			var showGhost = function (node) {
				dropGhost();
				try {
					if (!document.body) return;
					var wrap = buildGhostEl(node);
					if (!wrap) return;
					document.body.appendChild(wrap);
					ghostNode = wrap;
					armGhostWatchdog();
				} catch (e) {}
			};
			/** Hide the source card, but keep its slot so the grid does not reflow. */
			var hideSourceCard = function (node) {
				try {
					if (node) node.classList.add("dmv-drag-src");
				} catch (e) {}
			};
			var showSourceCard = function (node) {
				try {
					if (node) node.classList.remove("dmv-drag-src");
				} catch (e) {}
			};
			/** Belt and braces: un-hide whatever is still marked, DOM identity aside. */
			var clearDragSources = function () {
				try {
					var list = document.querySelectorAll(".dmv-drag-src");
					for (var i = 0; i < list.length; i++) list[i].classList.remove("dmv-drag-src");
				} catch (e) {}
			};
			/** Nearest scrollable ancestor — the list a card sits in. */
			var setTouchOver = function (node) {
				if (touchOverNode.current === node) return;
				try {
					if (touchOverNode.current) touchOverNode.current.classList.remove("dmv-drop-over");
				} catch (e) {}
				touchOverNode.current = node || null;
				if (!node) return;
				try {
					node.classList.add("dmv-drop-over");
				} catch (e) {}
			};
			/** Presses on the card's own controls (⋯ menu, rename field) never drag. */
			var isInteractiveTarget = function (target) {
				var el = target;
				for (var i = 0; i < 4 && el; i++) {
					var tag = el.tagName ? String(el.tagName).toUpperCase() : "";
					if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return true;
					el = el.parentElement;
				}
				return false;
			};
			var endCardPress = function () {
				var st = touchDrag.current;
				if (st) {
					if (st.timer) clearTimeout(st.timer);
					showSourceCard(st.node);
					touchDrag.current = null;
				}
				setTouchOver(null);
				// The press is over: keep the menu suppressed briefly, because a long
				// press can deliver contextmenu right after the release as well.
				touchCtxBlockUntil.current = Date.now() + 700;
			};
			/** Which card is under the finger, and which folder id it stands for. */
			var cardUnder = function (x, y) {
				try {
					var el = document.elementFromPoint(x, y);
					for (var i = 0; i < 6 && el; i++) {
						if (el.classList && el.classList.contains("dmv-card")) {
							return el.getAttribute("data-dmv-folder") === null ? null : el;
						}
						el = el.parentElement;
					}
				} catch (e) {}
				return null;
			};
			var onCardPress = function (e, drag) {
				var t = e && e.touches && e.touches[0];
				if (!t || !drag) return; // mouse: the HTML5 path handles it
				if (isInteractiveTarget(e.target)) return;
				traceReset(drag.type === "folder" ? "文件夹卡" : "模型卡");
				traceEvent("touchstart", Math.round(t.clientX) + "," + Math.round(t.clientY));
				// The card menu stays suppressed for the whole press. Keying this off the
				// activation instead is what let the menu through on a tablet: there the
				// browser's own drag starts at ~500ms and clears the touch state long
				// before our (deliberately longer) hold would have armed the window.
				touchCtxBlockUntil.current = Date.now() + 3600000;
				endCardPress();
				var st = {
					drag: drag,
					node: e.currentTarget,
					startX: t.clientX,
					startY: t.clientY,
					x: t.clientX,
					y: t.clientY,
					active: false,
					canceled: false,
					timer: null,
				};
				/**
				 * The card stays draggable even for the touch drag. On a tablet that turns
				 * the long press into a native drag we simply follow it (see
				 * onNativeDragStart); on one that does not, the browser never starts a
				 * drag and our own gesture handles everything. Switching `draggable` off
				 * here would break the first kind of device outright.
				 */
				st.timer = setTimeout(function () {
					if (touchDrag.current !== st) return;
					st.active = true;
					trace.activated = true;
					traceEvent("activated");
					// Past this point the gesture is a click-free drag.
					touchClickBlockUntil.current = Date.now() + 2000;
					showGhost(st.node);
					moveGhost(st.x, st.y);
					hideSourceCard(st.node);
				}, HOLD_MS);
				touchDrag.current = st;
			};
			/**
			 * A real (mouse/pen) drag: the browser's drag image is suppressed and the
			 * same floating card is used, so both drag paths look identical. Our touch
			 * gesture yields whenever the browser takes the drag over.
			 */
			var nativeDragNode = null;
			var endNativeDrag = function () {
				showSourceCard(nativeDragNode);
				nativeDragNode = null;
			};
			/**
			 * Shown only when the browser cut a drag short. It answers the question no
			 * amount of guessing can: which touch events actually reached the page.
			 */
			var lastReportAt = 0;
			var showDragReport = function () {
				try {
					if (Date.now() - lastReportAt < 3000) return;
					lastReportAt = Date.now();
					var style = "none";
					var drag = "";
					try {
						var src = document.querySelector("[data-dmv] .dmv-card");
						if (src) {
							style = getComputedStyle(src).touchAction || "none";
							drag = String(src.getAttribute("draggable"));
						}
					} catch (e) {}
					var lines = [
						"拖拽诊断（点按关闭）",
						"序列: " + (trace.list.length ? trace.list.join(" → ") : "无事件"),
						"touchend: " + (trace.sawEnd ? "有" : "无") + " | touchcancel: " + (trace.sawCancel ? "有" : "无") + " | touchmove 次数: " + trace.moves,
						"卡片: " + (trace.label || "?") + " | touch-action: " + style + " | draggable: " + drag,
						"UA: " + String((typeof navigator !== "undefined" && navigator.userAgent) || "").slice(0, 96),
					];
					var box = document.createElement("div");
					box.className = "dmv-dragreport";
					box.textContent = lines.join("\n");
					box.addEventListener("click", function () {
						try {
							if (box.parentNode) box.parentNode.removeChild(box);
						} catch (e) {}
					});
					document.body.appendChild(box);
					setTimeout(function () {
						try {
							if (box.parentNode) box.parentNode.removeChild(box);
						} catch (e) {}
					}, 20000);
				} catch (e) {}
			};
			/**
			 * The single exit door for a drag, whatever ended it: touch release, touch
			 * cancel, dragend, drop, window blur, or the idle watchdog. Cleaning up here
			 * (instead of in each path) is what keeps a floating card from being left
			 * behind on a tablet.
			 */
			var finishDrag = function () {
				endCardPress();
				endNativeDrag();
				clearDragSources();
				dropGhost();
				if (ghostTimer) {
					clearTimeout(ghostTimer);
					ghostTimer = null;
				}
				// An activated drag that never saw touchend (or that was cancelled) means
				// the browser took the gesture — unless it took it as a native drag, which
				// we follow on purpose, so that is not a failure.
				if (trace.activated && !trace.native && (!trace.sawEnd || trace.sawCancel)) showDragReport();
			};
			var onNativeDragStart = function (e) {
				if (trace.t0) traceEvent("dragstart");
				/**
				 * From here the browser owns the drag (mouse, or a tablet that turns the
				 * long press into a native drag). It also owns the visual: handing it our
				 * card as the drag image means the browser keeps that card under the
				 * pointer by itself — which matters because a touch-driven drag does not
				 * deliver dependable dragover coordinates to drive it from script.
				 */
				var st = touchDrag.current;
				var node = (e && e.target && e.target.closest ? e.target.closest(".dmv-card") : null) || (st && st.node) || null;
				if (node) trace.native = true;
				finishDrag();
				if (!node) return;
				nativeDragNode = node;
				try {
					var rect = node.getBoundingClientRect();
					var g = buildGhostEl(node);
					if (g) {
						// Off-screen but rendered: the browser needs a laid-out element to
						// snapshot, and it must not show up next to the browser's own image.
						g.style.left = "-10000px";
						g.style.top = "0";
						document.body.appendChild(g);
						if (e.dataTransfer && e.dataTransfer.setDragImage) {
							e.dataTransfer.setDragImage(g, Math.round(rect.width / 2), Math.round(rect.height / 2));
						}
						setTimeout(function () {
							try {
								if (g.parentNode) g.parentNode.removeChild(g);
							} catch (err) {}
						}, 0);
					}
				} catch (err) {}
				// The source card is hidden once the drag is safely running: hiding it
				// inside dragstart makes Chrome abort the drag altogether.
				setTimeout(function () {
					if (nativeDragNode === node) hideSourceCard(node);
				}, 60);
			};
			/** First dragover is the earliest safe moment to hide the source card. */
			var onNativeDragOver = function () {
				if (!nativeDragNode) return;
				hideSourceCard(nativeDragNode);
			};
			react.useEffect(function () {
				var onMove = function (e) {
					var st = touchDrag.current;
					if (!st) {
						if (trace.t0) traceEvent("move(no-state)");
						return;
					}
					var t = e.touches && e.touches[0];
					if (!t) return;
					if (st.active) {
						trace.moves++;
						if (trace.moves === 1) traceEvent("move1", Math.round(t.clientX) + "," + Math.round(t.clientY));
					}
					st.x = t.clientX;
					st.y = t.clientY;
					if (!st.active) {
						// Moved before the hold completed: the user is scrolling the list,
						// which the browser handles natively.
						if (Math.abs(t.clientX - st.startX) > 8 || Math.abs(t.clientY - st.startY) > 8) endCardPress();
						return;
					}
					if (e.cancelable) e.preventDefault(); // keep the page from scrolling
					moveGhost(t.clientX, t.clientY);
					var node = cardUnder(t.clientX, t.clientY);
					setTouchOver(node && canDropOn(st.drag, node.getAttribute("data-dmv-folder")) ? node : null);
				};
				var onEnd = function (e) {
					trace.sawEnd = true;
					if (trace.t0) traceEvent("touchend", "move 共 " + trace.moves);
					var st = touchDrag.current;
					if (st) {
						// Prefer the coordinates carried by the release itself: if no
						// touchmove ever reached us (a swallowed gesture), st.x/st.y would
						// still be the press point and the card would drop where it started.
						var released = e && e.changedTouches && e.changedTouches[0];
						if (released && st.active) {
							st.x = released.clientX;
							st.y = released.clientY;
						}
						var wasActive = st.active;
						var node = wasActive ? cardUnder(st.x, st.y) : null;
						if (wasActive) {
							// Swallow the synthetic click/mouse (and any late context menu) that
							// follows a long press.
							touchClickBlockUntil.current = Math.max(touchClickBlockUntil.current, Date.now() + 400);
							touchCtxBlockUntil.current = Math.max(touchCtxBlockUntil.current, Date.now() + 700);
							if (e && e.cancelable) e.preventDefault();
							if (node) applyMove(st.drag, node.getAttribute("data-dmv-folder"));
						}
					}
					finishDrag();
				};
				var onCancel = function () {
					// Some browsers fire touchcancel when they take a gesture over and then
					// keep delivering the rest of it. Killing an active drag here is what
					// left a floating card stuck on a tablet, so keep it alive and let the
					// touchend that follows (or the idle watchdog) end it.
					trace.sawCancel = true;
					if (trace.t0) traceEvent("touchcancel", "move 共 " + trace.moves);
					var st = touchDrag.current;
					if (st && st.active) {
						st.canceled = true;
						return;
					}
					finishDrag();
				};
				var onHidden = function () { if (document.hidden) finishDrag(); };
				// The long press that starts a drag would otherwise also open the card's
				// context menu. Caught here (document capture) so the menu never renders.
				var onCtxBlock = function (e) {
					if (!touchDrag.current && Date.now() >= touchCtxBlockUntil.current) return;
					e.preventDefault();
					e.stopPropagation();
				};
				var onClickCapture = function (e) {
					if (Date.now() >= touchClickBlockUntil.current) return;
					e.stopPropagation();
					e.preventDefault();
				};
				// Everything is bound on WINDOW in the CAPTURE phase. The app we live in
				// (dsh's own panels and scrollers) may call stopPropagation on touchmove,
				// and a bubbling listener on document would then never see the gesture —
				// which is exactly how a floating card can sit still while the finger
				// moves. Capture on window is the first stop of the event path, so no
				// other handler can get in front of it.
				var opts = { passive: false, capture: true };
				window.addEventListener("contextmenu", onCtxBlock, true);
				window.addEventListener("dragstart", onNativeDragStart, true);
				window.addEventListener("dragover", onNativeDragOver, true);
				window.addEventListener("dragend", finishDrag, true);
				window.addEventListener("drop", finishDrag, true);
				window.addEventListener("touchmove", onMove, opts);
				window.addEventListener("touchend", onEnd, true);
				window.addEventListener("touchcancel", onCancel, true);
				window.addEventListener("click", onClickCapture, true);
				document.addEventListener("visibilitychange", onHidden);
				window.addEventListener("blur", finishDrag);
				return function () {
					finishDrag();
					window.removeEventListener("contextmenu", onCtxBlock, true);
					window.removeEventListener("dragstart", onNativeDragStart, true);
					window.removeEventListener("dragover", onNativeDragOver, true);
					window.removeEventListener("dragend", finishDrag, true);
					window.removeEventListener("drop", finishDrag, true);
					window.removeEventListener("touchmove", onMove, opts);
					window.removeEventListener("touchend", onEnd, true);
					window.removeEventListener("touchcancel", onCancel, true);
					window.removeEventListener("click", onClickCapture, true);
					document.removeEventListener("visibilitychange", onHidden);
					window.removeEventListener("blur", finishDrag);
				};
			}, []);
			var folderName = function (id) {
				var hit = (folders || []).filter(function (f) { return f.id === id; })[0];
				return hit ? hit.name : "未分类";
			};
			// When the model tab is mounted/active, hide dsh's blank width handles
			// via a body class (more robust than :has() across DOM levels).
			react.useEffect(function () {
				var b = document.body;
				b.classList.add("dsh-mv-active");
				return function () { b.classList.remove("dsh-mv-active"); };
			}, []);

			// An inline card can ask for "open this model in a workbench"; if the
			// request arrived before the tab was mounted it is still in pendingOpen.
			react.useEffect(function () {
				var consume = function (payload) {
					if (!payload) return;
					if (payload.model) {
						openModel({
							id: payload.id || payload.callId || "inline-" + Date.now(),
							title: payload.title || "3D 模型",
							model: payload.model,
						});
						return;
					}
					if (!payload.id) return;
					getModel(payload.id).then(function (full) {
						var item = full && full.item;
						if (item) openModel(item);
					});
				};
				var onOpen = function (e) { consume((e && e.detail) || pendingOpen); };
				if (pendingOpen) {
					var p = pendingOpen;
					pendingOpen = null;
					consume(p);
				}
				document.addEventListener(OPEN_EVENT, onOpen);
				return function () { document.removeEventListener(OPEN_EVENT, onOpen); };
			}, []);

			function openModel(item) {
				if (!item) return;
				var key = String(item.id || Date.now());
				setViews(function (vs) {
					if (vs.some(function (v) { return v.key === key; })) {
						return vs.map(function (v) { return v.key === key ? { key: key, item: item } : v; });
					}
					return vs.concat([{ key: key, item: item }]);
				});
				setActive(key);
			}
			function closeView(key) {
				setViews(function (vs) { return vs.filter(function (v) { return v.key !== key; }); });
				setActive(function (a) { return a === key ? "library" : a; });
			}
			function onDelete(m) {
				deleteModel(m.id).then(function () { refresh(); });
			}
			// Load the full item (with model) before opening a workbench.
			function openFromLibrary(m) {
				getModel(m.id).then(function (full) {
					openModel(full && full.item ? full.item : m);
				});
			}

			var activeView = null;
			for (var i = 0; i < views.length; i++) {
				if (views[i].key === active) { activeView = views[i]; break; }
			}

			/**
			 * Export the model currently open in the workbench — the handler behind
			 * the viewer toolbar's 导出 button. It reuses the library's format flyout
			 * (so the list is identical) and its download path.
			 *
			 * A workbench opened from an inline card may carry no library id; the
			 * model is stored first in that case. The store de-duplicates on geometry
			 * + title, so this normally resolves to the entry the model tool created.
			 */
			var exportWorkbench = function (anchorEl) {
				var item = activeView && activeView.item;
				if (!item) return;
				var title = item.title || item.name || "模型";
				var id = String(item.id || "");
				var stored = /^[0-9a-f-]{6,}$/i.test(id) && id.indexOf("-") > 0;
				if (!stored) {
					if (!item.model) return;
					setExportJob({ title: title, format: null, state: "busy", message: "正在存入模型库…" });
					window
						.fetch("/3dmodel/api/items", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ model: item.model, title: title }),
						})
						.then(function (r) { return r.ok ? r.json() : null; })
						.then(function (res) {
							if (!res || !res.id) throw new Error("无法把这个模型存入模型库");
							setExportJob(null);
							openExportMenu({ id: res.id, title: res.title || title, hasSource: false }, anchorEl, "click");
						})
						.catch(function (err) {
							setExportJob({
								title: title,
								format: null,
								state: "error",
								message: String((err && err.message) || err),
							});
						});
					return;
				}
				openExportMenu({ id: id, title: title, hasSource: !!item.script }, anchorEl, "click");
				// The workbench item may have been opened from an inline payload, which
				// carries no `script`: refresh the exact-geometry hint from the store.
				getModel(id).then(function (res) {
					var full = res && res.item;
					if (!full) return;
					setExportMenu(function (cur) {
						if (!cur || cur.id !== id) return cur;
						return Object.assign({}, cur, {
							hasSource: !!full.script,
							title: full.title || cur.title,
						});
					});
				});
			};

			// Esc leaves "移动到…" mode.
			react.useEffect(function () {
				if (!moveAsk) return undefined;
				var onKey = function (e) { if (e.key === "Escape") setMoveAsk(null); };
				document.addEventListener("keydown", onKey);
				return function () { document.removeEventListener("keydown", onKey); };
			}, [moveAsk]);

			// Right-click menu for blank space. It is rendered at the page root because
			// inside the grid it would become a grid item and get stretched.
			var blankMenuNode = blankMenu
				? react.createElement(
						"div",
						{
							className: "dmv-menu dmv-menu-page",
							style: { left: Math.round(blankMenu.x || 0) + "px", top: Math.round(blankMenu.y || 0) + "px" },
							onClick: function (e) { e.stopPropagation(); },
							onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); },
						},
						react.createElement(
							"button",
							{ type: "button", className: "dmv-menu-item", onClick: function () { setBlankMenu(null); addFolder(curLevel || ""); } },
							"新建文件夹",
						),
						react.createElement(
							"button",
							{ type: "button", className: "dmv-menu-item", onClick: function () { setBlankMenu(null); refreshAll(); } },
							"刷新",
						),
					)
				: null;

			// Export flyout for a model card: the format catalog, grouped. Rendered
			// at the page root (fixed) so the scrolling grid cannot clip it.
			var exportMenuNode = exportMenu
				? react.createElement(
						"div",
						{
							className: "dmv-menu dmv-menu-page dmv-export-menu",
							ref: exportMenuRef,
							style: { left: exportMenu.x + "px", top: exportMenu.y + "px" },
							onClick: function (e) { e.stopPropagation(); },
							onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); },
							// The pointer is on the flyout: keep it open (the card
							// menu's own mouseleave already armed the close timer).
							onMouseEnter: cancelExportClose,
							onMouseLeave: scheduleExportClose,
						},
						react.createElement("div", { className: "dmv-export-head", title: exportMenu.title }, exportMenu.title),
						react.createElement(
							"div",
							{ className: "dmv-export-note" },
							exportMenu.hasSource
								? "已保存 CadQuery 源码 · 导出为精确几何"
								: "仅有网格 · 由三角网格重建几何",
						),
						exportMenu.formats
							? (function () {
									var nodes = [];
									var group = "";
									exportMenu.formats.forEach(function (f) {
										if (f.group !== group) {
											group = f.group || "其它";
											nodes.push(
												react.createElement("div", { key: "group:" + group, className: "dmv-export-group" }, group),
											);
										}
										nodes.push(
											react.createElement(
												"button",
												{
													key: f.id,
													type: "button",
													className: "dmv-menu-item dmv-export-item",
													title: (f.desc || f.label || f.id) + "　导出为 " + (f.ext || f.id),
													onClick: function () { runExport(exportMenu, f); },
												},
												react.createElement(
													"span",
													{ className: "dmv-export-row" },
													react.createElement("span", { className: "dmv-export-label" }, f.label || f.id),
													react.createElement("span", { className: "dmv-export-ext" }, f.ext || ""),
												),
												f.desc ? react.createElement("span", { className: "dmv-export-desc" }, f.desc) : null,
											),
										);
									});
									return nodes;
								})()
							: react.createElement("div", { className: "dmv-hint dmv-export-loading" }, "正在读取格式列表…"),
					)
				: null;

			// One export runs at a time; the dialog reports it and can be dismissed
			// while the server keeps building the file.
			var exportJobNode = exportJob
				? react.createElement(
						"div",
						{
							className: "dmv-modal",
							onClick: function () { if (exportJob.state !== "busy") setExportJob(null); },
						},
						react.createElement(
							"div",
							{ className: "dmv-dialog", onClick: function (e) { e.stopPropagation(); } },
							react.createElement(
								"div",
								{ className: "dmv-dialog-title" },
								exportJob.state === "busy"
									? "正在导出…"
									: exportJob.state === "done"
										? "导出完成"
										: "导出失败",
							),
							react.createElement(
								"div",
								{ className: "dmv-dialog-text" },
								(exportJob.format ? (exportJob.format.label || exportJob.format.id) + " · " : "") + exportJob.title,
							),
							react.createElement(
								"div",
								{ className: "dmv-dialog-text" },
								exportJob.state === "busy"
									? exportJob.message || "CadQuery 正在生成文件，大型网格可能需要数十秒。"
									: exportJob.state === "done"
										? "已开始下载：" + (exportJob.message || "")
										: exportJob.message || "未知错误",
							),
							react.createElement(
								"div",
								{ className: "dmv-dialog-actions" },
								react.createElement(
									"button",
									{ type: "button", className: "dmv-btn", onClick: function () { setExportJob(null); } },
									exportJob.state === "busy" ? "后台继续" : "关闭",
								),
							),
						),
					)
				: null;

			return react.createElement(
				"div",
				{ "data-dmv": "", className: "dsh-mv-page", style: { ["--dmv-left"]: left + "px", display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0 } },
				react.createElement(
					"div",
					{ className: "dmv-subtabs" },
					react.createElement(
						"span",
						{ className: active === "library" ? "dmv-subtab on" : "dmv-subtab", onClick: function () { setActive("library"); } },
						"模型库",
					),
					views.map(function (v) {
						return react.createElement(
							"span",
							{ key: v.key, className: active === v.key ? "dmv-subtab on" : "dmv-subtab", onClick: function () { setActive(v.key); } },
							react.createElement("span", { className: "dmv-subtab-label" }, (v.item && (v.item.title || v.item.name)) || "工作台"),
							react.createElement(
								"span",
								{ className: "dmv-subtab-close", title: "关闭", onClick: function (e) { e.stopPropagation(); closeView(v.key); } },
								"×",
							),
						);
					}),
				),
				react.createElement(
					"div",
					{ className: active === "library" || !activeView ? "dmv-content dmv-content-lib" : "dmv-content", style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 } },
					active === "library" || !activeView
						? react.createElement(ModelLibrary, {
								key: "lib",
								models: items,
								onOpen: openFromLibrary,
								onDelete: function (m) { startDelete([m.id]); },
								search: search,
								setSearch: setSearch,
								folders: folders,
								curFolder: curFolder,
								renamingId: renamingId,
								setRenamingId: setRenamingId,
								commitRename: commitRename,
								commitFolderRename: commitFolderRename,
								level: curLevel,
								onBack: goBack,
								parentName: path.length > 1 ? path[path.length - 2].name : "根目录",
								upTarget: path.length > 1 ? path[path.length - 2].id : "",
								allModels: items,
								levelName: path.length ? path[path.length - 1].name : "",
								onEnterFolder: enterFolder,
								onAddFolder: addFolder,
								onMenu: toggleMenu,
								openMenu: openMenu,
								onExport: openExportMenu,
								onExportHold: cancelExportClose,
								onExportRelease: scheduleExportClose,
								onExportHide: hideExportMenu,
								onDragOverCard: dragOverTarget,
								onDragLeaveCard: clearDragOver,
								onDropCard: handleDrop,
								onCardPress: onCardPress,
								canDrop: canDropOn,
								moveAsk: moveAsk,
								onMove: function (item) { setOpenMenu(null); setMoveAsk(item); },
								onCancelMove: function () { setMoveAsk(null); },
								picking: !!moveAsk,
								onPickTarget: pickTarget,
								startDelete: startDelete,
								removeFolder: removeFolder,
								blankMenu: blankMenu,
								onBlankMenu: setBlankMenu,
								onNewFolder: addFolder,
							})
						: react.createElement(WorkbenchView, { key: activeView.key, item: activeView.item, ctx: ctx, onExport: exportWorkbench }),
				),
				blankMenuNode,
				exportMenuNode,
				exportJobNode,
				askDelete
					? react.createElement(
							"div",
							{ className: "dmv-modal", onClick: function () { setAskDelete(null); } },
							react.createElement(
								"div",
								{ className: "dmv-dialog", onClick: function (e) { e.stopPropagation(); } },
								react.createElement(
									"div",
									{ className: "dmv-dialog-title" },
									isFolderId(askDelete[0]) ? "删除这个文件夹？" : askDelete.length > 1 ? "删除 " + askDelete.length + " 个模型？" : "删除这个模型？",
								),
								react.createElement(
									"div",
									{ className: "dmv-dialog-text" },
									isFolderId(askDelete[0])
										? "其中的模型和子文件夹会移到上一级，不会被删除。"
										: askDelete.length > 1
											? askDelete
													.map(function (id) {
														var hit = (items || []).filter(function (m) { return m.id === id; })[0];
														return hit ? hit.title || hit.name || id.slice(0, 8) : id.slice(0, 8);
													})
													.join("、")
											: "删除后无法恢复。",
								),
								react.createElement(
									"div",
									{ className: "dmv-dialog-actions" },
									react.createElement("button", { type: "button", className: "dmv-btn", onClick: function () { setAskDelete(null); } }, "取消"),
									react.createElement(
										"button",
										{
											type: "button",
											className: "dmv-btn dmv-btn-danger",
											onClick: function () {
												var ids = askDelete;
												setAskDelete(null);
												if (isFolderId(ids[0])) {
													removeFolder(ids[0]);
													return;
												}
												doDelete(ids);
											},
										},
										"确认删除",
									),
								),
							),
						)
					: null,
			);
		}

		// ---------------------------------------------------------------------
		// Inline model card (conversation.chat.turnTail) — shown in a message.
		// ---------------------------------------------------------------------
		/**
		 * The recorded turn value is whatever buildLocationData returned; accept the
		 * raw wrapper ({kind,turn,key,value}), the value itself, or a JSON string so
		 * the card survives a shape change in the host.
		 */
		function cardValue(matched) {
			if (!matched) return null;
			var v = matched;
			if (typeof v === "string") v = safeParse(v) || null;
			if (v && typeof v === "object" && v.value && typeof v.value === "object") v = v.value;
			return v && typeof v === "object" ? v : null;
		}

		/** Request from an inline card to open a workbench in the "3D模型" tab. */
		var OPEN_EVENT = "dsh-model-viewer:open-workbench";
		/** Kept until a mounted tab can consume it (the tab may not exist yet). */
		var pendingOpen = null;
		function requestWorkbench(payload) {
			pendingOpen = payload;
			try {
				document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: payload }));
			} catch (e) {}
		}
		/** Locate (and activate) the "3D模型" conversation tab; label is localized. */
		function clickModelTab() {
			try {
				var labels = ["3D模型", "3D Model", "3D"];
				var nodes = document.querySelectorAll("button,[role='tab'],[role='button'],a,div,span");
				var best = null;
				for (var i = 0; i < nodes.length; i++) {
					var el = nodes[i];
					if (el.children.length !== 0) continue; // the tab label is a leaf
					var label = (el.textContent || "").trim();
					if (labels.indexOf(label) < 0) continue;
					if (el.getAttribute && el.getAttribute("data-dmv")) continue; // not our own UI
					// Prefer the real tab control: the leaf itself, its [role=tab]/button
					// ancestor. Never climb into the tablist container — a loose class
					// match on "tab" used to land there and swallow the activation.
					var target = el;
					if (target.tagName !== "BUTTON" && target.tagName !== "A") {
						var scan = el;
						for (var up = 0; up < 3 && scan.parentElement; up++) {
							var p = scan.parentElement;
							if (p.getAttribute && p.getAttribute("data-dmv")) break;
							var role = (p.getAttribute && p.getAttribute("role")) || "";
							if (role === "tab" || role === "button" || p.tagName === "BUTTON" || p.tagName === "A") {
								target = p;
								break;
							}
							scan = p;
						}
					}
					if (!best || target.contains(best)) best = target;
				}
				if (!best) return false;
				// React's own onClick is the path dsh's tab responds to (a DOM click() is
				// ignored); real pointer events remain the fallback for other markups.
				var fired = false;
				try {
					var propsKey = Object.keys(best).filter(function (k) { return k.indexOf("__reactProps$") === 0; })[0];
					var props = propsKey ? best[propsKey] : null;
					if (props && typeof props.onClick === "function") {
						props.onClick({
							type: "click",
							target: best,
							currentTarget: best,
							button: 0,
							detail: 1,
							preventDefault: function () {},
							stopPropagation: function () {},
							persist: function () {},
							nativeEvent: { type: "click" },
							isDefaultPrevented: function () { return false; },
							isPropagationStopped: function () { return false; },
						});
						fired = true;
					}
				} catch (e) {}
				if (!fired) {
					try {
						var opts = { bubbles: true, cancelable: true, view: window };
						best.dispatchEvent(new PointerEvent("pointerdown", opts));
						best.dispatchEvent(new MouseEvent("mousedown", opts));
						best.dispatchEvent(new PointerEvent("pointerup", opts));
						best.dispatchEvent(new MouseEvent("mouseup", opts));
						best.dispatchEvent(new MouseEvent("click", opts));
						fired = true;
					} catch (e) {}
				}
				// Report success only once the tab is really selected.
				try {
					var sel = best.getAttribute && best.getAttribute("aria-selected");
					if (sel === "true") return true;
					if (sel === "false") return false;
					if (/tabActive|selected|active|current/i.test(String(best.className || ""))) return true;
				} catch (e) {}
				return fired;
			} catch (e) {}
			return false;
		}
		/**
		 * Switch to the model tab. The panel element may already exist (hidden) once
		 * the model has been opened, so activation is confirmed by the tab's own
		 * selected state — not by the panel being mounted. dsh re-renders its tab
		 * strip, hence the retries.
		 */
		function modelTabActive() {
			try {
				var nodes = document.querySelectorAll("[role='tab'], button, [role='button']");
				for (var i = 0; i < nodes.length; i++) {
					var el = nodes[i];
					if (el.children.length !== 0) continue;
					if ((el.textContent || "").trim() !== "3D模型") continue;
					if (el.getAttribute && el.getAttribute("data-dmv")) continue;
					var sel = el.getAttribute("aria-selected");
					if (sel === "true") return true;
					if (sel === "false") return false;
					var cls = String(el.className || "");
					if (/select|active|current|on\b/i.test(cls)) return true;
					return false;
				}
			} catch (e) {}
			return false;
		}
		function activateModelTab(attempt) {
			var n = attempt || 0;
			if (typeof document === "undefined") return;
			// The tab's selected state only flips after React's next render, so never
			// trust an immediate read: fire the activation and verify asynchronously.
			if (!modelTabActive()) clickModelTab();
			if (n >= 6) return;
			setTimeout(function () {
				if (typeof document !== "undefined" && !modelTabActive()) activateModelTab(n + 1);
			}, 200);
		}

		function InlineModelCard(props) {
			var matched = cardValue(props && props.matched);
			var raw = matched && matched.model;
			var [fetched, setFetched] = react.useState(null);
			var [loadFailed, setLoadFailed] = react.useState(false);
			var [reloadKey, setReloadKey] = react.useState(0);
			// build_3dmodel reports only the stored entry, so fetch the mesh for the
			// card — first by the id from the tool result, then by the title as a
			// fallback when that id did not make it into the event payload.
			var itemId = matched && matched.itemId;
			var wantTitle = (matched && matched.title) || "";
			react.useEffect(function () {
				if (raw) return;
				var alive = true;
				var done = false;
				var ok = function (item) {
					if (!alive || done) return;
					done = true;
					if (item && item.model) {
						setFetched({ model: item.model, title: item.title || item.name || "" });
					} else {
						setLoadFailed(true);
					}
				};
				var fail = function () {
					if (alive && !done) { done = true; setLoadFailed(true); }
				};
				var byTitle = function () {
					if (!wantTitle) { byLatest(); return; }
					listModels({}).then(function (list) {
						var hit = (list.items || []).filter(function (m) { return (m.title || "") === wantTitle; }).pop();
						if (!hit) { byLatest(list); return; }
						getModel(hit.id).then(function (r) { ok(r && r.item); }).catch(fail);
					}).catch(fail);
				};
				// Last resort: the card only exists because a model tool ran in this
				// turn, so falling back to the newest stored entry is still that model.
				var byLatest = function (known) {
					var pick = function (list) {
						var items = (list.items || []).slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
						if (!items.length) { fail(); return; }
						getModel(items[0].id).then(function (r) { ok(r && r.item); }).catch(fail);
					};
					if (known) { pick(known); return; }
					listModels({}).then(pick).catch(fail);
				};
				if (typeof itemId === "string" && itemId) {
					getModel(itemId).then(function (res) {
						var item = res && res.item;
						if (item && item.model) { ok(item); return; }
						byTitle();
					}).catch(byTitle);
				} else {
					byTitle();
				}
				// Never leave the card hanging on "preparing": report failure after a
				// short grace period if nothing resolved.
				var timer = setTimeout(function () {
					if (!done) fail();
				}, 4000);
				return function () {
					alive = false;
					clearTimeout(timer);
				};
			}, [itemId, raw, wantTitle, reloadKey]);
			var model = typeof raw === "string" ? safeParse(raw) : raw && typeof raw === "object" ? raw : (fetched && fetched.model) || null;
			var title = (matched && matched.title) || (fetched && fetched.title) || "3D 模型";
			var [open, setOpen] = react.useState(true);
			var stop = function (e) { if (e && e.stopPropagation) e.stopPropagation(); };
			// Full screen = open this model as a workbench in the "3D模型" tab.
			var openFull = function (e) {
				stop(e);
				requestWorkbench({
					id: (matched && matched.itemId) || (matched && matched.callId) || null,
					title: title,
					model: model || null,
				});
				activateModelTab();
			};
			var toggle = function (e) {
				stop(e);
				setOpen(!open);
			};
			// Card: title on the left, 收起 on the right; the canvas keeps a
			// full-screen icon in its bottom-right corner. Nothing else is shown.
			return react.createElement(
				"div",
				{ "data-dmv": "", className: "dmv-inline" },
				react.createElement(
					"div",
					{ className: "dmv-inline-bar" },
					react.createElement("span", { className: "dmv-inline-name", title: title }, title),
					react.createElement(
						"button",
						{ type: "button", className: "dmv-inline-toggle", title: open ? "收起卡片" : "展开卡片", onClick: toggle },
						react.createElement("span", { className: "dmv-inline-caret", style: { transform: open ? "rotate(90deg)" : "none" } }, "▶"),
						react.createElement("span", null, open ? "收起" : "展开"),
					),
				),
				!open
					? null
					: model
						? react.createElement(
								"div",
								{ className: "dmv-inline-body" },
								react.createElement(ModelViewerCanvas, { model: model }),
								react.createElement(
									"button",
									{ type: "button", className: "dmv-inline-fs", title: "全屏：在工作台中打开", onClick: openFull },
									"⛶",
								),
							)
						: react.createElement(
								"div",
								{ className: "dmv-inline-body dmv-inline-err" },
								loadFailed ? "无法加载模型数据。" : "正在准备模型…",
								loadFailed
									? react.createElement(
											"button",
											{ type: "button", className: "dmv-inline-retry", onClick: function (e) { stop(e); setLoadFailed(false); setReloadKey(reloadKey + 1); } },
											"重试",
										)
									: null,
							),
			);
		}

		function safeParse(s) {
			try {
				return JSON.parse(s);
			} catch (e) {
				return null;
			}
		}

		// ---------------------------------------------------------------------
		// conversationEvents definition: record add_3dmodel tool calls per turn.
		// ---------------------------------------------------------------------
		var modelDef = {
			kind: "model-card",
			match: function (event) {
				if (event && event.type === "turn/start") return { id: String(event.data.turn), role: "start" };
				if (event && event.type === "tool/call") return { id: String(event.data.turn || event.data.callId || ""), role: "update" };
				if (event && event.type === "tool/result") return { id: String(event.data.turn || event.data.callId || ""), role: "done" };
				return null;
			},
			start: function (context, match) {
				if (match.event.type !== "turn/start") throw new Error("model-card start requires turn/start");
				return { turn: match.event.data.turn, model: null, callId: null, ok: null, error: null, toolCalled: false };
			},
			/**
			 * Args can arrive as a raw string, a parsed object (under `arguments`,
			 * `args` or `input`) or already-stringified under one of those names, so
			 * probe them all. A recorded `add_3dmodel` call always flags `toolCalled`
			 * so the card is published even when the payload cannot be parsed.
			 */
			update: function (context, match) {
				if (match.event.type !== "tool/call") {
					if (match.event.type !== "tool/result") return context.state;
					var cur = context.state || {};
					if (!cur.toolCalled) return context.state;
					var rd = match.event.data || {};
					// A tool/result event carries a whole LLM message (data.message) whose
					// content holds the tool output, so the structured {ok,id} may have to
					// be recovered from the text. Also accept flat / nested shapes.
					var rv = rd.ok !== void 0 ? rd : rd.result && typeof rd.result === "object" ? rd.result : rd.data && typeof rd.data === "object" ? rd.data : {};
					var text = "";
					try {
						var msg = rd.message || {};
						var content = msg.content;
						if (typeof content === "string") text = content;
						else if (Array.isArray(content)) {
							text = content
								.map(function (c) {
									if (typeof c === "string") return c;
									if (c && typeof c.text === "string") return c.text;
									if (c && typeof c.content === "string") return c.content;
									if (c && Array.isArray(c.content)) return c.content.map(function (x) { return (x && (x.text || x.content)) || ""; }).join("");
									return "";
								})
								.join("\n");
						}
					} catch (e) {}
					var fromText = {};
					if (text) {
						var parsedResult = safeParse(text);
						if (parsedResult && typeof parsedResult === "object") fromText = parsedResult;
						else {
							var idm = text.match(/"id"\s*:\s*"([0-9a-fA-F-]{8,})"/);
							if (idm) fromText = { id: idm[1] };
							var tm = text.match(/"title"\s*:\s*"([^"]{1,80})"/);
							if (tm && !fromText.title) fromText.title = tm[1];
						}
					}
					var newId = rv.id || rv.itemId || fromText.id || fromText.itemId || rd.id || rd.itemId || cur.itemId || null;
					var newOk = rv.ok !== void 0 ? rv.ok : fromText.ok !== void 0 ? fromText.ok : cur.ok;
					var newErr = typeof rv.error === "string" ? rv.error : typeof fromText.error === "string" ? fromText.error : cur.error;
					var mismatch = rd.callId && cur.callId && String(rd.callId) !== String(cur.callId);
					if (mismatch && !newId) return context.state;
					return Object.assign({}, cur, {
						ok: newOk === void 0 ? cur.ok : Boolean(newOk),
						error: newErr,
						itemId: newId,
						title: cur.title || (typeof fromText.title === "string" ? fromText.title : null),
					});
				}
				var d = match.event.data || {};
				var name = d.name || d.toolName || d.tool || "";
				// Both model tools should produce a card: add_3dmodel carries the mesh
				// inline, build_3dmodel only reports the stored id (the card fetches it).
				if (String(name) !== "add_3dmodel" && String(name) !== "build_3dmodel") return context.state;
				var args = d.arguments !== void 0 ? d.arguments : d.args !== void 0 ? d.args : d.input;
				var raw = d.argsRaw;
				if (raw === void 0) {
					if (typeof args === "string") raw = args;
					else if (args && typeof args === "object") raw = JSON.stringify(args);
				}
				var title = d.title;
				var height = d.height;
				var model = null;
				var parsed = null;
				if (typeof raw === "string") {
					parsed = safeParse(raw);
					if (parsed && typeof parsed === "object" && parsed.model) model = parsed.model;
				} else if (raw && typeof raw === "object" && raw.model) {
					parsed = raw;
					model = raw.model;
				}
				if (parsed && typeof parsed === "object") {
					if (title === void 0 || title === null) title = parsed.title;
					if (height === void 0 || height === null) height = parsed.height;
				}
				var payload = String(name) === "add_3dmodel" ? model || raw || null : null;
				return Object.assign({}, context.state, {
					toolCalled: true,
					callId: d.callId || (context.state && context.state.callId) || null,
					model: payload === null ? (context.state && context.state.model) || null : typeof payload === "string" ? payload : JSON.stringify(payload),
					title: title || null,
					height: height || null,
					ok: null,
					error: null,
				});
			},
			/** Nothing to show when the call reported a failure. */
			done: function (context) {
				var st = context.state || {};
				if (st.ok === false) return { turn: st.turn, model: null, callId: st.callId, ok: false, error: st.error };
				return context.state;
			},
			buildLocationData: function (context, scope) {
				if (scope !== "turn") return null;
				var st = context.state || {};
				// The tool is what matters: an add_3dmodel call already recorded by
				// update() must publish a marker, even when the args could not be parsed
				// (the card then shows its placeholder instead of disappearing).
				if (!st.toolCalled && !st.model && !st.callId) return null;
				return {
					kind: "turn",
					turn: st.turn,
					key: "model-card",
					value: {
						callId: st.callId || null,
						model: st.model || null,
						title: st.title || null,
						height: st.height || null,
						ok: st.ok === void 0 ? null : st.ok,
						error: st.error || null,
						itemId: st.itemId || null,
					},
				};
			},
		};

		// ---------------------------------------------------------------------
		// Client plugin body.
		// ---------------------------------------------------------------------
		var inject = ["slots", "locale", "connection", "uiConversation"];

		function apply(ctx) {
			// "模型" tab (registered regardless of optional services).
			var register = ctx.slots.register.bind(ctx.slots);
			// The conversation event bus lives on the `uiConversation` service
			// (uiConversation.events.register(def)); older builds exposed a
			// standalone `conversationEvents` service, so keep that as a fallback.
			var events = null;
			try {
				var uiConv = ctx.get("uiConversation", false);
				if (uiConv && uiConv.events) events = uiConv.events;
			} catch (e) {}
			if (!events) {
				try {
					var ce = ctx.get("conversationEvents", false);
					if (ce) events = ce;
				} catch (e) {}
			}
			if (events) {
				try {
					events.register(modelDef);
				} catch (e) {}
			}
			ctx.slots.inject("conversation.view", function () {
				return register({
					name: "conversation.view",
					id: "model",
					order: 21,
					label: function () {
						var loc = ctx.get("locale");
						var active = loc && loc.getSnapshot && loc.getSnapshot().active;
						return active && String(active).startsWith("en") ? "3D Model" : "3D模型";
					},
					inject: function () {
						return { ctx: ctx };
					},
				}, ModelViewTab);
			});

			// Inline card at the message tail when add_3dmodel is used.
			// Only when the conversation event bus is actually available.
			if (events) {
				ctx.slots.inject("conversation.chat.turnTail", function () {
					return register({
						name: "conversation.chat.turnTail",
						select: function (owner) {
							var data = owner && owner.turn && owner.turn.data;
							if (!data) return null;
							var marker = data.get("model-card");
							if (!marker) return null;
							return marker;
						},
					}, InlineModelCard);
				});
			}
		}

		exports.inject = inject;
		exports.apply = apply;
		exports.ModelViewTab = ModelViewTab;
		exports.InlineModelCard = InlineModelCard;
		exports.DEFAULT_MODEL = DEFAULT_MODEL;
		// Exported for the DOM-level test in dev/client-render-test.mjs.
		exports.ensureToolbarExportButton = ensureToolbarExportButton;
		return module.exports;
	},
});
