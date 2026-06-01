export const panelVertexShader = `
attribute vec3 aPanelPosition;
attribute vec3 aPanelNormal;
attribute vec2 aPanelUv;
attribute float aPanelMaterial;

uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform float uHover;
uniform float uActive;
uniform float uTime;
uniform float uStageBeat;
uniform float uFocusLock;

varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vEdge;
varying float vCurve;
varying float vFront;
varying float vMaterial;

void main() {
  vec3 local = aPanelPosition;
  float front = smoothstep(0.18, 0.78, aPanelNormal.z);
  float edge = min(min(aPanelUv.x, 1.0 - aPanelUv.x), min(aPanelUv.y, 1.0 - aPanelUv.y));
  float interior = smoothstep(0.09, 0.24, edge);
  float curve = sin((aPanelUv.x - 0.5) * 3.14159) * sin(aPanelUv.y * 3.14159);
  local.z += curve * front * interior * (0.004 + uHover * 0.005 + uActive * 0.004 + uStageBeat * 0.004);
  local.xy *= 1.0 + uActive * 0.026 + uStageBeat * uFocusLock * 0.012;
  vec4 world = uModel * vec4(local, 1.0);
  vUv = aPanelUv;
  vWorld = world.xyz;
  vNormal = normalize((uModel * vec4(aPanelNormal, 0.0)).xyz);
  vEdge = edge;
  vCurve = curve;
  vFront = front;
  vMaterial = aPanelMaterial;
  gl_Position = uViewProjection * world;
}
`;

export const panelFragmentShader = `
precision highp float;

uniform sampler2D uWaveMap;
uniform sampler2D uCopyMap;
uniform vec2 uResolution;
uniform vec3 uTone;
uniform float uCopyVisible;
uniform float uObjectVisibility;
uniform float uActiveScene;
uniform float uWaveStrength;
uniform float uHover;
uniform float uActive;
uniform float uTime;
uniform float uDPR;
uniform float uPanelId;
uniform vec2 uPointer;
uniform float uStageBeat;
uniform float uFocusLock;
uniform float uCopyBoost;
uniform float uLatentDim;
uniform float uPlaneMode;
uniform vec4 uMaterialBaseColors[4];
uniform float uMaterialRoughnesses[4];
uniform float uMaterialMetallics[4];
uniform float uMaterialIors[4];
uniform float uMaterialTransmissions[4];
uniform float uMaterialCoats[4];
uniform float uMaterialCoatRoughnesses[4];

varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vEdge;
varying float vCurve;
varying float vFront;
varying float vMaterial;

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

float lineGrid(vec2 uv, vec2 count) {
  vec2 grid = abs(fract(uv * count) - 0.5);
  vec2 line = smoothstep(vec2(0.49), vec2(0.47), grid);
  return max(line.x, line.y);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += noise(p) * amplitude;
    p = p * 2.03 + vec2(17.2, 9.4);
    amplitude *= 0.52;
  }
  return value;
}

void main() {
  vec2 screenUV = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  vec4 waveSample = texture2D(uWaveMap, screenUV);
  float wave = waveSample.r - 0.5;
  float waveEnergy = clamp((waveSample.g - 0.5) * 2.0, 0.0, 1.0);
  float energyFalloff = smoothstep(0.08, 0.23, vEdge);
  vec2 uv = vUv + vec2(wave * uWaveStrength * 0.014, wave * uWaveStrength * 0.01) * energyFalloff;
  float typeMode = step(0.5, uPlaneMode);
  float frontFace = smoothstep(0.18, 0.78, vNormal.z);
  float sideFace = clamp(1.0 - frontFace, 0.0, 1.0);
  float interiorEnergy = energyFalloff * frontFace;
  float assetEdge = smoothstep(0.032, 0.0, vEdge) * frontFace;

  vec2 chroma = vec2(0.0);
  vec2 copyUv = mix(vUv, uv, 0.18 * interiorEnergy);
  vec4 copyBase = texture2D(uCopyMap, copyUv);
  vec4 copyR = texture2D(uCopyMap, copyUv + chroma);
  vec4 copyB = texture2D(uCopyMap, copyUv - chroma);
  vec4 copy = mix(copyBase, vec4(copyR.r, copyBase.g, copyB.b, copyBase.a), 0.16);
  float copyAlpha = copy.a * uCopyVisible;
  if (typeMode > 0.5) {
    float typeField = fbm(uv * vec2(2.6, 1.25) + vec2(uPanelId * 0.8, 0.0));
    float typeAlpha = copyAlpha * uObjectVisibility * (0.72 + uFocusLock * 0.08 + uStageBeat * 0.03);
    float textAura = smoothstep(0.02, 0.16, copyAlpha);
    float fieldAlpha = smoothstep(0.8, 0.99, typeField) * textAura * (0.0015 + uActive * 0.002 + uStageBeat * 0.0015);
    vec3 typeGlow = vec3(0.74, 0.83, 0.88) * (0.003 + typeField * 0.006) * textAura;
    vec3 typeColor = copy.rgb + typeGlow;
    float alpha = max(typeAlpha, fieldAlpha * uObjectVisibility);
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(typeColor, min(alpha, 0.74));
    return;
  }
  float materialId = clamp(floor(vMaterial + 0.5), 0.0, 3.0);
  vec4 materialBaseColor = uMaterialBaseColors[0];
  float materialRoughness = uMaterialRoughnesses[0];
  float materialIor = uMaterialIors[0];
  float materialTransmission = uMaterialTransmissions[0];
  float materialCoat = uMaterialCoats[0];
  float materialCoatRoughness = uMaterialCoatRoughnesses[0];
  if (materialId > 0.5) {
    materialBaseColor = uMaterialBaseColors[1];
    materialRoughness = uMaterialRoughnesses[1];
    materialIor = uMaterialIors[1];
    materialTransmission = uMaterialTransmissions[1];
    materialCoat = uMaterialCoats[1];
    materialCoatRoughness = uMaterialCoatRoughnesses[1];
  }
  if (materialId > 1.5) {
    materialBaseColor = uMaterialBaseColors[2];
    materialRoughness = uMaterialRoughnesses[2];
    materialIor = uMaterialIors[2];
    materialTransmission = uMaterialTransmissions[2];
    materialCoat = uMaterialCoats[2];
    materialCoatRoughness = uMaterialCoatRoughnesses[2];
  }
  if (materialId > 2.5) {
    materialBaseColor = uMaterialBaseColors[3];
    materialRoughness = uMaterialRoughnesses[3];
    materialIor = uMaterialIors[3];
    materialTransmission = uMaterialTransmissions[3];
    materialCoat = uMaterialCoats[3];
    materialCoatRoughness = uMaterialCoatRoughnesses[3];
  }

  float activeRead = max(uActive, uFocusLock);
  float readPriority = clamp(uActiveScene + activeRead * 0.5, 0.0, 1.0);
  float latentDim = mix(uLatentDim, 1.0, readPriority);
  vec3 base = max(materialBaseColor.rgb, vec3(0.0));
  float materialAlpha = clamp(materialBaseColor.a, 0.0, 1.0);

  vec3 authoredMaterial = base * latentDim;

  float copyStrength = copyAlpha * frontFace * uObjectVisibility * uCopyBoost * (0.96 + uActiveScene * 0.34 + uHover * 0.06 + activeRead * 0.2);
  vec3 color = mix(authoredMaterial, copy.rgb, clamp(copyStrength, 0.0, 1.0));
  float alpha = uObjectVisibility * materialAlpha * latentDim;
  alpha = max(alpha, copyStrength * 0.9);
  if (alpha < 0.012) discard;
  gl_FragColor = vec4(color, min(alpha, 1.0));
}
`;
