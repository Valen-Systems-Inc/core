import {
  DEFAULT_RUNTIME_ASSET_BASE,
  RUNTIME_MODULE_IMPORTS
} from "../configure-runtime/configure-runtime-hosts-and-gates.js";
import { RuntimeGlbLoader } from "./load-and-normalize-glb-models.js";

export function getRuntimeAssetBase() {
  if (typeof window === "undefined") return DEFAULT_RUNTIME_ASSET_BASE;
  const configured = window.VALEN_RUNTIME_ASSET_BASE;
  if (typeof configured !== "string" || !configured.trim()) return DEFAULT_RUNTIME_ASSET_BASE;
  return configured.trim().replace(/\/?$/, "/");
}

export function resolveRuntimeAssetPath(path) {
  if (typeof path !== "string" || !path) return path;
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }
  if (path.startsWith(DEFAULT_RUNTIME_ASSET_BASE)) {
    return `${getRuntimeAssetBase()}${path.slice(DEFAULT_RUNTIME_ASSET_BASE.length)}`;
  }
  return path;
}

export async function importRuntimeModule(specifier) {
  try {
    return await import(specifier);
  } catch (error) {
    const fallbackUrl = RUNTIME_MODULE_IMPORTS[specifier];
    if (!fallbackUrl) throw error;
    console.warn(`Runtime module import map unavailable for ${specifier}; using CDN fallback.`, error);
    return import(fallbackUrl);
  }
}

export class RuntimeAssetRegistry {
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
