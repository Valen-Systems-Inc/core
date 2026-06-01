import { CORE_RUNTIME_MANIFEST, getSceneDisplayLabel } from "../describe-runtime-scenes/assemble-core-runtime-manifest.js";
export class ScrollSequencer {
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
