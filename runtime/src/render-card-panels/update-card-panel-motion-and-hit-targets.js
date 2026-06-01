import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";
import {
  resolveCardPanelMoveEase,
  resolvePhaseHandoffCopyVisibility,
  resolvePhaseHandoffVisibility
} from "../animate-runtime-motion/animate-phase-transitions.js";
import {
  animateCardForegroundAndOrbit,
  snapCompletedOrbitHandoff
} from "../animate-runtime-motion/animate-card-foreground-and-orbit.js";

export const runtimePanelUpdateMethods = {
  update(stagePhase, dt) {
    this.hitTargets = [];
    this.stagePhase = stagePhase;
    this.activeCardNumber = stagePhase.activeCardNumber;
    const activeId = stagePhase.activeObjectState;
    const hoverId = stagePhase.hoverObjectId || this.interaction.hoverMeshId;
    const activeHover = hoverId && hoverId === activeId ? 1 : 0;
    const composition = stagePhase.stageComposition || {};
    const showOrbitalLatents = !!composition.orbitalRing?.enabled;
    const drawableIds = new Set(stagePhase.drawOrder || []);
    const elapsed = performance.now() * 0.001;
    const mouseLean = RuntimeMath.clamp((this.interaction.pointer.x - 0.5) * 1.45, -1, 1);
    const lateralGesture = RuntimeMath.clamp(
      (this.interaction.pointer.gestureX || 0) * 0.82 + mouseLean * 0.22,
      -1,
      1
    );
    this.gestureLean = RuntimeMath.lerp(this.gestureLean || 0, lateralGesture, Math.abs(lateralGesture) > 0.01 ? 0.16 : 0.07);
    if (activeId !== "card1" && this.cardInteractionState.activeZoneId.startsWith("card1:")) {
      this.setActiveRuntimeZone("none", "scene-change");
    }
    let nativeInputTarget = null;
    this.objects.forEach((object, index) => {
      const inScene = object.id === activeId;
      const isHandoffPrevious = object.id === stagePhase.previousObjectId && stagePhase.transitionPhase !== "idle";
      const isDrawable = drawableIds.has(object.id) && (!composition.hideLatentCards || showOrbitalLatents || inScene);
      const latentIndex = stagePhase.latentObjectStates.indexOf(object.id);
      const sceneBoost = inScene ? 1 : 0.16;
      const hoverTarget = object.id === hoverId ? 1 : 0;
      const latentWake = !inScene && isDrawable && activeHover
        ? Math.max(0.08, 0.22 - Math.max(0, latentIndex) * 0.025)
        : 0;
      const activeTarget = object.id === activeId ? 1 : 0;
      const latentCeiling = stagePhase.focusLock ? composition.latentVisibility ?? 0.32 : 0.5;
      const hoverCeiling = stagePhase.focusLock ? composition.latentHoverVisibility ?? 0.48 : 0.74;
      const handoffFade = resolvePhaseHandoffVisibility(stagePhase, composition, isHandoffPrevious);
      const baseVisibility = isHandoffPrevious ? handoffFade : inScene ? 1 : latentCeiling;
      const visibilityTarget = isDrawable ? Math.max(baseVisibility, hoverTarget * hoverCeiling, activeTarget) : 0;
      const handoffCopy = resolvePhaseHandoffCopyVisibility(stagePhase, composition, isHandoffPrevious);
      const copyTarget = isDrawable ? inScene ? 1 : Math.max(handoffCopy, hoverTarget ? composition.hoverLatentCopy ?? 0.14 : composition.latentCopy ?? 0.02) : 0;
      const transform = this.transforms.get(object.id);
      const targetTransform = this.getTargetTransform(object, index, inScene, elapsed, stagePhase);
      snapCompletedOrbitHandoff({
        objectId: object.id,
        stagePhase,
        composition,
        showOrbitalLatents,
        latentIndex,
        inScene,
        transform,
        targetTransform,
        visibility: this.visibility,
        copyVisibility: this.copyVisibility
      });
      animateCardForegroundAndOrbit({
        objectId: object.id,
        transform,
        targetTransform,
        moveEase: resolveCardPanelMoveEase(stagePhase, { inScene, isHandoffPrevious }),
        hover: this.hover,
        materialWake: this.materialWake,
        active: this.active,
        visibility: this.visibility,
        copyVisibility: this.copyVisibility,
        zonePulse: this.zonePulse,
        hoverTarget,
        latentWake,
        activeTarget,
        visibilityTarget,
        copyTarget,
        copyEase: inScene ? 0.16 : 0.06,
        zonePulseTarget: stagePhase.hoverZoneId && object.id === activeId ? 1 : 0
      });
      const target = isDrawable ? this.buildHitTarget(object, index, Math.max(inScene ? sceneBoost : 0.18, visibilityTarget), this.getRuntimePanelLayerGeometry(object, this.getGeometryForObject(object))) : null;
      if (target) {
        this.hitTargets.push(target);
        const inputZone = object.role === "input"
          ? object.interactionZones?.find((zone) => zone.id === "input")
          : null;
        if (inScene && inputZone) nativeInputTarget = { target, zone: inputZone };
      }
    });
    this.updateNativeInputOverlay(nativeInputTarget?.target || null, nativeInputTarget?.zone || null);
  }
};
