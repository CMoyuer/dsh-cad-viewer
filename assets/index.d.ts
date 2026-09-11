/**
 * three-cad-viewer - A CAD viewer built on Three.js
 *
 * This is the main entry point for the library.
 * It exports the core classes and all public TypeScript types.
 */
import "../css/global.css";
import "../css/ui.css";
import "../css/treeview.css";
import "../css/tools.css";
import { Viewer } from "./core/viewer.js";
import { Display } from "./ui/display.js";
import { EnvironmentManager } from "./rendering/environment.js";
import { Timer } from "./utils/timer.js";
import { logger } from "./utils/logger.js";
import { gpuTracker } from "./utils/gpu-tracker.js";
import { version } from "./_version.js";
export { Viewer, Display, EnvironmentManager, Timer, logger, gpuTracker, version, };
export { MATERIAL_PRESETS, MATERIAL_PRESET_NAMES, } from "./rendering/material-presets.js";
export type { LogLevel } from "./utils/logger.js";
export type { ResourceType, TrackedResource, ResourceSummary, } from "./utils/gpu-tracker.js";
export type { Vector3Tuple, QuaternionTuple } from "three";
export type { ThemeInput, Theme, ControlType, UpDirection, AnimationMode, ActiveTab, ZebraColorScheme, ZebraMappingMode, ShapeType, ShapeSubtype, Axis, ClipIndex, ColorValue, RGBColor, RGBAColor, AxisColors, AxisColorsFlatArray, } from "./core/types.js";
export { CLIP_INDICES, isClipIndex, CollapseState } from "./core/types.js";
export type { StateChange, StateSubscriber, GlobalStateSubscriber, } from "./core/types.js";
export type { BoundingBox, BoundingSphere, BoundingBoxFlat, } from "./core/types.js";
export type { PickInfo } from "./core/types.js";
export type { ChangeInfos, ChangeNotification, NotificationCallback, } from "./core/types.js";
export type { DisplayOptions, RenderOptions, ViewerOptions, ZebraOptions, CombinedOptions, } from "./core/types.js";
export type { ViewerStateShape, StateKey } from "./core/types.js";
export type { Texture, Shape, ShapeBinary, ShapeNested, Location, VisibilityValue, VisibilityState, Shapes, } from "./core/types.js";
export { isShapeBinaryFormat, hasTrianglesPerFace, hasSegmentsPerEdge, } from "./core/types.js";
export type { DomEventCallback } from "./core/types.js";
export type { ColoredMaterial } from "./core/types.js";
export type { MaterialAppearance, MaterialXMaterial, StudioOptions, StudioBackground, StudioModeOptions, StudioEnvironment, StudioToneMapping, StudioTextureMapping, } from "./core/types.js";
export { isMaterialXMaterial } from "./core/types.js";
export { isInstancedFormat, decodeBuffers, resolveInstances, decodeInstancedFormat, } from "./utils/decode-instances.js";
export type { SubscribeOptions } from "./core/types.js";
