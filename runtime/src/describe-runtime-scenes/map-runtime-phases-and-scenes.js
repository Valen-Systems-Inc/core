export const CORE_RUNTIME_PHASES = {
  WorkspaceMode: {
    id: "WorkspaceMode",
    label: "Workspace",
    defaultCardNumber: "card10",
    defaultObjectState: "card10",
    cardNumbers: ["card10", "card13", "card14", "card15", "card16"],
    objectStates: ["card10", "card13", "card14", "card15", "card16"],
    latentObjectStates: ["card13", "card14", "card15", "card16"],
    spawnableObjectStates: [],
    orbitalRing: {
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
    }
  }
};

export const CORE_RUNTIME_PHASE_ALIAS = {
  WorkspaceMode: {
    card10: { alias: "localChat", sceneLabel: "localChat", navLabel: "Workspace", dockLabel: "Local Chat" },
    card13: { alias: "workObjectOne", sceneLabel: "workObjectOne", navLabel: "Object 1", dockLabel: "Work Object" },
    card14: { alias: "workObjectTwo", sceneLabel: "workObjectTwo", navLabel: "Object 2", dockLabel: "Work Object" },
    card15: { alias: "workObjectThree", sceneLabel: "workObjectThree", navLabel: "Object 3", dockLabel: "Work Object" },
    card16: { alias: "workObjectFour", sceneLabel: "workObjectFour", navLabel: "Object 4", dockLabel: "Work Object" }
  }
};

export const CORE_RUNTIME_SCENES = [
  {
    id: "card1",
    label: "Local Workspace",
    anchor: "#card1",
    copyAnchor: "card1-copy",
    tone: [0.57, 0.95, 0.82],
    orbit: 0.4,
    performance: { dprMax: 1.75 }
  }
];
