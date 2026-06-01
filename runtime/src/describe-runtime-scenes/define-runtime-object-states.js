const workspaceCard = (id, position, rotation, scale, tone) => ({
  id,
  type: "panel",
  cardNumber: id,
  label: `Workspace ${id}`,
  route: "#card1",
  copyAnchor: `${id}-copy`,
  role: "workspace",
  phaseIds: ["WorkspaceMode"],
  copy: {
    eyebrow: "LOCAL WORKSPACE",
    title: "Work objects loading.",
    body: "The local adapter is bringing the first objects into this space.",
    meta: "LOCAL FIXTURE"
  },
  position,
  rotation,
  scale,
  activeTarget: { position: [0, 0.02, -0.08], rotation: [-0.035, 0.02, -0.012], scale: [1.06, 0.7, 1] },
  cardAssetId: "card-base-asset",
  tone,
  depth: 0.72,
  hitPadding: 0.08,
  cameraTarget: { position: [-0.15, 0.15, 4.35], lookAt: [-0.22, 0.08, -0.2], fov: 40 }
});

export const CORE_RUNTIME_OBJECT_STATES = [
  {
    id: "card10",
    type: "panel",
    cardNumber: "card10",
    label: "Local chat",
    route: "#card1",
    copyAnchor: "card10-copy",
    role: "input",
    phaseIds: ["WorkspaceMode"],
    copy: {
      eyebrow: "LOCAL CORE",
      title: "A spatial interface for your AI agents.",
      body: "Use local fixtures to improve the runtime without a hosted account.",
      meta: "LOCAL PLAYGROUND",
      mode: "input",
      field: "Describe a local work object.",
      surface: "floating"
    },
    position: [-1.3, 0.72, -0.15],
    rotation: [-0.08, 0.34, -0.03],
    scale: [1.05, 0.68, 1],
    activeTarget: { position: [0, -0.08, -0.08], rotation: [-0.055, 0.02, -0.018], scale: [1.45, 0.9, 1] },
    cardAssetId: "card-chat-second-stage-asset",
    runtimePanelLayerAssetId: "card-chat-second-stage-asset",
    assetProvidesControls: true,
    tone: [0.57, 0.95, 0.82],
    depth: 0.92,
    hitPadding: 0.08,
    cameraTarget: { position: [-0.15, 0.15, 4.35], lookAt: [-0.22, 0.08, -0.2], fov: 40 }
  },
  workspaceCard("card13", [-1.3, 0.72, -0.15], [-0.08, 0.34, -0.03], [1.05, 0.68, 1], [0.57, 0.95, 0.82]),
  workspaceCard("card14", [1.18, 0.52, -0.26], [0.06, -0.3, 0.03], [1.02, 0.66, 1], [0.78, 0.9, 0.96]),
  workspaceCard("card15", [-0.86, -0.58, -0.88], [0.12, 0.22, -0.06], [0.88, 0.58, 1], [0.84, 0.37, 0.27]),
  workspaceCard("card16", [1.12, -0.82, -0.24], [-0.1, -0.28, 0.06], [0.92, 0.62, 1], [0.91, 0.72, 0.36])
];
