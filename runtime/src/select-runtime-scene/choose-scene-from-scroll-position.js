export class RuntimeSceneController {
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
