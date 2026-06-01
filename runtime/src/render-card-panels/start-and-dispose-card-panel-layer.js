import { panelVertexShader, panelFragmentShader } from "./shade-panel-glass-surfaces.js";

export const runtimePanelLifecycleMethods = {
  start(gl, cameraRig, interaction, waveField) {
    this.gl = gl;
    this.cameraRig = cameraRig;
    this.interaction = interaction;
    this.waveField = waveField;
    this.program = this.createProgram(panelVertexShader, panelFragmentShader);
    this.locations = {
      position: gl.getAttribLocation(this.program, "aPanelPosition"),
      normal: gl.getAttribLocation(this.program, "aPanelNormal"),
      uv: gl.getAttribLocation(this.program, "aPanelUv"),
      material: gl.getAttribLocation(this.program, "aPanelMaterial"),
      model: gl.getUniformLocation(this.program, "uModel"),
      viewProjection: gl.getUniformLocation(this.program, "uViewProjection"),
      resolution: gl.getUniformLocation(this.program, "uResolution"),
      waveMap: gl.getUniformLocation(this.program, "uWaveMap"),
      copyMap: gl.getUniformLocation(this.program, "uCopyMap"),
      copyVisible: gl.getUniformLocation(this.program, "uCopyVisible"),
      objectVisibility: gl.getUniformLocation(this.program, "uObjectVisibility"),
      activeScene: gl.getUniformLocation(this.program, "uActiveScene"),
      waveStrength: gl.getUniformLocation(this.program, "uWaveStrength"),
      hover: gl.getUniformLocation(this.program, "uHover"),
      active: gl.getUniformLocation(this.program, "uActive"),
      tone: gl.getUniformLocation(this.program, "uTone"),
      time: gl.getUniformLocation(this.program, "uTime"),
      dpr: gl.getUniformLocation(this.program, "uDPR"),
      panelId: gl.getUniformLocation(this.program, "uPanelId"),
      pointer: gl.getUniformLocation(this.program, "uPointer"),
      stageBeat: gl.getUniformLocation(this.program, "uStageBeat"),
      focusLock: gl.getUniformLocation(this.program, "uFocusLock"),
      copyBoost: gl.getUniformLocation(this.program, "uCopyBoost"),
      latentDim: gl.getUniformLocation(this.program, "uLatentDim"),
      planeMode: gl.getUniformLocation(this.program, "uPlaneMode"),
      materialBaseColors: [0, 1, 2, 3].map((index) => gl.getUniformLocation(this.program, `uMaterialBaseColors[${index}]`)),
      materialRoughnesses: [0, 1, 2, 3].map((index) => gl.getUniformLocation(this.program, `uMaterialRoughnesses[${index}]`)),
      materialMetallics: [0, 1, 2, 3].map((index) => gl.getUniformLocation(this.program, `uMaterialMetallics[${index}]`)),
      materialIors: [0, 1, 2, 3].map((index) => gl.getUniformLocation(this.program, `uMaterialIors[${index}]`)),
      materialTransmissions: [0, 1, 2, 3].map((index) => gl.getUniformLocation(this.program, `uMaterialTransmissions[${index}]`)),
      materialCoats: [0, 1, 2, 3].map((index) => gl.getUniformLocation(this.program, `uMaterialCoats[${index}]`)),
      materialCoatRoughnesses: [0, 1, 2, 3].map((index) => gl.getUniformLocation(this.program, `uMaterialCoatRoughnesses[${index}]`))
    };
    this.geometries = this.createPanelGeometries();
    this.geometry = this.geometries.get(this.defaultCardAssetId) || this.geometries.values().next().value;
    this.typePlaneGeometry = this.installBufferedGeometry(this.createPanelGeometry(1, 1, null, "floating-type-plane"));
    this.blankTexture = this.createBlankTexture();
    this.copyTextures = this.createCopyTextures();
    this.typeTextures = this.createTypeTextures();
    this.installNativeInputOverlay();
    window.addEventListener("keydown", this.onKeyDown);
  },

  dispose() {
    if (!this.gl) return;
    this.motionHandles?.cancelAll?.();
    window.removeEventListener("keydown", this.onKeyDown);
    if (this.nativeInputOverlay) {
      this.nativeInputOverlay.removeEventListener("focus", this.onNativeInputOverlayFocus);
      this.nativeInputOverlay.removeEventListener("input", this.onNativeInputOverlayInput);
      this.nativeInputOverlay.removeEventListener("keydown", this.onNativeInputOverlayKeyDown);
      this.nativeInputOverlay.removeEventListener("blur", this.onNativeInputOverlayBlur);
      this.nativeInputOverlay.remove();
      this.nativeInputOverlay = null;
    }
    this.geometries.forEach((geometry) => {
      if (geometry.vertexBuffer) this.gl.deleteBuffer(geometry.vertexBuffer);
      if (geometry.indexBuffer) this.gl.deleteBuffer(geometry.indexBuffer);
    });
    if (this.program) this.gl.deleteProgram(this.program);
    this.copyTextures.forEach((texture) => this.gl.deleteTexture(texture));
    this.typeTextures.forEach((texture) => this.gl.deleteTexture(texture));
    if (this.blankTexture) this.gl.deleteTexture(this.blankTexture);
    this.geometries.clear();
    this.geometry = null;
    this.boundGeometry = null;
    this.program = null;
    this.blankTexture = null;
    this.copyTextures.clear();
    this.typeTextures.clear();
    this.copyTextureSignatures.clear();
    this.typeTextureSignatures.clear();
    this.runtimeInputStatesByObjectId.clear();
  },

  createProgram(vs, fs) {
    const program = this.gl.createProgram();
    const vertex = this.compile(this.gl.VERTEX_SHADER, vs);
    const fragment = this.compile(this.gl.FRAGMENT_SHADER, fs);
    this.gl.attachShader(program, vertex);
    this.gl.attachShader(program, fragment);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(program) || "Could not link panel shader program");
    }
    return program;
  },

  compile(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) || "Could not compile panel shader");
    }
    return shader;
  }
};
