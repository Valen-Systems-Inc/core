import { PUBLIC_INPUT_CARD } from "../configure-runtime/configure-runtime-hosts-and-gates.js";
import { CORE_RUNTIME_MANIFEST } from "../describe-runtime-scenes/assemble-core-runtime-manifest.js";
import {
  CARD_COPY_SURFACE_PROFILES,
  CARD_GLASS_RGB,
  CARD_GLASS_TONE
} from "../describe-runtime-scenes/describe-card-copy-surfaces.js";
import {
  CARD_RIBBON_HANDOFF,
  MOBILE_ACTIVE_CARD_SCALE,
  SLOT_SEQUENCE,
  STAGE_LATENT_SLOTS,
  TAU
} from "../describe-runtime-scenes/configure-stage-layout-and-camera.js";
import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";

export const runtimePanelSpatialRenderMethods = {
  renderSpatialTypePlane(object, baseTransform, active, hover, pulse, time, index, geometry = this.geometry, baseCopyVisibility = 0, cardGeometry = null) {
    const gl = this.gl;
    this.bindGeometry(geometry);
    const runtimePanelLayerGeometry = this.getRuntimePanelLayerGeometry(object, cardGeometry);
    const config = this.getHolographicCopyLayout(object, runtimePanelLayerGeometry);
    const beat = this.stagePhase?.beatIntensity || 0;
    const focusLock = object.id === this.stagePhase?.activeObjectState && this.stagePhase?.focusLock ? 1 : 0;
    const copyRead = this.getHolographicCopyVisibility(object, baseTransform, active, hover, baseCopyVisibility, config.frontNormal);
    const visible = RuntimeMath.clamp((config.visibility ?? 0.7) * copyRead, 0, 1);
    if (visible < 0.015) return;

    const pointerLean = [
      (this.interaction.pointer.y - 0.5) * 0.01 * Math.max(active, hover),
      (this.interaction.pointer.x - 0.5) * 0.012 * Math.max(active, hover),
      0
    ];
    const position = config.position || [-0.08, 0.18, 0.165];
    const rotation = config.rotation || [-0.012, 0.012, -0.004];
    const scale = config.scale || [1.28, 0.4, 1];

    RuntimeMath.compose(this.parentModelMatrix, baseTransform.position, baseTransform.rotation, baseTransform.scale);
    RuntimeMath.compose(
      this.zoneModelMatrix,
      [position[0], position[1] + beat * 0.035, position[2] - beat * 0.04],
      [rotation[0] + pointerLean[0], rotation[1] + pointerLean[1], rotation[2] + pointerLean[2]],
      [scale[0] * (1 + beat * 0.018), scale[1] * (1 + beat * 0.012), scale[2]]
    );
    RuntimeMath.multiply(this.modelMatrix, this.parentModelMatrix, this.zoneModelMatrix);
    const material = object.materialProfile || {};
    gl.uniformMatrix4fv(this.locations.model, false, this.modelMatrix);
    gl.uniform3f(this.locations.tone, CARD_GLASS_TONE[0], CARD_GLASS_TONE[1], CARD_GLASS_TONE[2]);
    gl.uniform1f(this.locations.hover, hover * 0.35);
    gl.uniform1f(this.locations.active, Math.max(active, pulse * 0.22));
    gl.uniform1f(this.locations.objectVisibility, visible);
    gl.uniform1f(this.locations.activeScene, 1);
    gl.uniform1f(this.locations.panelId, (object.priority ?? index) + 31);
    gl.uniform1f(this.locations.stageBeat, beat * (material.chapterSnap || 1));
    gl.uniform1f(this.locations.focusLock, focusLock);
    gl.uniform1f(this.locations.copyBoost, (material.copyBoost || CORE_RUNTIME_MANIFEST.visualProfile.copyBoost) * 0.88);
    gl.uniform1f(this.locations.latentDim, 1);
    gl.uniform1f(this.locations.planeMode, 1);
    this.bindCardBaseMaterialUniforms(geometry);
    gl.uniform1f(this.locations.waveStrength, 0.012 + hover * 0.012 + beat * 0.01);
    gl.uniform1f(this.locations.copyVisible, 1);
    gl.activeTexture(gl.TEXTURE1);
    this.ensureTypeTexture(object, runtimePanelLayerGeometry);
    gl.bindTexture(gl.TEXTURE_2D, this.typeTextures.get(object.id) || this.blankTexture);
    gl.drawElements(gl.TRIANGLES, geometry.indices.length, geometry.indexType, 0);
  },

  renderZoneCardAssets(object, parentGeometry, parentPosition, parentRotation, parentScale, active, hover, pulse, time, index) {
    if (!object.interactionZones?.length) return;
    const zoneGeometry = this.getZoneGeometryForObject(object);
    if (!zoneGeometry) return;
    this.bindGeometry(zoneGeometry);
    const gl = this.gl;
    const bounds = parentGeometry?.bounds || { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    const width = Math.max(0.001, bounds.maxX - bounds.minX);
    const height = Math.max(0.001, bounds.maxY - bounds.minY);
    const material = object.materialProfile || {};
    const beat = this.stagePhase?.beatIntensity || 0;
    const focusLock = object.id === this.stagePhase?.activeObjectState && this.stagePhase?.focusLock ? 1 : 0;
    RuntimeMath.compose(this.parentModelMatrix, parentPosition, parentRotation, parentScale);

    object.interactionZones.forEach((zone, zoneIndex) => {
      const [x, y, w, h] = zone.visualRect || zone.rect;
      const visual = this.zoneAssetVisualProfile(object, zone);
      const pressed = this.isPressedZone(object, zone.id) ? 1 : 0;
      const selected = this.isRuntimeZone(object, zone.id) ? 1 : 0;
      const hovered = this.stagePhase?.hoverZoneId === zone.id && this.stagePhase?.hoverObjectId === object.id ? 1 : 0;
      const localCenter = [
        bounds.minX + (x + w * 0.5) * width,
        bounds.minY + (y + h * 0.5) * height,
        visual.zOffset - pressed * 0.014 + hovered * 0.012
      ];
      const localScale = [
        Math.max(visual.minX, w * visual.x) * (1 + hovered * 0.075 + pressed * 0.045),
        Math.max(visual.minY, h * visual.y) * (1 + hovered * 0.075 + pressed * 0.045),
        visual.z
      ];
      RuntimeMath.compose(this.zoneModelMatrix, localCenter, [0, 0, 0], localScale);
      RuntimeMath.multiply(this.modelMatrix, this.parentModelMatrix, this.zoneModelMatrix);
      gl.uniformMatrix4fv(this.locations.model, false, this.modelMatrix);
      gl.uniform3f(this.locations.tone, CARD_GLASS_TONE[0], CARD_GLASS_TONE[1], CARD_GLASS_TONE[2]);
      gl.uniform1f(this.locations.hover, Math.max(hover * 0.7, hovered));
      gl.uniform1f(this.locations.active, Math.max(active * 0.4, selected * 0.46, pressed * 0.72));
      gl.uniform1f(this.locations.objectVisibility, visual.visibility + hovered * 0.14 + pressed * 0.18 + selected * 0.06);
      gl.uniform1f(this.locations.activeScene, 1);
      gl.uniform1f(this.locations.panelId, (object.priority ?? index) + 51 + zoneIndex);
      gl.uniform1f(this.locations.stageBeat, beat * (material.chapterSnap || 1));
      gl.uniform1f(this.locations.focusLock, focusLock);
      gl.uniform1f(this.locations.copyBoost, 0);
      gl.uniform1f(this.locations.latentDim, 1);
      gl.uniform1f(this.locations.planeMode, 0);
      this.bindCardBaseMaterialUniforms(zoneGeometry);
      gl.uniform1f(this.locations.waveStrength, 0.02 + hover * 0.02 + hovered * 0.035 + pressed * 0.025);
      gl.uniform1f(this.locations.copyVisible, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.blankTexture);
      gl.drawElements(gl.TRIANGLES, zoneGeometry.indices.length, zoneGeometry.indexType, 0);
    });
  },

  zoneAssetVisualProfile(object, zone) {
    if (object.copy?.mode === "pricing") {
      return { x: 1.02, y: 0.94, z: 0.105, minX: 0.17, minY: 0.112, zOffset: 0.112, visibility: 0.13 };
    }
    if (zone.id === "input") {
      return { x: 1, y: 0.96, z: 0.105, minX: 0.42, minY: 0.124, zOffset: 0.11, visibility: 0.12 };
    }
    if (zone.id === "primaryCta" || zone.id === "secondaryCta") {
      return { x: 1.04, y: 0.96, z: 0.105, minX: 0.16, minY: 0.118, zOffset: 0.11, visibility: 0.12 };
    }
    return { x: 1, y: 0.92, z: 0.105, minX: 0.14, minY: 0.108, zOffset: 0.108, visibility: 0.11 };
  },
};
