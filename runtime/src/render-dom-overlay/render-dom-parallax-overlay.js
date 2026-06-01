export class RuntimeOverlayLayer {
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
