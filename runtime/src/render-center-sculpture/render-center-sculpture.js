import { CARD_GLASS_TONE } from "../describe-runtime-scenes/describe-card-copy-surfaces.js";
import { TAU } from "../describe-runtime-scenes/configure-stage-layout-and-camera.js";
import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";
export const SCULPTURE_FIXED_POSITION = [0.0, -1.05, -2.84];
export const SCULPTURE_FIXED_ROTATION = [0.14, 0.0, 0.0];
export const SCULPTURE_FIXED_SCALE = [1.216, 1.216, 1.216];
// Sculpture-only HDRI softening: higher roughness samples broader PMREM mips so facet highlights read larger and less busy.
export const SCULPTURE_ENV_INTENSITY_SCALE = 1.0;
export const SCULPTURE_ENV_HOVER_BOOST = 0.34;
export const SCULPTURE_ENV_BEAT_BOOST = 0.1;
export const SCULPTURE_MIN_ROUGHNESS = 0.16;
// MVP SHIPPING LOCK: keep the real Three/PBR layer crisp without uncapping the whole choreography renderer.
export const THREE_PBR_DPR_MAX = 2.5;

export const SCULPTURE_SCENE_POSES = {
  card1: { position: SCULPTURE_FIXED_POSITION, rotation: SCULPTURE_FIXED_ROTATION, scale: SCULPTURE_FIXED_SCALE },
  card2: { position: SCULPTURE_FIXED_POSITION, rotation: SCULPTURE_FIXED_ROTATION, scale: SCULPTURE_FIXED_SCALE },
  card3: { position: SCULPTURE_FIXED_POSITION, rotation: SCULPTURE_FIXED_ROTATION, scale: SCULPTURE_FIXED_SCALE },
  card4: { position: SCULPTURE_FIXED_POSITION, rotation: SCULPTURE_FIXED_ROTATION, scale: SCULPTURE_FIXED_SCALE },
  card5: { position: SCULPTURE_FIXED_POSITION, rotation: SCULPTURE_FIXED_ROTATION, scale: SCULPTURE_FIXED_SCALE },
  card6: { position: SCULPTURE_FIXED_POSITION, rotation: SCULPTURE_FIXED_ROTATION, scale: SCULPTURE_FIXED_SCALE },
  card7: { position: SCULPTURE_FIXED_POSITION, rotation: SCULPTURE_FIXED_ROTATION, scale: SCULPTURE_FIXED_SCALE },
  card8: { position: SCULPTURE_FIXED_POSITION, rotation: SCULPTURE_FIXED_ROTATION, scale: SCULPTURE_FIXED_SCALE },
  card10: { position: [0.12, -1.08, -3.38], rotation: SCULPTURE_FIXED_ROTATION, scale: [0.72, 0.72, 0.72] }
};

export class RuntimeSculptureLayer {
  constructor(manifest, state, sculptureAsset = null) {
    this.manifest = manifest;
    this.state = state;
    this.asset = sculptureAsset;
    this.modelMatrix = new Float32Array(16);
    this.poseMatrix = new Float32Array(16);
    this.spinMatrix = new Float32Array(16);
    this.position = [0, 0, -1.08];
    this.rotation = [0.08, 0, 0];
    this.scale = [1.3, 1.3, 1.3];
    this.spinYaw = 0;
    this.hover = 0;
    this.opacity = 0;
    this.sceneIndex = 0;
    this.animationStartSeconds = null;
  }

  start(gl, cameraRig, interaction, waveField) {
    this.gl = gl;
    this.cameraRig = cameraRig;
    this.interaction = interaction;
    this.waveField = waveField;
    this.geometry = this.createGeometry(this.asset);
    if (!this.geometry) return;
    this.program = this.createProgram(sculptureVertexShader, sculptureFragmentShader);
    this.locations = {
      position: gl.getAttribLocation(this.program, "aSculpturePosition"),
      normal: gl.getAttribLocation(this.program, "aSculptureNormal"),
      uv: gl.getAttribLocation(this.program, "aSculptureUv"),
      material: gl.getAttribLocation(this.program, "aSculptureMaterial"),
      model: gl.getUniformLocation(this.program, "uModel"),
      viewProjection: gl.getUniformLocation(this.program, "uViewProjection"),
      time: gl.getUniformLocation(this.program, "uTime"),
      pointer: gl.getUniformLocation(this.program, "uPointer"),
      hover: gl.getUniformLocation(this.program, "uHover"),
      beat: gl.getUniformLocation(this.program, "uBeat"),
      wave: gl.getUniformLocation(this.program, "uWave"),
      tone: gl.getUniformLocation(this.program, "uTone"),
      opacity: gl.getUniformLocation(this.program, "uOpacity"),
      scene: gl.getUniformLocation(this.program, "uScene"),
      resolution: gl.getUniformLocation(this.program, "uResolution"),
      pass: gl.getUniformLocation(this.program, "uPass"),
      cameraPosition: gl.getUniformLocation(this.program, "uCameraPosition"),
      glossBaseColor: gl.getUniformLocation(this.program, "uGlossBaseColor"),
      glossRoughness: gl.getUniformLocation(this.program, "uGlossRoughness"),
      glossIor: gl.getUniformLocation(this.program, "uGlossIor"),
      glossCoatWeight: gl.getUniformLocation(this.program, "uGlossCoatWeight"),
      glossCoatRoughness: gl.getUniformLocation(this.program, "uGlossCoatRoughness"),
      glossSheenColor: gl.getUniformLocation(this.program, "uGlossSheenColor"),
      glossSheenWeight: gl.getUniformLocation(this.program, "uGlossSheenWeight"),
      glossSheenRoughness: gl.getUniformLocation(this.program, "uGlossSheenRoughness"),
      glowBaseColor: gl.getUniformLocation(this.program, "uGlowBaseColor"),
      glowEmissionColor: gl.getUniformLocation(this.program, "uGlowEmissionColor"),
      glowEmissionStrength: gl.getUniformLocation(this.program, "uGlowEmissionStrength")
    };
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.geometry.vertices, gl.STATIC_DRAW);
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.geometry.indices, gl.STATIC_DRAW);
  }

  update(stagePhase, dt) {
    if (!this.geometry) return;
    const target = this.getTargetPose(stagePhase);
    const seconds = performance.now() * 0.001;
    const pointer = this.interaction.pointer;
    const pointerDistance = Math.hypot(pointer.x - 0.5, pointer.y - 0.53);
    const pointerWake = RuntimeMath.clamp(1 - pointerDistance / 0.46, 0, 1) * 0.42;
    const hoverTarget = RuntimeMath.clamp((stagePhase.hoverObjectId ? 0.72 : 0) + pointerWake + (stagePhase.materialFocus?.intensity || 0) * 0.18, 0, 1);
    this.hover = RuntimeMath.lerp(this.hover, hoverTarget, 0.08);
    this.opacity = RuntimeMath.lerp(this.opacity, 1, 0.04);
    const beat = stagePhase.beatIntensity || 0;
    const authoredYaw = this.getAuthoredAnimationYaw(seconds);
    this.spinYaw = authoredYaw;
    const targetPosition = [...target.position];
    const targetRotation = [
      target.rotation[0],
      target.rotation[1],
      target.rotation[2]
    ];
    const targetScale = [...target.scale];
    RuntimeMath.lerpVec3(this.position, this.position, targetPosition, 0.055);
    RuntimeMath.lerpVec3(this.rotation, this.rotation, targetRotation, 0.05);
    RuntimeMath.lerpVec3(this.scale, this.scale, targetScale, 0.045);
  }

  render(time) {
    if (!this.geometry || !this.program) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, this.geometry.stride, 0);
    gl.enableVertexAttribArray(this.locations.normal);
    gl.vertexAttribPointer(this.locations.normal, 3, gl.FLOAT, false, this.geometry.stride, 12);
    gl.enableVertexAttribArray(this.locations.uv);
    gl.vertexAttribPointer(this.locations.uv, 2, gl.FLOAT, false, this.geometry.stride, 24);
    if (this.locations.material >= 0) {
      gl.enableVertexAttribArray(this.locations.material);
      gl.vertexAttribPointer(this.locations.material, 1, gl.FLOAT, false, this.geometry.stride, 32);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    RuntimeMath.compose(this.poseMatrix, this.position, this.rotation, this.scale);
    RuntimeMath.compose(this.spinMatrix, [0, 0, 0], [0, this.spinYaw % TAU, 0], [1, 1, 1]);
    RuntimeMath.multiply(this.modelMatrix, this.poseMatrix, this.spinMatrix);
    gl.uniformMatrix4fv(this.locations.model, false, this.modelMatrix);
    gl.uniformMatrix4fv(this.locations.viewProjection, false, this.cameraRig.viewProjection);
    gl.uniform1f(this.locations.time, time * 0.001);
    gl.uniform2f(this.locations.pointer, this.interaction.pointer.x, this.interaction.pointer.y);
    gl.uniform1f(this.locations.hover, this.hover);
    gl.uniform1f(this.locations.beat, this.stageBeat || 0);
    gl.uniform1f(this.locations.wave, this.waveField?.energy || 0);
    gl.uniform3f(this.locations.tone, CARD_GLASS_TONE[0], CARD_GLASS_TONE[1], CARD_GLASS_TONE[2]);
    gl.uniform1f(this.locations.opacity, this.opacity);
    gl.uniform1f(this.locations.scene, this.sceneIndex);
    gl.uniform2f(this.locations.resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform3f(this.locations.cameraPosition, this.cameraRig.position[0], this.cameraRig.position[1], this.cameraRig.position[2]);
    this.bindMaterialUniforms();
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.uniform1f(this.locations.pass, 0);
    gl.drawElements(gl.TRIANGLES, this.geometry.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(false);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.uniform1f(this.locations.pass, 1);
    gl.drawElements(gl.TRIANGLES, this.geometry.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.depthFunc(gl.LESS);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  bindMaterialUniforms() {
    const gl = this.gl;
    const slots = this.geometry?.materialSlots || [];
    const gloss = slots.find((slot) => slot.name === "gloss") || {};
    const glow = slots.find((slot) => slot.name === "glow") || {};
    const glossBase = gloss.baseColor || [0.003035, 0.003035, 0.003035, 0.631373];
    const glowBase = glow.baseColor || [0.8, 0.8, 0.8, 1];
    const glowEmission = glow.emissionColor || [0.423268, 0.791298, 0.947307, 1];
    gl.uniform4f(this.locations.glossBaseColor, glossBase[0], glossBase[1], glossBase[2], glossBase[3] ?? 1);
    gl.uniform1f(this.locations.glossRoughness, gloss.roughness ?? 0.1);
    gl.uniform1f(this.locations.glossIor, gloss.ior ?? 2);
    gl.uniform1f(this.locations.glossCoatWeight, gloss.coatWeight ?? 0.25);
    gl.uniform1f(this.locations.glossCoatRoughness, gloss.coatRoughness ?? 0.025);
    gl.uniform3f(this.locations.glossSheenColor, gloss.sheenColor?.[0] ?? 1, gloss.sheenColor?.[1] ?? 1, gloss.sheenColor?.[2] ?? 1);
    gl.uniform1f(this.locations.glossSheenWeight, gloss.sheenWeight ?? 0.2);
    gl.uniform1f(this.locations.glossSheenRoughness, gloss.sheenRoughness ?? 0);
    gl.uniform4f(this.locations.glowBaseColor, glowBase[0], glowBase[1], glowBase[2], glowBase[3] ?? 1);
    gl.uniform4f(this.locations.glowEmissionColor, glowEmission[0], glowEmission[1], glowEmission[2], glowEmission[3] ?? 1);
    gl.uniform1f(this.locations.glowEmissionStrength, glow.emissionStrength ?? 10);
  }

  getTargetPose(stagePhase) {
    this.stageBeat = stagePhase.beatIntensity || 0;
    this.sceneIndex = Math.max(0, this.manifest.scenes.findIndex((scene) => scene.id === stagePhase.activeCardNumber));
    const pose = SCULPTURE_SCENE_POSES[stagePhase.activeCardNumber] || SCULPTURE_SCENE_POSES.card1;
    return {
      position: [...pose.position],
      rotation: [...pose.rotation],
      scale: [...pose.scale]
    };
  }

  getAuthoredAnimationYaw(seconds) {
    const animation = this.geometry?.animation;
    const samples = animation?.samples || [];
    const duration = animation?.durationSeconds || 0;
    if (!samples.length || duration <= 0) return 0;
    if (this.animationStartSeconds === null) this.animationStartSeconds = seconds;
    const elapsed = Math.max(0, seconds - this.animationStartSeconds);
    if (animation.rotationLoop?.axis === "y" && animation.rotationLoop.turns) {
      const authoredDuration = (animation.rotationLoop.frameCount || samples.length || 720) / (animation.rotationLoop.fps || animation.fps || 24);
      return (elapsed / authoredDuration) * TAU * animation.rotationLoop.turns;
    }
    const phase = ((seconds % duration) / duration + 1) % 1;
    let previous = samples[0];
    for (let index = 1; index < samples.length; index += 1) {
      const next = samples[index];
      if (phase <= next.t) {
        const span = Math.max(next.t - previous.t, 0.0001);
        const blend = RuntimeMath.clamp((phase - previous.t) / span, 0, 1);
        return RuntimeMath.lerp(previous.yaw, next.yaw, blend);
      }
      previous = next;
    }
    const first = samples[0];
    const span = Math.max(1 + first.t - previous.t, 0.0001);
    const blend = RuntimeMath.clamp((phase + 1 - previous.t) / span, 0, 1);
    return RuntimeMath.lerp(previous.yaw, first.yaw, blend);
  }

  createGeometry(asset) {
    if (!asset || !Array.isArray(asset.positions) || !Array.isArray(asset.normals) || !Array.isArray(asset.indices)) return null;
    const vertexCount = asset.positions.length / 3;
    if (vertexCount > 65535) return null;
    const vertices = new Float32Array(vertexCount * 9);
    for (let index = 0; index < vertexCount; index += 1) {
      vertices[index * 9 + 0] = asset.positions[index * 3 + 0];
      vertices[index * 9 + 1] = asset.positions[index * 3 + 1];
      vertices[index * 9 + 2] = asset.positions[index * 3 + 2];
      vertices[index * 9 + 3] = asset.normals[index * 3 + 0] ?? 0;
      vertices[index * 9 + 4] = asset.normals[index * 3 + 1] ?? 0;
      vertices[index * 9 + 5] = asset.normals[index * 3 + 2] ?? 1;
      vertices[index * 9 + 6] = asset.uvs?.[index * 2 + 0] ?? 0.5;
      vertices[index * 9 + 7] = asset.uvs?.[index * 2 + 1] ?? 0.5;
      vertices[index * 9 + 8] = asset.materialIds?.[index] ?? 0;
    }
    return {
      vertices,
      indices: new Uint16Array(asset.indices),
      stride: 9 * 4,
      source: asset.id || "center-sculpture-asset",
      materials: asset.materials || [],
      materialSlots: asset.materialSlots || [],
      animation: asset.animation || null
    };
  }

  createProgram(vs, fs) {
    const program = this.gl.createProgram();
    const vertex = this.compile(this.gl.VERTEX_SHADER, vs);
    const fragment = this.compile(this.gl.FRAGMENT_SHADER, fs);
    this.gl.attachShader(program, vertex);
    this.gl.attachShader(program, fragment);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(program) || "Could not link sculpture shader program");
    }
    return program;
  }

  compile(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) || "Could not compile sculpture shader");
    }
    return shader;
  }
}

const sculptureVertexShader = `
attribute vec3 aSculpturePosition;
attribute vec3 aSculptureNormal;
attribute vec2 aSculptureUv;
attribute float aSculptureMaterial;

uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform float uTime;
uniform float uHover;
uniform float uBeat;
uniform float uWave;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vMaterial;

void main() {
  vec3 local = aSculpturePosition;
  vec4 world = uModel * vec4(local, 1.0);
  vWorld = world.xyz;
  vNormal = normalize((uModel * vec4(aSculptureNormal, 0.0)).xyz);
  vUv = aSculptureUv;
  vMaterial = aSculptureMaterial;
  gl_Position = uViewProjection * world;
}
`;

const sculptureFragmentShader = `
precision highp float;

uniform vec3 uTone;
uniform vec2 uPointer;
uniform float uTime;
uniform float uHover;
uniform float uBeat;
uniform float uWave;
uniform float uOpacity;
uniform float uScene;
uniform float uPass;
uniform vec2 uResolution;
uniform vec3 uCameraPosition;
uniform vec4 uGlossBaseColor;
uniform float uGlossRoughness;
uniform float uGlossIor;
uniform float uGlossCoatWeight;
uniform float uGlossCoatRoughness;
uniform vec3 uGlossSheenColor;
uniform float uGlossSheenWeight;
uniform float uGlossSheenRoughness;
uniform vec4 uGlowBaseColor;
uniform vec4 uGlowEmissionColor;
uniform float uGlowEmissionStrength;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vMaterial;

void main() {
  float glowMaterial = smoothstep(0.45, 1.2, vMaterial);
  if (uPass < 0.5 && glowMaterial > 0.5) discard;
  if (uPass > 0.5 && glowMaterial < 0.5) discard;
  vec3 base = max(uGlossBaseColor.rgb, vec3(0.0));
  vec3 glowEmission = uGlowEmissionColor.rgb * max(uGlowEmissionStrength, 0.0);
  vec3 color = vec3(0.0);
  float alpha = 1.0;
  if (uPass < 0.5) {
    color = base;
    alpha = uOpacity * uGlossBaseColor.a;
  } else {
    color = uGlowBaseColor.rgb + glowEmission;
    alpha = uOpacity * uGlowBaseColor.a;
  }
  gl_FragColor = vec4(color, min(alpha, 1.0));
}
`;
