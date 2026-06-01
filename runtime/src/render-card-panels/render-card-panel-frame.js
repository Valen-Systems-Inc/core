import { CORE_RUNTIME_MANIFEST } from "../describe-runtime-scenes/assemble-core-runtime-manifest.js";
import { CARD_GLASS_TONE } from "../describe-runtime-scenes/describe-card-copy-surfaces.js";
import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";

export const runtimePanelRenderMethods = {
  render(time, dpr) {
    const gl = this.gl;
    gl.useProgram(this.program);
    this.boundGeometry = null;
    gl.uniformMatrix4fv(this.locations.viewProjection, false, this.cameraRig.viewProjection);
    gl.uniform2f(this.locations.resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(this.locations.waveMap, 0);
    gl.uniform1i(this.locations.copyMap, 1);
    gl.uniform1f(this.locations.time, time * 0.001);
    gl.uniform1f(this.locations.dpr, dpr);
    gl.uniform2f(this.locations.pointer, this.interaction.pointer.x, this.interaction.pointer.y);
    this.waveField.bind(0);
    gl.disable(gl.CULL_FACE);

    const drawObjects = (this.stagePhase?.drawOrder?.length ? this.stagePhase.drawOrder : this.objects.map((object) => object.id))
      .map((id) => this.objects.find((object) => object.id === id))
      .filter((object) => object && (!this.stagePhase?.stageComposition?.hideLatentCards || this.stagePhase?.stageComposition?.orbitalRing?.enabled || object.id === this.stagePhase?.activeObjectState));
    drawObjects.forEach((object, index) => {
      const geometry = this.getGeometryForObject(object);
      this.bindGeometry(geometry);
      const hover = this.hover.get(object.id) || 0;
      const wake = this.materialWake.get(object.id) || 0;
      const materialHover = Math.max(hover, wake);
      const active = this.active.get(object.id) || 0;
      const pulse = this.zonePulse.get(object.id) || 0;
      const pressed = this.state.get("pressedMeshId") === object.id ? 1 : 0;
      const visibility = this.visibility.get(object.id) || 0.2;
      const copyVisibility = this.copyVisibility.get(object.id) || 0.12;
      const theatreBoost = this.stagePhase?.stageComposition?.theatre && object.id !== this.stagePhase?.activeObjectState ? 0.04 : 0;
      const renderVisibility = RuntimeMath.clamp(visibility + theatreBoost, 0, 1);
      const renderCopyVisibility = RuntimeMath.clamp(copyVisibility + theatreBoost * 0.08, 0, 1);
      const transform = this.transforms.get(object.id);
      const presentation = this.getPresentationPose(object, transform, this.stagePhase, time, hover, active, pressed);
      const rotation = presentation.rotation;
      const renderPosition = presentation.position;
      const renderScale = presentation.scale;
      RuntimeMath.compose(this.modelMatrix, renderPosition, rotation, renderScale);
      gl.uniformMatrix4fv(this.locations.model, false, this.modelMatrix);
      gl.uniform3f(this.locations.tone, CARD_GLASS_TONE[0], CARD_GLASS_TONE[1], CARD_GLASS_TONE[2]);
      gl.uniform1f(this.locations.hover, materialHover);
      gl.uniform1f(this.locations.active, Math.max(active, pulse * 0.45, pressed * 0.32));
      gl.uniform1f(this.locations.objectVisibility, renderVisibility);
      gl.uniform1f(this.locations.activeScene, object.cardNumber === this.activeCardNumber ? 1 : 0);
      gl.uniform1f(this.locations.panelId, (object.priority ?? index) + 1);
      const material = object.materialProfile || {};
      const beat = this.stagePhase?.beatIntensity || 0;
      const focusLock = object.id === this.stagePhase?.activeObjectState && this.stagePhase?.focusLock ? 1 : 0;
      gl.uniform1f(this.locations.stageBeat, beat * (material.chapterSnap || 1));
      gl.uniform1f(this.locations.focusLock, focusLock);
      gl.uniform1f(this.locations.copyBoost, material.copyBoost || CORE_RUNTIME_MANIFEST.visualProfile.copyBoost);
      gl.uniform1f(this.locations.latentDim, material.latentDim || CORE_RUNTIME_MANIFEST.visualProfile.latentDim);
      gl.uniform1f(this.locations.planeMode, 0);
      this.bindCardBaseMaterialUniforms(geometry);
      gl.uniform1f(this.locations.waveStrength, 0.008 + (material.waveStrength || 1) * (materialHover * 0.11 + active * 0.18 + pulse * 0.05 + beat * 0.045));
      gl.uniform1f(this.locations.copyVisible, 0);
      gl.activeTexture(gl.TEXTURE1);
      this.ensureCopyTexture(object);
      gl.bindTexture(gl.TEXTURE_2D, this.copyTextures.get(object.id) || this.blankTexture);
      if (!this.usePbrAssetBodies) {
        gl.drawElements(gl.TRIANGLES, geometry.indices.length, geometry.indexType, 0);
      }
      if (object.spatialType?.enabled) {
        this.renderSpatialTypePlane(
          object,
          { position: renderPosition, rotation, scale: renderScale },
          active,
          hover,
          pulse,
          time,
          index,
          this.typePlaneGeometry || geometry,
          renderCopyVisibility,
          geometry
        );
      }
      if (!this.usePbrAssetBodies && object.id === this.stagePhase?.activeObjectState) {
        this.renderZoneCardAssets(object, geometry, renderPosition, rotation, renderScale, active, hover, pulse, time, index);
      }
    });
    gl.disable(gl.CULL_FACE);
  }
};
