import { runtimePanelGeometryMethods } from "./build-panel-geometry-and-copy-metrics.js";
import { runtimePanelPresentationMethods } from "./choose-panel-poses-and-assets.js";
import { runtimePanelSpatialRenderMethods } from "./render-spatial-panel-text.js";
import { runtimePanelInputMethods } from "./manage-panel-input-and-chat-state.js";
import { runtimePanelActionMethods } from "./handle-panel-hit-zone-actions.js";
import { runtimePanelTransformMethods } from "./place-panels-in-foreground-and-orbit.js";
import { runtimePanelTextureDrawMethods } from "./draw-panel-canvas-textures.js";
import { runtimePanelLifecycleMethods } from "./start-and-dispose-card-panel-layer.js";
import { runtimePanelUpdateMethods } from "./update-card-panel-motion-and-hit-targets.js";
import { runtimePanelRenderMethods } from "./render-card-panel-frame.js";
import { createRuntimeMotionHandleRegistry } from "../animate-runtime-motion/cancel-runtime-motion-handles.js";

export class RuntimePanelLayer {
  constructor(manifest, state, cardGeometryAssets = null, capabilities = {}) {
    this.manifest = manifest;
    this.state = state;
    this.capabilities = capabilities;
    this.defaultCardAssetId = "card-base-asset";
    this.cardGeometryAssets = this.normalizeCardGeometryAssets(cardGeometryAssets);
    this.cardMaterialProfiles = new Map(manifest.assets
      .filter((asset) => asset.materialProfile)
      .map((asset) => [asset.id, asset.materialProfile]));
    this.objects = manifest.runtimeObjectStates.filter((object) => object.type === "panel");
    this.hitTargets = [];
    this.hover = new Map(this.objects.map((object) => [object.id, 0]));
    this.materialWake = new Map(this.objects.map((object) => [object.id, 0]));
    this.active = new Map(this.objects.map((object) => [object.id, 0]));
    this.visibility = new Map(this.objects.map((object) => [object.id, 0.2]));
    this.copyVisibility = new Map(this.objects.map((object) => [object.id, 0.12]));
    this.zonePulse = new Map(this.objects.map((object) => [object.id, 0]));
    this.transforms = new Map(this.objects.map((object) => [
      object.id,
      {
        position: [...object.position],
        rotation: [...object.rotation],
        scale: [...object.scale]
      }
    ]));
    this.modelMatrix = new Float32Array(16);
    this.modelViewProjection = new Float32Array(16);
    this.parentModelMatrix = new Float32Array(16);
    this.zoneModelMatrix = new Float32Array(16);
    this.geometries = new Map();
    this.visualPanelGeometries = new Map();
    this.visualPanelGeometryVersion = 0;
    this.geometry = null;
    this.typePlaneGeometry = null;
    this.boundGeometry = null;
    this.copyTextures = new Map();
    this.copyTextureSignatures = new Map();
    this.typeTextures = new Map();
    this.typeTextureSignatures = new Map();
    this.blankTexture = null;
    this.stagePhase = null;
    this.nativeInputOverlay = null;
    this.nativeInputOverlaySyncing = false;
    this.onNativeInputOverlayFocus = this.onNativeInputOverlayFocus.bind(this);
    this.onNativeInputOverlayInput = this.onNativeInputOverlayInput.bind(this);
    this.onNativeInputOverlayKeyDown = this.onNativeInputOverlayKeyDown.bind(this);
    this.onNativeInputOverlayBlur = this.onNativeInputOverlayBlur.bind(this);
    this.runtimeInputStatesByObjectId = new Map();
    this.cardInteractionState = {
      activeZoneId: "none",
      pressedZoneId: "none",
      inputValue: "",
      inputCaret: 0,
      lastAction: "none",
      version: 0
    };
    this.usePbrAssetBodies = false;
    this.gestureLean = 0;
    this.motionHandles = createRuntimeMotionHandleRegistry();
    this.onKeyDown = this.onKeyDown.bind(this);
  }
}

// Locked stage anchor: do not scene-tune or animate this XYZ. The center sculpture must stay fixed below the cards.
Object.assign(
  RuntimePanelLayer.prototype,
  runtimePanelGeometryMethods,
  runtimePanelPresentationMethods,
  runtimePanelSpatialRenderMethods,
  runtimePanelInputMethods,
  runtimePanelActionMethods,
  runtimePanelTransformMethods,
  runtimePanelTextureDrawMethods,
  runtimePanelLifecycleMethods,
  runtimePanelUpdateMethods,
  runtimePanelRenderMethods
);
