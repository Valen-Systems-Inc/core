import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";
export class RuntimeWaveField {
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
