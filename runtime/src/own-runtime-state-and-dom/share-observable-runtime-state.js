export class RuntimeState {
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
