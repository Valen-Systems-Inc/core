import { CORE_RUNTIME_MANIFEST } from "./assemble-core-runtime-manifest.js";
import {
  ACTIVE_STAGE_POSES,
  CARD_ORBIT_RING,
  DEFAULT_STAGE_ZONES,
  SLOT_SEQUENCE,
  STAGE_COMPOSITION_PROFILES,
  STAGE_LATENT_SLOTS
} from "./configure-stage-layout-and-camera.js";

CORE_RUNTIME_MANIFEST.scenes = CORE_RUNTIME_MANIFEST.scenes.map((scene) => ({
  ...scene,
  stageComposition: STAGE_COMPOSITION_PROFILES[scene.id] || {
    label: `${scene.id}-stage`,
    latentVisibility: 0.34,
    latentHoverVisibility: 0.54,
    latentCopy: 0.022,
    hoverLatentCopy: 0.16,
    hideLatentCards: true,
    orbitalRing: CARD_ORBIT_RING,
    focusPush: 0.14,
    compactFit: {
      activePoseDelta: {
        position: [0.58, 0.62, 0.02],
        scale: [0.9, 0.9, 1]
      },
      camera: {
        xBias: 0.08,
        yBias: 0.1,
        zBias: -0.06,
        lookAtXBias: 0.06,
        lookAtYBias: 0.24,
        fovBias: -0.25,
        retreatScale: 0.6,
        liftY: 0.01,
        fovScale: 2.2
      }
    }
  }
}));

CORE_RUNTIME_MANIFEST.runtimeObjectStates = CORE_RUNTIME_MANIFEST.runtimeObjectStates.map((object, index) => {
  const slot = SLOT_SEQUENCE[index % SLOT_SEQUENCE.length];
  const composition = STAGE_COMPOSITION_PROFILES[object.cardNumber] || {};
  return {
    ...object,
    priority: object.priority ?? index,
    stage: {
      composition,
      spatialSlot: slot,
      activePose: composition.activePose || ACTIVE_STAGE_POSES[object.cardNumber] || object.activeTarget,
      compactFit: composition.compactFit || null,
      latentPose: {
        ...STAGE_LATENT_SLOTS[slot]
      }
    },
    interactionZones: object.interactionZones ?? DEFAULT_STAGE_ZONES[object.cardNumber] ?? [
      { id: "primaryCta", label: object.label, action: "route", route: object.route, rect: [0.08, 0.16, 0.36, 0.16] }
    ],
    spatialType: {
      enabled: !!object.copy,
      eyebrow: object.copy?.eyebrow || object.label,
      title: object.copy?.title || object.label,
      body: object.copy?.body || "",
      meta: object.copy?.meta || object.route,
      style: "holographic"
    },
    materialProfile: {
      waveStrength: object.role === "pricing" ? 0.34 : object.role === "input" ? 0.86 : 0.72,
      copyBoost: object.role === "pricing" ? 1.36 : object.role === "input" ? 1.24 : 1.12,
      latentDim: object.role === "pricing" ? 0.56 : object.role === "story" ? 0.52 : 0.44,
      chapterSnap: object.role === "pricing" ? 1.34 : object.role === "input" ? 1.18 : 1.08
    }
  };
});
