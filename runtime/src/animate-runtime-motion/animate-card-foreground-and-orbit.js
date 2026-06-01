import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";

export function snapCompletedOrbitHandoff({
  objectId = "",
  stagePhase = {},
  composition = {},
  showOrbitalLatents = false,
  latentIndex = -1,
  inScene = false,
  transform,
  targetTransform,
  visibility,
  copyVisibility
} = {}) {
  if (objectId !== stagePhase.completedHandoffObjectId || inScene || !showOrbitalLatents || latentIndex < 0) {
    return false;
  }
  transform.position = [...targetTransform.position];
  transform.rotation = [...targetTransform.rotation];
  transform.scale = [...targetTransform.scale];
  visibility.set(objectId, Math.min(visibility.get(objectId) || 0, composition.orbitReattachVisibility ?? 0.08));
  copyVisibility.set(objectId, Math.min(copyVisibility.get(objectId) || 0, composition.orbitReattachCopy ?? 0.01));
  return true;
}

export function animateCardForegroundAndOrbit({
  objectId = "",
  transform,
  targetTransform,
  moveEase = 0.12,
  hover,
  materialWake,
  active,
  visibility,
  copyVisibility,
  zonePulse,
  hoverTarget = 0,
  latentWake = 0,
  activeTarget = 0,
  visibilityTarget = 0,
  copyTarget = 0,
  copyEase = 0.06,
  zonePulseTarget = 0
} = {}) {
  RuntimeMath.lerpVec3(transform.position, transform.position, targetTransform.position, moveEase);
  RuntimeMath.lerpEuler(transform.rotation, transform.rotation, targetTransform.rotation, moveEase);
  RuntimeMath.lerpVec3(transform.scale, transform.scale, targetTransform.scale, moveEase);
  hover.set(objectId, RuntimeMath.lerp(hover.get(objectId), Math.max(hoverTarget, latentWake), 0.12));
  materialWake.set(objectId, RuntimeMath.lerp(materialWake.get(objectId), latentWake, 0.1));
  active.set(objectId, RuntimeMath.lerp(active.get(objectId), activeTarget, 0.1));
  visibility.set(objectId, RuntimeMath.lerp(visibility.get(objectId), visibilityTarget, 0.1));
  copyVisibility.set(objectId, RuntimeMath.lerp(copyVisibility.get(objectId), copyTarget, copyEase));
  zonePulse.set(objectId, RuntimeMath.lerp(zonePulse.get(objectId), zonePulseTarget, 0.18));
}
