// src/configure-runtime/configure-runtime-hosts-and-gates.js
const DEFAULT_RUNTIME_ASSET_BASE = "./assets/";

const RUNTIME_MODULE_IMPORTS = {
  three: "https://esm.sh/three@0.176.0",
  "three/addons/loaders/GLTFLoader.js": "https://esm.sh/three@0.176.0/examples/jsm/loaders/GLTFLoader.js",
  "three/addons/loaders/EXRLoader.js": "https://esm.sh/three@0.176.0/examples/jsm/loaders/EXRLoader.js"
};

const LOCAL_VALEN_SPACE_ID = "local-core";
const PUBLIC_INPUT_CARD = "card10";

const LOCAL_WORKSPACE_CAPABILITIES = [
  "Preview",
  "Testing",
  "Approvals",
  "Local fixtures",
  "Developer tools"
];

// src/load-runtime-assets/load-and-normalize-glb-models.js
class RuntimeGlbLoader {
  static parse(buffer, options = {}) {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Invalid GLB magic");
    if (view.getUint32(4, true) !== 2) throw new Error("Unsupported GLB version");
    let offset = 12;
    let json = null;
    let binary = null;
    while (offset < buffer.byteLength) {
      const byteLength = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      offset += 8;
      const chunk = buffer.slice(offset, offset + byteLength);
      offset += byteLength;
      if (chunkType === 0x4e4f534a) {
        json = JSON.parse(new TextDecoder().decode(chunk));
      } else if (chunkType === 0x004e4942) {
        binary = chunk;
      }
    }
    if (!json || !binary) throw new Error("GLB missing JSON or BIN chunk");
    return RuntimeGlbLoader.toRuntimeGeometry(json, binary, options);
  }

  static toRuntimeGeometry(gltf, binary, options = {}) {
    const scene = gltf.scenes?.[gltf.scene || 0] || gltf.scenes?.[0];
    const sceneNodes = scene?.nodes?.length ? scene.nodes : gltf.nodes?.map((_, index) => index) || [];
    const materials = (gltf.materials || []).map((material) => material.name || "material");
    const materialSlots = (gltf.materials || []).map((material) => RuntimeGlbLoader.materialSlot(material));
    const vertices = [];
    const rawPositions = [];
    const meshOrigins = [];
    const partRecords = [];
    const indices = [];
    const identity = RuntimeGlbLoader.identity();

    const visitNode = (nodeIndex, parentMatrix) => {
      const node = gltf.nodes?.[nodeIndex];
      if (!node) return;
      const localMatrix = RuntimeGlbLoader.nodeMatrix(node);
      const worldMatrix = RuntimeGlbLoader.multiply(parentMatrix, localMatrix);
      if (Number.isInteger(node.mesh)) {
        const mesh = gltf.meshes?.[node.mesh];
        meshOrigins.push(RuntimeGlbLoader.transformPoint(worldMatrix, [0, 0, 0]));
        RuntimeGlbLoader.appendMesh(gltf, binary, node.mesh, worldMatrix, vertices, rawPositions, indices, {
          meshIndex: node.mesh,
          nodeName: node.name || `node-${nodeIndex}`,
          meshName: mesh?.name || `mesh-${node.mesh}`,
          partRecords,
          preserveMeshParts: options.preserveMeshParts
        });
      }
      (node.children || []).forEach((childIndex) => visitNode(childIndex, worldMatrix));
    };

    sceneNodes.forEach((nodeIndex) => visitNode(nodeIndex, identity));
    if (!vertices.length) throw new Error("GLB contains no renderable mesh primitives");
    if (vertices.length > 65535) throw new Error(`GLB vertex count ${vertices.length} exceeds WebGL1 uint16 path`);

    const bounds = RuntimeGlbLoader.bounds(rawPositions);
    const boundsCenter = [
      (bounds.min[0] + bounds.max[0]) * 0.5,
      (bounds.min[1] + bounds.max[1]) * 0.5,
      (bounds.min[2] + bounds.max[2]) * 0.5
    ];
    const pivotCenter = options.preservePivot && meshOrigins.length
      ? [
        meshOrigins.reduce((sum, origin) => sum + origin[0], 0) / meshOrigins.length,
        meshOrigins.reduce((sum, origin) => sum + origin[1], 0) / meshOrigins.length,
        meshOrigins.reduce((sum, origin) => sum + origin[2], 0) / meshOrigins.length
      ]
      : boundsCenter;
    const center = pivotCenter;
    const span = [
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2]
    ];
    const normalizer = 2 / Math.max(span[0], span[1], span[2], 0.001);
    const coordinateFrame = options.coordinateFrame || "native";
    const mappedVertices = vertices.map((vertex) => {
      const normalizedPosition = [
        (vertex.position[0] - center[0]) * normalizer,
        (vertex.position[1] - center[1]) * normalizer,
        (vertex.position[2] - center[2]) * normalizer
      ];
      return {
        position: RuntimeGlbLoader.mapPosition(normalizedPosition, coordinateFrame),
        normal: RuntimeGlbLoader.normalize(RuntimeGlbLoader.mapDirection(vertex.normal, coordinateFrame)),
        uv: vertex.uv,
        materialId: vertex.materialId
      };
    });
    const parts = partRecords.map((part) => {
      const mappedPartBounds = RuntimeGlbLoader.mapBounds(part.rawBounds, center, normalizer, coordinateFrame);
      return {
        nodeName: part.nodeName,
        meshName: part.meshName,
        meshIndex: part.meshIndex,
        primitiveIndex: part.primitiveIndex,
        materialId: part.materialId,
        bounds: {
          minX: RuntimeGlbLoader.round(mappedPartBounds.min[0]),
          minY: RuntimeGlbLoader.round(mappedPartBounds.min[1]),
          minZ: RuntimeGlbLoader.round(mappedPartBounds.min[2]),
          maxX: RuntimeGlbLoader.round(mappedPartBounds.max[0]),
          maxY: RuntimeGlbLoader.round(mappedPartBounds.max[1]),
          maxZ: RuntimeGlbLoader.round(mappedPartBounds.max[2])
        }
      };
    });
    const mappedBounds = RuntimeGlbLoader.bounds(mappedVertices.map((vertex) => vertex.position));
    const mappedSpan = [
      mappedBounds.max[0] - mappedBounds.min[0],
      mappedBounds.max[1] - mappedBounds.min[1],
      mappedBounds.max[2] - mappedBounds.min[2]
    ];
    const positions = [];
    const normals = [];
    const uvs = [];
    const materialIds = [];

    mappedVertices.forEach((vertex) => {
      positions.push(
        RuntimeGlbLoader.round(vertex.position[0]),
        RuntimeGlbLoader.round(vertex.position[1]),
        RuntimeGlbLoader.round(vertex.position[2])
      );
      normals.push(
        RuntimeGlbLoader.round(vertex.normal[0]),
        RuntimeGlbLoader.round(vertex.normal[1]),
        RuntimeGlbLoader.round(vertex.normal[2])
      );
      if (coordinateFrame === "card-plane") {
        uvs.push(
          RuntimeGlbLoader.round((vertex.position[0] - mappedBounds.min[0]) / Math.max(mappedSpan[0], 0.001)),
          RuntimeGlbLoader.round((vertex.position[1] - mappedBounds.min[1]) / Math.max(mappedSpan[1], 0.001))
        );
      } else {
        uvs.push(RuntimeGlbLoader.round(vertex.uv[0]), RuntimeGlbLoader.round(vertex.uv[1]));
      }
      materialIds.push(vertex.materialId);
    });

    return {
      id: options.id || "runtime-glb-asset",
      source: `Runtime GLB parse from ${options.sourcePath || "embedded GLB"}`,
      layout: "Loaded directly from GLB in browser; positions/normals/uvs/materialIds are runtime arrays",
      bounds: {
        min: bounds.min.map(RuntimeGlbLoader.round),
        max: bounds.max.map(RuntimeGlbLoader.round),
        normalizedMaxDimension: 2,
        coordinateFrame,
        pivot: options.preservePivot ? "blender-node-origin" : "bounds-center"
      },
      materials,
      materialSlots,
      animation: RuntimeGlbLoader.animation(gltf, binary),
      parts,
      positions,
      normals,
      uvs,
      materialIds,
      indices
    };
  }

  static appendMesh(gltf, binary, meshIndex, matrix, vertices, rawPositions, indices, options = {}) {
    const mesh = gltf.meshes?.[meshIndex];
    if (!mesh) return;
    mesh.primitives?.forEach((primitive, primitiveIndex) => {
      const positionAccessor = RuntimeGlbLoader.readAccessor(gltf, binary, primitive.attributes?.POSITION);
      if (!positionAccessor) return;
      const normalAccessor = RuntimeGlbLoader.readAccessor(gltf, binary, primitive.attributes?.NORMAL);
      const uvAccessor = RuntimeGlbLoader.readAccessor(gltf, binary, primitive.attributes?.TEXCOORD_0);
      const indexAccessor = RuntimeGlbLoader.readAccessor(gltf, binary, primitive.indices);
      const materialId = primitive.material ?? 0;
      const baseIndex = vertices.length;
      const partPositions = [];
      for (let index = 0; index < positionAccessor.count; index += 1) {
        const position = RuntimeGlbLoader.transformPoint(matrix, RuntimeGlbLoader.accessorVec(positionAccessor, index, [0, 0, 0]));
        const normal = RuntimeGlbLoader.normalize(RuntimeGlbLoader.transformDirection(
          matrix,
          normalAccessor ? RuntimeGlbLoader.accessorVec(normalAccessor, index, [0, 0, 1]) : [0, 0, 1]
        ));
        const uv = uvAccessor ? RuntimeGlbLoader.accessorVec(uvAccessor, index, [0.5, 0.5]) : [0.5, 0.5];
        vertices.push({ position, normal, uv, materialId });
        rawPositions.push(position);
        partPositions.push(position);
      }
      if (indexAccessor) {
        for (let index = 0; index < indexAccessor.count; index += 1) {
          indices.push(baseIndex + indexAccessor.values[index]);
        }
      } else {
        for (let index = 0; index < positionAccessor.count; index += 1) indices.push(baseIndex + index);
      }
      if (partPositions.length && Array.isArray(options.partRecords)) {
        options.partRecords.push({
          nodeName: options.nodeName || "",
          meshName: options.meshName || mesh.name || "",
          meshIndex: options.meshIndex ?? meshIndex,
          primitiveIndex,
          materialId,
          rawBounds: RuntimeGlbLoader.bounds(partPositions)
        });
      }
    });
  }

  static readAccessor(gltf, binary, accessorIndex) {
    const accessor = gltf.accessors?.[accessorIndex];
    if (!accessor || accessor.sparse) return null;
    const bufferView = gltf.bufferViews?.[accessor.bufferView];
    if (!bufferView) return null;
    const componentSize = RuntimeGlbLoader.componentSize(accessor.componentType);
    const components = RuntimeGlbLoader.componentCount(accessor.type);
    const stride = bufferView.byteStride || componentSize * components;
    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const view = new DataView(binary);
    const values = [];
    for (let index = 0; index < accessor.count; index += 1) {
      const elementOffset = baseOffset + index * stride;
      for (let component = 0; component < components; component += 1) {
        values.push(RuntimeGlbLoader.readComponent(view, elementOffset + component * componentSize, accessor.componentType, accessor.normalized));
      }
    }
    return { values, count: accessor.count, components, type: accessor.type, componentType: accessor.componentType };
  }

  static readComponent(view, offset, componentType, normalized = false) {
    if (componentType === 5126) return view.getFloat32(offset, true);
    if (componentType === 5125) return view.getUint32(offset, true);
    if (componentType === 5123) {
      const value = view.getUint16(offset, true);
      return normalized ? value / 65535 : value;
    }
    if (componentType === 5122) {
      const value = view.getInt16(offset, true);
      return normalized ? Math.max(value / 32767, -1) : value;
    }
    if (componentType === 5121) {
      const value = view.getUint8(offset);
      return normalized ? value / 255 : value;
    }
    if (componentType === 5120) {
      const value = view.getInt8(offset);
      return normalized ? Math.max(value / 127, -1) : value;
    }
    throw new Error(`Unsupported GLB accessor component ${componentType}`);
  }

  static accessorVec(accessor, index, fallback) {
    const output = [];
    for (let component = 0; component < Math.max(accessor.components, fallback.length); component += 1) {
      output.push(accessor.values[index * accessor.components + component] ?? fallback[component] ?? 0);
    }
    return output;
  }

  static componentSize(componentType) {
    if (componentType === 5126 || componentType === 5125) return 4;
    if (componentType === 5123 || componentType === 5122) return 2;
    if (componentType === 5121 || componentType === 5120) return 1;
    throw new Error(`Unsupported GLB component size ${componentType}`);
  }

  static componentCount(type) {
    return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type] || 1;
  }

  static materialSlot(material = {}) {
    const pbr = material.pbrMetallicRoughness || {};
    const extensions = material.extensions || {};
    const isGloss = String(material.name || "").toLowerCase() === "gloss";
    return {
      name: material.name || "material",
      baseColor: pbr.baseColorFactor || [0.8, 0.8, 0.8, 1],
      roughness: pbr.roughnessFactor ?? 0.5,
      metallic: pbr.metallicFactor ?? 0,
      ior: extensions.KHR_materials_ior?.ior ?? (isGloss ? 2 : 1.5),
      transmission: extensions.KHR_materials_transmission?.transmissionFactor ?? 0,
      coatWeight: extensions.KHR_materials_clearcoat?.clearcoatFactor ?? 0,
      coatRoughness: extensions.KHR_materials_clearcoat?.clearcoatRoughnessFactor ?? 0,
      alphaMode: material.alphaMode || "OPAQUE",
      doubleSided: Boolean(material.doubleSided),
      sheenColor: extensions.KHR_materials_sheen?.sheenColorFactor || [0, 0, 0],
      sheenWeight: extensions.KHR_materials_sheen ? 0.2 : 0,
      sheenRoughness: extensions.KHR_materials_sheen?.sheenRoughnessFactor ?? 0,
      emissionColor: material.emissiveFactor ? [...material.emissiveFactor, 1] : [0, 0, 0, 1],
      emissionStrength: extensions.KHR_materials_emissive_strength?.emissiveStrength ?? (material.emissiveFactor ? 1 : 0)
    };
  }

  static animation(gltf, binary) {
    const animation = gltf.animations?.find((entry) => entry.channels?.some((channel) => channel.target?.path === "rotation"));
    const channel = animation?.channels?.find((entry) => entry.target?.path === "rotation");
    if (!animation || !channel) return null;
    const sampler = animation.samplers?.[channel.sampler];
    const times = RuntimeGlbLoader.readAccessor(gltf, binary, sampler?.input);
    const rotations = RuntimeGlbLoader.readAccessor(gltf, binary, sampler?.output);
    if (!times || !rotations || rotations.components < 4 || times.count < 2) return null;
    const start = times.values[0] || 0;
    const end = times.values[times.values.length - 1] || 1;
    const durationSeconds = Math.max(end - start, 0.001);
    const baseYaw = RuntimeGlbLoader.quaternionYawY(RuntimeGlbLoader.accessorVec(rotations, 0, [0, 0, 0, 1]));
    const samples = [];
    for (let index = 0; index < times.count; index += 1) {
      const yaw = RuntimeGlbLoader.quaternionYawY(RuntimeGlbLoader.accessorVec(rotations, index, [0, 0, 0, 1])) - baseYaw;
      samples.push({
        frame: index,
        t: RuntimeGlbLoader.round((times.values[index] - start) / durationSeconds),
        yaw: RuntimeGlbLoader.round(yaw)
      });
    }
    return {
      object: animation.name || "glb-rotation",
      fps: 24,
      frameStart: 0,
      frameEnd: Math.max(0, samples.length - 1),
      durationSeconds: RuntimeGlbLoader.round(durationSeconds),
      rotationLoop: {
        axis: "y",
        frameCount: 720,
        fps: 24,
        turns: 1,
        source: "blender-authored-720-frame-turn"
      },
      samples
    };
  }

  static identity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  static nodeMatrix(node) {
    if (node.matrix?.length === 16) return [...node.matrix];
    const translation = node.translation || [0, 0, 0];
    const rotation = node.rotation || [0, 0, 0, 1];
    const scale = node.scale || [1, 1, 1];
    return RuntimeGlbLoader.composeTrs(translation, rotation, scale);
  }

  static composeTrs(position, quaternion, scale) {
    const [x, y, z, w] = quaternion;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    return [
      (1 - (yy + zz)) * scale[0], (xy + wz) * scale[0], (xz - wy) * scale[0], 0,
      (xy - wz) * scale[1], (1 - (xx + zz)) * scale[1], (yz + wx) * scale[1], 0,
      (xz + wy) * scale[2], (yz - wx) * scale[2], (1 - (xx + yy)) * scale[2], 0,
      position[0], position[1], position[2], 1
    ];
  }

  static multiply(a, b) {
    const out = new Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        out[column * 4 + row] =
          a[0 * 4 + row] * b[column * 4 + 0] +
          a[1 * 4 + row] * b[column * 4 + 1] +
          a[2 * 4 + row] * b[column * 4 + 2] +
          a[3 * 4 + row] * b[column * 4 + 3];
      }
    }
    return out;
  }

  static transformPoint(matrix, point) {
    const [x, y, z] = point;
    return [
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
    ];
  }

  static transformDirection(matrix, direction) {
    const [x, y, z] = direction;
    return [
      matrix[0] * x + matrix[4] * y + matrix[8] * z,
      matrix[1] * x + matrix[5] * y + matrix[9] * z,
      matrix[2] * x + matrix[6] * y + matrix[10] * z
    ];
  }

  static mapPosition(point, coordinateFrame) {
    if (coordinateFrame === "card-plane") return [point[2], point[1], point[0]];
    return point;
  }

  static mapDirection(direction, coordinateFrame) {
    if (coordinateFrame === "card-plane") return [direction[2], direction[1], direction[0]];
    return direction;
  }

  static normalize(vector) {
    const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
    return [vector[0] / length, vector[1] / length, vector[2] / length];
  }

  static bounds(points) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    points.forEach((point) => {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    });
    return { min, max };
  }

  static boundsCorners(bounds) {
    const [minX, minY, minZ] = bounds.min;
    const [maxX, maxY, maxZ] = bounds.max;
    return [
      [minX, minY, minZ],
      [maxX, minY, minZ],
      [minX, maxY, minZ],
      [maxX, maxY, minZ],
      [minX, minY, maxZ],
      [maxX, minY, maxZ],
      [minX, maxY, maxZ],
      [maxX, maxY, maxZ]
    ];
  }

  static mapBounds(bounds, center, normalizer, coordinateFrame) {
    const points = RuntimeGlbLoader.boundsCorners(bounds).map((point) => RuntimeGlbLoader.mapPosition([
      (point[0] - center[0]) * normalizer,
      (point[1] - center[1]) * normalizer,
      (point[2] - center[2]) * normalizer
    ], coordinateFrame));
    return RuntimeGlbLoader.bounds(points);
  }

  static quaternionYawY(quaternion) {
    const [x, y, z, w] = quaternion;
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
  }

  static round(value) {
    return Math.round(value * 1000000) / 1000000;
  }
}

// src/load-runtime-assets/resolve-runtime-asset-paths-and-preload.js


function getRuntimeAssetBase() {
  if (typeof window === "undefined") return DEFAULT_RUNTIME_ASSET_BASE;
  const configured = window.VALEN_RUNTIME_ASSET_BASE;
  if (typeof configured !== "string" || !configured.trim()) return DEFAULT_RUNTIME_ASSET_BASE;
  return configured.trim().replace(/\/?$/, "/");
}

function resolveRuntimeAssetPath(path) {
  if (typeof path !== "string" || !path) return path;
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }
  if (path.startsWith(DEFAULT_RUNTIME_ASSET_BASE)) {
    return `${getRuntimeAssetBase()}${path.slice(DEFAULT_RUNTIME_ASSET_BASE.length)}`;
  }
  return path;
}

async function importRuntimeModule(specifier) {
  try {
    return await import(specifier);
  } catch (error) {
    const fallbackUrl = RUNTIME_MODULE_IMPORTS[specifier];
    if (!fallbackUrl) throw error;
    console.warn(`Runtime module import map unavailable for ${specifier}; using CDN fallback.`, error);
    return import(fallbackUrl);
  }
}

class RuntimeAssetRegistry {
  constructor(manifest, state) {
    this.assets = manifest.assets.map((asset) => ({ ...asset }));
    this.state = state;
    this.payloads = new Map();
    this.report();
  }

  get total() {
    return this.assets.length;
  }

  get ready() {
    return this.assets.filter((asset) => asset.status === "ready").length;
  }

  async preload() {
    for (const asset of this.assets) {
      asset.status = "loading";
      this.report();
      if (asset.sourcePath && asset.sourcePath.endsWith(".glb")) {
        try {
          const sourcePath = resolveRuntimeAssetPath(asset.sourcePath);
          const response = await fetch(sourcePath);
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          const buffer = await response.arrayBuffer();
          this.payloads.set(asset.id, RuntimeGlbLoader.parse(buffer, {
            id: asset.id,
            sourcePath,
            coordinateFrame: asset.coordinateFrame,
            preserveMeshParts: asset.id?.startsWith("card-"),
            preservePivot: asset.preservePivot
          }));
          asset.status = "ready";
        } catch (error) {
          console.warn(`[Valen runtime] Could not load GLB ${asset.id}; trying JSON fallback`, error);
          try {
            await this.loadJsonAsset(asset);
          } catch (fallbackError) {
            asset.status = "error";
            asset.error = fallbackError.message;
            console.warn(`[Valen runtime] Could not load JSON fallback ${asset.id}`, fallbackError);
          }
        }
      } else if (asset.path) {
        try {
          await this.loadJsonAsset(asset);
        } catch (error) {
          asset.status = "error";
          asset.error = error.message;
          console.warn(`[Valen runtime] Could not load ${asset.id}`, error);
        }
      } else {
        await Promise.resolve();
        asset.status = "ready";
      }
      this.report();
    }
  }

  async loadJsonAsset(asset) {
    if (!asset.path) throw new Error(`No JSON path for ${asset.id}`);
    const sourcePath = resolveRuntimeAssetPath(asset.path);
    const response = await fetch(sourcePath);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    this.payloads.set(asset.id, await response.json());
    asset.status = "ready";
  }

  get(id) {
    return this.payloads.get(id) || null;
  }

  report() {
    this.state.set("assetsLabel", `${this.ready}/${this.total}`);
  }
}

// src/play-runtime-audio/create-reactive-audio-engine.js
class AudioEngine {
  constructor(state) {
    this.state = state;
    this.enabled = false;
    this.energy = 0;
    this.context = null;
    this.analyser = null;
    this.data = null;
  }

  async toggle() {
    if (!this.context) this.create();
    if (this.context.state !== "running") await this.context.resume();
    this.enabled = !this.enabled;
    this.gain.gain.setTargetAtTime(this.enabled ? 0.07 : 0, this.context.currentTime, 0.08);
    this.state.set("audio", this.enabled ? "on" : "off");
    return this.enabled;
  }

  create() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 128;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;

    const low = this.context.createOscillator();
    const high = this.context.createOscillator();
    low.frequency.value = 74;
    high.frequency.value = 149;
    low.type = "sine";
    high.type = "triangle";

    low.connect(this.gain);
    high.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    low.start();
    high.start();
  }

  update() {
    if (!this.enabled || !this.analyser) {
      this.energy *= 0.94;
      return this.energy;
    }
    this.analyser.getByteFrequencyData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i += 1) sum += this.data[i];
    const target = sum / (this.data.length * 255);
    this.energy += (target - this.energy) * 0.08;
    return this.energy;
  }
}

// src/shape-runtime-cards/normalize-cards-and-build-starters.js
function parseRuntimeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeWorkspaceCardType(card = {}) {
  return String(card.card_type || card.cardType || card.type || "work_object");
}

function normalizeWorkspaceCardStatus(card = {}) {
  const status = String(card.status || "focused").toLowerCase();
  if (status === "foreground" || status === "pending") return "focused";
  if (status === "orbit") return "kept";
  return status;
}

function runtimeWorkspaceCardBucket(card = {}) {
  const status = normalizeWorkspaceCardStatus(card);
  const spatialState = runtimeWorkspaceSpatialState(card);
  if (status === "archived" || spatialState.space === "archived") return "archived";
  if (status === "dismissed" || spatialState.space === "dismissed") return "dismissed";
  if (status === "kept" || spatialState.space === "orbit") return "orbit";
  return "foreground";
}

function runtimeWorkspaceSpatialState(card = {}) {
  return parseRuntimeJson(card.spatial_state || card.spatialState, {});
}

function workspaceCardId(card = {}) {
  return String(card.id || card.card_id || card.cardId || card.idempotency_key || "");
}

function cleanRuntimeText(value = "", maxLength = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function runtimeSlug(value = "") {
  return cleanRuntimeText(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "local";
}

function inferRuntimeBusinessProfile(input = {}) {
  return {
    businessType: cleanRuntimeText(input.businessType || input.business_type || "studio", 60),
    market: cleanRuntimeText(input.market || "local", 80),
    goal: cleanRuntimeText(input.goal || input.message || "Improve the local spatial workspace.", 240),
    shouldCreate: true
  };
}

function runtimeStarterCard(cardType, title, body, action, priority, space, cluster) {
  return {
    id: runtimeSlug(`${cardType}-${title}`),
    card_type: cardType,
    title,
    status: space === "orbit" ? "kept" : "focused",
    priority,
    card_data: { title, body, action },
    spatial_state: { space, cluster }
  };
}

function buildRuntimeBusinessStarterCards(input = {}) {
  const profile = inferRuntimeBusinessProfile(input);
  return [
    runtimeStarterCard("site_preview", "Review the local site preview", profile.goal, "Review preview", 100, "foreground", "design"),
    runtimeStarterCard("approval", "Approve the next local experiment", "Changes remain local until you choose to keep them.", "Approve", 80, "foreground", "approvals"),
    runtimeStarterCard("tracker", `${profile.businessType} workspace notes`, "Keep a useful object nearby while you tune the interface.", "Keep nearby", 60, "orbit", "workspace")
  ];
}

function scopeRuntimeCardsToSession(cards = [], sessionId = "") {
  return cards.map((card) => ({
    ...card,
    sessionId: String(sessionId),
    session_id: String(sessionId),
    idempotencyKey: card.idempotencyKey || `session-${sessionId}-${workspaceCardId(card)}`
  }));
}

// src/describe-runtime-scenes/list-runtime-asset-files.js
const CORE_RUNTIME_ASSETS = [
    {
      id: "card-base-asset",
      kind: "exported-blender-glb",
      role: "shared Card-base UI card mesh loaded from operator-authored GLB",
      status: "queued",
      sourcePath: "./assets/valen-card-base.glb",
      coordinateFrame: "card-plane",
      materialProfile: {
        sourceMaterial: "Material.001",
        baseColor: [0.21993541717529297, 0.21993541717529297, 0.21993541717529297, 0.2796478867530823],
        roughness: 0.10000000149011612,
        metallic: 0,
        ior: 1.4500000476837158,
        transmission: 1,
        coatWeight: 0.25,
        coatRoughness: 0.1506030112504959
      }
    },
    {
      id: "card-single-button-asset",
      kind: "exported-blender-glb",
      role: "operator-authored Card-Single-Button profile for one-action runtime cards",
      status: "queued",
      sourcePath: "./assets/valen-card-single-button.glb",
      coordinateFrame: "card-plane",
      materialProfile: {
        sourceMaterial: "Material.001",
        baseColor: [0.21993541717529297, 0.21993541717529297, 0.21993541717529297, 0.2796478867530823],
        roughness: 0.10000000149011612,
        metallic: 0,
        ior: 1.4500000476837158,
        transmission: 1,
        coatWeight: 0.25,
        coatRoughness: 0.1506030112504959
      }
    },
    {
      id: "card-multi-button-asset",
      kind: "exported-blender-glb",
      role: "operator-authored Card-Multi-Button profile for multi-path runtime cards",
      status: "queued",
      sourcePath: "./assets/valen-card-multi-button.glb",
      coordinateFrame: "card-plane",
      materialProfile: {
        sourceMaterial: "Material.001",
        baseColor: [0.21993541717529297, 0.21993541717529297, 0.21993541717529297, 0.2796478867530823],
        roughness: 0.10000000149011612,
        metallic: 0,
        ior: 1.4500000476837158,
        transmission: 1,
        coatWeight: 0.25,
        coatRoughness: 0.1506030112504959
      }
    },
    {
      id: "card-chat-asset",
      kind: "exported-blender-glb",
      role: "operator-authored Card-Chat profile for the card1 runtime card",
      status: "queued",
      sourcePath: "./assets/valen-card-chat.glb",
      coordinateFrame: "card-plane",
      materialProfile: {
        sourceMaterial: "Material.001",
        baseColor: [0.21993541717529297, 0.21993541717529297, 0.21993541717529297, 0.2796478867530823],
        roughness: 0.10000000149011612,
        metallic: 0,
        ior: 1.4500000476837158,
        transmission: 1,
        coatWeight: 0.25,
        coatRoughness: 0.1506030112504959
      }
    },
    {
      id: "card-chat-second-stage-asset",
      kind: "exported-blender-glb",
      role: "operator-authored Card-Chat second-stage profile for card10",
      status: "queued",
      sourcePath: "./assets/valen-card-chat-second-stage.glb",
      coordinateFrame: "card-plane",
      materialProfile: {
        sourceMaterial: "Material.001",
        baseColor: [0.21993541717529297, 0.21993541717529297, 0.21993541717529297, 0.2796478867530823],
        roughness: 0.10000000149011612,
        metallic: 0,
        ior: 1.4500000476837158,
        transmission: 1,
        coatWeight: 0.25,
        coatRoughness: 0.1506030112504959
      }
    },
    {
      id: "center-sculpture-asset",
      kind: "exported-blender-geometry",
      role: "original Valen center sculpture mesh",
      status: "queued",
      sourcePath: "./assets/valen-center-sculpture.glb",
      preservePivot: true
    },
    {
      id: "first-signal-background-landscape",
      kind: "exported-blender-glb",
      role: "First Signal runtime boot landscape background object",
      status: "queued",
      sourcePath: "./assets/valen-loading-background-landscape.glb",
      coordinateFrame: "native"
    },
    {
      id: "first-signal-background-portrait",
      kind: "exported-blender-glb",
      role: "First Signal runtime boot portrait background object",
      status: "queued",
      sourcePath: "./assets/valen-loading-background-portrait.glb",
      coordinateFrame: "native"
    },
    { id: "copy-anchors", kind: "copy-anchor", role: "DOM section binding map", status: "queued" }
  ];

// src/describe-runtime-scenes/define-runtime-object-states.js
const workspaceCard = (id, position, rotation, scale, tone) => ({
  id,
  type: "panel",
  cardNumber: id,
  label: `Workspace ${id}`,
  route: "#card1",
  copyAnchor: `${id}-copy`,
  role: "workspace",
  phaseIds: ["WorkspaceMode"],
  copy: {
    eyebrow: "LOCAL WORKSPACE",
    title: "Work objects loading.",
    body: "The local adapter is bringing the first objects into this space.",
    meta: "LOCAL FIXTURE"
  },
  position,
  rotation,
  scale,
  activeTarget: { position: [0, 0.02, -0.08], rotation: [-0.035, 0.02, -0.012], scale: [1.06, 0.7, 1] },
  cardAssetId: "card-base-asset",
  tone,
  depth: 0.72,
  hitPadding: 0.08,
  cameraTarget: { position: [-0.15, 0.15, 4.35], lookAt: [-0.22, 0.08, -0.2], fov: 40 }
});

const CORE_RUNTIME_OBJECT_STATES = [
  {
    id: "card10",
    type: "panel",
    cardNumber: "card10",
    label: "Local chat",
    route: "#card1",
    copyAnchor: "card10-copy",
    role: "input",
    phaseIds: ["WorkspaceMode"],
    copy: {
      eyebrow: "LOCAL CORE",
      title: "A spatial interface for your AI agents.",
      body: "Use local fixtures to improve the runtime without a hosted account.",
      meta: "LOCAL PLAYGROUND",
      mode: "input",
      field: "Describe a local work object.",
      surface: "floating"
    },
    position: [-1.3, 0.72, -0.15],
    rotation: [-0.08, 0.34, -0.03],
    scale: [1.05, 0.68, 1],
    activeTarget: { position: [0, -0.08, -0.08], rotation: [-0.055, 0.02, -0.018], scale: [1.45, 0.9, 1] },
    cardAssetId: "card-chat-second-stage-asset",
    runtimePanelLayerAssetId: "card-chat-second-stage-asset",
    assetProvidesControls: true,
    tone: [0.57, 0.95, 0.82],
    depth: 0.92,
    hitPadding: 0.08,
    cameraTarget: { position: [-0.15, 0.15, 4.35], lookAt: [-0.22, 0.08, -0.2], fov: 40 }
  },
  workspaceCard("card13", [-1.3, 0.72, -0.15], [-0.08, 0.34, -0.03], [1.05, 0.68, 1], [0.57, 0.95, 0.82]),
  workspaceCard("card14", [1.18, 0.52, -0.26], [0.06, -0.3, 0.03], [1.02, 0.66, 1], [0.78, 0.9, 0.96]),
  workspaceCard("card15", [-0.86, -0.58, -0.88], [0.12, 0.22, -0.06], [0.88, 0.58, 1], [0.84, 0.37, 0.27]),
  workspaceCard("card16", [1.12, -0.82, -0.24], [-0.1, -0.28, 0.06], [0.92, 0.62, 1], [0.91, 0.72, 0.36])
];

// src/describe-runtime-scenes/map-runtime-phases-and-scenes.js
const CORE_RUNTIME_PHASES = {
  WorkspaceMode: {
    id: "WorkspaceMode",
    label: "Workspace",
    defaultCardNumber: "card10",
    defaultObjectState: "card10",
    cardNumbers: ["card10", "card13", "card14", "card15", "card16"],
    objectStates: ["card10", "card13", "card14", "card15", "card16"],
    latentObjectStates: ["card13", "card14", "card15", "card16"],
    spawnableObjectStates: [],
    orbitalRing: {
      enabled: true,
      latentCount: 4,
      center: [0, 0.02, -1.62],
      radiusX: 2.18,
      radiusZ: 0.46,
      speed: 0.11,
      scrollPull: 0.45,
      scale: [0.62, 0.62, 1],
      pitch: -0.035,
      outwardYawOffset: 0
    }
  }
};

const CORE_RUNTIME_PHASE_ALIAS = {
  WorkspaceMode: {
    card10: { alias: "localChat", sceneLabel: "localChat", navLabel: "Workspace", dockLabel: "Local Chat" },
    card13: { alias: "workObjectOne", sceneLabel: "workObjectOne", navLabel: "Object 1", dockLabel: "Work Object" },
    card14: { alias: "workObjectTwo", sceneLabel: "workObjectTwo", navLabel: "Object 2", dockLabel: "Work Object" },
    card15: { alias: "workObjectThree", sceneLabel: "workObjectThree", navLabel: "Object 3", dockLabel: "Work Object" },
    card16: { alias: "workObjectFour", sceneLabel: "workObjectFour", navLabel: "Object 4", dockLabel: "Work Object" }
  }
};

const CORE_RUNTIME_SCENES = [
  {
    id: "card1",
    label: "Local Workspace",
    anchor: "#card1",
    copyAnchor: "card1-copy",
    tone: [0.57, 0.95, 0.82],
    orbit: 0.4,
    performance: { dprMax: 1.75 }
  }
];

// src/describe-runtime-scenes/assemble-core-runtime-manifest.js



const CORE_RUNTIME_MANIFEST = {
  version: "core-public-workspace-v0.1",
  cacheKey: "core-public-local-workspace",
  performance: { targetFPS: 55, minDpr: 1, maxDpr: 1.75 },
  visualProfile: {
    mode: "public-workspace",
    stageBlack: [0.02, 0.02, 0.03],
    accent: [0.45, 0.96, 0.82],
    activeGlass: 0.94,
    latentDim: 0.58,
    copyBoost: 1.22,
    matterDensity: 1.28,
    mediaWash: 1.16,
    spatialTypeIntensity: 0.78,
    stageDepth: 1.26
  },
  assets: CORE_RUNTIME_ASSETS,
  runtimeObjectStates: CORE_RUNTIME_OBJECT_STATES,
  "3druntimePhases": CORE_RUNTIME_PHASES,
  phaseAlias: CORE_RUNTIME_PHASE_ALIAS,
  scenes: CORE_RUNTIME_SCENES
};

function getPhaseAlias(manifest, phaseId, cardNumber) {
  return manifest.phaseAlias?.[phaseId]?.[cardNumber]
    || manifest.phaseAlias?.WorkspaceMode?.[cardNumber]
    || {};
}

function getSceneDisplayLabel(manifest, phaseId, scene) {
  const alias = getPhaseAlias(manifest, phaseId, scene?.id);
  return alias.sceneLabel || scene?.label || scene?.id || "";
}

CORE_RUNTIME_MANIFEST.scenes = CORE_RUNTIME_MANIFEST.scenes.map((scene) => ({
  ...scene,
  camera: { position: [0, 0, 4.8], lookAt: [0, 0, 0], fov: 42, orbit: 0.2 },
  layers: [],
  assetIds: ["copy-anchors"],
  transition: { type: "crossfade", duration: 0.8, ease: "sine" },
  stageGrammar: "local-workspace"
}));

// src/own-runtime-state-and-dom/own-runtime-dom-and-state-mirror.js


function getRuntimeBootConfig() {
  if (typeof window === "undefined") return {};
  const configured = window.VALEN_RUNTIME_BOOT;
  return configured && typeof configured === "object" ? configured : {};
}

function runtimeObjectById(objectId = "") {
  return CORE_RUNTIME_MANIFEST.runtimeObjectStates.find((object) => object.id === objectId) || null;
}

function resolveBootObjectCardNumber(config = {}) {
  const object = runtimeObjectById(config.activeObjectId || config.activeObjectState || config.initialActiveObjectId);
  if (object?.cardNumber) return object.cardNumber;
  if (typeof config.activeCardNumber === "string" && config.activeCardNumber.trim()) return config.activeCardNumber.trim();
  if (typeof config.activeCard === "string" && config.activeCard.trim()) return config.activeCard.trim();
  return null;
}

function applyRuntimeBootConfig(stageDirector, state, reason = "boot-config") {
  const config = getRuntimeBootConfig();
  const phaseId = config.initialPhase || config.phaseId || config.lockedPhase || "WorkspaceMode";
  const cardNumber = resolveBootObjectCardNumber(config) || "card10";
  if (!stageDirector) return null;

  const stagePhase = stageDirector.setExperiencePhase(phaseId, cardNumber);
  const activeObjectId = stagePhase?.activeObjectState || runtimeObjectById(config.activeObjectId)?.id || null;
  if (activeObjectId) document.body.dataset.valenActiveObjectId = activeObjectId;
  document.body.dataset.valenRuntimeBootPhase = phaseId;
  state.set("runtimeLastAction", `boot:${phaseId}:${activeObjectId || cardNumber}:${reason}`);
  return stagePhase;
}

function runtimeStoredFlag(key, fallback = false) {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage?.getItem(key) === "1";
  } catch {
    return fallback;
  }
}

function setRuntimeStoredFlag(key, enabled = false) {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage?.setItem(key, "1");
    else window.localStorage?.removeItem(key);
  } catch {}
}

function ensureRuntimeStateMirror() {
  if (typeof document === "undefined" || !document.body) return null;
  let node = document.getElementById("valen-runtime-state");
  if (!node) {
    node = document.createElement("section");
    node.id = "valen-runtime-state";
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("data-no-gl-click", "true");
    node.style.display = "none";
    document.body.appendChild(node);
  }
  return node;
}

function updateRuntimeStateMirror(detail = {}) {
  const node = ensureRuntimeStateMirror();
  if (!node) return null;
  const existingState = parseRuntimeJson(node.querySelector("[data-valen-runtime-state]")?.textContent, {});
  const cards = Array.isArray(detail.cards) ? detail.cards : Array.isArray(existingState.cards) ? existingState.cards : [];
  const phaseId = detail.phaseId || detail.phase || document.body.dataset.valencorePhase || "WorkspaceMode";
  const activeCard = detail.activeCard || detail.scene || document.body.dataset.runtimeScene || "";
  const activeObjectId = detail.activeObjectId || document.body.dataset.valenActiveObjectId || "";

  document.body.dataset.valencorePhase = phaseId;
  if (activeCard) document.body.dataset.runtimeScene = activeCard;
  if (activeObjectId) document.body.dataset.valenActiveObjectId = activeObjectId;

  node.dataset.valencorePhase = phaseId;
  node.dataset.runtimeScene = activeCard;
  node.dataset.activeObjectId = activeObjectId;
  node.dataset.cardCount = String(cards.length);
  node.replaceChildren();

  const json = document.createElement("script");
  json.type = "application/json";
  json.dataset.valenRuntimeState = "true";
  json.textContent = JSON.stringify({
    phaseId,
    activeCard,
    activeObjectId,
    reason: detail.reason || "",
    bridgeReady: !!window.ValenWorkspace,
    cards: cards.map(toMirrorCard)
  });
  node.appendChild(json);

  cards.forEach((card) => {
    const mirrorCard = toMirrorCard(card);
    const marker = document.createElement("span");
    marker.dataset.valenCardId = mirrorCard.id;
    marker.dataset.valenCardType = mirrorCard.type;
    marker.dataset.valenCardStatus = mirrorCard.status;
    marker.dataset.valenCardBucket = mirrorCard.bucket;
    marker.dataset.valenCardTitle = mirrorCard.title;
    marker.setAttribute("aria-hidden", "true");
    node.appendChild(marker);
  });
  return node;
}

function toMirrorCard(card) {
  const cardData = parseRuntimeJson(card.card_data || card.cardData || card.data, {});
  return {
    id: String(workspaceCardId(card)),
    type: normalizeWorkspaceCardType(card),
    status: normalizeWorkspaceCardStatus(card),
    bucket: runtimeWorkspaceCardBucket(card),
    title: cardData.title || card.title || "",
    spatial_state: parseRuntimeJson(card.spatial_state || card.spatialState, null)
  };
}

// src/own-runtime-state-and-dom/detect-browser-runtime-capabilities.js

function detectRuntimeCapabilities() {
  const canvas = document.createElement("canvas");
  const webgl2 = !!canvas.getContext("webgl2", { antialias: true });
  const webgl1 = !!canvas.getContext("webgl", { antialias: true }) || !!canvas.getContext("experimental-webgl", { antialias: true });
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrowViewport = window.matchMedia("(max-width: 920px)").matches;
  const shortViewport = window.innerHeight < 820;
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const mobileDevice = coarsePointer || touchPoints > 0;
  const portraitViewport = window.innerHeight > window.innerWidth;
  const compactViewport = window.innerWidth <= 820 || (narrowViewport && window.innerHeight <= 1060) || (portraitViewport && window.innerWidth <= 920);
  const compactStageFit = compactViewport;
  const mobileSafari = mobileDevice &&
    /safari/i.test(window.navigator?.userAgent || "") &&
    !/(chrome|chromium|crios|fxios|edg)/i.test(window.navigator?.userAgent || "");
  const mobileOptimized = mobileDevice;
  return {
    webgl2,
    webgl1,
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    reducedMotion,
    audioContext: !!AudioContext,
    coarsePointer,
    touchPoints,
    mobileDevice,
    mobileSafari,
    compactViewport,
    compactStageFit,
    mobileOptimized,
    dpr: Math.min(window.devicePixelRatio || 1, CORE_RUNTIME_MANIFEST.performance.maxDpr)
  };
}

// src/own-runtime-state-and-dom/share-observable-runtime-state.js
class RuntimeState {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
    this.listeners = new Map();
  }

  get(key) {
    return this.values.get(key);
  }

  set(key, value) {
    this.values.set(key, value);
    const listeners = this.listeners.get(key);
    if (listeners) listeners.forEach((listener) => listener(value));
  }

  bind(key, listener) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(listener);
    listener(this.get(key));
    return () => this.listeners.get(key).delete(listener);
  }
}

// src/describe-runtime-scenes/configure-stage-layout-and-camera.js
const TAU = Math.PI * 2;
const SLOT_SEQUENCE = ["left-depth", "right-depth", "low-depth", "far-center"];

const STAGE_LATENT_SLOTS = {
  "left-depth": { position: [-1.72, 0.18, -0.64], rotation: [0.02, 0.52, -0.035], scale: [1.08, 0.66, 1] },
  "right-depth": { position: [1.74, 0.2, -0.7], rotation: [0.02, -0.54, 0.035], scale: [1.08, 0.66, 1] },
  "low-depth": { position: [-1.08, -1.04, -0.96], rotation: [0.12, 0.32, -0.05], scale: [0.9, 0.56, 1] },
  "far-center": { position: [0.28, -1.34, -1.26], rotation: [0.12, -0.08, 0.025], scale: [0.84, 0.52, 1] }
};

const CARD_ORBIT_RING = {
  enabled: true,
  latentCount: 4,
  center: [0, 0.02, -1.62],
  radiusX: 2.18,
  radiusZ: 0.46,
  speed: 0.11,
  scrollPull: 0.45,
  scale: [0.62, 0.62, 1],
  pitch: -0.035,
  outwardYawOffset: 0
};

const CARD_RIBBON_HANDOFF = {
  enterSide: -1,
  exitSide: 1,
  x: 2.04,
  y: -0.2,
  z: -1.18,
  yaw: 1.06,
  pitch: -0.055,
  roll: 0.07,
  scale: 0.68,
  hold: 0.38
};

const DEFAULT_STAGE_ZONES = {
  card10: [
    { id: "primaryCta", label: "Add fixture", action: "click", rect: [0.075, 0.04, 0.2, 0.12], visualRect: [0.075, 0.04, 0.2, 0.12] },
    { id: "input", label: "Fixture field", action: "focus", rect: [0.29, 0.04, 0.66, 0.12], visualRect: [0.29, 0.04, 0.66, 0.12] }
  ],
  card13: [{ id: "primaryCta", label: "Keep", action: "workspaceAction", verb: "keep", rect: [0.08, 0.15, 0.36, 0.16], visualRect: [0.075, 0.245, 0.34, 0.16] }],
  card14: [{ id: "primaryCta", label: "Keep", action: "workspaceAction", verb: "keep", rect: [0.08, 0.15, 0.36, 0.16], visualRect: [0.075, 0.245, 0.34, 0.16] }],
  card15: [{ id: "primaryCta", label: "Keep", action: "workspaceAction", verb: "keep", rect: [0.08, 0.15, 0.36, 0.16], visualRect: [0.075, 0.245, 0.34, 0.16] }],
  card16: [{ id: "primaryCta", label: "Keep", action: "workspaceAction", verb: "keep", rect: [0.08, 0.15, 0.36, 0.16], visualRect: [0.075, 0.245, 0.34, 0.16] }]
};

const ACTIVE_STAGE_POSES = {
  card1: {
    position: [0, -0.08, -0.08],
    rotation: [-0.055, 0.02, -0.018],
    scale: [1.45, 0.9, 1]
  }
};

const STAGE_COMPOSITION_PROFILES = {
  card10: {
    label: "local-workspace-chat",
    phoneScale: 0.96,
    orbitalRing: CARD_ORBIT_RING,
    latentVisibility: 0.56,
    latentHoverVisibility: 0.78,
    latentCopy: 0.42,
    hoverLatentCopy: 0.72,
    focusPush: 0.02,
    activePose: ACTIVE_STAGE_POSES.card1,
    compactFit: {
      preserveFocusCamera: true,
      activePose: {
        position: [0, -0.08, -0.08],
        rotation: [-0.055, 0.02, -0.018],
        scale: [0.9, 0.9, 1]
      }
    }
  }
};

const MOBILE_ACTIVE_CARD_SCALE = 0.94;

// Locked stage anchor: keep the center sculpture visually planted while cards move around it.
const MOBILE_ROOMY_STAGE_CAMERA = {
  position: [0.02, 0.22, 4.62],
  lookAt: [0.02, 0.28, -0.28],
  fov: 42.4
};

const MOBILE_FIXED_STAGE_CAMERA = {
  position: [0.02, 0.24, 4.95],
  lookAt: [0.02, 0.28, -0.28],
  fov: 46
};

// src/describe-runtime-scenes/compose-stage-scenes-and-objects.js


CORE_RUNTIME_MANIFEST.scenes = CORE_RUNTIME_MANIFEST.scenes.map((scene) => ({
  ...scene,
  stageComposition: STAGE_COMPOSITION_PROFILES[scene.id] || {
    label: `${scene.id}-stage`,
    latentVisibility: 0.34,
    latentHoverVisibility: 0.54,
    latentCopy: 0.022,
    hoverLatentCopy: 0.16,
    hideLatentCards: true,
    orbitalRing: CARD_ORBIT_RING,
    focusPush: 0.14,
    compactFit: {
      activePoseDelta: {
        position: [0.58, 0.62, 0.02],
        scale: [0.9, 0.9, 1]
      },
      camera: {
        xBias: 0.08,
        yBias: 0.1,
        zBias: -0.06,
        lookAtXBias: 0.06,
        lookAtYBias: 0.24,
        fovBias: -0.25,
        retreatScale: 0.6,
        liftY: 0.01,
        fovScale: 2.2
      }
    }
  }
}));

CORE_RUNTIME_MANIFEST.runtimeObjectStates = CORE_RUNTIME_MANIFEST.runtimeObjectStates.map((object, index) => {
  const slot = SLOT_SEQUENCE[index % SLOT_SEQUENCE.length];
  const composition = STAGE_COMPOSITION_PROFILES[object.cardNumber] || {};
  return {
    ...object,
    priority: object.priority ?? index,
    stage: {
      composition,
      spatialSlot: slot,
      activePose: composition.activePose || ACTIVE_STAGE_POSES[object.cardNumber] || object.activeTarget,
      compactFit: composition.compactFit || null,
      latentPose: {
        ...STAGE_LATENT_SLOTS[slot]
      }
    },
    interactionZones: object.interactionZones ?? DEFAULT_STAGE_ZONES[object.cardNumber] ?? [
      { id: "primaryCta", label: object.label, action: "route", route: object.route, rect: [0.08, 0.16, 0.36, 0.16] }
    ],
    spatialType: {
      enabled: !!object.copy,
      eyebrow: object.copy?.eyebrow || object.label,
      title: object.copy?.title || object.label,
      body: object.copy?.body || "",
      meta: object.copy?.meta || object.route,
      style: "holographic"
    },
    materialProfile: {
      waveStrength: object.role === "pricing" ? 0.34 : object.role === "input" ? 0.86 : 0.72,
      copyBoost: object.role === "pricing" ? 1.36 : object.role === "input" ? 1.24 : 1.12,
      latentDim: object.role === "pricing" ? 0.56 : object.role === "story" ? 0.52 : 0.44,
      chapterSnap: object.role === "pricing" ? 1.34 : object.role === "input" ? 1.18 : 1.08
    }
  };
});

// src/calculate-runtime-values/calculate-runtime-geometry-and-easing.js

const RuntimeMath = {
  clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  },

  smoothstep(edge0, edge1, value) {
    const t = RuntimeMath.clamp((value - edge0) / Math.max(0.00001, edge1 - edge0));
    return t * t * (3 - 2 * t);
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  easeOutCubic(t) {
    const p = 1 - RuntimeMath.clamp(t);
    return 1 - p * p * p;
  },

  easeInOutCubic(t) {
    const p = RuntimeMath.clamp(t);
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  },

  lerpVec3(out, a, b, t) {
    out[0] = RuntimeMath.lerp(a[0], b[0], t);
    out[1] = RuntimeMath.lerp(a[1], b[1], t);
    out[2] = RuntimeMath.lerp(a[2], b[2], t);
    return out;
  },

  lerpAngle(a, b, t) {
    const delta = ((((b - a) + Math.PI) % TAU) + TAU) % TAU - Math.PI;
    return a + delta * t;
  },

  lerpEuler(out, a, b, t) {
    out[0] = RuntimeMath.lerpAngle(a[0], b[0], t);
    out[1] = RuntimeMath.lerpAngle(a[1], b[1], t);
    out[2] = RuntimeMath.lerpAngle(a[2], b[2], t);
    return out;
  },

  mixVec3(a, b, t) {
    return [
      RuntimeMath.lerp(a[0], b[0], t),
      RuntimeMath.lerp(a[1], b[1], t),
      RuntimeMath.lerp(a[2], b[2], t)
    ];
  },

  mixEuler(a, b, t) {
    return [
      RuntimeMath.lerpAngle(a[0], b[0], t),
      RuntimeMath.lerpAngle(a[1], b[1], t),
      RuntimeMath.lerpAngle(a[2], b[2], t)
    ];
  },

  perspective(out, fov, aspect, near = 0.1, far = 80) {
    const f = 1 / Math.tan((fov * Math.PI) / 360);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },

  lookAt(out, eye, center, up = [0, 1, 0]) {
    let zx = eye[0] - center[0];
    let zy = eye[1] - center[1];
    let zz = eye[2] - center[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len;
    zy /= len;
    zz /= len;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len;
    xy /= len;
    xz /= len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx;
    out[1] = yx;
    out[2] = zx;
    out[3] = 0;
    out[4] = xy;
    out[5] = yy;
    out[6] = zy;
    out[7] = 0;
    out[8] = xz;
    out[9] = yz;
    out[10] = zz;
    out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  },

  multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  },

  compose(out, position, rotation, scale) {
    const sx = Math.sin(rotation[0] * 0.5);
    const cx = Math.cos(rotation[0] * 0.5);
    const sy = Math.sin(rotation[1] * 0.5);
    const cy = Math.cos(rotation[1] * 0.5);
    const sz = Math.sin(rotation[2] * 0.5);
    const cz = Math.cos(rotation[2] * 0.5);
    const x = sx * cy * cz + cx * sy * sz;
    const y = cx * sy * cz - sx * cy * sz;
    const z = cx * cy * sz + sx * sy * cz;
    const w = cx * cy * cz - sx * sy * sz;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    out[0] = (1 - (yy + zz)) * scale[0];
    out[1] = (xy + wz) * scale[0];
    out[2] = (xz - wy) * scale[0];
    out[3] = 0;
    out[4] = (xy - wz) * scale[1];
    out[5] = (1 - (xx + zz)) * scale[1];
    out[6] = (yz + wx) * scale[1];
    out[7] = 0;
    out[8] = (xz + wy) * scale[2];
    out[9] = (yz - wx) * scale[2];
    out[10] = (1 - (xx + yy)) * scale[2];
    out[11] = 0;
    out[12] = position[0];
    out[13] = position[1];
    out[14] = position[2];
    out[15] = 1;
    return out;
  },

  projectPoint(matrix, point) {
    const x = point[0], y = point[1], z = point[2];
    const tx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const ty = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    const tz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    const tw = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    if (Math.abs(tw) < 0.00001) return null;
    return { x: tx / tw, y: ty / tw, z: tz / tw };
  }
};

// src/read-runtime-inputs/translate-inputs-to-runtime-actions.js

class RuntimeInteractionKernel {
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

// src/select-runtime-scene/choose-scene-from-scroll-position.js
class RuntimeSceneController {
  constructor(manifest) {
    this.manifest = manifest;
  }

  getActiveScene() {
    const viewportAnchor = window.innerHeight * 0.45;
    const pageProgress = this.getPageProgress();
    let activeIndex = 0;
    let localProgress = 0;

    this.manifest.scenes.forEach((scene, index) => {
      const element = document.querySelector(scene.anchor);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if (rect.top <= viewportAnchor) {
        activeIndex = index;
        const span = Math.max(1, rect.height + window.innerHeight);
        localProgress = Math.max(0, Math.min(1, (viewportAnchor - rect.top) / span));
      }
    });

    return {
      scene: this.manifest.scenes[activeIndex],
      index: activeIndex,
      progress: localProgress,
      pageProgress
    };
  }

  getPageProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
  }
}

// src/choreograph-stage-state/choreograph-phases-foreground-and-orbit.js

class RuntimeStageDirector {
  constructor(manifest, state) {
    this.manifest = manifest;
    this.state = state;
    this.objects = manifest.runtimeObjectStates.filter((object) => object.type === "panel");
    this.objectsById = new Map(this.objects.map((object) => [object.id, object]));
    this.runtimePhases = manifest["3druntimePhases"] || {};
    this.timings = { preRoll: 160, handoff: 240, present: 520, settle: 320 };
    this.phaseOrder = ["preRoll", "handoff", "present", "settle", "idle"];
    this.activePhaseId = state.get("activePhaseId") || "WorkspaceMode";
    this.activeObjectState = this.getPrimaryObject(this.manifest.scenes[0]?.id, this.activePhaseId)?.id || this.objects[0]?.id || null;
    this.activeCardOverride = null;
    this.previousObjectId = null;
    this.previousSceneIndex = 0;
    this.lastPageProgress = 0;
    this.scrollDirection = 1;
    this.scrollVelocity = 0;
    this.hoverObjectId = null;
    this.hoverZoneId = null;
    this.transitionPhase = "idle";
    this.elapsed = 0;
    this.handoffDirection = 1;
    this.reverseReacquire = false;
    this.completedHandoffObjectId = null;
    this.stagePhase = this.createState(this.manifest.scenes[0], 0, 0);
    this.report();
  }

  setHover(target) {
    this.hoverObjectId = target?.id || null;
    this.hoverZoneId = target?.zone?.id || null;
    if (this.stagePhase) {
      this.stagePhase.hoverObjectId = this.hoverObjectId;
      this.stagePhase.hoverZoneId = this.hoverZoneId;
      this.stagePhase.interactionMode = this.hoverZoneId ? "zone" : this.hoverObjectId ? "mesh" : "scene";
      this.stagePhase.materialFocus = {
        ...this.stagePhase.materialFocus,
        hoverObjectId: this.hoverObjectId,
        zoneId: this.hoverZoneId,
        intensity: RuntimeMath.clamp((this.stagePhase.materialFocus?.intensity || 0) + (this.hoverObjectId ? 0.18 : 0), 0, 1)
      };
    }
    this.report();
  }

  update(active, dt) {
    const scene = active.scene || this.manifest.scenes[0];
    const overrideCardNumber = this.activeCardOverride?.phaseId === this.activePhaseId && scene.id === "card1"
      ? this.activeCardOverride.cardNumber
      : null;
    const primaryObject = this.getPrimaryObject(overrideCardNumber || scene.id, this.activePhaseId);
    const pageProgress = active.pageProgress || 0;
    const scrollDelta = pageProgress - this.lastPageProgress;
    const scrollVelocityTarget = RuntimeMath.clamp(scrollDelta * (1000 / Math.max(1, dt)) * 1.8, -1, 1);
    this.scrollVelocity = RuntimeMath.lerp(this.scrollVelocity || 0, scrollVelocityTarget, scrollVelocityTarget === 0 ? 0.16 : 0.34);
    this.scrollDirection = Math.sign(scrollDelta) || this.scrollDirection || 1;
    this.lastPageProgress = pageProgress;
    if (primaryObject?.id !== this.activeObjectState) {
      const previous = this.objectsById.get(this.activeObjectState);
      this.completedHandoffObjectId = null;
      this.previousObjectId = this.activeObjectState;
      this.activeObjectState = primaryObject?.id || null;
      const indexDirection = Math.sign((active.index ?? 0) - this.previousSceneIndex);
      this.handoffDirection = indexDirection || this.scrollDirection || Math.sign((primaryObject?.priority ?? 0) - (previous?.priority ?? 0)) || 1;
      this.reverseReacquire = indexDirection < 0 || (!indexDirection && this.scrollDirection < 0);
      this.previousSceneIndex = active.index ?? this.previousSceneIndex;
      this.transitionPhase = "preRoll";
      this.elapsed = 0;
    } else if (this.transitionPhase !== "idle") {
      this.elapsed += dt;
      this.advancePhase();
    }
    this.stagePhase = this.createState(scene, active.progress || 0, active.pageProgress || 0, this.completedHandoffObjectId);
    this.completedHandoffObjectId = null;
    this.report();
    return this.stagePhase;
  }

  getState() {
    return this.stagePhase;
  }

  getPhaseConfig(phaseId = this.activePhaseId) {
    return this.runtimePhases[phaseId] || this.runtimePhases.WorkspaceMode || null;
  }

  getPhaseObjects(phaseId = this.activePhaseId) {
    const phase = this.getPhaseConfig(phaseId);
    const explicitObjectStates = Array.isArray(phase?.objectStates)
      ? new Set(phase.objectStates)
      : null;
    const explicitCardNumbers = Array.isArray(phase?.cardNumbers)
      ? new Set(phase.cardNumbers)
      : null;
    return this.objects.filter((object) => explicitObjectStates
      ? explicitObjectStates.has(object.id)
      : explicitCardNumbers
        ? explicitCardNumbers.has(object.cardNumber)
        : !Array.isArray(object.phaseIds) || object.phaseIds.includes(phaseId));
  }

  getPrimaryObject(cardNumber, phaseId = this.activePhaseId) {
    const phase = this.getPhaseConfig(phaseId);
    const phaseObjects = this.getPhaseObjects(phaseId);
    return phaseObjects.find((object) => object.cardNumber === cardNumber)
      || phaseObjects.find((object) => object.id === phase?.defaultObjectState)
      || phaseObjects.find((object) => object.cardNumber === phase?.defaultCardNumber)
      || phaseObjects[0]
      || null;
  }

  setExperiencePhase(phaseId = "WorkspaceMode", cardNumber = null) {
    const phase = this.getPhaseConfig(phaseId);
    if (!phase) return this.stagePhase;
    const targetCardNumber = cardNumber || phase.defaultCardNumber || this.manifest.scenes[0]?.id || "card1";
    const primaryObject = this.getPrimaryObject(targetCardNumber, phaseId);
    if (!primaryObject) return this.stagePhase;
    this.activeCardOverride = cardNumber ? { phaseId, cardNumber: targetCardNumber } : null;
    if (phaseId !== this.activePhaseId || primaryObject.id !== this.activeObjectState) {
      this.previousObjectId = this.activeObjectState;
      this.completedHandoffObjectId = null;
      this.activePhaseId = phaseId;
      this.activeObjectState = primaryObject.id;
      this.transitionPhase = "preRoll";
      this.elapsed = 0;
      this.reverseReacquire = false;
      this.handoffDirection = 1;
    } else {
      this.activePhaseId = phaseId;
      this.activeObjectState = primaryObject.id;
    }
    this.state.set("activePhaseId", this.activePhaseId);
    const currentScene = this.manifest.scenes.find((scene) => scene.id === this.stagePhase?.activeCardNumber)
      || this.manifest.scenes.find((scene) => scene.id === targetCardNumber)
      || this.manifest.scenes.find((scene) => scene.id === "card1")
      || this.manifest.scenes[0];
    this.stagePhase = this.createState(
      currentScene,
      this.stagePhase?.sceneProgress || 0,
      this.stagePhase?.pageProgress || 0,
      this.completedHandoffObjectId
    );
    this.report();
    return this.stagePhase;
  }

  advancePhase() {
    while (this.transitionPhase !== "idle") {
      const duration = this.timings[this.transitionPhase] || 0;
      if (this.elapsed < duration) return;
      this.elapsed -= duration;
      const index = this.phaseOrder.indexOf(this.transitionPhase);
      this.transitionPhase = this.phaseOrder[index + 1] || "idle";
      if (this.transitionPhase === "idle") {
        this.elapsed = 0;
        this.completedHandoffObjectId = this.previousObjectId;
        this.previousObjectId = null;
        this.reverseReacquire = false;
      }
    }
  }

  getPhaseProgress() {
    if (this.transitionPhase === "idle") return 1;
    const duration = this.timings[this.transitionPhase] || 1;
    return RuntimeMath.clamp(this.elapsed / duration);
  }

  getTransitionEase() {
    const progress = this.getPhaseProgress();
    if (this.transitionPhase === "preRoll") return RuntimeMath.easeInOutCubic(progress) * 0.16;
    if (this.transitionPhase === "handoff") return 0.16 + RuntimeMath.easeInOutCubic(progress) * 0.42;
    if (this.transitionPhase === "present") return 0.58 + RuntimeMath.easeOutCubic(progress) * 0.42;
    if (this.transitionPhase === "settle") return 1 - (1 - RuntimeMath.easeInOutCubic(progress)) * 0.08;
    return 1;
  }

  createState(scene, sceneProgress, pageProgress, completedHandoffObjectId = null) {
    const activePhase = this.getPhaseConfig(this.activePhaseId);
    const phaseObjects = this.getPhaseObjects(this.activePhaseId);
    const currentObject = this.objectsById.get(this.activeObjectState);
    const activeObject = currentObject && phaseObjects.includes(currentObject)
      ? currentObject
      : this.getPrimaryObject(scene.id, this.activePhaseId);
    const objectStageComposition = activeObject?.stage?.composition || null;
    const stageComposition = objectStageComposition && activeObject?.cardNumber !== scene.id
      ? objectStageComposition
      : scene.stageComposition || objectStageComposition || {};
    const phaseLatents = stageComposition.suppressPhaseLatents && this.activePhaseId !== "WorkspaceMode"
      ? []
      : Array.isArray(activePhase?.latentObjectStates)
      ? activePhase.latentObjectStates
        .map((id) => this.objectsById.get(id))
        .filter((object) => object && object.id !== activeObject?.id)
      : null;
    const authoredLatents = Array.isArray(stageComposition.featuredLatents)
      ? stageComposition.featuredLatents
        .map((id) => this.objectsById.get(id))
        .filter((object) => object && object.id !== activeObject?.id && (!Array.isArray(object.phaseIds) || object.phaseIds.includes(this.activePhaseId)))
      : null;
    const latentObjects = (authoredLatents || phaseLatents || phaseObjects
      .filter((object) => object.id !== activeObject?.id)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))).slice(0, stageComposition.featuredLatents ? 5 : phaseObjects.length);
    const orbitRing = {
      ...(stageComposition.orbitalRing || {}),
      ...(activePhase?.orbitalRing || {})
    };
    const renderStageComposition = {
      ...stageComposition,
      orbitalRing: orbitRing
    };
    const visualLatents = orbitRing.enabled
      ? latentObjects.slice(0, orbitRing.latentCount || 5)
      : stageComposition.hideLatentCards ? [] : latentObjects;
    const drawOrder = [...new Set([
      ...visualLatents.map((object) => object.id),
      this.transitionPhase !== "idle" && this.previousObjectId !== activeObject?.id ? this.previousObjectId : null,
      activeObject?.id
    ].filter(Boolean))];
    const phaseProgress = this.getPhaseProgress();
    const transitionEase = this.getTransitionEase();
    const cameraTarget = this.buildCameraTarget(scene, activeObject, transitionEase);
    const beatIntensity = this.getBeatIntensity();
    const focusLock = !!activeObject;
    const sceneIndex = Math.max(0, this.manifest.scenes.findIndex((entry) => entry.id === scene.id));
    const cameraOrbit = scene.camera?.orbit ?? scene.orbit ?? 0;

    return {
      activePhaseId: this.activePhaseId,
      activeCardNumber: activeObject?.cardNumber || activePhase?.defaultCardNumber || scene.id,
      activeObjectState: activeObject?.id || null,
      previousObjectId: this.previousObjectId,
      completedHandoffObjectId,
      hoverObjectId: this.hoverObjectId,
      hoverZoneId: this.hoverZoneId,
      latentObjectStates: visualLatents.map((object) => object.id),
      drawOrder,
      transitionPhase: this.transitionPhase,
      transitionProgress: phaseProgress,
      transitionEase,
      beatIntensity,
      focusLock,
      sceneIndex,
      pageProgress,
      cameraOrbit,
      handoffDirection: this.handoffDirection,
      reverseReacquire: this.reverseReacquire,
      scrollDirection: this.scrollDirection,
      scrollVelocity: this.scrollVelocity,
      stageGrammar: scene.stageGrammar || "card1-object",
      stageComposition: renderStageComposition,
      cameraTarget,
      interactionMode: this.hoverZoneId ? "zone" : this.hoverObjectId ? "mesh" : "scene",
      materialFocus: {
        objectId: activeObject?.id || null,
        hoverObjectId: this.hoverObjectId,
        zoneId: this.hoverZoneId,
        intensity: RuntimeMath.clamp((activeObject ? 0.42 : 0) + transitionEase * 0.38 + beatIntensity * 0.2 + (this.hoverObjectId ? 0.28 : 0), 0, 1),
        beat: beatIntensity
      },
      sceneProgress,
      pageProgress
    };
  }

  getBeatIntensity() {
    const progress = this.getPhaseProgress();
    if (this.transitionPhase === "preRoll") return 0.24 + RuntimeMath.easeInOutCubic(progress) * 0.28;
    if (this.transitionPhase === "handoff") return 0.54 + Math.sin(RuntimeMath.clamp(progress) * Math.PI) * 0.28;
    if (this.transitionPhase === "present") return 0.18 + (1 - RuntimeMath.easeOutCubic(progress)) * 0.42;
    if (this.transitionPhase === "settle") return Math.sin(progress * Math.PI) * 0.18;
    return 0;
  }

  buildCameraTarget(scene, activeObject, ease) {
    const base = scene.camera || this.manifest.scenes[0].camera;
    const focus = activeObject?.cameraTarget || base;
    const phase = this.transitionPhase;
    const reverseBias = this.reverseReacquire ? 1 : 0;
    const position = [...(focus.position || base.position)];
    const lookAt = [...(focus.lookAt || base.lookAt)];
    let fov = focus.fov || base.fov || 42;
    if (phase === "preRoll") {
      position[0] -= this.handoffDirection * (reverseBias ? 0.08 : 0.12) * (1 - ease);
      position[1] += 0.028 * (1 - ease);
      position[2] += (reverseBias ? 0.46 : 0.68) * (1 - ease);
      fov += (reverseBias ? 3.2 : 5.1) * (1 - ease);
    } else if (phase === "handoff") {
      position[0] += this.handoffDirection * (reverseBias ? 0.06 : 0.1) * (1 - ease);
      position[1] += 0.016 * (1 - ease);
      position[2] += (reverseBias ? 0.18 : 0.28) * (1 - ease);
      fov += (reverseBias ? 1.4 : 2.1) * (1 - ease);
    } else if (phase === "present") {
      position[0] += this.handoffDirection * 0.05 * (1 - ease);
      position[2] += 0.18 * (1 - ease);
      fov += 1.2 * (1 - ease);
    } else if (phase === "settle") {
      position[0] += Math.sin(ease * Math.PI) * 0.025;
      position[1] += Math.sin(ease * Math.PI) * 0.018;
    } else {
      const drift = Math.sin(performance.now() * 0.00022 + (activeObject?.priority || 0)) * 0.025;
      position[0] += drift;
      position[1] += drift * 0.55;
    }
    return { position, lookAt, fov };
  }

  report() {
    const draw = this.stagePhase?.drawOrder || [];
    this.state.set("activePhaseId", this.activePhaseId || "WorkspaceMode");
    this.state.set("activeCardNumber", this.stagePhase?.activeCardNumber || "card1");
    this.state.set("activeObjectState", this.stagePhase?.activeObjectState || "none");
    this.state.set("activeLabel", this.activeObjectState || "none");
    this.state.set("hoverLabel", this.hoverZoneId ? `${this.hoverObjectId}:${this.hoverZoneId}` : this.hoverObjectId || "none");
    this.state.set("transitionPhaseLabel", this.transitionPhase);
    this.state.set("drawLabel", draw.length ? draw.slice(-5).join(" > ") : "none");
  }
}

// src/call-valen-gateway/remember-runtime-session.js
function normalizeValenRuntimeSessionId(value) {
  return String(value || "").trim();
}

function readValenRuntimeQuerySessionId() {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeValenRuntimeSessionId(
      params.get("sessionId") || params.get("valenSessionId") || params.get("valen_session_id") || ""
    );
  } catch {
    return "";
  }
}

function readValenStoredRuntimeSessionId(key) {
  try {
    return normalizeValenRuntimeSessionId(window.localStorage?.getItem(key) || "");
  } catch {
    return "";
  }
}

function isNumericValenRuntimeSessionId(value) {
  return /^\d+$/.test(normalizeValenRuntimeSessionId(value));
}

function createValenRuntimeSessionId() {
  return String(100000 + Math.floor(Math.random() * 900000));
}

function persistValenRuntimeSessionId(sessionId) {
  const next = normalizeValenRuntimeSessionId(sessionId);
  if (!next) return "";
  try {
    window.localStorage?.setItem("valen:agent-chat-session", next);
    window.localStorage?.setItem("valen_session_id", next);
  } catch {}
  window.sessionId = next;
  window.__SESSION_ID__ = next;
  return next;
}

function getValenChatSessionId() {
  const explicit = readValenRuntimeQuerySessionId()
    || normalizeValenRuntimeSessionId(window.sessionId)
    || normalizeValenRuntimeSessionId(window.__SESSION_ID__);
  if (explicit) return persistValenRuntimeSessionId(explicit);

  const stored = readValenStoredRuntimeSessionId("valen_session_id")
    || readValenStoredRuntimeSessionId("valen:agent-chat-session");
  if (isNumericValenRuntimeSessionId(stored)) return persistValenRuntimeSessionId(stored);

  return persistValenRuntimeSessionId(createValenRuntimeSessionId());
}

// src/call-valen-gateway/create-valen-workspace-bridge.js



function createValenWorkspaceBridge(spaceId = LOCAL_VALEN_SPACE_ID) {
  const hookBase = `/api/hooks/execute/${encodeURIComponent(spaceId)}`;

  const hookRequest = async (hook, { method = "GET", query = {}, body = {} } = {}) => {
    const url = new URL(`${hookBase}/${encodeURIComponent(hook)}`, window.location.origin);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    const response = await fetch(url, {
      method,
      headers: method === "GET" ? { accept: "application/json" } : { "Content-Type": "application/json", accept: "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body)
    });
    const text = await response.text().catch(() => "");
    const data = parseRuntimeJson(text, text ? { raw: text } : {});
    if (!response.ok) throw new Error(data.error || data.detail || text || `Local hook ${hook} failed: ${response.status}`);
    return data;
  };

  return {
    spaceId,
    hookBase,
    sessionId: null,
    init() {
      const candidate = normalizeValenRuntimeSessionId(readValenRuntimeQuerySessionId() || getValenChatSessionId());
      const next = isNumericValenRuntimeSessionId(candidate) ? candidate : getValenChatSessionId();
      this.sessionId = next;
      persistValenRuntimeSessionId(next);
      return next;
    },
    getHookSessionId() {
      return this.sessionId || this.init();
    },
    loadCards() {
      return hookRequest("get-cards", { query: { sessionId: this.getHookSessionId() } });
    },
    action(cardId, action, payload = {}) {
      return hookRequest("process-card-action", {
        method: "POST",
        body: { sessionId: this.getHookSessionId(), cardId, action, verb: action, payload }
      });
    },
    createBusinessStarterCards(payload = {}) {
      const profile = inferRuntimeBusinessProfile(payload);
      const sessionId = payload.sessionId || this.getHookSessionId();
      const cards = scopeRuntimeCardsToSession(payload.cards?.length ? payload.cards : buildRuntimeBusinessStarterCards(profile), sessionId);
      return hookRequest("create-business-starter-cards", {
        method: "POST",
        body: { sessionId, source: "runtime-local-starter", ...profile, cards }
      });
    },
    reportStatus(status = {}) {
      return hookRequest("report-runtime-status", { method: "POST", body: { sessionId: this.getHookSessionId(), ...status } });
    },
    getStatus(sessionId = this.getHookSessionId()) {
      return hookRequest("get-runtime-status", { query: { sessionId } });
    },
    callHook: hookRequest,
    keep: (cardId) => window.ValenWorkspace.action(cardId, "keep"),
    dismiss: (cardId) => window.ValenWorkspace.action(cardId, "dismiss"),
    recall: (cardId) => window.ValenWorkspace.action(cardId, "recall"),
    approve: (cardId, payload = {}) => window.ValenWorkspace.action(cardId, "approve", payload)
  };
}

// src/bind-local-workspace/arrange-local-workspace-cards.js

const normalizeWorkspaceCards = (data = {}) => {
  if (Array.isArray(data.cards)) {
    const normalizedCards = data.cards.map((card) => ({
      ...card,
      card_type: normalizeWorkspaceCardType(card),
      status: normalizeWorkspaceCardStatus(card)
    }));
    return {
      foreground: normalizedCards.filter((card) => card.status === "pending" || card.status === "focused"),
      orbit: normalizedCards.filter((card) => card.status === "kept"),
      dismissed: normalizedCards.filter((card) => card.status === "dismissed"),
      archived: normalizedCards.filter((card) => card.status === "archived")
    };
  }
  const normalizeBucket = (cards = []) => Array.isArray(cards)
    ? cards.map((card) => ({ ...card, card_type: normalizeWorkspaceCardType(card), status: normalizeWorkspaceCardStatus(card) }))
    : [];
  return {
    foreground: normalizeBucket(data.foreground),
    orbit: normalizeBucket(data.orbit),
    dismissed: normalizeBucket(data.dismissed),
    archived: normalizeBucket(data.archived)
  };
};

const countWorkspaceCards = (data = {}) => {
  const { foreground, orbit, dismissed, archived } = normalizeWorkspaceCards(data);
  return foreground.length + orbit.length + dismissed.length + archived.length;
};

const runtimeCardPriority = (card = {}) => {
  const priority = Number(card.priority ?? card.card_priority ?? card.cardData?.priority ?? 0);
  return Number.isFinite(priority) ? priority : 0;
};

const runtimeCardCreatedAt = (card = {}) => {
  const createdAt = Date.parse(card.created_at || card.createdAt || "");
  return Number.isFinite(createdAt) ? createdAt : 0;
};

const runtimeCardNumericId = (card = {}) => {
  const numericId = Number(workspaceCardId(card));
  return Number.isFinite(numericId) ? numericId : 0;
};

const sortRuntimeCardsForAttention = (cards = []) => [...cards].sort((a, b) => {
  const priorityDelta = runtimeCardPriority(b) - runtimeCardPriority(a);
  if (priorityDelta) return priorityDelta;
  const createdDelta = runtimeCardCreatedAt(b) - runtimeCardCreatedAt(a);
  if (createdDelta) return createdDelta;
  return runtimeCardNumericId(b) - runtimeCardNumericId(a);
});

const selectUsageWorkspaceLayout = (foreground = [], orbit = []) => {
  const foregroundCards = sortRuntimeCardsForAttention(foreground);
  const orbitCards = sortRuntimeCardsForAttention(orbit);
  const primaryCard = foregroundCards[0] || null;
  const retainedCards = primaryCard
    ? [...orbitCards, ...foregroundCards.slice(1)]
    : orbitCards;
  const visibleCards = primaryCard
    ? [primaryCard, ...retainedCards.slice(0, 3)]
    : retainedCards.slice(0, 4);
  return {
    primaryCard,
    orbitCards,
    retainedCards,
    visibleCards,
    desiredActiveCard: primaryCard ? "card13" : "card10"
  };
};

const cardDataForRuntime = (card = {}) => {
  const source = card && typeof card === "object" ? card : {};
  return parseRuntimeJson(source.card_data || source.cardData || source.data, {});
};

const formatCardType = (cardType = "") => String(cardType || "workspace")
  .replace(/_/g, " ")
  .replace(/\b\w/g, (char) => char.toUpperCase());

const primaryVerbForWorkspaceCard = (card = {}) => {
  const status = normalizeWorkspaceCardStatus(card);
  const cardType = normalizeWorkspaceCardType(card);
  const cardData = cardDataForRuntime(card);
  if (status === "kept") return "recall";
  if (cardType === "approval" || cardData.approval_state === "pending") return "approve";
  return "keep";
};

const actionLabelForWorkspaceCard = (card = {}) => {
  const verb = primaryVerbForWorkspaceCard(card);
  if (verb === "recall") return "Recall";
  if (verb === "approve") return "Approve";
  if (normalizeWorkspaceCardType(card) === "qr_code") return "Keep QR";
  return "Keep";
};

const copyForWorkspaceCard = (card = {}) => {
  const cardData = cardDataForRuntime(card);
  const cardType = normalizeWorkspaceCardType(card);
  const title = cardData.title || card.title || formatCardType(cardType);
  const body = cardData.body
    || cardData.summary
    || cardData.metric_label
    || cardData.metric_value
    || cardData.qrPayload
    || cardData.url
    || "Valen queued this workspace object.";
  const action = cardData.action || actionLabelForWorkspaceCard(card);
  return {
    eyebrow: cardData.eyebrow || formatCardType(cardType),
    title,
    body,
    meta: cardData.meta || cardData.label || card.status || "pending",
    action
  };
};

// src/bind-local-workspace/bind-local-workspace-card-actions.js



function bindWorkspaceModeCardActions({ state, stageDirector, valenWorkspace }) {
  const updateWorkspaceCardSlots = (layout = {}) => {
    ["card13", "card14", "card15", "card16"].forEach((slotId, index) => {
      const object = runtimeObjectById(slotId);
      if (!object) return;
      const card = layout.visibleCards?.[index] || null;
      object.workspaceCardId = card ? workspaceCardId(card) : null;
      object.workspaceCardType = card ? normalizeWorkspaceCardType(card) : "";
      object.workspaceCardStatus = card ? normalizeWorkspaceCardStatus(card) : "";
      object.workspaceCardBucket = card ? runtimeWorkspaceCardBucket(card) : "";
      object.workspaceCardSpatialState = card ? runtimeWorkspaceSpatialState(card) : null;
      object.workspaceCardPrimaryVerb = card ? primaryVerbForWorkspaceCard(card) : "";
      object.workspaceCardData = cardDataForRuntime(card);
      object.copy = card ? copyForWorkspaceCard(card) : {
        eyebrow: "LOCAL WORKSPACE",
        title: "Work objects loading.",
        body: "The local adapter is bringing objects into this space.",
        meta: "LOCAL FIXTURE"
      };
    });
  };

  const refreshWorkspaceCards = async (reason = "refresh") => {
    const data = await valenWorkspace.loadCards();
    const { foreground, orbit, dismissed, archived } = normalizeWorkspaceCards(data);
    const cards = [...foreground, ...orbit, ...dismissed, ...archived];
    const layout = selectUsageWorkspaceLayout(foreground, orbit);
    updateWorkspaceCardSlots(layout);
    const stagePhase = stageDirector.setExperiencePhase("WorkspaceMode", layout.desiredActiveCard);
    const activeCard = stagePhase?.activeCardNumber || layout.desiredActiveCard;
    const activeObjectId = stagePhase?.activeObjectState || layout.desiredActiveCard;
    state.set("runtimeLastAction", `workspace:cards:${reason}:${cards.length}`);
    updateRuntimeStateMirror({ phaseId: "WorkspaceMode", activeCard, activeObjectId, reason, cards });
    await valenWorkspace.reportStatus({ phase: "WorkspaceMode", scene: activeCard, totalCardCount: cards.length });
    return data;
  };

  const handleWorkspaceCardAction = async (objectId = "", verb = "keep") => {
    const object = runtimeObjectById(objectId);
    if (!object?.workspaceCardId) return refreshWorkspaceCards(`empty-${verb}`);
    const resolvedVerb = object.workspaceCardPrimaryVerb || verb;
    await valenWorkspace.action(object.workspaceCardId, resolvedVerb, { requestedVerb: verb });
    return refreshWorkspaceCards(`card-${resolvedVerb}`);
  };

  return { handleWorkspaceCardAction, refreshWorkspaceCards, updateWorkspaceCardSlots };
}

// src/bind-local-workspace/bind-local-workspace.js



function bindUI(state, audio, stageDirector) {
  const valenWorkspace = createValenWorkspaceBridge();
  window.ValenWorkspace = valenWorkspace;
  valenWorkspace.init();
  ensureRuntimeStateMirror();

  const workspaceActions = bindWorkspaceModeCardActions({ state, stageDirector, valenWorkspace });
  window.valenRuntimeActions = {
    refreshWorkspaceCards: workspaceActions.refreshWorkspaceCards,
    handleWorkspaceCardAction: workspaceActions.handleWorkspaceCardAction,
    submitChat: async (message = "") => {
      const text = String(message || "").trim();
      if (!text) return null;
      const result = await valenWorkspace.callHook("queue-capability-work-object", {
        method: "POST",
        body: { sessionId: valenWorkspace.getHookSessionId(), capability: text, title: text }
      });
      await workspaceActions.refreshWorkspaceCards("local-input");
      return result;
    },
    createLocalStarterCards: async (payload = {}) => {
      const result = await valenWorkspace.createBusinessStarterCards(payload);
      await workspaceActions.refreshWorkspaceCards("manual-starter");
      return result;
    }
  };

  document.getElementById("audio-toggle")?.addEventListener("click", () => audio.toggle());
  document.getElementById("refresh-workspace")?.addEventListener("click", () => workspaceActions.refreshWorkspaceCards("button"));
  document.getElementById("reset-workspace")?.addEventListener("click", async () => {
    await valenWorkspace.callHook("reset-local-workspace", { method: "POST", body: { sessionId: valenWorkspace.getHookSessionId() } });
    await bootstrapLocalWorkspace();
  });

  updateRuntimeStateMirror({ phaseId: "WorkspaceMode", activeCard: "card10", activeObjectId: "card10", reason: "local-bind", cards: [] });
  window.setTimeout(bootstrapLocalWorkspace, 0);

  async function bootstrapLocalWorkspace() {
    const existing = await valenWorkspace.loadCards();
    if (!existing.visibleCards?.length) {
      await valenWorkspace.createBusinessStarterCards({
        source: "public-playground",
        businessType: "studio",
        market: "local",
        goal: "Improve a local spatial interface for AI agents."
      });
    }
    await workspaceActions.refreshWorkspaceCards("bootstrap");
  }
}

// src/boot-runtime-app/install-valen-runtime-global.js


function installValenRuntimeGlobal({ renderer, stageDirector, state }) {
  window.VALEN_RUNTIME = {
    renderer,
    dispose: () => {
      renderer.dispose?.();
      if (window.VALEN_RUNTIME?.renderer === renderer) delete window.VALEN_RUNTIME;
    },
    setExperiencePhase: (phaseId = "WorkspaceMode", cardNumber = null, reason = "external") => {
      const stagePhase = stageDirector.setExperiencePhase(phaseId, cardNumber);
      const activeObjectId = stagePhase?.activeObjectState || null;
      if (activeObjectId) document.body.dataset.valenActiveObjectId = activeObjectId;
      state.set("runtimeLastAction", `mode:${phaseId}:${activeObjectId || cardNumber || "default"}:${reason}`);
      updateRuntimeStateMirror({ activeCard: stagePhase?.activeCardNumber || cardNumber || "", activeObjectId, phaseId, reason });
      return stagePhase;
    },
    focusInput: (objectId = "card10", reason = "external") => renderer.panelLayer?.focusInput?.(objectId, reason),
    clearInput: (objectId = "card10", reason = "external") => renderer.panelLayer?.clearInput?.(objectId, reason),
    appendChatMessage: (objectId = "card10", message = {}) => renderer.panelLayer?.appendChatMessage?.(objectId, message),
    scrollChat: (objectId = "card10", deltaLines = 0) => renderer.panelLayer?.scrollChat?.(objectId, deltaLines),
    getRuntimeStateMirror: () => {
      const json = ensureRuntimeStateMirror()?.querySelector?.("[data-valen-runtime-state]");
      return parseRuntimeJson(json?.textContent, {});
    },
    refreshWorkspaceCards: (reason = "manual") => window.valenRuntimeActions?.refreshWorkspaceCards?.(reason)
  };
  return window.VALEN_RUNTIME;
}

// src/render-dom-overlay/render-dom-parallax-overlay.js
class RuntimeOverlayLayer {
  constructor(state, interaction, selector = ".runtime-float") {
    this.state = state;
    this.interaction = interaction;
    this.selector = selector;
    this.elements = [];
    this.pointer = { x: 0.5, y: 0.5 };
    this.target = { x: 0.5, y: 0.5 };
    this.scroll = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.depths = {
      far: { rotation: 1.2, translation: 3, z: 0 },
      mid: { rotation: 2.1, translation: 6, z: 3 },
      near: { rotation: 3, translation: 8, z: 8 }
    };
  }

  start() {
    this.register();
    this.updateScroll();
    if (!this.interaction) {
      window.addEventListener("pointermove", (event) => this.onPointer(event), { passive: true });
    }
    window.addEventListener("scroll", () => this.updateScroll(), { passive: true });
    window.addEventListener("resize", () => this.register());
    document.addEventListener("focusin", (event) => this.setFocused(event.target, true));
    document.addEventListener("focusout", (event) => {
      const card = event.target.closest?.(this.selector);
      if (!card) return;
      requestAnimationFrame(() => {
        if (!card.contains(document.activeElement)) card.classList.remove("is-focused");
      });
    });
    requestAnimationFrame(() => this.loop());
  }

  register() {
    this.elements = [...document.querySelectorAll(this.selector)].map((element) => ({
      element,
      depth: this.depths[element.dataset.depth] || this.depths.mid
    }));
  }

  onPointer(event) {
    this.target.x = event.clientX / Math.max(1, window.innerWidth);
    this.target.y = event.clientY / Math.max(1, window.innerHeight);
    this.state.set("pointer", [this.target.x, 1 - this.target.y]);
  }

  updateScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    this.scroll = max > 0 ? window.scrollY / max : 0;
  }

  setFocused(target, focused) {
    const card = target.closest?.(this.selector);
    if (card) card.classList.toggle("is-focused", focused);
  }

  loop() {
    if (this.interaction) {
      this.target.x = this.interaction.pointer.x;
      this.target.y = 1 - this.interaction.pointer.y;
    }
    this.pointer.x += (this.target.x - this.pointer.x) * 0.08;
    this.pointer.y += (this.target.y - this.pointer.y) * 0.08;

    if (!this.reducedMotion) {
      for (const item of this.elements) {
        const { element, depth } = item;
        if (element.hidden || element.closest("[hidden]")) continue;
        const rect = element.getBoundingClientRect();
        if (rect.bottom < -80 || rect.top > window.innerHeight + 80) continue;

        const centerX = (rect.left + rect.width / 2) / Math.max(1, window.innerWidth);
        const centerY = (rect.top + rect.height / 2) / Math.max(1, window.innerHeight);
        const dx = Math.max(-1, Math.min(1, (this.pointer.x - centerX) * 2));
        const dy = Math.max(-1, Math.min(1, (this.pointer.y - centerY) * 2));
        const focused = element.classList.contains("is-focused");
        const scrollDrift = (this.scroll - 0.5) * depth.translation * 0.3;

        element.style.setProperty("--float-rx", `${(-dy * depth.rotation).toFixed(3)}deg`);
        element.style.setProperty("--float-ry", `${(dx * depth.rotation).toFixed(3)}deg`);
        element.style.setProperty("--float-x", `${(dx * depth.translation).toFixed(3)}px`);
        element.style.setProperty("--float-y", `${(dy * depth.translation * 0.62 + scrollDrift).toFixed(3)}px`);
        element.style.setProperty("--float-z", `${(depth.z + (focused ? 10 : 0)).toFixed(3)}px`);
      }
    }

    requestAnimationFrame(() => this.loop());
  }
}

// src/fit-runtime-camera/fit-camera-to-runtime-stage.js


class RuntimeCameraRig {
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

// src/show-boot-signal/show-first-signal-boot-sequence.js



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

class RuntimeFirstSignalBootSequence {
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

class RuntimeFirstSignalLayer {
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

// src/describe-runtime-scenes/describe-card-copy-surfaces.js
const CARD_GLASS_RGB = [218, 222, 220];
const CARD_GLASS_TONE = [0.78, 0.81, 0.8];
const CARD_COPY_SURFACE_PROFILES = {
  "card-chat-asset": {
    frontNormal: [0, 0, -1],
    surface: { center: [0.5, 0.5], size: [1, 1], offset: 0.05, visibility: 0.9 },
    rotation: [-0.006, 0.004, -0.002],
    regions: {
      title: { x: 82, y: 70, width: 720, line: 56, maxLines: 3, font: "900 50px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      body: { x: 88, y: 204, width: 690, line: 28, maxLines: 8, minFontPx: 20, font: "620 24px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      input: { x: 330, y: 448, width: 510, font: "720 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      submit: { x: 116, y: 446, width: 138, font: "900 28px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" }
    }
  },
  "card-chat-second-stage-asset": {
    frontNormal: [0, 0, -1],
    surface: { center: [0.5, 0.5], size: [1, 1], offset: -1.15, visibility: 0.9 },
    rotation: [-0.006, 0.004, -0.002],
    regions: {
      title: { x: 82, y: 70, width: 720, line: 56, maxLines: 3, font: "900 50px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      body: { x: 88, y: 204, width: 690, line: 28, maxLines: 8, minFontPx: 20, font: "620 24px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      transcript: { x: 78, y: 96, width: 760, line: 22, maxY: 404, font: "620 20px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      input: { x: 330, y: 448, width: 510, font: "720 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      submit: { x: 116, y: 446, width: 138, font: "900 28px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" }
    }
  },
  "card-base-asset": {
    frontNormal: [0, 0, -1],
    surface: { center: [0.5, 0.5], size: [1, 1], offset: 0.048, visibility: 0.84 },
    rotation: [-0.004, 0.004, -0.002],
    regions: {
      title: { x: 76, y: 84, width: 750, line: 56, maxLines: 3, font: "900 52px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      body: { x: 84, y: 246, width: 650, line: 30, maxLines: 7, minFontPx: 20, font: "620 26px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" }
    }
  },
  "card-single-button-asset": {
    frontNormal: [0, 0, -1],
    surface: { center: [0.5, 0.5], size: [1, 1], offset: 0.05, visibility: 0.86 },
    rotation: [-0.005, 0.004, -0.002],
    regions: {
      title: { x: 80, y: 78, width: 720, line: 54, maxLines: 3, font: "900 50px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      body: { x: 88, y: 226, width: 640, line: 29, maxLines: 7, minFontPx: 20, font: "620 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      offer: { x: 96, y: 352, width: 470, line: 48, font: "900 42px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      action: { x: 382, y: 452, width: 300, height: 56, font: "850 30px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" }
    }
  },
  "card-multi-button-asset": {
    frontNormal: [0, 0, -1],
    surface: { center: [0.5, 0.5], size: [1, 1], offset: 0.05, visibility: 0.86 },
    rotation: [-0.005, 0.004, -0.002],
    regions: {
      title: { x: 72, y: 70, width: 720, line: 52, maxLines: 3, font: "900 48px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      body: { x: 78, y: 202, width: 650, line: 27, maxLines: 7, minFontPx: 19, font: "620 23px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      columns: [
        { x: 104, y: 312, width: 220 },
        { x: 400, y: 312, width: 240 },
        { x: 698, y: 312, width: 230 }
      ],
      buttons: [
        { x: 134, y: 454, width: 200, height: 58, font: "820 27px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
        { x: 432, y: 454, width: 200, height: 58, font: "820 27px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
        { x: 730, y: 454, width: 200, height: 58, font: "820 27px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" }
      ]
    }
  }
};

// src/render-card-panels/build-panel-geometry-and-copy-metrics.js





const runtimePanelGeometryMethods = {
  normalizeCardGeometryAssets(cardGeometryAssets) {
    if (cardGeometryAssets instanceof Map) return cardGeometryAssets;
    if (Array.isArray(cardGeometryAssets)) {
      return new Map(cardGeometryAssets.filter(Boolean).map((asset) => [asset.id || this.defaultCardAssetId, asset]));
    }
    if (cardGeometryAssets) return new Map([[cardGeometryAssets.id || this.defaultCardAssetId, cardGeometryAssets]]);
    return new Map();
  },

  createPanelGeometries() {
    const ids = new Set([
      this.defaultCardAssetId,
      ...this.objects.map((object) => object.cardAssetId).filter(Boolean)
    ]);
    const geometries = new Map();
    ids.forEach((assetId) => {
      const asset = this.cardGeometryAssets.get(assetId) || this.cardGeometryAssets.get(this.defaultCardAssetId) || null;
      const geometry = this.createPanelGeometry(16, 10, asset, assetId);
      geometry.vertexBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, geometry.vertexBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, geometry.vertices, this.gl.STATIC_DRAW);
      geometry.indexBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, geometry.indexBuffer);
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, geometry.indices, this.gl.STATIC_DRAW);
      geometry.indexType = this.gl.UNSIGNED_SHORT;
      geometries.set(assetId, geometry);
    });
    return geometries;
  },

  setVisualPanelGeometries(geometries = new Map()) {
    this.visualPanelGeometries = geometries instanceof Map ? geometries : new Map();
    this.visualPanelGeometryVersion += 1;
    this.typeTextureSignatures.clear();
  },

  installBufferedGeometry(geometry) {
    geometry.vertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, geometry.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, geometry.vertices, this.gl.STATIC_DRAW);
    geometry.indexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, geometry.indexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, geometry.indices, this.gl.STATIC_DRAW);
    geometry.indexType = this.gl.UNSIGNED_SHORT;
    return geometry;
  },

  getGeometryForObject(object) {
    return this.geometries.get(object.cardAssetId || this.defaultCardAssetId) || this.geometry;
  },

  getRuntimePanelLayerAssetId(object) {
    return object.runtimePanelLayerAssetId || object.cardAssetId || this.defaultCardAssetId;
  },

  shouldUseVisualPanelGeometry(object) {
    return this.usePbrAssetBodies && this.getRuntimePanelLayerAssetId(object) === "card-chat-second-stage-asset";
  },

  getVisualPanelGeometryForObject(object) {
    if (!this.shouldUseVisualPanelGeometry(object)) return null;
    return this.visualPanelGeometries.get(this.getRuntimePanelLayerAssetId(object)) || null;
  },

  getRuntimePanelLayerGeometry(object, fallbackGeometry = null) {
    const visualGeometry = this.getVisualPanelGeometryForObject(object);
    if (visualGeometry) return visualGeometry;
    return this.geometries.get(this.getRuntimePanelLayerAssetId(object)) || fallbackGeometry || this.getGeometryForObject(object);
  },

  getZoneGeometryForObject(object) {
    if (object.assetProvidesControls) return null;
    return this.geometries.get(this.defaultCardAssetId) || this.geometry;
  },

  bindGeometry(geometry) {
    if (!geometry || this.boundGeometry === geometry) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.vertexBuffer);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, geometry.stride, 0);
    if (this.locations.normal >= 0) {
      gl.enableVertexAttribArray(this.locations.normal);
      gl.vertexAttribPointer(this.locations.normal, 3, gl.FLOAT, false, geometry.stride, 12);
    }
    gl.enableVertexAttribArray(this.locations.uv);
    gl.vertexAttribPointer(this.locations.uv, 2, gl.FLOAT, false, geometry.stride, 24);
    if (this.locations.material >= 0) {
      gl.enableVertexAttribArray(this.locations.material);
      gl.vertexAttribPointer(this.locations.material, 1, gl.FLOAT, false, geometry.stride, 32);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.indexBuffer);
    this.boundGeometry = geometry;
  },

  createPanelGeometry(segmentsX, segmentsY, asset, assetId = this.defaultCardAssetId) {
    if (
      asset &&
      Array.isArray(asset.positions) &&
      Array.isArray(asset.normals) &&
      Array.isArray(asset.uvs) &&
      Array.isArray(asset.indices) &&
      asset.positions.length / 3 <= 65535
    ) {
      const vertexCount = asset.positions.length / 3;
      const vertices = new Float32Array(vertexCount * 9);
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let index = 0; index < vertexCount; index += 1) {
        const x = asset.positions[index * 3 + 0];
        const y = asset.positions[index * 3 + 1];
        const z = asset.positions[index * 3 + 2];
        vertices[index * 9 + 0] = x;
        vertices[index * 9 + 1] = y;
        vertices[index * 9 + 2] = z;
        vertices[index * 9 + 3] = asset.normals[index * 3 + 0] ?? 0;
        vertices[index * 9 + 4] = asset.normals[index * 3 + 1] ?? 0;
        vertices[index * 9 + 5] = asset.normals[index * 3 + 2] ?? 1;
        vertices[index * 9 + 6] = asset.uvs[index * 2 + 0] ?? 0.5;
        vertices[index * 9 + 7] = asset.uvs[index * 2 + 1] ?? 0.5;
        vertices[index * 9 + 8] = asset.materialIds?.[index] ?? 0;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
      return {
        vertices,
        indices: new Uint16Array(asset.indices),
        stride: 9 * 4,
        bounds: { minX, minY, minZ, maxX, maxY, maxZ },
        parts: Array.isArray(asset.parts) ? asset.parts : [],
        source: asset.id || assetId,
        materialSlots: asset.materialSlots || []
      };
    }
    const vertices = [];
    const indices = [];
    for (let y = 0; y <= segmentsY; y += 1) {
      for (let x = 0; x <= segmentsX; x += 1) {
        const u = x / segmentsX;
        const v = y / segmentsY;
        vertices.push((u - 0.5) * 2, (v - 0.5) * 2, 0, 0, 0, 1, u, v, 0);
      }
    }
    for (let y = 0; y < segmentsY; y += 1) {
      for (let x = 0; x < segmentsX; x += 1) {
        const i = y * (segmentsX + 1) + x;
        indices.push(i, i + 1, i + segmentsX + 1, i + 1, i + segmentsX + 2, i + segmentsX + 1);
      }
    }
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      stride: 9 * 4,
      bounds: { minX: -1, minY: -1, minZ: 0, maxX: 1, maxY: 1, maxZ: 0 },
      parts: [],
      source: assetId || "procedural-fallback-plane",
      materialSlots: []
    };
  },
};

// src/render-card-panels/choose-panel-poses-and-assets.js





const runtimePanelPresentationMethods = {
  getPresentationPose(object, transform, stagePhase = this.stagePhase, time = performance.now(), hover = 0, active = 0, pressed = 0) {
    const hasHolographicCopy = !!object.spatialType?.enabled;
    const cardOrbit = hasHolographicCopy ? Math.sin(time * 0.00032 + (object.priority || 0) * 0.22) * 0.14 * Math.max(active, 0.32) : 0;
    const cardBreathPitch = hasHolographicCopy ? Math.sin(time * 0.00024 + 1.2 + (object.priority || 0) * 0.18) * 0.026 * Math.max(active, 0.28) : 0;
    const displayMotionTarget = object.id === stagePhase?.activeObjectState
      || (object.id === stagePhase?.previousObjectId && stagePhase?.transitionPhase !== "idle");
    const gestureRead = displayMotionTarget
      ? RuntimeMath.clamp(this.gestureLean || 0, -1, 1) * RuntimeMath.clamp(0.42 + active * 0.54, 0, 1)
      : 0;
    const gestureYaw = gestureRead * 0.34;
    const gesturePitch = Math.abs(gestureRead) * -0.052;
    const gestureRoll = gestureRead * -0.056;
    const scaleBoost = 1 + hover * 0.058 + pressed * 0.04;
    return {
      position: [
        transform.position[0],
        transform.position[1],
        transform.position[2] - pressed * 0.035
      ],
      rotation: [
        transform.rotation[0] + cardBreathPitch + gesturePitch + (this.interaction.pointer.y - 0.5) * 0.072 * hover,
        transform.rotation[1] + cardOrbit + gestureYaw + (this.interaction.pointer.x - 0.5) * 0.092 * hover,
        transform.rotation[2] + gestureRoll
      ],
      scale: [
        transform.scale[0] * scaleBoost,
        transform.scale[1] * scaleBoost,
        transform.scale[2]
      ]
    };
  },

  getCardCopySurfaceProfile(object) {
    return CARD_COPY_SURFACE_PROFILES[this.getRuntimePanelLayerAssetId(object)] || CARD_COPY_SURFACE_PROFILES[this.defaultCardAssetId] || {
      frontNormal: [0, 0, -1],
      surface: { center: [0.5, 0.5], size: [1, 1], offset: 0.04, visibility: 0.86 },
      rotation: [0, 0, 0],
      regions: {}
    };
  },

  holographicGlowScale() {
    return this.isSafariRuntime() ? 0.1 : 0.8;
  },

  isSafariRuntime() {
    const userAgent = window.navigator?.userAgent || "";
    return /safari/i.test(userAgent) && !/(chrome|chromium|crios|fxios|edg)/i.test(userAgent);
  },

  holographicCanvasFont(font) {
    if (!this.isSafariRuntime()) return font;
    return String(font || "")
      .replace(/^(\d{3})(?=\s)/, (_, weight) => String(Math.max(380, Number(weight) - 320)))
      .replace(/(\d+(?:\.\d+)?)px/, (_, size) => `${Math.round(Number(size) * 7.8) / 10}px`);
  },

  holographicInkStyle(defaultStyle, safariStyle) {
    return this.isSafariRuntime() ? safariStyle : defaultStyle;
  },

  getCardFrontNormal(object) {
    return this.getCardCopySurfaceProfile(object).frontNormal || [0, 0, -1];
  },

  getYawForCardFrontDirection(object, targetX, targetZ, extraYaw = 0) {
    const frontNormal = this.getCardFrontNormal(object);
    const localFrontAngle = Math.atan2(frontNormal[0] || 0, frontNormal[2] || 1);
    const targetAngle = Math.atan2(targetX, targetZ);
    return targetAngle - localFrontAngle + extraYaw;
  },

  getPartBounds(cardGeometry, matchers = []) {
    const parts = Array.isArray(cardGeometry?.parts) ? cardGeometry.parts : [];
    if (!parts.length) return null;
    const normalizedMatchers = matchers.map((matcher) => String(matcher).toLowerCase());
    const nodeMatch = parts.find((entry) => {
      const nodeName = String(entry.nodeName || "").toLowerCase();
      return normalizedMatchers.some((matcher) => nodeName.includes(matcher));
    });
    const part = nodeMatch || parts.find((entry) => {
      const meshName = String(entry.meshName || "").toLowerCase();
      return normalizedMatchers.some((matcher) => meshName.includes(matcher));
    });
    return part?.bounds || null;
  },

  boundsToAtlasRegion(cardGeometry, bounds, padding = {}) {
    const card = cardGeometry?.bounds;
    if (!card || !bounds) return null;
    const atlasWidth = 1024;
    const atlasHeight = 512;
    const cardWidth = Math.max(0.001, card.maxX - card.minX);
    const cardHeight = Math.max(0.001, card.maxY - card.minY);
    const padX = padding.x || 0;
    const padY = padding.y || 0;
    const u0 = RuntimeMath.clamp((bounds.minX - card.minX) / cardWidth, 0, 1);
    const u1 = RuntimeMath.clamp((bounds.maxX - card.minX) / cardWidth, 0, 1);
    const v0 = RuntimeMath.clamp((bounds.minY - card.minY) / cardHeight, 0, 1);
    const v1 = RuntimeMath.clamp((bounds.maxY - card.minY) / cardHeight, 0, 1);
    const x = u0 * atlasWidth - padX;
    const y = (1 - v1) * atlasHeight - padY;
    const width = (u1 - u0) * atlasWidth + padX * 2;
    const height = (v1 - v0) * atlasHeight + padY * 2;
    const meshCenterX = ((u0 + u1) * 0.5) * atlasWidth;
    const meshCenterY = (1 - ((v0 + v1) * 0.5)) * atlasHeight;
    return {
      x: RuntimeMath.clamp(x, 0, atlasWidth),
      y: RuntimeMath.clamp(y, 0, atlasHeight),
      width: RuntimeMath.clamp(width, 1, atlasWidth),
      height: RuntimeMath.clamp(height, 1, atlasHeight),
      centerX: RuntimeMath.clamp(x + width * 0.5, 0, atlasWidth),
      centerY: RuntimeMath.clamp(y + height * 0.5, 0, atlasHeight),
      meshCenterX: RuntimeMath.clamp(meshCenterX, 0, atlasWidth),
      meshCenterY: RuntimeMath.clamp(meshCenterY, 0, atlasHeight),
      meshMinY: RuntimeMath.clamp((1 - v1) * atlasHeight, 0, atlasHeight),
      meshMaxY: RuntimeMath.clamp((1 - v0) * atlasHeight, 0, atlasHeight)
    };
  },

  getPartAtlasRegion(cardGeometry, matchers, padding = {}) {
    return this.boundsToAtlasRegion(cardGeometry, this.getPartBounds(cardGeometry, matchers), padding);
  },

  geometryBackedCopyRegions(object, cardGeometry) {
    const profile = this.getCardCopySurfaceProfile(object);
    const assetId = this.getRuntimePanelLayerAssetId(object);
    const regions = {
      ...(profile.regions || {})
    };
    const insetX = assetId === "card-multi-button-asset" ? 76 : 86;
    const titleWidth = assetId === "card-base-asset" ? 720 : assetId === "card-multi-button-asset" ? 700 : 680;
    const titleY = assetId === "card-base-asset" ? 84 : 72;
    const bodyY = assetId === "card-multi-button-asset" ? 202 : assetId === "card-base-asset" ? 238 : 220;
    if (!regions.title) {
      regions.title = {
        x: insetX,
        y: titleY,
        width: titleWidth,
        line: assetId === "card-base-asset" ? 62 : assetId === "card-multi-button-asset" ? 61 : 64,
        maxLines: 2,
        font: assetId === "card-multi-button-asset"
          ? "900 56px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
          : "900 58px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
      };
    }
    if (!regions.body) {
      regions.body = {
        x: insetX + 6,
        y: bodyY,
        width: assetId === "card-base-asset" ? 610 : assetId === "card-multi-button-asset" ? 585 : 560,
        line: assetId === "card-multi-button-asset" ? 43 : 46,
        maxLines: assetId === "card-multi-button-asset" ? 2 : 3,
        font: assetId === "card-multi-button-asset"
          ? "620 36px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
          : "620 37px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
      };
    }

    if (assetId === "card-chat-asset" || assetId === "card-chat-second-stage-asset") {
      const input = this.getPartAtlasRegion(cardGeometry, ["cardchatinputfield"], { x: 10, y: 4 });
      const submit = this.getPartAtlasRegion(cardGeometry, ["cardchatsendbutton"], { x: 8, y: 4 });
      const isSecondStageChat = assetId === "card-chat-second-stage-asset";
      if (input) {
        const inputTextOffsetY = isSecondStageChat ? 6.5 : 0;
        regions.input = {
          ...input,
          paddingX: 28,
          font: `${isSecondStageChat ? "720 18px" : "720 29px"} Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif`,
          ...(isSecondStageChat ? { alignY: "mesh-bounds", textMinY: input.meshMinY + inputTextOffsetY, textMaxY: input.meshMaxY + inputTextOffsetY } : {})
        };
      }
      if (submit) {
        const submitTextOffsetX = isSecondStageChat ? 5 : 0;
        const submitTextOffsetY = isSecondStageChat ? -10 : 0;
        regions.submit = {
          ...submit,
          font: `${isSecondStageChat ? "900 18px" : "900 28px"} Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif`,
          ...(isSecondStageChat ? { alignY: "mesh-bounds", textCenterX: submit.meshCenterX + submitTextOffsetX, textMinY: submit.meshMinY + submitTextOffsetY, textMaxY: submit.meshMaxY + submitTextOffsetY } : {})
        };
      }
    }

    if (assetId === "card-single-button-asset") {
      const action = this.getPartAtlasRegion(cardGeometry, ["cardsinglebuttoncontrol"], { x: 8, y: 4 });
      if (action) {
        regions.action = {
          ...action,
          font: "850 28px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
        };
      }
    }

    if (assetId === "card-multi-button-asset") {
      const buttonMatchers = [
        ["cardmultibuttonleft"],
        ["cardmultibuttonmiddle"],
        ["cardmultibuttonright"]
      ];
      const buttons = buttonMatchers
        .map((matchers) => this.getPartAtlasRegion(cardGeometry, matchers, { x: 7, y: 4 }))
        .filter(Boolean)
        .map((button) => ({
          ...button,
          font: "820 26px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
        }));
      if (buttons.length) {
        regions.buttons = buttons;
        regions.columns = buttons.map((button) => {
          const width = Math.max(178, button.width + 18);
          return {
            x: RuntimeMath.clamp(button.centerX - width * 0.5, 34, 1024 - width - 34),
            y: object.copy?.mode === "pricing" ? Math.max(286, button.y - 98) : Math.max(286, button.y - 96),
            width,
            priceFont: "850 36px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif",
            labelFont: "700 23px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif",
            indexFont: "800 23px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
          };
        });
      }
    }
    return regions;
  },

  rotateLocalDirection(direction, rotation) {
    const matrix = this.zoneModelMatrix;
    RuntimeMath.compose(matrix, [0, 0, 0], rotation, [1, 1, 1]);
    return [
      matrix[0] * direction[0] + matrix[4] * direction[1] + matrix[8] * direction[2],
      matrix[1] * direction[0] + matrix[5] * direction[1] + matrix[9] * direction[2],
      matrix[2] * direction[0] + matrix[6] * direction[1] + matrix[10] * direction[2]
    ];
  },

  getCardFacingAmount(rotation, frontNormal = [0, 0, 1]) {
    const worldFront = this.rotateLocalDirection(frontNormal, rotation);
    return RuntimeMath.smoothstep(0.02, 0.72, worldFront[2]);
  },

  getHolographicCopyLayout(object, cardGeometry) {
    const profile = this.getCardCopySurfaceProfile(object);
    const bounds = cardGeometry?.bounds || { minX: -1, minY: -1, minZ: 0, maxX: 1, maxY: 1, maxZ: 0 };
    const hasAuthoredGeometry = Array.isArray(cardGeometry?.parts) && cardGeometry.parts.length > 0;
    const surface = profile.surface || {};
    const frontNormal = profile.frontNormal || [0, 0, 1];
    const width = Math.max(0.001, bounds.maxX - bounds.minX);
    const height = Math.max(0.001, bounds.maxY - bounds.minY);
    const frontZ = frontNormal[2] >= 0 ? bounds.maxZ ?? 0 : bounds.minZ ?? 0;
    const center = surface.center || (hasAuthoredGeometry ? [0.5, 0.52] : [0.5, 0.56]);
    const size = surface.size || (hasAuthoredGeometry ? [0.76, 0.58] : [0.78, 0.64]);
    const offset = surface.offset ?? 0.04;
    return {
      frontNormal,
      position: [
        bounds.minX + center[0] * width + frontNormal[0] * offset,
        bounds.minY + center[1] * height + frontNormal[1] * offset,
        frontZ + frontNormal[2] * offset
      ],
      rotation: profile.rotation || [0, 0, 0],
      scale: [
        width * size[0] * 0.5 * (frontNormal[2] < 0 ? -1 : 1),
        height * size[1] * 0.5,
        1
      ],
      visibility: surface.visibility ?? 0.86
    };
  },

  getHolographicCopyVisibility(object, baseTransform, active, hover, baseCopyVisibility, frontNormal = [0, 0, 1]) {
    const facing = this.getCardFacingAmount(baseTransform.rotation, frontNormal);
    const isActive = object.id === this.stagePhase?.activeObjectState;
    const isHandoff = object.id === this.stagePhase?.previousObjectId && this.stagePhase?.transitionPhase !== "idle";
    const isLatent = this.stagePhase?.latentObjectStates?.includes(object.id);
    const activeRead = isActive ? facing * (0.72 + active * 0.28) : 0;
    const latentRead = isLatent ? facing * 0.16 : 0;
    const hoverRead = hover * facing * 0.16;
    const handoffRead = isHandoff ? facing * 0.44 : 0;
    const stateRead = Math.max(activeRead, latentRead, hoverRead, handoffRead, baseCopyVisibility * facing * 0.68);
    return RuntimeMath.clamp(stateRead, 0, 1);
  },
};

// src/render-card-panels/render-spatial-panel-text.js





const runtimePanelSpatialRenderMethods = {
  renderSpatialTypePlane(object, baseTransform, active, hover, pulse, time, index, geometry = this.geometry, baseCopyVisibility = 0, cardGeometry = null) {
    const gl = this.gl;
    this.bindGeometry(geometry);
    const runtimePanelLayerGeometry = this.getRuntimePanelLayerGeometry(object, cardGeometry);
    const config = this.getHolographicCopyLayout(object, runtimePanelLayerGeometry);
    const beat = this.stagePhase?.beatIntensity || 0;
    const focusLock = object.id === this.stagePhase?.activeObjectState && this.stagePhase?.focusLock ? 1 : 0;
    const copyRead = this.getHolographicCopyVisibility(object, baseTransform, active, hover, baseCopyVisibility, config.frontNormal);
    const visible = RuntimeMath.clamp((config.visibility ?? 0.7) * copyRead, 0, 1);
    if (visible < 0.015) return;

    const pointerLean = [
      (this.interaction.pointer.y - 0.5) * 0.01 * Math.max(active, hover),
      (this.interaction.pointer.x - 0.5) * 0.012 * Math.max(active, hover),
      0
    ];
    const position = config.position || [-0.08, 0.18, 0.165];
    const rotation = config.rotation || [-0.012, 0.012, -0.004];
    const scale = config.scale || [1.28, 0.4, 1];

    RuntimeMath.compose(this.parentModelMatrix, baseTransform.position, baseTransform.rotation, baseTransform.scale);
    RuntimeMath.compose(
      this.zoneModelMatrix,
      [position[0], position[1] + beat * 0.035, position[2] - beat * 0.04],
      [rotation[0] + pointerLean[0], rotation[1] + pointerLean[1], rotation[2] + pointerLean[2]],
      [scale[0] * (1 + beat * 0.018), scale[1] * (1 + beat * 0.012), scale[2]]
    );
    RuntimeMath.multiply(this.modelMatrix, this.parentModelMatrix, this.zoneModelMatrix);
    const material = object.materialProfile || {};
    gl.uniformMatrix4fv(this.locations.model, false, this.modelMatrix);
    gl.uniform3f(this.locations.tone, CARD_GLASS_TONE[0], CARD_GLASS_TONE[1], CARD_GLASS_TONE[2]);
    gl.uniform1f(this.locations.hover, hover * 0.35);
    gl.uniform1f(this.locations.active, Math.max(active, pulse * 0.22));
    gl.uniform1f(this.locations.objectVisibility, visible);
    gl.uniform1f(this.locations.activeScene, 1);
    gl.uniform1f(this.locations.panelId, (object.priority ?? index) + 31);
    gl.uniform1f(this.locations.stageBeat, beat * (material.chapterSnap || 1));
    gl.uniform1f(this.locations.focusLock, focusLock);
    gl.uniform1f(this.locations.copyBoost, (material.copyBoost || CORE_RUNTIME_MANIFEST.visualProfile.copyBoost) * 0.88);
    gl.uniform1f(this.locations.latentDim, 1);
    gl.uniform1f(this.locations.planeMode, 1);
    this.bindCardBaseMaterialUniforms(geometry);
    gl.uniform1f(this.locations.waveStrength, 0.012 + hover * 0.012 + beat * 0.01);
    gl.uniform1f(this.locations.copyVisible, 1);
    gl.activeTexture(gl.TEXTURE1);
    this.ensureTypeTexture(object, runtimePanelLayerGeometry);
    gl.bindTexture(gl.TEXTURE_2D, this.typeTextures.get(object.id) || this.blankTexture);
    gl.drawElements(gl.TRIANGLES, geometry.indices.length, geometry.indexType, 0);
  },

  renderZoneCardAssets(object, parentGeometry, parentPosition, parentRotation, parentScale, active, hover, pulse, time, index) {
    if (!object.interactionZones?.length) return;
    const zoneGeometry = this.getZoneGeometryForObject(object);
    if (!zoneGeometry) return;
    this.bindGeometry(zoneGeometry);
    const gl = this.gl;
    const bounds = parentGeometry?.bounds || { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    const width = Math.max(0.001, bounds.maxX - bounds.minX);
    const height = Math.max(0.001, bounds.maxY - bounds.minY);
    const material = object.materialProfile || {};
    const beat = this.stagePhase?.beatIntensity || 0;
    const focusLock = object.id === this.stagePhase?.activeObjectState && this.stagePhase?.focusLock ? 1 : 0;
    RuntimeMath.compose(this.parentModelMatrix, parentPosition, parentRotation, parentScale);

    object.interactionZones.forEach((zone, zoneIndex) => {
      const [x, y, w, h] = zone.visualRect || zone.rect;
      const visual = this.zoneAssetVisualProfile(object, zone);
      const pressed = this.isPressedZone(object, zone.id) ? 1 : 0;
      const selected = this.isRuntimeZone(object, zone.id) ? 1 : 0;
      const hovered = this.stagePhase?.hoverZoneId === zone.id && this.stagePhase?.hoverObjectId === object.id ? 1 : 0;
      const localCenter = [
        bounds.minX + (x + w * 0.5) * width,
        bounds.minY + (y + h * 0.5) * height,
        visual.zOffset - pressed * 0.014 + hovered * 0.012
      ];
      const localScale = [
        Math.max(visual.minX, w * visual.x) * (1 + hovered * 0.075 + pressed * 0.045),
        Math.max(visual.minY, h * visual.y) * (1 + hovered * 0.075 + pressed * 0.045),
        visual.z
      ];
      RuntimeMath.compose(this.zoneModelMatrix, localCenter, [0, 0, 0], localScale);
      RuntimeMath.multiply(this.modelMatrix, this.parentModelMatrix, this.zoneModelMatrix);
      gl.uniformMatrix4fv(this.locations.model, false, this.modelMatrix);
      gl.uniform3f(this.locations.tone, CARD_GLASS_TONE[0], CARD_GLASS_TONE[1], CARD_GLASS_TONE[2]);
      gl.uniform1f(this.locations.hover, Math.max(hover * 0.7, hovered));
      gl.uniform1f(this.locations.active, Math.max(active * 0.4, selected * 0.46, pressed * 0.72));
      gl.uniform1f(this.locations.objectVisibility, visual.visibility + hovered * 0.14 + pressed * 0.18 + selected * 0.06);
      gl.uniform1f(this.locations.activeScene, 1);
      gl.uniform1f(this.locations.panelId, (object.priority ?? index) + 51 + zoneIndex);
      gl.uniform1f(this.locations.stageBeat, beat * (material.chapterSnap || 1));
      gl.uniform1f(this.locations.focusLock, focusLock);
      gl.uniform1f(this.locations.copyBoost, 0);
      gl.uniform1f(this.locations.latentDim, 1);
      gl.uniform1f(this.locations.planeMode, 0);
      this.bindCardBaseMaterialUniforms(zoneGeometry);
      gl.uniform1f(this.locations.waveStrength, 0.02 + hover * 0.02 + hovered * 0.035 + pressed * 0.025);
      gl.uniform1f(this.locations.copyVisible, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.blankTexture);
      gl.drawElements(gl.TRIANGLES, zoneGeometry.indices.length, zoneGeometry.indexType, 0);
    });
  },

  zoneAssetVisualProfile(object, zone) {
    if (object.copy?.mode === "pricing") {
      return { x: 1.02, y: 0.94, z: 0.105, minX: 0.17, minY: 0.112, zOffset: 0.112, visibility: 0.13 };
    }
    if (zone.id === "input") {
      return { x: 1, y: 0.96, z: 0.105, minX: 0.42, minY: 0.124, zOffset: 0.11, visibility: 0.12 };
    }
    if (zone.id === "primaryCta" || zone.id === "secondaryCta") {
      return { x: 1.04, y: 0.96, z: 0.105, minX: 0.16, minY: 0.118, zOffset: 0.11, visibility: 0.12 };
    }
    return { x: 1, y: 0.92, z: 0.105, minX: 0.14, minY: 0.108, zOffset: 0.108, visibility: 0.11 };
  },
};

// src/render-card-panels/manage-panel-input-and-chat-state.js





const runtimePanelInputMethods = {
  installNativeInputOverlay() {
    if (this.nativeInputOverlay || typeof document === "undefined") return this.nativeInputOverlay;
    const input = document.createElement("input");
    input.id = "runtime-native-input-overlay";
    input.type = "text";
    input.name = "runtimeNativeInput";
    input.autocomplete = "off";
    input.autocapitalize = "sentences";
    input.spellcheck = true;
    input.inputMode = "text";
    input.enterKeyHint = "send";
    input.dataset.noGlClick = "true";
    input.dataset.runtimeNativeInput = "true";
    input.setAttribute("aria-label", "Message Valen");
    Object.assign(input.style, {
      position: "fixed",
      zIndex: "34",
      left: "0px",
      top: "0px",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "0",
      border: "0",
      outline: "0",
      borderRadius: "0",
      background: "transparent",
      color: "transparent",
      caretColor: "transparent",
      opacity: "0.02",
      pointerEvents: "none",
      transform: "translate3d(-9999px, -9999px, 0)",
      appearance: "none",
      WebkitAppearance: "none",
      font: "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    });
    input.addEventListener("focus", this.onNativeInputOverlayFocus);
    input.addEventListener("input", this.onNativeInputOverlayInput);
    input.addEventListener("keydown", this.onNativeInputOverlayKeyDown);
    input.addEventListener("blur", this.onNativeInputOverlayBlur);
    document.body.append(input);
    this.nativeInputOverlay = input;
    return input;
  },

  hideNativeInputOverlay() {
    if (!this.nativeInputOverlay) return;
    this.nativeInputOverlay.style.pointerEvents = "none";
    this.nativeInputOverlay.style.width = "1px";
    this.nativeInputOverlay.style.height = "1px";
    this.nativeInputOverlay.style.transform = "translate3d(-9999px, -9999px, 0)";
  },

  getRuntimeObjectById(objectId = "") {
    return this.objects.find((object) => object.id === objectId) || null;
  },

  isEmailInputObject(objectOrId = null) {
    const object = typeof objectOrId === "string" ? this.getRuntimeObjectById(objectOrId) : objectOrId;
    return object?.copy?.inputType === "email" || object?.role === "email" || object?.id === "card9";
  },

  updateNativeInputOverlay(target = null, zone = null) {
    const input = this.installNativeInputOverlay();
    if (!input || !this.capabilities.mobileDevice || !target || !zone) {
      this.hideNativeInputOverlay();
      return;
    }
    const viewWidth = Math.max(1, window.innerWidth || 1);
    const viewHeight = Math.max(1, window.innerHeight || 1);
    const rectWidth = Math.max(0.001, target.rect.maxX - target.rect.minX);
    const rectHeight = Math.max(0.001, target.rect.maxY - target.rect.minY);
    const [zoneX, zoneY, zoneW, zoneH] = zone.rect;
    const leftNorm = target.rect.minX + zoneX * rectWidth;
    const rightNorm = target.rect.minX + (zoneX + zoneW) * rectWidth;
    const bottomNorm = target.rect.minY + zoneY * rectHeight;
    const topNorm = target.rect.minY + (zoneY + zoneH) * rectHeight;
    const padX = 10;
    const padY = 8;
    const left = RuntimeMath.clamp(leftNorm * viewWidth - padX, 0, viewWidth - 24);
    const top = RuntimeMath.clamp((1 - topNorm) * viewHeight - padY, 0, viewHeight - 24);
    const width = RuntimeMath.clamp((rightNorm - leftNorm) * viewWidth + padX * 2, 44, viewWidth - left);
    const height = RuntimeMath.clamp((topNorm - bottomNorm) * viewHeight + padY * 2, 38, viewHeight - top);
    const inputState = this.getRuntimeInputState(target.id);
    const isEmailInput = this.isEmailInputObject(target);
    input.dataset.objectId = target.id;
    input.type = isEmailInput ? "email" : "text";
    input.inputMode = isEmailInput ? "email" : "text";
    input.autocomplete = isEmailInput ? "email" : "off";
    input.setAttribute("aria-label", isEmailInput ? "Email Valen" : "Message Valen");
    this.syncNativeInputOverlay(inputState);
    input.style.left = `${left}px`;
    input.style.top = `${top}px`;
    input.style.width = `${width}px`;
    input.style.height = `${height}px`;
    input.style.transform = "translate3d(0, 0, 0)";
    input.style.pointerEvents = "auto";
  },

  syncNativeInputOverlay(inputState = this.getActiveRuntimeInputState()) {
    const input = this.nativeInputOverlay;
    if (!input || !inputState || this.nativeInputOverlaySyncing) return;
    if (input.dataset.objectId !== inputState.objectId) return;
    this.nativeInputOverlaySyncing = true;
    const nextValue = inputState.inputValue || "";
    if (input.value !== nextValue) input.value = nextValue;
    if (document.activeElement === input) {
      const caret = RuntimeMath.clamp(inputState.inputCaret ?? nextValue.length, 0, nextValue.length);
      try {
        input.setSelectionRange(caret, caret);
      } catch {}
    }
    this.nativeInputOverlaySyncing = false;
  },

  onNativeInputOverlayFocus(event) {
    const objectId = event.currentTarget?.dataset.objectId || "card1";
    this.setActiveRuntimeZone(`${objectId}:input`, "native-input-focus");
  },

  onNativeInputOverlayInput(event) {
    if (this.nativeInputOverlaySyncing) return;
    const input = event.currentTarget;
    const objectId = input?.dataset.objectId || "card1";
    const inputState = this.getRuntimeInputState(objectId);
    inputState.inputValue = String(input.value || "").slice(0, 240);
    if (input.value !== inputState.inputValue) input.value = inputState.inputValue;
    const caret = Number.isFinite(input.selectionStart)
      ? input.selectionStart
      : inputState.inputValue.length;
    inputState.inputCaret = RuntimeMath.clamp(caret, 0, inputState.inputValue.length);
    if (this.getActiveInputObjectId() !== objectId) {
      this.setActiveRuntimeZone(`${objectId}:input`, "native-input-edit");
    } else {
      this.bumpRuntimeInputState(objectId, "native-input-edit");
    }
  },

  onNativeInputOverlayKeyDown(event) {
    event.stopPropagation();
    const objectId = event.currentTarget?.dataset.objectId || "card1";
    if (event.key === "Escape") {
      this.setActiveRuntimeZone("none", "native-input-blur");
      event.currentTarget?.blur?.();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const inputState = this.getRuntimeInputState(objectId);
    const isEmailGrab = this.isEmailInputObject(objectId);
    const action = isEmailGrab ? "email-submit" : "chat-submit";
    this.setActiveRuntimeZone(`${objectId}:primaryCta`, action);
    if (isEmailGrab) window.valenRuntimeActions?.submitEmailGrab?.(inputState.inputValue, objectId === PUBLIC_INPUT_CARD ? "public-input" : "secondary-input");
    else window.valenRuntimeActions?.submitChat?.(inputState.inputValue, objectId);
  },

  onNativeInputOverlayBlur(event) {
    const objectId = event.currentTarget?.dataset.objectId || "";
    if (this.getActiveInputObjectId() === objectId) {
      this.setActiveRuntimeZone("none", "native-input-blur");
    }
  },

  getRuntimeInputState(objectId = "card1") {
    const key = objectId || "card1";
    if (!this.runtimeInputStatesByObjectId.has(key)) {
      this.runtimeInputStatesByObjectId.set(key, {
        objectId: key,
        inputValue: "",
        inputCaret: 0,
        messages: [],
        streamingText: "",
        isStreaming: false,
        toolName: "",
        chatScrollLine: 0,
        chatAutoScroll: true,
        chatTranscriptRows: 0,
        lastAction: "none",
        version: 0
      });
    }
    return this.runtimeInputStatesByObjectId.get(key);
  },

  getActiveRuntimeInputState() {
    const objectId = this.getActiveInputObjectId();
    return objectId ? this.getRuntimeInputState(objectId) : null;
  },

  syncCardInteractionInputMirror(inputState = this.getActiveRuntimeInputState()) {
    this.cardInteractionState.inputValue = inputState?.inputValue || "";
    this.cardInteractionState.inputCaret = inputState?.inputCaret || 0;
  },

  bumpRuntimeInputState(objectId = this.getActiveInputObjectId(), lastAction = null) {
    const inputState = objectId ? this.getRuntimeInputState(objectId) : null;
    if (inputState) {
      inputState.version += 1;
      if (lastAction) inputState.lastAction = lastAction;
      this.syncCardInteractionInputMirror(inputState);
      this.state.set("runtimeInputObjectId", objectId);
      this.state.set("runtimeInputValue", inputState.inputValue);
      this.state.set("runtimeInputCaret", inputState.inputCaret);
      this.state.set("runtimeInputStreaming", inputState.streamingText);
      this.syncNativeInputOverlay(inputState);
    } else {
      this.state.set("runtimeInputObjectId", "none");
      this.state.set("runtimeInputValue", "");
      this.state.set("runtimeInputCaret", 0);
      this.state.set("runtimeInputStreaming", "");
    }
    if (lastAction) this.cardInteractionState.lastAction = lastAction;
    this.cardInteractionState.version += 1;
    this.state.set("runtimeLastAction", this.cardInteractionState.lastAction);
  },

  focusInput(objectId = "card1", reason = "external") {
    this.setActiveRuntimeZone(`${objectId}:input`, reason);
    return this.getRuntimeInputState(objectId);
  },

  clearInput(objectId = this.getActiveInputObjectId() || "card1", reason = "input-clear") {
    const inputState = this.getRuntimeInputState(objectId);
    inputState.inputValue = "";
    inputState.inputCaret = 0;
    this.bumpRuntimeInputState(objectId, reason);
  },

  appendChatMessage(objectId = "card10", message = {}) {
    const inputState = this.getRuntimeInputState(objectId);
    const role = message.role || "assistant";
    const content = String(message.content || "");
    if (content) inputState.messages.push({ role, content });
    inputState.chatAutoScroll = true;
    inputState.chatScrollLine = Number.POSITIVE_INFINITY;
    this.bumpRuntimeInputState(objectId, message.action || `chat:${role}`);
  },

  setChatStreaming(objectId = "card10", text = "", options = {}) {
    const inputState = this.getRuntimeInputState(objectId);
    inputState.streamingText = String(text || "");
    inputState.isStreaming = !!options.isStreaming;
    inputState.toolName = options.toolName || "";
    if (options.autoScroll !== false) {
      inputState.chatAutoScroll = true;
      inputState.chatScrollLine = Number.POSITIVE_INFINITY;
    }
    this.bumpRuntimeInputState(objectId, options.action || "chat:stream");
  },

  scrollChat(objectId = "card10", deltaLines = 0) {
    const inputState = this.getRuntimeInputState(objectId);
    const rowCount = Math.max(0, inputState.chatTranscriptRows || 0);
    const maxScroll = Math.max(0, rowCount - 1);
    const current = Number.isFinite(inputState.chatScrollLine)
      ? inputState.chatScrollLine
      : maxScroll;
    inputState.chatScrollLine = RuntimeMath.clamp(current + deltaLines, 0, maxScroll);
    inputState.chatAutoScroll = inputState.chatScrollLine >= Math.max(0, maxScroll - 4);
    this.bumpRuntimeInputState(objectId, "chat:scroll");
  },

  getActiveInputObjectId() {
    const activeZoneId = this.cardInteractionState.activeZoneId || "";
    if (!activeZoneId.endsWith(":input")) return null;
    return activeZoneId.slice(0, -":input".length);
  },

  onKeyDown(event) {
    const inputObjectId = this.getActiveInputObjectId();
    if (!inputObjectId) return;
    if (document.activeElement?.closest?.(".modal")) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const inputState = this.getRuntimeInputState(inputObjectId);
    if (event.key === "Escape") {
      this.setActiveRuntimeZone("none", "input-blur");
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const isEmailGrab = this.isEmailInputObject(inputObjectId);
      const action = isEmailGrab ? "email-submit" : "chat-submit";
      this.setActiveRuntimeZone(`${inputObjectId}:primaryCta`, action);
      if (isEmailGrab) window.valenRuntimeActions?.submitEmailGrab?.(inputState.inputValue, inputObjectId === PUBLIC_INPUT_CARD ? "public-input" : "secondary-input");
      else window.valenRuntimeActions?.submitChat?.(inputState.inputValue, inputObjectId);
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      if (inputState.inputCaret > 0) {
        const before = inputState.inputValue.slice(0, inputState.inputCaret - 1);
        const after = inputState.inputValue.slice(inputState.inputCaret);
        inputState.inputValue = before + after;
        inputState.inputCaret = before.length;
        this.bumpRuntimeInputState(inputObjectId, "input-edit");
      }
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      const before = inputState.inputValue.slice(0, inputState.inputCaret);
      const after = inputState.inputValue.slice(inputState.inputCaret);
      inputState.inputValue = `${before}${event.key}${after}`.slice(0, 240);
      inputState.inputCaret = Math.min(inputState.inputValue.length, before.length + 1);
      this.bumpRuntimeInputState(inputObjectId, "input-edit");
    }
  },

  setActiveRuntimeZone(zoneId, lastAction = "zone") {
    this.cardInteractionState.activeZoneId = zoneId || "none";
    this.cardInteractionState.lastAction = lastAction;
    const zoneObjectId = this.cardInteractionState.activeZoneId.includes(":")
      ? this.cardInteractionState.activeZoneId.split(":")[0]
      : null;
    const inputObjectId = this.getActiveInputObjectId() || zoneObjectId;
    if (inputObjectId) this.getRuntimeInputState(inputObjectId);
    this.bumpRuntimeInputState(inputObjectId, lastAction);
    this.state.set("activeZoneId", this.cardInteractionState.activeZoneId);
  },

  bumpCardState() {
    this.bumpRuntimeInputState(this.getActiveInputObjectId(), this.cardInteractionState.lastAction);
  },

  isRuntimeZone(object, zoneId) {
    return this.cardInteractionState.activeZoneId === `${object.id}:${zoneId}`;
  },

  isPressedZone(object, zoneId) {
    return this.state.get("pressedMeshId") === object.id && this.state.get("pressedZoneId") === zoneId;
  },

  getInputCaretPhase(object) {
    if (!object || !this.isRuntimeZone(object, "input")) return 0;
    return Math.floor(performance.now() / 520) % 2;
  },
};

// src/render-card-panels/handle-panel-hit-zone-actions.js





const runtimePanelActionMethods = {
  getCopySignature(object) {
    const inputState = this.getRuntimeInputState(object.id);
    return [
      this.cardInteractionState.version,
      this.visualPanelGeometryVersion,
      inputState.version,
      inputState.inputValue,
      inputState.inputCaret,
      inputState.messages.length,
      inputState.messages[inputState.messages.length - 1]?.content || "",
      inputState.messages.map((message) => `${message.role}:${message.content}`).join("\u001f").slice(-4000),
      inputState.streamingText,
      inputState.isStreaming ? "streaming" : "idle",
      inputState.toolName,
      inputState.chatScrollLine,
      inputState.chatAutoScroll ? "auto" : "manual",
      this.getInputCaretPhase(object),
      this.cardInteractionState.activeZoneId,
      this.state.get("pressedMeshId") || "none",
      this.state.get("pressedZoneId") || "none",
      JSON.stringify(object.copy || {}),
      object.id
    ].join("|");
  },

  ensureCopyTexture(object) {
    if (!object.copy) return;
    const signature = this.getCopySignature(object);
    if (this.copyTextureSignatures.get(object.id) === signature) return;
    const previous = this.copyTextures.get(object.id);
    const texture = this.createCopyTexture(object);
    this.copyTextures.set(object.id, texture);
    this.copyTextureSignatures.set(object.id, signature);
    if (previous && previous !== this.blankTexture) this.gl.deleteTexture(previous);
  },

  ensureTypeTexture(object, cardGeometry = null) {
    if (!object.spatialType?.enabled) return;
    const signature = this.getCopySignature(object);
    if (this.typeTextureSignatures.get(object.id) === signature) return;
    const previous = this.typeTextures.get(object.id);
    const texture = this.createTypeTexture(object, this.getRuntimePanelLayerGeometry(object, cardGeometry || this.getGeometryForObject(object)));
    this.typeTextures.set(object.id, texture);
    this.typeTextureSignatures.set(object.id, signature);
    if (previous && previous !== this.blankTexture) this.gl.deleteTexture(previous);
  },

  getHitTargets() {
    return this.hitTargets;
  },

  bindCardBaseMaterialUniforms(geometry = this.geometry) {
    const slots = geometry?.materialSlots || [];
    const profile = this.cardMaterialProfiles.get(geometry?.source) || this.cardMaterialProfiles.get(this.defaultCardAssetId) || {};
    const gl = this.gl;
    for (let index = 0; index < 4; index += 1) {
      const slot = slots[index] || slots[0] || {};
      const base = slot.baseColor || profile.baseColor || [0.22, 0.22, 0.22, 0.28];
      const transmission = slot.transmission ?? profile.transmission ?? 1;
      gl.uniform4f(
        this.locations.materialBaseColors[index],
        base[0] ?? 0.22,
        base[1] ?? 0.22,
        base[2] ?? 0.22,
        base[3] ?? 0.28
      );
      gl.uniform1f(this.locations.materialRoughnesses[index], slot.roughness ?? profile.roughness ?? 0.1);
      gl.uniform1f(this.locations.materialMetallics[index], slot.metallic ?? profile.metallic ?? 0);
      gl.uniform1f(this.locations.materialIors[index], slot.ior ?? profile.ior ?? 1.45);
      gl.uniform1f(this.locations.materialTransmissions[index], transmission);
      gl.uniform1f(this.locations.materialCoats[index], slot.coatWeight ?? profile.coatWeight ?? 0.25);
      gl.uniform1f(this.locations.materialCoatRoughnesses[index], slot.coatRoughness ?? profile.coatRoughness ?? 0.15);
    }
  },

  handleClick(target) {
    if (!target) return;
    if (target.zone) {
      this.activateZone(target.zone, target);
      return;
    }
    this.scrollToRoute(target.route);
  },

  activateZone(zone, target) {
    const runtimeZoneId = `${target.id}:${zone.id}`;
    this.setActiveRuntimeZone(runtimeZoneId, `zone:${zone.id}`);
    this.state.set("activeLabel", runtimeZoneId);
    if (target.role === "input" && zone.id === "input") return;
    if ((target.id === "card1" || target.id === "card10") && zone.id === "primaryCta") {
      window.valenRuntimeActions?.submitChat?.(this.getRuntimeInputState(target.id).inputValue, target.id);
      return;
    }
    if (this.isEmailInputObject(target) && zone.id === "primaryCta") {
      window.valenRuntimeActions?.submitEmailGrab?.(
        this.getRuntimeInputState(target.id).inputValue,
        target.id === PUBLIC_INPUT_CARD ? "public-input" : "secondary-input"
      );
      return;
    }
    if (zone.action === "tryLocal") {
      window.valenRuntimeActions?.tryLocal?.();
      return;
    }
    if (zone.action === "secondaryInput") {
      window.valenRuntimeActions?.openSecondaryInput?.();
      return;
    }
    if (zone.action === "workspaceAction" && zone.verb) {
      window.valenRuntimeActions?.handleWorkspaceCardAction?.(target.id, zone.verb);
      return;
    }
    if (zone.action === "route") {
      this.scrollToRoute(zone.route || target.route);
      return;
    }
    if (target.id === "card4") {
      window.valenRuntimeActions?.requestExample?.();
      return;
    }
    if (target.id === "card5" && zone.id === "secondary-input") {
      window.valenRuntimeActions?.openSecondaryInput?.();
      return;
    }
    if (zone.domTarget?.includes("secondary-input")) {
      window.valenRuntimeActions?.openSecondaryInput?.();
      return;
    }
    if (zone.domTarget?.includes("open-demo") || zone.domTarget?.includes("demo-open")) {
      window.valenRuntimeActions?.requestExample?.();
      return;
    }
    this.scrollToRoute(zone.route || target.route);
  },

  findDomTarget(selector) {
    if (!selector) return null;
    return selector.split(",").map((part) => document.querySelector(part.trim())).find(Boolean) || null;
  },

  scrollToRoute(route) {
    if (!route) return;
    const element = document.querySelector(route);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", route);
  },
};

// src/render-card-panels/place-panels-in-foreground-and-orbit.js





const runtimePanelTransformMethods = {
  buildHitTarget(object, index, visibility, geometry = this.geometry) {
    const transform = this.transforms.get(object.id);
    RuntimeMath.compose(this.modelMatrix, transform.position, transform.rotation, transform.scale);
    RuntimeMath.multiply(this.modelViewProjection, this.cameraRig.viewProjection, this.modelMatrix);
    const bounds = geometry?.bounds || { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    const corners = [
      [bounds.minX, bounds.minY, 0],
      [bounds.maxX, bounds.minY, 0],
      [bounds.maxX, bounds.maxY, 0],
      [bounds.minX, bounds.maxY, 0]
    ].map((point) => RuntimeMath.projectPoint(this.modelViewProjection, point)).filter(Boolean);
    if (corners.length !== 4) return null;
    const minX = Math.min(...corners.map((point) => point.x * 0.5 + 0.5));
    const maxX = Math.max(...corners.map((point) => point.x * 0.5 + 0.5));
    const minY = Math.min(...corners.map((point) => point.y * 0.5 + 0.5));
    const maxY = Math.max(...corners.map((point) => point.y * 0.5 + 0.5));
    if (maxX < -0.2 || minX > 1.2 || maxY < -0.2 || minY > 1.2) return null;
    return {
      id: object.id,
      label: object.label,
      role: object.role,
      route: object.route,
      cameraTarget: object.cameraTarget,
      interactionZones: object.interactionZones,
      hitPadding: object.hitPadding,
      visible: visibility > 0.1,
      rect: { minX, maxX, minY, maxY },
      depth: object.id === this.stagePhase?.activeObjectState ? -100 : index + object.depth - visibility * 8
    };
  },

  getTargetTransform(object, index, inScene, elapsed, stagePhase) {
    const isHandoff = stagePhase.transitionPhase !== "idle" && !!stagePhase.previousObjectId;
    if (inScene) {
      const phase = stagePhase.transitionPhase;
      const activeTransform = this.getAuthoredActiveTransform(object, stagePhase, true);
      if (isHandoff) {
        return this.getIncomingRibbonTransform(object, activeTransform, stagePhase);
      }
      if (phase === "settle") {
        const ease = stagePhase.transitionEase || 1;
        activeTransform.rotation[0] += Math.sin(ease * Math.PI) * 0.02;
        activeTransform.rotation[1] -= Math.sin(ease * Math.PI) * 0.026;
      }
      return activeTransform;
    }
    const latentIndex = stagePhase.latentObjectStates.indexOf(object.id);
    const ring = stagePhase.stageComposition?.orbitalRing;
    if (isHandoff && object.id === stagePhase.previousObjectId) {
      return this.getOutgoingRibbonTransform(object, index, latentIndex, elapsed, stagePhase, ring);
    }
    if (ring?.enabled && latentIndex >= 0) {
      return this.getOrbitalRingTransform(object, latentIndex, elapsed, stagePhase, ring);
    }
    const slot = SLOT_SEQUENCE[(latentIndex >= 0 ? latentIndex : index) % SLOT_SEQUENCE.length];
    const pose = stagePhase.stageComposition?.latentSlots?.[slot] ||
      object.stage?.latentPose ||
      STAGE_LATENT_SLOTS[slot] ||
      { position: object.position, rotation: object.rotation, scale: object.scale };
    const turn = (latentIndex >= 0 ? latentIndex : index) * 0.83 + elapsed * 0.16;
    const drift = [
      Math.cos(turn) * 0.014,
      Math.sin(turn * 0.73) * 0.01,
      Math.sin(turn) * 0.014
    ];
    const focusPush = stagePhase.focusLock ? stagePhase.stageComposition?.focusPush ?? 0.14 : 0;
    return {
      position: [
        pose.position[0] + drift[0],
        pose.position[1] + drift[1] - focusPush * 0.25,
        pose.position[2] + drift[2] - focusPush
      ],
      rotation: [
        pose.rotation[0] + Math.sin(elapsed * 0.42 + index) * 0.018,
        pose.rotation[1] + Math.cos(elapsed * 0.34 + index) * 0.024,
        pose.rotation[2]
      ],
      scale: pose.scale
    };
  },

  getAuthoredActiveTransform(object, stagePhase, currentScene = false) {
    const compactFit = this.getCompactFitConfig(object, stagePhase, currentScene);
    const activeObjectPose = object.id === stagePhase?.activeObjectState ? object.stage?.activePose : null;
    const activePose = compactFit?.activePose || activeObjectPose || (currentScene ? stagePhase.stageComposition?.activePose : null) || object.stage?.activePose || object.activeTarget || {
      position: [0, 0.02, -0.05],
      rotation: [0, 0, 0],
      scale: [1.82, 1.04, 1]
    };
    const beat = currentScene ? stagePhase.beatIntensity || 0 : 0;
    const position = [...activePose.position];
    const rotation = [...activePose.rotation];
    const scale = [...activePose.scale];
    if (compactFit?.activePoseDelta) {
      const delta = compactFit.activePoseDelta;
      position[0] += delta.position?.[0] ?? 0;
      position[1] += delta.position?.[1] ?? 0;
      position[2] += delta.position?.[2] ?? 0;
      rotation[0] += delta.rotation?.[0] ?? 0;
      rotation[1] += delta.rotation?.[1] ?? 0;
      rotation[2] += delta.rotation?.[2] ?? 0;
      scale[0] *= delta.scale?.[0] ?? 1;
      scale[1] *= delta.scale?.[1] ?? 1;
      scale[2] *= delta.scale?.[2] ?? 1;
    }
    rotation[1] += this.getYawForCardFrontDirection(object, 0, 1);
    if (compactFit) {
      const phoneFit = RuntimeMath.clamp((820 - window.innerWidth) / 430, 0, 1);
      const phoneScale = stagePhase.stageComposition?.phoneScale ?? MOBILE_ACTIVE_CARD_SCALE;
      const compactScale = RuntimeMath.lerp(1.08, phoneScale, phoneFit);
      position[0] += phoneFit * (stagePhase.stageComposition?.phoneXBias ?? -0.16);
      scale[0] *= compactScale;
      scale[1] *= compactScale;
    }
    scale[0] *= 1.06 * (1 + beat * 0.026);
    scale[1] *= 1.06 * (1 + beat * 0.026);
    position[1] += beat * 0.05;
    return { position, rotation, scale };
  },

  getRibbonLaneTransform(baseTransform, side) {
    const lane = CARD_RIBBON_HANDOFF;
    const normalizedSide = side < 0 ? -1 : 1;
    return {
      position: [
        normalizedSide * lane.x,
        lane.y,
        lane.z
      ],
      rotation: [
        baseTransform.rotation[0] + lane.pitch,
        baseTransform.rotation[1] + normalizedSide * lane.yaw,
        baseTransform.rotation[2] - normalizedSide * lane.roll
      ],
      scale: [
        baseTransform.scale[0] * lane.scale,
        baseTransform.scale[1] * lane.scale,
        baseTransform.scale[2]
      ]
    };
  },

  mixTransforms(a, b, t) {
    const p = RuntimeMath.clamp(t);
    return {
      position: RuntimeMath.mixVec3(a.position, b.position, p),
      rotation: RuntimeMath.mixEuler(a.rotation, b.rotation, p),
      scale: RuntimeMath.mixVec3(a.scale, b.scale, p)
    };
  },

  getCompactFitConfig(object, stagePhase = this.stagePhase, currentScene = false) {
    if (!this.capabilities?.compactStageFit) return null;
    if (currentScene && object.id === stagePhase?.activeObjectState && object.stage?.compactFit) {
      return object.stage.compactFit;
    }
    if (currentScene) return stagePhase?.stageComposition?.compactFit || object.stage?.compactFit || null;
    return object.stage?.compactFit || null;
  },

  getHandoffDirection(stagePhase) {
    return stagePhase.handoffDirection >= 0 ? 1 : -1;
  },

  getIncomingRibbonTransform(object, activeTransform, stagePhase) {
    const direction = this.getHandoffDirection(stagePhase);
    const enterSide = CARD_RIBBON_HANDOFF.enterSide * direction;
    const enterLane = this.getRibbonLaneTransform(activeTransform, enterSide);
    const progress = stagePhase.transitionProgress || 0;
    if (stagePhase.transitionPhase === "preRoll") {
      return enterLane;
    }
    if (stagePhase.transitionPhase === "handoff") {
      return this.mixTransforms(enterLane, activeTransform, RuntimeMath.easeInOutCubic(progress) * 0.46);
    }
    if (stagePhase.transitionPhase === "present") {
      return this.mixTransforms(enterLane, activeTransform, 0.46 + RuntimeMath.easeOutCubic(progress) * 0.54);
    }
    if (stagePhase.transitionPhase === "settle") {
      const settle = Math.sin(RuntimeMath.clamp(progress) * Math.PI);
      return {
        position: [...activeTransform.position],
        rotation: [
          activeTransform.rotation[0] + settle * 0.018,
          activeTransform.rotation[1] - settle * 0.022,
          activeTransform.rotation[2]
        ],
        scale: activeTransform.scale
      };
    }
    return activeTransform;
  },

  getOutgoingRibbonTransform(object, index, latentIndex, elapsed, stagePhase, ring) {
    const direction = this.getHandoffDirection(stagePhase);
    const exitSide = CARD_RIBBON_HANDOFF.exitSide * direction;
    const activeTransform = this.getAuthoredActiveTransform(object, stagePhase, false);
    const exitLane = this.getRibbonLaneTransform(activeTransform, exitSide);
    const progress = stagePhase.transitionProgress || 0;
    if (stagePhase.transitionPhase === "preRoll") {
      const hold = RuntimeMath.clamp(CARD_RIBBON_HANDOFF.hold ?? 0.36, 0.05, 0.82);
      const exitProgress = progress <= hold ? 0 : RuntimeMath.easeInOutCubic((progress - hold) / Math.max(0.01, 1 - hold)) * 0.28;
      return this.mixTransforms(activeTransform, exitLane, exitProgress);
    }
    if (stagePhase.transitionPhase === "handoff") {
      return this.mixTransforms(activeTransform, exitLane, 0.28 + RuntimeMath.easeInOutCubic(progress) * 0.48);
    }
    if (stagePhase.transitionPhase === "present") {
      return this.mixTransforms(activeTransform, exitLane, 0.76 + RuntimeMath.easeOutCubic(progress) * 0.24);
    }
    if (stagePhase.transitionPhase === "settle") {
      return exitLane;
    }
    return exitLane;
  },

  getOrbitalRingTransform(object, latentIndex, elapsed, stagePhase, ring) {
    const ringIds = stagePhase.latentObjectStates || [];
    const total = Math.max(1, ringIds.length || this.objects.length);
    const objectSlot = latentIndex >= 0
      ? latentIndex
      : Number.isFinite(object.priority)
        ? object.priority % total
        : 0;
    const spatialState = object.workspaceCardSpatialState && typeof object.workspaceCardSpatialState === "object"
      ? object.workspaceCardSpatialState
      : null;
    const useSpatialOrbit = String(spatialState?.space || "").toLowerCase() === "orbit";
    const readSpatialNumber = (value) => {
      if (value === null || value === undefined || value === "") return NaN;
      const number = Number(value);
      return Number.isFinite(number) ? number : NaN;
    };
    const spatialAngle = useSpatialOrbit ? readSpatialNumber(spatialState.angle) : NaN;
    const spatialDistance = useSpatialOrbit ? readSpatialNumber(spatialState.distance) : NaN;
    const spatialElevation = useSpatialOrbit ? readSpatialNumber(spatialState.elevation) : NaN;
    const spatialScale = useSpatialOrbit ? readSpatialNumber(spatialState.scale) : NaN;
    const idlePull = ((elapsed * (ring.idleSpeed ?? ring.speed ?? 0.1)) % TAU) * (ring.idleOrbitScale ?? 1);
    const scrollPull = (stagePhase.pageProgress || 0) * (ring.scrollPull ?? 0.9);
    const authoredPhase = Number.isFinite(spatialAngle) ? (spatialAngle / 360) * TAU : null;
    const phase = (authoredPhase ?? ((objectSlot / total) * TAU)) + idlePull + scrollPull + (ring.phaseOffset || 0);
    const distanceScale = Number.isFinite(spatialDistance)
      ? RuntimeMath.clamp(spatialDistance / 1.22, 0.72, 1.28)
      : 1;
    const elevationOffset = Number.isFinite(spatialElevation) ? spatialElevation : 0;
    const scaleMultiplier = Number.isFinite(spatialScale)
      ? RuntimeMath.clamp(spatialScale, 0.62, 1.18)
      : 1;
    const center = ring.center || [0, -0.08, -0.82];
    const radiusX = (ring.radiusX || 1.9) * distanceScale;
    const radiusZ = (ring.radiusZ || 0.72) * distanceScale;
    const x = center[0] + Math.sin(phase) * radiusX;
    const z = center[2] + Math.cos(phase) * radiusZ;
    const y = center[1] + elevationOffset + Math.sin(phase * 1.7 + objectSlot) * 0.12;
    const near = RuntimeMath.clamp((Math.cos(phase) + 1) * 0.5, 0, 1);
    const radialX = (x - center[0]) / Math.max(radiusX, 0.001);
    const radialZ = (z - center[2]) / Math.max(radiusZ, 0.001);
    const profile = this.getCardCopySurfaceProfile(object);
    const outwardYaw = this.getYawForCardFrontDirection(
      object,
      radialX,
      radialZ,
      (ring.outwardYawOffset ?? 0) + (profile.orbitYawOffset || 0)
    );
    const scale = ring.scale || [0.54, 0.54, 1];

    return {
      position: [x, y, z],
      rotation: [
        (ring.pitch ?? -0.035) + Math.sin(phase * 0.8) * 0.02,
        outwardYaw,
        Math.sin(phase * 0.55) * 0.035
      ],
      scale: [
        scale[0] * scaleMultiplier * (0.82 + near * 0.22),
        scale[1] * scaleMultiplier * (0.82 + near * 0.22),
        scale[2]
      ]
    };
  },
};

// src/render-card-panels/manage-panel-canvas-textures.js





const runtimePanelTextureLifecycleMethods = {
  createBlankTexture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return texture;
  },

  configureCanvasTexture(texture) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const anisotropy = gl.getExtension("EXT_texture_filter_anisotropic") ||
      gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") ||
      gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
    if (anisotropy) {
      const max = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
      gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, max));
    }
    gl.generateMipmap(gl.TEXTURE_2D);
  },

  createCopyTextures() {
    const textures = new Map();
    this.objects.forEach((object) => {
      if (!object.copy) return;
      textures.set(object.id, this.createCopyTexture(object));
      this.copyTextureSignatures.set(object.id, this.getCopySignature(object));
    });
    return textures;
  },

  createTypeTextures() {
    const textures = new Map();
    this.objects.forEach((object) => {
      if (!object.spatialType?.enabled) return;
      textures.set(object.id, this.createTypeTexture(object, this.getRuntimePanelLayerGeometry(object, this.getGeometryForObject(object))));
      this.typeTextureSignatures.set(object.id, this.getCopySignature(object));
    });
    return textures;
  },

  createCopyTexture(object) {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) return this.blankTexture;
    ctx.scale(2, 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const tone = CARD_GLASS_RGB;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    const hasSpatialType = !!object.spatialType?.enabled;
    const floatingSurface = object.copy?.surface === "floating";

    if (hasSpatialType || floatingSurface) {
      this.drawFloatingCardMedia(ctx, object, tone);
      if (object.copy.mode === "input") {
        this.drawInputPreview(ctx, object, 78, 356, { layout: "left-button", buttonLabel: "Send" });
      }
      return this.canvasToTexture(canvas);
    }

    ctx.shadowColor = "rgba(0, 0, 0, 0.62)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.96)`;
    ctx.font = "800 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    this.drawTrackedText(ctx, object.copy.eyebrow || object.label, 78, 66, 7);

    ctx.fillStyle = "rgba(250, 247, 238, 0.99)";
    ctx.font = `${hasSpatialType ? "850 44px" : "850 54px"} Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif`;
    const titleY = this.drawWrappedText(ctx, object.copy.title || object.label, 78, 128, 780, hasSpatialType ? 52 : 62, 2);

    ctx.fillStyle = "rgba(235, 234, 224, 0.84)";
    ctx.font = `${hasSpatialType ? "560 25px" : "560 27px"} Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif`;
    const bodyY = this.drawWrappedText(ctx, object.copy.body || "", 78, titleY + 22, 760, hasSpatialType ? 35 : 38, 3);

    if (object.copy.mode === "pricing") {
      this.drawPricingRows(ctx, object, 78, 336);
    } else if (object.copy.mode === "input") {
      this.drawInputPreview(ctx, object, 78, Math.min(344, bodyY + 24));
    } else if (object.copy.mode === "steps") {
      this.drawStepPreview(ctx, object, 78, Math.min(344, bodyY + 18));
    } else if (object.copy.action) {
      this.drawPill(ctx, object.copy.action, 78, Math.min(354, bodyY + 28), 310, 52, tone);
    }

    if (!object.copy.mode && !object.copy.action) {
      ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.74)`;
      ctx.font = "700 21px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(object.copy.meta || object.route || "", 78, 424);
    }

    return this.canvasToTexture(canvas);
  },

  createTypeTexture(object, cardGeometry = null) {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) return this.blankTexture;
    ctx.scale(2, 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const tone = CARD_GLASS_RGB;
    const runtimeInputState = this.getRuntimeInputState(object.id);
    const lastChatMessage = runtimeInputState.messages[runtimeInputState.messages.length - 1];
    const runtimeBodyCopy = runtimeInputState.streamingText || lastChatMessage?.content || object.copy?.body || "";
    const assetId = this.getRuntimePanelLayerAssetId(object);
    const isRuntimeChatTranscript = object.id === "card10" || assetId === "card-chat-second-stage-asset";
    const profile = this.getCardCopySurfaceProfile(object);
    const regions = this.geometryBackedCopyRegions(object, cardGeometry) || profile.regions || {};
    const glowScale = this.holographicGlowScale();
    const titleInk = this.holographicInkStyle("rgba(250, 247, 238, 0.86)", "rgba(204, 216, 214, 0.3)");
    const bodyInk = this.holographicInkStyle("rgba(231, 243, 244, 0.56)", "rgba(190, 205, 204, 0.24)");
    const controlInk = this.holographicInkStyle(
      `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.74)`,
      "rgba(190, 205, 204, 0.29)"
    );
    const actionInk = this.holographicInkStyle(
      `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.78)`,
      "rgba(194, 208, 206, 0.31)"
    );
    const buttonInk = this.holographicInkStyle("rgba(250, 247, 238, 0.68)", "rgba(192, 207, 205, 0.28)");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";

    ctx.save();
    ctx.shadowColor = `rgba(212, 244, 255, ${0.22 * glowScale})`;
    ctx.shadowBlur = 11 * glowScale;
    ctx.fillStyle = titleInk;
    const titleRegion = regions.title || { x: 96, y: 86, width: 760, line: 46, font: "900 42px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
    ctx.font = this.holographicCanvasFont(titleRegion.font);
    const hasVisibleTitle = String(object.copy?.title || object.label || "").trim().length > 0;
    const bodyY = isRuntimeChatTranscript && !hasVisibleTitle
      ? titleRegion.y
      : this.drawTitleCopy(ctx, object, titleRegion);

    ctx.shadowColor = `rgba(212, 244, 255, ${0.1 * glowScale})`;
    ctx.shadowBlur = 6 * glowScale;
    ctx.fillStyle = bodyInk;
    const bodyRegion = isRuntimeChatTranscript && regions.transcript
      ? regions.transcript
      : regions.body || { x: titleRegion.x + 4, y: bodyY + 14, width: titleRegion.width * 0.88, line: 34, font: "620 27px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
    ctx.font = this.holographicCanvasFont(bodyRegion.font);
    const bodyStartY = isRuntimeChatTranscript && regions.transcript
      ? bodyRegion.y
      : Math.max(bodyRegion.y ?? Math.min(286, bodyY + 14), bodyY + (bodyRegion.gap ?? 14));
    const detailRegion = {
      ...bodyRegion,
      y: bodyStartY,
      maxY: bodyRegion.maxY ?? this.getBodyCopyMaxY(object, regions, bodyStartY)
    };
    if (this.capabilities.mobileOptimized && isRuntimeChatTranscript) {
      const transcriptFont = detailRegion.font || "620 20px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      detailRegion.font = this.scaleCanvasFont(transcriptFont, Math.max(this.parseCanvasFontSize(transcriptFont), 34));
      detailRegion.line = Math.max(detailRegion.line || 0, 38);
    }
    const detailY = isRuntimeChatTranscript
      ? this.drawChatTranscript(ctx, runtimeInputState, object, detailRegion)
      : this.drawFittedWrappedText(ctx, runtimeBodyCopy, detailRegion);

    const pricingOptions = Array.isArray(object.copy?.options)
      ? object.copy.options
      : Array.isArray(object.copy?.tiers)
        ? object.copy.tiers.map((tier) => {
          const [first, ...labelParts] = String(tier).split(" ");
          const hasPriceToken = /^[$\d]/.test(first || "");
          return {
            price: hasPriceToken ? first : "",
            label: hasPriceToken ? labelParts.join(" ") || tier : tier
          };
        })
        : [];
    if (object.copy?.mode === "input") {
      const rawInput = regions.input || { x: 140, y: 414, width: 360, font: "720 22px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
      const input = this.capabilities.mobileOptimized && isRuntimeChatTranscript
        ? {
          ...rawInput,
          font: this.scaleCanvasFont(rawInput.font, 23),
          ...(Number.isFinite(rawInput.meshMinY) && Number.isFinite(rawInput.meshMaxY)
            ? { textMinY: rawInput.meshMinY + 5, textMaxY: rawInput.meshMaxY + 5 }
            : {})
        }
        : rawInput;
      ctx.shadowColor = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${0.16 * glowScale})`;
      ctx.shadowBlur = 6 * glowScale;
      ctx.fillStyle = controlInk;
      const inputFont = this.holographicCanvasFont(input.font);
      ctx.font = inputFont;
      const fieldText = runtimeInputState.inputValue || object.copy?.field || "How can i help you?";
      this.drawFieldCopyText(ctx, fieldText, { ...input, font: inputFont });
      if (this.isRuntimeZone(object, "input") && this.getInputCaretPhase(object) === 0) {
        const paddingX = input.paddingX ?? 22;
        const fontSize = this.fontSizeFromCss(inputFont, 24);
        const height = input.height ?? fontSize * 1.8;
        const caretText = runtimeInputState.inputValue
          ? fieldText.slice(0, runtimeInputState.inputCaret)
          : "";
        const caretX = Math.min(input.x + input.width - paddingX, input.x + paddingX + ctx.measureText(caretText).width + 6);
        const caretCenterY = this.meshTextCenterY(input);
        const caretY = Number.isFinite(caretCenterY)
          ? caretCenterY - (fontSize + 6) * 0.5
          : input.y + Math.max(0, (height - fontSize) * 0.5) - 2;
        ctx.fillRect(caretX, caretY, 2, fontSize + 6);
      }
      const rawSubmit = regions.submit || { x: 826, y: 413, width: 52, font: "900 24px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
      const submit = this.capabilities.mobileOptimized && isRuntimeChatTranscript
        ? {
          ...rawSubmit,
          font: this.scaleCanvasFont(rawSubmit.font, 22),
          ...(Number.isFinite(rawSubmit.meshMinY) && Number.isFinite(rawSubmit.meshMaxY)
            ? { textMinY: rawSubmit.meshMinY - 14, textMaxY: rawSubmit.meshMaxY - 14 }
            : {})
        }
        : rawSubmit;
      ctx.fillStyle = buttonInk;
      ctx.font = this.holographicCanvasFont(submit.font);
      this.drawCenteredCopyText(ctx, "Send", submit);
    } else if (object.copy?.mode === "pricing" && pricingOptions.length) {
      const columns = regions.columns || [];
      const buttons = regions.buttons || [];
      ctx.shadowColor = `rgba(250, 247, 238, ${0.12 * glowScale})`;
      ctx.shadowBlur = 5 * glowScale;
      pricingOptions.slice(0, 3).forEach((option, optionIndex) => {
        const column = columns[optionIndex] || { x: 96 + optionIndex * 280, y: Math.min(330, detailY + 24), width: 220 };
        const button = buttons[optionIndex] || { x: column.x + 34, y: 414, width: 170 };
        const label = option.price ? `${option.price} ${option.label}` : option.label || "";
        ctx.fillStyle = buttonInk;
        ctx.font = this.holographicCanvasFont(button.font || "780 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif");
        this.drawCenteredCopyText(ctx, label || option.price || "", button);
      });
    } else if (object.copy?.mode === "steps") {
      const columns = regions.columns || [];
      const buttons = regions.buttons || [];
      const steps = object.copy.steps || ["Map", "Learn + Connect", "Run"];
      ctx.shadowColor = `rgba(250, 247, 238, ${0.12 * glowScale})`;
      ctx.shadowBlur = 5 * glowScale;
      steps.slice(0, 3).forEach((step, stepIndex) => {
        const column = columns[stepIndex] || { x: 96 + stepIndex * 265, y: Math.min(330, detailY + 24), width: 220 };
        const button = buttons[stepIndex] || { x: column.x + 34, y: 414, width: 170 };
        ctx.fillStyle = buttonInk;
        ctx.font = this.holographicCanvasFont(button.font || "780 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif");
        this.drawCenteredCopyText(ctx, step, button);
      });
    }
    if (object.copy?.strikePrice || object.copy?.salePrice) {
      const offer = regions.offer || { x: 96, y: Math.min(372, detailY + 32), width: 470, line: 48, font: "900 42px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
      const strikePrice = String(object.copy?.strikePrice || "").trim();
      const salePrice = String(object.copy?.salePrice || "").trim();
      ctx.shadowColor = `rgba(250, 247, 238, ${0.16 * glowScale})`;
      ctx.shadowBlur = 6 * glowScale;
      ctx.font = this.holographicCanvasFont(offer.font);
      ctx.fillStyle = "rgba(250, 247, 238, 0.46)";
      const strikeWidth = strikePrice ? ctx.measureText(strikePrice).width : 0;
      if (strikePrice) {
        ctx.fillText(strikePrice, offer.x, offer.y, offer.width);
        ctx.fillRect(offer.x - 4, offer.y + (offer.line || 48) * 0.46, strikeWidth + 8, 4);
      }
      if (salePrice) {
        ctx.fillStyle = actionInk;
        ctx.fillText(salePrice, offer.x + strikeWidth + (strikeWidth ? 34 : 0), offer.y, offer.width);
      }
    }
    if (object.copy?.action) {
      const action = regions.action || { x: 392, y: 412, width: 250, font: "850 23px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
      ctx.shadowColor = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${0.16 * glowScale})`;
      ctx.shadowBlur = 6 * glowScale;
      ctx.fillStyle = actionInk;
      ctx.font = this.holographicCanvasFont(action.font);
      this.drawCenteredCopyText(ctx, object.copy.action, action);
    }
    ctx.restore();

    return this.canvasToTexture(canvas);
  },

  canvasToTexture(canvas) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.configureCanvasTexture(texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    return texture;
  }
};

// src/render-card-panels/draw-panel-media-surfaces.js





const runtimePanelMediaDrawMethods = {
  drawFloatingCardMedia(ctx, object, tone) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const bloom = ctx.createRadialGradient(492, 182, 18, 492, 182, 520);
    bloom.addColorStop(0, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.052)`);
    bloom.addColorStop(0.38, "rgba(214, 247, 255, 0.018)");
    bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.strokeStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.07)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(138, 300);
    ctx.bezierCurveTo(282, 248, 382, 318, 522, 248);
    ctx.bezierCurveTo(642, 188, 760, 250, 852, 182);
    ctx.stroke();

    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 14; i += 1) {
      const x = 112 + i * 58;
      const top = 112 + Math.sin(i * 0.82 + (object.priority || 0)) * 32;
      const bottom = 312 - Math.cos(i * 0.64) * 18;
      const grad = ctx.createLinearGradient(x, top, x, bottom);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.55, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.07)`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x, top, 2.2, bottom - top);
    }
    ctx.restore();
  },

  drawMediaWash(ctx, object, tone) {
    const seed = (object.priority || 0) + 1;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const wash = ctx.createRadialGradient(760, 84, 40, 760, 84, 520);
    wash.addColorStop(0, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.052)`);
    wash.addColorStop(0.45, "rgba(255, 255, 255, 0.012)");
    wash.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(246, 241, 232, 0.005)";
    ctx.font = "900 150px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    ctx.fillText(String(object.copy?.eyebrow || object.label || "").slice(0, 8), 470, 270);
    ctx.restore();
  },

  drawMediaPlateStructure(ctx, object, tone) {
    const seed = (object.priority || 0) + 1;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const rail = ctx.createLinearGradient(730, 58, 952, 420);
    rail.addColorStop(0, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.026)`);
    rail.addColorStop(0.52, "rgba(246, 241, 232, 0.012)");
    rail.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = rail;
    this.roundedRect(ctx, 676, 72, 248, 300, 36);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.035)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(78, 284);
    ctx.lineTo(890, 284);
    ctx.moveTo(78, 318);
    ctx.lineTo(890, 318);
    ctx.stroke();

    ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.34)`;
    ctx.font = "800 13px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    ctx.fillText(`CORE ${String(object.role || "stage").toUpperCase()} SURFACE`, 678, 406);
    ctx.restore();
  },

  drawPricingRows(ctx, object, x, y) {
    const tone = CARD_GLASS_RGB;
    const tiers = [
      { id: "priceFounding", label: "Basic", price: "$49", note: "one-time", x: 0, width: 210 },
      { id: "pricePriority", label: "Premium", price: "$249", note: "priority", x: 272, width: 230, primary: true },
      { id: "secondary-input", label: "Custom", price: "Scope", note: "security + rollout", x: 592, width: 222 }
    ];
    ctx.save();
    ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.48)`;
    ctx.font = "800 15px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    ctx.fillText("CARD-NATIVE ACCESS CONTROLS", x, y - 34);
    tiers.forEach((tier, index) => {
      const rowX = x + tier.x;
      const pressed = this.isPressedZone(object, tier.id);
      const active = this.isRuntimeZone(object, tier.id);
      const pressY = pressed ? 4 : 0;
      ctx.fillStyle = "rgba(250, 247, 238, 0.94)";
      ctx.font = "850 32px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(tier.price, rowX + 24, y + 18 + pressY);
      ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.76)`;
      ctx.font = "800 19px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(tier.label, rowX + 24, y + 58 + pressY);
      ctx.fillStyle = "rgba(246, 241, 232, 0.52)";
      ctx.font = "650 13px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(tier.note, rowX + 24, y + 82 + pressY);
    });
    ctx.restore();
  },

  drawInputPreview(ctx, object, x, y, options = {}) {
    const tone = CARD_GLASS_RGB;
    const active = this.isRuntimeZone(object, "input");
    const inputState = this.getRuntimeInputState(object.id);
    const leftButton = options.layout === "left-button";
    const fieldX = leftButton ? x + 220 : x + 4;
    const fieldWidth = leftButton ? 624 : 690;
    const fieldHeight = 92;
    const sendX = leftButton ? x + 12 : x + 682;
    const value = inputState.inputValue || object.copy.field || "How can i help you?";
    ctx.fillStyle = inputState.inputValue ? "rgba(250, 247, 238, 0.9)" : "rgba(246, 241, 232, 0.52)";
    ctx.font = "700 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    ctx.fillText(value, fieldX + 30, y + 22);
    if (active && Math.floor(performance.now() / 520) % 2 === 0) {
      const caretText = inputState.inputValue
        ? value.slice(0, inputState.inputCaret)
        : "";
      const caretX = Math.min(fieldX + fieldWidth - 42, fieldX + 25 + ctx.measureText(caretText).width);
      ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.86)`;
      ctx.fillRect(caretX + 4, y + 17, 2, 31);
    }
    this.drawPill(ctx, options.buttonLabel ?? "Send", sendX, y - 4, 178, 74, tone, { pressed: this.isPressedZone(object, "primaryCta"), active: this.isRuntimeZone(object, "primaryCta") });
  },

  drawStepPreview(ctx, object, x, y) {
    const tone = CARD_GLASS_RGB;
    (object.copy.steps || []).forEach((step, index) => {
      const rowX = x + index * 230;
      ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.62)`;
      ctx.font = "800 21px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(`0${index + 1}`, rowX, y);
      ctx.fillStyle = "rgba(250, 247, 238, 0.86)";
      ctx.font = "800 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(step, rowX, y + 34);
    });
  },

  drawPill(ctx, text, x, y, width, height, tone, options = {}) {
    const pressY = options.pressed ? 3 : 0;
    if (!text) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${options.active ? 0.34 : 0.2})`;
      ctx.beginPath();
      ctx.arc(x + width * 0.5, y + height * 0.5 + pressY, 7 + (options.active ? 1.5 : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = "rgba(250, 247, 238, 0.92)";
    ctx.font = "800 22px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    this.drawCenteredCopyText(ctx, text, { x, y: y + pressY, width, height });
  }
};

// src/render-card-panels/draw-panel-text-and-transcript.js





const runtimePanelCopyDrawMethods = {
  drawTitleCopy(ctx, object, region) {
    return this.drawWrappedText(ctx, object.copy?.title || object.label, region.x, region.y, region.width, region.line, region.maxLines || 2);
  },

  getBodyCopyMaxY(object, regions, bodyStartY) {
    const controls = [
      regions.input?.y,
      regions.action?.y,
      ...(regions.buttons || []).map((button) => button.y)
    ].filter((value) => Number.isFinite(value));
    const controlY = controls.length ? Math.min(...controls) : 430;
    return Math.max(bodyStartY + 56, controlY - 18);
  },

  parseCanvasFontSize(font = "") {
    const match = String(font).match(/(\d+(?:\.\d+)?)px/);
    return match ? Number(match[1]) : 24;
  },

  scaleCanvasFont(font, nextSize) {
    return String(font).replace(/(\d+(?:\.\d+)?)px/, `${Number(nextSize).toFixed(nextSize % 1 ? 1 : 0)}px`);
  },

  wrapTextRows(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const rows = [];
    let row = "";
    words.forEach((word) => {
      const next = row ? `${row} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !row) {
        row = next;
        return;
      }
      rows.push(row);
      row = word;
    });
    if (row) rows.push(row);
    return rows;
  },

  drawChatTranscript(ctx, inputState, object, region) {
    const maxY = region.maxY ?? (region.y + (region.maxLines || 8) * (region.line || 30));
    const viewportHeight = Math.max(24, maxY - region.y);
    const baseFont = this.holographicCanvasFont(region.font || "620 24px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif");
    const baseSize = this.fontSizeFromCss(baseFont, 24);
    const lineHeight = Math.max(18, Math.min(region.line || baseSize * 1.2, 30));
    const transcriptTextCap = this.capabilities.mobileOptimized ? 34 : 23;
    const transcriptLabelSize = this.capabilities.mobileOptimized ? 19 : 14;
    const labelFont = this.holographicCanvasFont(`820 ${transcriptLabelSize}px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif`);
    const textFont = this.holographicCanvasFont(this.scaleCanvasFont(baseFont, Math.min(baseSize, transcriptTextCap)));
    const messageWidth = Math.max(80, (region.width || 520) - 18);
    const rows = [];
    const pushMessage = (message = {}) => {
      const content = String(message.content || "").trim();
      if (!content) return;
      const role = String(message.role || "assistant").toLowerCase();
      const label = role === "user" ? "YOU" : role === "tool" ? "TOOL" : "VALEN";
      rows.push({ kind: "label", text: label, role });
      ctx.font = textFont;
      this.wrapTextRows(ctx, content, messageWidth).forEach((line) => {
        rows.push({ kind: "content", text: line, role });
      });
      rows.push({ kind: "gap", text: "", role });
    };

    inputState.messages.forEach(pushMessage);
    if (inputState.streamingText) {
      pushMessage({
        role: inputState.toolName ? "tool" : "assistant",
        content: `${inputState.streamingText}${inputState.isStreaming ? " |" : ""}`
      });
    }
    if (!rows.length) {
      inputState.chatTranscriptRows = 0;
      return this.drawFittedWrappedText(ctx, object.copy?.body || "", region);
    }

    const allowedLines = Math.max(1, Math.floor(viewportHeight / lineHeight));
    const maxScroll = Math.max(0, rows.length - allowedLines);
    const startLine = inputState.chatAutoScroll || !Number.isFinite(inputState.chatScrollLine)
      ? maxScroll
      : RuntimeMath.clamp(Math.round(inputState.chatScrollLine), 0, maxScroll);
    inputState.chatScrollLine = startLine;
    inputState.chatTranscriptRows = rows.length;

    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x - 4, region.y - 2, region.width + 8, viewportHeight + 4);
    ctx.clip();
    rows.slice(startLine, startLine + allowedLines).forEach((row, index) => {
      if (row.kind === "gap") return;
      const y = region.y + index * lineHeight;
      if (row.kind === "label") {
        ctx.font = labelFont;
        ctx.fillStyle = row.role === "user"
          ? "rgba(250, 247, 238, 0.66)"
          : "rgba(147, 219, 221, 0.72)";
        ctx.fillText(row.text, region.x, y, region.width);
        return;
      }
      ctx.font = textFont;
      ctx.fillStyle = row.role === "user"
        ? "rgba(250, 247, 238, 0.78)"
        : "rgba(231, 243, 244, 0.62)";
      ctx.fillText(row.text, region.x + 12, y, messageWidth);
    });
    ctx.restore();

    if (rows.length > allowedLines) {
      const trackX = region.x + region.width + 10;
      const trackHeight = Math.max(18, viewportHeight - 6);
      const thumbHeight = Math.max(16, trackHeight * (allowedLines / rows.length));
      const thumbY = region.y + 3 + (trackHeight - thumbHeight) * (startLine / Math.max(1, maxScroll));
      ctx.fillStyle = "rgba(147, 219, 221, 0.16)";
      ctx.fillRect(trackX, region.y + 3, 2, trackHeight);
      ctx.fillStyle = "rgba(212, 244, 255, 0.42)";
      ctx.fillRect(trackX - 1, thumbY, 4, thumbHeight);
    }

    return region.y + Math.min(rows.length - startLine, allowedLines) * lineHeight;
  },

  drawFittedWrappedText(ctx, text, region) {
    const originalFont = ctx.font;
    const originalSize = this.parseCanvasFontSize(originalFont);
    const minSize = region.minFontPx || Math.max(17, originalSize * 0.72);
    let size = originalSize;
    let lineHeight = region.line || originalSize * 1.22;
    let rows = [];
    let allowedLines = region.maxLines || 3;
    const maxY = region.maxY ?? (region.y + allowedLines * lineHeight);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      ctx.font = this.scaleCanvasFont(originalFont, size);
      lineHeight = (region.line || originalSize * 1.22) * (size / originalSize);
      allowedLines = Math.max(1, Math.min(region.maxLines || 12, Math.floor((maxY - region.y) / Math.max(1, lineHeight))));
      rows = this.wrapTextRows(ctx, text, region.width);
      if (rows.length <= allowedLines || size <= minSize) break;
      size = Math.max(minSize, size - 2);
    }
    rows.slice(0, allowedLines).forEach((row, index) => ctx.fillText(row, region.x, region.y + index * lineHeight));
    ctx.font = originalFont;
    return region.y + Math.min(rows.length, allowedLines) * lineHeight;
  },

  drawCenteredCopyText(ctx, text, region) {
    const height = region.height ?? 50;
    ctx.save();
    ctx.textAlign = "center";
    const centerX = Number.isFinite(region.textCenterX) ? region.textCenterX : region.x + region.width * 0.5;
    if (region.alignY === "mesh-bounds") {
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, centerX, this.meshBoundedTextBaseline(ctx, text, region), region.width * 0.92);
    } else {
      ctx.textBaseline = "middle";
      ctx.fillText(text, centerX, region.y + height * 0.5, region.width * 0.92);
    }
    ctx.restore();
  },

  drawFieldCopyText(ctx, text, region) {
    const paddingX = region.paddingX ?? 22;
    const fontSize = this.fontSizeFromCss(region.font, 24);
    const height = region.height ?? fontSize * 1.8;
    const y = region.alignY === "mesh-bounds"
      ? this.meshBoundedTextBaseline(ctx, text, region)
      : region.y + Math.max(0, (height - fontSize) * 0.5) - 1;
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = region.alignY === "mesh-bounds" ? "alphabetic" : "top";
    ctx.fillText(text, region.x + paddingX, y, Math.max(24, region.width - paddingX * 1.55));
    ctx.restore();
  },

  meshTextCenterY(region) {
    if (Number.isFinite(region.textMinY) && Number.isFinite(region.textMaxY)) {
      return (region.textMinY + region.textMaxY) * 0.5;
    }
    if (Number.isFinite(region.meshCenterY)) return region.meshCenterY;
    if (Number.isFinite(region.textCenterY)) return region.textCenterY;
    return NaN;
  },

  meshBoundedTextBaseline(ctx, text, region) {
    const centerY = this.meshTextCenterY(region);
    if (!Number.isFinite(centerY)) return region.y ?? 0;
    const metrics = ctx.measureText(text || "M");
    const fontSize = this.fontSizeFromCss(ctx.font, 24);
    const ascent = Number.isFinite(metrics.actualBoundingBoxAscent) ? metrics.actualBoundingBoxAscent : fontSize * 0.72;
    const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? metrics.actualBoundingBoxDescent : fontSize * 0.22;
    return centerY + (ascent - descent) * 0.5;
  },

  fontSizeFromCss(font, fallback = 24) {
    const match = String(font || "").match(/(\d+(?:\.\d+)?)px/);
    return match ? Number(match[1]) : fallback;
  },

  roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  drawTrackedText(ctx, text, x, y, tracking) {
    let cursor = x;
    String(text || "").split("").forEach((letter) => {
      ctx.fillText(letter, cursor, y);
      cursor += ctx.measureText(letter).width + tracking;
    });
    return cursor;
  },

  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next;
        return;
      }
      lines.push(line);
      line = word;
    });
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach((row, index) => ctx.fillText(row, x, y + index * lineHeight));
    return y + Math.min(lines.length, maxLines) * lineHeight;
  }
};

// src/render-card-panels/draw-panel-canvas-textures.js



const runtimePanelTextureDrawMethods = {
  ...runtimePanelTextureLifecycleMethods,
  ...runtimePanelMediaDrawMethods,
  ...runtimePanelCopyDrawMethods
};

// src/render-card-panels/shade-panel-glass-surfaces.js
const panelVertexShader = `
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

const panelFragmentShader = `
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

// src/render-card-panels/start-and-dispose-card-panel-layer.js

const runtimePanelLifecycleMethods = {
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

// src/animate-runtime-motion/animate-phase-transitions.js

function resolvePhaseHandoffVisibility(stagePhase = {}, composition = {}, isHandoffPrevious = false) {
  if (!isHandoffPrevious) return 0;
  if (stagePhase.transitionPhase === "settle") {
    return RuntimeMath.lerp(0.62, composition.orbitReattachVisibility ?? 0.08, RuntimeMath.easeInOutCubic(stagePhase.transitionProgress || 0));
  }
  if (stagePhase.transitionPhase === "handoff") {
    return RuntimeMath.lerp(0.96, 0.72, RuntimeMath.easeInOutCubic(stagePhase.transitionProgress || 0));
  }
  if (stagePhase.transitionPhase === "preRoll") return 0.96;
  return 0.72;
}

function resolvePhaseHandoffCopyVisibility(stagePhase = {}, composition = {}, isHandoffPrevious = false) {
  if (!isHandoffPrevious) return 0;
  if (stagePhase.transitionPhase === "settle") {
    return RuntimeMath.lerp(0.16, composition.orbitReattachCopy ?? 0.01, RuntimeMath.easeInOutCubic(stagePhase.transitionProgress || 0));
  }
  if (stagePhase.transitionPhase === "handoff") {
    return RuntimeMath.lerp(0.56, 0.24, RuntimeMath.easeInOutCubic(stagePhase.transitionProgress || 0));
  }
  if (stagePhase.transitionPhase === "preRoll") return 0.56;
  return 0.18;
}

function resolveCardPanelMoveEase(stagePhase = {}, { inScene = false, isHandoffPrevious = false } = {}) {
  if (inScene) {
    if (stagePhase.transitionPhase === "present") return 0.34;
    if (stagePhase.transitionPhase === "handoff") return 0.26;
    return 0.19;
  }
  if (isHandoffPrevious) {
    if (stagePhase.transitionPhase === "handoff") return 0.28;
    return 0.24;
  }
  if (stagePhase.focusLock) return 0.2;
  return 0.12;
}

// src/animate-runtime-motion/animate-card-foreground-and-orbit.js

function snapCompletedOrbitHandoff({
  objectId = "",
  stagePhase = {},
  composition = {},
  showOrbitalLatents = false,
  latentIndex = -1,
  inScene = false,
  transform,
  targetTransform,
  visibility,
  copyVisibility
} = {}) {
  if (objectId !== stagePhase.completedHandoffObjectId || inScene || !showOrbitalLatents || latentIndex < 0) {
    return false;
  }
  transform.position = [...targetTransform.position];
  transform.rotation = [...targetTransform.rotation];
  transform.scale = [...targetTransform.scale];
  visibility.set(objectId, Math.min(visibility.get(objectId) || 0, composition.orbitReattachVisibility ?? 0.08));
  copyVisibility.set(objectId, Math.min(copyVisibility.get(objectId) || 0, composition.orbitReattachCopy ?? 0.01));
  return true;
}

function animateCardForegroundAndOrbit({
  objectId = "",
  transform,
  targetTransform,
  moveEase = 0.12,
  hover,
  materialWake,
  active,
  visibility,
  copyVisibility,
  zonePulse,
  hoverTarget = 0,
  latentWake = 0,
  activeTarget = 0,
  visibilityTarget = 0,
  copyTarget = 0,
  copyEase = 0.06,
  zonePulseTarget = 0
} = {}) {
  RuntimeMath.lerpVec3(transform.position, transform.position, targetTransform.position, moveEase);
  RuntimeMath.lerpEuler(transform.rotation, transform.rotation, targetTransform.rotation, moveEase);
  RuntimeMath.lerpVec3(transform.scale, transform.scale, targetTransform.scale, moveEase);
  hover.set(objectId, RuntimeMath.lerp(hover.get(objectId), Math.max(hoverTarget, latentWake), 0.12));
  materialWake.set(objectId, RuntimeMath.lerp(materialWake.get(objectId), latentWake, 0.1));
  active.set(objectId, RuntimeMath.lerp(active.get(objectId), activeTarget, 0.1));
  visibility.set(objectId, RuntimeMath.lerp(visibility.get(objectId), visibilityTarget, 0.1));
  copyVisibility.set(objectId, RuntimeMath.lerp(copyVisibility.get(objectId), copyTarget, copyEase));
  zonePulse.set(objectId, RuntimeMath.lerp(zonePulse.get(objectId), zonePulseTarget, 0.18));
}

// src/render-card-panels/update-card-panel-motion-and-hit-targets.js



const runtimePanelUpdateMethods = {
  update(stagePhase, dt) {
    this.hitTargets = [];
    this.stagePhase = stagePhase;
    this.activeCardNumber = stagePhase.activeCardNumber;
    const activeId = stagePhase.activeObjectState;
    const hoverId = stagePhase.hoverObjectId || this.interaction.hoverMeshId;
    const activeHover = hoverId && hoverId === activeId ? 1 : 0;
    const composition = stagePhase.stageComposition || {};
    const showOrbitalLatents = !!composition.orbitalRing?.enabled;
    const drawableIds = new Set(stagePhase.drawOrder || []);
    const elapsed = performance.now() * 0.001;
    const mouseLean = RuntimeMath.clamp((this.interaction.pointer.x - 0.5) * 1.45, -1, 1);
    const lateralGesture = RuntimeMath.clamp(
      (this.interaction.pointer.gestureX || 0) * 0.82 + mouseLean * 0.22,
      -1,
      1
    );
    this.gestureLean = RuntimeMath.lerp(this.gestureLean || 0, lateralGesture, Math.abs(lateralGesture) > 0.01 ? 0.16 : 0.07);
    if (activeId !== "card1" && this.cardInteractionState.activeZoneId.startsWith("card1:")) {
      this.setActiveRuntimeZone("none", "scene-change");
    }
    let nativeInputTarget = null;
    this.objects.forEach((object, index) => {
      const inScene = object.id === activeId;
      const isHandoffPrevious = object.id === stagePhase.previousObjectId && stagePhase.transitionPhase !== "idle";
      const isDrawable = drawableIds.has(object.id) && (!composition.hideLatentCards || showOrbitalLatents || inScene);
      const latentIndex = stagePhase.latentObjectStates.indexOf(object.id);
      const sceneBoost = inScene ? 1 : 0.16;
      const hoverTarget = object.id === hoverId ? 1 : 0;
      const latentWake = !inScene && isDrawable && activeHover
        ? Math.max(0.08, 0.22 - Math.max(0, latentIndex) * 0.025)
        : 0;
      const activeTarget = object.id === activeId ? 1 : 0;
      const latentCeiling = stagePhase.focusLock ? composition.latentVisibility ?? 0.32 : 0.5;
      const hoverCeiling = stagePhase.focusLock ? composition.latentHoverVisibility ?? 0.48 : 0.74;
      const handoffFade = resolvePhaseHandoffVisibility(stagePhase, composition, isHandoffPrevious);
      const baseVisibility = isHandoffPrevious ? handoffFade : inScene ? 1 : latentCeiling;
      const visibilityTarget = isDrawable ? Math.max(baseVisibility, hoverTarget * hoverCeiling, activeTarget) : 0;
      const handoffCopy = resolvePhaseHandoffCopyVisibility(stagePhase, composition, isHandoffPrevious);
      const copyTarget = isDrawable ? inScene ? 1 : Math.max(handoffCopy, hoverTarget ? composition.hoverLatentCopy ?? 0.14 : composition.latentCopy ?? 0.02) : 0;
      const transform = this.transforms.get(object.id);
      const targetTransform = this.getTargetTransform(object, index, inScene, elapsed, stagePhase);
      snapCompletedOrbitHandoff({
        objectId: object.id,
        stagePhase,
        composition,
        showOrbitalLatents,
        latentIndex,
        inScene,
        transform,
        targetTransform,
        visibility: this.visibility,
        copyVisibility: this.copyVisibility
      });
      animateCardForegroundAndOrbit({
        objectId: object.id,
        transform,
        targetTransform,
        moveEase: resolveCardPanelMoveEase(stagePhase, { inScene, isHandoffPrevious }),
        hover: this.hover,
        materialWake: this.materialWake,
        active: this.active,
        visibility: this.visibility,
        copyVisibility: this.copyVisibility,
        zonePulse: this.zonePulse,
        hoverTarget,
        latentWake,
        activeTarget,
        visibilityTarget,
        copyTarget,
        copyEase: inScene ? 0.16 : 0.06,
        zonePulseTarget: stagePhase.hoverZoneId && object.id === activeId ? 1 : 0
      });
      const target = isDrawable ? this.buildHitTarget(object, index, Math.max(inScene ? sceneBoost : 0.18, visibilityTarget), this.getRuntimePanelLayerGeometry(object, this.getGeometryForObject(object))) : null;
      if (target) {
        this.hitTargets.push(target);
        const inputZone = object.role === "input"
          ? object.interactionZones?.find((zone) => zone.id === "input")
          : null;
        if (inScene && inputZone) nativeInputTarget = { target, zone: inputZone };
      }
    });
    this.updateNativeInputOverlay(nativeInputTarget?.target || null, nativeInputTarget?.zone || null);
  }
};

// src/render-card-panels/render-card-panel-frame.js



const runtimePanelRenderMethods = {
  render(time, dpr) {
    const gl = this.gl;
    gl.useProgram(this.program);
    this.boundGeometry = null;
    gl.uniformMatrix4fv(this.locations.viewProjection, false, this.cameraRig.viewProjection);
    gl.uniform2f(this.locations.resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(this.locations.waveMap, 0);
    gl.uniform1i(this.locations.copyMap, 1);
    gl.uniform1f(this.locations.time, time * 0.001);
    gl.uniform1f(this.locations.dpr, dpr);
    gl.uniform2f(this.locations.pointer, this.interaction.pointer.x, this.interaction.pointer.y);
    this.waveField.bind(0);
    gl.disable(gl.CULL_FACE);

    const drawObjects = (this.stagePhase?.drawOrder?.length ? this.stagePhase.drawOrder : this.objects.map((object) => object.id))
      .map((id) => this.objects.find((object) => object.id === id))
      .filter((object) => object && (!this.stagePhase?.stageComposition?.hideLatentCards || this.stagePhase?.stageComposition?.orbitalRing?.enabled || object.id === this.stagePhase?.activeObjectState));
    drawObjects.forEach((object, index) => {
      const geometry = this.getGeometryForObject(object);
      this.bindGeometry(geometry);
      const hover = this.hover.get(object.id) || 0;
      const wake = this.materialWake.get(object.id) || 0;
      const materialHover = Math.max(hover, wake);
      const active = this.active.get(object.id) || 0;
      const pulse = this.zonePulse.get(object.id) || 0;
      const pressed = this.state.get("pressedMeshId") === object.id ? 1 : 0;
      const visibility = this.visibility.get(object.id) || 0.2;
      const copyVisibility = this.copyVisibility.get(object.id) || 0.12;
      const theatreBoost = this.stagePhase?.stageComposition?.theatre && object.id !== this.stagePhase?.activeObjectState ? 0.04 : 0;
      const renderVisibility = RuntimeMath.clamp(visibility + theatreBoost, 0, 1);
      const renderCopyVisibility = RuntimeMath.clamp(copyVisibility + theatreBoost * 0.08, 0, 1);
      const transform = this.transforms.get(object.id);
      const presentation = this.getPresentationPose(object, transform, this.stagePhase, time, hover, active, pressed);
      const rotation = presentation.rotation;
      const renderPosition = presentation.position;
      const renderScale = presentation.scale;
      RuntimeMath.compose(this.modelMatrix, renderPosition, rotation, renderScale);
      gl.uniformMatrix4fv(this.locations.model, false, this.modelMatrix);
      gl.uniform3f(this.locations.tone, CARD_GLASS_TONE[0], CARD_GLASS_TONE[1], CARD_GLASS_TONE[2]);
      gl.uniform1f(this.locations.hover, materialHover);
      gl.uniform1f(this.locations.active, Math.max(active, pulse * 0.45, pressed * 0.32));
      gl.uniform1f(this.locations.objectVisibility, renderVisibility);
      gl.uniform1f(this.locations.activeScene, object.cardNumber === this.activeCardNumber ? 1 : 0);
      gl.uniform1f(this.locations.panelId, (object.priority ?? index) + 1);
      const material = object.materialProfile || {};
      const beat = this.stagePhase?.beatIntensity || 0;
      const focusLock = object.id === this.stagePhase?.activeObjectState && this.stagePhase?.focusLock ? 1 : 0;
      gl.uniform1f(this.locations.stageBeat, beat * (material.chapterSnap || 1));
      gl.uniform1f(this.locations.focusLock, focusLock);
      gl.uniform1f(this.locations.copyBoost, material.copyBoost || CORE_RUNTIME_MANIFEST.visualProfile.copyBoost);
      gl.uniform1f(this.locations.latentDim, material.latentDim || CORE_RUNTIME_MANIFEST.visualProfile.latentDim);
      gl.uniform1f(this.locations.planeMode, 0);
      this.bindCardBaseMaterialUniforms(geometry);
      gl.uniform1f(this.locations.waveStrength, 0.008 + (material.waveStrength || 1) * (materialHover * 0.11 + active * 0.18 + pulse * 0.05 + beat * 0.045));
      gl.uniform1f(this.locations.copyVisible, 0);
      gl.activeTexture(gl.TEXTURE1);
      this.ensureCopyTexture(object);
      gl.bindTexture(gl.TEXTURE_2D, this.copyTextures.get(object.id) || this.blankTexture);
      if (!this.usePbrAssetBodies) {
        gl.drawElements(gl.TRIANGLES, geometry.indices.length, geometry.indexType, 0);
      }
      if (object.spatialType?.enabled) {
        this.renderSpatialTypePlane(
          object,
          { position: renderPosition, rotation, scale: renderScale },
          active,
          hover,
          pulse,
          time,
          index,
          this.typePlaneGeometry || geometry,
          renderCopyVisibility,
          geometry
        );
      }
      if (!this.usePbrAssetBodies && object.id === this.stagePhase?.activeObjectState) {
        this.renderZoneCardAssets(object, geometry, renderPosition, rotation, renderScale, active, hover, pulse, time, index);
      }
    });
    gl.disable(gl.CULL_FACE);
  }
};

// src/animate-runtime-motion/cancel-runtime-motion-handles.js
function createRuntimeMotionHandleRegistry() {
  const handles = new Set();
  return {
    add(handle) {
      if (handle) handles.add(handle);
      return handle;
    },
    cancelAll() {
      handles.forEach((handle) => {
        if (typeof handle === "number") {
          window.cancelAnimationFrame?.(handle);
          window.clearTimeout?.(handle);
          return;
        }
        if (typeof handle?.cancel === "function") handle.cancel();
        else if (typeof handle?.pause === "function") handle.pause();
      });
      handles.clear();
    },
    delete(handle) {
      handles.delete(handle);
    },
    get size() {
      return handles.size;
    }
  };
}

// src/render-card-panels/render-runtime-card-panels.js











class RuntimePanelLayer {
  constructor(manifest, state, cardGeometryAssets = null, capabilities = {}) {
    this.manifest = manifest;
    this.state = state;
    this.capabilities = capabilities;
    this.defaultCardAssetId = "card-base-asset";
    this.cardGeometryAssets = this.normalizeCardGeometryAssets(cardGeometryAssets);
    this.cardMaterialProfiles = new Map(manifest.assets
      .filter((asset) => asset.materialProfile)
      .map((asset) => [asset.id, asset.materialProfile]));
    this.objects = manifest.runtimeObjectStates.filter((object) => object.type === "panel");
    this.hitTargets = [];
    this.hover = new Map(this.objects.map((object) => [object.id, 0]));
    this.materialWake = new Map(this.objects.map((object) => [object.id, 0]));
    this.active = new Map(this.objects.map((object) => [object.id, 0]));
    this.visibility = new Map(this.objects.map((object) => [object.id, 0.2]));
    this.copyVisibility = new Map(this.objects.map((object) => [object.id, 0.12]));
    this.zonePulse = new Map(this.objects.map((object) => [object.id, 0]));
    this.transforms = new Map(this.objects.map((object) => [
      object.id,
      {
        position: [...object.position],
        rotation: [...object.rotation],
        scale: [...object.scale]
      }
    ]));
    this.modelMatrix = new Float32Array(16);
    this.modelViewProjection = new Float32Array(16);
    this.parentModelMatrix = new Float32Array(16);
    this.zoneModelMatrix = new Float32Array(16);
    this.geometries = new Map();
    this.visualPanelGeometries = new Map();
    this.visualPanelGeometryVersion = 0;
    this.geometry = null;
    this.typePlaneGeometry = null;
    this.boundGeometry = null;
    this.copyTextures = new Map();
    this.copyTextureSignatures = new Map();
    this.typeTextures = new Map();
    this.typeTextureSignatures = new Map();
    this.blankTexture = null;
    this.stagePhase = null;
    this.nativeInputOverlay = null;
    this.nativeInputOverlaySyncing = false;
    this.onNativeInputOverlayFocus = this.onNativeInputOverlayFocus.bind(this);
    this.onNativeInputOverlayInput = this.onNativeInputOverlayInput.bind(this);
    this.onNativeInputOverlayKeyDown = this.onNativeInputOverlayKeyDown.bind(this);
    this.onNativeInputOverlayBlur = this.onNativeInputOverlayBlur.bind(this);
    this.runtimeInputStatesByObjectId = new Map();
    this.cardInteractionState = {
      activeZoneId: "none",
      pressedZoneId: "none",
      inputValue: "",
      inputCaret: 0,
      lastAction: "none",
      version: 0
    };
    this.usePbrAssetBodies = false;
    this.gestureLean = 0;
    this.motionHandles = createRuntimeMotionHandleRegistry();
    this.onKeyDown = this.onKeyDown.bind(this);
  }
}

// Locked stage anchor: do not scene-tune or animate this XYZ. The center sculpture must stay fixed below the cards.
Object.assign(
  RuntimePanelLayer.prototype,
  runtimePanelGeometryMethods,
  runtimePanelPresentationMethods,
  runtimePanelSpatialRenderMethods,
  runtimePanelInputMethods,
  runtimePanelActionMethods,
  runtimePanelTransformMethods,
  runtimePanelTextureDrawMethods,
  runtimePanelLifecycleMethods,
  runtimePanelUpdateMethods,
  runtimePanelRenderMethods
);

// src/render-center-sculpture/render-center-sculpture.js



const SCULPTURE_FIXED_POSITION = [0.0, -1.05, -2.84];
const SCULPTURE_FIXED_ROTATION = [0.14, 0.0, 0.0];
const SCULPTURE_FIXED_SCALE = [1.216, 1.216, 1.216];
// Sculpture-only HDRI softening: higher roughness samples broader PMREM mips so facet highlights read larger and less busy.
const SCULPTURE_ENV_INTENSITY_SCALE = 1.0;
const SCULPTURE_ENV_HOVER_BOOST = 0.34;
const SCULPTURE_ENV_BEAT_BOOST = 0.1;
const SCULPTURE_MIN_ROUGHNESS = 0.16;
// MVP SHIPPING LOCK: keep the real Three/PBR layer crisp without uncapping the whole choreography renderer.
const THREE_PBR_DPR_MAX = 2.5;

const SCULPTURE_SCENE_POSES = {
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

class RuntimeSculptureLayer {
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

// src/render-three-assets/setup-three-environment-lights-and-haze.js


const runtimeThreeEnvironmentMethods = {
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

// src/render-three-assets/load-three-card-templates-and-materials.js

const runtimeThreeTemplateMethods = {
  async loadAssets() {
    const loader = new this.GLTFLoader();
    const assets = this.manifest.assets.filter((asset) => asset.sourcePath && asset.sourcePath.endsWith(".glb"));
    await Promise.all(assets.map(async (asset) => {
      this.materialProfiles.set(asset.id, asset.materialProfile || null);
      const sourcePath = resolveRuntimeAssetPath(asset.sourcePath);
      const gltf = await loader.loadAsync(sourcePath);
      const template = this.normalizeTemplate(gltf.scene, this.registry.get(asset.id));
      this.applyAuthoredMaterials(template, this.registry.get(asset.id));
      this.assetTemplates.set(asset.id, template);
    }));

    const sculptureTemplate = this.assetTemplates.get("center-sculpture-asset");
    if (sculptureTemplate) {
      this.sculpture = sculptureTemplate.clone(true);
      this.cloneMaterials(this.sculpture);
      this.scene.add(this.sculpture);
    }

    this.manifest.runtimeObjectStates
      .filter((object) => object.type === "panel")
      .forEach((object) => {
        const template = this.assetTemplates.get(object.cardAssetId || "card-base-asset");
        if (!template) return;
        const card = template.clone(true);
        this.cloneMaterials(card);
        card.userData.runtimeObject = object;
        this.cards.set(object.id, card);
        this.scene.add(card);
      });
    this.state.set("assetsLabel", `pbr:${this.cards.size}+sculpture`);
  },

  normalizeTemplate(root, runtimeAsset) {
    const THREE = this.THREE;
    const wrapper = new THREE.Group();
    wrapper.name = root.name || runtimeAsset?.id || "valen-asset";
    const coordinateFrame = runtimeAsset?.coordinateFrame || runtimeAsset?.bounds?.coordinateFrame;
    const isCardPlane = coordinateFrame === "card-plane";
    if (isCardPlane) {
      root.rotation.y -= Math.PI / 2;
      root.updateMatrixWorld(true);
    }
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    if (isCardPlane && runtimeAsset?.id) {
      this.cardVisualMetrics.set(runtimeAsset.id, this.createVisualPanelMetrics(root, runtimeAsset, box, center));
    }
    const target = runtimeAsset?.bounds;
    const targetWidth = isCardPlane ? 2 : target ? Math.max(0.001, target.max[0] - target.min[0]) : 2;
    const targetHeight = isCardPlane ? 1.1 : target ? Math.max(0.001, target.max[1] - target.min[1]) : targetWidth;
    const targetCenter = target
      ? new THREE.Vector3(
        (target.min[0] + target.max[0]) * 0.5,
        (target.min[1] + target.max[1]) * 0.5,
        (target.min[2] + target.max[2]) * 0.5
      )
      : new THREE.Vector3();
    const scale = Math.min(
      targetWidth / Math.max(size.x, 0.001),
      targetHeight / Math.max(size.y, 0.001)
    );
    root.position.sub(center);
    wrapper.add(root);
    wrapper.userData.assetScale = isCardPlane ? 1 : Number.isFinite(scale) && scale > 0 ? scale : 1;
    wrapper.userData.assetCenter = isCardPlane ? [0, 0, 0] : targetCenter.toArray();
    wrapper.scale.setScalar(wrapper.userData.assetScale);
    wrapper.position.copy(isCardPlane ? new THREE.Vector3() : targetCenter);
    return wrapper;
  },

  createVisualPanelMetrics(root, runtimeAsset, box, center) {
    const THREE = this.THREE;
    const partEntries = [];
    root.traverse((node) => {
      if (!node.isMesh) return;
      const partBox = new THREE.Box3().setFromObject(node);
      if (partBox.isEmpty()) return;
      partEntries.push({
        nodeName: node.name || "",
        meshName: node.geometry?.name || node.name || "",
        box: partBox
      });
    });
    const bodyEntry = partEntries.find((entry) => {
      const nodeName = String(entry.nodeName || "").toLowerCase();
      const meshName = String(entry.meshName || "").toLowerCase();
      return nodeName.includes("cardchatbody") || meshName.includes("cardchatbody");
    });
    const metricBox = runtimeAsset?.id === "card-chat-second-stage-asset" && bodyEntry ? bodyEntry.box : box;
    const size = new THREE.Vector3();
    metricBox.getSize(size);
    const normalizer = runtimeAsset?.id === "card-chat-second-stage-asset" ? 1 : 2 / Math.max(size.x, size.y, size.z, 0.001);
    const toRuntimePanelBounds = (sourceBox) => {
      const minX = (sourceBox.min.x - center.x) * normalizer;
      const maxX = (sourceBox.max.x - center.x) * normalizer;
      return {
        minX: -maxX,
        minY: (sourceBox.min.y - center.y) * normalizer,
        minZ: (sourceBox.min.z - center.z) * normalizer,
        maxX: -minX,
        maxY: (sourceBox.max.y - center.y) * normalizer,
        maxZ: (sourceBox.max.z - center.z) * normalizer
      };
    };
    const parts = partEntries.map((entry) => ({
      nodeName: entry.nodeName,
      meshName: entry.meshName,
      bounds: toRuntimePanelBounds(entry.box)
    }));
    return {
      bounds: toRuntimePanelBounds(metricBox),
      parts,
      source: runtimeAsset.id,
      materialSlots: runtimeAsset.materialSlots || []
    };
  },

  getCardVisualMetrics() {
    return new Map(this.cardVisualMetrics);
  },

  cloneMaterials(root) {
    root.traverse((node) => {
      if (!node.isMesh) return;
      if (Array.isArray(node.material)) {
        node.material = node.material.map((material) => material.clone());
      } else if (node.material) {
        node.material = node.material.clone();
      }
    });
  },

  applyAuthoredMaterials(root, runtimeAsset) {
    const slots = runtimeAsset?.materialSlots || [];
    const isCardAsset = String(runtimeAsset?.id || "").startsWith("card-");
    const THREE = this.THREE;
    root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      node.frustumCulled = false;
      node.renderOrder = isCardAsset ? 2 : 1;
      const materials = Array.isArray(node.material) ? node.material : [node.material].filter(Boolean);
      materials.forEach((material) => {
        const slot = slots.find((entry) => entry.name === material.name) || slots[0] || {};
        if (!material.userData) material.userData = {};
        if (slot.baseColor && material.color) {
          material.color.setRGB(
            slot.baseColor[0] ?? material.color.r,
            slot.baseColor[1] ?? material.color.g,
            slot.baseColor[2] ?? material.color.b
          );
        }
        const slotOpacity = Number.isFinite(slot.baseColor?.[3]) ? slot.baseColor[3] : null;
        const authoredOpacity = slotOpacity ?? material.opacity ?? 1;
        material.opacity = authoredOpacity;
        material.userData.authoredOpacity = authoredOpacity;
        material.userData.baseOpacity = material.opacity;
        material.roughness = slot.roughness ?? material.roughness ?? 0.1;
        material.metalness = slot.metallic ?? material.metalness ?? 0;
        if ("ior" in material) material.ior = slot.ior ?? material.ior;
        if ("transmission" in material) material.transmission = slot.transmission ?? material.transmission ?? 0;
        if (isCardAsset && "transmission" in material) {
          material.userData.authoredTransmission = slot.transmission ?? material.transmission ?? 0;
        }
        if (isCardAsset && "thickness" in material) material.thickness = Math.max(material.thickness ?? 0, 0.12);
        if (isCardAsset && "attenuationDistance" in material) material.attenuationDistance = 0.72;
        if (isCardAsset && material.attenuationColor) material.attenuationColor.setRGB(0.66, 0.96, 1);
        if (isCardAsset && "specularIntensity" in material) material.specularIntensity = Math.max(material.specularIntensity ?? 0, 1);
        if (isCardAsset && material.specularColor) material.specularColor.setRGB(0.84, 0.92, 0.94);
        if (isCardAsset && "reflectivity" in material) material.reflectivity = Math.max(material.reflectivity ?? 0, 0.86);
        if ("clearcoat" in material) material.clearcoat = slot.coatWeight ?? material.clearcoat ?? 0;
        if ("clearcoatRoughness" in material) material.clearcoatRoughness = slot.coatRoughness ?? material.clearcoatRoughness ?? 0.1;
        if (slot.doubleSided) material.side = THREE.DoubleSide;
        if (slot.alphaMode === "BLEND") material.transparent = true;
        if (slot.emissionColor && material.emissive) {
          material.emissive.setRGB(slot.emissionColor[0] || 0, slot.emissionColor[1] || 0, slot.emissionColor[2] || 0);
          material.emissiveIntensity = slot.emissionStrength ?? material.emissiveIntensity ?? 1;
        }
        material.envMapIntensity = String(material.name || "").toLowerCase() === "gloss" ? 3.1 : isCardAsset ? 3.4 : 1.25;
        if (String(material.name || "").toLowerCase() === "gloss") {
          if (slot.baseColor && material.color) {
            material.color.setRGB(slot.baseColor[0] ?? 0.003, slot.baseColor[1] ?? 0.003, slot.baseColor[2] ?? 0.003);
          }
          material.opacity = slotOpacity ?? material.opacity ?? 0.64;
          material.userData.baseOpacity = material.opacity;
          material.roughness = slot.roughness ?? 0.1;
          material.metalness = 0;
          if ("ior" in material) material.ior = slot.ior ?? 2;
          if ("reflectivity" in material) material.reflectivity = 1;
          if ("clearcoat" in material) material.clearcoat = slot.coatWeight ?? 0.25;
          if ("clearcoatRoughness" in material) material.clearcoatRoughness = slot.coatRoughness ?? 0.025;
        }
        if (isCardAsset) {
          material.userData.blenderMaterialBridge = {
            alphaMode: slot.alphaMode || "OPAQUE",
            blendMethod: slot.alphaMode === "BLEND" ? "GLB alpha blend; Blender HASHED viewport mode audited but not used because browser alphaHash reads as coarse static at card scale" : "opaque",
            screenSpaceRefraction: "not serialized in glTF; approximated by Three transmission plus authored PMREM environment",
            attenuation: material.attenuationColor ? "subtle cyan attenuation approximates HDRI-through-glass without recoloring the authored base color" : "unsupported",
            reflectionProbe: this.environmentSource,
            colorManagement: this.renderer?.toneMapping === THREE.AgXToneMapping ? "Three AgX tone mapping" : "Three ACES fallback"
          };
        }
        material.transparent = (material.opacity ?? 1) < 0.98 || (material.transmission ?? 0) > 0.01;
        material.depthWrite = !material.transparent;
        material.needsUpdate = true;
      });
    });
  }
};

// src/render-three-assets/update-three-assets-each-frame.js


const runtimeThreeUpdateMethods = {
  resize(dpr) {
    if (!this.enabled || !this.renderer) return;
    const pbrDpr = Math.max(1, Math.min(window.devicePixelRatio || dpr || 1, THREE_PBR_DPR_MAX));
    const width = Math.floor(window.innerWidth * pbrDpr);
    const height = Math.floor(window.innerHeight * pbrDpr);
    if (this.renderSize.width === width && this.renderSize.height === height && Math.abs(this.renderSize.dpr - pbrDpr) < 0.001) return;
    this.renderSize = { width, height, dpr: pbrDpr };
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = "100vw";
    this.canvas.style.height = "100vh";
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  },

  update(stagePhase, cameraRig, panelLayer, sculptureLayer, dpr) {
    if (!this.enabled) return;
    this.resize(dpr);
    this.camera.fov = cameraRig.fov;
    this.camera.position.set(cameraRig.position[0], cameraRig.position[1], cameraRig.position[2]);
    this.camera.lookAt(cameraRig.lookAt[0], cameraRig.lookAt[1], cameraRig.lookAt[2]);
    this.camera.updateProjectionMatrix();

    if (this.sculpture && sculptureLayer?.geometry) {
      this.sculpture.visible = true;
      this.sculpture.position.set(sculptureLayer.position[0], sculptureLayer.position[1], sculptureLayer.position[2]);
      this.sculpture.rotation.set(
        sculptureLayer.rotation[0],
        sculptureLayer.rotation[1] + (sculptureLayer.spinYaw || 0),
        sculptureLayer.rotation[2]
      );
      const assetScale = (this.sculpture.userData.assetScale || 1) * this.sculptureDisplayScale;
      this.sculpture.scale.set(
        sculptureLayer.scale[0] * assetScale,
        sculptureLayer.scale[1] * assetScale,
        sculptureLayer.scale[2] * assetScale
      );
      this.setOpacity(this.sculpture, sculptureLayer.opacity ?? 1);
      this.applySculptureMaterialResponse(this.sculpture, stagePhase, sculptureLayer);
    }

    this.cards.forEach((card, id) => {
      const transform = panelLayer.transforms.get(id);
      if (!transform) {
        card.visible = false;
        return;
      }
      const object = card.userData.runtimeObject;
      const visibility = panelLayer.visibility.get(id) || 0;
      const hover = panelLayer.hover.get(id) || 0;
      const active = panelLayer.active.get(id) || 0;
      const pressed = this.state.get("pressedMeshId") === id ? 1 : 0;
      const isDrawable = stagePhase.drawOrder?.includes(id) || id === stagePhase.activeObjectState;
      card.visible = isDrawable && visibility > 0.015;
      if (!card.visible) return;
      const assetScale = (card.userData.assetScale || 1) * this.cardDisplayScale;
      const presentation = panelLayer.getPresentationPose(
        object,
        transform,
        stagePhase,
        panelLayer.presentationTime || performance.now(),
        hover,
        active,
        pressed
      );
      card.position.set(presentation.position[0], presentation.position[1], presentation.position[2]);
      card.rotation.set(presentation.rotation[0], presentation.rotation[1], presentation.rotation[2]);
      card.scale.set(
        presentation.scale[0] * assetScale,
        presentation.scale[1] * assetScale,
        (presentation.scale[2] || 1) * assetScale
      );
      this.setOpacity(card, RuntimeMath.clamp(visibility * (object?.cardNumber === stagePhase.activeCardNumber ? 1 : 0.78), 0, 1));
      this.applyCardMaterialResponse(card, object, stagePhase, panelLayer, visibility, hover, active, pressed);
    });
    this.updateStageAtmosphere(stagePhase, sculptureLayer);
  },

  applySculptureMaterialResponse(root, stagePhase, sculptureLayer) {
    const beat = stagePhase.beatIntensity || 0;
    const hover = stagePhase.materialFocus?.intensity || 0;
    const activeHover = stagePhase.hoverObjectId ? 1 : 0;
    root.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        const baseEnv = material.userData?.baseEnvMapIntensity ?? material.envMapIntensity ?? 1.25;
        if (material.userData?.baseEnvMapIntensity == null) material.userData.baseEnvMapIntensity = baseEnv;
        material.envMapIntensity = baseEnv * SCULPTURE_ENV_INTENSITY_SCALE
          + hover * SCULPTURE_ENV_HOVER_BOOST
          + beat * SCULPTURE_ENV_BEAT_BOOST;
        if (material.emissive) {
          const baseEmissive = material.userData?.baseEmissiveIntensity ?? material.emissiveIntensity ?? 0;
          if (material.userData?.baseEmissiveIntensity == null) material.userData.baseEmissiveIntensity = baseEmissive;
          material.emissiveIntensity = baseEmissive + activeHover * 0.5 + hover * 0.45 + beat * 0.2;
        }
        if ("roughness" in material) {
          const baseRoughness = material.userData?.baseRoughness ?? material.roughness ?? 0.22;
          if (material.userData?.baseRoughness == null) material.userData.baseRoughness = baseRoughness;
          const softenedRoughness = Math.max(baseRoughness, SCULPTURE_MIN_ROUGHNESS);
          material.roughness = RuntimeMath.clamp(softenedRoughness - hover * 0.035 - beat * 0.015, SCULPTURE_MIN_ROUGHNESS, 1);
        }
      });
    });
    if (root.rotation) {
      root.rotation.z += Math.sin(performance.now() * 0.0012) * 0.0015 * (hover + beat);
    }
    if (root.position && sculptureLayer?.position) {
      root.position.x += Math.sin(performance.now() * 0.0008) * 0.01 * hover;
    }
  },

  applyCardMaterialResponse(card, object, stagePhase, panelLayer, visibility, hover, active, pressed) {
    const beat = stagePhase.beatIntensity || 0;
    const latentWake = panelLayer.materialWake.get(object.id) || 0;
    const sceneMatch = object?.cardNumber === stagePhase.activeCardNumber ? 1 : 0;
    card.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        const name = String(material.name || "").toLowerCase();
        const baseEnv = material.userData?.baseEnvMapIntensity ?? material.envMapIntensity ?? 1.25;
        if (material.userData?.baseEnvMapIntensity == null) material.userData.baseEnvMapIntensity = baseEnv;
        const baseOpacity = material.userData?.authoredOpacity ?? material.userData?.baseOpacity ?? material.opacity ?? 1;
        const baseTransmission = material.userData?.authoredTransmission ?? material.transmission ?? 0;
        const isGloss = name === "gloss";
        const materialHover = hover * (sceneMatch ? 1 : 0.45) + latentWake * 0.8;
        if ("transmission" in material) {
          material.transmission = RuntimeMath.clamp(baseTransmission + (isGloss ? 0.06 : 0.03) * materialHover + beat * 0.015, 0, 1);
        }
        material.envMapIntensity = baseEnv + (isGloss ? 0.95 : 0.42) * materialHover + active * 0.36 + beat * 0.1;
        if ("roughness" in material) {
          const baseRoughness = material.userData?.baseRoughness ?? material.roughness ?? 0.14;
          if (material.userData?.baseRoughness == null) material.userData.baseRoughness = baseRoughness;
          material.roughness = RuntimeMath.clamp(baseRoughness - materialHover * (isGloss ? 0.06 : 0.03) - pressed * 0.02, 0.018, 1);
        }
        if ("clearcoat" in material) {
          const baseClearcoat = material.userData?.baseClearcoat ?? material.clearcoat ?? 0;
          if (material.userData?.baseClearcoat == null) material.userData.baseClearcoat = baseClearcoat;
          material.clearcoat = RuntimeMath.clamp(baseClearcoat + materialHover * 0.24 + beat * 0.08, 0, 1);
        }
        if ("clearcoatRoughness" in material) {
          const baseCoatRoughness = material.userData?.baseClearcoatRoughness ?? material.clearcoatRoughness ?? 0.08;
          if (material.userData?.baseClearcoatRoughness == null) material.userData.baseClearcoatRoughness = baseCoatRoughness;
          material.clearcoatRoughness = RuntimeMath.clamp(baseCoatRoughness - materialHover * 0.04, 0.01, 1);
        }
        if (material.emissive) {
          const baseEmissive = material.userData?.baseEmissiveIntensity ?? material.emissiveIntensity ?? 0;
          if (material.userData?.baseEmissiveIntensity == null) material.userData.baseEmissiveIntensity = baseEmissive;
          material.emissiveIntensity = baseEmissive + active * 0.3 + materialHover * 0.34 + beat * 0.12;
        }
        if (isGloss) {
          material.opacity = RuntimeMath.clamp(baseOpacity * visibility + materialHover * 0.06, 0, 1);
          material.transparent = material.opacity < 0.98 || (material.transmission ?? 0) > 0.01;
          material.depthWrite = !material.transparent;
        }
      });
    });
  },

  updateStageAtmosphere(stagePhase, sculptureLayer) {
    if (!this.scene) return;
    const sceneId = stagePhase.activeCardNumber || "card1";
    const hover = stagePhase.materialFocus?.intensity || 0;
    const beat = stagePhase.beatIntensity || 0;
    const focus = stagePhase.focusLock ? 1 : 0;
    const reverse = stagePhase.reverseReacquire ? 1 : 0;
    const palette = sceneId === "card5"
      ? { fog: [0.08, 0.12, 0.16], density: 0.068, exposure: 1.08, ambient: 0.16, white: 18.8, cyan: 38 }
      : sceneId === "card3"
        ? { fog: [0.05, 0.09, 0.13], density: 0.074, exposure: 1.1, ambient: 0.17, white: 19.2, cyan: 39.5 }
        : { fog: [0.04, 0.07, 0.1], density: 0.07, exposure: 1.06, ambient: 0.145, white: 18.2, cyan: 36.8 };
    if (this.scene.fog?.color) {
      this.scene.fog.color.setRGB(
        palette.fog[0] + hover * 0.04,
        palette.fog[1] + hover * 0.05 + beat * 0.02,
        palette.fog[2] + hover * 0.08 + focus * 0.015
      );
      this.scene.fog.density = palette.density + hover * 0.018 + beat * 0.01 - reverse * 0.003;
    }
    this.renderer.toneMappingExposure = RuntimeMath.lerp(
      this.renderer.toneMappingExposure,
      palette.exposure + hover * 0.06 + beat * 0.03,
      0.08
    );
    if (this.ambientLight) {
      this.ambientLight.intensity = RuntimeMath.lerp(this.ambientLight.intensity, palette.ambient + hover * 0.08 + beat * 0.03, 0.1);
    }
    if (this.whiteLight) {
      this.whiteLight.intensity = RuntimeMath.lerp(this.whiteLight.intensity, palette.white + hover * 2.6 + beat * 1.2, 0.1);
      this.whiteLight.penumbra = RuntimeMath.lerp(this.whiteLight.penumbra, 0.42 + hover * 0.1, 0.08);
    }
    if (this.cyanLight) {
      this.cyanLight.intensity = RuntimeMath.lerp(this.cyanLight.intensity, palette.cyan + hover * 5.5 + beat * 2.1, 0.1);
      this.cyanLight.penumbra = RuntimeMath.lerp(this.cyanLight.penumbra, 0.42 + hover * 0.12, 0.08);
    }
    if (this.lightTarget) {
      this.lightTarget.position.x = RuntimeMath.lerp(this.lightTarget.position.x, (stagePhase.handoffDirection || 1) * hover * 0.12, 0.08);
      this.lightTarget.position.y = RuntimeMath.lerp(this.lightTarget.position.y, 0.04 + (sculptureLayer?.position?.[1] || 0) * 0.12 + beat * 0.06, 0.08);
      this.lightTarget.position.z = RuntimeMath.lerp(this.lightTarget.position.z, -1.35 + hover * 0.2, 0.08);
    }
    this.updateStageHaze(stagePhase, sculptureLayer);
  },

  updateStageHaze(stagePhase, sculptureLayer) {
    if (!this.hazeField?.length) return;
    const hover = stagePhase.materialFocus?.intensity || 0;
    const beat = stagePhase.beatIntensity || 0;
    const seconds = (performance.now() - this.clockStart) * 0.001;
    const anchor = sculptureLayer?.position || [0, 0, -0.92];
    this.hazeField.forEach((haze, index) => {
      const basePosition = haze.userData.basePosition || [0, 0, -1];
      const baseScale = haze.userData.baseScale || [3, 2, 1];
      const baseOpacity = haze.userData.baseOpacity ?? 0.08;
      haze.position.x = RuntimeMath.lerp(haze.position.x, anchor[0] + basePosition[0] + Math.sin(seconds * (0.18 + index * 0.04)) * 0.09 * (1 + hover), 0.08);
      haze.position.y = RuntimeMath.lerp(haze.position.y, anchor[1] + basePosition[1] + Math.cos(seconds * (0.14 + index * 0.03)) * 0.05 + beat * 0.04, 0.08);
      haze.position.z = RuntimeMath.lerp(haze.position.z, anchor[2] + basePosition[2] - hover * 0.12, 0.08);
      haze.scale.set(
        baseScale[0] * (1 + hover * 0.12 + beat * 0.06),
        baseScale[1] * (1 + hover * 0.16 + beat * 0.08),
        baseScale[2]
      );
      haze.material.opacity = baseOpacity + hover * 0.12 + beat * 0.07;
    });
  },

  setOpacity(root, opacity) {
    root.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        const baseOpacity = material.userData?.baseOpacity ?? material.opacity ?? 1;
        material.opacity = RuntimeMath.clamp(baseOpacity * opacity, 0, 1);
        material.transparent = material.opacity < 0.98 || (material.transmission ?? 0) > 0.01;
        material.depthWrite = !material.transparent;
      });
    });
  },

  render() {
    if (!this.enabled || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }
};

// src/render-three-assets/render-three-asset-overlays.js




class RuntimeThreeAssetLayer {
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

// src/draw-runtime-effects/simulate-pointer-wave-texture.js

class RuntimeWaveField {
  constructor(gl, state, capabilities, size = 128) {
    this.gl = gl;
    this.state = state;
    this.size = size;
    this.reducedMotion = capabilities.reducedMotion;
    this.current = new Float32Array(size * size);
    this.previous = new Float32Array(size * size);
    this.next = new Float32Array(size * size);
    this.data = new Uint8Array(size * size * 4);
    this.texture = gl.createTexture();
    this.energy = 0;
    this.initTexture();
  }

  initTexture() {
    const gl = this.gl;
    for (let i = 0; i < this.size * this.size; i += 1) {
      this.data[i * 4 + 0] = 128;
      this.data[i * 4 + 1] = 128;
      this.data[i * 4 + 2] = 128;
      this.data[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
  }

  update(pointer, hoverTarget, materialFocus = {}) {
    if (!this.reducedMotion) this.addImpulse(pointer, hoverTarget, materialFocus);
    const size = this.size;
    let energy = 0;
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const i = y * size + x;
        const value = (
          this.current[i - 1] +
          this.current[i + 1] +
          this.current[i - size] +
          this.current[i + size]
        ) * 0.495 - this.previous[i] * 0.985;
        this.next[i] = value * 0.988;
        energy += Math.abs(this.next[i]);
      }
    }
    const old = this.previous;
    this.previous = this.current;
    this.current = this.next;
    this.next = old;
    this.energy = RuntimeMath.lerp(this.energy, Math.min(1, energy / (size * size) * 12), 0.12);
    this.upload();
    this.state.set("waveLabel", this.reducedMotion ? "reduced" : this.energy > 0.04 ? "active" : "calm");
  }

  addImpulse(pointer, hoverTarget, materialFocus = {}) {
    const speed = RuntimeMath.clamp(pointer.speed * 28, 0, 0.8);
    const focus = RuntimeMath.clamp(materialFocus.intensity || 0, 0, 1);
    const strength = RuntimeMath.clamp(speed + (hoverTarget ? 0.22 : 0) + focus * 0.11, 0, 1);
    if (strength <= 0.01) return;
    const cx = Math.floor(pointer.x * (this.size - 1));
    const cy = Math.floor(pointer.y * (this.size - 1));
    const radius = hoverTarget ? 8 : focus > 0.6 ? 6 : 4;
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        const px = cx + x;
        const py = cy + y;
        if (px < 1 || py < 1 || px >= this.size - 1 || py >= this.size - 1) continue;
        const distance = Math.hypot(x, y) / radius;
        const falloff = Math.max(0, 1 - distance);
        this.current[py * this.size + px] += falloff * strength * 0.84;
      }
    }
  }

  upload() {
    const gl = this.gl;
    for (let i = 0; i < this.current.length; i += 1) {
      const value = RuntimeMath.clamp(0.5 + this.current[i] * 0.5, 0, 1);
      this.data[i * 4 + 0] = Math.round(value * 255);
      this.data[i * 4 + 1] = Math.round(RuntimeMath.clamp(0.5 + this.energy * 0.5, 0, 1) * 255);
      this.data[i * 4 + 2] = 128;
      this.data[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size, this.size, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
  }

  bind(unit = 0) {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
  }

  dispose() {
    if (this.texture) this.gl.deleteTexture(this.texture);
    this.texture = null;
  }
}

// src/run-render-loop/orchestrate-cinematic-render-loop.js






class CinematicRenderer {
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

// src/convert-scroll-progress/convert-scroll-to-runtime-progress.js

class ScrollSequencer {
  constructor(state, controller, manifest = CORE_RUNTIME_MANIFEST) {
    this.state = state;
    this.controller = controller;
    this.manifest = manifest;
  }

  start() {
    window.addEventListener("scroll", () => this.update(), { passive: true });
    window.addEventListener("resize", () => this.update(), { passive: true });
    this.update();
  }

  update() {
    const active = this.controller.getActiveScene();
    this.state.set("scroll", active.pageProgress);
    this.state.set("sceneIndex", active.index);
    this.state.set("sceneProgress", active.progress);
    this.state.set("sceneId", active.scene.id);
    this.state.set("sceneLabel", getSceneDisplayLabel(this.manifest, this.state.get("activePhaseId") || "WorkspaceMode", active.scene));
    this.state.set("progressLabel", `${Math.round(active.pageProgress * 100)}%`);
  }
}

// src/boot-runtime-app/start-runtime-renderer.js



function setRuntimeDomOwnership(enhanced) {
  document.querySelectorAll(".scene-action-dock, .scene-action-dock *, #runtime-chat, #runtime-chat *").forEach((node) => {
    if (enhanced) {
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("tabindex", "-1");
      node.inert = true;
      return;
    }
    node.removeAttribute("aria-hidden");
    if (node.getAttribute("tabindex") === "-1") node.removeAttribute("tabindex");
    node.inert = false;
  });
}

function startRuntimeScrollSequencer({ state, controller, manifest }) {
  const sequencer = new ScrollSequencer(state, controller, manifest);
  sequencer.start();
  return sequencer;
}

function startRuntimeFallback({ state, controller, manifest, bodyClass = "no-webgl" }) {
  state.set("phase", "fallback");
  state.set("renderer", "fallback");
  state.set("meshLabel", "disabled");
  state.set("waveLabel", "disabled");
  state.set("activeLabel", "disabled");
  state.set("hoverLabel", "disabled");
  state.set("transitionPhaseLabel", "fallback");
  state.set("drawLabel", "disabled");
  document.body.classList.add(bodyClass);
  document.body.classList.remove("runtime-booting");
  setRuntimeDomOwnership(false);
  if (controller && manifest) startRuntimeScrollSequencer({ state, controller, manifest });
}

function startRuntimeRenderer({
  state,
  audio,
  manifest,
  controller,
  capabilities,
  registry,
  interaction,
  stageDirector
}) {
  new RuntimeOverlayLayer(state, interaction).start();
  const renderer = new CinematicRenderer(
    document.getElementById("valen-stage"),
    document.getElementById("valen-pbr-stage"),
    state,
    audio,
    manifest,
    controller,
    capabilities,
    registry,
    interaction,
    stageDirector
  );
  const bootDone = renderer.start();
  return { renderer, bootDone };
}

function finishRuntimeRendererBoot({ state, controller, manifest, capabilities, bootDone }) {
  state.set("phase", "sequencer");
  startRuntimeScrollSequencer({ state, controller, manifest });
  void Promise.resolve(bootDone).then(() => {
    if (state.get("phase") === "fallback") return;
    document.body.classList.add("3dRuntime");
    document.body.classList.remove("runtime-booting");
    setRuntimeDomOwnership(true, capabilities);
    state.set("phase", "ready");
  });
}

// src/boot-runtime-app/boot-runtime-app.js













function createRuntimeState() {
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

async function bootRuntimeApp() {
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

// src/runtime.js

// A host may set window.VALEN_RUNTIME_ASSET_BASE before importing runtime.js.
void bootRuntimeApp();

//# sourceMappingURL=runtime.js.map
