import { resolveRuntimeAssetPath } from "../load-runtime-assets/resolve-runtime-asset-paths-and-preload.js";
import { TAU } from "../describe-runtime-scenes/configure-stage-layout-and-camera.js";

export const runtimeThreeEnvironmentMethods = {
  setEnvironmentMap(environment, source) {
    if (!environment || !this.scene) return;
    if (this.environmentTexture && this.environmentTexture !== environment) {
      this.environmentTexture.dispose?.();
    }
    this.environmentTexture = environment;
    this.environmentSource = source;
    this.scene.environment = environment;
    this.scene.background = null;
  },

  async installAuthoredEnvironment() {
    if (!this.renderer || !this.scene) return false;
    const exrLoaded = await this.installEnvironmentFromExr("./assets/valen-hdri/hdr.exr");
    if (exrLoaded) return true;
    return this.installEnvironmentFromImage("./assets/valen-hdri/hdr_high.png");
  },

  async installEnvironmentFromExr(sourcePath) {
    if (!this.EXRLoader) return false;
    const resolvedSourcePath = resolveRuntimeAssetPath(sourcePath);
    try {
      const texture = await new this.EXRLoader().loadAsync(resolvedSourcePath);
      texture.mapping = this.THREE.EquirectangularReflectionMapping;
      this.installPmremTexture(texture, `authored-exr:${resolvedSourcePath}`);
      return true;
    } catch (error) {
      console.warn("Authored EXR environment unavailable; trying PNG fallback:", error);
      return false;
    }
  },

  async installEnvironmentFromImage(sourcePath) {
    const resolvedSourcePath = resolveRuntimeAssetPath(sourcePath);
    try {
      const texture = await new this.THREE.TextureLoader().loadAsync(resolvedSourcePath);
      texture.mapping = this.THREE.EquirectangularReflectionMapping;
      texture.colorSpace = this.THREE.SRGBColorSpace;
      this.installPmremTexture(texture, `authored-png:${resolvedSourcePath}`);
      return true;
    } catch (error) {
      console.warn("Authored image environment unavailable; keeping procedural fallback:", error);
      return false;
    }
  },

  installPmremTexture(texture, source) {
    const pmrem = new this.THREE.PMREMGenerator(this.renderer);
    const environment = pmrem.fromEquirectangular(texture).texture;
    texture.dispose();
    pmrem.dispose();
    this.setEnvironmentMap(environment, source);
  },

  installLights() {
    const THREE = this.THREE;
    this.ambientLight = new THREE.HemisphereLight(0x8edfff, 0x020407, 0.14);
    this.scene.add(this.ambientLight);
    this.lightTarget = new THREE.Object3D();
    this.lightTarget.position.set(0, 0.04, -1.35);
    this.scene.add(this.lightTarget);
    this.whiteLight = new THREE.SpotLight(0xffffff, 18, 10, Math.PI / 8.8, 0.42, 1.55);
    this.whiteLight.position.set(-3.25, 2.9, -0.35);
    this.whiteLight.target = this.lightTarget;
    this.cyanLight = new THREE.SpotLight(0x78f4ff, 36, 11, Math.PI / 7.2, 0.42, 1.45);
    this.cyanLight.position.set(2.45, 2.95, -0.2);
    this.cyanLight.target = this.lightTarget;
    this.scene.add(this.whiteLight, this.cyanLight);
  },

  installStageHaze() {
    const THREE = this.THREE;
    const sprite = this.createHazeSprite();
    const layers = [
      { scale: [4.4, 2.9, 1], position: [0.0, 0.08, -1.95], opacity: 0.2, tint: [0.48, 0.82, 1.0] },
      { scale: [3.2, 2.2, 1], position: [0.55, -0.04, -1.62], opacity: 0.13, tint: [0.34, 0.72, 0.98] },
      { scale: [3.0, 2.0, 1], position: [-0.62, -0.08, -1.48], opacity: 0.12, tint: [0.64, 0.88, 1.0] }
    ];
    this.hazeField = layers.map((layer) => {
      const material = new THREE.SpriteMaterial({
        map: sprite,
        color: new THREE.Color(layer.tint[0], layer.tint[1], layer.tint[2]),
        transparent: true,
        opacity: layer.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const haze = new THREE.Sprite(material);
      haze.position.set(layer.position[0], layer.position[1], layer.position[2]);
      haze.scale.set(layer.scale[0], layer.scale[1], layer.scale[2]);
      haze.renderOrder = -3;
      haze.userData.basePosition = [...layer.position];
      haze.userData.baseScale = [...layer.scale];
      haze.userData.baseOpacity = layer.opacity;
      this.scene.add(haze);
      return haze;
    });
  },

  createHazeSprite() {
    const THREE = this.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, "rgba(214,248,255,0.62)");
    gradient.addColorStop(0.24, "rgba(118,214,255,0.28)");
    gradient.addColorStop(0.6, "rgba(44,114,160,0.08)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  },

  createEnvironmentMap() {
    const THREE = this.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#02050a");
    gradient.addColorStop(0.45, "#041725");
    gradient.addColorStop(1, "#010205");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const horizon = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.54, 0, canvas.width * 0.5, canvas.height * 0.54, canvas.width * 0.55);
    horizon.addColorStop(0, "rgba(150, 250, 255, 0.95)");
    horizon.addColorStop(0.12, "rgba(64, 190, 255, 0.32)");
    horizon.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 22; i += 1) {
      const x = (i * 167 + 91) % canvas.width;
      const width = 2 + (i % 5) * 1.2;
      const alpha = 0.24 + (i % 7) * 0.048;
      const stripe = ctx.createLinearGradient(x, 0, x + width, 0);
      stripe.addColorStop(0, "rgba(255,255,255,0)");
      stripe.addColorStop(0.5, `rgba(146, 244, 255, ${alpha})`);
      stripe.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = stripe;
      ctx.fillRect(x, 0, width, canvas.height);
    }

    for (let i = 0; i < 260; i += 1) {
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = (Math.sin(i * 78.233) * 24634.6345) % 1;
      const px = Math.abs(x) * canvas.width;
      const py = Math.abs(y) * canvas.height;
      const r = 0.8 + (i % 6) * 0.36;
      ctx.fillStyle = `rgba(220, 252, 255, ${0.14 + (i % 5) * 0.045})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, TAU);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromEquirectangular(texture).texture;
    texture.dispose();
    pmrem.dispose();
    return { environment: env };
  }
};
