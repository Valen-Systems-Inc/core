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

export const runtimePanelTransformMethods = {
  buildHitTarget(object, index, visibility, geometry = this.geometry) {
    const transform = this.transforms.get(object.id);
    RuntimeMath.compose(this.modelMatrix, transform.position, transform.rotation, transform.scale);
    RuntimeMath.multiply(this.modelViewProjection, this.cameraRig.viewProjection, this.modelMatrix);
    const bounds = geometry?.bounds || { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    const corners = [
      [bounds.minX, bounds.minY, 0],
      [bounds.maxX, bounds.minY, 0],
      [bounds.maxX, bounds.maxY, 0],
      [bounds.minX, bounds.maxY, 0]
    ].map((point) => RuntimeMath.projectPoint(this.modelViewProjection, point)).filter(Boolean);
    if (corners.length !== 4) return null;
    const minX = Math.min(...corners.map((point) => point.x * 0.5 + 0.5));
    const maxX = Math.max(...corners.map((point) => point.x * 0.5 + 0.5));
    const minY = Math.min(...corners.map((point) => point.y * 0.5 + 0.5));
    const maxY = Math.max(...corners.map((point) => point.y * 0.5 + 0.5));
    if (maxX < -0.2 || minX > 1.2 || maxY < -0.2 || minY > 1.2) return null;
    return {
      id: object.id,
      label: object.label,
      role: object.role,
      route: object.route,
      cameraTarget: object.cameraTarget,
      interactionZones: object.interactionZones,
      hitPadding: object.hitPadding,
      visible: visibility > 0.1,
      rect: { minX, maxX, minY, maxY },
      depth: object.id === this.stagePhase?.activeObjectState ? -100 : index + object.depth - visibility * 8
    };
  },

  getTargetTransform(object, index, inScene, elapsed, stagePhase) {
    const isHandoff = stagePhase.transitionPhase !== "idle" && !!stagePhase.previousObjectId;
    if (inScene) {
      const phase = stagePhase.transitionPhase;
      const activeTransform = this.getAuthoredActiveTransform(object, stagePhase, true);
      if (isHandoff) {
        return this.getIncomingRibbonTransform(object, activeTransform, stagePhase);
      }
      if (phase === "settle") {
        const ease = stagePhase.transitionEase || 1;
        activeTransform.rotation[0] += Math.sin(ease * Math.PI) * 0.02;
        activeTransform.rotation[1] -= Math.sin(ease * Math.PI) * 0.026;
      }
      return activeTransform;
    }
    const latentIndex = stagePhase.latentObjectStates.indexOf(object.id);
    const ring = stagePhase.stageComposition?.orbitalRing;
    if (isHandoff && object.id === stagePhase.previousObjectId) {
      return this.getOutgoingRibbonTransform(object, index, latentIndex, elapsed, stagePhase, ring);
    }
    if (ring?.enabled && latentIndex >= 0) {
      return this.getOrbitalRingTransform(object, latentIndex, elapsed, stagePhase, ring);
    }
    const slot = SLOT_SEQUENCE[(latentIndex >= 0 ? latentIndex : index) % SLOT_SEQUENCE.length];
    const pose = stagePhase.stageComposition?.latentSlots?.[slot] ||
      object.stage?.latentPose ||
      STAGE_LATENT_SLOTS[slot] ||
      { position: object.position, rotation: object.rotation, scale: object.scale };
    const turn = (latentIndex >= 0 ? latentIndex : index) * 0.83 + elapsed * 0.16;
    const drift = [
      Math.cos(turn) * 0.014,
      Math.sin(turn * 0.73) * 0.01,
      Math.sin(turn) * 0.014
    ];
    const focusPush = stagePhase.focusLock ? stagePhase.stageComposition?.focusPush ?? 0.14 : 0;
    return {
      position: [
        pose.position[0] + drift[0],
        pose.position[1] + drift[1] - focusPush * 0.25,
        pose.position[2] + drift[2] - focusPush
      ],
      rotation: [
        pose.rotation[0] + Math.sin(elapsed * 0.42 + index) * 0.018,
        pose.rotation[1] + Math.cos(elapsed * 0.34 + index) * 0.024,
        pose.rotation[2]
      ],
      scale: pose.scale
    };
  },

  getAuthoredActiveTransform(object, stagePhase, currentScene = false) {
    const compactFit = this.getCompactFitConfig(object, stagePhase, currentScene);
    const activeObjectPose = object.id === stagePhase?.activeObjectState ? object.stage?.activePose : null;
    const activePose = compactFit?.activePose || activeObjectPose || (currentScene ? stagePhase.stageComposition?.activePose : null) || object.stage?.activePose || object.activeTarget || {
      position: [0, 0.02, -0.05],
      rotation: [0, 0, 0],
      scale: [1.82, 1.04, 1]
    };
    const beat = currentScene ? stagePhase.beatIntensity || 0 : 0;
    const position = [...activePose.position];
    const rotation = [...activePose.rotation];
    const scale = [...activePose.scale];
    if (compactFit?.activePoseDelta) {
      const delta = compactFit.activePoseDelta;
      position[0] += delta.position?.[0] ?? 0;
      position[1] += delta.position?.[1] ?? 0;
      position[2] += delta.position?.[2] ?? 0;
      rotation[0] += delta.rotation?.[0] ?? 0;
      rotation[1] += delta.rotation?.[1] ?? 0;
      rotation[2] += delta.rotation?.[2] ?? 0;
      scale[0] *= delta.scale?.[0] ?? 1;
      scale[1] *= delta.scale?.[1] ?? 1;
      scale[2] *= delta.scale?.[2] ?? 1;
    }
    rotation[1] += this.getYawForCardFrontDirection(object, 0, 1);
    if (compactFit) {
      const phoneFit = RuntimeMath.clamp((820 - window.innerWidth) / 430, 0, 1);
      const phoneScale = stagePhase.stageComposition?.phoneScale ?? MOBILE_ACTIVE_CARD_SCALE;
      const compactScale = RuntimeMath.lerp(1.08, phoneScale, phoneFit);
      position[0] += phoneFit * (stagePhase.stageComposition?.phoneXBias ?? -0.16);
      scale[0] *= compactScale;
      scale[1] *= compactScale;
    }
    scale[0] *= 1.06 * (1 + beat * 0.026);
    scale[1] *= 1.06 * (1 + beat * 0.026);
    position[1] += beat * 0.05;
    return { position, rotation, scale };
  },

  getRibbonLaneTransform(baseTransform, side) {
    const lane = CARD_RIBBON_HANDOFF;
    const normalizedSide = side < 0 ? -1 : 1;
    return {
      position: [
        normalizedSide * lane.x,
        lane.y,
        lane.z
      ],
      rotation: [
        baseTransform.rotation[0] + lane.pitch,
        baseTransform.rotation[1] + normalizedSide * lane.yaw,
        baseTransform.rotation[2] - normalizedSide * lane.roll
      ],
      scale: [
        baseTransform.scale[0] * lane.scale,
        baseTransform.scale[1] * lane.scale,
        baseTransform.scale[2]
      ]
    };
  },

  mixTransforms(a, b, t) {
    const p = RuntimeMath.clamp(t);
    return {
      position: RuntimeMath.mixVec3(a.position, b.position, p),
      rotation: RuntimeMath.mixEuler(a.rotation, b.rotation, p),
      scale: RuntimeMath.mixVec3(a.scale, b.scale, p)
    };
  },

  getCompactFitConfig(object, stagePhase = this.stagePhase, currentScene = false) {
    if (!this.capabilities?.compactStageFit) return null;
    if (currentScene && object.id === stagePhase?.activeObjectState && object.stage?.compactFit) {
      return object.stage.compactFit;
    }
    if (currentScene) return stagePhase?.stageComposition?.compactFit || object.stage?.compactFit || null;
    return object.stage?.compactFit || null;
  },

  getHandoffDirection(stagePhase) {
    return stagePhase.handoffDirection >= 0 ? 1 : -1;
  },

  getIncomingRibbonTransform(object, activeTransform, stagePhase) {
    const direction = this.getHandoffDirection(stagePhase);
    const enterSide = CARD_RIBBON_HANDOFF.enterSide * direction;
    const enterLane = this.getRibbonLaneTransform(activeTransform, enterSide);
    const progress = stagePhase.transitionProgress || 0;
    if (stagePhase.transitionPhase === "preRoll") {
      return enterLane;
    }
    if (stagePhase.transitionPhase === "handoff") {
      return this.mixTransforms(enterLane, activeTransform, RuntimeMath.easeInOutCubic(progress) * 0.46);
    }
    if (stagePhase.transitionPhase === "present") {
      return this.mixTransforms(enterLane, activeTransform, 0.46 + RuntimeMath.easeOutCubic(progress) * 0.54);
    }
    if (stagePhase.transitionPhase === "settle") {
      const settle = Math.sin(RuntimeMath.clamp(progress) * Math.PI);
      return {
        position: [...activeTransform.position],
        rotation: [
          activeTransform.rotation[0] + settle * 0.018,
          activeTransform.rotation[1] - settle * 0.022,
          activeTransform.rotation[2]
        ],
        scale: activeTransform.scale
      };
    }
    return activeTransform;
  },

  getOutgoingRibbonTransform(object, index, latentIndex, elapsed, stagePhase, ring) {
    const direction = this.getHandoffDirection(stagePhase);
    const exitSide = CARD_RIBBON_HANDOFF.exitSide * direction;
    const activeTransform = this.getAuthoredActiveTransform(object, stagePhase, false);
    const exitLane = this.getRibbonLaneTransform(activeTransform, exitSide);
    const progress = stagePhase.transitionProgress || 0;
    if (stagePhase.transitionPhase === "preRoll") {
      const hold = RuntimeMath.clamp(CARD_RIBBON_HANDOFF.hold ?? 0.36, 0.05, 0.82);
      const exitProgress = progress <= hold ? 0 : RuntimeMath.easeInOutCubic((progress - hold) / Math.max(0.01, 1 - hold)) * 0.28;
      return this.mixTransforms(activeTransform, exitLane, exitProgress);
    }
    if (stagePhase.transitionPhase === "handoff") {
      return this.mixTransforms(activeTransform, exitLane, 0.28 + RuntimeMath.easeInOutCubic(progress) * 0.48);
    }
    if (stagePhase.transitionPhase === "present") {
      return this.mixTransforms(activeTransform, exitLane, 0.76 + RuntimeMath.easeOutCubic(progress) * 0.24);
    }
    if (stagePhase.transitionPhase === "settle") {
      return exitLane;
    }
    return exitLane;
  },

  getOrbitalRingTransform(object, latentIndex, elapsed, stagePhase, ring) {
    const ringIds = stagePhase.latentObjectStates || [];
    const total = Math.max(1, ringIds.length || this.objects.length);
    const objectSlot = latentIndex >= 0
      ? latentIndex
      : Number.isFinite(object.priority)
        ? object.priority % total
        : 0;
    const spatialState = object.workspaceCardSpatialState && typeof object.workspaceCardSpatialState === "object"
      ? object.workspaceCardSpatialState
      : null;
    const useSpatialOrbit = String(spatialState?.space || "").toLowerCase() === "orbit";
    const readSpatialNumber = (value) => {
      if (value === null || value === undefined || value === "") return NaN;
      const number = Number(value);
      return Number.isFinite(number) ? number : NaN;
    };
    const spatialAngle = useSpatialOrbit ? readSpatialNumber(spatialState.angle) : NaN;
    const spatialDistance = useSpatialOrbit ? readSpatialNumber(spatialState.distance) : NaN;
    const spatialElevation = useSpatialOrbit ? readSpatialNumber(spatialState.elevation) : NaN;
    const spatialScale = useSpatialOrbit ? readSpatialNumber(spatialState.scale) : NaN;
    const idlePull = ((elapsed * (ring.idleSpeed ?? ring.speed ?? 0.1)) % TAU) * (ring.idleOrbitScale ?? 1);
    const scrollPull = (stagePhase.pageProgress || 0) * (ring.scrollPull ?? 0.9);
    const authoredPhase = Number.isFinite(spatialAngle) ? (spatialAngle / 360) * TAU : null;
    const phase = (authoredPhase ?? ((objectSlot / total) * TAU)) + idlePull + scrollPull + (ring.phaseOffset || 0);
    const distanceScale = Number.isFinite(spatialDistance)
      ? RuntimeMath.clamp(spatialDistance / 1.22, 0.72, 1.28)
      : 1;
    const elevationOffset = Number.isFinite(spatialElevation) ? spatialElevation : 0;
    const scaleMultiplier = Number.isFinite(spatialScale)
      ? RuntimeMath.clamp(spatialScale, 0.62, 1.18)
      : 1;
    const center = ring.center || [0, -0.08, -0.82];
    const radiusX = (ring.radiusX || 1.9) * distanceScale;
    const radiusZ = (ring.radiusZ || 0.72) * distanceScale;
    const x = center[0] + Math.sin(phase) * radiusX;
    const z = center[2] + Math.cos(phase) * radiusZ;
    const y = center[1] + elevationOffset + Math.sin(phase * 1.7 + objectSlot) * 0.12;
    const near = RuntimeMath.clamp((Math.cos(phase) + 1) * 0.5, 0, 1);
    const radialX = (x - center[0]) / Math.max(radiusX, 0.001);
    const radialZ = (z - center[2]) / Math.max(radiusZ, 0.001);
    const profile = this.getCardCopySurfaceProfile(object);
    const outwardYaw = this.getYawForCardFrontDirection(
      object,
      radialX,
      radialZ,
      (ring.outwardYawOffset ?? 0) + (profile.orbitYawOffset || 0)
    );
    const scale = ring.scale || [0.54, 0.54, 1];

    return {
      position: [x, y, z],
      rotation: [
        (ring.pitch ?? -0.035) + Math.sin(phase * 0.8) * 0.02,
        outwardYaw,
        Math.sin(phase * 0.55) * 0.035
      ],
      scale: [
        scale[0] * scaleMultiplier * (0.82 + near * 0.22),
        scale[1] * scaleMultiplier * (0.82 + near * 0.22),
        scale[2]
      ]
    };
  },
};
