import { RuntimeAssetRegistry } from "../load-runtime-assets/resolve-runtime-asset-paths-and-preload.js";
import { AudioEngine } from "../play-runtime-audio/create-reactive-audio-engine.js";
import { applyRuntimeBootConfig } from "../own-runtime-state-and-dom/own-runtime-dom-and-state-mirror.js";
import { detectRuntimeCapabilities } from "../own-runtime-state-and-dom/detect-browser-runtime-capabilities.js";
import { RuntimeState } from "../own-runtime-state-and-dom/share-observable-runtime-state.js";
import { CORE_RUNTIME_MANIFEST } from "../describe-runtime-scenes/assemble-core-runtime-manifest.js";
import "../describe-runtime-scenes/compose-stage-scenes-and-objects.js";
import { RuntimeInteractionKernel } from "../read-runtime-inputs/translate-inputs-to-runtime-actions.js";
import { RuntimeSceneController } from "../select-runtime-scene/choose-scene-from-scroll-position.js";
import { RuntimeStageDirector } from "../choreograph-stage-state/choreograph-phases-foreground-and-orbit.js";
import { bindUI } from "../bind-local-workspace/bind-local-workspace.js";
import { installValenRuntimeGlobal } from "./install-valen-runtime-global.js";
import {
  finishRuntimeRendererBoot,
  startRuntimeFallback,
  startRuntimeRenderer
} from "./start-runtime-renderer.js";

export function createRuntimeState() {
  return new RuntimeState({
    phase: "idle",
    activePhaseId: "WorkspaceMode",
    scroll: 0,
    sceneIndex: 0,
    sceneProgress: 0,
    sceneId: "card1",
    activeCardNumber: "card1",
    activeObjectState: "card1",
    sceneLabel: "card1",
    progressLabel: "0%",
    quality: "native",
    renderer: "none",
    audio: "off",
    assetsLabel: `0/${CORE_RUNTIME_MANIFEST.assets.length}`,
    meshLabel: "none",
    waveLabel: "idle",
    activeLabel: "card1",
    hoverLabel: "none",
    transitionPhaseLabel: "idle",
    drawLabel: "none",
    pointer: [0.5, 0.5],
    activeZoneId: "none",
    pressedMeshId: "none",
    pressedZoneId: "none",
    runtimeInputValue: "",
    runtimeLastAction: "none"
  });
}

export async function bootRuntimeApp() {
  const state = createRuntimeState();
  let controller = null;
  try {
    state.set("phase", "detecting");
    const capabilities = detectRuntimeCapabilities();
    const params = new URLSearchParams(window.location.search);
    const forceFallback = params.get("runtime") === "fallback" || params.get("runtime") === "reading" || params.get("reading") === "1";
    document.body.classList.toggle("runtime-mobile", capabilities.mobileOptimized);
    state.set("dpr", capabilities.dpr.toFixed(2));
    state.set("audio", capabilities.audioContext ? "off" : "unsupported");

    state.set("phase", "manifest");
    controller = new RuntimeSceneController(CORE_RUNTIME_MANIFEST);
    const registry = new RuntimeAssetRegistry(CORE_RUNTIME_MANIFEST, state);
    const audio = new AudioEngine(state);
    const interaction = new RuntimeInteractionKernel(state, capabilities);
    const stageDirector = new RuntimeStageDirector(CORE_RUNTIME_MANIFEST, state);
    interaction.start();
    bindUI(state, audio, stageDirector);

    if (forceFallback) {
      const bodyClass = params.get("runtime") === "reading" || params.get("reading") === "1" ? "reading-mode" : "no-webgl";
      startRuntimeFallback({ state, controller, manifest: CORE_RUNTIME_MANIFEST, bodyClass });
      return state;
    }

    state.set("phase", "preloading");
    await registry.preload();

    state.set("phase", "renderer");
    const { renderer, bootDone } = startRuntimeRenderer({
      state,
      audio,
      manifest: CORE_RUNTIME_MANIFEST,
      controller,
      capabilities,
      registry,
      interaction,
      stageDirector
    });
    installValenRuntimeGlobal({ renderer, stageDirector, state });
    const bootStagePhase = applyRuntimeBootConfig(stageDirector, state, "wrapper");
    if (bootStagePhase?.activeObjectState) {
      window.setTimeout(() => window.VALEN_RUNTIME?.focusInput?.(bootStagePhase.activeObjectState, "boot-config"), 120);
    }
    if (state.get("phase") === "fallback") {
      startRuntimeFallback({ state, controller, manifest: CORE_RUNTIME_MANIFEST, bodyClass: "no-webgl" });
      return state;
    }

    finishRuntimeRendererBoot({ state, controller, manifest: CORE_RUNTIME_MANIFEST, capabilities, bootDone });
    return state;
  } catch (error) {
    console.warn("Core runtime fallback:", error);
    startRuntimeFallback({ state, controller, manifest: CORE_RUNTIME_MANIFEST, bodyClass: "no-webgl" });
    return state;
  }
}
