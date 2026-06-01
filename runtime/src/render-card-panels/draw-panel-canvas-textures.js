import { runtimePanelTextureLifecycleMethods } from "./manage-panel-canvas-textures.js";
import { runtimePanelMediaDrawMethods } from "./draw-panel-media-surfaces.js";
import { runtimePanelCopyDrawMethods } from "./draw-panel-text-and-transcript.js";

export const runtimePanelTextureDrawMethods = {
  ...runtimePanelTextureLifecycleMethods,
  ...runtimePanelMediaDrawMethods,
  ...runtimePanelCopyDrawMethods
};
