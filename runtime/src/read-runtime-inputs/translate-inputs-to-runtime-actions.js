import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";
export class RuntimeInteractionKernel {
  constructor(state, capabilities) {
    this.state = state;
    this.capabilities = capabilities;
    this.pointer = {
      x: 0.5,
      y: 0.5,
      cssY: 0.5,
      clientX: window.innerWidth * 0.5,
      clientY: window.innerHeight * 0.5,
      velocityX: 0,
      velocityY: 0,
      gestureX: 0,
      speed: 0,
      moved: false,
      down: false,
      overDom: false
    };
    this.gyro = {
      supported: typeof window !== "undefined" && typeof window.DeviceOrientationEvent !== "undefined",
      started: false,
      requestAttempted: false,
      active: false,
      baselineGamma: null,
      baselineBeta: null,
      x: 0.5,
      y: 0.5,
      lastNormX: 0,
      lastNormY: 0
    };
    this.targets = [];
    this.hoverMeshId = null;
    this.hoverZoneId = null;
    this.activeMeshId = null;
    this.clickTarget = null;
    this.currentHit = null;
    this.pressedTarget = null;
    this.coreHoldTimer = null;
  }

  start() {
    window.addEventListener("pointermove", (event) => this.onPointerMove(event), { passive: true });
    window.addEventListener("wheel", (event) => this.onWheel(event), { passive: true });
    window.addEventListener("pointerdown", (event) => {
      this.ensureGyroTracking();
      this.pointer.down = true;
      this.onPointerMove(event);
      if (!this.pointer.overDom && this.currentHit) {
        this.pressedTarget = { ...this.currentHit, zone: this.currentHit.zone || null };
        this.state.set("pressedMeshId", this.pressedTarget.id);
        this.state.set("pressedZoneId", this.pressedTarget.zone?.id || "card");
      } else {
        this.pressedTarget = null;
        this.state.set("pressedMeshId", "none");
        this.state.set("pressedZoneId", "none");
        this.scheduleCoreHold();
      }
    }, { passive: true });
    window.addEventListener("pointerup", () => {
      this.pointer.down = false;
      this.clearCoreHold();
      window.setTimeout(() => {
        if (this.pointer.down) return;
        this.pressedTarget = null;
        this.state.set("pressedMeshId", "none");
        this.state.set("pressedZoneId", "none");
      }, 90);
    }, { passive: true });
    if (this.capabilities.mobileDevice && this.gyro.supported && typeof window.DeviceOrientationEvent?.requestPermission !== "function") {
      this.startGyroTracking();
    }
    window.addEventListener("click", (event) => this.onClick(event), true);
  }

  async ensureGyroTracking() {
    if (!this.capabilities.mobileDevice || !this.gyro.supported || this.gyro.started || this.gyro.requestAttempted) return;
    this.gyro.requestAttempted = true;
    try {
      if (typeof window.DeviceOrientationEvent?.requestPermission === "function") {
        const permission = await window.DeviceOrientationEvent.requestPermission();
        if (permission !== "granted") return;
      }
      this.startGyroTracking();
    } catch (error) {
      console.warn("Gyro permission unavailable:", error);
    }
  }

  scheduleCoreHold() {
    this.clearCoreHold();
    if (!this.isCoreHoldCandidate()) return;
    this.coreHoldTimer = window.setTimeout(() => {
      this.coreHoldTimer = null;
      if (!this.pointer.down || !this.isCoreHoldCandidate()) return;
      this.state.set("pressedMeshId", "center-sculpture");
      this.state.set("pressedZoneId", "coreHold");
      window.valenRuntimeActions?.activateCore?.("hold");
    }, 560);
  }

  clearCoreHold() {
    if (!this.coreHoldTimer) return;
    window.clearTimeout(this.coreHoldTimer);
    this.coreHoldTimer = null;
  }

  isCoreHoldCandidate() {
    if (this.pointer.overDom || this.currentHit) return false;
    return this.pointer.x >= 0.22 &&
      this.pointer.x <= 0.78 &&
      this.pointer.cssY >= 0.42 &&
      this.pointer.cssY <= 0.84;
  }

  startGyroTracking() {
    if (this.gyro.started || !this.gyro.supported) return;
    this.gyro.started = true;
    window.addEventListener("deviceorientation", (event) => this.onDeviceOrientation(event), { passive: true });
  }

  onDeviceOrientation(event) {
    if (!this.capabilities.mobileDevice) return;
    const gamma = Number.isFinite(event.gamma) ? event.gamma : null;
    const beta = Number.isFinite(event.beta) ? event.beta : null;
    if (gamma === null || beta === null) return;
    if (this.gyro.baselineGamma === null) this.gyro.baselineGamma = gamma;
    if (this.gyro.baselineBeta === null) this.gyro.baselineBeta = beta;
    const normalizedX = RuntimeMath.clamp((gamma - this.gyro.baselineGamma) / 18, -1, 1);
    const normalizedY = RuntimeMath.clamp((beta - this.gyro.baselineBeta) / 24, -1, 1);
    const nextX = RuntimeMath.clamp(0.5 + normalizedX * 0.24, 0.1, 0.9);
    const nextY = RuntimeMath.clamp(0.5 - normalizedY * 0.18, 0.14, 0.86);
    this.gyro.active = true;
    this.gyro.x = nextX;
    this.gyro.y = nextY;
    const deltaX = normalizedX - this.gyro.lastNormX;
    this.gyro.lastNormX = normalizedX;
    this.gyro.lastNormY = normalizedY;
    this.pointer.gestureX = RuntimeMath.clamp((this.pointer.gestureX || 0) * 0.78 + deltaX * 2.4 + normalizedX * 0.12, -1, 1);
    if (!this.pointer.down) {
      this.pointer.velocityX = nextX - this.pointer.x;
      this.pointer.velocityY = nextY - this.pointer.y;
      this.pointer.speed = Math.hypot(this.pointer.velocityX, this.pointer.velocityY);
      this.pointer.x = RuntimeMath.lerp(this.pointer.x, nextX, 0.24);
      this.pointer.y = RuntimeMath.lerp(this.pointer.y, nextY, 0.24);
      this.pointer.cssY = 1 - this.pointer.y;
      this.pointer.clientX = this.pointer.x * window.innerWidth;
      this.pointer.clientY = this.pointer.cssY * window.innerHeight;
      this.pointer.moved = true;
      this.pointer.overDom = false;
      this.state.set("pointer", [this.pointer.x, this.pointer.y]);
    }
  }

  onPointerMove(event) {
    const nextX = RuntimeMath.clamp(event.clientX / Math.max(1, window.innerWidth));
    const nextCssY = RuntimeMath.clamp(event.clientY / Math.max(1, window.innerHeight));
    const nextY = 1 - nextCssY;
    this.pointer.velocityX = nextX - this.pointer.x;
    this.pointer.velocityY = nextY - this.pointer.y;
    this.pointer.speed = Math.hypot(this.pointer.velocityX, this.pointer.velocityY);
    this.pointer.gestureX = RuntimeMath.clamp((this.pointer.gestureX || 0) * 0.44 + this.pointer.velocityX * 32, -1, 1);
    this.pointer.x = nextX;
    this.pointer.y = nextY;
    this.pointer.cssY = nextCssY;
    this.pointer.clientX = event.clientX;
    this.pointer.clientY = event.clientY;
    this.pointer.moved = true;
    const topElement = document.elementFromPoint(event.clientX, event.clientY);
    this.pointer.overDom = this.isDomControl(event.target) || this.isDomControl(topElement);
    this.state.set("pointer", [this.pointer.x, this.pointer.y]);
  }

  onWheel(event) {
    if (this.isDomControl(event.target)) return;
    if (this.currentHit?.id === "card10" && Math.abs(event.deltaY) > Math.max(1, Math.abs(event.deltaX) * 0.8) && !event.shiftKey) {
      window.VALEN_RUNTIME?.scrollChat?.("card10", event.deltaY > 0 ? 3 : -3);
      return;
    }
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.35
      ? event.deltaX
      : event.shiftKey
        ? event.deltaY
        : 0;
    if (Math.abs(horizontal) < 0.5) return;
    this.pointer.gestureX = RuntimeMath.clamp((this.pointer.gestureX || 0) * 0.72 + horizontal / 320, -1, 1);
    this.pointer.moved = true;
  }

  onClick(event) {
    if (!this.hoverMeshId || this.isDomControl(event.target)) return;
    this.activeMeshId = this.hoverMeshId;
    const target = this.currentHit || this.targets.find((candidate) => candidate.id === this.hoverMeshId) || null;
    this.clickTarget = target ? { ...target, zone: target.zone || null } : null;
    this.state.set("meshLabel", this.activeMeshId);
  }

  isDomControl(target) {
    return !!target?.closest?.("a,button,input,textarea,select,label,summary,.modal,.hero-copy,.section-heading,.runtime-float,.runtime-panel,.diagnostics,[data-no-gl-click]");
  }

  registerTarget(target) {
    this.targets.push(target);
  }

  update(camera, targets = [], stagePhase = null) {
    this.pointer.gestureX *= this.pointer.down ? 0.95 : 0.9;
    if (this.gyro.active && !this.pointer.down) {
      this.pointer.x = RuntimeMath.lerp(this.pointer.x, this.gyro.x, 0.12);
      this.pointer.y = RuntimeMath.lerp(this.pointer.y, this.gyro.y, 0.12);
      this.pointer.cssY = 1 - this.pointer.y;
      this.pointer.clientX = this.pointer.x * window.innerWidth;
      this.pointer.clientY = this.pointer.cssY * window.innerHeight;
      this.pointer.moved = true;
      this.pointer.overDom = false;
      this.state.set("pointer", [this.pointer.x, this.pointer.y]);
    }
    if (stagePhase?.activeObjectState) this.activeMeshId = stagePhase.activeObjectState;
    if (!this.pointer.moved || this.pointer.overDom) {
      this.hoverMeshId = null;
      this.hoverZoneId = null;
      this.currentHit = null;
      this.state.set("meshLabel", this.activeMeshId || "none");
      this.state.set("hoverLabel", "none");
      return null;
    }
    this.targets = targets
      .filter((target) => target.visible !== false)
      .sort((a, b) => {
        if (a.id === stagePhase?.activeObjectState && b.id !== stagePhase?.activeObjectState) return -1;
        if (b.id === stagePhase?.activeObjectState && a.id !== stagePhase?.activeObjectState) return 1;
        return (a.depth || 0) - (b.depth || 0);
      });
    let hit = this.targets.find((target) => {
      const padding = target.hitPadding || 0;
      return this.pointer.x >= target.rect.minX - padding &&
        this.pointer.x <= target.rect.maxX + padding &&
        this.pointer.y >= target.rect.minY - padding &&
        this.pointer.y <= target.rect.maxY + padding;
    });
    if (hit) hit = this.withZoneHit(hit, stagePhase);
    this.hoverMeshId = hit ? hit.id : null;
    this.hoverZoneId = hit?.zone?.id || null;
    this.currentHit = hit || null;
    this.state.set("meshLabel", this.hoverMeshId || this.activeMeshId || "none");
    this.state.set("hoverLabel", this.hoverZoneId ? `${this.hoverMeshId}:${this.hoverZoneId}` : this.hoverMeshId || "none");
    return hit;
  }

  withZoneHit(target, stagePhase) {
    if (target.id !== stagePhase?.activeObjectState || !target.interactionZones?.length) return target;
    const width = Math.max(0.001, target.rect.maxX - target.rect.minX);
    const height = Math.max(0.001, target.rect.maxY - target.rect.minY);
    const localX = RuntimeMath.clamp((this.pointer.x - target.rect.minX) / width);
    const localY = RuntimeMath.clamp((this.pointer.y - target.rect.minY) / height);
    const zone = target.interactionZones.find((candidate) => {
      const [x, y, w, h] = candidate.rect;
      return localX >= x && localX <= x + w && localY >= y && localY <= y + h;
    });
    return zone ? { ...target, zone } : target;
  }

  consumeClick() {
    const target = this.clickTarget;
    this.clickTarget = null;
    return target;
  }
}
