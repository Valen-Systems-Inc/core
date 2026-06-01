import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";
import {
  SCULPTURE_ENV_BEAT_BOOST,
  SCULPTURE_ENV_HOVER_BOOST,
  SCULPTURE_ENV_INTENSITY_SCALE,
  SCULPTURE_MIN_ROUGHNESS,
  THREE_PBR_DPR_MAX
} from "../render-center-sculpture/render-center-sculpture.js";

export const runtimeThreeUpdateMethods = {
  resize(dpr) {
    if (!this.enabled || !this.renderer) return;
    const pbrDpr = Math.max(1, Math.min(window.devicePixelRatio || dpr || 1, THREE_PBR_DPR_MAX));
    const width = Math.floor(window.innerWidth * pbrDpr);
    const height = Math.floor(window.innerHeight * pbrDpr);
    if (this.renderSize.width === width && this.renderSize.height === height && Math.abs(this.renderSize.dpr - pbrDpr) < 0.001) return;
    this.renderSize = { width, height, dpr: pbrDpr };
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = "100vw";
    this.canvas.style.height = "100vh";
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  },

  update(stagePhase, cameraRig, panelLayer, sculptureLayer, dpr) {
    if (!this.enabled) return;
    this.resize(dpr);
    this.camera.fov = cameraRig.fov;
    this.camera.position.set(cameraRig.position[0], cameraRig.position[1], cameraRig.position[2]);
    this.camera.lookAt(cameraRig.lookAt[0], cameraRig.lookAt[1], cameraRig.lookAt[2]);
    this.camera.updateProjectionMatrix();

    if (this.sculpture && sculptureLayer?.geometry) {
      this.sculpture.visible = true;
      this.sculpture.position.set(sculptureLayer.position[0], sculptureLayer.position[1], sculptureLayer.position[2]);
      this.sculpture.rotation.set(
        sculptureLayer.rotation[0],
        sculptureLayer.rotation[1] + (sculptureLayer.spinYaw || 0),
        sculptureLayer.rotation[2]
      );
      const assetScale = (this.sculpture.userData.assetScale || 1) * this.sculptureDisplayScale;
      this.sculpture.scale.set(
        sculptureLayer.scale[0] * assetScale,
        sculptureLayer.scale[1] * assetScale,
        sculptureLayer.scale[2] * assetScale
      );
      this.setOpacity(this.sculpture, sculptureLayer.opacity ?? 1);
      this.applySculptureMaterialResponse(this.sculpture, stagePhase, sculptureLayer);
    }

    this.cards.forEach((card, id) => {
      const transform = panelLayer.transforms.get(id);
      if (!transform) {
        card.visible = false;
        return;
      }
      const object = card.userData.runtimeObject;
      const visibility = panelLayer.visibility.get(id) || 0;
      const hover = panelLayer.hover.get(id) || 0;
      const active = panelLayer.active.get(id) || 0;
      const pressed = this.state.get("pressedMeshId") === id ? 1 : 0;
      const isDrawable = stagePhase.drawOrder?.includes(id) || id === stagePhase.activeObjectState;
      card.visible = isDrawable && visibility > 0.015;
      if (!card.visible) return;
      const assetScale = (card.userData.assetScale || 1) * this.cardDisplayScale;
      const presentation = panelLayer.getPresentationPose(
        object,
        transform,
        stagePhase,
        panelLayer.presentationTime || performance.now(),
        hover,
        active,
        pressed
      );
      card.position.set(presentation.position[0], presentation.position[1], presentation.position[2]);
      card.rotation.set(presentation.rotation[0], presentation.rotation[1], presentation.rotation[2]);
      card.scale.set(
        presentation.scale[0] * assetScale,
        presentation.scale[1] * assetScale,
        (presentation.scale[2] || 1) * assetScale
      );
      this.setOpacity(card, RuntimeMath.clamp(visibility * (object?.cardNumber === stagePhase.activeCardNumber ? 1 : 0.78), 0, 1));
      this.applyCardMaterialResponse(card, object, stagePhase, panelLayer, visibility, hover, active, pressed);
    });
    this.updateStageAtmosphere(stagePhase, sculptureLayer);
  },

  applySculptureMaterialResponse(root, stagePhase, sculptureLayer) {
    const beat = stagePhase.beatIntensity || 0;
    const hover = stagePhase.materialFocus?.intensity || 0;
    const activeHover = stagePhase.hoverObjectId ? 1 : 0;
    root.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        const baseEnv = material.userData?.baseEnvMapIntensity ?? material.envMapIntensity ?? 1.25;
        if (material.userData?.baseEnvMapIntensity == null) material.userData.baseEnvMapIntensity = baseEnv;
        material.envMapIntensity = baseEnv * SCULPTURE_ENV_INTENSITY_SCALE
          + hover * SCULPTURE_ENV_HOVER_BOOST
          + beat * SCULPTURE_ENV_BEAT_BOOST;
        if (material.emissive) {
          const baseEmissive = material.userData?.baseEmissiveIntensity ?? material.emissiveIntensity ?? 0;
          if (material.userData?.baseEmissiveIntensity == null) material.userData.baseEmissiveIntensity = baseEmissive;
          material.emissiveIntensity = baseEmissive + activeHover * 0.5 + hover * 0.45 + beat * 0.2;
        }
        if ("roughness" in material) {
          const baseRoughness = material.userData?.baseRoughness ?? material.roughness ?? 0.22;
          if (material.userData?.baseRoughness == null) material.userData.baseRoughness = baseRoughness;
          const softenedRoughness = Math.max(baseRoughness, SCULPTURE_MIN_ROUGHNESS);
          material.roughness = RuntimeMath.clamp(softenedRoughness - hover * 0.035 - beat * 0.015, SCULPTURE_MIN_ROUGHNESS, 1);
        }
      });
    });
    if (root.rotation) {
      root.rotation.z += Math.sin(performance.now() * 0.0012) * 0.0015 * (hover + beat);
    }
    if (root.position && sculptureLayer?.position) {
      root.position.x += Math.sin(performance.now() * 0.0008) * 0.01 * hover;
    }
  },

  applyCardMaterialResponse(card, object, stagePhase, panelLayer, visibility, hover, active, pressed) {
    const beat = stagePhase.beatIntensity || 0;
    const latentWake = panelLayer.materialWake.get(object.id) || 0;
    const sceneMatch = object?.cardNumber === stagePhase.activeCardNumber ? 1 : 0;
    card.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        const name = String(material.name || "").toLowerCase();
        const baseEnv = material.userData?.baseEnvMapIntensity ?? material.envMapIntensity ?? 1.25;
        if (material.userData?.baseEnvMapIntensity == null) material.userData.baseEnvMapIntensity = baseEnv;
        const baseOpacity = material.userData?.authoredOpacity ?? material.userData?.baseOpacity ?? material.opacity ?? 1;
        const baseTransmission = material.userData?.authoredTransmission ?? material.transmission ?? 0;
        const isGloss = name === "gloss";
        const materialHover = hover * (sceneMatch ? 1 : 0.45) + latentWake * 0.8;
        if ("transmission" in material) {
          material.transmission = RuntimeMath.clamp(baseTransmission + (isGloss ? 0.06 : 0.03) * materialHover + beat * 0.015, 0, 1);
        }
        material.envMapIntensity = baseEnv + (isGloss ? 0.95 : 0.42) * materialHover + active * 0.36 + beat * 0.1;
        if ("roughness" in material) {
          const baseRoughness = material.userData?.baseRoughness ?? material.roughness ?? 0.14;
          if (material.userData?.baseRoughness == null) material.userData.baseRoughness = baseRoughness;
          material.roughness = RuntimeMath.clamp(baseRoughness - materialHover * (isGloss ? 0.06 : 0.03) - pressed * 0.02, 0.018, 1);
        }
        if ("clearcoat" in material) {
          const baseClearcoat = material.userData?.baseClearcoat ?? material.clearcoat ?? 0;
          if (material.userData?.baseClearcoat == null) material.userData.baseClearcoat = baseClearcoat;
          material.clearcoat = RuntimeMath.clamp(baseClearcoat + materialHover * 0.24 + beat * 0.08, 0, 1);
        }
        if ("clearcoatRoughness" in material) {
          const baseCoatRoughness = material.userData?.baseClearcoatRoughness ?? material.clearcoatRoughness ?? 0.08;
          if (material.userData?.baseClearcoatRoughness == null) material.userData.baseClearcoatRoughness = baseCoatRoughness;
          material.clearcoatRoughness = RuntimeMath.clamp(baseCoatRoughness - materialHover * 0.04, 0.01, 1);
        }
        if (material.emissive) {
          const baseEmissive = material.userData?.baseEmissiveIntensity ?? material.emissiveIntensity ?? 0;
          if (material.userData?.baseEmissiveIntensity == null) material.userData.baseEmissiveIntensity = baseEmissive;
          material.emissiveIntensity = baseEmissive + active * 0.3 + materialHover * 0.34 + beat * 0.12;
        }
        if (isGloss) {
          material.opacity = RuntimeMath.clamp(baseOpacity * visibility + materialHover * 0.06, 0, 1);
          material.transparent = material.opacity < 0.98 || (material.transmission ?? 0) > 0.01;
          material.depthWrite = !material.transparent;
        }
      });
    });
  },

  updateStageAtmosphere(stagePhase, sculptureLayer) {
    if (!this.scene) return;
    const sceneId = stagePhase.activeCardNumber || "card1";
    const hover = stagePhase.materialFocus?.intensity || 0;
    const beat = stagePhase.beatIntensity || 0;
    const focus = stagePhase.focusLock ? 1 : 0;
    const reverse = stagePhase.reverseReacquire ? 1 : 0;
    const palette = sceneId === "card5"
      ? { fog: [0.08, 0.12, 0.16], density: 0.068, exposure: 1.08, ambient: 0.16, white: 18.8, cyan: 38 }
      : sceneId === "card3"
        ? { fog: [0.05, 0.09, 0.13], density: 0.074, exposure: 1.1, ambient: 0.17, white: 19.2, cyan: 39.5 }
        : { fog: [0.04, 0.07, 0.1], density: 0.07, exposure: 1.06, ambient: 0.145, white: 18.2, cyan: 36.8 };
    if (this.scene.fog?.color) {
      this.scene.fog.color.setRGB(
        palette.fog[0] + hover * 0.04,
        palette.fog[1] + hover * 0.05 + beat * 0.02,
        palette.fog[2] + hover * 0.08 + focus * 0.015
      );
      this.scene.fog.density = palette.density + hover * 0.018 + beat * 0.01 - reverse * 0.003;
    }
    this.renderer.toneMappingExposure = RuntimeMath.lerp(
      this.renderer.toneMappingExposure,
      palette.exposure + hover * 0.06 + beat * 0.03,
      0.08
    );
    if (this.ambientLight) {
      this.ambientLight.intensity = RuntimeMath.lerp(this.ambientLight.intensity, palette.ambient + hover * 0.08 + beat * 0.03, 0.1);
    }
    if (this.whiteLight) {
      this.whiteLight.intensity = RuntimeMath.lerp(this.whiteLight.intensity, palette.white + hover * 2.6 + beat * 1.2, 0.1);
      this.whiteLight.penumbra = RuntimeMath.lerp(this.whiteLight.penumbra, 0.42 + hover * 0.1, 0.08);
    }
    if (this.cyanLight) {
      this.cyanLight.intensity = RuntimeMath.lerp(this.cyanLight.intensity, palette.cyan + hover * 5.5 + beat * 2.1, 0.1);
      this.cyanLight.penumbra = RuntimeMath.lerp(this.cyanLight.penumbra, 0.42 + hover * 0.12, 0.08);
    }
    if (this.lightTarget) {
      this.lightTarget.position.x = RuntimeMath.lerp(this.lightTarget.position.x, (stagePhase.handoffDirection || 1) * hover * 0.12, 0.08);
      this.lightTarget.position.y = RuntimeMath.lerp(this.lightTarget.position.y, 0.04 + (sculptureLayer?.position?.[1] || 0) * 0.12 + beat * 0.06, 0.08);
      this.lightTarget.position.z = RuntimeMath.lerp(this.lightTarget.position.z, -1.35 + hover * 0.2, 0.08);
    }
    this.updateStageHaze(stagePhase, sculptureLayer);
  },

  updateStageHaze(stagePhase, sculptureLayer) {
    if (!this.hazeField?.length) return;
    const hover = stagePhase.materialFocus?.intensity || 0;
    const beat = stagePhase.beatIntensity || 0;
    const seconds = (performance.now() - this.clockStart) * 0.001;
    const anchor = sculptureLayer?.position || [0, 0, -0.92];
    this.hazeField.forEach((haze, index) => {
      const basePosition = haze.userData.basePosition || [0, 0, -1];
      const baseScale = haze.userData.baseScale || [3, 2, 1];
      const baseOpacity = haze.userData.baseOpacity ?? 0.08;
      haze.position.x = RuntimeMath.lerp(haze.position.x, anchor[0] + basePosition[0] + Math.sin(seconds * (0.18 + index * 0.04)) * 0.09 * (1 + hover), 0.08);
      haze.position.y = RuntimeMath.lerp(haze.position.y, anchor[1] + basePosition[1] + Math.cos(seconds * (0.14 + index * 0.03)) * 0.05 + beat * 0.04, 0.08);
      haze.position.z = RuntimeMath.lerp(haze.position.z, anchor[2] + basePosition[2] - hover * 0.12, 0.08);
      haze.scale.set(
        baseScale[0] * (1 + hover * 0.12 + beat * 0.06),
        baseScale[1] * (1 + hover * 0.16 + beat * 0.08),
        baseScale[2]
      );
      haze.material.opacity = baseOpacity + hover * 0.12 + beat * 0.07;
    });
  },

  setOpacity(root, opacity) {
    root.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        const baseOpacity = material.userData?.baseOpacity ?? material.opacity ?? 1;
        material.opacity = RuntimeMath.clamp(baseOpacity * opacity, 0, 1);
        material.transparent = material.opacity < 0.98 || (material.transmission ?? 0) > 0.01;
        material.depthWrite = !material.transparent;
      });
    });
  },

  render() {
    if (!this.enabled || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }
};
