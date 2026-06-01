import { RuntimeCameraRig } from "../fit-runtime-camera/fit-camera-to-runtime-stage.js";
import { RuntimeFirstSignalBootSequence } from "../show-boot-signal/show-first-signal-boot-sequence.js";
import { RuntimePanelLayer } from "../render-card-panels/render-runtime-card-panels.js";
import { RuntimeSculptureLayer } from "../render-center-sculpture/render-center-sculpture.js";
import { RuntimeThreeAssetLayer } from "../render-three-assets/render-three-asset-overlays.js";
import { RuntimeWaveField } from "../draw-runtime-effects/simulate-pointer-wave-texture.js";
export class CinematicRenderer {
  constructor(canvas, pbrCanvas, state, audio, manifest, controller, capabilities, registry, interaction, stageDirector) {
    this.canvas = canvas;
    this.pbrCanvas = pbrCanvas;
    this.state = state;
    this.audio = audio;
    this.manifest = manifest;
    this.controller = controller;
    this.capabilities = capabilities;
    this.registry = registry;
    this.interaction = interaction;
    this.stageDirector = stageDirector;
    this.gl = null;
    this.renderer = "none";
    this.dpr = capabilities.dpr;
    this.fps = 60;
    this.frame = 0;
    this.last = performance.now();
    this.quality = "native";
    this.cameraRig = new RuntimeCameraRig(manifest, state, capabilities);
    this.sculptureLayer = new RuntimeSculptureLayer(manifest, state, registry.get("center-sculpture-asset"));
    this.panelLayer = new RuntimePanelLayer(manifest, state, new Map([
      ["card-base-asset", registry.get("card-base-asset")],
      ["card-chat-asset", registry.get("card-chat-asset")],
      ["card-chat-second-stage-asset", registry.get("card-chat-second-stage-asset")],
      ["card-single-button-asset", registry.get("card-single-button-asset")],
      ["card-multi-button-asset", registry.get("card-multi-button-asset")]
    ]), capabilities);
    this.threeAssetLayer = new RuntimeThreeAssetLayer(pbrCanvas, manifest, state, registry);
    this.stagePhase = stageDirector.getState();
    this.firstSignalBoot = null;
    this.firstSignalBootDone = Promise.resolve(false);
    this.firstSignalPbrResolved = false;
    this.running = false;
    this.handleResize = null;
  }

  start() {
    this.gl = this.createContext();
    if (!this.gl) {
      this.state.set("renderer", "fallback");
      this.state.set("phase", "fallback");
      this.state.set("meshLabel", "disabled");
      this.state.set("waveLabel", "disabled");
      this.state.set("activeLabel", "disabled");
      this.state.set("hoverLabel", "disabled");
      document.body.classList.add("no-webgl");
      return;
    }
    this.running = true;
    this.state.set("renderer", this.renderer);
    this.waveField = new RuntimeWaveField(this.gl, this.state, this.capabilities);
    this.sculptureLayer.start(this.gl, this.cameraRig, this.interaction, this.waveField);
    this.panelLayer.start(this.gl, this.cameraRig, this.interaction, this.waveField);
    this.firstSignalBoot = new RuntimeFirstSignalBootSequence(this.state, this.capabilities, {
      minVisibleMs: this.capabilities.mobileOptimized ? 5400 : 6100,
      settleMs: this.capabilities.mobileOptimized ? 900 : 1600,
      settleFrames: this.capabilities.mobileOptimized ? 48 : 64,
      layer: {
        assetRegistry: this.registry
      }
    });
    this.firstSignalBoot.bindRegistryProgress({ start: 0.12, end: 0.58 });
    this.firstSignalBoot.start(this.gl, this.cameraRig, this.interaction, this.waveField);
    this.firstSignalBoot.setPhase("pbr-loading", 0.68);
    this.firstSignalBootDone = this.firstSignalBoot.done;
    this.threeAssetLayer.start().then((enabled) => {
      this.panelLayer.usePbrAssetBodies = enabled;
      if (enabled) this.panelLayer.setVisualPanelGeometries(this.threeAssetLayer.getCardVisualMetrics());
      this.firstSignalPbrResolved = true;
      this.firstSignalBoot?.markPbrReady(enabled);
    });
    this.resize();
    this.bindEvents();
    requestAnimationFrame((time) => this.render(time));
    return this.firstSignalBootDone;
  }

  createContext() {
    const options = { antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: "high-performance" };
    const webgl2 = this.capabilities.webgl2 ? this.canvas.getContext("webgl2", options) : null;
    if (webgl2) {
      this.renderer = "WebGL2";
      return webgl2;
    }
    const webgl1 = this.canvas.getContext("webgl", options) || this.canvas.getContext("experimental-webgl", options);
    if (webgl1) this.renderer = "WebGL1";
    return webgl1;
  }

  bindEvents() {
    this.handleResize = () => this.resize();
    window.addEventListener("resize", this.handleResize);
  }

  dispose() {
    this.running = false;
    if (this.handleResize) {
      window.removeEventListener("resize", this.handleResize);
      this.handleResize = null;
    }
    this.panelLayer?.dispose?.();
    this.threeAssetLayer?.dispose?.();
    this.sculptureLayer?.dispose?.();
    this.firstSignalBoot?.dispose?.();
  }

  resize() {
    const active = this.controller.getActiveScene().scene;
    const maxDpr = Math.min(this.manifest.performance.maxDpr, active.performance?.dprMax || this.manifest.performance.maxDpr);
    if (this.quality !== "adaptive") {
      this.dpr = Math.max(this.manifest.performance.minDpr, Math.min(window.devicePixelRatio || 1, maxDpr));
    }
    const width = Math.floor(window.innerWidth * this.dpr);
    const height = Math.floor(window.innerHeight * this.dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
    this.state.set("dpr", this.dpr.toFixed(2));
  }

  render(time) {
    if (!this.running) return;
    const delta = Math.max(1, time - this.last);
    this.last = time;
    this.frame += 1;
    this.fps += (1000 / delta - this.fps) * 0.05;
    this.adaptQuality();

    const bootVisible = Boolean(this.firstSignalBoot?.visible);
    const bootExitProgress = bootVisible ? this.firstSignalBoot.layer?.exit || 0 : 1;
    const bootCurtainFullyCoversRuntime = bootVisible && bootExitProgress < 0.1;
    const runHiddenRuntimeWork = !bootCurtainFullyCoversRuntime || this.frame % 3 === 0;
    const active = this.controller.getActiveScene();
    this.audio.update();
    this.stagePhase = this.stageDirector.update(active, delta);
    this.panelLayer.presentationTime = time;
    this.cameraRig.update(this.stagePhase, this.dpr);
    let hoverTarget = null;
    if (runHiddenRuntimeWork) {
      this.sculptureLayer.update(this.stagePhase, delta);
      this.panelLayer.update(this.stagePhase, delta);
      this.threeAssetLayer.update(this.stagePhase, this.cameraRig, this.panelLayer, this.sculptureLayer, this.dpr);
    }
    if (!bootCurtainFullyCoversRuntime) {
      hoverTarget = this.interaction.update(this.cameraRig, this.panelLayer.getHitTargets(), this.stagePhase);
      this.stageDirector.setHover(hoverTarget);
      this.stagePhase = this.stageDirector.getState();
      this.waveField.update(this.interaction.pointer, hoverTarget, this.stagePhase.materialFocus);
    }
    if (this.firstSignalBoot?.visible) {
      if (this.firstSignalPbrResolved) this.firstSignalBoot.markSceneFrameStable();
      this.firstSignalBoot.update(delta, this.stagePhase);
    }
    const clickTarget = this.interaction.consumeClick();
    if (clickTarget) this.panelLayer.handleClick(clickTarget);

    const renderRuntimeBehindBoot = !bootVisible || bootExitProgress >= 0.1;
    const overlayAlpha = this.threeAssetLayer?.enabled ? 0 : 1;
    this.gl.clearColor(0.018, 0.019, 0.03, overlayAlpha);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.disable(this.gl.BLEND);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LESS);
    this.gl.depthMask(true);
    if (renderRuntimeBehindBoot) {
      this.threeAssetLayer.render();
      if (!this.threeAssetLayer.enabled) {
        this.sculptureLayer.render(time);
      }
      this.gl.enable(this.gl.DEPTH_TEST);
      this.gl.depthFunc(this.gl.LESS);
      this.gl.depthMask(false);
      this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
      this.panelLayer.render(time, this.dpr);
    }
    if (bootVisible) {
      if (bootExitProgress < 0.12) {
        this.gl.clearColor(0.004, 0.005, 0.009, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
      } else {
        this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
      }
      this.firstSignalBoot.render(time, this.dpr);
    }

    if (this.frame % 20 === 0) {
      this.state.set("fps", Math.round(this.fps));
      this.state.set("quality", this.quality);
      this.state.set("assetsLabel", `${this.registry.ready}/${this.registry.total}`);
      this.state.set("meshLabel", `${this.panelLayer.geometry?.source || "card"}:${this.stagePhase.activeObjectState || "none"}`);
    }
    if (this.running) requestAnimationFrame((next) => this.render(next));
  }

  adaptQuality() {
    // MVP SHIPPING LOCK: adaptive DPR downgrade is intentionally disabled for launch.
    // Future GPU-quality policy belongs here and should include steady-state timing plus DPR recovery.
    return;
  }
}
