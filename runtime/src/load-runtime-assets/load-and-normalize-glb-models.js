export class RuntimeGlbLoader {
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
