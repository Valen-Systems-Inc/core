import { CORE_RUNTIME_ASSETS } from "./list-runtime-asset-files.js";
import { CORE_RUNTIME_OBJECT_STATES } from "./define-runtime-object-states.js";
import { CORE_RUNTIME_PHASES, CORE_RUNTIME_PHASE_ALIAS, CORE_RUNTIME_SCENES } from "./map-runtime-phases-and-scenes.js";

export const CORE_RUNTIME_MANIFEST = {
  version: "core-public-workspace-v0.1",
  cacheKey: "core-public-local-workspace",
  performance: { targetFPS: 55, minDpr: 1, maxDpr: 1.75 },
  visualProfile: {
    mode: "public-workspace",
    stageBlack: [0.02, 0.02, 0.03],
    accent: [0.45, 0.96, 0.82],
    activeGlass: 0.94,
    latentDim: 0.58,
    copyBoost: 1.22,
    matterDensity: 1.28,
    mediaWash: 1.16,
    spatialTypeIntensity: 0.78,
    stageDepth: 1.26
  },
  assets: CORE_RUNTIME_ASSETS,
  runtimeObjectStates: CORE_RUNTIME_OBJECT_STATES,
  "3druntimePhases": CORE_RUNTIME_PHASES,
  phaseAlias: CORE_RUNTIME_PHASE_ALIAS,
  scenes: CORE_RUNTIME_SCENES
};

export function getPhaseAlias(manifest, phaseId, cardNumber) {
  return manifest.phaseAlias?.[phaseId]?.[cardNumber]
    || manifest.phaseAlias?.WorkspaceMode?.[cardNumber]
    || {};
}

export function getSceneDisplayLabel(manifest, phaseId, scene) {
  const alias = getPhaseAlias(manifest, phaseId, scene?.id);
  return alias.sceneLabel || scene?.label || scene?.id || "";
}

CORE_RUNTIME_MANIFEST.scenes = CORE_RUNTIME_MANIFEST.scenes.map((scene) => ({
  ...scene,
  camera: { position: [0, 0, 4.8], lookAt: [0, 0, 0], fov: 42, orbit: 0.2 },
  layers: [],
  assetIds: ["copy-anchors"],
  transition: { type: "crossfade", duration: 0.8, ease: "sine" },
  stageGrammar: "local-workspace"
}));
