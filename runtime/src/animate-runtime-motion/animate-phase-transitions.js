import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";

export function resolvePhaseHandoffVisibility(stagePhase = {}, composition = {}, isHandoffPrevious = false) {
  if (!isHandoffPrevious) return 0;
  if (stagePhase.transitionPhase === "settle") {
    return RuntimeMath.lerp(0.62, composition.orbitReattachVisibility ?? 0.08, RuntimeMath.easeInOutCubic(stagePhase.transitionProgress || 0));
  }
  if (stagePhase.transitionPhase === "handoff") {
    return RuntimeMath.lerp(0.96, 0.72, RuntimeMath.easeInOutCubic(stagePhase.transitionProgress || 0));
  }
  if (stagePhase.transitionPhase === "preRoll") return 0.96;
  return 0.72;
}

export function resolvePhaseHandoffCopyVisibility(stagePhase = {}, composition = {}, isHandoffPrevious = false) {
  if (!isHandoffPrevious) return 0;
  if (stagePhase.transitionPhase === "settle") {
    return RuntimeMath.lerp(0.16, composition.orbitReattachCopy ?? 0.01, RuntimeMath.easeInOutCubic(stagePhase.transitionProgress || 0));
  }
  if (stagePhase.transitionPhase === "handoff") {
    return RuntimeMath.lerp(0.56, 0.24, RuntimeMath.easeInOutCubic(stagePhase.transitionProgress || 0));
  }
  if (stagePhase.transitionPhase === "preRoll") return 0.56;
  return 0.18;
}

export function resolveCardPanelMoveEase(stagePhase = {}, { inScene = false, isHandoffPrevious = false } = {}) {
  if (inScene) {
    if (stagePhase.transitionPhase === "present") return 0.34;
    if (stagePhase.transitionPhase === "handoff") return 0.26;
    return 0.19;
  }
  if (isHandoffPrevious) {
    if (stagePhase.transitionPhase === "handoff") return 0.28;
    return 0.24;
  }
  if (stagePhase.focusLock) return 0.2;
  return 0.12;
}
