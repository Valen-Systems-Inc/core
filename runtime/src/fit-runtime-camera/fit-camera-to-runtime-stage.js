import { MOBILE_FIXED_STAGE_CAMERA, MOBILE_ROOMY_STAGE_CAMERA } from "../describe-runtime-scenes/configure-stage-layout-and-camera.js";
import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";
export class RuntimeCameraRig {
  constructor(manifest, state, capabilities = {}) {
    this.manifest = manifest;
    this.state = state;
    this.capabilities = capabilities;
    this.position = [0, 0, 4.8];
    this.lookAt = [0, 0, 0];
    this.fov = 42;
    this.aspect = 1;
    this.view = new Float32Array(16);
    this.projection = new Float32Array(16);
    this.viewProjection = new Float32Array(16);
  }

  update(stagePhase, dpr) {
    const scene = this.manifest.scenes.find((item) => item.id === stagePhase.activeCardNumber) || this.manifest.scenes[0];
    const base = scene.camera || this.manifest.scenes[0].camera;
    const focus = stagePhase.cameraTarget;
    const activeObject = this.manifest.runtimeObjectStates.find((object) => object.id === stagePhase.activeObjectState);
    const objectCompactFit = activeObject?.stage?.compactFit || null;
    const compactFit = this.capabilities.compactStageFit ? objectCompactFit || stagePhase.stageComposition?.compactFit || null : null;
    const compactCamera = compactFit?.camera || null;
    this.aspect = Math.max(0.1, window.innerWidth / Math.max(1, window.innerHeight));
    let targetPosition = [...(focus?.position || base.position)];
    let targetLookAt = [...(focus?.lookAt || base.lookAt)];
    let targetFov = focus?.fov || base.fov;
    const narrowViewport = RuntimeMath.clamp((this.aspect || 1) / 1.28, 0.34, 1);
    const mobileViewport = this.aspect < 0.82 || window.innerWidth < 820;
    if (mobileViewport && !compactFit?.preserveFocusCamera) {
      const phoneFit = RuntimeMath.clamp((820 - window.innerWidth) / 430, 0, 1);
      targetPosition = RuntimeMath.mixVec3(MOBILE_ROOMY_STAGE_CAMERA.position, MOBILE_FIXED_STAGE_CAMERA.position, phoneFit);
      targetLookAt = RuntimeMath.mixVec3(MOBILE_ROOMY_STAGE_CAMERA.lookAt, MOBILE_FIXED_STAGE_CAMERA.lookAt, phoneFit);
      targetFov = RuntimeMath.lerp(MOBILE_ROOMY_STAGE_CAMERA.fov, MOBILE_FIXED_STAGE_CAMERA.fov, phoneFit);
    } else {
      if (focus && narrowViewport < 0.86) {
        const fitEase = 1 - narrowViewport;
        targetPosition[2] += fitEase * (compactCamera?.retreatScale ?? 2.4);
        targetPosition[1] += fitEase * (compactCamera?.liftY ?? 0.06);
        targetFov += fitEase * (compactCamera?.fovScale ?? 8.5);
      }
      if (compactCamera) {
        targetPosition[0] += compactCamera.xBias ?? 0;
        targetPosition[1] += compactCamera.yBias ?? 0;
        targetPosition[2] += compactCamera.zBias ?? 0;
        targetLookAt[0] += compactCamera.lookAtXBias ?? 0;
        targetLookAt[1] += compactCamera.lookAtYBias ?? 0;
        targetLookAt[2] += compactCamera.lookAtZBias ?? 0;
        targetFov += compactCamera.fovBias ?? 0;
      }
    }
    const ease = stagePhase.transitionPhase === "present"
      ? 0.18
      : stagePhase.transitionPhase === "handoff"
        ? 0.16
        : stagePhase.transitionPhase === "preRoll"
          ? 0.12
          : 0.08;
    RuntimeMath.lerpVec3(this.position, this.position, targetPosition, ease);
    RuntimeMath.lerpVec3(this.lookAt, this.lookAt, targetLookAt, ease);
    this.fov = RuntimeMath.lerp(this.fov, targetFov || 42, ease);
    RuntimeMath.perspective(this.projection, this.fov, this.aspect);
    RuntimeMath.lookAt(this.view, this.position, this.lookAt);
    RuntimeMath.multiply(this.viewProjection, this.projection, this.view);
    this.state.set("dpr", Number(dpr).toFixed(2));
    return this;
  }
}
