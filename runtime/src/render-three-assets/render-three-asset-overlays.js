import { importRuntimeModule } from "../load-runtime-assets/resolve-runtime-asset-paths-and-preload.js";
import { runtimeThreeEnvironmentMethods } from "./setup-three-environment-lights-and-haze.js";
import { runtimeThreeTemplateMethods } from "./load-three-card-templates-and-materials.js";
import { runtimeThreeUpdateMethods } from "./update-three-assets-each-frame.js";
export class RuntimeThreeAssetLayer {
  constructor(canvas, manifest, state, registry) {
    this.canvas = canvas;
    this.manifest = manifest;
    this.state = state;
    this.registry = registry;
    this.enabled = false;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.cards = new Map();
    this.assetTemplates = new Map();
    this.cardVisualMetrics = new Map();
    this.sculpture = null;
    this.materialProfiles = new Map();
    this.cardDisplayScale = 1;
    this.sculptureDisplayScale = 0.08;
    this.environmentTexture = null;
    this.environmentSource = "none";
    this.authoredEnvironmentLoaded = false;
    this.clockStart = performance.now();
    this.ambientLight = null;
    this.whiteLight = null;
    this.cyanLight = null;
    this.lightTarget = null;
    this.hazeField = [];
    this.renderSize = { width: 0, height: 0, dpr: 0 };
  }

  async start() {
    if (!this.canvas) return false;
    try {
      const [threeModule, loaderModule, exrModule] = await Promise.all([
        importRuntimeModule("three"),
        importRuntimeModule("three/addons/loaders/GLTFLoader.js"),
        importRuntimeModule("three/addons/loaders/EXRLoader.js").catch((error) => {
          console.warn("EXRLoader unavailable; runtime will use PNG/procedural environment fallback:", error);
          return { EXRLoader: null };
        })
      ]);
      this.THREE = threeModule;
      this.GLTFLoader = loaderModule.GLTFLoader;
      this.EXRLoader = exrModule.EXRLoader;
      this.installRenderer();
      this.authoredEnvironmentLoaded = await this.installAuthoredEnvironment();
      await this.loadAssets();
      this.enabled = true;
      document.body.classList.add("runtime-pbr-ready");
      this.state.set("renderer", `${this.state.get("renderer") || "WebGL"} + Three PBR${this.authoredEnvironmentLoaded ? " + HDRI" : ""}`);
      return true;
    } catch (error) {
      console.warn("Three PBR asset layer unavailable:", error);
      this.state.set("assetsLabel", "pbr-unavailable");
      return false;
    }
  }

  installRenderer() {
    const THREE = this.THREE;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping || THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = THREE.AgXToneMapping ? 1.08 : 1.19;
    if ("useLegacyLights" in this.renderer) this.renderer.useLegacyLights = false;
    if ("transmissionResolutionScale" in this.renderer) this.renderer.transmissionResolutionScale = 1;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x071019, 0.07);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 80);
    const lightField = this.createEnvironmentMap();
    this.setEnvironmentMap(lightField.environment, "procedural-canvas-fallback");
    this.installLights();
    this.installStageHaze();
  }























}

Object.assign(
  RuntimeThreeAssetLayer.prototype,
  runtimeThreeEnvironmentMethods,
  runtimeThreeTemplateMethods,
  runtimeThreeUpdateMethods
);
