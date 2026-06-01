import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";
export class RuntimeStageDirector {
  constructor(manifest, state) {
    this.manifest = manifest;
    this.state = state;
    this.objects = manifest.runtimeObjectStates.filter((object) => object.type === "panel");
    this.objectsById = new Map(this.objects.map((object) => [object.id, object]));
    this.runtimePhases = manifest["3druntimePhases"] || {};
    this.timings = { preRoll: 160, handoff: 240, present: 520, settle: 320 };
    this.phaseOrder = ["preRoll", "handoff", "present", "settle", "idle"];
    this.activePhaseId = state.get("activePhaseId") || "WorkspaceMode";
    this.activeObjectState = this.getPrimaryObject(this.manifest.scenes[0]?.id, this.activePhaseId)?.id || this.objects[0]?.id || null;
    this.activeCardOverride = null;
    this.previousObjectId = null;
    this.previousSceneIndex = 0;
    this.lastPageProgress = 0;
    this.scrollDirection = 1;
    this.scrollVelocity = 0;
    this.hoverObjectId = null;
    this.hoverZoneId = null;
    this.transitionPhase = "idle";
    this.elapsed = 0;
    this.handoffDirection = 1;
    this.reverseReacquire = false;
    this.completedHandoffObjectId = null;
    this.stagePhase = this.createState(this.manifest.scenes[0], 0, 0);
    this.report();
  }

  setHover(target) {
    this.hoverObjectId = target?.id || null;
    this.hoverZoneId = target?.zone?.id || null;
    if (this.stagePhase) {
      this.stagePhase.hoverObjectId = this.hoverObjectId;
      this.stagePhase.hoverZoneId = this.hoverZoneId;
      this.stagePhase.interactionMode = this.hoverZoneId ? "zone" : this.hoverObjectId ? "mesh" : "scene";
      this.stagePhase.materialFocus = {
        ...this.stagePhase.materialFocus,
        hoverObjectId: this.hoverObjectId,
        zoneId: this.hoverZoneId,
        intensity: RuntimeMath.clamp((this.stagePhase.materialFocus?.intensity || 0) + (this.hoverObjectId ? 0.18 : 0), 0, 1)
      };
    }
    this.report();
  }

  update(active, dt) {
    const scene = active.scene || this.manifest.scenes[0];
    const overrideCardNumber = this.activeCardOverride?.phaseId === this.activePhaseId && scene.id === "card1"
      ? this.activeCardOverride.cardNumber
      : null;
    const primaryObject = this.getPrimaryObject(overrideCardNumber || scene.id, this.activePhaseId);
    const pageProgress = active.pageProgress || 0;
    const scrollDelta = pageProgress - this.lastPageProgress;
    const scrollVelocityTarget = RuntimeMath.clamp(scrollDelta * (1000 / Math.max(1, dt)) * 1.8, -1, 1);
    this.scrollVelocity = RuntimeMath.lerp(this.scrollVelocity || 0, scrollVelocityTarget, scrollVelocityTarget === 0 ? 0.16 : 0.34);
    this.scrollDirection = Math.sign(scrollDelta) || this.scrollDirection || 1;
    this.lastPageProgress = pageProgress;
    if (primaryObject?.id !== this.activeObjectState) {
      const previous = this.objectsById.get(this.activeObjectState);
      this.completedHandoffObjectId = null;
      this.previousObjectId = this.activeObjectState;
      this.activeObjectState = primaryObject?.id || null;
      const indexDirection = Math.sign((active.index ?? 0) - this.previousSceneIndex);
      this.handoffDirection = indexDirection || this.scrollDirection || Math.sign((primaryObject?.priority ?? 0) - (previous?.priority ?? 0)) || 1;
      this.reverseReacquire = indexDirection < 0 || (!indexDirection && this.scrollDirection < 0);
      this.previousSceneIndex = active.index ?? this.previousSceneIndex;
      this.transitionPhase = "preRoll";
      this.elapsed = 0;
    } else if (this.transitionPhase !== "idle") {
      this.elapsed += dt;
      this.advancePhase();
    }
    this.stagePhase = this.createState(scene, active.progress || 0, active.pageProgress || 0, this.completedHandoffObjectId);
    this.completedHandoffObjectId = null;
    this.report();
    return this.stagePhase;
  }

  getState() {
    return this.stagePhase;
  }

  getPhaseConfig(phaseId = this.activePhaseId) {
    return this.runtimePhases[phaseId] || this.runtimePhases.WorkspaceMode || null;
  }

  getPhaseObjects(phaseId = this.activePhaseId) {
    const phase = this.getPhaseConfig(phaseId);
    const explicitObjectStates = Array.isArray(phase?.objectStates)
      ? new Set(phase.objectStates)
      : null;
    const explicitCardNumbers = Array.isArray(phase?.cardNumbers)
      ? new Set(phase.cardNumbers)
      : null;
    return this.objects.filter((object) => explicitObjectStates
      ? explicitObjectStates.has(object.id)
      : explicitCardNumbers
        ? explicitCardNumbers.has(object.cardNumber)
        : !Array.isArray(object.phaseIds) || object.phaseIds.includes(phaseId));
  }

  getPrimaryObject(cardNumber, phaseId = this.activePhaseId) {
    const phase = this.getPhaseConfig(phaseId);
    const phaseObjects = this.getPhaseObjects(phaseId);
    return phaseObjects.find((object) => object.cardNumber === cardNumber)
      || phaseObjects.find((object) => object.id === phase?.defaultObjectState)
      || phaseObjects.find((object) => object.cardNumber === phase?.defaultCardNumber)
      || phaseObjects[0]
      || null;
  }

  setExperiencePhase(phaseId = "WorkspaceMode", cardNumber = null) {
    const phase = this.getPhaseConfig(phaseId);
    if (!phase) return this.stagePhase;
    const targetCardNumber = cardNumber || phase.defaultCardNumber || this.manifest.scenes[0]?.id || "card1";
    const primaryObject = this.getPrimaryObject(targetCardNumber, phaseId);
    if (!primaryObject) return this.stagePhase;
    this.activeCardOverride = cardNumber ? { phaseId, cardNumber: targetCardNumber } : null;
    if (phaseId !== this.activePhaseId || primaryObject.id !== this.activeObjectState) {
      this.previousObjectId = this.activeObjectState;
      this.completedHandoffObjectId = null;
      this.activePhaseId = phaseId;
      this.activeObjectState = primaryObject.id;
      this.transitionPhase = "preRoll";
      this.elapsed = 0;
      this.reverseReacquire = false;
      this.handoffDirection = 1;
    } else {
      this.activePhaseId = phaseId;
      this.activeObjectState = primaryObject.id;
    }
    this.state.set("activePhaseId", this.activePhaseId);
    const currentScene = this.manifest.scenes.find((scene) => scene.id === this.stagePhase?.activeCardNumber)
      || this.manifest.scenes.find((scene) => scene.id === targetCardNumber)
      || this.manifest.scenes.find((scene) => scene.id === "card1")
      || this.manifest.scenes[0];
    this.stagePhase = this.createState(
      currentScene,
      this.stagePhase?.sceneProgress || 0,
      this.stagePhase?.pageProgress || 0,
      this.completedHandoffObjectId
    );
    this.report();
    return this.stagePhase;
  }

  advancePhase() {
    while (this.transitionPhase !== "idle") {
      const duration = this.timings[this.transitionPhase] || 0;
      if (this.elapsed < duration) return;
      this.elapsed -= duration;
      const index = this.phaseOrder.indexOf(this.transitionPhase);
      this.transitionPhase = this.phaseOrder[index + 1] || "idle";
      if (this.transitionPhase === "idle") {
        this.elapsed = 0;
        this.completedHandoffObjectId = this.previousObjectId;
        this.previousObjectId = null;
        this.reverseReacquire = false;
      }
    }
  }

  getPhaseProgress() {
    if (this.transitionPhase === "idle") return 1;
    const duration = this.timings[this.transitionPhase] || 1;
    return RuntimeMath.clamp(this.elapsed / duration);
  }

  getTransitionEase() {
    const progress = this.getPhaseProgress();
    if (this.transitionPhase === "preRoll") return RuntimeMath.easeInOutCubic(progress) * 0.16;
    if (this.transitionPhase === "handoff") return 0.16 + RuntimeMath.easeInOutCubic(progress) * 0.42;
    if (this.transitionPhase === "present") return 0.58 + RuntimeMath.easeOutCubic(progress) * 0.42;
    if (this.transitionPhase === "settle") return 1 - (1 - RuntimeMath.easeInOutCubic(progress)) * 0.08;
    return 1;
  }

  createState(scene, sceneProgress, pageProgress, completedHandoffObjectId = null) {
    const activePhase = this.getPhaseConfig(this.activePhaseId);
    const phaseObjects = this.getPhaseObjects(this.activePhaseId);
    const currentObject = this.objectsById.get(this.activeObjectState);
    const activeObject = currentObject && phaseObjects.includes(currentObject)
      ? currentObject
      : this.getPrimaryObject(scene.id, this.activePhaseId);
    const objectStageComposition = activeObject?.stage?.composition || null;
    const stageComposition = objectStageComposition && activeObject?.cardNumber !== scene.id
      ? objectStageComposition
      : scene.stageComposition || objectStageComposition || {};
    const phaseLatents = stageComposition.suppressPhaseLatents && this.activePhaseId !== "WorkspaceMode"
      ? []
      : Array.isArray(activePhase?.latentObjectStates)
      ? activePhase.latentObjectStates
        .map((id) => this.objectsById.get(id))
        .filter((object) => object && object.id !== activeObject?.id)
      : null;
    const authoredLatents = Array.isArray(stageComposition.featuredLatents)
      ? stageComposition.featuredLatents
        .map((id) => this.objectsById.get(id))
        .filter((object) => object && object.id !== activeObject?.id && (!Array.isArray(object.phaseIds) || object.phaseIds.includes(this.activePhaseId)))
      : null;
    const latentObjects = (authoredLatents || phaseLatents || phaseObjects
      .filter((object) => object.id !== activeObject?.id)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))).slice(0, stageComposition.featuredLatents ? 5 : phaseObjects.length);
    const orbitRing = {
      ...(stageComposition.orbitalRing || {}),
      ...(activePhase?.orbitalRing || {})
    };
    const renderStageComposition = {
      ...stageComposition,
      orbitalRing: orbitRing
    };
    const visualLatents = orbitRing.enabled
      ? latentObjects.slice(0, orbitRing.latentCount || 5)
      : stageComposition.hideLatentCards ? [] : latentObjects;
    const drawOrder = [...new Set([
      ...visualLatents.map((object) => object.id),
      this.transitionPhase !== "idle" && this.previousObjectId !== activeObject?.id ? this.previousObjectId : null,
      activeObject?.id
    ].filter(Boolean))];
    const phaseProgress = this.getPhaseProgress();
    const transitionEase = this.getTransitionEase();
    const cameraTarget = this.buildCameraTarget(scene, activeObject, transitionEase);
    const beatIntensity = this.getBeatIntensity();
    const focusLock = !!activeObject;
    const sceneIndex = Math.max(0, this.manifest.scenes.findIndex((entry) => entry.id === scene.id));
    const cameraOrbit = scene.camera?.orbit ?? scene.orbit ?? 0;

    return {
      activePhaseId: this.activePhaseId,
      activeCardNumber: activeObject?.cardNumber || activePhase?.defaultCardNumber || scene.id,
      activeObjectState: activeObject?.id || null,
      previousObjectId: this.previousObjectId,
      completedHandoffObjectId,
      hoverObjectId: this.hoverObjectId,
      hoverZoneId: this.hoverZoneId,
      latentObjectStates: visualLatents.map((object) => object.id),
      drawOrder,
      transitionPhase: this.transitionPhase,
      transitionProgress: phaseProgress,
      transitionEase,
      beatIntensity,
      focusLock,
      sceneIndex,
      pageProgress,
      cameraOrbit,
      handoffDirection: this.handoffDirection,
      reverseReacquire: this.reverseReacquire,
      scrollDirection: this.scrollDirection,
      scrollVelocity: this.scrollVelocity,
      stageGrammar: scene.stageGrammar || "card1-object",
      stageComposition: renderStageComposition,
      cameraTarget,
      interactionMode: this.hoverZoneId ? "zone" : this.hoverObjectId ? "mesh" : "scene",
      materialFocus: {
        objectId: activeObject?.id || null,
        hoverObjectId: this.hoverObjectId,
        zoneId: this.hoverZoneId,
        intensity: RuntimeMath.clamp((activeObject ? 0.42 : 0) + transitionEase * 0.38 + beatIntensity * 0.2 + (this.hoverObjectId ? 0.28 : 0), 0, 1),
        beat: beatIntensity
      },
      sceneProgress,
      pageProgress
    };
  }

  getBeatIntensity() {
    const progress = this.getPhaseProgress();
    if (this.transitionPhase === "preRoll") return 0.24 + RuntimeMath.easeInOutCubic(progress) * 0.28;
    if (this.transitionPhase === "handoff") return 0.54 + Math.sin(RuntimeMath.clamp(progress) * Math.PI) * 0.28;
    if (this.transitionPhase === "present") return 0.18 + (1 - RuntimeMath.easeOutCubic(progress)) * 0.42;
    if (this.transitionPhase === "settle") return Math.sin(progress * Math.PI) * 0.18;
    return 0;
  }

  buildCameraTarget(scene, activeObject, ease) {
    const base = scene.camera || this.manifest.scenes[0].camera;
    const focus = activeObject?.cameraTarget || base;
    const phase = this.transitionPhase;
    const reverseBias = this.reverseReacquire ? 1 : 0;
    const position = [...(focus.position || base.position)];
    const lookAt = [...(focus.lookAt || base.lookAt)];
    let fov = focus.fov || base.fov || 42;
    if (phase === "preRoll") {
      position[0] -= this.handoffDirection * (reverseBias ? 0.08 : 0.12) * (1 - ease);
      position[1] += 0.028 * (1 - ease);
      position[2] += (reverseBias ? 0.46 : 0.68) * (1 - ease);
      fov += (reverseBias ? 3.2 : 5.1) * (1 - ease);
    } else if (phase === "handoff") {
      position[0] += this.handoffDirection * (reverseBias ? 0.06 : 0.1) * (1 - ease);
      position[1] += 0.016 * (1 - ease);
      position[2] += (reverseBias ? 0.18 : 0.28) * (1 - ease);
      fov += (reverseBias ? 1.4 : 2.1) * (1 - ease);
    } else if (phase === "present") {
      position[0] += this.handoffDirection * 0.05 * (1 - ease);
      position[2] += 0.18 * (1 - ease);
      fov += 1.2 * (1 - ease);
    } else if (phase === "settle") {
      position[0] += Math.sin(ease * Math.PI) * 0.025;
      position[1] += Math.sin(ease * Math.PI) * 0.018;
    } else {
      const drift = Math.sin(performance.now() * 0.00022 + (activeObject?.priority || 0)) * 0.025;
      position[0] += drift;
      position[1] += drift * 0.55;
    }
    return { position, lookAt, fov };
  }

  report() {
    const draw = this.stagePhase?.drawOrder || [];
    this.state.set("activePhaseId", this.activePhaseId || "WorkspaceMode");
    this.state.set("activeCardNumber", this.stagePhase?.activeCardNumber || "card1");
    this.state.set("activeObjectState", this.stagePhase?.activeObjectState || "none");
    this.state.set("activeLabel", this.activeObjectState || "none");
    this.state.set("hoverLabel", this.hoverZoneId ? `${this.hoverObjectId}:${this.hoverZoneId}` : this.hoverObjectId || "none");
    this.state.set("transitionPhaseLabel", this.transitionPhase);
    this.state.set("drawLabel", draw.length ? draw.slice(-5).join(" > ") : "none");
  }
}
