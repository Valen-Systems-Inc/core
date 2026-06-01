import { PUBLIC_INPUT_CARD } from "../configure-runtime/configure-runtime-hosts-and-gates.js";
import { CORE_RUNTIME_MANIFEST } from "../describe-runtime-scenes/assemble-core-runtime-manifest.js";
import {
  CARD_COPY_SURFACE_PROFILES,
  CARD_GLASS_RGB,
  CARD_GLASS_TONE
} from "../describe-runtime-scenes/describe-card-copy-surfaces.js";
import {
  CARD_RIBBON_HANDOFF,
  MOBILE_ACTIVE_CARD_SCALE,
  SLOT_SEQUENCE,
  STAGE_LATENT_SLOTS,
  TAU
} from "../describe-runtime-scenes/configure-stage-layout-and-camera.js";
import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";

export const runtimePanelGeometryMethods = {
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
