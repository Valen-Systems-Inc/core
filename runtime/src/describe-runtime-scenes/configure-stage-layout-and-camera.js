export const TAU = Math.PI * 2;
export const SLOT_SEQUENCE = ["left-depth", "right-depth", "low-depth", "far-center"];

export const STAGE_LATENT_SLOTS = {
  "left-depth": { position: [-1.72, 0.18, -0.64], rotation: [0.02, 0.52, -0.035], scale: [1.08, 0.66, 1] },
  "right-depth": { position: [1.74, 0.2, -0.7], rotation: [0.02, -0.54, 0.035], scale: [1.08, 0.66, 1] },
  "low-depth": { position: [-1.08, -1.04, -0.96], rotation: [0.12, 0.32, -0.05], scale: [0.9, 0.56, 1] },
  "far-center": { position: [0.28, -1.34, -1.26], rotation: [0.12, -0.08, 0.025], scale: [0.84, 0.52, 1] }
};

export const CARD_ORBIT_RING = {
  enabled: true,
  latentCount: 4,
  center: [0, 0.02, -1.62],
  radiusX: 2.18,
  radiusZ: 0.46,
  speed: 0.11,
  scrollPull: 0.45,
  scale: [0.62, 0.62, 1],
  pitch: -0.035,
  outwardYawOffset: 0
};

export const CARD_RIBBON_HANDOFF = {
  enterSide: -1,
  exitSide: 1,
  x: 2.04,
  y: -0.2,
  z: -1.18,
  yaw: 1.06,
  pitch: -0.055,
  roll: 0.07,
  scale: 0.68,
  hold: 0.38
};

export const DEFAULT_STAGE_ZONES = {
  card10: [
    { id: "primaryCta", label: "Add fixture", action: "click", rect: [0.075, 0.04, 0.2, 0.12], visualRect: [0.075, 0.04, 0.2, 0.12] },
    { id: "input", label: "Fixture field", action: "focus", rect: [0.29, 0.04, 0.66, 0.12], visualRect: [0.29, 0.04, 0.66, 0.12] }
  ],
  card13: [{ id: "primaryCta", label: "Keep", action: "workspaceAction", verb: "keep", rect: [0.08, 0.15, 0.36, 0.16], visualRect: [0.075, 0.245, 0.34, 0.16] }],
  card14: [{ id: "primaryCta", label: "Keep", action: "workspaceAction", verb: "keep", rect: [0.08, 0.15, 0.36, 0.16], visualRect: [0.075, 0.245, 0.34, 0.16] }],
  card15: [{ id: "primaryCta", label: "Keep", action: "workspaceAction", verb: "keep", rect: [0.08, 0.15, 0.36, 0.16], visualRect: [0.075, 0.245, 0.34, 0.16] }],
  card16: [{ id: "primaryCta", label: "Keep", action: "workspaceAction", verb: "keep", rect: [0.08, 0.15, 0.36, 0.16], visualRect: [0.075, 0.245, 0.34, 0.16] }]
};

export const ACTIVE_STAGE_POSES = {
  card1: {
    position: [0, -0.08, -0.08],
    rotation: [-0.055, 0.02, -0.018],
    scale: [1.45, 0.9, 1]
  }
};

export const STAGE_COMPOSITION_PROFILES = {
  card10: {
    label: "local-workspace-chat",
    phoneScale: 0.96,
    orbitalRing: CARD_ORBIT_RING,
    latentVisibility: 0.56,
    latentHoverVisibility: 0.78,
    latentCopy: 0.42,
    hoverLatentCopy: 0.72,
    focusPush: 0.02,
    activePose: ACTIVE_STAGE_POSES.card1,
    compactFit: {
      preserveFocusCamera: true,
      activePose: {
        position: [0, -0.08, -0.08],
        rotation: [-0.055, 0.02, -0.018],
        scale: [0.9, 0.9, 1]
      }
    }
  }
};

export const MOBILE_ACTIVE_CARD_SCALE = 0.94;

// Locked stage anchor: keep the center sculpture visually planted while cards move around it.
export const MOBILE_ROOMY_STAGE_CAMERA = {
  position: [0.02, 0.22, 4.62],
  lookAt: [0.02, 0.28, -0.28],
  fov: 42.4
};

export const MOBILE_FIXED_STAGE_CAMERA = {
  position: [0.02, 0.24, 4.95],
  lookAt: [0.02, 0.28, -0.28],
  fov: 46
};
