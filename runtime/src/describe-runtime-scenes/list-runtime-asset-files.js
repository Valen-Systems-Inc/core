export const CORE_RUNTIME_ASSETS = [
    {
      id: "card-base-asset",
      kind: "exported-blender-glb",
      role: "shared Card-base UI card mesh loaded from operator-authored GLB",
      status: "queued",
      sourcePath: "./assets/valen-card-base.glb",
      coordinateFrame: "card-plane",
      materialProfile: {
        sourceMaterial: "Material.001",
        baseColor: [0.21993541717529297, 0.21993541717529297, 0.21993541717529297, 0.2796478867530823],
        roughness: 0.10000000149011612,
        metallic: 0,
        ior: 1.4500000476837158,
        transmission: 1,
        coatWeight: 0.25,
        coatRoughness: 0.1506030112504959
      }
    },
    {
      id: "card-single-button-asset",
      kind: "exported-blender-glb",
      role: "operator-authored Card-Single-Button profile for one-action runtime cards",
      status: "queued",
      sourcePath: "./assets/valen-card-single-button.glb",
      coordinateFrame: "card-plane",
      materialProfile: {
        sourceMaterial: "Material.001",
        baseColor: [0.21993541717529297, 0.21993541717529297, 0.21993541717529297, 0.2796478867530823],
        roughness: 0.10000000149011612,
        metallic: 0,
        ior: 1.4500000476837158,
        transmission: 1,
        coatWeight: 0.25,
        coatRoughness: 0.1506030112504959
      }
    },
    {
      id: "card-multi-button-asset",
      kind: "exported-blender-glb",
      role: "operator-authored Card-Multi-Button profile for multi-path runtime cards",
      status: "queued",
      sourcePath: "./assets/valen-card-multi-button.glb",
      coordinateFrame: "card-plane",
      materialProfile: {
        sourceMaterial: "Material.001",
        baseColor: [0.21993541717529297, 0.21993541717529297, 0.21993541717529297, 0.2796478867530823],
        roughness: 0.10000000149011612,
        metallic: 0,
        ior: 1.4500000476837158,
        transmission: 1,
        coatWeight: 0.25,
        coatRoughness: 0.1506030112504959
      }
    },
    {
      id: "card-chat-asset",
      kind: "exported-blender-glb",
      role: "operator-authored Card-Chat profile for the card1 runtime card",
      status: "queued",
      sourcePath: "./assets/valen-card-chat.glb",
      coordinateFrame: "card-plane",
      materialProfile: {
        sourceMaterial: "Material.001",
        baseColor: [0.21993541717529297, 0.21993541717529297, 0.21993541717529297, 0.2796478867530823],
        roughness: 0.10000000149011612,
        metallic: 0,
        ior: 1.4500000476837158,
        transmission: 1,
        coatWeight: 0.25,
        coatRoughness: 0.1506030112504959
      }
    },
    {
      id: "card-chat-second-stage-asset",
      kind: "exported-blender-glb",
      role: "operator-authored Card-Chat second-stage profile for card10",
      status: "queued",
      sourcePath: "./assets/valen-card-chat-second-stage.glb",
      coordinateFrame: "card-plane",
      materialProfile: {
        sourceMaterial: "Material.001",
        baseColor: [0.21993541717529297, 0.21993541717529297, 0.21993541717529297, 0.2796478867530823],
        roughness: 0.10000000149011612,
        metallic: 0,
        ior: 1.4500000476837158,
        transmission: 1,
        coatWeight: 0.25,
        coatRoughness: 0.1506030112504959
      }
    },
    {
      id: "center-sculpture-asset",
      kind: "exported-blender-geometry",
      role: "original Valen center sculpture mesh",
      status: "queued",
      sourcePath: "./assets/valen-center-sculpture.glb",
      preservePivot: true
    },
    {
      id: "first-signal-background-landscape",
      kind: "exported-blender-glb",
      role: "First Signal runtime boot landscape background object",
      status: "queued",
      sourcePath: "./assets/valen-loading-background-landscape.glb",
      coordinateFrame: "native"
    },
    {
      id: "first-signal-background-portrait",
      kind: "exported-blender-glb",
      role: "First Signal runtime boot portrait background object",
      status: "queued",
      sourcePath: "./assets/valen-loading-background-portrait.glb",
      coordinateFrame: "native"
    },
    { id: "copy-anchors", kind: "copy-anchor", role: "DOM section binding map", status: "queued" }
  ];
