import { resolveRuntimeAssetPath } from "../load-runtime-assets/resolve-runtime-asset-paths-and-preload.js";

export const runtimeThreeTemplateMethods = {
  async loadAssets() {
    const loader = new this.GLTFLoader();
    const assets = this.manifest.assets.filter((asset) => asset.sourcePath && asset.sourcePath.endsWith(".glb"));
    await Promise.all(assets.map(async (asset) => {
      this.materialProfiles.set(asset.id, asset.materialProfile || null);
      const sourcePath = resolveRuntimeAssetPath(asset.sourcePath);
      const gltf = await loader.loadAsync(sourcePath);
      const template = this.normalizeTemplate(gltf.scene, this.registry.get(asset.id));
      this.applyAuthoredMaterials(template, this.registry.get(asset.id));
      this.assetTemplates.set(asset.id, template);
    }));

    const sculptureTemplate = this.assetTemplates.get("center-sculpture-asset");
    if (sculptureTemplate) {
      this.sculpture = sculptureTemplate.clone(true);
      this.cloneMaterials(this.sculpture);
      this.scene.add(this.sculpture);
    }

    this.manifest.runtimeObjectStates
      .filter((object) => object.type === "panel")
      .forEach((object) => {
        const template = this.assetTemplates.get(object.cardAssetId || "card-base-asset");
        if (!template) return;
        const card = template.clone(true);
        this.cloneMaterials(card);
        card.userData.runtimeObject = object;
        this.cards.set(object.id, card);
        this.scene.add(card);
      });
    this.state.set("assetsLabel", `pbr:${this.cards.size}+sculpture`);
  },

  normalizeTemplate(root, runtimeAsset) {
    const THREE = this.THREE;
    const wrapper = new THREE.Group();
    wrapper.name = root.name || runtimeAsset?.id || "valen-asset";
    const coordinateFrame = runtimeAsset?.coordinateFrame || runtimeAsset?.bounds?.coordinateFrame;
    const isCardPlane = coordinateFrame === "card-plane";
    if (isCardPlane) {
      root.rotation.y -= Math.PI / 2;
      root.updateMatrixWorld(true);
    }
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    if (isCardPlane && runtimeAsset?.id) {
      this.cardVisualMetrics.set(runtimeAsset.id, this.createVisualPanelMetrics(root, runtimeAsset, box, center));
    }
    const target = runtimeAsset?.bounds;
    const targetWidth = isCardPlane ? 2 : target ? Math.max(0.001, target.max[0] - target.min[0]) : 2;
    const targetHeight = isCardPlane ? 1.1 : target ? Math.max(0.001, target.max[1] - target.min[1]) : targetWidth;
    const targetCenter = target
      ? new THREE.Vector3(
        (target.min[0] + target.max[0]) * 0.5,
        (target.min[1] + target.max[1]) * 0.5,
        (target.min[2] + target.max[2]) * 0.5
      )
      : new THREE.Vector3();
    const scale = Math.min(
      targetWidth / Math.max(size.x, 0.001),
      targetHeight / Math.max(size.y, 0.001)
    );
    root.position.sub(center);
    wrapper.add(root);
    wrapper.userData.assetScale = isCardPlane ? 1 : Number.isFinite(scale) && scale > 0 ? scale : 1;
    wrapper.userData.assetCenter = isCardPlane ? [0, 0, 0] : targetCenter.toArray();
    wrapper.scale.setScalar(wrapper.userData.assetScale);
    wrapper.position.copy(isCardPlane ? new THREE.Vector3() : targetCenter);
    return wrapper;
  },

  createVisualPanelMetrics(root, runtimeAsset, box, center) {
    const THREE = this.THREE;
    const partEntries = [];
    root.traverse((node) => {
      if (!node.isMesh) return;
      const partBox = new THREE.Box3().setFromObject(node);
      if (partBox.isEmpty()) return;
      partEntries.push({
        nodeName: node.name || "",
        meshName: node.geometry?.name || node.name || "",
        box: partBox
      });
    });
    const bodyEntry = partEntries.find((entry) => {
      const nodeName = String(entry.nodeName || "").toLowerCase();
      const meshName = String(entry.meshName || "").toLowerCase();
      return nodeName.includes("cardchatbody") || meshName.includes("cardchatbody");
    });
    const metricBox = runtimeAsset?.id === "card-chat-second-stage-asset" && bodyEntry ? bodyEntry.box : box;
    const size = new THREE.Vector3();
    metricBox.getSize(size);
    const normalizer = runtimeAsset?.id === "card-chat-second-stage-asset" ? 1 : 2 / Math.max(size.x, size.y, size.z, 0.001);
    const toRuntimePanelBounds = (sourceBox) => {
      const minX = (sourceBox.min.x - center.x) * normalizer;
      const maxX = (sourceBox.max.x - center.x) * normalizer;
      return {
        minX: -maxX,
        minY: (sourceBox.min.y - center.y) * normalizer,
        minZ: (sourceBox.min.z - center.z) * normalizer,
        maxX: -minX,
        maxY: (sourceBox.max.y - center.y) * normalizer,
        maxZ: (sourceBox.max.z - center.z) * normalizer
      };
    };
    const parts = partEntries.map((entry) => ({
      nodeName: entry.nodeName,
      meshName: entry.meshName,
      bounds: toRuntimePanelBounds(entry.box)
    }));
    return {
      bounds: toRuntimePanelBounds(metricBox),
      parts,
      source: runtimeAsset.id,
      materialSlots: runtimeAsset.materialSlots || []
    };
  },

  getCardVisualMetrics() {
    return new Map(this.cardVisualMetrics);
  },

  cloneMaterials(root) {
    root.traverse((node) => {
      if (!node.isMesh) return;
      if (Array.isArray(node.material)) {
        node.material = node.material.map((material) => material.clone());
      } else if (node.material) {
        node.material = node.material.clone();
      }
    });
  },

  applyAuthoredMaterials(root, runtimeAsset) {
    const slots = runtimeAsset?.materialSlots || [];
    const isCardAsset = String(runtimeAsset?.id || "").startsWith("card-");
    const THREE = this.THREE;
    root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      node.frustumCulled = false;
      node.renderOrder = isCardAsset ? 2 : 1;
      const materials = Array.isArray(node.material) ? node.material : [node.material].filter(Boolean);
      materials.forEach((material) => {
        const slot = slots.find((entry) => entry.name === material.name) || slots[0] || {};
        if (!material.userData) material.userData = {};
        if (slot.baseColor && material.color) {
          material.color.setRGB(
            slot.baseColor[0] ?? material.color.r,
            slot.baseColor[1] ?? material.color.g,
            slot.baseColor[2] ?? material.color.b
          );
        }
        const slotOpacity = Number.isFinite(slot.baseColor?.[3]) ? slot.baseColor[3] : null;
        const authoredOpacity = slotOpacity ?? material.opacity ?? 1;
        material.opacity = authoredOpacity;
        material.userData.authoredOpacity = authoredOpacity;
        material.userData.baseOpacity = material.opacity;
        material.roughness = slot.roughness ?? material.roughness ?? 0.1;
        material.metalness = slot.metallic ?? material.metalness ?? 0;
        if ("ior" in material) material.ior = slot.ior ?? material.ior;
        if ("transmission" in material) material.transmission = slot.transmission ?? material.transmission ?? 0;
        if (isCardAsset && "transmission" in material) {
          material.userData.authoredTransmission = slot.transmission ?? material.transmission ?? 0;
        }
        if (isCardAsset && "thickness" in material) material.thickness = Math.max(material.thickness ?? 0, 0.12);
        if (isCardAsset && "attenuationDistance" in material) material.attenuationDistance = 0.72;
        if (isCardAsset && material.attenuationColor) material.attenuationColor.setRGB(0.66, 0.96, 1);
        if (isCardAsset && "specularIntensity" in material) material.specularIntensity = Math.max(material.specularIntensity ?? 0, 1);
        if (isCardAsset && material.specularColor) material.specularColor.setRGB(0.84, 0.92, 0.94);
        if (isCardAsset && "reflectivity" in material) material.reflectivity = Math.max(material.reflectivity ?? 0, 0.86);
        if ("clearcoat" in material) material.clearcoat = slot.coatWeight ?? material.clearcoat ?? 0;
        if ("clearcoatRoughness" in material) material.clearcoatRoughness = slot.coatRoughness ?? material.clearcoatRoughness ?? 0.1;
        if (slot.doubleSided) material.side = THREE.DoubleSide;
        if (slot.alphaMode === "BLEND") material.transparent = true;
        if (slot.emissionColor && material.emissive) {
          material.emissive.setRGB(slot.emissionColor[0] || 0, slot.emissionColor[1] || 0, slot.emissionColor[2] || 0);
          material.emissiveIntensity = slot.emissionStrength ?? material.emissiveIntensity ?? 1;
        }
        material.envMapIntensity = String(material.name || "").toLowerCase() === "gloss" ? 3.1 : isCardAsset ? 3.4 : 1.25;
        if (String(material.name || "").toLowerCase() === "gloss") {
          if (slot.baseColor && material.color) {
            material.color.setRGB(slot.baseColor[0] ?? 0.003, slot.baseColor[1] ?? 0.003, slot.baseColor[2] ?? 0.003);
          }
          material.opacity = slotOpacity ?? material.opacity ?? 0.64;
          material.userData.baseOpacity = material.opacity;
          material.roughness = slot.roughness ?? 0.1;
          material.metalness = 0;
          if ("ior" in material) material.ior = slot.ior ?? 2;
          if ("reflectivity" in material) material.reflectivity = 1;
          if ("clearcoat" in material) material.clearcoat = slot.coatWeight ?? 0.25;
          if ("clearcoatRoughness" in material) material.clearcoatRoughness = slot.coatRoughness ?? 0.025;
        }
        if (isCardAsset) {
          material.userData.blenderMaterialBridge = {
            alphaMode: slot.alphaMode || "OPAQUE",
            blendMethod: slot.alphaMode === "BLEND" ? "GLB alpha blend; Blender HASHED viewport mode audited but not used because browser alphaHash reads as coarse static at card scale" : "opaque",
            screenSpaceRefraction: "not serialized in glTF; approximated by Three transmission plus authored PMREM environment",
            attenuation: material.attenuationColor ? "subtle cyan attenuation approximates HDRI-through-glass without recoloring the authored base color" : "unsupported",
            reflectionProbe: this.environmentSource,
            colorManagement: this.renderer?.toneMapping === THREE.AgXToneMapping ? "Three AgX tone mapping" : "Three ACES fallback"
          };
        }
        material.transparent = (material.opacity ?? 1) < 0.98 || (material.transmission ?? 0) > 0.01;
        material.depthWrite = !material.transparent;
        material.needsUpdate = true;
      });
    });
  }
};
