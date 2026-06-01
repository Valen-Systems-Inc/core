import { resolveRuntimeAssetPath } from "../load-runtime-assets/resolve-runtime-asset-paths-and-preload.js";
import { RuntimeGlbLoader } from "../load-runtime-assets/load-and-normalize-glb-models.js";
import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";
const FIRST_SIGNAL_BOOT_FONT_STACK = "\"Space Grotesk\", \"Neue Haas Grotesk Display\", Arial, sans-serif";
const FIRST_SIGNAL_BOOT_WORD = "VALEN";
const FIRST_SIGNAL_BOOT_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const FIRST_SIGNAL_BOOT_COLUMNS = 26;
const FIRST_SIGNAL_BOOT_ROWS = 8;
const FIRST_SIGNAL_BOOT_BACKGROUND_ASSETS = {
  portrait: "./assets/valen-loading-background-portrait.glb",
  landscape: "./assets/valen-loading-background-landscape.glb"
};
const FIRST_SIGNAL_BOOT_BACKGROUND_IDS = {
  portrait: "first-signal-background-portrait",
  landscape: "first-signal-background-landscape"
};

export class RuntimeFirstSignalBootSequence {
  constructor(state, capabilities = {}, options = {}) {
    this.state = state;
    this.capabilities = capabilities;
    this.options = {
      minVisibleMs: options.minVisibleMs || 3400,
      settleMs: options.settleMs || 1050,
      settleFrames: options.settleFrames || 32,
      ...options
    };
    this.layer = new RuntimeFirstSignalLayer(state, capabilities, options.layer || {});
    this.startedAt = 0;
    this.displayPercent = 0;
    this.realPercent = 0;
    this.targetPercent = 0;
    this.phase = "idle";
    this.settleElapsed = 0;
    this.stableFrames = 0;
    this.pbrResolved = false;
    this.completeRequested = false;
    this.completeStarted = false;
    this.unbinders = [];
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  get visible() {
    return Boolean(this.layer?.visible);
  }

  start(gl, cameraRig, interaction, waveField) {
    this.startedAt = performance.now();
    this.layer.start(gl, cameraRig, interaction, waveField);
    this.setPhase("renderer", 0.56);
    this.state.set("firstSignalPhase", "renderer");
    this.state.set("firstSignalProgress", "56%");
  }

  bindRegistryProgress(range = {}) {
    if (!this.state?.bind) return () => {};
    const start = range.start ?? 0.12;
    const end = range.end ?? 0.58;
    const unbind = this.state.bind("assetsLabel", (label) => {
      const match = String(label || "").match(/(\d+)\s*\/\s*(\d+)/);
      if (!match) return;
      const ready = Number(match[1]);
      const total = Math.max(1, Number(match[2]));
      this.setProgress(RuntimeMath.lerp(start, end, RuntimeMath.clamp(ready / total)), "preloading");
    });
    this.unbinders.push(unbind);
    return unbind;
  }

  setPhase(label, floor = this.targetPercent) {
    this.phase = label;
    this.setProgress(Math.max(this.targetPercent, floor), label);
  }

  setProgress(value, label = this.phase) {
    this.phase = label;
    this.realPercent = RuntimeMath.clamp(value);
    this.targetPercent = Math.max(this.targetPercent, this.realPercent);
    this.state.set("firstSignalPhase", label);
    this.state.set("firstSignalProgress", `${Math.round(this.targetPercent * 100)}%`);
  }

  markPbrReady(enabled) {
    this.pbrResolved = true;
    this.setPhase(enabled ? "pbr-ready" : "pbr-fallback", enabled ? 0.9 : 0.84);
  }

  markSceneFrameStable() {
    if (!this.pbrResolved || this.completeRequested) return;
    this.stableFrames += 1;
    const frameProgress = RuntimeMath.clamp(this.stableFrames / Math.max(1, this.options.settleFrames));
    this.setProgress(RuntimeMath.lerp(this.targetPercent, 0.96, frameProgress * 0.12), "settling");
    if (this.stableFrames >= this.options.settleFrames) this.requestComplete();
  }

  requestComplete() {
    if (this.completeRequested) return;
    this.completeRequested = true;
    this.setPhase("exit-wave", 0.97);
  }

  update(dt, stageState = null) {
    if (!this.layer.visible) return;
    const smoothing = this.capabilities.reducedMotion ? 0.22 : 0.075;
    this.displayPercent = RuntimeMath.lerp(this.displayPercent, this.targetPercent, RuntimeMath.clamp(smoothing * Math.max(1, dt / 16.6667), 0.01, 0.48));
    this.layer.setProgress(this.displayPercent, this.realPercent);
    this.layer.update(dt, stageState, {
      phase: this.phase,
      realPercent: this.realPercent,
      displayPercent: this.displayPercent,
      completeRequested: this.completeRequested
    });

    if (!this.completeRequested || this.completeStarted) return;
    const elapsed = performance.now() - this.startedAt;
    const enoughTime = elapsed >= this.options.minVisibleMs;
    const enoughFrames = this.stableFrames >= this.options.settleFrames;
    if (!enoughTime || !enoughFrames) {
      this.settleElapsed = 0;
      return;
    }
    this.settleElapsed += dt;
    if (this.settleElapsed >= this.options.settleMs) {
      this.completeStarted = true;
      this.setPhase("ready", 1);
      this.layer.complete().then(() => {
        this.state.set("runtimeLastAction", "first-signal:boot-complete");
        this.dispose();
        this.resolveDone?.();
      });
    }
  }

  render(time, dpr) {
    this.layer.render(time, dpr);
  }

  dispose() {
    this.unbinders.forEach((unbind) => unbind?.());
    this.unbinders = [];
    this.layer.dispose();
  }
}

export class RuntimeFirstSignalLayer {
  constructor(state, capabilities = {}, options = {}) {
    const profile = this.pickBackgroundProfile(capabilities);
    this.state = state;
    this.capabilities = capabilities;
    this.options = {
      word: options.word || FIRST_SIGNAL_BOOT_WORD,
      fontStack: options.fontStack || FIRST_SIGNAL_BOOT_FONT_STACK,
      columns: options.columns || FIRST_SIGNAL_BOOT_COLUMNS,
      rows: options.rows || FIRST_SIGNAL_BOOT_ROWS,
      backgroundAssets: {
        ...FIRST_SIGNAL_BOOT_BACKGROUND_ASSETS,
        ...(options.backgroundAssets || {})
      },
      backgroundAssetIds: {
        ...FIRST_SIGNAL_BOOT_BACKGROUND_IDS,
        ...(options.backgroundAssetIds || {})
      },
      assetRegistry: options.assetRegistry || null,
      useAuthoredBackground: options.useAuthoredBackground ?? false,
      backgroundProfile: options.backgroundProfile || profile,
      textPosition: options.textPosition || (profile === "portrait" ? [0, 0.04, -0.44] : [0, 0.02, -0.46]),
      textRotation: options.textRotation || (profile === "portrait" ? [-0.1, 0.16, -0.01] : [-0.08, 0.12, -0.012]),
      textScale: options.textScale || (profile === "portrait" ? [1.46, 0.88, 1] : [2.1, 0.92, 1]),
      backgroundPosition: options.backgroundPosition || (profile === "portrait" ? [0, 0.0, -0.55] : [0, 0.02, -0.58]),
      backgroundRotation: options.backgroundRotation || (profile === "portrait" ? [-0.1, 0.16, -0.01] : [-0.08, 0.12, -0.012]),
      backgroundScale: options.backgroundScale || (profile === "portrait" ? [1.52, 2.18, 0.46] : [3.02, 1.48, 0.46]),
      bootCameraForward: options.bootCameraForward ?? (profile === "portrait" ? 0.42 : 0.34),
      bootCameraFovBias: options.bootCameraFovBias ?? -2.4,
      glyphRefreshMs: options.glyphRefreshMs || (capabilities.reducedMotion ? 180 : 76),
      letterStartMs: options.letterStartMs || 720,
      letterLockMs: options.letterLockMs || 620,
      canvasWidth: options.canvasWidth || 1024,
      canvasHeight: options.canvasHeight || 512
    };

    this.visible = true;
    this.progress = 0;
    this.realProgress = 0;
    this.visualRealProgress = 0;
    this.exit = 0;
    this.exitTarget = 0;
    this.visibleLetters = 0;
    this.lastTextRefresh = 0;
    this.lastTextProgressBucket = -1;
    this.textFrame = 0;
    this.startedAt = 0;
    this.exitResolve = null;
    this.reducedMotion = Boolean(capabilities.reducedMotion);
    this.loadedBackgroundSource = "procedural-fallback";

    this.gl = null;
    this.cameraRig = null;
    this.interaction = null;
    this.waveField = null;
    this.backgroundProgram = null;
    this.textProgram = null;
    this.backgroundGeometry = null;
    this.textGeometry = null;
    this.backgroundVertexBuffer = null;
    this.backgroundIndexBuffer = null;
    this.textVertexBuffer = null;
    this.textIndexBuffer = null;
    this.textCanvas = null;
    this.textContext = null;
    this.textTexture = null;
    this.textTextureDirty = true;
    this.backgroundLocations = null;
    this.textLocations = null;
    this.backgroundMatrix = new Float32Array(16);
    this.textMatrix = new Float32Array(16);
    this.bootView = new Float32Array(16);
    this.bootProjection = new Float32Array(16);
    this.bootViewProjection = new Float32Array(16);
    this.textGrid = new Array(this.options.columns * this.options.rows).fill(" ");
  }

  pickBackgroundProfile(capabilities) {
    if (capabilities.mobileOptimized) return "portrait";
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px), (orientation: portrait)").matches) {
      return "portrait";
    }
    return "landscape";
  }

  start(gl, cameraRig, interaction, waveField) {
    this.gl = gl;
    this.cameraRig = cameraRig;
    this.interaction = interaction;
    this.waveField = waveField;
    this.backgroundProgram = this.createProgram(firstSignalBackgroundVertexShader, firstSignalBackgroundFragmentShader);
    this.textProgram = this.createProgram(firstSignalTextVertexShader, firstSignalTextFragmentShader);
    this.backgroundLocations = this.getBackgroundLocations();
    this.textLocations = this.getTextLocations();
    this.backgroundGeometry = this.createFallbackBackgroundGeometry();
    this.textGeometry = this.createTextPlaneGeometry();
    this.createTextCanvas();
    this.uploadBackgroundGeometry();
    this.uploadTextGeometry();
    this.startedAt = performance.now();
    this.lastTextRefresh = 0;
    this.rollTextGrid(true);
    this.drawTextTexture();
    this.loadBackgroundGeometry();
  }

  setProgress(displayPercent, realPercent = displayPercent) {
    this.progress = RuntimeMath.clamp(displayPercent);
    this.realProgress = RuntimeMath.clamp(realPercent);
  }

  complete() {
    this.exitTarget = 1;
    return new Promise((resolve) => {
      this.exitResolve = resolve;
    });
  }

  update(dt, stageState = null, loadingState = {}) {
    if (!this.visible || !this.gl) return;
    const now = performance.now();
    const exitEase = RuntimeMath.clamp((this.reducedMotion ? 0.16 : 0.052) * Math.max(1, dt / 16.6667), 0.01, 0.42);
    this.exit = RuntimeMath.lerp(this.exit, this.exitTarget, exitEase);
    const progressEase = RuntimeMath.clamp((this.reducedMotion ? 0.18 : 0.055) * Math.max(1, dt / 16.6667), 0.01, 0.34);
    this.visualRealProgress = RuntimeMath.lerp(this.visualRealProgress, this.realProgress, progressEase);

    const elapsed = now - this.startedAt;
    const nextLetters = this.reducedMotion
      ? this.options.word.length
      : this.getLockedLetterCount(elapsed);
    const refreshInterval = this.options.glyphRefreshMs;
    const wordLocked = nextLetters >= this.options.word.length;
    const progressBucket = Math.round(Math.max(this.progress, this.visualRealProgress) * 100);
    const refreshDue = now - this.lastTextRefresh >= refreshInterval;
    const exitRefreshDue = this.exitTarget > 0 && now - this.lastTextRefresh >= Math.max(180, refreshInterval);
    const needsRefresh = nextLetters !== this.visibleLetters
      || (!wordLocked && refreshDue)
      || (wordLocked && exitRefreshDue && progressBucket !== this.lastTextProgressBucket);
    if (needsRefresh) {
      this.visibleLetters = nextLetters;
      this.rollTextGrid(nextLetters >= this.options.word.length);
      this.drawTextTexture();
      this.lastTextRefresh = now;
      this.lastTextProgressBucket = progressBucket;
    }

    if (this.exitResolve && this.exit > 0.992) {
      const resolve = this.exitResolve;
      this.visible = false;
      resolve();
    }
  }

  getLockedLetterCount(elapsedMs) {
    if (elapsedMs < this.options.letterStartMs) return 0;
    const lockIndex = Math.floor((elapsedMs - this.options.letterStartMs) / Math.max(1, this.options.letterLockMs));
    return Math.min(this.options.word.length, Math.max(0, lockIndex + 1));
  }

  render(time, dpr) {
    if (!this.visible || !this.gl || !this.backgroundProgram || !this.textProgram) return;
    this.updateBootViewProjection();
    this.renderBackground(time);
    this.renderTextPlane(time);
  }

  updateBootViewProjection() {
    const cameraPosition = this.cameraRig?.position || [0, 0, 4.8];
    const cameraLookAt = this.cameraRig?.lookAt || [0, 0, 0];
    const position = [...cameraPosition];
    const lookAt = [...cameraLookAt];
    const dx = lookAt[0] - position[0];
    const dy = lookAt[1] - position[1];
    const dz = lookAt[2] - position[2];
    const length = Math.hypot(dx, dy, dz) || 1;
    const forward = this.options.bootCameraForward;
    position[0] += (dx / length) * forward;
    position[1] += (dy / length) * forward;
    position[2] += (dz / length) * forward;
    const fov = Math.max(24, (this.cameraRig?.fov || 42) + this.options.bootCameraFovBias);
    const aspect = this.cameraRig?.aspect || Math.max(0.1, window.innerWidth / Math.max(1, window.innerHeight));
    RuntimeMath.perspective(this.bootProjection, fov, aspect);
    RuntimeMath.lookAt(this.bootView, position, lookAt);
    RuntimeMath.multiply(this.bootViewProjection, this.bootProjection, this.bootView);
  }

  async loadBackgroundGeometry() {
    if (!this.options.useAuthoredBackground) {
      this.loadedBackgroundSource = "procedural-runtime-plate";
      this.state.set("firstSignalBackground", `${this.options.backgroundProfile}:procedural-runtime-plate`);
      return;
    }

    const profile = this.options.backgroundProfile;
    const assetId = this.options.backgroundAssetIds[profile];
    const registryGeometry = this.options.assetRegistry?.get?.(assetId);
    if (registryGeometry?.positions?.length) {
      this.backgroundGeometry = this.createBackgroundGeometryFromAsset(registryGeometry);
      this.uploadBackgroundGeometry();
      this.loadedBackgroundSource = assetId;
      this.state.set("firstSignalBackground", `${profile}:${assetId}`);
      return;
    }

    const source = resolveRuntimeAssetPath(this.options.backgroundAssets[profile]);
    if (!source || typeof fetch === "undefined") return;
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const buffer = await response.arrayBuffer();
      const asset = RuntimeGlbLoader.parse(buffer, { id: `first-signal-${profile}`, coordinateFrame: "native" });
      this.backgroundGeometry = this.createBackgroundGeometryFromAsset(asset);
      this.uploadBackgroundGeometry();
      this.loadedBackgroundSource = source;
      this.state.set("firstSignalBackground", `${profile}:${source}`);
    } catch (error) {
      console.warn("[Valen runtime] First Signal background GLB unavailable; keeping procedural fallback", error);
      this.state.set("firstSignalBackground", "procedural-fallback");
    }
  }

  renderBackground(time) {
    const gl = this.gl;
    gl.useProgram(this.backgroundProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.backgroundVertexBuffer);
    gl.enableVertexAttribArray(this.backgroundLocations.position);
    gl.vertexAttribPointer(this.backgroundLocations.position, 3, gl.FLOAT, false, this.backgroundGeometry.stride, 0);
    gl.enableVertexAttribArray(this.backgroundLocations.normal);
    gl.vertexAttribPointer(this.backgroundLocations.normal, 3, gl.FLOAT, false, this.backgroundGeometry.stride, 12);
    gl.enableVertexAttribArray(this.backgroundLocations.uv);
    gl.vertexAttribPointer(this.backgroundLocations.uv, 2, gl.FLOAT, false, this.backgroundGeometry.stride, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.backgroundIndexBuffer);

    RuntimeMath.compose(this.backgroundMatrix, this.options.backgroundPosition, this.options.backgroundRotation, this.options.backgroundScale);
    gl.uniformMatrix4fv(this.backgroundLocations.model, false, this.backgroundMatrix);
    gl.uniformMatrix4fv(this.backgroundLocations.viewProjection, false, this.bootViewProjection);
    gl.uniform1f(this.backgroundLocations.time, time * 0.001);
    gl.uniform1f(this.backgroundLocations.progress, this.progress);
    gl.uniform1f(this.backgroundLocations.realProgress, this.visualRealProgress);
    gl.uniform1f(this.backgroundLocations.exit, this.exit);
    gl.uniform1f(this.backgroundLocations.waveEnergy, this.waveField?.energy || 0);
    gl.uniform1f(this.backgroundLocations.reducedMotion, this.reducedMotion ? 1 : 0);
    gl.uniform2f(this.backgroundLocations.pointer, this.interaction.pointer.x, this.interaction.pointer.y);
    gl.uniform1f(this.backgroundLocations.profile, this.options.backgroundProfile === "portrait" ? 1 : 0);

    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, this.backgroundGeometry.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  renderTextPlane(time) {
    const gl = this.gl;
    if (this.textTextureDirty) this.uploadTextTexture();
    gl.useProgram(this.textProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textVertexBuffer);
    gl.enableVertexAttribArray(this.textLocations.position);
    gl.vertexAttribPointer(this.textLocations.position, 3, gl.FLOAT, false, this.textGeometry.stride, 0);
    gl.enableVertexAttribArray(this.textLocations.uv);
    gl.vertexAttribPointer(this.textLocations.uv, 2, gl.FLOAT, false, this.textGeometry.stride, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.textIndexBuffer);

    RuntimeMath.compose(this.textMatrix, this.options.textPosition, this.options.textRotation, this.options.textScale);
    gl.uniformMatrix4fv(this.textLocations.model, false, this.textMatrix);
    gl.uniformMatrix4fv(this.textLocations.viewProjection, false, this.bootViewProjection);
    gl.uniform1f(this.textLocations.time, time * 0.001);
    gl.uniform1f(this.textLocations.progress, this.progress);
    gl.uniform1f(this.textLocations.realProgress, this.visualRealProgress);
    gl.uniform1f(this.textLocations.exit, this.exit);
    gl.uniform1f(this.textLocations.waveEnergy, this.waveField?.energy || 0);
    gl.uniform1f(this.textLocations.reducedMotion, this.reducedMotion ? 1 : 0);
    gl.uniform2f(this.textLocations.pointer, this.interaction.pointer.x, this.interaction.pointer.y);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
    gl.uniform1i(this.textLocations.map, 0);

    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, this.textGeometry.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.LESS);
  }

  getBackgroundLocations() {
    const gl = this.gl;
    return {
      position: gl.getAttribLocation(this.backgroundProgram, "aPosition"),
      normal: gl.getAttribLocation(this.backgroundProgram, "aNormal"),
      uv: gl.getAttribLocation(this.backgroundProgram, "aUv"),
      model: gl.getUniformLocation(this.backgroundProgram, "uModel"),
      viewProjection: gl.getUniformLocation(this.backgroundProgram, "uViewProjection"),
      time: gl.getUniformLocation(this.backgroundProgram, "uTime"),
      progress: gl.getUniformLocation(this.backgroundProgram, "uProgress"),
      realProgress: gl.getUniformLocation(this.backgroundProgram, "uRealProgress"),
      exit: gl.getUniformLocation(this.backgroundProgram, "uExit"),
      waveEnergy: gl.getUniformLocation(this.backgroundProgram, "uWaveEnergy"),
      reducedMotion: gl.getUniformLocation(this.backgroundProgram, "uReducedMotion"),
      pointer: gl.getUniformLocation(this.backgroundProgram, "uPointer"),
      profile: gl.getUniformLocation(this.backgroundProgram, "uProfile")
    };
  }

  getTextLocations() {
    const gl = this.gl;
    return {
      position: gl.getAttribLocation(this.textProgram, "aPosition"),
      uv: gl.getAttribLocation(this.textProgram, "aUv"),
      model: gl.getUniformLocation(this.textProgram, "uModel"),
      viewProjection: gl.getUniformLocation(this.textProgram, "uViewProjection"),
      map: gl.getUniformLocation(this.textProgram, "uTextMap"),
      time: gl.getUniformLocation(this.textProgram, "uTime"),
      progress: gl.getUniformLocation(this.textProgram, "uProgress"),
      realProgress: gl.getUniformLocation(this.textProgram, "uRealProgress"),
      exit: gl.getUniformLocation(this.textProgram, "uExit"),
      waveEnergy: gl.getUniformLocation(this.textProgram, "uWaveEnergy"),
      reducedMotion: gl.getUniformLocation(this.textProgram, "uReducedMotion"),
      pointer: gl.getUniformLocation(this.textProgram, "uPointer")
    };
  }

  createFallbackBackgroundGeometry() {
    const segmentsX = 72;
    const segmentsY = 42;
    const vertices = [];
    const indices = [];
    for (let y = 0; y <= segmentsY; y += 1) {
      for (let x = 0; x <= segmentsX; x += 1) {
        const u = x / segmentsX;
        const v = y / segmentsY;
        vertices.push((u - 0.5) * 2, (v - 0.5) * 2, 0, 0, 0, 1, u, v);
      }
    }
    for (let y = 0; y < segmentsY; y += 1) {
      for (let x = 0; x < segmentsX; x += 1) {
        const index = y * (segmentsX + 1) + x;
        indices.push(index, index + 1, index + segmentsX + 1, index + 1, index + segmentsX + 2, index + segmentsX + 1);
      }
    }
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      stride: 8 * 4
    };
  }

  createBackgroundGeometryFromAsset(asset) {
    const vertexCount = Math.min(65535, Math.floor((asset.positions || []).length / 3));
    if (!vertexCount || !asset.indices?.length) return this.createFallbackBackgroundGeometry();
    const vertices = new Float32Array(vertexCount * 8);
    for (let index = 0; index < vertexCount; index += 1) {
      const px = asset.positions[index * 3 + 0] || 0;
      const py = asset.positions[index * 3 + 1] || 0;
      const pz = asset.positions[index * 3 + 2] || 0;
      const nx = asset.normals?.[index * 3 + 0] ?? 0;
      const ny = asset.normals?.[index * 3 + 1] ?? 0;
      const nz = asset.normals?.[index * 3 + 2] ?? 1;
      vertices[index * 8 + 0] = py;
      vertices[index * 8 + 1] = pz;
      vertices[index * 8 + 2] = px * 0.46;
      vertices[index * 8 + 3] = ny;
      vertices[index * 8 + 4] = nz;
      vertices[index * 8 + 5] = nx;
      vertices[index * 8 + 6] = asset.uvs?.[index * 2 + 0] ?? (py * 0.5 + 0.5);
      vertices[index * 8 + 7] = asset.uvs?.[index * 2 + 1] ?? (pz * 0.5 + 0.5);
    }
    return {
      vertices,
      indices: new Uint16Array(asset.indices.slice(0, 65535)),
      stride: 8 * 4
    };
  }

  createTextPlaneGeometry() {
    return {
      vertices: new Float32Array([
        -1, -0.5, 0, 0, 0,
        1, -0.5, 0, 1, 0,
        1, 0.5, 0, 1, 1,
        -1, 0.5, 0, 0, 1
      ]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      stride: 5 * 4
    };
  }

  uploadBackgroundGeometry() {
    const gl = this.gl;
    if (!this.backgroundVertexBuffer) this.backgroundVertexBuffer = gl.createBuffer();
    if (!this.backgroundIndexBuffer) this.backgroundIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.backgroundVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.backgroundGeometry.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.backgroundIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.backgroundGeometry.indices, gl.STATIC_DRAW);
  }

  uploadTextGeometry() {
    const gl = this.gl;
    this.textVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.textGeometry.vertices, gl.STATIC_DRAW);
    this.textIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.textIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.textGeometry.indices, gl.STATIC_DRAW);
  }

  createTextCanvas() {
    this.textCanvas = document.createElement("canvas");
    this.textCanvas.width = this.options.canvasWidth;
    this.textCanvas.height = this.options.canvasHeight;
    this.textContext = this.textCanvas.getContext("2d");
    this.textTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textTexture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.textCanvas);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  rollTextGrid(force = false) {
    this.textFrame += 1;
    for (let row = 0; row < this.options.rows; row += 1) {
      for (let column = 0; column < this.options.columns; column += 1) {
        const index = row * this.options.columns + column;
        const n = this.hash(column * 19.13 + row * 37.31 + this.textFrame * 2.91);
        this.textGrid[index] = n > 0.18 ? FIRST_SIGNAL_BOOT_GLYPHS[Math.floor(n * FIRST_SIGNAL_BOOT_GLYPHS.length) % FIRST_SIGNAL_BOOT_GLYPHS.length] : " ";
      }
    }
  }

  drawTextTexture() {
    const ctx = this.textContext;
    if (!ctx) return;
    const width = this.textCanvas.width;
    const height = this.textCanvas.height;
    const cellW = width / this.options.columns;
    const cellH = height / this.options.rows;
    const wordRow = Math.floor(this.options.rows / 2);
    const wordStart = Math.floor((this.options.columns - this.options.word.length) / 2);
    const now = performance.now() * 0.001;
    const completed = this.visibleLetters >= this.options.word.length;
    const blink = completed ? 0.64 + Math.sin(now * 5.8) * 0.24 : 1;

    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(116, 244, 210, 0.08)";
    ctx.shadowBlur = 8;
    ctx.font = `620 ${Math.round(cellH * 0.32)}px ${this.options.fontStack}`;
    for (let row = 0; row < this.options.rows; row += 1) {
      for (let column = 0; column < this.options.columns; column += 1) {
        const wordIndex = row === wordRow ? column - wordStart : -1;
        if (wordIndex >= 0 && wordIndex < this.options.word.length) continue;
        const glyph = this.textGrid[row * this.options.columns + column];
        const fade = 0.026 + this.hash(column * 7.7 + row * 11.3 + this.textFrame) * 0.058;
        ctx.fillStyle = `rgba(222, 230, 226, ${fade.toFixed(3)})`;
        ctx.fillText(glyph, (column + 0.5) * cellW, (row + 0.52) * cellH);
      }
    }

    ctx.shadowColor = "rgba(116, 244, 210, 0.2)";
    ctx.shadowBlur = 18;
    ctx.font = `900 ${Math.round(cellH * 0.72)}px ${this.options.fontStack}`;
    for (let index = 0; index < this.options.word.length; index += 1) {
      const column = wordStart + index;
      const slotRoll = this.hash(index * 41.3 + this.textFrame * 7.1 + Math.floor(now * 28) * 3.9);
      const letter = index < this.visibleLetters
        ? this.options.word[index]
        : FIRST_SIGNAL_BOOT_GLYPHS[Math.floor(slotRoll * FIRST_SIGNAL_BOOT_GLYPHS.length) % FIRST_SIGNAL_BOOT_GLYPHS.length];
      const isLocked = index < this.visibleLetters;
      const alpha = isLocked ? blink * 0.9 : 0.15;
      ctx.fillStyle = isLocked ? `rgba(244, 244, 236, ${alpha.toFixed(3)})` : "rgba(218, 222, 220, 0.14)";
      ctx.strokeStyle = `rgba(116, 244, 210, ${(isLocked ? 0.16 : 0.07).toFixed(3)})`;
      ctx.lineWidth = isLocked ? 1.8 : 1;
      ctx.fillText(letter, (column + 0.5) * cellW, (wordRow + 0.52) * cellH);
      ctx.strokeText(letter, (column + 0.5) * cellW, (wordRow + 0.52) * cellH);
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(116, 244, 210, 0.22)";
    ctx.font = `700 ${Math.round(cellH * 0.12)}px ${this.options.fontStack}`;
    ctx.fillText(String(Math.round(Math.max(this.progress, this.visualRealProgress) * 100)).padStart(2, "0"), width * 0.94, height * 0.86);
    this.textTextureDirty = true;
  }

  uploadTextTexture() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.textTextureDirty = false;
  }

  hash(value) {
    return Math.abs(Math.sin(value * 12.9898) * 43758.5453) % 1;
  }

  createProgram(vertexSource, fragmentSource) {
    const gl = this.gl;
    const program = gl.createProgram();
    const vertex = this.compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = this.compile(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Could not link first signal shader program");
    }
    return program;
  }

  compile(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Could not compile first signal shader");
    }
    return shader;
  }

  dispose() {
    if (!this.gl) return;
    if (this.backgroundVertexBuffer) this.gl.deleteBuffer(this.backgroundVertexBuffer);
    if (this.backgroundIndexBuffer) this.gl.deleteBuffer(this.backgroundIndexBuffer);
    if (this.textVertexBuffer) this.gl.deleteBuffer(this.textVertexBuffer);
    if (this.textIndexBuffer) this.gl.deleteBuffer(this.textIndexBuffer);
    if (this.textTexture) this.gl.deleteTexture(this.textTexture);
    if (this.backgroundProgram) this.gl.deleteProgram(this.backgroundProgram);
    if (this.textProgram) this.gl.deleteProgram(this.textProgram);
    this.backgroundVertexBuffer = null;
    this.backgroundIndexBuffer = null;
    this.textVertexBuffer = null;
    this.textIndexBuffer = null;
    this.textTexture = null;
    this.backgroundProgram = null;
    this.textProgram = null;
    this.visible = false;
  }
}

const firstSignalBackgroundVertexShader = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;

uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform float uTime;
uniform float uProgress;
uniform float uRealProgress;
uniform float uExit;
uniform float uWaveEnergy;
uniform float uReducedMotion;
uniform vec2 uPointer;
uniform float uProfile;

varying vec2 vUv;
varying vec3 vNormal;
varying float vRipple;
varying float vExitRing;

void main() {
  vec3 local = aPosition;
  vec2 p = local.xy;
  float motion = 1.0 - clamp(uReducedMotion, 0.0, 1.0);
  float r = length(p * vec2(mix(1.05, 0.82, uProfile), mix(0.82, 1.06, uProfile)));
  float dropRadius = fract(uTime * 0.12 + uRealProgress * 0.58);
  float drop = exp(-pow((r - dropRadius * 1.2) * 8.2, 2.0));
  float ripples = sin(r * 38.0 - uTime * 3.2 - uProgress * 5.2) * exp(-r * 1.95);
  float pointerWake = 1.0 - smoothstep(0.0, 0.78, distance((uPointer - 0.5) * vec2(1.8, 1.2), p * 0.42));
  float exitPulse = smoothstep(0.02, 0.18, uExit) * (1.0 - smoothstep(0.82, 1.0, uExit));
  float exitRadius = uExit * 1.56;
  float exitRing = exp(-pow((r - exitRadius) * 12.0, 2.0)) * exitPulse;
  float wave = (drop * 0.062 + ripples * 0.018 + pointerWake * 0.014 + uWaveEnergy * 0.024 + exitRing * 0.18) * motion;
  local.z += wave;
  local.z -= smoothstep(0.68, 1.0, uExit) * 0.2;
  local.xy *= 0.988 + drop * 0.01 + exitRing * 0.04 + smoothstep(0.22, 1.0, uExit) * 0.018;

  vUv = aUv;
  vNormal = normalize(aNormal + vec3(0.0, 0.0, wave * 1.5));
  vRipple = drop * 0.72 + abs(ripples) * 0.22 + pointerWake * 0.1;
  vExitRing = exitRing;
  gl_Position = uViewProjection * uModel * vec4(local, 1.0);
}
`;

const firstSignalBackgroundFragmentShader = `
precision highp float;

uniform float uTime;
uniform float uProgress;
uniform float uRealProgress;
uniform float uExit;
uniform float uWaveEnergy;
uniform float uReducedMotion;

varying vec2 vUv;
varying vec3 vNormal;
varying float vRipple;
varying float vExitRing;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float lineBand(float value, float at, float width) {
  return 1.0 - smoothstep(width, width * 2.2, abs(value - at));
}

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float motion = 1.0 - clamp(uReducedMotion, 0.0, 1.0);
  float t = uTime * (0.2 + motion * 0.24);
  float r = length(c * vec2(1.0, 1.38));
  float angle = atan(c.y, c.x);
  float stageMask = smoothstep(0.78, 0.12, r);
  float waterLine = lineBand(fract(r * 3.2 - t * 0.24 + uProgress * 0.9), 0.5, 0.026);
  float ring = lineBand(r, 0.22 + sin(t * 0.52) * 0.012, 0.006) + lineBand(r, 0.38 + cos(t * 0.38) * 0.008, 0.004);
  float shockPulse = smoothstep(0.05, 0.16, uExit) * (1.0 - smoothstep(0.96, 1.0, uExit));
  float shockRing = lineBand(r, 0.14 + uExit * 0.58, 0.03) * shockPulse;
  float bar = step(0.9, hash(vec2(floor(uv.x * 18.0), floor(uv.y * 12.0 + t * 8.0)))) * smoothstep(0.14, 0.82, uProgress) * 0.18;
  float scan = lineBand(fract(uv.y * 13.0 + t * 0.42), 0.5, 0.012) * smoothstep(0.0, 0.05, max(uProgress, uRealProgress) - uv.x) * 0.26;
  float lighting = clamp(dot(normalize(vNormal), normalize(vec3(-0.22, 0.48, 0.86))) * 0.5 + 0.5, 0.0, 1.0);
  float exitFade = 1.0 - smoothstep(0.42, 1.0, uExit);

  vec3 mint = vec3(0.45, 0.96, 0.82);
  vec3 blue = vec3(0.47, 0.72, 1.0);
  vec3 warm = vec3(0.96, 0.92, 0.84);
  vec3 color = mix(mint, blue, smoothstep(-1.0, 1.0, sin(angle + t)));
  color = mix(color, warm, ring * 0.18);
  color += mix(blue, warm, 0.42) * shockRing * 0.58;
  color += mix(warm, mint, 0.68) * vExitRing * 0.82;
  color *= 0.052 + lighting * 0.14 + vRipple * 0.2 + waterLine * 0.095 + bar * 0.055 + scan * 0.07 + shockRing * 0.36 + uWaveEnergy * 0.07 + vExitRing * 0.42;

  float alpha = stageMask * exitFade * (0.13 + lighting * 0.12 + vRipple * 0.16 + ring * 0.12 + waterLine * 0.07 + bar * 0.035 + scan * 0.04 + shockRing * 0.3 + vExitRing * 0.48);
  alpha *= 0.24 + smoothstep(0.02, 0.42, uProgress) * 0.76;
  if (alpha < 0.006) discard;
  gl_FragColor = vec4(color, min(alpha, 0.52));
}
`;

const firstSignalTextVertexShader = `
attribute vec3 aPosition;
attribute vec2 aUv;

uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform float uTime;
uniform float uProgress;
uniform float uRealProgress;
uniform float uExit;
uniform float uWaveEnergy;
uniform float uReducedMotion;
uniform vec2 uPointer;

varying vec2 vUv;
varying float vRipple;
varying float vWake;
varying float vExitRing;

void main() {
  vec3 local = aPosition;
  vec2 c = local.xy;
  float motion = 1.0 - clamp(uReducedMotion, 0.0, 1.0);
  float r = length(c * vec2(0.82, 1.36));
  float drop = sin(r * 34.0 - uTime * 2.8 - uProgress * 4.4) * exp(-r * 1.45);
  float exitPulse = smoothstep(0.02, 0.18, uExit) * (1.0 - smoothstep(0.82, 1.0, uExit));
  float exitRing = exp(-pow((r - uExit * 1.46) * 12.0, 2.0)) * exitPulse;
  float reveal = smoothstep(0.0, 0.32, max(uProgress, uRealProgress));
  local.z -= r * r * 0.12;
  local.z += (drop * 0.018 + exitRing * 0.14) * motion;
  local.x += (uPointer.x - 0.5) * 0.018 * motion;
  local.y += (uPointer.y - 0.5) * -0.014 * motion;
  local.xy *= 0.94 + reveal * 0.06 + exitRing * 0.035 - smoothstep(0.72, 1.0, uExit) * 0.08;

  vUv = aUv;
  vRipple = abs(drop);
  vWake = reveal;
  vExitRing = exitRing;
  gl_Position = uViewProjection * uModel * vec4(local, 1.0);
}
`;

const firstSignalTextFragmentShader = `
precision highp float;

uniform sampler2D uTextMap;
uniform float uTime;
uniform float uProgress;
uniform float uRealProgress;
uniform float uExit;
uniform float uWaveEnergy;
uniform float uReducedMotion;

varying vec2 vUv;
varying float vRipple;
varying float vWake;
varying float vExitRing;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  float motion = 1.0 - clamp(uReducedMotion, 0.0, 1.0);
  float n = hash(floor(uv * vec2(64.0, 32.0) + uTime * 6.0));
  uv.x += sin(uv.y * 18.0 + uTime * 0.56) * 0.001 * motion;
  uv.y += sin(uv.x * 14.0 - uTime * 0.44) * 0.0007 * motion;
  vec4 copy = texture2D(uTextMap, uv);
  float scan = smoothstep(0.985, 1.0, sin((uv.y + uTime * 0.1) * 72.0)) * motion;
  float edge = smoothstep(0.0, 0.08, uv.x) * smoothstep(0.0, 0.08, uv.y) * smoothstep(0.0, 0.08, 1.0 - uv.x) * smoothstep(0.0, 0.08, 1.0 - uv.y);
  float reveal = smoothstep(0.0, 0.28, max(uProgress, uRealProgress));
  float exitFade = 1.0 - smoothstep(0.68, 1.0, uExit);

  vec3 mint = vec3(0.45, 0.96, 0.82);
  vec3 blue = vec3(0.47, 0.72, 1.0);
  vec3 warm = vec3(0.98, 0.95, 0.9);
  vec3 aura = mix(mint, blue, smoothstep(-0.4, 0.9, sin(uv.x * 7.0 + uTime)));
  vec3 color = copy.rgb * mix(aura * 0.84, warm, copy.a);
  color += aura * (0.045 + scan * 0.055 + vRipple * 0.075 + uWaveEnergy * 0.08 + n * 0.012);
  color += warm * vExitRing * 0.48;
  float alpha = copy.a * edge * reveal * exitFade;
  alpha *= 0.58 + scan * 0.06 + vRipple * 0.08 + uWaveEnergy * 0.055 + vExitRing * 0.16;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, min(alpha, 0.76));
}
`;
